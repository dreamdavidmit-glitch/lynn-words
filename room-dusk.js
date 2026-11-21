const duration = 100;
const clamp = value => Math.max(0, Math.min(1, value));
export const standingEye = 1.63;
const bottom=.0005,top=1710/2160-.0005,horizon=.373;
const left=670/4320+.0005,right=3280/4320-.0005;
const centre=(right+left)/2, horizontalScale=(right-left)/Math.PI;
const verticalScale=(top-bottom)*1.5/Math.PI; // Original 3:2 camera frame, before tiling.
const shoulder=.60;
const shoulderOffset=verticalScale*Math.asinh(Math.tan(shoulder));
const shoulderSlope=verticalScale/Math.cos(shoulder);
const poleSpan=Math.PI/2-shoulder;
// Room coordinates are metres. Register the photograph midway between the two windows.
export const captureX=-8.8;
export const villageRadius=285;

// Keep the same angular scale at every bearing. The conformal latitude
// preserves local shapes through the village, mountains and moon. Only the
// extreme top/bottom of the frame need easing to fit the finite photograph.
export function valleyLongitude(azimuth) {
  return centre-horizontalScale*Math.atan2(Math.sin(azimuth),Math.abs(Math.cos(azimuth)));
}

function valleyLatitude(el) {
  const a=Math.abs(el);
  let offset=verticalScale*Math.asinh(Math.tan(Math.min(a,shoulder)));
  if (a>shoulder) {
    const rest=(el>0 ? top-horizon : horizon-bottom)-shoulderOffset;
    const t=(a-shoulder)/poleSpan;
    const k=shoulderSlope*poleSpan/rest;
    offset+=rest*k*t/(1+(k-1)*t);
  }
  return horizon+Math.sign(el)*offset;
}

function rayUV(x,y,z) {
  return [valleyLongitude(Math.atan2(x,z)),valleyLatitude(Math.atan2(y,Math.hypot(x,z)))];
}

// Each vertical profile begins below the distant ridgeline and reaches full
// parallax before the rooftops. A continuous ray crosses an entire treetop
// even where forest from two depths overlaps in the original photograph.
const upperForest=[288,277,279,284,291,289,276,261,241,248,230,216,215];
const lowerForest=[383,380,382,383,380,365,345,347,355,357,366,370,361];
function terrainWeight(uv) {
  const col=clamp((uv[0]-left)/(right-left))*(upperForest.length-1);
  const i=Math.min(Math.floor(col),upperForest.length-2),t=col-i;
  const top=upperForest[i]+(upperForest[i+1]-upperForest[i])*t;
  const bottom=lowerForest[i]+(lowerForest[i+1]-lowerForest[i])*t;
  const row=(1-uv[1]/(1710/2160))*720;
  const blend=clamp((row-top)/(bottom-top));
  return blend*blend*(3-2*blend);
}

export function valleyLayers(ray,eye) {
  const x=eye.x-captureX,y=eye.y-standingEye,z=eye.z;
  const length=Math.hypot(ray.x,ray.y,ray.z);
  const dx=ray.x/length,dy=ray.y/length,dz=ray.z/length;
  const b=x*dx+y*dy+z*dz;
  const travel=Math.sqrt(b*b+villageRadius*villageRadius-x*x-y*y-z*z)-b;
  const nx=(x+travel*dx)/villageRadius,ny=(y+travel*dy)/villageRadius,nz=(z+travel*dz)/villageRadius;
  const far=rayUV(dx,dy,dz),coverage=terrainWeight(far);
  const photo=rayUV(dx+(nx-dx)*coverage,dy+(ny-dy)*coverage,dz+(nz-dz)*coverage);
  return {far,photo,coverage};
}

export const valleyProjection = `
  vec2 valleyUV(vec3 ray) {
    float az=atan(ray.x,max(abs(ray.z),.000001));
    float el=atan(ray.y,max(length(ray.xz),.000001));
    float a=abs(el);
    float offset=${verticalScale}*asinh(tan(min(a,${shoulder})));
    if(a>${shoulder}) {
      float rest=(el>0. ? ${top-horizon} : ${horizon-bottom})-${shoulderOffset};
      float t=(a-${shoulder})/${poleSpan};
      float k=${shoulderSlope*poleSpan}/rest;
      offset+=rest*k*t/(1.+(k-1.)*t);
    }
    return vec2(${centre}-${horizontalScale}*az,${horizon}+sign(el)*offset);
  }
  vec2 terrainUV(vec3 ray,vec3 eye,vec2 farUV) {
    const float upper[${upperForest.length}]=float[${upperForest.length}](${upperForest.map(n=>n.toFixed(1)).join(',')});
    const float lower[${lowerForest.length}]=float[${lowerForest.length}](${lowerForest.map(n=>n.toFixed(1)).join(',')});
    float col=clamp((farUV.x-${left})/${right-left},0.,1.)*${upperForest.length-1}.0;
    int i=min(int(floor(col)),${upperForest.length-2});
    float t=col-float(i);
    float row=(1.-farUV.y/${1710/2160})*720.;
    float weight=smoothstep(mix(upper[i],upper[i+1],t),mix(lower[i],lower[i+1],t),row);
    float b=dot(eye,ray);
    float travel=sqrt(b*b+${villageRadius*villageRadius}.0-dot(eye,eye))-b;
    return valleyUV(mix(ray,(eye+travel*ray)/${villageRadius}.0,weight));
  }
`;

