import * as THREE from './vendor/three/three.module.min.js';

function colorTexture(path) {
  const map = new THREE.TextureLoader().load(path);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// Rolls and folds follow the round tabletop. Each holiday uses its own woven panel.
export function layTableRunner(parent, theme, {addMesh,material}) {
  const texture = colorTexture(`assets/room/weave-${theme}.webp`);
  const geo = new THREE.PlaneGeometry(.51, 1, 18, 44);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i=0; i<pos.count; i++) {
    const x=pos.getX(i), t=uv.getY(i)*2-1;
    const edge=Math.sqrt(.69**2-x*x);
    const spill=Math.max(0,Math.abs(t)-.72)/.28;
    const z=edge*Math.min(1,Math.abs(t)/.72)+.019*Math.sin(spill*Math.PI/2)+spill*.023*Math.cos(14*x);
    pos.setXYZ(i,x,.926-spill*.37+.013*spill*Math.sin(x*23),Math.sign(t)*z);
    uv.setXY(i,uv.getX(i),1-uv.getY(i));
  }
  geo.computeVertexNormals();
  const cloth=material(0xffffff,{map:texture,roughness:.97,side:THREE.DoubleSide});
  const runner=addMesh(parent,geo,cloth);runner.rotation.y=.22;
}

export function buildReadingCart(room, {material,addMesh,box,cylinder}) {
  const cart=new THREE.Group();
  cart.position.set(-1.48,0,2.58);
  cart.rotation.y=.22;
  cart.name='reading-cart';
  room.add(cart);
  const grain=colorTexture('assets/textures/wood_floor/wood_floor_diff_1k.jpg');
  const wood=material(0x936447,{map:grain,roughness:.56});
  const brass=material(0xa48459,{metalness:.64,roughness:.3});
  const wheel=material(0x423b38,{roughness:.79});
  const paper=material(0xe9dfc4,{roughness:.91});
  for(const x of [-.64,.64]) for(const z of [-.31,.31]){
    cylinder(cart,.075,.075,.042,wheel,[x,.077,z],24,[Math.PI/2,0,0]);
    cylinder(cart,.024,.026,.89,brass,[x,.58,z],16);
  }
  for(const h of [.28,.91]){
    box(cart,[1.42,.049,.79],wood,[0,h,0]);
    for(const z of [-.38,.38]) box(cart,[1.39,.057,.023],wood,[0,h+.04,z]);
  }
  for(const x of [-.64,.64]){
    for(const z of [-.31,.31]) cylinder(cart,.023,.023,.16,brass,[x,1.04,z],16);
    cylinder(cart,.023,.023,.62,brass,[x,1.12,0],18,[Math.PI/2,0,0]);
  }
  // The basket is made from a shallow woven shell with solid rolled handles.
  const reeds=material(0xa57c60,{roughness:.94,map:colorTexture('assets/textures/poly_wool_herringbone/poly_wool_herringbone_diff_1k.jpg')});
  const basketRim=material(0xa27d61,{roughness:.90});
  const basket=new THREE.Group();
  basket.position.set(-.27,.306,.028); basket.rotation.y=-.12;cart.add(basket);
  const wickerProfile=[[.19,0],[.217,.022],[.23,.085],[.248,.188],[.234,.194],[.224,.155],[.210,.043],[0,.023]];
  const wicker=new THREE.LatheGeometry(wickerProfile.map(([r,y])=>new THREE.Vector2(r,y)),44);
  addMesh(basket,wicker,reeds,[0,0,0],[0,0,0],[1.16,1,.77]);
  for(const y of [.034,.174,.190]){
    const ring=new THREE.TorusGeometry(y>.1 ? .242 : .223,.009,8,48);
    addMesh(basket,ring,basketRim,[0,y,0],[-Math.PI/2,0,0],[1.16,.77,1]);
  }
  for(const x of [-.26,.26]){
    addMesh(basket,new THREE.TorusGeometry(.058,.011,8,24,Math.PI),basketRim,
      [x,.18,0],[0,Math.PI/2,0],[1,.67,1]);
  }
  box(basket,[.32,.035,.24],material(0xffffff,{map:colorTexture('assets/room/weave-everyday.webp'),roughness:.96}),[0,.124,0],[0,.13,0]);
  function boundBook(x,y,z,w,d,cover,angle){
    const book=new THREE.Group();book.position.set(x,y,z);book.rotation.y=angle;cart.add(book);
    const binding=material(cover,{roughness:.76});
    box(book,[w-.014,.054,d-.012],paper,[0,.034,0]);
    for(const h of [.005,.066]) box(book,[w,.009,d],binding,[0,h,0]);
    box(book,[.016,.065,d],binding,[-w/2,.034,0]);
  }
  boundBook(.26,.308,.04,.45,.36,0x6b536d,-.07);
  boundBook(.26,.378,.04,.40,.33,0x657b6f,.12);

  const stand=new THREE.Group();
  stand.position.set(.08,1.115,.055);stand.rotation.y=Math.PI+.10;cart.add(stand);
  stand.rotation.order='YXZ';stand.rotation.x=-Math.PI/2+.47;
  box(stand,[.82,.55,.028],wood,[0,0,-.031]);
  box(stand,[.75,.49,.036],paper,[0,0,0]);
  const pages=new THREE.PlaneGeometry(.76,.50,48,3);
  const vertices=pages.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const u=Math.abs(vertices.getX(i))/.38;
    vertices.setZ(i,.022+.023*Math.sin(u*Math.PI)-.008*Math.exp(-u*15));
  }
  pages.computeVertexNormals();
  addMesh(stand,pages,material(0xffffff,{map:colorTexture('assets/room/botanical-journal.webp'),roughness:.93}));
  box(stand,[.83,.034,.056],brass,[0,-.266,-.007]);
  for(const x of [-.20,.28]) box(cart,[.036,.204,.032],brass,[x,1.033,.235],[-.51,0,0]);
  // The ribbon follows the page gutter and folds down across the lower edge.
  const mark=new THREE.PlaneGeometry(.024,.34,1,18);
  const markVerts=mark.attributes.position;
  for(let i=0;i<markVerts.count;i++){
    const t=mark.attributes.uv.getY(i);
    markVerts.setXYZ(i,markVerts.getX(i)+.018*Math.sin(t*3.4),
      -.313+t*.34, .019+.011*Math.sin(t*3.4)-.082*Math.max(0,1-t/.16)**2);
  }
  mark.computeVertexNormals();
  addMesh(stand,mark,material(0x9d623d,{roughness:.91,side:THREE.DoubleSide})).castShadow=false;
  const ink=material(0x403749,{roughness:.45});
  cylinder(cart,.011,.012,.208,ink,[.238,.947,-.299],20,[0,0,Math.PI/2-.093]);
  cylinder(cart,.004,.011,.030,brass,[.355,.948,-.287],18,[0,0,Math.PI/2-.093]);
  cylinder(cart,.014,.014,.012,brass,[.147,.948,-.307],18,[0,0,Math.PI/2-.093]);
  const mug=material(0xc5cac0,{roughness:.29});
  const cx=-.48,cz=-.19;
  cylinder(cart,.122,.122,.014,wood,[cx,.945,cz],32);
  const profile=[[.01,0],[.065,0],[.084,.016],[.090,.14],[.085,.147],[.079,.14],[.074,.025],[.01,.02]];
  addMesh(cart,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),36),mug,[cx,.954,cz]);
  cylinder(cart,.079,.079,.004,material(0x633e29,{roughness:.15}),[cx,1.077,cz],32);
  addMesh(cart,new THREE.TorusGeometry(.046,.011,8,24),mug,[cx-.098,1.034,cz],[0,0,.1],[1,1.18,1]);
  const lampX=.51, lampZ=.20;
  const mount=cylinder(cart,.13,.145,.036,brass,[lampX,.953,lampZ],30);
  const stem=new THREE.CatmullRomCurve3([
    new THREE.Vector3(lampX,.965,lampZ), new THREE.Vector3(lampX,1.36,lampZ),
    new THREE.Vector3(.472,1.553,.106), new THREE.Vector3(.335,1.567,.083)
  ]);
  addMesh(cart,new THREE.TubeGeometry(stem,32,.018,12,false),brass);
  const milkGlass=material(0xf4d5b1,{roughness:.61,emissive:0xffc48c,emissiveIntensity:.9});
  const hood=new THREE.LatheGeometry([[.036,.18],[.079,.14],[.115,.07],[.145,0],[.133,0],[.108,.05],[.065,.127],[.035,.15]].map(([r,y])=>new THREE.Vector2(r,y)),40);
  const shade=addMesh(cart,hood,milkGlass,[.326,1.403,.067],[.13,0,-.19]);
  shade.castShadow=false;
  const readingLight=new THREE.SpotLight(0xffd2a4,1.05,2.9,.58,.92,2);
  readingLight.position.set(.324,1.405,.06);
  readingLight.target.position.set(.06,1.07,-.06);
  const uplift=new THREE.PointLight(0xffcf9e,.28,1.8,2);
  uplift.position.set(.32,1.44,.07);
  cart.add(readingLight,readingLight.target,uplift);
  const channels={'reading-lamp':{label:'阅读推车台灯',light:readingLight,lights:[uplift],material:milkGlass,onIntensity:.9,fixtures:[shade,mount]}};
  return {channels, obstacle:[-2.32,-.62,2.02,3.15]};
}
