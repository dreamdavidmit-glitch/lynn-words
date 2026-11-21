import { Box3, BoxGeometry, CatmullRomCurve3, DoubleSide, ExtrudeGeometry, Group, LatheGeometry, PlaneGeometry, Raycaster, Shape, SphereGeometry, SpotLight, TorusGeometry, TubeGeometry, Vector2, Vector3 } from './vendor/three/three.module.min.js';

export const davidRoomX = -17.6;
export const hallZ = -2.18;
export const doorLeft = -3.42, doorRight = 0;
export const balconyEnd = 6.88;
const roomEdge = 6.38;
const passageHalfWidth = 1.02;
const doorHeight = 2.92;

export function suiteZone(x) {
  if (x < davidRoomX + 6.98) return 'david';
  return x < -6.98 ? 'hall' : 'lynn';
}

export function canWalkSuite(x,z,doors={}) {
  if (z < -4.05 || z > balconyEnd) return false;
  const zone=suiteZone(x);
  const local=x-(zone==='david' ? davidRoomX : 0);
  if (zone!=='hall' && Math.abs(local)<=roomEdge) {
    if (z<=4.05 || z>=4.92) return true;
    return doors[zone] && local>doorLeft+.24 && local<doorRight-.24;
  }
  return z<=4.05 && davidRoomX+roomEdge < x && x < -roomEdge && Math.abs(z-hallZ) < passageHalfWidth-.19;
}

function pillowParts() {
  const geo=new SphereGeometry(1,64,32);
  const vertices=geo.attributes.position;
  const softCorner=n=>Math.sign(n)*Math.pow(Math.abs(n),.47);
  function surface(sx,sy,sz) {
    const px=softCorner(sx), pz=softCorner(sz);
    const gathers=.014*Math.sin(pz*18+px*3)*px**8 + .009*Math.sin(px*19)*pz**8;
    return new Vector3(.48*px,.16*sy+gathers-.025*Math.max(0,sy)**9,.34*pz);
  }
  for (let i=0;i<vertices.count;i++) {
    const p=surface(vertices.getX(i),vertices.getY(i),vertices.getZ(i));
    vertices.setXYZ(i,p.x,p.y,p.z);
  }
  geo.computeVertexNormals();
  const perimeter=Array.from({length:64},(_,i)=>{
    const angle=i*Math.PI/32;
    return surface(Math.cos(angle),0,Math.sin(angle));
  });
  const piping=new TubeGeometry(new CatmullRomCurve3(perimeter,true),128,.005,5,true);
  return {body:geo,piping};
}

function duvetGeometry(fold=false) {
  // Surface coordinates follow the fabric over the mattress and down its sides.
  const geo=new PlaneGeometry(2,1,104,fold ? 12 : 84);
  const vertices=geo.attributes.position, uv=geo.attributes.uv;
  for (let i=0;i<vertices.count;i++) {
    const u=uv.getX(i), t=1-uv.getY(i);
    const v=fold ? .009+t*(.148+.034*Math.sin(5*u)-.045*u**4) : t;
    const across=(u-.5)*2.77, along=-.58+2.28*v;
    const side=Math.max(0,Math.abs(across)-1.04), foot=Math.max(0,along-1.28);
    const bend=d=>.14*(1-Math.exp(-d/.14));
    const edgeWave=Math.sin(17*along+2*Math.sin(5*along)+across);
    const px=across-Math.sign(across)*(side-bend(side)-.048*side*edgeWave);
    const pz=along-foot+bend(foot)+.010*Math.sin(3.1*across+.7)*(1-v);
    const drop=Math.hypot(side-bend(side),foot-bend(foot));
    const rolls=.021*Math.sin(across*7+along*2.2)*Math.cos(along*3.7)
      +.012*Math.cos(across*14-along*6)*Math.exp(-4*v);
    const seam=Math.cos(across*8.8+.18*Math.sin(4*along))**18;
    const turnover=.044*Math.exp(-(((v-.106)/.046)**2));
    const foldHeight=fold ? .012+.024*Math.sin(Math.PI*t)+.023*t**7 : 0;
    vertices.setXYZ(i,px,.729-drop+rolls-.013*seam+turnover+foldHeight,pz);
  }
  geo.computeVertexNormals();
  return geo;
}

export function furnitureGrain(canvasTexture) {
  return canvasTexture(768,256,(ctx,w,h)=>{
    ctx.fillStyle='#c09a79';ctx.fillRect(0,0,w,h);
    for(let row=-12;row<h+12;row+=1.2) {
      const phase=row*.021;
      ctx.strokeStyle='rgba(81,46,27,'+(.12+.09*Math.sin(5.2*row))+')';
      ctx.lineWidth=.75+.32*Math.sin(row*1.24);ctx.beginPath();
      for(let col=0;col<=w;col+=8) {
        const y=row+2.8*Math.sin(col*.009+phase)+5*Math.sin(col*.005-phase)
          +8*Math.exp(-((col-486)**2)/8500)*Math.sin(phase*3);
        if(col===0) ctx.moveTo(col,y); else ctx.lineTo(col,y);
      }
      ctx.stroke();
    }
  });
}

