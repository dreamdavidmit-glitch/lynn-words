import {MathUtils, Quaternion, Vector3} from './vendor/three/three.module.min.js';

const pointingCurl=[
  [.34,.52,.43],     // thumb
  [-.09,-.04,-.025], // index
  [.88,1.15,.63],    // middle
  [.94,1.18,.69],    // ring
  [.99,1.14,.73]     // little
];

// MakeHuman digits run down local +Y. Derive the hinge axes from the palm
// so the curl works with the exported bind pose and mirrors on the other hand.
export function bindRoomHand(bones,side) {
  const wrist=bones.get('wrist.'+side);
  const upper=bones.get('upperarm01.'+side), forearm=bones.get('lowerarm01.'+side);
  const digits=pointingCurl.map((_,digit)=>[1,2,3].map(n=>bones.get(`finger${digit+1}-${n}.${side}`)));
  const position=bone=>bone.getWorldPosition(new Vector3());
  const orientation=bone=>bone.getWorldQuaternion(new Quaternion());
  const across=position(digits[1][0]).sub(position(digits[4][0]));
  const palm=position(digits[2][0]).sub(position(wrist)).cross(across).normalize().multiplyScalar(side==='L' ? 1 : -1);
  const thumbDirection=position(digits[2][1]).sub(position(digits[0][0])).normalize();
  const rotation=new Quaternion();
  const fingers=digits.map(digit=>digit.map(bone=>{
    const inverse=orientation(bone).invert();
    const palmLocal=palm.clone().applyQuaternion(inverse);
    const lengthwise=new Vector3(0,1,0);
    return {
      bone,base:bone.quaternion.clone(),
      curl:lengthwise.clone().cross(palmLocal).normalize(),
      opposition:lengthwise.clone().cross(thumbDirection.clone().applyQuaternion(inverse)).normalize()
    };
  }));
  const wristRest=wrist.quaternion.clone();
  const upperAxis=position(forearm).sub(position(upper)).normalize().applyQuaternion(orientation(upper).invert());
  const forearmAxis=position(wrist).sub(position(forearm)).normalize().applyQuaternion(orientation(forearm).invert());
  const waveAxis=palm.clone().applyQuaternion(orientation(wrist).invert());
  const desired=new Vector3(),current=new Vector3(),bend=new Vector3(),aim=new Vector3();
  const shoulder=new Vector3(),elbow=new Vector3(),indexBase=new Vector3(),indexTip=new Vector3();
  const worldRotation=new Quaternion(),localRotation=new Quaternion(),parentRotation=new Quaternion();
  function aimBone(bone,from,toward,amount,maxAngle=Math.PI) {
    bone.getWorldQuaternion(worldRotation);
    rotation.setFromUnitVectors(from,toward);
    const angle=2*Math.acos(MathUtils.clamp(rotation.w,-1,1));
    if (angle>maxAngle) rotation.identity().slerp(localRotation.setFromUnitVectors(from,toward),maxAngle/angle);
    bone.parent.getWorldQuaternion(parentRotation).invert();
    localRotation.copy(parentRotation).multiply(rotation).multiply(worldRotation);
    bone.quaternion.slerp(localRotation,amount);
  }
  return {
    pose(point=0,wave=0,sway=0,relax=0) {
      wrist.quaternion.copy(wristRest);
      if (sway) wrist.quaternion.multiply(rotation.setFromAxisAngle(waveAxis,sway));
      fingers.forEach((digit,i)=>digit.forEach(({bone,base,curl,opposition},n)=>{
        const angle=pointingCurl[i][n]*point-(i===0 ? .015 : .085)*wave+(i===0 ? .04 : .12)*relax;
        bone.quaternion.copy(base);
        if (i===0 && n===0 && point) bone.quaternion.multiply(rotation.setFromAxisAngle(opposition,.53*point));
        if (angle) bone.quaternion.multiply(rotation.setFromAxisAngle(curl,angle));
      }));
    },
    point(target,facing,amount) {
      // Offset the elbow a little outward and down, leaving a visible bend.
      upper.getWorldPosition(shoulder);
      aim.fromArray(target).sub(shoulder);
      const bearing=Math.atan2(-aim.x,-aim.z);
      const delta=MathUtils.euclideanModulo(bearing-facing+Math.PI,2*Math.PI)-Math.PI;
      const az=facing+MathUtils.clamp(delta,-1.57,1.57);
      const elevation=MathUtils.clamp(Math.atan2(aim.y,Math.hypot(aim.x,aim.z)),-.90,1.12);
      aim.set(-Math.sin(az)*Math.cos(elevation),Math.sin(elevation),-Math.cos(az)*Math.cos(elevation));
      const outward=side==='R' ? .16 : -.16;
      bend.set(Math.cos(facing)*outward,-.22,-Math.sin(facing)*outward);
      bend.addScaledVector(aim,-bend.dot(aim));
      desired.copy(aim).add(bend).normalize();
      current.copy(upperAxis).applyQuaternion(upper.getWorldQuaternion(worldRotation));
      aimBone(upper,current,desired,amount);

      forearm.getWorldPosition(elbow);
      desired.fromArray(target).sub(elbow).normalize().lerp(aim,.75).addScaledVector(bend,-.55).normalize();
      current.copy(forearmAxis).applyQuaternion(forearm.getWorldQuaternion(worldRotation));
      aimBone(forearm,current,desired,amount);

      // Align the extended index rather than the wrist's arbitrary bind axis.
      digits[1][0].getWorldPosition(indexBase);
      digits[1][2].getWorldPosition(indexTip);
      current.copy(indexTip).sub(indexBase).normalize();
      desired.fromArray(target).sub(indexBase).normalize().lerp(aim,.55).normalize();
      aimBone(wrist,current,desired,amount,.52);
    }
  };
}
