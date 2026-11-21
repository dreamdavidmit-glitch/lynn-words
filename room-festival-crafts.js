import * as THREE from './vendor/three/three.module.min.js';
import { buildMist } from './room-mist.js';

export function newYearClock(parent, tools) {
  const {material, addMesh, box, cylinder, sphere, canvasTexture} = tools;
  const clock = new THREE.Group();
  clock.position.set(-.11,1.40,.12); clock.rotation.y=Math.PI+.20;
  parent.add(clock);
  const gold=material(0xcaa46e,{metalness:.66,roughness:.32});
  const bronze=material(0x61472f,{metalness:.45,roughness:.48});
  const ink=material(0x273049,{roughness:.64});
  const dial=canvasTexture(512,512,(ctx,w)=>{
    ctx.fillStyle='#1e2c42';ctx.fillRect(0,0,w,w);
    ctx.translate(w/2,w/2);
    for(let i=0;i<60;i++){
      ctx.save();ctx.rotate(i*Math.PI/30);
      ctx.fillStyle=i%5===0?'#edcb8f':'#96a0ad';
      ctx.fillRect(i%5===0?-2:-1,-215,i%5===0?4:2,i%5===0?20:9);ctx.restore();
    }
    ctx.fillStyle='#eee0bb';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='38px Georgia';
    for(const [label,x,y] of [['XII',0,-159],['III',165,0],['VI',0,165],['IX',-165,0]]) ctx.fillText(label,x,y);
  });
  cylinder(clock,.383,.383,.102,bronze,[0,0,-.036],64,[Math.PI/2,0,0]);
  cylinder(clock,.35,.35,.015,ink,[0,0,.029],64,[Math.PI/2,0,0]);
  addMesh(clock,new THREE.CircleGeometry(.345,64),material(0xffffff,{map:dial,roughness:.85}),[0,0,.038]);
  addMesh(clock,new THREE.TorusGeometry(.353,.022,14,64),gold,[0,0,.057]);
  for(const [length,angle] of [[.18,-.19],[.258,.104]]){
    const hand=box(clock,[.021,length,.021],gold,[Math.sin(-angle)*length*.38,Math.cos(angle)*length*.38,.065],[0,0,angle]);
    hand.castShadow=false;
  }
  sphere(clock,.023,gold,[0,0,.086],[1,1,.55]);
  for(const x of [-.19,.19]) box(clock,[.135,.15,.14],bronze,[x,-.390,0],[0,0,x*1.1]);

  const drink=material(0xdeb981,{roughness:.26,metalness:.12});
  const crystal=new THREE.MeshPhysicalMaterial({color:0xe2e4ea,roughness:.15,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false});
  const profiles=[[0,.005],[.079,.009],[.079,.017],[.012,.022],[.012,.20],[.037,.225],[.051,.30],[.062,.412],[.057,.419],[.052,.409],[.054,.36],[.036,.26],[.012,.226]];
  const glass = new THREE.LatheGeometry(profiles.map(([r,y])=>new THREE.Vector2(r,y)),32);
  const liquid = new THREE.LatheGeometry([[0,.23],[.031,.248],[.051,.354],[0,.354]].map(([r,y])=>new THREE.Vector2(r,y)),32);
  for(const [x,z] of [[.35,-.21],[.17,-.36]]){
    const cup=addMesh(parent,glass,crystal,[x,.93,z]);
    cup.castShadow=false;
    addMesh(parent,liquid,drink,[x,.93,z]);
  }
}

