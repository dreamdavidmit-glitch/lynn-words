import * as THREE from './vendor/three/three.module.min.js';

import { valleyLongitude } from './room-dusk.js';
import { buildMist } from './room-mist.js';

const loopTime = 19.8;
const launches = [
  {at:.20, x:-5.25, y:12.55, z:38.5, duration:1.03, spread:5.6, tint:0xffc979, willow:true},
  {at:3.15, x:12.2, y:15.1, z:44, duration:1.16, spread:4.8, tint:0xffdeb0},
  {at:5.05, x:-13.2, y:16, z:43.5, duration:1.08, spread:5.7, tint:0xefadbf,ring:true},
  {at:7.36, x:3.6, y:11.8, z:35, duration:.96, spread:4.0, tint:0xffd599},
  {at:10.67,x:-6.9,y:14.3,z:39,duration:1.10,spread:5.4,tint:0xffc37b,willow:true},
  {at:11.65,x:14.3,y:15.8,z:46,duration:1.15,spread:5.3,tint:0xc6b8ec,ring:true},
  {at:14.12,x:1.4,y:16.6,z:45,duration:1.21,spread:5.5,tint:0xffd696,willow:true}
];

function buildBuffer(capacity, points) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity*3), shades = new Float32Array(capacity*4);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('sparkShade', new THREE.BufferAttribute(shades,4).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false,
    uniforms:{pixels:{value:600}},
    vertexShader:`
      attribute vec4 sparkShade;
      uniform float pixels;
      varying vec4 vSpark;
      void main(){
        vec4 view=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*view;
        ${points ? 'gl_PointSize=clamp(pixels * (0.23 + 0.52*sparkShade.a) / -view.z,2.0,13.0);' : ''}
        vSpark=sparkShade;
      }`,
    fragmentShader:`
      varying vec4 vSpark;
      void main(){
        ${points ? `float radius = length(gl_PointCoord * 2.0 - 1.0);
        float lens = 0.82 * exp(-radius * radius * 7.3) + 0.18 * exp(-radius * radius * 2.8);
        gl_FragColor = vec4(mix(vSpark.rgb,vec3(1.0,0.96,0.86),0.30*(1.0-radius)),vSpark.a*lens*(1.0-smoothstep(.78,1.0,radius)));` :
        'gl_FragColor = vSpark;'}
        #include <colorspace_fragment>
      }`
  });
  const object=points ? new THREE.Points(geometry,material) : new THREE.LineSegments(geometry,material);
  object.frustumCulled=false;
  return {object, positions, shades, size:0};
}

