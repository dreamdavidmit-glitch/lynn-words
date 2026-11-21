import * as THREE from './vendor/three/three.module.min.js';
import { bindRoomHand } from './room-hand.js';

export const playerEyeHeight = 1.56;
export const playerLookDown = -1.46;
export const playerSeatDrop = .31;
export const stepLength = .70;
export const seatedFacing = Math.PI + .76;

const wrap = angle=>THREE.MathUtils.euclideanModulo(angle+Math.PI,2*Math.PI)-Math.PI;

function hideFaceFromPlayer(model) {
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { material, geometry } = mesh;
    // Keep the complete head in the shadow pass without drawing it into the
    // first-person camera, which can pass through the brow when looking up.
    if (['Chestnut hair', 'Brow hairs', 'Brown iris'].includes(material.name)) {
      material.colorWrite = material.depthWrite = false;
      return;
    }
    if (material.name !== 'Textured skin') return;
    const positions = geometry.getAttribute('position'), index = geometry.index;
    const body = [], head = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i+1), c = index.getX(i+2);
      const section = Math.max(positions.getY(a), positions.getY(b), positions.getY(c)) > 1.43 ? head : body;
      section.push(a,b,c);
    }
    const data = new index.array.constructor(index.count);
    data.set(body);
    data.set(head,body.length);
    geometry.setIndex(new THREE.BufferAttribute(data,1));
    geometry.clearGroups();
    geometry.addGroup(0,body.length,0);
    geometry.addGroup(body.length,head.length,1);
    const shadow = material.clone();
    shadow.colorWrite = shadow.depthWrite = false;
    mesh.material = [material,shadow];
  });
}