function archedBack(width,height) {
  const s=new Shape(), a=width/2;
  s.moveTo(-a,0);s.lineTo(a,0);s.lineTo(a,height-.21);
  s.bezierCurveTo(a,height-.055,a*.61,height,0,height);
  s.bezierCurveTo(-a*.61,height,-a,height-.055,-a,height-.21);
  s.closePath();return s;
}

export function buildBedroomBed(room,x,z,colors,{box,addMesh,material,canvasTexture,grain}) {
  const wood=material(0xb79482,{map:grain,roughness:.58});
  const fabric=material(colors.fabric,{roughness:.93});
  const textile=canvasTexture(768,640,(ctx,w,h)=>{
    ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#e7dfd6';ctx.fillRect(0,0,w,h*.11);
    // A woven band at the foot, with a narrow selvedge and a running stitch.
    for (const [start,width] of [[.771,.005],[.785,.015],[.807,.002],[.865,.002],[.876,.015],[.902,.005]]) {
      ctx.fillStyle=colors.thread;ctx.fillRect(0,h*start,w,h*width);
    }
    ctx.fillStyle='#40302b10';
    for(let row=0;row<h;row+=3) ctx.fillRect(0,row,w,1);
    for(let col=0;col<w;col+=3) ctx.fillRect(col,0,1,h);
    ctx.strokeStyle='#fff8ec';ctx.lineWidth=2;ctx.setLineDash([4,4]);
    for(const row of [.104,.838,.982]) {
      ctx.beginPath();ctx.moveTo(0,row*h);ctx.lineTo(w,row*h);ctx.stroke();
    }
  });
  const cloth=material(colors.quilt,{map:textile,roughness:.96,side:DoubleSide});
  const linen=material(0xf0e6d7,{roughness:.97});
  function cushion(width,length,thickness,radius,mat,y,offsetX=0,offsetZ=0) {
    const shape=new Shape(), a=width/2-radius, b=length/2-radius;
    shape.moveTo(-a,-b);shape.lineTo(a,-b);shape.lineTo(a,b);shape.lineTo(-a,b);shape.closePath();
    const geo=new ExtrudeGeometry(shape,{depth:Math.max(.012,thickness-radius*2),bevelThickness:radius,
      bevelSize:radius,bevelSegments:4,steps:1});
    return addMesh(room,geo,mat,[x+offsetX,y,z+offsetZ],[-Math.PI/2,0,0]);
  }
  for(const side of [-1,1]) for(const end of [-1,1]) {
    box(room,[.14,.26,.16],wood,[x+side*1.02,.13,z+end*1.16]);
  }
  cushion(2.36,2.87,.27,.08,wood,.29);
  cushion(2.25,2.69,.24,.105,linen,.50,0,.045);
  const back=archedBack(2.40,1.10), insert=archedBack(2.23,.94);
  const bevel={depth:.063,bevelSize:.027,bevelThickness:.026,bevelSegments:4};
  addMesh(room,new ExtrudeGeometry(back,bevel),wood,[x,.30,z-1.45]);
  addMesh(room,new ExtrudeGeometry(insert,bevel),fabric,[x,.38,z-1.37]);
  const seamPath=insert.getPoints(36).map(p=>new Vector3(p.x,p.y,.089));
  addMesh(room,new TubeGeometry(new CatmullRomCurve3(seamPath),96,.006,5,false),
    material(colors.thread,{roughness:.9}),[x,.38,z-1.37]);
  const pillow=pillowParts();
  const cord=material(0xd1bfae,{roughness:.95});
  for(const side of [-1,1]) {
    const body=addMesh(room,pillow.body,linen,[x+side*.52,.755,z-.93+side*.019],[-.13,side*.074,side*.018]);
    addMesh(body,pillow.piping,cord);
  }
  addMesh(room,duvetGeometry(),cloth,[x,0,z]);
  const ticking=canvasTexture(512,128,(ctx,w,h)=>{
    ctx.fillStyle='#f6e9da';ctx.fillRect(0,0,w,h);
    ctx.fillStyle=colors.thread;
    for(let col=0;col<w;col+=16) {
      ctx.fillRect(col,0,1,h);ctx.fillRect(col+3,0,1,h);
    }
    ctx.fillRect(0,h-9,w,2);
  });
  addMesh(room,duvetGeometry(true),material(0xffffff,{map:ticking,roughness:.98,side:DoubleSide}),[x,0,z]);
  const lumbar=addMesh(room,pillow.body,fabric,[x-.48,.852,z-.58],[-.25,-.10,-.04],[.81,.80,.53]);
  addMesh(lumbar,pillow.piping,cord);
  return [x-1.32,x+1.32,z-1.57,z+1.55];
}

