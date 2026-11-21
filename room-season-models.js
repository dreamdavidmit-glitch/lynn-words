import * as THREE from './vendor/three/three.module.min.js';
import { layTableRunner } from './room-reading-corner.js';
import { ceramicCup, dragonBoat, festivalSoup, festiveSteam, newYearClock, palaceLantern, pastryPlate } from './room-festival-crafts.js';

// A different tabletop or floor arrangement occupies this corner on each festival.
export function buildSeason(parent, theme, {material, addMesh, box, cylinder, sphere, canvasTexture, glaze}, owner='lynn') {
  if (!theme) return null;
  const david=owner==='david';
  const christmas=theme==='christmas';
  const tools={material,addMesh,box,cylinder,sphere,canvasTexture,glaze};
  const group = new THREE.Group();
  group.name = 'festival-' + theme;
  group.position.set(david ? (christmas ? 5.13 : 5.12) : -1.65,0,
    david ? (christmas ? 1.73 : .68) : (christmas ? 2.72 : 2.30));
  if(david) group.rotation.y=christmas ? -.56 : .39;
  parent.add(group);
  const brass = material(0xc8a154, {roughness:.29, metalness:.7});
  const walnut = material(0x684a39, {roughness:.59});
  const porcelain = material(0xd8e4d7, {map:glaze,bumpMap:glaze,bumpScale:.003,roughness:.28});
  const silk = material(0xa73337, {roughness:.55});
  const channels = {};
  let motion = null;
  const rod = (a,b,r,mat,host=group) => {
    const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b);
    const axis=end.clone().sub(start);
    const mesh=cylinder(host,r,r,axis.length(),mat,start.clone().lerp(end,.5).toArray(),10);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
    return mesh;
  };
  const star = (host,x,y,z,r,mat) => {
    const shape = new THREE.Shape();
    for (let i=0;i<10;i++) {
      const a=Math.PI/2+i*Math.PI/5, len=i%2 ? r*.44 : r;
      shape[i ? 'lineTo' : 'moveTo'](len*Math.cos(a),len*Math.sin(a));
    }
    shape.closePath();
    return addMesh(host,new THREE.ExtrudeGeometry(shape,{depth:r*.15,bevelThickness:r*.045,bevelSize:r*.055,bevelSegments:2}),mat,[x,y,z]);
  };
  const makeLight = (id,label,mat,pos,power,fixture) => {
    const light = new THREE.PointLight(0xffbd75,power,3.6,2);
    light.position.set(...pos); group.add(light);
    channels[id] = {label,light,material:mat,onIntensity:mat.emissiveIntensity,fixtures:[fixture]};
  };

  if (christmas) {
    const texture=new THREE.TextureLoader().load('assets/room/nordmann-fir-spray.webp');
    texture.colorSpace=THREE.SRGBColorSpace;
    const leaves=new THREE.MeshStandardMaterial({map:texture,color:0xc3d6c3,alphaTest:.45,side:THREE.DoubleSide,roughness:.86});
    const spray=new THREE.PlaneGeometry(1,1,2,3);
    spray.translate(0,.5,0);
    const vertices=spray.attributes.position;
    for (let i=0;i<vertices.count;i++) vertices.setZ(i, -.13*vertices.getY(i)**2+.07*Math.abs(vertices.getX(i)));
    spray.computeVertexNormals();
    const transforms=[];
    const branch=new THREE.Object3D();
    branch.rotation.order='YXZ';
    for (let layer=0;layer<15;layer++) {
      const t=layer/15, radius=1.01*(1-t)**.76+.035;
      const n=10+Math.round(17*(1-t));
      for (let j=0;j<n;j++) {
        const a=j/n*Math.PI*2+layer*2.4;
        const length=radius*(.9+.1*Math.sin(j*19+layer*7));
        branch.position.set(.045*Math.sin(a),.35+t*2.05,.045*Math.cos(a));
        branch.rotation.set(1.26-.45*t+.16*Math.sin(j*2.7),a,.17*Math.sin(j*5+layer),'YXZ');
        branch.scale.set(length*.71,length,1);
        branch.updateMatrix(); transforms.push(branch.matrix.clone());
      }
    }
    const foliage=new THREE.InstancedMesh(spray,leaves,transforms.length);
    transforms.forEach((matrix,i)=>foliage.setMatrixAt(i,matrix));
    foliage.castShadow=foliage.receiveShadow=true; group.add(foliage);
    cylinder(group,.055,.09,1.4,walnut,[0,.75,0],18);
    cylinder(group,.32,.25,.36,material(0x88745d,{roughness:.9}),[0,.18,0],48);
    const glass=[material(david ? 0x376581 : 0x982022,{metalness:.44,roughness:.18}),brass,material(0xdcd5bb,{metalness:.55,roughness:.22})];
    const bulb=material(0xffe2a3,{emissive:0xffbb56,emissiveIntensity:3.4});
    const bulbs=[], wire=[];
    for (let i=0;i<=180;i++) {
      const t=i/180,a=t*Math.PI*9,r=.91*(1-t)**.79+.07;
      const p=[r*Math.sin(a),.50+t*1.93,r*Math.cos(a)];
      wire.push(new THREE.Vector3(...p));
      if (i%4===0) bulbs.push(sphere(group,.021,bulb,p));
      if (i%8===3) {
        const [x,y,z]=p;
        sphere(group,.061,glass[Math.floor(i/8)%3],[x,y-.07,z]);
        cylinder(group,.019,.019,.029,brass,[x,y-.007,z],8);
      }
    }
    addMesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire),144,.009,5,false),material(0x484136));
    rod([0,2.27,0],[0,2.52,0],.016,brass);
    const topper=star(group,0,2.52,0,.18,bulb);
    if(david) topper.rotation.y=-Math.PI/2;
    const gleams=new THREE.BufferGeometry();
    gleams.setAttribute('position',new THREE.Float32BufferAttribute([...bulbs,topper].flatMap(mesh=>mesh.position.toArray()),3));
    const haloMap=canvasTexture(48,48,(ctx,w,h)=>{
      const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
      g.addColorStop(0,'#fff');g.addColorStop(.20,'rgba(255,224,143,.64)');g.addColorStop(1,'rgba(255,176,68,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    });
    const halo=new THREE.Points(gleams,new THREE.PointsMaterial({size:.17,map:haloMap,color:0xffdd92,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
    group.add(halo);
    const skirtMap=new THREE.TextureLoader().load('assets/room/weave-christmas.webp');
    skirtMap.colorSpace=THREE.SRGBColorSpace;
    const skirt=new THREE.CircleGeometry(.97,72);
    const skirtPositions=skirt.attributes.position;
    for(let i=1;i<skirtPositions.count;i++) {
      const a=Math.atan2(skirtPositions.getY(i),skirtPositions.getX(i));
      const fold=1+.045*Math.cos(12*a);
      skirtPositions.setXYZ(i,skirtPositions.getX(i)*fold,skirtPositions.getY(i)*fold,.013*Math.cos(12*a));
    }
    skirt.computeVertexNormals();
    addMesh(group,skirt,material(0xbba3a0,{map:skirtMap,roughness:.98}),[0,.029,0],[-Math.PI/2,0,0]);
    const giftRibbon=material(0xd2a358,{metalness:.17,roughness:.43});
    const giftPaper=material(0xe5cba2,{roughness:.86});
    for (const [x,z,w,h,c,a] of [[.61,-.58,.43,.31,0x822f3c,-.23],[-.45,-.71,.34,.26,0xe2c696,.24],[.22,-1,.30,.20,0x496f58,-.12]]) {
      const gift=new THREE.Group();
      gift.position.set(x,.026,z);gift.rotation.y=a;group.add(gift);
      box(gift,[w,h,w*.85],material(c,{roughness:.84}),[0,h/2,0]);
      box(gift,[w*.14,h+.008,w*.85+.008],giftRibbon,[0,h/2,0]);
      box(gift,[w+.009,h+.01,w*.11],giftRibbon,[0,h/2,0]);
      for(const sign of [-1,1]){
        addMesh(gift,new THREE.TorusGeometry(w*.112,.009,8,22),giftRibbon,[sign*w*.098,h+.034,0],[.48,0,sign*.38],[1.13,.79,1]);
        box(gift,[w*.16,.007,w*.24],giftRibbon,[sign*w*.070,h+.010,-w*.10],[0,sign*.47,0]);
      }
      box(gift,[w*.16,.007,w*.23],giftPaper,[-w*.28,h+.006,-w*.14],[0,-.29,0]);
    }
    // Hang a fir wreath from the window crossbar on its own length of ribbon.
    const wreath=new THREE.Group();wreath.position.set(david ? -4.75 : 4.75,2.51,4.40);parent.add(wreath);
    const core=material(0x344433,{roughness:.94});
    addMesh(wreath,new THREE.TorusGeometry(.285,.071,9,44),core);
    box(wreath,[.065,.37,.013],silk,[0,.409,0]);
    const woven=new THREE.InstancedMesh(spray,leaves,56);
    for(let i=0;i<woven.count;i++){
      const a=i*Math.PI*2/woven.count;
      branch.position.set(.27*Math.cos(a),.27*Math.sin(a),-.026);
      branch.rotation.set(.25*Math.sin(i),.16*Math.cos(i),a-.77,'XYZ');
      branch.scale.set(.18,.252,1);branch.updateMatrix();woven.setMatrixAt(i,branch.matrix);
    }
    woven.castShadow=woven.receiveShadow=true;wreath.add(woven);
    for (let j=0;j<7;j++) {
      const a=j*.90;
      for(let k=0;k<3;k++) sphere(wreath,.021,glass[0],[.29*Math.cos(a)+k*.018,.29*Math.sin(a)+(k%2)*.03,-.077]);
    }
    for(const sign of [-1,1]) {
      addMesh(wreath,new THREE.TorusGeometry(.072,.023,8,24),silk,[sign*.074,.23,-.11],[0,0,sign*.45],[1.05,.67,1]);
      box(wreath,[.041,.155,.014],silk,[sign*.049,.145,-.11],[0,0,sign*.32]);
    }
    // Three hooks carry two swags along the window rail; leave the lake view open.
    const garland=new THREE.Group();garland.position.set(david ? 6.8 : 0,0,4.39);parent.add(garland);
    const sprigs=new THREE.InstancedMesh(spray,leaves,126);
    const lamps=[], cable=[];
    const windowBulb=material(0xffddb0,{roughness:.4,emissive:0xffb851,emissiveIntensity:2.8});
    for(let i=0;i<126;i++){
      const t=i/125,x=-6.8+6.8*t;
      const y=3.08-.28*Math.abs(Math.sin(2*Math.PI*t));
      branch.position.set(x,y,.015*Math.sin(i));
      branch.rotation.set(.20*Math.sin(i),.20*Math.cos(i),-1.10-(i%2)*.84,'XYZ');
      branch.scale.set(.33,.39,1);branch.updateMatrix();sprigs.setMatrixAt(i,branch.matrix);
      if(i%4===0 || i===125) {
        const point=[x,y-.07-.032*Math.sin(i),-.06];
        cable.push(new THREE.Vector3(...point));
        lamps.push(sphere(garland,.023,windowBulb,point));
      }
    }
    garland.add(sprigs);
    addMesh(garland,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cable),64,.009,5,false),core);
    for(const x of [-6.8,-3.4,0]){
      cylinder(garland,.035,.035,.10,brass,[x,3.09,.005],12,[Math.PI/2,0,0]);
      for(const sign of [-1,1]){
        addMesh(garland,new THREE.TorusGeometry(.091,.027,8,22),silk,[x+sign*.076,3.03,-.10],[.17,0,sign*.40],[1,.65,1]);
        box(garland,[.062,.25,.013],silk,[x+sign*.056,2.90,-.095],[0,0,sign*.24]);
      }
    }
    // Felt stockings are cut and sewn shapes with a real cuff and hanging loop.
    const plaid=new THREE.TextureLoader().load('assets/room/weave-christmas.webp');
    plaid.colorSpace=THREE.SRGBColorSpace;
    const stocking=new THREE.Shape();
    stocking.moveTo(-.11,.02);stocking.lineTo(.11,.02);stocking.lineTo(.11,-.27);
    stocking.quadraticCurveTo(.10,-.36,.20,-.38);stocking.bezierCurveTo(.38,-.40,.28,-.58,.12,-.55);
    stocking.lineTo(-.055,-.48);stocking.quadraticCurveTo(-.15,-.45,-.13,-.35);stocking.closePath();
    const sockGeo=new THREE.ExtrudeGeometry(stocking,{depth:.055,bevelSize:.016,bevelThickness:.011,bevelSegments:3});
    const sockUV=sockGeo.attributes.uv;
    for(let i=0;i<sockUV.count;i++) sockUV.setXY(i,(sockUV.getX(i)+.15)*2.2,(sockUV.getY(i)+.58)*1.7);
    const felt=material(0xffffff,{map:plaid,roughness:.98});
    const fleece=material(0xf0e6d4,{roughness:.99});
    for(const [x,tilt] of [[-4.78,-.14],[-4.26,.07]]){
      const sock=new THREE.Group();sock.position.set(x,2.56,-.065);sock.rotation.z=tilt;garland.add(sock);
      const topY=3.08-.28*Math.abs(Math.sin(2*Math.PI*(x+6.8)/6.8));
      rod([x,topY,-.055],[x,2.59,-.065],.010,silk,garland);
      addMesh(sock,sockGeo,felt);
      box(sock,[.26,.095,.095],fleece,[0,-.01,.02]);
    }
    const garlandLight=new THREE.RectAreaLight(0xffc277,2.2,6.35,.27);
    garlandLight.position.set(-3.4,2.50,-.41);
    garlandLight.lookAt(-3.4,2.92,0);garland.add(garlandLight);
    channels['window-garland']={label:'窗边松枝灯',light:garlandLight,material:windowBulb,onIntensity:2.8,fixtures:lamps};
    makeLight('tree','圣诞树灯串',bulb,[.16,1.62,-.75],1.75,bulbs[0]);
    channels.tree.fixtures=[foliage,topper,...bulbs];
    channels.tree.halo=halo;
    const lowerStrand=new THREE.PointLight(0xffb364,1.70,2.75,2);
    lowerStrand.position.set(-.22,.61,-.96);group.add(lowerStrand);
    channels.tree.lights=[lowerStrand];
    return {channels, obstacle:david ? [3.83,6.38,.45,2.99] : [-2.82,-.48,1.65,3.82]};
  }

  const grain=new THREE.TextureLoader().load('assets/textures/wood_floor/wood_floor_diff_1k.jpg');
  grain.colorSpace=THREE.SRGBColorSpace;
  grain.anisotropy=4;
  const openLegs = ['qingming','dragonboat','national'].includes(theme);
  const lacquered = theme==='spring' || theme==='lantern';
  const walnutTones = {
    spring:0x844d40, lantern:0x815756, qingming:0xe6bd91, dragonboat:0xc29a72,
    newyear:0x7e6273, qixi:0x8c7085, midautumn:0xa48267, national:0xa27959,
    lidong:0x8e6b52, dongzhi:0x837787
  };
  const timber=material(walnutTones[theme] || 0xa97f62,{map:grain,bumpMap:grain,bumpScale:.008,roughness:lacquered ? .38 : .60});
  const top=[[0,.809],[.46,.811],[.65,.838],[.68,.857],[.69,.887],[.686,.912],[.668,.925],[0,.925]];
  if(openLegs){
    for(const x of [-.39,.39]) for(const z of [-.24,.24]){
      const start=[x*1.32,.027,z*1.41], end=[x,.83,z];
      rod(start,end,.038,timber);
      cylinder(group,.046,.047,.035,brass,[start[0],.019,start[2]],18);
      sphere(group,.048,timber,[x,.73,z],[1,.68,1]);
    }
    for(const z of [-.30,.30]) box(group,[.89,.039,.036],timber,[0,.224,z]);
    box(group,[.036,.034,.64],timber,[0,.217,0]);
  } else {
    const stem = lacquered
      ? [[0,.012],[.43,.012],[.49,.044],[.49,.08],[.4,.095],[.32,.128],[.19,.213],
         [.195,.32],[.237,.421],[.226,.547],[.17,.65],[.22,.73],[.32,.796],[0,.809]]
      : [[0,.012],[.46,.012],[.51,.041],[.52,.067],[.493,.098],[.37,.10],[.283,.154],
         [.219,.229],[.175,.491],[.204,.676],[.26,.767],[.31,.80],[0,.809]];
    addMesh(group,new THREE.LatheGeometry(stem.map(([r,y])=>new THREE.Vector2(r,y)),56),timber);
    addMesh(group,new THREE.TorusGeometry(lacquered ? .484 : .515,.006,8,56),brass,[0,.061,0],[Math.PI/2,0,0]);
  }
  addMesh(group,new THREE.LatheGeometry(top.map(([r,y])=>new THREE.Vector2(r,y)),64),timber);
  addMesh(group,new THREE.TorusGeometry(.681,.004,8,60),brass,[0,.906,0],[Math.PI/2,0,0]);
  layTableRunner(group,theme,{addMesh,material});
  const surface=.93;
  const lathe=(points,mat,pos)=>addMesh(group,new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),48),mat,pos);
  const bowl=(x,z,r,mat=porcelain)=>lathe([[.04,0],[r*.4,.015],[r*.65,r*.17],[r*.98,r*.51],[r,r*.58],[r*.94,r*.59],[r*.85,r*.44],[r*.42,r*.14],[.01,r*.10]],mat,[x,surface,z]);
  const leaf=material(0x557b50,{roughness:.73});
  const persimmon=material(0xce6e24,{roughness:.55});
  function bouquet(willow, x, z, scale=1) {
    const vase=new THREE.Group();
    vase.position.set(x,surface,z);vase.scale.setScalar(scale);group.add(vase);
    const ceramic=material(willow?0xc6d4c4:0xa73c42,{map:glaze,bumpMap:glaze,bumpScale:.003,roughness:.34});
    const points=[[.09,0],[.16,.048],[.18,.21],[.128,.35],[.086,.46],[.101,.50],[.077,.50],[.07,.43]];
    addMesh(vase,new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),40),ceramic);
    addMesh(vase,new THREE.TorusGeometry(.095,.006,7,40),brass,[0,.491,0],[Math.PI/2,0,0]);
    const petal = new THREE.SphereGeometry(1,10,7);
    const clusters = new THREE.InstancedMesh(petal, material(willow?0x73935c:0xd83e55,{roughness:.76}), 5*4*(willow?2:5));
    const model = new THREE.Object3D();
    let index=0;
    for (let j=0;j<5;j++) {
      const a=j*2.40, base=new THREE.Vector3(0,.41,0);
      const tip=new THREE.Vector3(.42*Math.sin(a),1.07+(j%3)*.14,.32*Math.cos(a));
      const curve=new THREE.QuadraticBezierCurve3(base,new THREE.Vector3(.13*Math.sin(a),.95,.10*Math.cos(a)),tip);
      addMesh(vase,new THREE.TubeGeometry(curve,20,.009,6),walnut);
      for(let k=1;k<=4;k++){
        const point=curve.getPoint(.32+.16*k);
        const n=willow?2:5;
        for(let i=0;i<n;i++){
          const angle=i*2*Math.PI/n;
          if(willow){
            model.position.set(point.x+.033*Math.cos(angle+a),point.y-.055,point.z+.033*Math.sin(angle+a));
            model.rotation.set(-.30,a,.54*Math.cos(angle));
            model.scale.set(.024,.092,.011);
          } else {
            model.position.set(point.x+.022*Math.cos(angle),point.y+.021*Math.sin(angle),point.z-.015);
            model.rotation.set(0,.36*Math.sin(a),angle);
            model.scale.set(.033,.021,.012);
          }
          model.updateMatrix();
          clusters.setMatrixAt(index++,model.matrix);
        }
        if(!willow) sphere(vase,.012,brass,[point.x,point.y,point.z-.023]);
      }
    }
    vase.add(clusters);
  }
  // Traditional window crafts hang below the rail, clear of all twelve photo slots.
  const hanging=new THREE.Group();
  hanging.position.set(david ? 5.12 : (theme==='spring' ? 4.2 : .92),3.08,4.39);parent.add(hanging);
  if(theme==='spring'){
    const cord=material(theme==='spring'?0xa82932:0xc66535,{roughness:.72});
    rod([0,0,0],[0,-.20,0],.008,brass,hanging);
    for(const turn of [0,Math.PI/2]) {
      const thread=[];
      for(let i=0;i<=64;i++){
        const a=i*Math.PI/32;
        thread.push(new THREE.Vector3(.19*Math.sin(2*a+turn),-.43+.20*Math.sin(3*a),.034*Math.cos(3*a+turn)));
      }
      addMesh(hanging,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(thread,true),80,.022,7,true),cord);
    }
    sphere(hanging,.04,brass,[0,-.66,0]);
    cylinder(hanging,.023,.045,.21,cord,[0,-.79,0],20);
    const banners=new THREE.Group();
    banners.position.set(david ? -2.72 : -4.55,3.08,4.387);parent.add(banners);
    for (const [x, text] of (david ? [[0,'四时有喜'],[.48,'所行皆安']] : [[0,'岁岁平安'],[.48,'日日欢喜']])) {
      const paper=canvasTexture(144,512,(ctx,w,h)=>{
        const red=ctx.createLinearGradient(0,0,w,0);
        red.addColorStop(0,'#7e1d2b');red.addColorStop(.50,'#9b2d3a');red.addColorStop(1,'#7f2532');
        ctx.fillStyle=red;ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='#d6a360';ctx.lineWidth=2;ctx.strokeRect(10,11,w-20,h-22);
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 76px KaiTi, STKaiti, serif';
        ctx.fillStyle='#efc989';Array.from(text).forEach((letter,i)=>ctx.fillText(letter,w/2,102+i*101));
      });
      rod([x,0,0],[x,-.115,0],.007,brass,banners);
      box(banners,[.31,.019,.022],brass,[x,-.115,-.010]);
      addMesh(banners,new THREE.PlaneGeometry(.284,1.02),material(0xffffff,{map:paper,roughness:.84,side:THREE.DoubleSide}),[x,-.633,-.009],[0,Math.PI,0]);
      box(banners,[.305,.018,.023],brass,[x,-1.146,-.009]);
    }
  } else if(theme==='qingming' || theme==='dragonboat'){
    const kite=theme==='qingming';
    const brocade=new THREE.TextureLoader().load(kite ? 'assets/room/weave-qingming.webp' : 'assets/room/weave-dragonboat.webp');
    brocade.colorSpace=THREE.SRGBColorSpace;
    const cloth=material(0xffffff,{map:brocade,side:THREE.DoubleSide,roughness:.91});
    if(kite){
      rod([0,0,0],[0,-.23,0],.006,walnut,hanging);
      const wings=new THREE.Shape();
      wings.moveTo(0,-.23);wings.bezierCurveTo(-.12,-.37,-.26,-.46,-.43,-.382);
      wings.quadraticCurveTo(-.31,-.61,-.08,-.58);wings.lineTo(-.14,-.82);
      wings.lineTo(0,-.70);wings.lineTo(.14,-.82);wings.lineTo(.08,-.58);
      wings.quadraticCurveTo(.31,-.61,.43,-.382);wings.bezierCurveTo(.26,-.46,.12,-.37,0,-.23);
      const geometry=new THREE.ShapeGeometry(wings,22);
      const uv=geometry.attributes.uv, points=geometry.attributes.position;
      for(let i=0;i<uv.count;i++){
        uv.setXY(i,(points.getX(i)+.43)/.86,(points.getY(i)+.82)/.59);
        points.setZ(i,-.038+.11*Math.abs(points.getX(i)));
      }
      geometry.computeVertexNormals();
      addMesh(hanging,geometry,cloth);
      for(const side of [-1,1]) {
        rod([0,-.48,-.032],[side*.41,-.39,.011],.007,walnut,hanging);
        rod([side*.11,-.78,-.02],[side*.15,-1.01,-.02],.005,brass,hanging);
        box(hanging,[.037,.146,.008],cloth,[side*.16,-1.07,-.02],[0,0,side*.28]);
      }
      rod([0,-.24,-.01],[0,-.72,-.036],.007,walnut,hanging);
    }else{
      for(const [x,h] of [[-.19,.29],[.02,.45],[.20,.22]]){
        rod([0,0,0],[x,-h,0],.009,brass,hanging);
        addMesh(hanging,new THREE.OctahedronGeometry(.13,1),cloth,[x,-h-.11,0],[0,.5,-.09],[.9,1,.6]);
        cylinder(hanging,.017,.026,.14,silk,[x,-h-.28,0],12);
      }
    }
  } else if(theme==='midautumn' || theme==='qixi'){
    const orbit=theme==='midautumn';
    rod([0,0,0],[0,-.20,0],.007,brass,hanging);
    const loop=addMesh(hanging,new THREE.TorusGeometry(.238,.012,10,56),brass,[0,-.44,0]);
    if(orbit) {
      loop.scale.set(1,.85,1);
      sphere(hanging,.087,porcelain,[0,-.46,-.027],[1.04,.82,.41]);
      sphere(hanging,.060,porcelain,[.045,-.40,-.028],[1,.93,.52]);
      for(const [x,a] of [[.031,-.24],[.067,.15]]) {
        const ear=sphere(hanging,.034,porcelain,[x,-.33,-.028],[.49,1.76,.44]);ear.rotation.z=a;
      }
    } else {
      star(hanging,-.102,-.45,-.022,.074,brass);
      star(hanging,.094,-.39,-.028,.113,brass);
    }
    for(const [x,y] of [[-.16,-.56],[0,-.67],[.15,-.58]]){
      rod([x,y,0],[x,y-.16,0],.004,brass,hanging);
      sphere(hanging,.026,porcelain,[x,y-.17,0],[.78,1.36,.78]);
    }
  }
  if (theme==='newyear') {
    newYearClock(group,tools);
    ceramicCup(group,tools,{x:.34,z:-.28,r:.072,color:0xceb9b2,tea:0xba9059});
    const candle=[-.48,1.058,-.24];
    const candleGlass=new THREE.MeshPhysicalMaterial({
      color:0xe7ac66,roughness:.31,transparent:true,opacity:.60,side:THREE.DoubleSide,depthWrite:false
    });
    const holder=cylinder(group,.095,.093,.231,candleGlass,candle,28);
    holder.castShadow=false;
    cylinder(group,.101,.099,.028,brass,[-.48,.946,-.24],32);
    addMesh(group,new THREE.TorusGeometry(.093,.008,8,32),brass,[-.48,1.176,-.24],[Math.PI/2,0,0]);
    cylinder(group,.071,.071,.077,porcelain,[-.48,.999,-.24],28);
    const flame=material(0xffd0a0,{roughness:.78,emissive:0xffa556,emissiveIntensity:2.50});
    const wick=sphere(group,.032,flame,[-.48,1.072,-.24],[.62,1.28,.62]);
    wick.castShadow=false;
    makeLight('new-year-candle','座钟旁烛灯',flame,[-.48,1.17,-.295],2.10,wick);
    channels['new-year-candle'].fixtures.push(holder);
    const lit=material(0xffdfaa,{roughness:.36,emissive:0xffba63,emissiveIntensity:2.15});
    const littleStars=[];
    const ornament=new THREE.Group();
    ornament.position.set(.12,-.51,-.09);hanging.add(ornament);
    rod([0,0,0],[.12,-.52,-.09],.008,brass,hanging);
    for(let i=0;i<18;i++){
      const a=i*2.39996, reach=.25 + (i%5)*.041;
      const p=[reach*Math.cos(a),reach*Math.sin(a),.15*Math.sin(a*1.6)];
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(),new THREE.Vector3(p[0]*.62,p[1]*.52+.033,p[2]*.24),new THREE.Vector3(...p));
      addMesh(ornament,new THREE.TubeGeometry(curve,10,.007,5,false),brass);
      littleStars.push(i%3===0 ? star(ornament,...p,.033,lit) : sphere(ornament,.017,lit,p,[1,1,1]));
    }
    const sparkle=new THREE.PointLight(0xffca84,1.42,2.7,2);
    sparkle.position.set(.12,-.51,-.36); hanging.add(sparkle);
    channels['new-year-chandelier']={label:'窗边烟花灯',light:sparkle,material:lit,onIntensity:2.15,fixtures:littleStars};
  } else if (theme==='lantern') {
    const ricePaper=new THREE.TextureLoader().load('assets/room/weave-lantern.webp');
    ricePaper.colorSpace=THREE.SRGBColorSpace;
    const shade=material(0xffe1a2,{map:ricePaper,roughness:.79,emissive:0xffbc60,emissiveIntensity:.45});
    shade.emissiveMap=ricePaper;
    const hangingLamp=palaceLantern(hanging,tools,[0,-.57,-.07],.22,shade);
    rod([0,0,0],[0,-.19,-.07],.010,brass,hanging);
    const glow=new THREE.PointLight(0xffbf74,2.05,3.0,2);
    glow.position.set(0,-.55,-.33);hanging.add(glow);
    channels['palace-lantern']={label:'窗边六角宫灯',light:glow,material:shade,onIntensity:.45,fixtures:[hangingLamp.shade]};
    festivalSoup(group,tools,{x:-.12,z:-.04,r:.34,celadon:true});
    motion=festiveSteam(group,-.12,1.115,-.04);
    ceramicCup(group,tools,{x:.38,z:-.21,r:.076});
    for(const [x,z,a] of [[.37,.21,.3],[.42,.18,.22]]) box(group,[.032,.014,.31],walnut,[x,.955,z],[0,a,0]);
  } else if (theme==='spring') {
    const lantern=(x,z,height,size,idx)=>{
      const y=surface+height;
      cylinder(group,.105,.14,.055,brass,[x,surface+.028,z]);
      rod([x,surface,z],[x,y+.20,z],.018,brass);
      rod([x,y+.20,z],[x,y+.20,z-.23],.018,brass);
      const cloth=material(theme==='spring'?0xb33637:0xdab273,{roughness:.77,emissive:theme==='spring'?0xff5526:0xffbc54,emissiveIntensity:.47});
      const center=[x,y-size,z-.23];
      const shell=sphere(group,size,cloth,center,[1.05,1.12,1.05]);
      for(let j=0;j<10;j++){
        const a=j*Math.PI/5,points=[];
        for(let k=1;k<16;k++){
          const b=Math.PI*k/16;
          points.push(new THREE.Vector3(x+size*1.06*Math.sin(b)*Math.cos(a),center[1]+size*1.13*Math.cos(b),center[2]+size*1.06*Math.sin(b)*Math.sin(a)));
        }
        addMesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.005,4,false),brass);
      }
      for(const sign of [-1,1]) cylinder(group,size*.35,size*.35,.035,brass,[x,center[1]+sign*size*1.08,center[2]],20);
      rod([x,y+.18,z-.23],[x,center[1]+size*1.1,z-.23],.008,brass);
      cylinder(group,.019,.032,.14,silk,[x,center[1]-size*1.1-.08,center[2]],16);
      makeLight('lantern-'+idx,'花灯 '+idx,cloth,[x,center[1],center[2]-.22],1.15,shell);
    };
    lantern(-.31,.19,1.03,.235,1); lantern(.31,.21,.75,.174,2);
    bouquet(false,-.11,-.23,.63);
    for (const [x,z,a] of [[.18,-.28,.23],[.22,-.34,-.16]]) {
      box(group,[.155,.015,.25],silk,[x,.948,z],[0,a,0]);
      box(group,[.14,.004,.017],brass,[x,.957,z+.054],[0,a,0]);
    }
  } else if(theme==='midautumn'){
    const lunarRelief=canvasTexture(512,256,(ctx,w,h)=>{
      ctx.fillStyle='#c5c1b7';ctx.fillRect(0,0,w,h);
      for(let i=0;i<84;i++){
        const x=(i*413.82)%w,y=19+(i*227.2)%(h-38),r=4+(i%8)**1.31;
        const crater=ctx.createRadialGradient(x-r*.25,y+r*.2,0,x,y,r);
        crater.addColorStop(0,'rgba(61,62,64,.45)');
        crater.addColorStop(.65,'rgba(102,100,96,.22)');
        crater.addColorStop(.85,'rgba(249,244,228,.54)');
        crater.addColorStop(1,'rgba(249,244,228,0)');
        ctx.fillStyle=crater;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
    });
    const moon=material(0xf7dca6,{map:lunarRelief,bumpMap:lunarRelief,bumpScale:.019,roughness:.75,emissive:0xffcf82,emissiveIntensity:.60});
    moon.emissiveMap=lunarRelief;
    cylinder(group,.16,.21,.09,brass,[-.19,.97,.1]);
    const orb=sphere(group,.31,moon,[-.19,1.29,.1]);
    addMesh(group,new THREE.TorusGeometry(.288,.011,8,52),brass,[-.19,1.375,.1],[Math.PI/2-.42,0,.1]);
    addMesh(group,new THREE.TorusGeometry(.177,.014,8,48),brass,[-.19,1.005,.1],[Math.PI/2,0,0]);
    makeLight('moon','月球灯',moon,[-.19,1.38,-.19],1.6,orb);
    pastryPlate(group,tools,{x:.25,z:-.20});
    ceramicCup(group,tools,{x:.36,z:.22,r:.069,color:0xdcd3c2});
  } else if(theme==='qingming'){
    bouquet(true,-.19,.12,1.02);
    pastryPlate(group,tools,{x:.23,z:-.19,green:true});
  } else if(theme==='lidong'){
    const stoneware=material(0xa58f85,{map:glaze,bumpMap:glaze,bumpScale:.0035,roughness:.34});
    sphere(group,.222,stoneware,[-.19,1.115,.08],[1,.71,1]);
    addMesh(group,new THREE.TorusGeometry(.109,.025,12,36),stoneware,[-.407,1.13,.08],[0,0,.34],[.97,1.12,1]);
    const spout=new THREE.CubicBezierCurve3(new THREE.Vector3(-.015,1.103,.07),new THREE.Vector3(.15,1.096,.06),new THREE.Vector3(.095,1.21,.04),new THREE.Vector3(.19,1.25,.029));
    addMesh(group,new THREE.TubeGeometry(spout,24,.037,12,false),stoneware);
    cylinder(group,.099,.117,.035,stoneware,[-.19,1.266,.08],28);
    sphere(group,.028,brass,[-.19,1.300,.08],[1,.58,1]);
    cylinder(group,.23,.22,.035,walnut,[.26,.947,-.17],40);
    for(const [x,z] of [[.22,-.22],[.37,-.11],[.13,-.09]]) {
      sphere(group,.083,persimmon,[x,1.039,z],[1.08,.79,1]);
      const cap=sphere(group,.026,leaf,[x,1.101,z],[1,.40,1]);
      cap.rotation.y=x;
    }
    ceramicCup(group,tools,{x:.19,z:.27,r:.08,color:0xa9958f});
    motion=festiveSteam(group,.19,1.066,.27);
  } else if(theme==='dongzhi'){
    festivalSoup(group,tools,{x:-.08,z:-.05,r:.36});
    ceramicCup(group,tools,{x:.37,z:.20,r:.078,color:0xad859a,tea:0xa88163});
    motion=festiveSteam(group,-.08,1.125,-.05);
    const amber=material(0xe9c392,{roughness:.46,emissive:0xffa252,emissiveIntensity:.60});
    const x=-.44,z=.25;
    cylinder(group,.079,.095,.030,brass,[x,.946,z],24);
    const warmer=cylinder(group,.069,.071,.165,amber,[x,1.043,z],24);
    cylinder(group,.079,.079,.022,brass,[x,1.136,z],24);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      rod([x+.073*Math.cos(a),.959,z+.073*Math.sin(a)],[x+.073*Math.cos(a),1.13,z+.073*Math.sin(a)],.006,walnut);
    }
    makeLight('winter-warmer','冬至暖灯',amber,[x,1.092,z-.15],1.10,warmer);
  } else if(theme==='dragonboat'){
    dragonBoat(group,tools);
    bowl(.16,-.29,.22);
    for(let i=0;i<3;i++){
      const a=i*2.4,x=.16+.09*Math.cos(a),z=-.29+.08*Math.sin(a);
      const parcel=addMesh(group,new THREE.TetrahedronGeometry(.112),leaf,[x,1.045,z],[.28,i,.2]);
      const twine=material(0xd6c797,{roughness:.96});
      for(const tilt of [0,.82]){
        addMesh(parcel,new THREE.TorusGeometry(.065,.004,6,3),twine,[0,.005,0],[Math.PI/2,tilt,.1]);
      }
      rod([-.021,.027,-.043],[.045,.053,.031],.003,brass,parcel);
    }
  } else if(theme==='national'){
    // Three separate folded ridges in a lacquered landscape sculpture.
    for(let j=0;j<3;j++){
      const ridge=new THREE.Shape();
      ridge.moveTo(-.55,0);ridge.lineTo(-.55,.1);ridge.lineTo(-.36,.2+j*.09);ridge.lineTo(-.22,.15);
      ridge.lineTo(.04,.30+j*.16);ridge.lineTo(.19,.24);ridge.lineTo(.33,.31+j*.07);ridge.lineTo(.54,.12);ridge.lineTo(.54,0);ridge.closePath();
      addMesh(group,new THREE.ExtrudeGeometry(ridge,{depth:.025,bevelSize:.006,bevelThickness:.006,bevelSegments:1}),material([0x345650,0x64817c,0xbfa578][j]),[0,.96,-.18+j*.15]);
    }
    const stone=material(0xcbb9a5,{roughness:.84,map:grain});
    const roof=material(0x635b51,{roughness:.67});
    const walk=[[-.48,.99,-.34],[-.28,1.10,-.26],[-.06,1.13,-.22],[.20,1.19,-.22],[.49,1.11,-.32]];
    const wallPath=new THREE.CatmullRomCurve3(walk.map(p=>new THREE.Vector3(...p)));
    for(let i=0;i<22;i++){
      const t=i/21;
      const {x,y,z}=wallPath.getPoint(t);
      const heading=wallPath.getTangent(t);
      const angle=Math.atan2(-heading.z,heading.x);
      box(group,[.056,.063,.071],stone,[x,y,z],[0,angle,0]);
      if(i%2===0) box(group,[.024,.023,.077],stone,[x,y+.04,z],[0,angle,0]);
    }
    for(const [x,y,z] of [walk[1], walk[3]]){
      box(group,[.13,.14,.13],stone,[x,y+.025,z]);
      box(group,[.16,.036,.16],roof,[x,y+.107,z]);
      for(const dx of [-.059,.059]) box(group,[.022,.034,.155],stone,[x+dx,y+.132,z]);
    }
    const pennant=canvasTexture(240,160,(ctx,w,h)=>{
      ctx.fillStyle='#b33734';ctx.fillRect(0,0,w,h);
      const stars=[[.168,.213,.081,-Math.PI/2],[.282,.098,.025,2.45],[.326,.163,.025,2.75],[.325,.258,.025,3.16],[.283,.328,.025,3.61]];
      ctx.fillStyle='#eed07e';
      for(const [x,y,r,a] of stars) {
        ctx.beginPath();
        for(let i=0;i<10;i++){
          const angle=a+i*Math.PI/5,d=(i%2?.39:1)*r*h;
          ctx[i?'lineTo':'moveTo'](x*w+d*Math.cos(angle),y*h+d*Math.sin(angle));
        }
        ctx.closePath();ctx.fill();
      }
    });
    cylinder(group,.095,.105,.029,walnut,[.36,.946,-.34],32);
    rod([.36,.958,-.34],[.36,1.497,-.34],.007,brass);
    sphere(group,.017,brass,[.36,1.497,-.34]);
    const cloth=new THREE.PlaneGeometry(.36,.24,18,8);
    const v=cloth.attributes.position;
    for(let i=0;i<v.count;i++){
      const u=v.getX(i)+.18;
      v.setZ(i,u*.17*Math.sin(u*18));
      v.setY(i,v.getY(i)-u*.11);
    }
    cloth.computeVertexNormals();
    addMesh(group,cloth,material(0xffffff,{map:pennant,side:THREE.DoubleSide,roughness:.91}),[.18,1.354,-.34],[0,Math.PI,0]);
  } else if(theme==='qixi'){
    const bright=material(0xf4d896,{roughness:.32,metalness:.3,emissive:0xffcb86,emissiveIntensity:.8});
    const orrery=new THREE.Group();
    orrery.position.set(-.06,1.43,.02); orrery.rotation.y=.35;group.add(orrery);
    cylinder(group,.23,.28,.055,brass,[-.06,.958,.02],36);
    rod([-.06,.98,.02],[-.06,1.43,.02],.022,walnut);
    for(const [r,a,b] of [[.39,.44,.17],[.324,-.39,.93],[.278,.72,-.59]]){
      addMesh(orrery,new THREE.TorusGeometry(r,.012,10,60),brass,[0,0,0],[a,b,0]);
    }
    const gems=[sphere(orrery,.075,bright,[-.10,.06,-.12]),sphere(orrery,.055,bright,[.13,-.04,.14])];
    makeLight('festival-stars','双星灯',bright,[-.06,1.43,-.23],1.68,gems[0]);channels['festival-stars'].fixtures=gems;
    ceramicCup(group,tools,{x:-.37,z:-.21,r:.078,color:0xb4a6b9,tea:0x9c6551});
    ceramicCup(group,tools,{x:.32,z:-.25,r:.078,color:0xb1bbd0,tea:0x9c6551});
  }
  return {channels,motion,obstacle:david ? [4.31,5.93,-.13,1.49] : [-2.46,-.84,1.51,3.08]};
}
