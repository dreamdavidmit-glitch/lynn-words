import * as THREE from './vendor/three/three.module.min.js';
import { valleyLayers } from './room-dusk.js';

export const valleyBounds = new THREE.Vector4(670/4320,0,3280/4320,1710/2160);
// The generated views all use the same camera. Weather and the outdoor
// decorations still vary with the room; no change of terrain on a theme switch.
const looks = {
  everyday:['dusk','night',0,0xFFFFFF], spring:['night',null,.13,0xffdcbe],
  lantern:['night',null,.04,0xa9b9f1], qingming:['green',null,.24,0xc3d8dd],
  dragonboat:['green',null,.07,0xffedcb], qixi:['night',null,.05,0xc3a4e7],
  midautumn:['night',null,.10,0xe9c8ac], national:['dusk',null,.07,0xffd3a5],
  lidong:['frost',null,.13,0xc2d9ee], dongzhi:['snow',null,.14,0xc2c6ed],
  christmas:['snow',null,0,0xffffff], newyear:['night',null,.08,0xb1a6d3]
};

const tileCount = 3;
const slots = 4;
const tileGutter = '.00625,.011111111';
const asset = (look,suffix) => `assets/room/photo-valley/${look}-${suffix}.webp?v=sr1`;
export const valleyTilesShader = `
  uniform sampler2D valleyPreview, valleyAfter;
  uniform float valleyPreviewReady, valleyAfterReady;
  uniform vec4 valleyBounds;
  uniform vec3 valleyHaze;
  uniform float valleyHazeAmount;
  vec2 valleyTileUV(vec2 uv) {
    return (uv-valleyBounds.xy)/(valleyBounds.zw-valleyBounds.xy);
  }
  #ifdef VALLEY_UHD
  ${Array.from({length:slots},(_,i) => `uniform sampler2D landscape${i}; uniform vec4 tilePlacement${i};`).join('\n')}
  vec3 addValleyTile(vec3 base,vec2 uv,vec2 dx,vec2 dy,sampler2D photo,vec4 tilePlacement,float phase) {
    if (tilePlacement.z<.001) return base;
    const vec2 gutter = vec2(${tileGutter});
    const vec2 core = 1.0-2.0*gutter;
    vec2 p = 3.0*uv-tilePlacement.xy;
    if (any(lessThan(p,vec2(-.006))) || any(greaterThan(p,vec2(1.006)))) return base;
    vec2 firstEdge = step(tilePlacement.xy,vec2(0.0));
    vec2 lastEdge = step(vec2(2.0),tilePlacement.xy);
    vec2 w = smoothstep(mix(vec2(-.005),vec2(0.0),firstEdge),vec2(.005),p) *
      (1.0-smoothstep(vec2(.995),mix(vec2(1.005),vec2(1.0),lastEdge),p));
    float weight = mix(1.0-phase,phase,tilePlacement.w)*tilePlacement.z*w.x*w.y;
    if (weight<.001) return base;
    vec3 detail = textureGrad(photo,p*core+gutter,dx*3.0*core,dy*3.0*core).rgb;
    vec3 preview = tilePlacement.w<.5 ? textureGrad(valleyPreview,uv,dx,dy).rgb : textureGrad(valleyAfter,uv,dx,dy).rgb;
    // Add only the detail belonging to this exposure. The day/night crossfade
    // therefore keeps the same color while tiles come and go.
    return max(vec3(0.0),base+(detail-preview)*weight);
  }
  #endif
  vec3 valleyPhoto(vec2 p,float phase,vec2 dx,vec2 dy) {
    vec3 first=textureGrad(valleyPreview,p,dx,dy).rgb;
    vec3 last=valleyAfterReady>.5 ? textureGrad(valleyAfter,p,dx,dy).rgb : first*vec3(.24,.29,.47);
    vec3 full=mix(first,last,phase);
    #ifdef VALLEY_UHD
    if (valleyPreviewReady>.5) {
      ${Array.from({length:slots},(_,i) => `full=addValleyTile(full,p,dx,dy,landscape${i},tilePlacement${i},phase);`).join('\n')}
    }
    #endif
    return full;
  }
`;

