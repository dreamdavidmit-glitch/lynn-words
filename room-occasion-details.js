import * as THREE from './vendor/three/three.module.min.js';

export const windowBenchBounds = [1.73,3.71,2.90,3.96];

export const roomFinishes = {
  everyday:  {throw:0xf0e4e6, rug:0xd8c5dc, trim:0x806c87},
  christmas: {throw:0xc6d4be, rug:0x9b9e8c, trim:0x504f46},
  newyear:   {throw:0xd1c0ce, rug:0xa799b2, trim:0x52435a},
  spring:    {throw:0xe8a89f, rug:0xd5b499, trim:0x925d55},
  lantern:   {throw:0xe6b6a2, rug:0xcbafa9, trim:0x7b5963},
  qingming:  {throw:0xd9dfc6, rug:0xc5cbb0, trim:0x818772},
  dragonboat:{throw:0xbcd2c5, rug:0xb5c5b6, trim:0x627b6d},
  qixi:      {throw:0xd7c2e5, rug:0xc8b6d6, trim:0x776182},
  midautumn: {throw:0xe8c6a1, rug:0xcbb795, trim:0x716355},
  national:  {throw:0xe3c0a8, rug:0xd3b298, trim:0x876653},
  lidong:    {throw:0xddc2af, rug:0xc6b3ab, trim:0x805b52},
  dongzhi:   {throw:0xd2c5df, rug:0xb6a9ba, trim:0x72647b}
};