export function buildHarborFireworks(room, scene, harborUniforms, mobile) {
  const count=mobile ? 72 : 108;
  const tailSteps=mobile ? 4 : 6;
  const lines=buildBuffer(count*tailSteps*2*3,false);
  const heads=buildBuffer(count*3+12,true);
  lines.object.renderOrder=-3;
  heads.object.renderOrder=-2;
  room.add(lines.object, heads.object);
  const smoke=buildMist(room,25,-4);
  const ember=new THREE.Color(0xffa25e);
  const particleTint=new THREE.Color();
  // A small amount of the distant light comes through the glass.
  const spill=new THREE.RectAreaLight(0xffc590,0,8.5,4.4);
  spill.position.set(0,3.4,4.46);
  spill.lookAt(0,1.6,-4.2);
  scene.add(spill);

  const bursts=launches.map((item,index) => {
    const dispersal = Array.from({length:count},(_,i)=>{
      // Fibonacci directions cover one sphere without concentric screen-space rings.
      const rise=1-2*(i+.5)/count;
      const radial=Math.sqrt(1-rise*rise);
      const angle=i*2.399963+index*.78;
      const speed=item.spread*(.71+.29*(.5+.5*Math.sin(i*129.13+index)));
      const ringAngle=i/count*Math.PI*2;
      const ringSpeed=item.spread*(.93+.068*Math.sin(i*37.43));
      const inRing=item.ring && i%5!==0;
      return {
        x:inRing ? Math.cos(ringAngle)*ringSpeed : Math.cos(angle)*radial*speed,
        y:inRing ? Math.sin(ringAngle)*ringSpeed*.87 : rise*speed,
        z:inRing ? Math.sin(ringAngle)*ringSpeed*.41 : Math.sin(angle)*radial*speed*.82,
        life:(item.willow ? 2.35 : item.ring ? 1.84 : 1.68) + .43*Math.sin(i*6.532+index*3),
        flicker:.6+.4*Math.sin(i*36.17)**2
      };
    });
    return {...item, color:new THREE.Color(item.tint), dispersal};
  });

  function add(buffer,x,y,z,color,alpha) {
    const index=buffer.size++;
    const pos=index*3, rgba=index*4;
    buffer.positions[pos]=x; buffer.positions[pos+1]=y; buffer.positions[pos+2]=z;
    buffer.shades[rgba]=color.r;buffer.shades[rgba+1]=color.g;buffer.shades[rgba+2]=color.b;
    buffer.shades[rgba+3]=alpha;
  }
  function setCounts(buffer) {
    const geo=buffer.object.geometry;
    geo.setDrawRange(0,buffer.size);
    if (buffer.size) {
      geo.attributes.position.needsUpdate=true;
      geo.attributes.sparkShade.needsUpdate=true;
    }
  }
  function comet(burst,age) {
    const t=THREE.MathUtils.clamp(age/burst.duration,0,1);
    const progress=t*(1.65-.65*t);
    return {x:burst.x+(t-1)*.84,y:1.3+(burst.y-1.3)*progress,z:burst.z+(1-t)*2.2};
  }
  function spark(burst,path,age,buffer,alpha) {
    const drag=burst.willow ? .58 : .97;
    const travel=(1-Math.exp(-drag*age))/drag;
    const gravity=burst.willow ? 1.42 : 1.06;
    const cooling=THREE.MathUtils.smoothstep(age,.57,path.life);
    particleTint.copy(burst.color).lerp(ember,cooling*.75);
    add(buffer,burst.x+path.x*travel+.10*age*age,burst.y+path.y*travel-gravity*age*age,
      burst.z+path.z*travel,particleTint,alpha);
  }
  function update(elapsed, animate, darkness = 0) {
    const clock=animate ? elapsed%loopTime : 1.90;
    lines.size=heads.size=0;
    smoke.reset();
    let glow=0, lightX=0;
    let reflections=0;
    for (const flash of harborUniforms) flash.set(0,0,0,0);
    for (const burst of bursts) {
      const age=clock-burst.at;
      if(age<0 || age>burst.duration+4.05) continue;
      if(age<burst.duration) {
        const center=comet(burst,age);
        add(heads,center.x,center.y,center.z,burst.color,.96);
        for(let i=0;i<tailSteps;i++){
          const a=comet(burst,age-i*.043),b=comet(burst,age-(i+1)*.043);
          if(age>i*.043) {
            add(lines,a.x,a.y,a.z,burst.color,.64*(1-i/tailSteps));
            add(lines,b.x,b.y,b.z,burst.color,.58*(1-(i+1)/tailSteps));
          }
        }
        continue;
      }
      const time=age-burst.duration;
      const flash=Math.exp(-time*4.3)*Math.min(1,time/.13);
      glow+=flash;
      lightX+=flash*burst.x/burst.z;
      const smokeFade=THREE.MathUtils.smoothstep(time,.16,.86)*(1-THREE.MathUtils.smoothstep(time,1.30,4.05));
      for(let i=0;i<5;i++){
        const spread=1-Math.exp(-time*1.14);
        const a=i*2.399963+burst.x;
        smoke.add(burst.x+Math.cos(a)*1.72*spread+time*.29,
          burst.y+Math.sin(a)*.78*spread+time*.12,burst.z+Math.sin(a)*1.60*spread,
          .85+time*.67+i*.22,(.078+flash*.23)*smokeFade, i*91.17+time*.61);
      }
      if(time<2.25 && reflections<harborUniforms.length) {
        const u=valleyLongitude(Math.atan2(burst.x,burst.z));
        harborUniforms[reflections++].set(u,flash*.16 + .021*Math.max(0,1-time/2),clock,burst.color.g);
      }
      for(const path of burst.dispersal) {
        if(time>path.life) continue;
        const lifespan=time/path.life;
        const opening=THREE.MathUtils.smoothstep(time,.015,.12);
        const flicker=1-(.23+.11*Math.sin(time*24+path.x*9))*lifespan;
        const alpha=opening*Math.pow(1-lifespan,burst.willow ? .88 : 1.24)*flicker*path.flicker;
        spark(burst,path,time,heads,Math.min(1,alpha*1.34));
        const spacing=burst.willow ? .081 : .054;
        for(let i=0; i<tailSteps && time>i*spacing; i++){
          const a=time-i*spacing,b=Math.max(0,a-spacing);
          spark(burst,path,a,lines,Math.min(1,alpha*1.23)*(1-i/tailSteps)**1.28);
          spark(burst,path,b,lines,Math.min(1,alpha*1.23)*(1-(i+1)/tailSteps)**1.28);
        }
      }
    }
    spill.intensity=animate ? Math.min(glow,.96) * (.35-.17*darkness) : 0;
    spill.position.x=glow>.003 ? 4.46*lightX/glow : 0;
    spill.lookAt(spill.position.x*.5,1.6,-4.2);
    smoke.flush();
    setCounts(lines);setCounts(heads);
  }
  return {update, resize(height){heads.object.material.uniforms.pixels.value=height;smoke.resize(height);}};
}
