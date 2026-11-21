import * as THREE from './vendor/three/three.module.min.js';
import { buildMist } from './room-mist.js';

export function drapeSofaThrow(room, sofa, {addMesh}, tint) {
  const bounds = new THREE.Box3().setFromObject(sofa);
  const right = bounds.max.x;
  const height = bounds.max.y - bounds.min.y;
  const armStart = bounds.min.z + (bounds.max.z - bounds.min.z) * .56;
  const width = .52;
  const rows = 24, columns = 38;
  const geometry = new THREE.PlaneGeometry(1,1,columns,rows);
  const verts = geometry.attributes.position;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0,-1,0), side = new THREE.Vector3(-1,0,0), inside = new THREE.Vector3(1,0,0);
  const start = new THREE.Vector3();
  const hems = [[],[]];
  for(let row=0; row<=rows; row++){
    const v=row/rows;
    const z=armStart+v*width;
    const path=[];
    for (const f of [.66,.77]){
      const y=bounds.min.y+height*f;
      ray.set(start.set(right-1,y,z),inside);
      const hit=ray.intersectObject(sofa,true)[0];
      path.push(new THREE.Vector3((hit?.point.x ?? right-.44)-.052,y,z));
    }
    for(const dx of [.37,.28,.20,.13,.074]){
      const x=right-dx;
      ray.set(start.set(x,bounds.max.y+.4,z),down);
      const hit=ray.intersectObject(sofa,true)[0];
      path.push(new THREE.Vector3(x,Math.max(bounds.min.y+height*.78,hit?.point.y ?? 0)+.044,z));
    }
    for(const f of [.84,.72,.55,.40]){
      const y=bounds.min.y+height*f;
      ray.set(start.set(right+.4,y,z),side);
      const hit=ray.intersectObject(sofa,true)[0];
      path.push(new THREE.Vector3((hit?.point.x ?? right)+.030,y,z));
    }
    const fold = new THREE.CatmullRomCurve3(path);
    for(let col=0; col<=columns; col++){
      const u=col/columns, p=fold.getPointAt(u);
      const ridge=.006*Math.sin(v*Math.PI*10+u*2.4)+.004*Math.sin(v*Math.PI*17);
      p.y+=ridge*(1-u)+.012*u*Math.sin(v*7+1);
      p.x+=u*Math.max(-.003,ridge);
      const t=fold.getUtoTmapping(u);
      // Clear the rounded buttoned upholstery between the control samples.
      if (t<.40) {
        ray.set(start.set(right-1,p.y,p.z),inside);
        const hit=ray.intersectObject(sofa,true)[0];
        if (hit) p.x=Math.min(p.x,hit.point.x-.044);
      }
      if (t>.18 && t<.65) {
        ray.set(start.set(p.x,bounds.max.y+.4,p.z),down);
        const hit=ray.intersectObject(sofa,true)[0];
        if (hit && hit.point.y-p.y<.11) p.y=Math.max(p.y,hit.point.y+.032);
      }
      verts.setXYZ(row*(columns+1)+col,p.x,p.y,p.z);
      if(col===0) hems[0].push(p.clone());
      if(col===columns) hems[1].push(p.clone());
    }
  }
  geometry.computeVertexNormals();
  const texture=new THREE.TextureLoader().load('assets/room/lilac-throw-weave.webp');
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const cloth=new THREE.MeshPhysicalMaterial({
    map:texture,bumpMap:texture,bumpScale:.005,color:tint,
    roughness:.95,sheen:.29,sheenColor:0xcfadb9,sheenRoughness:.88,
    specularIntensity:.25,side:THREE.DoubleSide
  });
  const blanket=addMesh(room,geometry,cloth);
  blanket.name='woven-sofa-throw';
  const countPerHem=hems[0].length*2-1;
  const tassels=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0025,.0017,.032,6),
    new THREE.MeshStandardMaterial({color:new THREE.Color(tint).multiplyScalar(.62),roughness:.98}),countPerHem*2);
  const thread=new THREE.Object3D();
  for(let i=0;i<tassels.count;i++){
    const position=i%countPerHem;
    const hem=hems[Math.floor(i/countPerHem)];
    const idx=Math.floor(position/2),point=hem[idx].clone();
    if(position%2) point.lerp(hem[idx+1],.5);
    thread.position.set(point.x+.002,point.y-.014,point.z);
    thread.rotation.z=Math.sin(i*2.9)*.18;
    thread.scale.y=.87+.15*Math.sin(i*1.9);
    thread.updateMatrix();
    tassels.setMatrixAt(i,thread.matrix);
  }
  room.add(tassels);
}

export function furnishSideTable(room, object, {material,addMesh,cylinder,glaze}) {
  const table=new THREE.Box3().setFromObject(object);
  const middle=table.getCenter(new THREE.Vector3());
  const top=table.max.y+.006;
  const porcelain=material(0xe5d3bd,{map:glaze,bumpMap:glaze,bumpScale:.003,roughness:.29});
  const brass=material(0xc5a57c,{roughness:.48,metalness:.43});
  const tea=material(0x864f31,{roughness:.19});
  const x=middle.x+.20, z=middle.z-.28;
  const profile=[[.012,0],[.058,.002],[.075,.018],[.091,.098],[.096,.109],[.089,.110],[.084,.096],[.065,.031],[.002,.023]];
  cylinder(room,.131,.116,.013,porcelain,[x,top+.006,z],40);
  addMesh(room,new THREE.TorusGeometry(.111,.005,8,40),brass,[x,top+.016,z],[Math.PI/2,0,0]);
  addMesh(room,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),40),porcelain,[x,top+.016,z]);
  addMesh(room,new THREE.TorusGeometry(.038,.009,10,30),porcelain,[x+.096,top+.071,z]);
  cylinder(room,.082,.082,.004,tea,[x,top+.101,z],36);

  const steam=buildMist(room,4);
  return {
    resize:steam.resize,
    update(seconds,darkness){
      steam.reset();
      for(let i=0;i<4;i++){
        const phase=(seconds*.31+i*.253)%1;
        const alpha=THREE.MathUtils.smoothstep(phase,.05,.26)*(1-THREE.MathUtils.smoothstep(phase,.45,1));
        steam.add(x+.052*phase+.018*Math.sin(phase*7.6+i),
          top+.133+phase*.325,z+.033*phase,.075+.21*phase,
          alpha*(.270-.125*darkness),i*3.81+phase*3.2);
      }
      steam.flush();
    }
  };
}