export function duskSun(phase) {
  return {azimuth:.345-.079*phase,elevation:.396-.465*phase};
}

// Skyline measured on the native dusk plate at 900 × 540.
const ridge=[[0,215],[25,205],[44,208],[66,202],[91,207],[117,202],[141,202],
  [163,196],[183,187],[204,197],[225,197],[250,187],[272,194],[297,201],
  [318,208],[350,202],[375,212],[408,212],[441,205],[466,207],[496,212],
  [519,209],[548,196],[568,189],[591,177],[608,178],[637,165],[665,175],
  [688,172],[709,179],[734,168],[752,171],[775,161],[789,162],[812,151],
  [833,157],[851,152],[873,158],[888,154],[900,160]];
const ridgeU=x=>670/4320+(2610/4320)*x/900;
const ridgeV=y=>(1710/2160)*(1-y/540);

export function sunlightAboveRidge(azimuth,elevation) {
  const u=valleyLongitude(azimuth);
  const x=Math.max(0,Math.min(900,(u-ridgeU(0))/(ridgeU(900)-ridgeU(0))*900));
  const right=ridge.findIndex(([px])=>px>=x);
  const [x1,y1]=ridge[Math.max(0,right-1)], [x2,y2]=ridge[right];
  const y=y1+(y2-y1)*(x-x1)/Math.max(1,x2-x1);
  const clearance=valleyLatitude(elevation)-ridgeV(y);
  const t=clamp((clearance+.009)/.020);
  return t*t*(3-2*t);
}

export function valleyTerrain(canvasTexture) {
  return canvasTexture(1080,540,(ctx,w,h)=>{
    ctx.fillStyle='#000';ctx.fillRect(0,0,1080,540);
    ctx.filter='blur(3px)';
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.moveTo(0,h*(1-ridgeV(ridge[0][1])));
    ridge.forEach(([x,y])=>ctx.lineTo(w*ridgeU(x),h*(1-ridgeV(y))));
    ctx.lineTo(w,h*(1-ridgeV(ridge.at(-1)[1])));
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
  });
}

export function mountDuskControl(tools, saved, update, save) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let phase = clamp(Number(saved?.phase) || 0);
  let playing = !reduced && saved?.playing !== false && phase < 1;
  const control = document.createElement('div');
  control.className = 'room-dusk-control';
  control.innerHTML = `<button type="button" class="room-light-trigger" data-room-dusk-trigger aria-expanded="false" aria-label="窗景时间">窗景</button>
    <div class="room-dusk-panel" hidden>
      <label>窗景时间<input type="range" min="0" max="100" step="1" value="0" data-room-dusk-range></label>
      <div class="room-dusk-labels"><span>夕阳</span><span>暮光</span><span>夜色</span></div>
      <button type="button" data-room-dusk-play>暂停</button>
    </div>`;
  tools.appendChild(control);
  const trigger = control.querySelector('[data-room-dusk-trigger]');
  const panel = control.querySelector('.room-dusk-panel');
  const range = control.querySelector('input');
  const play = control.querySelector('[data-room-dusk-play]');
  let displayed = -1, following = null;
  const status = now => now < .32 ? '夕阳' : now < .80 ? '暮光' : '夜色';
  function paint() {
    const now=following??phase,label=status(now);
    update(now,label);
    const percent = Math.round(now*100);
    if (percent === displayed) return;
    displayed = percent;
    trigger.textContent = (following===null?'窗景 · ':'共看 · ') + label;
    range.value = String(percent);
    range.setAttribute('aria-valuetext',label+' '+percent+'%');
    play.textContent = playing ? '暂停' : phase === 1 ? '重看日落' : '继续播放';
  }
  function persist() { save({phase,playing}); }
  function setPanel(open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded',String(open));
  }
  function toggle() { setPanel(panel.hidden); }
  function dismiss(event) { if (!control.contains(event.target)) setPanel(false); }
  function seek() {
    playing = false;
    phase = clamp(Number(range.value)/100);
    displayed = -1;
    paint();
    persist();
  }
  function togglePlay() {
    if (phase === 1) phase = 0;
    playing = !playing;
    displayed = -1;
    paint();
    persist();
  }
  function escapePanel(event) {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.stopPropagation();
    setPanel(false);
    trigger.focus();
  }
  trigger.addEventListener('click',toggle);
  range.addEventListener('input',seek);
  play.addEventListener('click',togglePlay);
  control.addEventListener('keydown',escapePanel);
  document.addEventListener('pointerdown',dismiss);
  paint();
  return {
    follow(value){
      if(following===value)return;
      if(following===null){range.disabled=play.disabled=true;displayed=-1;}
      following=clamp(value);paint();
    },
    release(){
      if(following===null)return;
      following=null;range.disabled=play.disabled=false;displayed=-1;paint();
    },
    step(seconds) {
      if(following!==null)return;
      if (!playing || !seconds) return;
      phase = clamp(phase+seconds/duration);
      if (phase === 1) { playing = false; displayed = -1; persist(); }
      paint();
    },
    persist,
    destroy() {
      persist();
      document.removeEventListener('pointerdown',dismiss);
    }
  };
}