export function buildConnectedStructure(lynn,david,scene,{box,wood,wall,side,trim,material,canvasTexture,addMesh}) {
  const timber=material(0x533b37,{roughness:.6});
  const bronze=material(0xae7951,{roughness:.38,metalness:.38});
  const ceiling=material(0xe9e5dc,{roughness:.92});
  const davidWall=wall.clone(), davidSide=side.clone();
  davidWall.color.setHex(0xd9ddd4);
  davidSide.color.setHex(0xd9ddd4);
  const rearLimit=4.7, low=hallZ-passageHalfWidth, high=hallZ+passageHalfWidth;
  for (const [room,doorSide,back,sides] of [[lynn,-1,wall,side],[david,1,davidWall,davidSide]]) {
    box(room,[14,6.8,.22],back,[0,3.35,-4.65]);
    box(room,[.22,6.8,9.4],sides,[-doorSide*6.98,3.35,0]);
    for (const [start,end] of [[-rearLimit,low],[high,rearLimit]]) {
      box(room,[.22,6.8,end-start],sides,[doorSide*6.98,3.35,(end+start)/2]);
    }
    box(room,[.22,6.8-doorHeight,high-low],sides,[doorSide*6.98,(6.8+doorHeight)/2-.05,hallZ]);
    const floor=box(room,[14,.16,9.4],wood,[0,-.08,0]);
    floor.geometry.setAttribute('uv2',floor.geometry.attributes.uv.clone());
    box(room,[14,.16,9.4],ceiling,[0,6.72,0]);
    box(room,[14,.22,.16],trim,[0,.12,-4.46]);
    box(room,[14,.18,.18],trim,[0,6.45,-4.46]);
    for (const side of [-6.78,6.78]) box(room,[.18,.18,9.05],trim,[side,6.45,0]);

    const doorX=doorSide*6.82;
    for (const z of [low,high]) {
      box(room,[.14,doorHeight,.12],timber,[doorX,doorHeight/2,z]);
      box(room,[.022,doorHeight-.13,.022],bronze,[doorX-doorSide*.08,doorHeight/2,z]);
    }
    box(room,[.14,.12,high-low+.12],timber,[doorX,doorHeight,hallZ]);
    const text=doorSide<0 ? 'DAVID  →' : '←  LYNN';
    const plaque=canvasTexture(512,140,(ctx,w,h)=>{
      ctx.fillStyle='#413234';ctx.fillRect(0,0,w,h);
      ctx.lineWidth=4;ctx.strokeStyle='#b18c65';ctx.strokeRect(8,8,w-16,h-16);
      ctx.fillStyle='#e9d9b9';ctx.font='600 57px Georgia, serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2+1);
    });
    addMesh(room,new PlaneGeometry(.84,.23),
      material(0xffffff,{map:plaque,roughness:.72}),[doorX-doorSide*.09,3.19,hallZ],
      [0,-doorSide*Math.PI/2,0]).castShadow=false;
  }

  const hallWidth=-davidRoomX-13.92;
  const center=davidRoomX/2;
  const plaster=material(0xc7b7ac,{roughness:.88});
  box(scene,[-davidRoomX-14,.16,high-low],wood,[center,-.08,hallZ]);
  box(scene,[hallWidth,.16,high-low+.22],ceiling,[center,doorHeight+.035,hallZ]);
  for (const x of [-7,davidRoomX+7]) box(scene,[.075,.014,high-low],bronze,[x,.005,hallZ]);
  for (const z of [low-.07,high+.07]) {
    box(scene,[hallWidth,doorHeight+.15,.14],plaster,[center,doorHeight/2,z]);
    box(scene,[hallWidth,.14,.02],timber,[center,.07,z+(z<hallZ ? .079 : -.079)]);
    box(scene,[hallWidth,.032,.018],bronze,[center,1.06,z+(z<hallZ ? .081 : -.081)]);
  }
}

