import * as THREE from './vendor/three/three.module.min.js';

// A few soft, view-facing puffs share one draw call and still respect the scene depth.
export function buildMist(room, count, order=0) {
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(count*3);
  const puffs=new Float32Array(count*3);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('puff',new THREE.BufferAttribute(puffs,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{height:{value:600}},
    vertexShader:`
      attribute vec3 puff;
      uniform float height;
      varying vec2 vPuff;
      void main(){
        vec4 view=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(.5 * height * projectionMatrix[1][1] * puff.x / max(.08,-view.z),1.0,122.0);
        vPuff=puff.yz;
      }`,
    fragmentShader:`
      varying vec2 vPuff;
      void main() {
        vec2 p=gl_PointCoord*2.0-1.0;
        float sway=.19*sin(p.y*4.2+vPuff.y);
        p.x=(p.x+sway)*(1.15+.31*cos(vPuff.y));
        float r=dot(p,p);
        float curl=.68+.32*sin(6.0*p.y-4.0*p.x+vPuff.y);
        float fade=exp(-r*3.45)*(1.0-smoothstep(.48,1.0,r));
        gl_FragColor=vec4(0.62,0.59,0.55,vPuff.x*fade*curl);
        #include <colorspace_fragment>
      }`
  });
  const mist=new THREE.Points(geometry,material);
  mist.renderOrder=order;
  mist.frustumCulled=false;
  room.add(mist);
  let used=0;
  return {
    reset(){used=0;},
    add(x,y,z,size,opacity,seed){
      if(used>=count || opacity<=0) return;
      const i=used++*3;
      positions[i]=x;positions[i+1]=y;positions[i+2]=z;
      puffs[i]=size;puffs[i+1]=opacity;puffs[i+2]=seed;
    },
    flush(){
      geometry.setDrawRange(0,used);
      if(used){
        geometry.attributes.position.needsUpdate=true;
        geometry.attributes.puff.needsUpdate=true;
      }
    },
    resize(height){material.uniforms.height.value=height;}
  };
}
