import * as T from './vendor/three/three.module.min.js';
import {davidRoomX,hallZ,suiteZone} from './room-suite.js';

const names={lynn:'Lynn',david:'David'}, roles=Object.keys(names);
const id=()=>globalThis.crypto?.randomUUID?.()||'corner-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const age=v=>Date.now()-v.start;
const duskDuration=100000;
const alive=cue=>cue&&age(cue)>=-3500&&age(cue)<duskDuration;

export function mountRoomCorners({scene,stage,hud,tools,camera,canvas,box,role,photos,loadPhotoURL,onPhoto,shared,dusk,send,publish}){
  const center=davidRoomX/2;
  const violet=new T.MeshStandardMaterial({color:0x66465f,roughness:.63});
  const walnut=new T.MeshStandardMaterial({color:0x754f39,roughness:.46});
  const stand=new T.Group();stand.position.set(center,0,-3.06);scene.add(stand);
  box(stand,[2.12,.075,.24],walnut,[0,.47,0]);
  for(const x of [-.77,.77])box(stand,[.105,.16,.14],violet,[x,.36,-.025]);
  const frames={};
  for(const [i,who] of roles.entries()){
    const x=i*.92-.46;
    box(stand,[.75,.44,.051],walnut,[x,.73,-.04]);
    const plane=new T.Mesh(new T.PlaneGeometry(.67,.36),new T.MeshBasicMaterial({color:0xffead1,toneMapped:false}));
    plane.position.set(x,.735,-.011);stand.add(plane);frames[who]=plane;
  }
  const exhibitBtn=document.createElement('button');exhibitBtn.type='button';exhibitBtn.className='room-light-trigger';
  exhibitBtn.textContent='走廊小展台';exhibitBtn.hidden=true;
  exhibitBtn.style.cssText='position:absolute;bottom:174px;left:50%;transform:translateX(-50%);pointer-events:auto;min-height:38px';
  hud.append(exhibitBtn);
  const duskBtn=document.createElement('button');duskBtn.type='button';duskBtn.className='room-light-trigger';
  tools.append(duskBtn);
  const msg=document.createElement('output');msg.setAttribute('role','status');msg.hidden=true;
  msg.style.cssText='position:absolute;top:25%;left:50%;transform:translateX(-50%);background:#352941e8;color:white;border-radius:16px;padding:6px 12px;text-align:center;pointer-events:none';
  hud.append(msg);
  let statusTimer=0,dialog=null,mode=null,corner=null,pending=new Map(), peerDusk=null,hostDusk=null,joinedDusk=null,nearHall=false,nearBalcony=false;
  let room='lynn',destroyed=false;
  const stock=new Map(photos.map(p=>[Number(p.id),p]));
  const imageRequests=new Map();
  function sourceFor(photo){
    if(photo?.url)return Promise.resolve(photo.url);
    if(!photo||!loadPhotoURL)return Promise.resolve('');
    if(!imageRequests.has(photo.id))imageRequests.set(photo.id,Promise.resolve(loadPhotoURL(photo.id)).catch(()=>{imageRequests.delete(photo.id);return '';}));
    return imageRequests.get(photo.id);
  }
  const toast=t=>{clearTimeout(statusTimer);msg.textContent=t;msg.hidden=false;statusTimer=setTimeout(()=>msg.hidden=true,2850);};
  const style=document.createElement('style');style.textContent=`
    .room-corner-dialog{width:min(90vw,595px);max-height:87dvh;overflow:auto;background:#f9f4ed;color:#493655;border:1px solid #cfbfd6;border-radius:18px;padding:18px;font:15px system-ui}
    .room-corner-dialog::backdrop{background:#21182d88}.room-corner-dialog header{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .room-corner-dialog h2{margin:4px 0}.room-corner-dialog nav{display:flex;gap:7px;margin:12px 0}
    .room-corner-dialog button,.room-corner-dialog select{border:1px solid #cfbfd6;border-radius:9px;padding:6px 10px;background:#fff;color:#493655;cursor:pointer}
    .room-corner-dialog textarea{width:100%;box-sizing:border-box;min-height:90px;margin:6px 0;border:1px solid #cfbfd6;border-radius:9px;padding:8px;color:inherit;resize:vertical}
    .room-corner-exhibits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.room-corner-exhibits figure{margin:0;background:#eee1eb;border-radius:9px;padding:8px;overflow-wrap:anywhere}
    .room-corner-exhibits img{width:100%;height:112px;object-fit:contain;display:block}.room-corner-kicker{font-size:12px;color:#6c5677}
  `;stage.append(style);
  function state(data,queued){
    corner=data;pending=new Map(queued);
    const items=exhibits();
    for(const who of roles){
      const photo=stock.get(items.find(v=>v.author===who)?.photo),frame=frames[who],pid=photo?.id??null;
      if(frame.userData.photo===pid)continue;
      frame.userData.photo=pid;frame.material.map?.dispose();frame.material.map=null;frame.material.color.setHex(0xffead1);
      frame.material.needsUpdate=true;
      if(!photo)continue;
      sourceFor(photo).then(src=>{
        if(destroyed||frame.userData.photo!==pid||!src)return;
        new T.TextureLoader().load(src,t=>{
          if(destroyed||frame.userData.photo!==pid){t.dispose();return;}
          t.colorSpace=T.SRGBColorSpace;
          const ratio=t.image.width/t.image.height, fr=.67/.36;
          t.repeat.set(Math.min(1,fr/ratio),Math.min(1,ratio/fr));t.offset.set((1-t.repeat.x)/2,(1-t.repeat.y)/2);
          frame.material.color.setHex(0xffffff);frame.material.map=t;frame.material.needsUpdate=true;
        },undefined,()=>{frame.userData.photo=undefined;});
      });
    }
    if(mode==='exhibit'&&dialog)renderExhibits();
    if(mode==='private'&&dialog){
      const field=dialog.querySelector('textarea');
      if(field && field.dataset.dirty!=='true')field.value=ownNote();
      if(field)field.disabled=!shared;
      const button=dialog.querySelector('[data-private-save]');
      if(button){button.disabled=!shared;button.textContent=pending.has('note')?'等待同步':'保存我的便签';}
    }
  }
  function exhibits(){
    const result=(corner?.exhibits||[]).slice();
    const mine=pending.get('exhibit');if(!mine)return result;
    const others=result.filter(v=>v.author!==role);
    return mine.photo===null?others:[...others,{author:role,photo:mine.photo,text:mine.text}];
  }
  const ownNote=()=>pending.get('note')?.text ?? corner?.note ?? '';
  function write(value){
    pending.set(value.kind,value);send(value);
    if(corner)state(corner,pending);
  }
  function initDialog(title){
    if(dialog)close();
    const el=document.createElement('dialog');dialog=el;el.className='room-corner-dialog';el.setAttribute('aria-label',title);
    const header=document.createElement('header'),h=document.createElement('h2');h.textContent=title;
    const exit=document.createElement('button');exit.textContent='关上';exit.onclick=()=>el.close();
    header.append(h,exit);el.append(header);
    el.onclose=()=>{if(dialog===el){dialog=null;mode=null;canvas.focus({preventScroll:true});}el.remove();};
    stage.append(el);return el;
  }
  function close(){const el=dialog;if(el){dialog=null;mode=null;el.close();el.remove();}}
  function renderExhibits(){
    const wall=dialog?.querySelector('.room-corner-exhibits');if(!wall)return;wall.replaceChildren();
    for(const who of roles){
      const item=exhibits().find(v=>v.author===who);
      const photo=stock.get(item?.photo), card=document.createElement('figure'), title=document.createElement('strong');title.textContent=names[who]+' 的展框';card.append(title);
      if(photo){
        const img=document.createElement('img');img.alt=photo.caption||'展出的照片';card.append(img);
        sourceFor(photo).then(src=>{if(src&&img.isConnected)img.src=src;});
        const full=document.createElement('button');full.type='button';full.textContent='打开照片';full.onclick=()=>{close();onPhoto?.(photo);};card.append(full);
      }
      const p=document.createElement('figcaption');p.textContent=item?(item.text||photo?.caption||'照片暂时不可用'):'暂时没有展出的照片';card.append(p);wall.append(card);
    }
  }
  function openExhibit(tab='exhibit'){
    if(!nearHall)return;
    const el=initDialog('走廊小展台');mode=tab;
    const nav=document.createElement('nav');
    for(const [key,text] of [['exhibit','展出的照片'],['private','给自己的便签']]){
      const btn=document.createElement('button');btn.textContent=text;btn.setAttribute('aria-pressed',String(key===tab));btn.onclick=()=>openExhibit(key);nav.append(btn);
    }
    el.append(nav);
    if(tab==='private'){
      const label=document.createElement('label');label.textContent='只有自己登录后可见（不会印在走廊上）';label.htmlFor='room-private-note';
      const field=document.createElement('textarea');field.id='room-private-note';field.maxLength=2400;field.value=ownNote();
      field.oninput=()=>{field.dataset.dirty='true';};field.disabled=!shared||!corner;
      const save=document.createElement('button');save.textContent='保存我的便签';save.dataset.privateSave='1';save.disabled=!shared||!corner;
      save.onclick=()=>{write({kind:'note',text:field.value});field.dataset.dirty='false';save.textContent='等待同步';};
      el.append(label,field,save);
    }else{
      const wall=document.createElement('div');wall.className='room-corner-exhibits';el.append(wall);renderExhibits();
      const form=document.createElement('form'),caption=document.createElement('p');caption.textContent='选一张相册照片放进自己的展框，不移动原照片。';form.append(caption);
      const select=document.createElement('select');select.setAttribute('aria-label','选择照片');
      select.add(new Option(stock.size?'选一张照片':'先在相册上传照片',''));
      for(const photo of stock.values())select.add(new Option(photo.caption||'照片 '+photo.id,photo.id));
      const own=exhibits().find(v=>v.author===role);select.value=own?.photo??'';
      const text=document.createElement('textarea');text.placeholder='今天想给你看这个……';text.setAttribute('aria-label','展台配文');text.maxLength=200;text.value=own?.text||'';
      const save=document.createElement('button');save.textContent='摆出照片';save.disabled=!shared||!stock.size;
      const del=document.createElement('button');del.type='button';del.textContent='撤下我的展览';del.disabled=!shared;
      del.onclick=()=>{write({kind:'exhibit',photo:null,text:''});select.value='';text.value='';toast('已撤展，原照片还在相册');};
      form.onsubmit=e=>{e.preventDefault();if(!select.value)return;write({kind:'exhibit',photo:Number(select.value),text:text.value.trim()});toast('照片已放到展台');};
      form.append(select,text,save,del);el.append(form);
    }
    el.showModal();
  }
  exhibitBtn.onclick=()=>openExhibit();
  const ray=new T.Raycaster(), aim=new T.Vector2();

  duskBtn.onclick=()=>{
    if(joinedDusk){
      joinedDusk=null;
      if(hostDusk){hostDusk=null;publish(null);}
      dusk?.release();return;
    }
    if(!nearBalcony||!dusk)return;
    if(alive(peerDusk))joinedDusk=peerDusk;
    else {
      joinedDusk=hostDusk={id:id(),room,start:Date.now()+900};
      publish({dusk:hostDusk});
    }
  };
  return {
    state,
    interact(x,y){
      if(!nearHall)return false;
      aim.set(x,y);camera.updateMatrixWorld();stand.updateWorldMatrix(true,true);
      ray.setFromCamera(aim,camera);
      if(!ray.intersectObjects(Object.values(frames),false).length)return false;
      openExhibit();return true;
    },
    peer(cues){peerDusk=cues?.dusk||null;},
    step(){
      const p=camera.position;room=suiteZone(p.x);
      nearHall=room==='hall'&&Math.hypot(p.x-center,p.z+3.06)<2.05;
      nearBalcony=room!=='hall'&&p.z>4.9;
      exhibitBtn.hidden=!nearHall;duskBtn.hidden=!dusk||(!nearBalcony&&!joinedDusk);
      if(joinedDusk)dusk?.follow(T.MathUtils.clamp(age(joinedDusk)/duskDuration,0,1));
      if(hostDusk&&!alive(hostDusk)){hostDusk=null;publish(null);}
      const duskText=joinedDusk?'退出共同日落':alive(peerDusk)?'加入对方的日落':'一起等天黑';
      if(duskBtn.textContent!==duskText)duskBtn.textContent=duskText;
    },
    destroy(){
      destroyed=true;clearTimeout(statusTimer);
      close();style.remove();
    }
  };
}