// One atlas gives each volume a printed spine, a cloth cover and exposed page edges.
function makeShelfBooks(parent,{material,addMesh,canvasTexture}) {
  const editions=[
    ['FIELD NOTES','#304c48'],['ALPINE FLORA','#753f38'],['THE NIGHT SKY','#33445c'],
    ['WOODWORK','#ad8253'],['WAYFINDING','#455c61'],['ORCHARDS','#5d674e'],
    ['SKETCHBOOK','#795d6b'],['VALLEY WALKS','#81513b']
  ];
  const cell=256,columns=3;
  const atlas=canvasTexture(columns*cell,editions.length*cell,(ctx)=>{
    editions.forEach(([title,color],row)=>{
      const y=row*cell;
      ctx.save();ctx.translate(0,y);
      ctx.fillStyle=color;ctx.fillRect(0,0,2*cell,cell);
      ctx.strokeStyle='#d9bd89';ctx.lineWidth=2;ctx.strokeRect(16,14,224,228);
      ctx.fillStyle='#f1dbab';ctx.textAlign='center';ctx.font='17px Georgia';ctx.fillText(title,128,111);
      ctx.save();ctx.translate(cell,0);ctx.scale(4,1);
      const rounding=ctx.createLinearGradient(0,0,64,0);
      rounding.addColorStop(0,'#17100c66');rounding.addColorStop(.17,'#fff1d91b');
      rounding.addColorStop(.43,'#fff1d907');rounding.addColorStop(1,'#17100c44');
      ctx.fillStyle=rounding;ctx.fillRect(0,0,64,cell);ctx.fillStyle='#f1dbab';
      for(const line of [16,21,218,225])ctx.fillRect(7,line,50,1.8);
      ctx.translate(32,115);ctx.rotate(-Math.PI/2);ctx.font='bold 16px Georgia';ctx.fillText(title,0,5);
      ctx.restore();
      ctx.fillStyle='#e5d5b9';ctx.fillRect(2*cell,0,cell,cell);
      ctx.fillStyle='#b9a887';
      for(let i=5;i<cell;i+=6) ctx.fillRect(2*cell+i,0,1,cell);
      ctx.fillStyle=color;
      for(const edge of [0,cell-9]) ctx.fillRect(2*cell+edge,0,9,cell);
      ctx.restore();
    });
  });
  const binding=material(0xffffff,{map:atlas,roughness:.78});
  const geometries=editions.map((_,row)=>{
    const geometry=new BoxGeometry(1,1,1), uv=geometry.attributes.uv;
    // Box faces are +X, -X, +Y, -Y, +Z (the spine) and -Z.
    [0,0,2,2,1,2].forEach((column,face)=>{
      for(let j=face*4;j<face*4+4;j++) {
        const u=(2+(cell-4)*uv.getX(j))/cell;
        const v=(2+(cell-4)*uv.getY(j))/cell;
        uv.setXY(j,(column+u)/columns,(editions.length-1-row+v)/editions.length);
      }
    });
    return geometry;
  });
  return (edition,position,size,rotation=[0,0,0])=>
    addMesh(parent,geometries[edition],binding,position,rotation,size);
}

function furnishBookcase(room,tools,oak,darkWood) {
  const {box,material,addMesh,cylinder}=tools;
  const shelf=new Group();shelf.position.set(3.7,0,-3.91);room.add(shelf);
  const brass=material(0xb29a66,{roughness:.39,metalness:.53});
  box(shelf,[1.71,1.035,.036],darkWood,[0,.646,-.197]);
  for(const side of [-1,1]) {
    box(shelf,[.062,1.09,.422],oak,[side*.862,.64,0]);
    for(const end of [-1,1]) cylinder(shelf,.041,.031,.132,darkWood,[side*.802,.066,end*.16],16);
  }
  for(const y of [.138,.605,1.183]) {
    box(shelf,[y>1 ? 1.82 : 1.68,.052,.441],oak,[0,y,0]);
    box(shelf,[1.67,.012,.009],darkWood,[0,y-.012,.223]);
  }
  const book=makeShelfBooks(shelf,tools);
  let edge=-.782;
  for(const [edition,w,h,d] of [[0,.078,.44,.296],[1,.094,.401,.30],[2,.108,.457,.337],[3,.071,.373,.268],[4,.092,.417,.316]]) {
    book(edition,[edge+w/2,.631+h/2,.192-d/2],[w,h,d]);
    edge+=w+.006;
  }
  box(shelf,[.16,.012,.24],brass,[edge+.084,.637,.037]);
  box(shelf,[.011,.241,.23],brass,[edge+.008,.751,.037]);
  // A pair laid flat makes the spines readable from the bed, too.
  book(5,[.45,.675,.035],[.088,.48,.31],[0,.035,-Math.PI/2]);
  book(7,[.435,.753,.048],[.068,.424,.27],[0,-.064,-Math.PI/2]);
  for(let i=0;i<3;i++) {
    book([7,6,0][i],[-.48,.205+.082*i,.025],[.082,.52-i*.026,.31],[0,.036*(i-1),-Math.PI/2]);
  }
  const basketWeave=tools.canvasTexture(256,128,(ctx,w,h)=>{
    ctx.fillStyle='#e3dcce';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#8d827444';ctx.lineWidth=1;
    ctx.beginPath();
    for(let y=0;y<h;y+=4) {ctx.moveTo(0,y);ctx.lineTo(w,y);}
    for(let x=0;x<w;x+=3) {ctx.moveTo(x,0);ctx.lineTo(x,h);}
    ctx.stroke();
  });
  const boxLinen=material(0x99a797,{map:basketWeave,roughness:.93});
  box(shelf,[.64,.249,.32],boxLinen,[.411,.289,.018]);
  box(shelf,[.654,.029,.331],boxLinen,[.411,.427,.018]);
  box(shelf,[.144,.055,.009],brass,[.411,.314,.182]);
  box(shelf,[.116,.031,.006],material(0xe5d7bc),[.411,.314,.189]);
  const leather=material(0x855d44,{roughness:.76});
  const pull=new CatmullRomCurve3([new Vector3(.345,.245,.181),new Vector3(.36,.24,.213),
    new Vector3(.411,.231,.224),new Vector3(.462,.24,.213),new Vector3(.477,.245,.181)]);
  addMesh(shelf,new TubeGeometry(pull,16,.008,7,false),leather);
  book(2,[-.48,1.237,.022],[.056,.44,.305],[0,-.13,-Math.PI/2]);
  // A small hollow stoneware bud vase sits well below the photo plaques.
  const profile=[[.001,0],[.072,0],[.10,.044],[.098,.115],[.062,.166],[.045,.178],[.046,.192],[.034,.192],[.034,.162],[.001,.022]];
  const vase=material(0xbab19a,{roughness:.39});
  addMesh(shelf,new LatheGeometry(profile.map(([r,h])=>new Vector2(r,h)),40),vase,[.46,1.209,0]);
  const twig=material(0x846849),leaf=material(0x78816a,{roughness:.88,side:DoubleSide});
  for(const sign of [-1,1]) {
    const curve=new CatmullRomCurve3([new Vector3(.46,1.32,0),new Vector3(.46+sign*.04,1.46,.012),new Vector3(.46+sign*.114,1.57,.015)]);
    addMesh(shelf,new TubeGeometry(curve,12,.003,5,false),twig);
    for(const t of [.56,.83]) {
      const p=curve.getPoint(t);
      const blade=tools.sphere(shelf,.042,leaf,[p.x+sign*.015,p.y+.015,p.z],[.49,1,.13]);
      blade.rotation.z=-sign*.70;
    }
  }
}