export function dragonBoat(parent, tools) {
  const {material,addMesh,box,sphere}=tools;
  const boat=new THREE.Group();
  boat.position.set(0,.99,.16);boat.rotation.y=.20;parent.add(boat);
  const lacquer=material(0x3b514a,{roughness:.53});
  const red=material(0x963f3a,{roughness:.43});
  const brass=material(0xb48e48,{metalness:.57,roughness:.41});
  const walnut=material(0x5e4130,{roughness:.75});
  const rings=9, sides=12, positions=[], indices=[];
  for(let i=0;i<=rings;i++){
    const t=i/rings, half=.16*Math.sin(Math.PI*t)**.72+.009;
    const lift=.12*Math.abs(2*t-1)**3;
    for(let j=0;j<=sides;j++){
      const angle=Math.PI*j/sides;
      positions.push(-.57+t*1.14, lift-.095*Math.sin(angle), half*Math.cos(angle));
    }
  }
  for(let i=0;i<rings;i++) for(let j=0;j<sides;j++){
    const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const hull=new THREE.BufferGeometry();
  hull.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  hull.setIndex(indices);hull.computeVertexNormals();
  lacquer.side=THREE.DoubleSide;
  addMesh(boat,hull,lacquer);
  for(const side of [-1,1]){
    const path=[];
    for(let i=0;i<=rings;i++){
      const t=i/rings;path.push(new THREE.Vector3(-.57+t*1.14,.12*Math.abs(2*t-1)**3,side*(.16*Math.sin(Math.PI*t)**.72+.009)));
    }
    addMesh(boat,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),36,.011,8,false),brass);
  }
  for(const x of [-.29,-.14,.01,.16,.30]) box(boat,[.046,.019,.21],walnut,[x,0,0]);
  const neck=new THREE.CatmullRomCurve3([new THREE.Vector3(.43,.04,0),new THREE.Vector3(.54,.14,0),new THREE.Vector3(.55,.25,0),new THREE.Vector3(.64,.28,0)]);
  addMesh(boat,new THREE.TubeGeometry(neck,24,.035,12,false),red);
  sphere(boat,.065,red,[.615,.281,0],[1.45,.72,.67]);
  sphere(boat,.045,brass,[.672,.267,0],[1.45,.63,.72]);
  for (const sign of [-1,1]) sphere(boat,.014,brass,[.613,.303,sign*.044]);
  for (const [x,z] of [[-.32,.17],[.13,-.16]]) box(boat,[.31,.013,.028],walnut,[x,-.036,z],[0,-.50,-.18]);
  box(parent,[1.25,.037,.29],walnut,[.012,.946,.15],[0,.20,0]);
}

export function festivalSoup(parent, {material,addMesh,cylinder,sphere,glaze}, {x=0,z=0,r=.34,celadon=false}={}) {
  const ceramic=material(celadon?0xa3bfb2:0x957a77,{map:glaze,bumpMap:glaze,bumpScale:.003,roughness:.29});
  const brass=material(0xc0a269,{roughness:.38,metalness:.4});
  const base=.934, edge=base+r*.52;
  const profile=[[.095,0],[.10,.022],[r*.53,.03],[r*.84,r*.22],[r,r*.49],[r*.993,r*.54],[r*.946,r*.535],[r*.87,r*.37],[.09,.058],[0,.051]];
  addMesh(parent,new THREE.LatheGeometry(profile.map(([a,b])=>new THREE.Vector2(a,b)),48),ceramic,[x,base,z]);
  addMesh(parent,new THREE.TorusGeometry(r*.979,.008,8,48),brass,[x,edge,z],[Math.PI/2,0,0]);
  cylinder(parent,r*.885,r*.881,.013,material(0xcaab7a,{roughness:.31}),[x,edge-r*.115,z],40);
  const rice=material(0xf0e3cc,{roughness:.69});
  for(let i=0;i<5;i++){
    const a=i*2.39, d=r*(i%2?.54:.32);
    sphere(parent,r*.19,rice,[x+d*Math.sin(a),edge-r*.065,z+d*Math.cos(a)],[1,.89,1]);
  }
  const spoon=material(0xd9dace,{roughness:.39});
  sphere(parent,r*.20,spoon,[x+r*.63,edge+.015,z-r*.36],[.83,.35,1.46]);
  const grip=cylinder(parent,.019,.023,r*.92,spoon,[x+r*.86,edge+.060,z-r*.86],12,[0,0,Math.PI/2]);
  grip.rotation.set(.44,.89,Math.PI/2,'YXZ');
}