export function bindRoomPlayer(model,firstPerson=true) {
  if(firstPerson) hideFaceFromPlayer(model);
  const root = new THREE.Group();
  root.name = firstPerson ? 'first-person-player' : 'room-peer';
  const parent = model.parent;
  parent.add(root);
  root.add(model);
  root.updateMatrixWorld(true);

  const bones = new Map();
  model.traverse(node => { if (node.isBone) bones.set(node.userData.name || node.name,node); });
  const rotation = new THREE.Quaternion();
  function joint(name) {
    const bone = bones.get(name);
    const rest = bone.quaternion.clone();
    const inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axes = [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]
      .map(axis=>axis.applyQuaternion(inverse));
    return (pitch=0,yaw=0,roll=0) => {
      bone.quaternion.copy(rest);
      if (pitch) bone.quaternion.multiply(rotation.setFromAxisAngle(axes[0],pitch));
      if (yaw) bone.quaternion.multiply(rotation.setFromAxisAngle(axes[1],yaw));
      if (roll) bone.quaternion.multiply(rotation.setFromAxisAngle(axes[2],roll));
    };
  }
  const legs = ['L','R'].map(side => ({
    hip:joint('upperleg01.'+side), knee:joint('lowerleg01.'+side), foot:joint('foot.'+side),
    arm:joint('upperarm01.'+side), elbow:joint('lowerarm01.'+side)
  }));
  const leftHand=bindRoomHand(bones,'L'), rightHand=bindRoomHand(bones,'R');
  const chest=joint('spine02'),neck=joint('neck01');
  const eyeMesh = model.getObjectByProperty('name','Iris_and_eye_whites');
  const eye = eyeMesh
    ? new THREE.Box3().setFromObject(eyeMesh,true).getCenter(new THREE.Vector3())
    : new THREE.Vector3(0,playerEyeHeight,.09);
  // A small clearance keeps the near clip plane in front of the neckline.
  // Both clients place the same body at the same physical eye position.
  const eyeOffset = new THREE.Vector3();
  const sleepEye = new THREE.Vector3(eye.x,eye.y,eye.z+.045);
  let bodyYaw=null,lastUpdate=0;
  const lastShadow = new THREE.Vector3(Infinity,Infinity,Infinity);
  let lastFacing = Infinity, lastStep = Infinity, lastSeat = Infinity, lastLie = Infinity, lastRefresh = -Infinity;
  let lastArm=0;
  let pointId=null, pointHand=rightHand;
  root.rotation.order='YXZ';

  return {
    root,
    update(camera, yaw, phase, weight, seat, forward, now, lie=0, sideways=0, seatFacing=seatedFacing, gesture=null) {
      const dt=Math.min(.12,(now-lastUpdate)/1000);
      // The torso and knees stay aligned with the seat during the transition.
      // Looking at the other person only turns the head and upper chest.
      if (seat>.001) bodyYaw=seatFacing;
      else if (bodyYaw===null || now-lastUpdate>600) bodyYaw=yaw;
      else bodyYaw+=wrap(yaw-bodyYaw)*(1-Math.exp(-dt*(weight>.1 ? 14 : 9)));
      lastUpdate=now;
      const neckTurn=THREE.MathUtils.clamp(wrap(yaw-bodyYaw),-.95,.95)*(1-lie);
      const swing=Math.sin(phase)*weight;
      const footwardTurn=wrap(-bodyYaw-Math.PI);
      // The slight incline supports the head on the pillow and the torso on the quilt.
      const mattressTilt=.16;
      root.rotation.set((-Math.PI/2+mattressTilt)*lie,bodyYaw+Math.PI+footwardTurn*lie,0);
      eyeOffset.copy(sleepEye).applyQuaternion(root.quaternion);
      const animatedEyeY=lie>0 ? camera.position.y : playerEyeHeight-playerSeatDrop*seat;
      root.position.set(camera.position.x-eyeOffset.x,animatedEyeY-eyeOffset.y,camera.position.z-eyeOffset.z);
      const fold=Math.sin(Math.PI*lie),walking=weight*(1-seat)*(1-lie);
      const age=gesture ? (now-gesture.at)/1000 : 3;
      const ease=THREE.MathUtils.smoothstep;
      const envelope=(1-lie)*ease(age,0,.43)*(1-ease(age,1.38,1.98));
      const wave=gesture?.kind==='wave';
      const direction=gesture?.target;
      const indexPose=direction ? (1-lie)*ease(age,.10,.53)*(1-ease(age,1.31,1.87)) : 0;
      const handMotion=wave ? Math.sin(age*15)*.24*envelope : 0;
      const torsoTurn=seat*neckTurn*(.28+(direction ? .16*envelope : 0));
      chest(.06*walking+.13*fold,-.062*Math.sin(phase)*walking+torsoTurn,sideways*.028*walking);
      neck(-.04*walking-.09*fold,neckTurn*.78,-.016*sideways*walking);
      legs.forEach(({hip,knee,foot,arm,elbow},i) => {
        const sign=i ? -1 : 1;
        const step=sign*Math.sin(phase)*walking;
        const lift=Math.max(0,sign*Math.cos(phase));
        const flex=walking*lift*lift;
        hip(-1.25*seat-.43*step*forward-.24*flex-.72*fold-.15*lie,0,-.29*step*sideways);
        knee(1.28*seat+.61*flex+.065*walking+.84*fold+.10*lie);
        foot(-.10*step*forward-.22*flex-.14*seat-.14*fold-.08*lie,0,.10*step*sideways);
        const signal=i && wave ? envelope : 0;
        arm(.24*step*forward-.26*seat-.24*fold-.80*signal,0,.07*step*sideways-.35*signal);
        const elbowRest=-.62*seat-.10*walking-.12*Math.max(0,-step*forward)-.28*fold-.12*lie;
        elbow(THREE.MathUtils.lerp(elbowRest,-1.65,signal),0,i ? handMotion*.30 : 0);
      });
      const relaxed=.75*seat+.30*walking;
      if (direction && pointId!==gesture.id) {
        const bearing=Math.atan2(root.position.x-direction[0],root.position.z-direction[2]);
        pointHand=seat>.75 && wrap(bearing-bodyYaw)>.68 ? leftHand : rightHand;
        pointId=gesture.id;
      }
      const leftPoint=pointHand===leftHand ? indexPose : 0,rightPoint=pointHand===rightHand ? indexPose : 0;
      leftHand.pose(leftPoint,0,0,relaxed*(1-leftPoint));
      rightHand.pose(rightPoint,wave ? envelope : 0,handMotion,relaxed*(1-Math.max(wave ? envelope : 0,rightPoint)));
      if (direction && envelope>0) pointHand.point(direction,bodyYaw+torsoTurn,envelope);

      // The room caches its shadows while idle. Refresh during motion and
      // once at the final position so the player's shadow doesn't lag behind.
      if (now-lastRefresh < 66) return false;
      const moved = root.position.distanceToSquared(lastShadow) > .000016 ||
        Math.abs(root.rotation.y-lastFacing) > .015 || Math.abs(swing-lastStep) > .045 ||
        Math.abs(seat-lastSeat) > .02 || Math.abs(lie-lastLie) > .012 ||
        envelope>0 || lastArm>0 || (swing===0 && lastStep!==0);
      if (!moved) return false;
      lastRefresh=now;
      lastShadow.copy(root.position);
      lastFacing=root.rotation.y;
      lastStep=swing;
      lastSeat=seat;
      lastLie=lie;
      lastArm=envelope;
      return true;
    }
  };
}