function easedBoard(width,height,thickness,edge,corner=0) {
  const x=width/2-edge,y=height/2-edge;
  const r=Math.min(corner,x,y);
  const s=new Shape();
  if(r>0) {
    s.moveTo(-x+r,-y);s.lineTo(x-r,-y);s.quadraticCurveTo(x,-y,x,-y+r);
    s.lineTo(x,y-r);s.quadraticCurveTo(x,y,x-r,y);
    s.lineTo(-x+r,y);s.quadraticCurveTo(-x,y,-x,y-r);
    s.lineTo(-x,-y+r);s.quadraticCurveTo(-x,-y,-x+r,-y);
  } else {
    s.moveTo(-x,-y);s.lineTo(x,-y);s.lineTo(x,y);s.lineTo(-x,y);
  }
  s.closePath();
  const geo=new ExtrudeGeometry(s,{depth:thickness-2*edge,bevelThickness:edge,
    bevelSize:edge,bevelSegments:4,steps:1}).translate(0,0,-(thickness-2*edge)/2);
  const {position,uv}=geo.attributes;
  for(let i=0;i<uv.count;i++) uv.setXY(i,.5+position.getX(i)/width,.5+position.getY(i)/height);
  return geo;
}

function furnishDesk(room,tools) {
  const {box,cylinder,material,canvasTexture,addMesh}=tools;
  const desk=new Group();
  desk.position.set(1.72,0,2.74);room.add(desk);
  const brass=material(0xb49a67,{metalness:.64,roughness:.33});
  const walnut=material(0x98785d,{map:tools.grain,roughness:.68});
  const endGrain=material(0x745943,{map:tools.grain,roughness:.68});
  const hide=canvasTexture(384,256,(ctx,w,h)=>{
    ctx.fillStyle='#ede1d1';ctx.fillRect(0,0,w,h);
    for(let i=0;i<3300;i++) {
      const x=(i*138.517)%w, y=(i*89.408)%h;
      ctx.fillStyle=i%3===0 ? '#f9f3e947' : '#614b3c26';
      ctx.fillRect(x,y,.65+i%4*.27,.75);
    }
  });
  const mat=material(0x576a60,{map:hide,bumpMap:hide,bumpScale:.0028,roughness:.91});
  const leather=material(0x996f50,{map:hide,bumpMap:hide,bumpScale:.004,roughness:.79});
  const floor=-Math.PI/2;
  addMesh(desk,easedBoard(3.27,1.04,.068,.014,.082),walnut,[0,.841,0],[floor,0,0]);
  addMesh(desk,easedBoard(3.19,.96,.029,.007,.059),endGrain,[0,.796,0],[floor,0,0]);
  for(const side of [-1,1]) {
    for(const end of [-1,1]) {
      const tilt=[-.082*end,0,.079*side];
      cylinder(desk,.046,.027,.746,walnut,[1.45*side,.412,.348*end],18,tilt);
      cylinder(desk,.029,.025,.037,brass,[1.48*side,.020,.378*end],18,tilt);
      cylinder(desk,.026,.027,.007,endGrain,[1.48*side,.004,.378*end],18);
    }
    addMesh(desk,easedBoard(.78,.107,.045,.008,.018),walnut,
      [1.435*side,.74,0],[0,Math.PI/2,0]);
  }
  box(desk,[2.92,.092,.046],endGrain,[0,.74,.378]);
  for(const x of [-1.048,1.048]) {
    box(desk,[.713,.142,.72],endGrain,[x,.711,-.028]);
    addMesh(desk,easedBoard(.675,.124,.041,.010,.011),walnut,[x,.712,-.403]);
    for(const shift of [-.069,.069]) cylinder(desk,.016,.016,.017,brass,
      [x+shift,.714,-.429],18,[Math.PI/2,0,0]);
    const pull=new CatmullRomCurve3([new Vector3(x-.069,.714,-.434),new Vector3(x-.056,.709,-.465),
      new Vector3(x+.056,.709,-.465),new Vector3(x+.069,.714,-.434)]);
    addMesh(desk,new TubeGeometry(pull,20,.007,8,false),brass);
  }

  const pad=addMesh(desk,easedBoard(1.29,.736,.014,.005,.040),mat,[-.28,.879,-.022],[floor,0,0]);
  const stitching=canvasTexture(512,292,(ctx,w,h)=>{
    ctx.strokeStyle='#dfc59ba8';ctx.lineWidth=1.8;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.roundRect(11,11,w-22,h-22,14);ctx.stroke();
  });
  const stitched=addMesh(pad,new PlaneGeometry(1.281,.728),
    material(0xffffff,{map:stitching,transparent:true,roughness:.93}),[0,0,.0074]);
  stitched.castShadow=false;
  const paperMap=canvasTexture(768,512,(ctx,w,h)=>{
    ctx.fillStyle='#f1e7d6';ctx.fillRect(0,0,w,h);
    const spine=ctx.createLinearGradient(w/2-50,0,w/2+50,0);
    spine.addColorStop(0,'#a68d6b00');spine.addColorStop(.5,'#87705461');spine.addColorStop(1,'#a68d6b00');
    ctx.fillStyle=spine;ctx.fillRect(w/2-50,0,100,h);
    ctx.strokeStyle='#998a77ba';ctx.lineWidth=2;
    for(let row=70;row<h-34;row+=24) {
      ctx.beginPath();ctx.moveTo(34,row);ctx.lineTo(w/2-20,row);
      ctx.moveTo(w/2+22,row);ctx.lineTo(w-31,row);ctx.stroke();
    }
    ctx.fillStyle='#717462';ctx.font='italic 32px Georgia';
    ctx.fillText('Field notes',54,59);
    ctx.strokeStyle='#747a6f';ctx.lineWidth=3;
    ctx.save();ctx.translate(566,246);ctx.rotate(.42);
    ctx.beginPath();ctx.moveTo(-5,108);ctx.quadraticCurveTo(14,30,0,-98);ctx.stroke();
    for(let y=-70;y<91;y+=28) for(const side of [-1,1]) {
      ctx.beginPath();ctx.moveTo(7,y+17+side*5);
      ctx.quadraticCurveTo(side*42,y+10,side*52,y-26);
      ctx.quadraticCurveTo(side*19,y-28,7,y+17+side*5);ctx.stroke();
    }
    ctx.restore();
  });
  const diary=new Group();
  diary.position.set(-.38,.908,-.025);diary.rotation.y=Math.PI-.12;desk.add(diary);
  addMesh(diary,easedBoard(.60,.397,.014,.004,.012),leather,[0,-.013,0],[floor,0,0]);
  const pageEdges=canvasTexture(384,128,(ctx,w,h)=>{
    ctx.fillStyle='#efdfc4';ctx.fillRect(0,0,w,h);
    for(let row=6;row<h;row+=7) {
      ctx.fillStyle=row%3===0 ? '#9c81534c' : '#ac947136';
      ctx.fillRect(0,row,w,1.3);
    }
  });
  const paperEdge=material(0xfdf7e9,{map:pageEdges,roughness:.95});
  box(diary,[.285,.019,.37],paperEdge,[-.1425,.004,0]);
  box(diary,[.285,.019,.37],paperEdge,[.1425,.004,0]);
  const pages=new PlaneGeometry(.57,.37,36,1);
  const corners=pages.attributes.position;
  for(let i=0;i<corners.count;i++) {
    const ratio=Math.abs(corners.getX(i))/.285;
    corners.setZ(i,.016+.012*Math.sin(Math.PI*ratio)+.003*ratio);
  }
  pages.computeVertexNormals();
  addMesh(diary,pages,material(0xffffff,{map:paperMap,roughness:.92}),[0,0,0],[floor,0,0]);
  const ribbon=new CatmullRomCurve3([new Vector3(.031,.020,.14),new Vector3(.037,.02,.181),
    new Vector3(.064,-.007,.205),new Vector3(.083,-.016,.233)]);
  const bookmark=addMesh(diary,new TubeGeometry(ribbon,18,.005,6,false),
    material(0x914d37,{roughness:.96}));
  bookmark.scale.y=.86;
  const pen=material(0x353d40,{roughness:.38,metalness:.21});
  const fountainPen=new Group();
  fountainPen.position.set(.16,.896,-.08);fountainPen.rotation.y=-.17;desk.add(fountainPen);
  const sideways=[0,0,Math.PI/2];
  cylinder(fountainPen,.007,.009,.165,pen,[0,0,0],20,sideways);
  cylinder(fountainPen,.010,.010,.027,brass,[.085,0,0],20,sideways);

  const cupX=-1.26,cupZ=.279;
  const stoneware=material(0xa9a58d,{map:tools.glaze,roughness:.46});
  const foot=addMesh(desk,easedBoard(.293,.248,.013,.004,.029),endGrain,[cupX,.88,cupZ],[floor,0,0]);
  foot.castShadow=false;
  const cupProfile=[[0,0],[.081,0],[.086,.017],[.094,.149],[.089,.159],[.081,.159],[.075,.147],[.070,.02],[0,.02]];
  addMesh(desk,new LatheGeometry(cupProfile.map(([r,h])=>new Vector2(r,h)),40),stoneware,[cupX,.887,cupZ]);
  const graphite=material(0x3c3c35,{roughness:.82});
  for(const [offset,tilt,color,height] of [[-.030,.16,0x95624a,.231],[.021,-.23,0x426155,.277]]) {
    const woodPencil=new Group();
    woodPencil.position.set(cupX+offset,.914,cupZ);woodPencil.rotation.z=tilt;desk.add(woodPencil);
    cylinder(woodPencil,.006,.006,height,material(color,{roughness:.78}),[0,height/2,0],6);
    cylinder(woodPencil,.002,.006,.016,walnut,[0,height+.008,0],6);
    cylinder(woodPencil,0,.002,.007,graphite,[0,height+.019,0],8);
  }

  const lampX=1.16,lampZ=.226;
  const enamel=material(0x5d746a,{roughness:.36,metalness:.24});
  const porcelain=material(0xffe1bf,{roughness:.44,emissive:0xffcf99,emissiveIntensity:.68});
  cylinder(desk,.162,.179,.010,brass,[lampX,.881,lampZ],40);
  cylinder(desk,.147,.169,.033,enamel,[lampX,.902,lampZ],40);
  cylinder(desk,.039,.045,.054,brass,[lampX,.940,lampZ],28);
  const stem=new CatmullRomCurve3([new Vector3(lampX,.91,lampZ),new Vector3(lampX,1.35,lampZ),
    new Vector3(lampX-.084,1.53,lampZ),new Vector3(lampX-.289,1.53,lampZ-.045)]);
  addMesh(desk,new TubeGeometry(stem,32,.016,10,false),brass);
  const profile=[[.041,.126],[.079,.10],[.148,.019],[.163,0],[.152,0],[.133,.019],[.068,.091],[.038,.115]];
  const shade=addMesh(desk,new LatheGeometry(profile.map(([r,h])=>new Vector2(r,h)),40),enamel,[lampX-.29,1.406,lampZ-.045]);
  addMesh(desk,new TorusGeometry(.157,.0065,8,48),brass,[lampX-.29,1.407,lampZ-.045],[floor,0,0]);
  cylinder(desk,.029,.043,.028,brass,[lampX-.29,1.539,lampZ-.045],28);
  const bulb=cylinder(desk,.102,.102,.012,porcelain,[lampX-.29,1.423,lampZ-.045],32);
  bulb.castShadow=false;
  const light=new SpotLight(0xffd3a5,2.95,2.15,.78,.86,2);
  light.position.set(lampX-.29,1.395,lampZ-.045);light.target.position.set(.29,.878,-.075);
  desk.add(light,light.target);

  const chair=new Group();
  chair.position.set(1.74,0,1.81);room.add(chair);
  for(const side of [-1,1]) {
    cylinder(chair,.026,.016,.427,walnut,[side*.235,.219,.23],16,[-.12,0,side*.098]);
    cylinder(chair,.029,.022,.779,walnut,[side*.235,.40,-.236],16,[.102,0,side*.060]);
    box(chair,[.038,.048,.419],endGrain,[side*.235,.24,-.008]);
  }
  addMesh(chair,easedBoard(.62,.559,.056,.016,.028),walnut,[0,.441,0],[floor,0,0]);
  addMesh(chair,easedBoard(.57,.493,.084,.034,.024),leather,[0,.497,.028],[floor,0,0]);
  const back=archedBack(.56,.277);
  const upholstery=addMesh(chair,new ExtrudeGeometry(back,{depth:.035,bevelThickness:.021,bevelSize:.017,bevelSegments:5}),
    leather,[0,.542,-.269],[.11,0,0]);
  const welt=back.getPoints(28).map(p=>new Vector3(p.x,p.y,.046));
  addMesh(upholstery,new TubeGeometry(new CatmullRomCurve3(welt),78,.0035,6,false),
    material(0x684b37,{roughness:.92}));
  return {label:'David 书桌台灯',light,material:porcelain,onIntensity:.68,fixtures:[shade,bulb]};
}