export function palaceLantern(parent, tools, position, width, litMaterial) {
  const {material,addMesh,cylinder,box}=tools;
  const lantern=new THREE.Group();
  lantern.position.set(...position);parent.add(lantern);
  const rosewood=material(0x643843,{roughness:.51});
  const copper=material(0xcca267,{roughness:.35,metalness:.60});
  const r=width, h=width*2.09;
  const shade=cylinder(lantern,r*.83,r*.94,h,litMaterial,[0,0,0],6);
  shade.castShadow=false;
  for(const side of [-1,1]){
    const y=side*(h/2+.019);
    cylinder(lantern,r*1.14,r*1.14,.052,rosewood,[0,y,0],6);
    cylinder(lantern,r*1.16,r*1.16,.012,copper,[0,y+side*.035,0],6);
  }
  cylinder(lantern,r*.32,r*1.18,r*.43,rosewood,[0,h/2+r*.25,0],6);
  cylinder(lantern,r*.21,r*.43,r*.18,copper,[0,h/2+r*.55,0],12);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    box(lantern,[.017,h,.016],copper,[r*.89*Math.sin(a),0,r*.89*Math.cos(a)],[.04*Math.cos(a),a,.04*Math.sin(a)]);
  }
  cylinder(lantern,r*.08,r*.23,r*.78,copper,[0,-h/2-r*.48,0],12);
  return {lantern,shade};
}



export function ceramicCup(parent, tools, {x,z,r=.086,color=0xcbd9c6,tea=0x83603c}) {
  const {material,addMesh,cylinder}=tools;
  const glazed=material(color,{map:tools.glaze,bumpMap:tools.glaze,bumpScale:.003,roughness:.27});
  const rim=material(0xc69455,{metalness:.55,roughness:.35});
  cylinder(parent,r*1.55,r*1.28,.023,glazed,[x,.945,z],40);
  const profile=[[.03,0],[r*.60,.008],[r*.76,.028],[r,.108],[r,.117],[r*.89,.119],[r*.86,.103],[r*.67,.031],[0,.024]];
  addMesh(parent,new THREE.LatheGeometry(profile.map(([a,b])=>new THREE.Vector2(a,b)),40),glazed,[x,.956,z]);
  addMesh(parent,new THREE.TorusGeometry(r*.95,.003,6,40),rim,[x,1.072,z],[Math.PI/2,0,0]);
  cylinder(parent,r*.84,r*.83,.006,material(tea,{roughness:.23}),[x,1.058,z],36);
}

export function pastryPlate(parent, tools, {x,z,green=false}) {
  const {material,addMesh,cylinder,sphere}=tools;
  const celadon=material(green?0xc7d2bf:0xa6b9a8,{map:tools.glaze,bumpMap:tools.glaze,bumpScale:.003,roughness:.29});
  const saucer=[[.11,0],[.14,.013],[.25,.029],[.254,.055],[.244,.060],[.216,.042],[0,.032]];
  addMesh(parent,new THREE.LatheGeometry(saucer.map(([r,y])=>new THREE.Vector2(r,y)),48),celadon,[x,.93,z]);
  const crust=material(green?0x6c8952:0xc18a4c,{roughness:.62});
  const stamp=material(0xd6a15f,{roughness:.59});
  for(const [dx,dz,r] of [[-.095,-.02,.087],[.092,-.057,.080],[.012,.105,.078]]){
    if(green) {
      sphere(parent,r,crust,[x+dx,1.011,z+dz],[1,.64,1]);
      continue;
    }
    const cake=new THREE.CylinderGeometry(r*.98,r,.076,48,2,false);
    const vertices=cake.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const angle=Math.atan2(vertices.getZ(i),vertices.getX(i));
      const ripple=1+.063*Math.cos(12*angle);
      vertices.setX(i,vertices.getX(i)*ripple);
      vertices.setZ(i,vertices.getZ(i)*ripple);
    }
    cake.computeVertexNormals();
    addMesh(parent,cake,crust,[x+dx,1.001,z+dz]);
    addMesh(parent,new THREE.TorusGeometry(r*.77,.0035,6,32),stamp,[x+dx,1.041,z+dz],[Math.PI/2,0,0]);
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      const petal=sphere(parent,.018,stamp,[x+dx+.025*Math.cos(a),1.041,z+dz+.025*Math.sin(a)],[1,.20,.55]);
      petal.rotation.y=-a;
    }
  }
}

export function festiveSteam(parent, x, y, z) {
  const mist=buildMist(parent,13,14);
  return {
    resize:mist.resize,
    update(time,dark){
      mist.reset();
      for(let i=0;i<13;i++){
        const t=(time*.42+i/13)%1;
        const curl=i*2.4+time*1.8;
        const alpha=Math.sin(Math.PI*t)**1.25*(.19-.065*dark);
        mist.add(x+(.022+.098*t)*Math.sin(curl),y+t*.40,z+.068*t*Math.cos(curl),.058+t*.19,alpha,curl);
      }
      mist.flush();
    }
  };
}