export function handGlaze() {
  const texture = new THREE.TextureLoader().load('assets/room/hand-thrown-glaze.webp');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildWindowBench(room, theme, {material,addMesh,box,cylinder,sphere,glaze}) {
  const bench = new THREE.Group();
  bench.name = 'window-bench';
  bench.position.set(2.72,0,3.44);
  room.add(bench);
  const grain = new THREE.TextureLoader().load('assets/textures/wood_floor/wood_floor_diff_1k.jpg');
  grain.colorSpace = THREE.SRGBColorSpace;
  const timber = material(0xa88c70,{map:grain,bumpMap:grain,bumpScale:.012,roughness:.65});
  const metal = material(0x8f7452,{roughness:.44,metalness:.65});
  const paper = material(0xeee2c9,{roughness:.92});
  const ceramic = (color,roughness=.34) => material(color,{map:glaze,bumpMap:glaze,bumpScale:.003,roughness});
  const cream = ceramic(0xe9dcc7);
  const green = material(0x68836c,{roughness:.82,side:THREE.DoubleSide});
  const twine = material(0xbba587,{roughness:.97});
  const channels = {};
  const lathe = (profile,mat,x,y,z,segments=36) =>
    addMesh(bench,new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),segments),mat,[x,y,z]);
  const tube = (points,r,mat) => addMesh(bench,new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),18,r,6,false),mat);
  const ring = (r,thickness,mat,x,y,z) =>
    addMesh(bench,new THREE.TorusGeometry(r,thickness,6,38),mat,[x,y,z],[Math.PI/2,0,0]);
  const top = .60;

  for(const x of [-.66,.66]) {
    for(const z of [-.235,.235]){
      box(bench,[.068,.572,.068],timber,[x,.292,z],[z*.36,0,-x*.075]);
      cylinder(bench,.041,.041,.032,metal,[x+Math.sign(x)*.015,.024,z+Math.sign(z)*.020],14);
    }
    box(bench,[.069,.047,.43],timber,[x,.20,0]);
  }
  box(bench,[1.39,.053,.049],timber,[0,.214,.065]);
  const topShape = new THREE.Shape();
  const w=.86,d=.325,r=.093;
  topShape.moveTo(-w+r,-d);topShape.lineTo(w-r,-d);topShape.quadraticCurveTo(w,-d,w,-d+r);
  topShape.lineTo(w,d-r);topShape.quadraticCurveTo(w,d,w-r,d);topShape.lineTo(-w+r,d);
  topShape.quadraticCurveTo(-w,d,-w,d-r);topShape.lineTo(-w,-d+r);topShape.quadraticCurveTo(-w,-d,-w+r,-d);
  const topMesh = addMesh(bench,new THREE.ExtrudeGeometry(topShape,{
    depth:.054,bevelEnabled:true,bevelThickness:.009,bevelSize:.008,bevelSegments:2,curveSegments:9
  }),timber,[0,top-.063,0],[-Math.PI/2,0,0]);
  const uv = topMesh.geometry.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*.78+.5,uv.getY(i)*.86+.5);
  grain.wrapS=grain.wrapT=THREE.RepeatWrapping;

  function dish(x,z,mat,size=.22) {
    lathe([[0,0],[size*.47,0],[size*.73,.018],[size,.053],[size,.060],[size*.91,.057],[size*.65,.03],[0,.025]],mat,x,top,z);
  }
  function book(x,y,z,w,d,color,a) {
    const binding=material(color,{roughness:.89});
    box(bench,[w-.018,.055,d-.017],paper,[x,y+.036,z],[0,a,0]);
    for(const h of [.006,.067]) box(bench,[w,.010,d],binding,[x,y+h,z],[0,a,0]);
    box(bench,[w,.058,.012],binding,[x-d*.5*Math.sin(a),y+.037,z-d*.5*Math.cos(a)],[0,a,0]);
  }
  function branch(x,z,petals,color,height) {
    const vase=ceramic(color);
    lathe([[.06,0],[.106,.023],[.121,.11],[.093,.21],[.053,.27],[.055,.286],[.047,.288],[.043,.244]],vase,x,top,z);
    ring(.052,.003,metal,x,top+.282,z);
    const stems=material(0x866c50,{roughness:.9});
    const bud=material(petals,{roughness:.81});
    for(let i=0;i<5;i++){
      const a=i*2.39996,dx=Math.cos(a)*.19,dz=Math.sin(a)*.12;
      const y=top+height-(i%3)*.064;
      tube([[x,top+.257,z],[x+dx*.52,top+.43,z+dz*.52],[x+dx,y,z+dz]],.0052,stems);
      for(let j=0;j<3;j++){
        const t=.58+j*.17;
        const sprig=sphere(bench,.036,green,[x+dx*t+.026*Math.sin(j*3),top+.27+(y-top-.255)*t,z+dz*t],[.42,1.16,.29]);
        sprig.rotation.z=.66*Math.sin(i+j*2.8);
        sphere(bench,.024,bud,[x+dx*t-.023*Math.sin(j*3),top+.283+(y-top-.24)*t,z+dz*t-.015],[1,.91,.68]);
      }
    }
  }
  function wovenPot(x,z,r,open=false) {
    const weave=material(theme==='dragonboat'?0xb2ab73:0xb78f5b,{roughness:.91});
    lathe([[0,0],[r*.88,0],[r,.018],[r,.218],[r*.96,.227],[r*.88,.218],[r*.86,.033],[0,.026]],weave,x,top,z);
    for(const y of [.02,.037,.072,.111,.150,.190,.218]) ring(r*1.01,.004,twine,x,top+y,z);
    if(open) {
      const lid=cylinder(bench,r,r,.032,weave,[x+r*.71,top+r*.97,z+.04],40,[.14,0,-.63]);
      addMesh(lid,new THREE.TorusGeometry(r*.87,.009,6,38),twine,[0,.024,0],[Math.PI/2,0,0]);
      cylinder(lid,.033,.039,.039,metal,[0,.033,0],16);
    }
  }

  switch(theme) {
    case 'christmas': {
      const wood=material(0x947052,{roughness:.94});
      const fruit=material(0x9d2836,{roughness:.47});
      dish(-.22,-.015,cream,.30);
      const cones=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),wood,75);
      const scale=new THREE.Object3D();
      let index=0;
      for(let q=0;q<3;q++){
        const x=-.39+.18*q,z=-.05+(q%2)*.12;
        sphere(bench,.046,wood,[x+.008,top+.086,z],[.69,1.16,.69]);
        for(let row=0;row<5;row++) for(let k=0;k<5;k++){
          const angle=k*Math.PI*2/5+row*.61+q*.48;
          const radius=.043-row*.0068;
          scale.position.set(x+radius*Math.cos(angle)+row*.004,top+.050+row*.025,z+radius*Math.sin(angle));
          scale.rotation.set(.38*Math.sin(angle),-angle,.21*Math.cos(angle));
          scale.scale.set(.035-row*.0027,.016,.025-row*.0022);
          scale.updateMatrix();
          cones.setMatrixAt(index++,scale.matrix);
        }
        sphere(bench,.025,fruit,[x+.079,top+.058,z+.047]);
        sphere(bench,.023,fruit,[x+.062,top+.055,z+.082]);
      }
      cones.castShadow=cones.receiveShadow=true;
      bench.add(cones);
      branch(.38,.06,0xa73c43,0x3e6658,.65);
      const amber=material(0xedca9d,{roughness:.57,emissive:0xffa35e,emissiveIntensity:.62});
      const holder=cylinder(bench,.059,.064,.104,amber,[.65,top+.068,-.12],24);
      cylinder(bench,.068,.068,.021,metal,[.65,top+.012,-.12],22);
      ring(.060,.004,metal,.65,top+.120,-.12);
      const glow=new THREE.PointLight(0xffa766,.62,1.9,2);
      glow.position.set(.65,top+.15,-.15);bench.add(glow);
      channels['fir-votive']={label:'松果旁暖烛',light:glow,material:amber,onIntensity:.62,fixtures:[holder]};
      break;
    }
    case 'spring': {
      const orange=ceramic(0xf7a147,.57);
      dish(-.16,0,ceramic(0x923b43),.31);
      for(const [x,y,z] of [[-.27,.102,.060],[-.111,.101,.060],[-.19,.102,-.078],[-.19,.221,.012],[.055,.105,.014]]){
        sphere(bench,.079,orange,[x,top+y,z],[1,.91,1]);
        const leaf=sphere(bench,.045,green,[x+.027,top+y+.06,z],[.96,.19,.45]);
        leaf.rotation.y=x*5;
      }
      branch(.47,.024,0xc74056,0xd4aa84,.73);
      break;
    }
    case 'lantern': {
      dish(.05,.02,ceramic(0x9ea5ba),.29);
      const shell=material(0xf1d6af,{map:glaze,roughness:.54,emissive:0xffb762,emissiveIntensity:.65});
      const body=sphere(bench,.182,shell,[.05,top+.201,.01],[1.12,.87,.79]);
      const head=sphere(bench,.126,shell,[.153,top+.298,-.016],[.97,1,.86]);
      for(const [x,tilt] of [[.117,-.22],[.193,.21]]){
        const ear=sphere(bench,.073,shell,[x,top+.427,-.009],[.45,1.65,.44]);
        ear.rotation.z=tilt;
      }
      const ink=material(0x5c403f,{roughness:.84});
      sphere(bench,.012,ink,[.188,top+.322,-.118]);
      const glow=new THREE.PointLight(0xffba7c,.95,2.2,2);
      glow.position.set(.052,top+.23,-.19);bench.add(glow);
      channels['rabbit-lantern']={label:'窗边兔子灯',light:glow,material:shell,onIntensity:.65,fixtures:[body,head]};
      break;
    }
    case 'qingming':
      branch(-.24,-.026,0xe0d6b5,0x9fae99,.81);
      dish(.30,.056,cream,.225);
      for(let i=0;i<4;i++){
        const leaf=sphere(bench,.079,green,[.21+i*.056,top+.058,.075-.02*i],[.92,.22,.38]);
        leaf.rotation.y=-.8+i*.53;
      }
      break;
    case 'dragonboat': {
      wovenPot(.12,.02,.245,true);
      const bamboo=material(0x61816b,{roughness:.89});
      for(const [x,y,z,a] of [[.05,.205,-.007,.25],[.20,.218,-.055,1.45],[.14,.249,.075,.79]]){
        const parcel=addMesh(bench,new THREE.TetrahedronGeometry(.109),bamboo,[x,top+y,z],[.31,a,.21]);
        addMesh(parcel,new THREE.TorusGeometry(.062,.0045,5,3),twine,[0,.005,0],[Math.PI/2,0,0]);
      }
      branch(-.43,.03,0x9caa71,0x789480,.68);
      break;
    }
    case 'qixi': {
      book(-.16,top,0,.55,.37,0x89708e,.12);
      const linen=material(0xe5d3d5,{map:glaze,bumpMap:glaze,bumpScale:.001,roughness:.96});
      const letter=new THREE.Group();
      letter.position.set(-.16,top+.08,-.013);letter.rotation.y=.05;bench.add(letter);
      box(letter,[.38,.018,.255],linen,[0,0,0]);
      const fold=new THREE.Shape();
      fold.moveTo(-.187,-.124);fold.lineTo(0,.045);fold.lineTo(.187,-.124);
      addMesh(letter,new THREE.ShapeGeometry(fold),material(0xc6a7c1,{side:THREE.DoubleSide,roughness:.91}),[0,.012,.025],[-Math.PI/2,0,0]);
      cylinder(letter,.026,.031,.010,material(0x96566e,{roughness:.67}),[0,.020,-.006],16);
      branch(.42,.035,0x9a7ba6,0xa39dbf,.66);
      break;
    }
    case 'midautumn':
      branch(-.27,-.012,0xd7ac58,0xc8b392,.77);
      dish(.29,.041,ceramic(0xb4bcab),.266);
      lathe([[.051,0],[.07,.006],[.101,.151],[.098,.164],[.083,.161],[.082,.146],[.06,.022],[0,.021]],cream,.28,top+.03,.047);
      ring(.093,.004,metal,.28,top+.191,.047);
      cylinder(bench,.08,.08,.006,material(0x8e603d,{roughness:.24}),[.28,top+.173,.047],28);
      break;
    case 'national':
      book(-.12,top,0,.64,.39,0x9f604b,-.12);
      book(-.19,top+.071,.034,.54,.35,0x686e61,.083);
      box(bench,[.028,.004,.28],material(0xb86f5b),[.005,top+.149,-.026],[0,.09,0]);
      branch(.43,.024,0xc29158,0xb69677,.70);
      break;
    case 'lidong': {
      const texture=new THREE.TextureLoader().load('assets/room/weave-lidong.webp');
      texture.colorSpace=THREE.SRGBColorSpace;
      const wool=material(0xf0e9df,{map:texture,bumpMap:texture,bumpScale:.007,roughness:.96});
      const stitching=material(0xd2bdac,{roughness:.97});
      for(const [x,y,z,width] of [[-.11,.067,.018,.72],[-.08,.188,.031,.64]]){
        cylinder(bench,.077,.077,width,wool,[x,top+y,z],36,[0,0,Math.PI/2],[1,1,.81]);
        addMesh(bench,new THREE.TorusGeometry(.061,.008,6,22),stitching,[x+width/2,top+y,z],[0,Math.PI/2,0]);
      }
      branch(.49,.008,0xb68e74,0xa78879,.64);
      break;
    }
    case 'dongzhi': {
      wovenPot(-.02,.036,.25,true);
      const dough=ceramic(0xe9d4ab,.83);
      for(const [x,z,a] of [[-.13,-.02,.34],[.136,.055,-.55],[-.012,.110,.13]]){
        const dumpling=sphere(bench,.069,dough,[x,top+.224,z],[1.12,.72,.67]);
        dumpling.rotation.y=a;
        for(let j=-2;j<=2;j++) sphere(bench,.015,dough,[x+j*.021,top+.274,z-j*.006],[.7,1,.65]);
      }
      dish(.49,-.047,ceramic(0xa78b9e),.142);
      break;
    }
    case 'newyear': {
      const glass = new THREE.MeshPhysicalMaterial({color:0xead5ad,transparent:true,opacity:.42,roughness:.16,
        metalness:.05,ior:1.43,depthWrite:false,side:THREE.DoubleSide});
      const cordial=material(0xc58c67,{roughness:.22});
      for(const [x,z,height] of [[-.23,-.04,.39],[.13,.07,.325]]){
        lathe([[0,0],[.091,0],[.092,.015],[.024,.027],[.015,height-.155],
          [.05,height-.132],[.105,height-.063],[.116,height],[.106,height],[.102,height-.061],
          [.047,height-.126],[.022,height-.148]],glass,x,top,z);
        cylinder(bench,.105,.091,.025,cordial,[x,top+height-.04,z],32);
        ring(.113,.003,metal,x,top+height,z);
      }
      book(.53,top,.028,.35,.28,0x6b546c,.16);
      break;
    }
    default:
      book(-.23,top,.017,.58,.43,0x776586,-.13);
      book(-.25,top+.071,.031,.50,.35,0x6c8277,.12);
      dish(.238,-.152,cream,.14);
      branch(.46,.051,0xb9a6a6,0xcdbbae,.72);
  }
  return {channels};
}