export function buildDavidFurniture(room,tools) {
  const oak=tools.material(0xc5a38d,{map:tools.grain,roughness:.56});
  const darkWood=tools.material(0x8e7667,{map:tools.grain,roughness:.63});
  const lamp=furnishDesk(room,tools);
  furnishBookcase(room,tools,oak,darkWood);
  return {lamp,obstacles:[
    [.02,3.42,2.13,3.46], [1.31,2.17,1.35,2.22],
    [2.73,4.64,-4.29,-3.59]
  ]};
}

export function addLoungeCushions(room,sofa,{addMesh,material,canvasTexture}) {
  room.updateWorldMatrix(true,false);
  const bounds=new Box3().setFromObject(sofa);
  const mid=room.worldToLocal(bounds.getCenter(new Vector3()));
  const size=bounds.getSize(new Vector3());
  const weave=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#e3d7bf';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#9d8b685e';ctx.lineWidth=1.1;
    for(let y=0;y<h;y+=5) {
      ctx.beginPath();ctx.moveTo(0,y);
      for(let x=0;x<=w;x+=8) ctx.lineTo(x,y+(x%16===0 ? 0 : 4));
      ctx.stroke();
    }
  });
  const pillow=pillowParts(), cord=material(0xb7a78d,{roughness:.88});
  const ray=new Raycaster(), inward=new Vector3(-1,0,0);
  for (const [offset,color,twist] of [[-.24,0xc2a878,-.13],[.27,0xcbbfc1,.18]]) {
    const z=mid.z+offset*size.z,y=mid.y+.18*size.y;
    ray.set(room.localToWorld(new Vector3(mid.x+size.x,y,z)),inward);
    const back=ray.intersectObject(sofa,true)[0];
    const x=back ? room.worldToLocal(back.point.clone()).x+.125 : mid.x+.025;
    const pad=addMesh(room,pillow.body,material(color,{map:weave,roughness:.93}),
      [x,y,z],[1.26,Math.PI/2+twist,0],[.52,.66,.63]);
    pad.rotation.order='YXZ';
    addMesh(pad,pillow.piping,cord);
  }
}