export function makeValleyTiles(loader, theme, quality) {
  const [first, after, haze, tint] = looks[theme] || looks.everyday;
  const pending = new Set(), failed = new Set();
  const active = Array.from({length:slots}, () => ({key:null,tex:null,coord:new THREE.Vector4(-10,-10,0,0),started:0}));
  let dead=false, overviewReady=false, wanted=[], nextCheck=0;
  const overviewDone = {value:0}, afterDone = {value:0};
  let afterTexture = null;
  const sampleRay=new THREE.Vector3();
  const tune = t => { t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=quality.anisotropy; return t; };
  const previewSize = quality.uhd ? 'overview' : 'preview';
  const preview = tune(new THREE.Texture());
  const uniforms = {
    valleyPreview:{value:preview}, valleyAfter:{value:preview},
    valleyPreviewReady:overviewDone, valleyAfterReady:afterDone, valleyBounds:{value:valleyBounds},
    valleyHazeAmount:{value:haze}, valleyHaze:{value:new THREE.Color(tint)}
  };
  active.forEach((slot,i) => {
    uniforms['landscape'+i]={value:preview};
    uniforms['tilePlacement'+i]={value:slot.coord};
  });
  let cancelBase=null, loadingBase=false;
  function loadBase(size) {
    loadingBase=true;
    const report=(state, fraction=null)=>quality.onBackdrop?.({state,fraction});
    const url = new URL(loader.manager.resolveURL(asset(first,size)), document.baseURI);
    let transfer=null, temporaryURL=null, timer, settled=false;
    const release=()=>{
      clearTimeout(timer);
      if (temporaryURL) URL.revokeObjectURL(temporaryURL);
    };
    const done = image => {
      if (settled || dead) return;
      settled=true;
      release();
      cancelBase=null;
      loadingBase=false;
      if (image) {
        preview.image=image;
        preview.needsUpdate=true;
        overviewReady=true;
        overviewDone.value=1;
        report('ready',1);
      } else if (size==='overview') loadBase('preview');
      else report('error');
    };
    const decode = src => {
      const image=new Image();
      timer=setTimeout(()=>done(null),20000);
      image.onload=()=>done(image.naturalWidth ? image : null);
      image.onerror=()=>done(null);
      image.src=src;
    };
    cancelBase=()=>{
      settled=true;
      transfer?.abort();
      release();
    };
    report('loading');
    if (!['http:','https:'].includes(url.protocol) || typeof XMLHttpRequest==='undefined') {
      decode(url.href);
      return;
    }
    transfer=new XMLHttpRequest();
    transfer.open('GET',url.href);
    transfer.responseType='blob';
    transfer.timeout=60000;
    transfer.onprogress=event=>report('loading',event.lengthComputable && event.total>0
      ? Math.min(.98,event.loaded/event.total) : null);
    transfer.onerror=transfer.ontimeout=()=>done(null);
    transfer.onload=()=>{
      if (settled) return;
      if (transfer.status<200 || transfer.status>=300 || !transfer.response?.size) { done(null); return; }
      try {
        temporaryURL=URL.createObjectURL(transfer.response);
        report('decoding',.99);
        decode(temporaryURL);
      } catch (_) { done(null); }
    };
    try { transfer.send(); } catch (_) { done(null); }
  }
  const retry=()=>{ if (!dead && !loadingBase && !overviewReady) loadBase(previewSize); };
  queueMicrotask(retry);
  const forget = i => {
    const s=active[i];
    s.tex?.dispose();
    s.key=s.tex=null;
    s.coord.z=0;
    uniforms['landscape'+i].value=preview;
  };
  const request = entry => {
    pending.add(entry.key);
    const finish = () => pending.delete(entry.key);
    tune(loader.load(asset(entry.look,`4k-${entry.y}-${entry.x}`), tex => {
      finish();
      if (dead || !wanted.some(x => x.key===entry.key)) { tex.dispose(); return; }
      const i=active.findIndex(s=>!s.key);
      if (i<0) { tex.dispose(); return; }
      const s=active[i];
      s.key=entry.key; s.tex=tex; s.started=performance.now();
      s.coord.set(entry.x,entry.y,0,entry.look===after ? 1 : 0);
      uniforms['landscape'+i].value=tex;
    },undefined,() => { finish(); failed.add(entry.key); }));
  };
  return {
    uniforms, enabled:quality.tiles, retry,
    get ready() { return overviewReady; },
    update(camera, phase, now) {
      if (dead || !overviewReady) return;
      if (after && phase>.025 && !afterTexture) {
        afterTexture=tune(loader.load(asset(after,previewSize),() => {
          if (dead) return;
          uniforms.valleyAfter.value=afterTexture;
          afterDone.value=1;
        }));
      }
      if (!quality.tiles) return;
      for (const s of active) if (s.key) s.coord.z=Math.min(1,(now-s.started)/220);
      if (now<nextCheck) return;
      nextCheck=now+180;
      const halfHeight=Math.tan(camera.getEffectiveFOV()*Math.PI/360);
      const halfWidth=halfHeight*camera.aspect;
      const hit=new Map();
      const look=afterDone.value && phase>.67 ? after : first;
      function countTile([su,sv],locationWeight) {
        const u=(su-valleyBounds.x)/(valleyBounds.z-valleyBounds.x);
        const v=(sv-valleyBounds.y)/(valleyBounds.w-valleyBounds.y);
        if(u<0 || u>=1 || v<0 || v>=1) return;
        const col=Math.floor(tileCount*u),row=Math.floor(tileCount*v);
        const key=`${look}:${row}:${col}`;
        const ground=1-THREE.MathUtils.smoothstep(sv,.43,.55);
        const entry=hit.get(key) || {key,look,x:col,y:row,weight:0};
        entry.weight+=locationWeight*(1+ground*1.6)*(active.some(s=>s.key===key) ? 1.13 : 1);
        hit.set(key,entry);
      }
      for (const y of [-.94,-.70,-.38,0,.38,.70,.94]) {
        for (const sx of [-.96,-.72,-.48,-.24,0,.24,.48,.72,.96]) {
          const ray=sampleRay.set(sx*halfWidth,y*halfHeight,-1).applyQuaternion(camera.quaternion).normalize();
          const {photo}=valleyLayers(ray,camera.position);
          const locationWeight=1.01-.62*(sx*sx+y*y)*.5;
          countTile(photo,locationWeight);
        }
      }
      wanted=[...hit.values()].filter(x=>!failed.has(x.key)).sort((a,b) => b.weight-a.weight).slice(0,slots);
      for (let i=0;i<slots;i++) {
        const s=active[i];
        if (s.key && !wanted.some(x => x.key===s.key)) forget(i);
      }
      for (const e of wanted) {
        if (pending.size>=2) break;
        if (!pending.has(e.key) && !active.some(s=>s.key===e.key)) request(e);
      }
    },
    dispose() {
      dead=true;
      cancelBase?.();
      preview.dispose();
      afterTexture?.dispose();
      active.forEach((_,i)=>forget(i));
    }
  };
}
