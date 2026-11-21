import * as T from './vendor/three/three.module.min.js';
import {davidRoomX,hallZ,suiteZone} from './room-suite.js';

const centerX=davidRoomX/2, wallZ=hallZ-1.02+.024;
const colors=['#57416e','#243951','#a7566b','#387963'];
const label=role=>role==='david'?'David':'Lynn';
const uid=()=>globalThis.crypto?.randomUUID?.() || 'board-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const compare=(a,b)=>(a.seq??Infinity)===(b.seq??Infinity)?0:(a.seq??Infinity)-(b.seq??Infinity);

export function mountHallBoard({scene,stage,hud,camera,canvas,box,role,shared,send}){
  const group=new T.Group();group.position.set(centerX,1.64,wallZ);group.scale.set(.88,.88,1);scene.add(group);
  const birch=new T.MeshStandardMaterial({color:0xa17d5e,roughness:.52});
  const trim=new T.MeshStandardMaterial({color:0x5b4e64,roughness:.52});
  box(group,[2.52,1.49,.040],birch,[0,0,.004]);
  for(const y of [-.748,.748])box(group,[2.56,.051,.07],trim,[0,y,.012]);
  for(const x of [-1.255,1.255])box(group,[.052,1.52,.07],trim,[x,0,.012]);
  box(group,[1.08,.060,.17],birch,[.58,-.788,.083]); // marker tray
  for(const [i,color] of colors.entries()){
    const barrel=new T.MeshStandardMaterial({color,roughness:.45});
    box(group,[.15,.023,.023],barrel,[.25+i*.21,-.740,.109],[0,-.16,0]);
  }
  const sheet=document.createElement('canvas');sheet.width=1024;sheet.height=608;
  const texture=new T.CanvasTexture(sheet);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const face=new T.Mesh(new T.PlaneGeometry(2.46,1.46),new T.MeshBasicMaterial({map:texture,toneMapped:false}));face.position.z=.030;group.add(face);
  const paper=sheet.getContext('2d');
  const drawLayer=document.createElement('canvas');drawLayer.width=664;drawLayer.height=390;
  const ink=drawLayer.getContext('2d');
  const records=new Map(), key=(author,id)=>author+':'+id;
  let nearby=false,dialog=null,area=null,notes=null,form=null,undo=null,stat=null,color=0,pointer=null,stroke=null,qty=0,offline=false,ready=false;
  let layoutFrame=0,draftText='';
  const ray=new T.Raycaster(), aim=new T.Vector2();
  function path(ctx,data,w,h){
    if(!data?.points?.length)return;
    const p=data.points,x=i=>p[i]*w/1023,y=i=>p[i]*h/1023;
    ctx.strokeStyle=ctx.fillStyle=colors[data.color];ctx.lineWidth=3.8;ctx.lineCap=ctx.lineJoin='round';
    ctx.beginPath();
    if(p.length===2){ctx.arc(x(0),y(1),1.9,0,Math.PI*2);ctx.fill();return;}
    ctx.moveTo(x(0),y(1));for(let i=2;i<p.length;i+=2)ctx.lineTo(x(i),y(i+1));ctx.stroke();
  }
  function entries(kind){
    const removed=new Set([...records.values()].filter(v=>v.kind==='erase').map(v=>key(v.author,v.data)));
    return [...records.values()].filter(v=>v.kind===kind&&!removed.has(key(v.author,v.id)));
  }
  function lines(ctx,text,max){
    const out=[];let line='';
    for(const c of text){
      if(c==='\n'||ctx.measureText(line+c).width>max){out.push(line);line=c==='\n'?'':c;}
      else line+=c;
    }
    if(line)out.push(line);
    return out;
  }
  function rebuildInk(){
    ink.clearRect(0,0,664,390);
    for(const item of entries('stroke'))path(ink,item.data,664,390);
  }
  function paint(){
    if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=0;
    paper.fillStyle='#fffaf0';paper.fillRect(0,0,1024,608);
    paper.fillStyle='#ede6f2';paper.fillRect(0,0,1024,115);
    paper.fillStyle='#51405f';paper.font='700 40px system-ui, sans-serif';paper.fillText('走廊白板',38,58);
    paper.font='21px Georgia, serif';paper.fillText('LYNN   &   DAVID',43,91);
    paper.fillStyle='#756580';paper.font='700 24px system-ui';paper.fillText('公告',39,156);paper.fillText('随手画',349,156);
    paper.fillStyle='#f2e7d1';paper.fillRect(32,179,286,414);
    paper.fillStyle='#fffdf9';paper.fillRect(338,179,662,414);
    const pinned=entries('note').slice(-2).reverse();
    if(!pinned.length){paper.fillStyle='#756580';paper.font='22px system-ui';paper.fillText('还没有公告',49,225);}
    pinned.forEach((n,i)=>{
      const y=186+198*i;
      paper.fillStyle=i?'#faf2dc':'#f8e4bf';paper.fillRect(42,y,266,181);
      paper.fillStyle='#8c6b91';paper.beginPath();paper.arc(278,y+19,6,0,Math.PI*2);paper.fill();
      paper.fillStyle='#5c4464';paper.font='bold 19px system-ui';paper.fillText(label(n.author),56,y+28);
      paper.fillStyle='#3f3743';paper.font='20px system-ui';
      const rows=lines(paper,n.data,236);rows.slice(0,4).forEach((l,j)=>paper.fillText(j===3&&rows.length>4?l.slice(0,-1)+'…':l,56,y+62+25*j));
    });
    if(stroke){
      // The WebGL face and dialog share the same coordinate space.
      paper.drawImage(drawLayer,343,186,652,397);
      paper.save();paper.translate(343,186);path(paper,stroke,652,397);paper.restore();
    }else paper.drawImage(drawLayer,343,186,652,397);
    texture.needsUpdate=true;
    if(area){const c=area.getContext('2d');c.clearRect(0,0,664,390);c.drawImage(drawLayer,0,0);if(stroke)path(c,stroke,664,390);}
  }
  function schedulePaint(){if(!layoutFrame)layoutFrame=requestAnimationFrame(paint);}
  function renderNotes(){
    if(!notes)return;
    notes.replaceChildren();
    const items=entries('note').reverse();
    if(!items.length){const p=document.createElement('p');p.textContent='这里还没有公告。';notes.append(p);}
    for(const note of items){
      const row=document.createElement('article'),author=document.createElement('strong'),body=document.createElement('p');
      author.textContent=label(note.author);body.textContent=note.data;row.append(author,body);
      if(note.author===role){
        const del=document.createElement('button');del.type='button';del.textContent='撤下';del.setAttribute('aria-label','撤下自己的公告');
        del.onclick=()=>{if(confirm('撤下这条公告？'))commit('erase',note.id);};row.append(del);
      }
      notes.append(row);
    }
    if(undo)undo.disabled=!entries('stroke').some(s=>s.author===role);
  }
  function accept(incoming){
    if(!incoming.length)return;
    for(const v of incoming)records.set(key(v.author??role,v.id),{...v,author:v.author??role});
    const ordered=[...records.values()].sort(compare).slice(-180);
    records.clear();for(const v of ordered)records.set(key(v.author,v.id),v);
    rebuildInk();schedulePaint();renderNotes();
  }
  function queue(count,disconnected,loaded){
    qty=count;offline=disconnected;ready=loaded;
    if(!stat)return;
    const t=!shared?'只在当前房间可见':qty?(offline?'已暂存在这个标签页，联网后补传':'正在同步…'):offline?'白板暂未连接':ready?'白板已同步':'正在读取白板…';
    if(stat.textContent!==t)stat.textContent=t;
  }
  function commit(kind,data){const m={id:uid(),kind,data};accept([m]);send(m);}
  function finish(){
    if(pointer===null)return;
    const data=stroke;stroke=null;pointer=null;
    if(data?.points.length)commit('stroke',data);
  }
  const style=document.createElement('style');style.textContent=`
    .room-hall-board-action{position:absolute;left:50%;bottom:125px;transform:translateX(-50%);min-height:40px;pointer-events:auto}
    .room-board-dialog{box-sizing:border-box;width:min(93vw,780px);max-height:88dvh;overflow:auto;color:#49374e;background:#fbf8f3;padding:clamp(12px,3vw,24px);border:1px solid #cbb9d4;border-radius:19px;font:15px system-ui}
    .room-board-dialog::backdrop{background:#21183291}
    .room-board-dialog header,.room-board-tools{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
    .room-board-dialog h2,.room-board-dialog h3{margin:6px 0}.room-board-dialog button{padding:7px 11px;border:1px solid #d8c9dc;border-radius:9px;background:#fff;color:#49374e;cursor:pointer}
    .room-board-dialog button[aria-pressed="true"]{outline:2px solid #8566ab;outline-offset:2px}
    .room-board-grid{display:grid;grid-template-columns:1.45fr 1fr;gap:16px;margin-top:12px}
    .room-board-ink{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair;background:#fffefa;border:1px solid #e0d4e2;border-radius:9px;margin-bottom:8px}
    .room-board-dialog textarea{box-sizing:border-box;width:100%;min-height:74px;padding:8px;border:1px solid #cbb9d4;border-radius:8px;background:#fff;color:inherit;resize:vertical}
    .room-board-dialog form{display:grid;gap:6px}.room-board-dialog form button{justify-self:end}
    .room-board-notes{max-height:24vh;overflow:auto}.room-board-notes article{padding:9px;margin:6px 0;background:#f9edcf;border-radius:8px}
    .room-board-notes article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}
    @media(max-width:600px){.room-board-grid{grid-template-columns:1fr;gap:8px}}
  `;stage.append(style);
  const trigger=document.createElement('button');trigger.type='button';trigger.className='room-light-trigger room-hall-board-action';trigger.hidden=true;trigger.textContent='查看走廊白板';hud.append(trigger);
  function open(){
    if(!nearby||dialog)return false;
    dialog=document.createElement('dialog');dialog.className='room-board-dialog';dialog.setAttribute('aria-label','走廊白板');
    dialog.innerHTML=`<header><div><h2>走廊白板</h2><span data-board-status role="status"></span></div><button type="button" data-board-close>合上白板</button></header>
      <div class="room-board-grid"><section><h3>随手画</h3><canvas class="room-board-ink" width="664" height="390" aria-label="白板绘画区"></canvas><div class="room-board-tools"></div></section>
      <section><h3>公告</h3><form><label for="hall-board-note">留言给路过的人</label><textarea id="hall-board-note" maxlength="480" placeholder="写好后贴到白板上"></textarea><button>贴上公告</button></form><div class="room-board-notes"></div></section></div>`;
    area=dialog.querySelector('canvas');notes=dialog.querySelector('.room-board-notes');form=dialog.querySelector('form');
    stat=dialog.querySelector('[data-board-status]');const field=form.querySelector('textarea');field.value=draftText;
    field.oninput=()=>{draftText=field.value;};
    form.onsubmit=e=>{e.preventDefault();const value=field.value.trim();if(!value)return;commit('note',value);field.value='';draftText='';};
    const tools=dialog.querySelector('.room-board-tools');
    const swatches=['紫','蓝','玫瑰','绿'].map((name,i)=>{
      const b=document.createElement('button');b.type='button';b.textContent=name;b.style.color=colors[i];
      b.setAttribute('aria-pressed',String(color===i));b.onclick=()=>{color=i;swatches.forEach((c,j)=>c.setAttribute('aria-pressed',String(i===j)));};
      tools.append(b);return b;
    });
    undo=document.createElement('button');undo.type='button';undo.textContent='撤回我上一笔';
    undo.onclick=()=>{const mine=entries('stroke').findLast(v=>v.author===role);if(mine)commit('erase',mine.id);};tools.append(undo);
    function sample(e){
      const bounds=area.getBoundingClientRect(),q=n=>Math.round(Math.max(0,Math.min(1,n))*1023);
      const x=q((e.clientX-bounds.left)/bounds.width),y=q((e.clientY-bounds.top)/bounds.height),p=stroke.points;
      if(p.length&&Math.hypot(p.at(-2)-x,p.at(-1)-y)<4)return;
      if(p.length>=256)stroke.points=p.filter((_,i)=>i%4<2);
      stroke.points.push(x,y);schedulePaint();
    }
    area.onpointerdown=e=>{if(pointer!==null||e.button!==0)return;pointer=e.pointerId;stroke={color,points:[]};area.setPointerCapture(pointer);sample(e);};
    area.onpointermove=e=>{if(e.pointerId===pointer)sample(e);};
    area.onpointerup=area.onpointercancel=area.onlostpointercapture=e=>{if(e.pointerId!==pointer)return;if(e.type==='pointerup')sample(e);finish();};
    dialog.querySelector('[data-board-close]').onclick=()=>dialog.close();
    dialog.onclose=()=>{finish();dialog.remove();dialog=area=notes=form=undo=stat=null;canvas.focus({preventScroll:true});};
    stage.append(dialog);dialog.showModal();queue(qty,offline,ready);renderNotes();paint();return true;
  }
  trigger.onclick=open;
  function aimed(x,y){
    if(!nearby)return false;
    aim.set(x,y);camera.updateMatrixWorld();face.updateWorldMatrix(true,false);
    ray.setFromCamera(aim,camera);
    return !!ray.intersectObject(face)[0];
  }
  paint();
  window.addEventListener('pagehide',finish);
  return {
    accept,queue,
    interact(x=0,y=0){return aimed(x,y)&&open();},
    step(available,light){
      const level=.52+.44*T.MathUtils.clamp(light,0,1);
      if(face.material.color.r!==level)face.material.color.setScalar(level);
      const p=camera.position;
      const next=available&&suiteZone(p.x)==='hall'&&Math.hypot(p.x-centerX,p.z-wallZ)<2.0;
      if(next!==nearby){nearby=next;trigger.hidden=!next;}
    },
    destroy(){
      finish();window.removeEventListener('pagehide',finish);
      if(layoutFrame)cancelAnimationFrame(layoutFrame);
      if(dialog){dialog.onclose=null;dialog.remove();}
      style.remove();trigger.remove();
    }
  };
}
