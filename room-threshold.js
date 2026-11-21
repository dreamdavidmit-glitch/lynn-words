import * as T from './vendor/three/three.module.min.js';
import {davidRoomX,hallZ,suiteZone} from './room-suite.js';

const rooms=['lynn','david'], name=r=>r==='lynn'?'Lynn':'David';
const uid=()=>globalThis.crypto?.randomUUID?.() || 'mark-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export function mountThreshold({scene,stage,hud,canvas,box,camera,snow,shared,change,gesture,send,previewInk,peer,shadow}){
  const doors={},walls={},buttons=document.createElement('div');
  buttons.className='room-threshold-tools';
  const style=document.createElement('style');
  style.textContent=`
    .room-threshold-tools{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto}
    .room-threshold-tools button{min-height:40px;white-space:nowrap;padding:5px 14px;border:1px solid #ffffff77;border-radius:18px;color:white;background:#382d40ec;cursor:pointer}
    .room-3d-hud .room-direct-ink-hint{bottom:122px}
    .room-3d-hud .room-direct-ink-hint[hidden]{display:none}
    .room-3d-canvas.is-inking{cursor:crosshair}
    .room-threshold-tools [hidden]{display:none}
    .room-bell-note{position:absolute;top:22%;left:50%;transform:translateX(-50%);background:#382d40df;color:#fff;padding:6px 14px;border-radius:20px;font:14px system-ui;pointer-events:none}
    .room-glass-editor{width:min(90vw,560px);max-height:90dvh;overflow:auto;padding:16px;border:1px solid #fff9;border-radius:20px;background:#293341;color:#fff;font:15px system-ui}
    .room-glass-editor::backdrop{background:#18203475}.room-glass-editor canvas{display:block;width:100%;height:auto;max-height:52dvh;touch-action:none;cursor:crosshair;border-radius:10px;background:linear-gradient(150deg,#365069,#1a2939 65%,#6e563f)}
    .room-glass-editor footer{display:flex;justify-content:space-between;margin-top:8px}.room-glass-editor button{padding:8px 16px;border-radius:12px;border:0}
  `;
  stage.append(style);hud.append(buttons);
  const action=(label,call)=>{const b=document.createElement('button');b.type='button';b.hidden=true;b.textContent=label;b.onclick=call;buttons.append(b);return b;};
  const material=(color,metalness=0)=>new T.MeshStandardMaterial({color,metalness,roughness:metalness ? .34 : .69});
  const walnut=material(0x715340),inset=material(0x49372e),bronze=material(0xb59860,.65);
  walnut.shadowSide=T.FrontSide;
  const halfLeaf=.516; // The 2.04 m opening has a short rebate on either jamb.
  let near=null,pane=null,editor=null,editing=null,surface=null,live=null,pen=null,audio=null,cooldown=0,noteTimer=0;
  const fine=matchMedia('(any-pointer:fine)');
  const ray=new T.Raycaster(), aim=new T.Vector2();
  let draftId=null,otherInk=null,interrupted=false,arrival=null,waiting=null;
  const note=document.createElement('output');note.className='room-bell-note';note.hidden=true;note.setAttribute('aria-live','polite');hud.append(note);
  const toast=t=>{clearTimeout(noteTimer);note.textContent=t;note.hidden=false;noteTimer=setTimeout(()=>note.hidden=true,2600);};
  const arm=()=>{try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}};
  stage.addEventListener('pointerdown',arm,{capture:true,once:true});
  function chime(r,knock=false){
    if(document.hidden||document.body.classList.contains('message-open'))return;
    doors[r].lastRing=performance.now();
    const volume=.1/(1+Math.abs(camera.position.x-doors[r].x)*.22);
    if(audio?.state==='running')for(const [delay,hz] of knock?[[0,184],[.23,147]]:[[0,784],[.22,622]]){
      const pan=knock&&audio.createStereoPanner?.();
      if(pan){
        const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
        const dir=new T.Vector3(doors[r].x-camera.position.x,1.28-camera.position.y,hallZ-camera.position.z).normalize();
        pan.pan.value=T.MathUtils.clamp(right.dot(dir)*.8,-.8,.8);pan.connect(audio.destination);
      }
      const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+delay;
      osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+.75);
      if(knock){osc.type='triangle';osc.frequency.exponentialRampToValueAtTime(hz*.42,t+.11);
        gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume*.68,t+.007);gain.gain.exponentialRampToValueAtTime(.0001,t+.16);}
      osc.connect(gain);gain.connect(pan || audio.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();pan?.disconnect?.();};osc.start(t);osc.stop(t+(knock ? .17 : .76));
    }
    toast(knock?'来啦 · 轻轻敲了两下':name(r)+' 房门 · 叮咚');
  }
  for(const r of rooms){
    const x=r==='lynn'?-6.98:davidRoomX+6.98,side=r==='lynn'?-1:1;
    const leaves=[-1,1].map(sign=>{
      const g=new T.Group();scene.add(g);g.position.set(x,0,hallZ+sign*halfLeaf);
      box(g,[.095,2.93,2*halfLeaf],walnut,[0,1.455,0]);
      // A cover strip moves with one leaf rather than leaving a permanent centre slit.
      if(sign===1)box(g,[.019,2.92,.035],walnut,[-side*.055,1.455,-halfLeaf]);
      for(const face of [-1,1]){
        for(const y of [.76,2.03])box(g,[.012,1.05,.78],inset,[face*.053,y,0]);
        box(g,[.035,.22,.035],bronze,[face*.078,1.13,-sign*.33]);
      }
      return g;
    });
    box(scene,[.145,.22,.033],inset,[x+side*.39,1.31,hallZ+1.003]);
    const keycap=bronze.clone();keycap.emissive.setHex(0xffbc73);keycap.emissiveIntensity=0;
    box(scene,[.076,.08,.025],keycap,[x+side*.39,1.31,hallZ+.976]);
    doors[r]={x,leaves,keycap,lastRing:-Infinity,open:false,t:0};
    if(!snow)continue;
    const c=document.createElement('canvas');c.width=768;c.height=480;
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(3.18,1.99),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false}));
    m.position.set((r==='lynn'?0:davidRoomX)+1.72,1.54,4.535);m.rotation.y=Math.PI;scene.add(m);
    // Build the still condensation once, then erase real paths into its alpha channel.
    const frost=c.cloneNode(), f=frost.getContext('2d');
    const g=f.createRadialGradient(0,0,.12,0,0,1);g.addColorStop(0,'rgba(218,237,246,.61)');g.addColorStop(.72,'rgba(207,232,245,.46)');g.addColorStop(1,'rgba(207,232,245,0)');
    f.save();f.translate(384,240);f.scale(388,242);f.fillStyle=g;f.fillRect(-1,-1,2,2);f.restore();
    let seed=r==='lynn'?4321:2537;
    const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let i=0;i<165;i++){const x=rand()*744+12,y=rand()*456+12;if(Math.hypot((x-384)/365,(y-240)/223)>.95)continue;
      const a=.45+rand()*1.25;f.fillStyle='rgba(234,247,253,.22)';f.beginPath();f.ellipse(x,y,a,a*(1.05+rand()),0,0,Math.PI*2);f.fill();}
    walls[r]={c,frost,base:c.cloneNode(),tex,mesh:m,marks:[],x:m.position.x};paint(r,true);
  }
  function stroke(ctx,points){
    if(!points?.length)return;
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.strokeStyle=ctx.fillStyle='#000';ctx.lineWidth=9;ctx.lineCap=ctx.lineJoin='round';
    ctx.beginPath();const x=i=>points[i]*768/1023,y=i=>points[i]*480/1023;
    if(points.length===2){ctx.arc(x(0),y(1),4.5,0,Math.PI*2);ctx.fill();}
    else {ctx.moveTo(x(0),y(1));for(let i=2;i<points.length;i+=2)ctx.lineTo(x(i),y(i+1));ctx.stroke();}ctx.restore();
  }
  function paint(r,rebuild=false){
    const w=walls[r];if(!w)return;
    const ctx=w.c.getContext('2d');ctx.clearRect(0,0,768,480);
    if(rebuild){const b=w.base.getContext('2d');b.clearRect(0,0,768,480);b.drawImage(w.frost,0,0);
      for(const m of w.marks.slice(w.marks.findLastIndex(m=>!m.points.length)+1))stroke(b,m.points);}
    ctx.drawImage(w.base,0,0);
    if(otherInk?.room===r && !w.marks.some(m=>m.id===otherInk.id))stroke(ctx,otherInk.points);
    if(editing===r && live)stroke(ctx,live);
    w.tex.needsUpdate=true;
    if(editing===r && surface){const c=surface.getContext('2d');c.clearRect(0,0,768,480);c.drawImage(w.c,0,0);}
  }
  function accept(marks){
    const changed=new Set();
    for(const m of marks){const w=walls[m.room];if(!w)continue;
      const prior=w.marks.findIndex(v=>v.id===m.id);
      if(prior>=0)w.marks.splice(prior,1);
      w.marks.push(m);w.marks.sort((a,b)=>(a.seq??Infinity)-(b.seq??Infinity));
      w.marks=w.marks.slice(-48);changed.add(m.room);
    }for(const r of changed)paint(r,true);
  }
  function receiveInk(mark){
    if(!otherInk&&!mark || otherInk?.id===mark?.id && otherInk?.points?.join(',')===mark?.points?.join(','))return;
    const old=otherInk?.room;otherInk=mark;
    if(old&&old!==mark?.room)paint(old);
    if(mark)paint(mark.room);
  }
  function commit(points,id=uid()){const m={room:editing,id,points};accept([m]);send(m);}
  const isHallSide=(r,p)=>r==='lynn'?p.x<doors[r].x:p.x>doors[r].x;
  function receiveDoor(g){
    const r=g.kind.slice(g.kind.indexOf('-')+1),p=camera.position,now=Date.now();
    if(g.kind.startsWith('bell-') && suiteZone(p.x)===r){
      chime(r);arrival={room:r,id:g.id,until:now+16000};
    }else if(g.kind.startsWith('knock-') && waiting?.id===g.replyTo && waiting.room===r && waiting.until>now &&
      isHallSide(r,p)&&Math.abs(p.x-doors[r].x)<2.6&&Math.abs(p.z-hallZ)<1.18){
      waiting=null;chime(r,true);
    }
  }
  let queued=0,offline=false;
  function queue(count,disconnected){
    queued=count;offline=disconnected;
    const el=editor?.querySelector('[data-ink-status]');if(!el)return;
    const label=!shared?'仅当前房间可见':!queued?(offline?'暂时未连接':'笔迹已同步'):offline?'笔迹暂存在这个标签页，联网后会补上':'笔迹正在同步…';
    if(el.textContent!==label)el.textContent=label;
  }
  function startStroke(id){pen=id;draftId=uid();live=[];}
  function point(u,v){
    if(!live)return;
    const q=n=>Math.max(0,Math.min(1023,Math.round(n*1023))),x=q(u),y=q(v);
    if(live.length&&Math.hypot(live.at(-2)-x,live.at(-1)-y)<3)return;
    if(live.length>=256)live=live.filter((_,i)=>i%4<2);
    live.push(x,y);previewInk({room:editing,id:draftId,points:live.slice()});paint(editing);
  }
  function finishStroke(){
    if(pen===null)return;
    const pts=live,id=draftId;live=null;pen=null;draftId=null;previewInk(null);if(pts?.length&&editing)commit(pts,id);
    if(!editor)editing=null;
  }
  function uv(event,r){
    const b=canvas.getBoundingClientRect();
    aim.set(2*(event.clientX-b.left)/b.width-1,1-2*(event.clientY-b.top)/b.height);
    camera.updateMatrixWorld();
    ray.setFromCamera(aim,camera);
    return ray.intersectObject(walls[r].mesh,false)[0]?.uv;
  }
  function directStart(event){
    if(event.pointerType==='touch'||event.button!==0||!pane||editor||pen!==null)return false;
    const hit=uv(event,pane);if(!hit)return false;
    interrupted=false;editing=pane;startStroke(event.pointerId);point(hit.x,1-hit.y);return true;
  }
  function directMove(event){
    if(editor||pen!==event.pointerId)return false;
    const hit=uv(event,editing);
    // Finishing on the glass edge must not connect two separate entries into the pane.
    if(!hit){interrupted=true;return true;}
    if(!interrupted)point(hit.x,1-hit.y);return true;
  }
  function directEnd(event){
    if(editor||pen!==event.pointerId)return false;
    if(event.type==='pointerup')directMove(event);
    finishStroke();return true;
  }
  window.addEventListener('pagehide',finishStroke);
  function close(){finishStroke();editor?.close();}
  function write(){
    if(!pane||editor)return;
    editing=pane;
    editor=document.createElement('dialog');editor.className='room-glass-editor';
    editor.innerHTML='<strong></strong><p>用手指或鼠标擦开雾气。最近 48 笔留在这扇窗上。</p><small data-ink-status role="status"></small><canvas width="768" height="480" aria-label="在窗玻璃上画画"></canvas><footer><button type="button">擦净这扇窗</button><button type="button">写好了</button></footer>';
    editor.querySelector('strong').textContent=name(pane)+' 的雪夜窗玻璃';surface=editor.querySelector('canvas');stage.append(editor);
    const sample=e=>{const b=surface.getBoundingClientRect();point((e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height);};
    surface.onpointerdown=e=>{if(pen!==null||e.button!==0)return;startStroke(e.pointerId);surface.setPointerCapture(pen);sample(e);};
    surface.onpointermove=e=>{if(e.pointerId===pen)sample(e);};
    const finish=e=>{if(e.pointerId!==pen)return;if(e.type==='pointerup')sample(e);finishStroke();};
    surface.onpointerup=surface.onpointercancel=surface.onlostpointercapture=finish;
    editor.oncancel=finishStroke;
    editor.querySelector('button').onclick=()=>{if(confirm('擦掉这扇窗上两个人的笔迹？'))commit([]);};
    editor.querySelector('button:last-child').onclick=close;
    editor.onclose=()=>{const r=editing;live=null;pen=null;editing=null;surface=null;editor.remove();editor=null;paint(r);canvas.focus({preventScroll:true});};
    editor.showModal();queue(queued,offline);paint(editing);
  }
  const occupied=(r,p)=>p&&Math.abs(p.x-doors[r].x)<.36&&Math.abs(p.z-hallZ)<1.14;
  function toggle(){if(!near)return;const d=doors[near];if(d.open&&(occupied(near,camera.position)||occupied(near,peer()))){toast('门口有人，等走开一点再关门');return;}
    d.open=!d.open;change('entry-'+near,d.open);canvas.focus({preventScroll:true});}
  const doorBtn=action('',toggle),bellBtn=action('按门铃',()=>{
    if(!near||Date.now()<cooldown)return;
    cooldown=Date.now()+2000;arm();chime(near);const id=uid();
    waiting={room:near,id,until:Date.now()+24000};gesture({id,kind:'bell-'+near});
  }),inkBtn=action('在雾窗上写字',write);
  const replyBtn=action('来啦',()=>{
    if(!arrival||arrival.until<Date.now()||suiteZone(camera.position.x)!==arrival.room)return;
    const {room,id}=arrival;arrival=null;replyBtn.hidden=true;gesture({id:uid(),kind:'knock-'+room,replyTo:id});
    canvas.focus({preventScroll:true});
  });
  const inkHint=document.createElement('small');inkHint.className='room-direct-ink-hint';inkHint.hidden=true;
  inkHint.textContent='按住玻璃直接写，松手留下笔迹';hud.append(inkHint);
  return {accept,receiveDoor,receiveInk,queue,directStart,directMove,directEnd, drawing:()=>pen!==null&&!editor,set(r,v){doors[r].open=v;},toggleNear(){if(near){toggle();return true;}return false;},
    blocked(x,z){return rooms.some(r=>doors[r].t<.86 && Math.abs(x-doors[r].x)<.19 && Math.abs(z-hallZ)<1.08 && !(Math.abs(camera.position.x-doors[r].x)<.19 && Math.abs(x-doors[r].x)>Math.abs(camera.position.x-doors[r].x)));},
    step(dt,available){
      const p=camera.position;
      near=available?rooms.find(r=>Math.abs(p.x-doors[r].x)<1.45&&Math.abs(p.z-hallZ)<1.2):null;
      pane=available&&snow?rooms.find(r=>Math.abs(p.x-walls[r].x)<1.85&&p.z>2.85&&p.z<4.61):null;
      doorBtn.hidden=!near;bellBtn.hidden=!near || (near==='lynn'?p.x>doors.lynn.x:p.x<doors.david.x);inkBtn.hidden=!pane;
      replyBtn.hidden=!arrival||arrival.until<Date.now()||suiteZone(p.x)!==arrival.room;
      inkHint.hidden=!pane||!fine.matches||!!editor;
      canvas.classList.toggle('is-inking',!!pane&&fine.matches&&!editor);
      if(near){const label=(doors[near].open?'关上':'打开')+name(near)+' 的房门';if(doorBtn.textContent!==label)doorBtn.textContent=label;bellBtn.disabled=Date.now()<cooldown;}
      for(const r of rooms){const d=doors[r],target=d.open||(d.t>.85&&(occupied(r,p)||occupied(r,peer())))?1:0;
        if(d.keycap.emissiveIntensity || performance.now()-d.lastRing<1250)d.keycap.emissiveIntensity=.8*Math.max(0,1-(performance.now()-d.lastRing)/1250);
        const eased=T.MathUtils.damp(d.t,target,9,dt),next=Math.abs(eased-target)<.0008?target:eased;if(next===d.t)continue;d.t=next;
        d.leaves.forEach((leaf,i)=>leaf.position.z=hallZ+(i?1:-1)*(halfLeaf+d.t*1.04));shadow();}
    },destroy(){finishStroke();window.removeEventListener('pagehide',finishStroke);if(editor){editor.onclose=null;editor.remove();}stage.removeEventListener('pointerdown',arm,true);audio?.close().catch(()=>{});clearTimeout(noteTimer);style.remove();}
  };
}