export function dressDavidCoffeeTable(room,table,{box,cylinder,addMesh,material,glaze}) {
  room.updateWorldMatrix(true,false);
  const bounds=new Box3().setFromObject(table);
  const center=room.worldToLocal(bounds.getCenter(new Vector3()));
  const top=bounds.max.y;
  const linen=material(0x7a5d57,{roughness:.88});
  const paper=material(0xe2d3bb,{roughness:.88});
  const x=center.x-.051,z=center.z+.20, angle=[0,-.16,0];
  box(room,[.335,.035,.25],paper,[x,top+.024,z],angle);
  for(const y of [.006,.045]) addMesh(room,easedBoard(.359,.273,.012,.004),linen,[x,top+y,z],[-Math.PI/2,0,-.16]);
  const cupX=center.x+.05, cupZ=center.z-.19;
  const ceramic=material(0xc6ad86,{map:glaze,roughness:.33});
  cylinder(room,.12,.107,.012,linen,[cupX,top+.007,cupZ],36);
  const profile=[[0,0],[.055,0],[.069,.018],[.077,.101],[.073,.11],[.064,.103],[.060,.022],[0,.018]];
  addMesh(room,new LatheGeometry(profile.map(([r,y])=>new Vector2(r,y)),40),ceramic,[cupX,top+.013,cupZ]);
  addMesh(room,new TorusGeometry(.032,.007,8,24),ceramic,[cupX+.081,top+.072,cupZ]);
  cylinder(room,.060,.060,.004,material(0x744c34,{roughness:.28}),[cupX,top+.086,cupZ],32);
}
