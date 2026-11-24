(async () => {
  const room=document.querySelector('.david-room');
  const stage=room.querySelector('.room-3d-stage');
  const message=room.querySelector('.david-room-message');
  const params=new URLSearchParams(location.search);
  const preview=params.get('local-room')==='1' && (location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname));
  if(!preview && !window.LynnOpening?.isOpen()){
    message.textContent='北京时间 11 月 25 日 00:00 开放。';message.hidden=false;
    window.addEventListener('lynn-opening',()=>location.reload(),{once:true});
    return;
  }
  document.title=document.querySelector('[data-david-title]').textContent='David 的 3D 房间';
  stage.classList.add('is-loading');
  if(!window.LynnRoom3D)await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='room3d.bundle.js?v=david-album-1';
    script.onload=resolve;script.onerror=()=>reject(Error('房间的 3D 资源暂时没读到。'));document.head.append(script);
  });
  const engine=window.LynnRoom3D;
  if (!engine?.supportsRoom3D()) {
    stage.classList.remove('is-loading');
    message.textContent='当前浏览器打不开 3D 房间。';
    message.hidden=false;
    return;
  }
  const endpoint='https://lynn-words-sync.lynn-words-work.workers.dev';
  const adminToken=()=>{try {return sessionStorage.getItem('lynn:careAdminToken');} catch (_) {return null;}};
  async function api(path,options={}) {
    const credential=adminToken();
    if (!credential) throw Error('请登录关心面板。');
    const response=await fetch(endpoint+path,{
      signal:options.keepalive ? undefined : AbortSignal.timeout(6000),...options,
      headers:{Authorization:`Bearer ${credential}`,...options.headers}
    });
    if (!response.ok) {
      const error=await response.json().catch(()=>null);
      throw Error(error?.error || '房间连接暂时不可用。');
    }
    return response;
  }
  const exchange=preview ? engine.createPreviewRoomExchange('david')
    : adminToken() ? async (body,{leave=false}={})=>{
      const response=await api('/care/room/live',{
        method:leave ? 'DELETE' : 'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),keepalive:leave
      });
      return response.json();
    } : null;
  const urls=new Map();
  const forgetURL=id=>{
    if(urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
  };
  const loadURL=async id=>{
    if (urls.has(id)) return urls.get(id);
    const blob=preview ? await LynnPreviewPhotos.roomPhoto(id)
      : await (await api('/room/photos/'+id)).blob();
    if(!blob.size) throw Error('这张照片暂时没取到。');
    if (!urls.has(id)) urls.set(id,URL.createObjectURL(blob));
    return urls.get(id);
  };
  const readNotes=preview ? LynnPreviewPhotos.notes : async (id,before)=>{
    const response=await api(`/room/photos/${id}/notes`+(before ? '?before='+before : ''));
    return response.json();
  };
  const postNote=preview ? (...args)=>LynnPreviewPhotos.post('david',...args) : async(id,body,clientId)=>{
    const response=await api(`/room/photos/${id}/notes`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,clientId})
    });
    return response.json();
  };
  let photos=[], davidPhotos=[];
  if (preview || adminToken()) {
    try {
      if (preview) {
        photos=await LynnPreviewPhotos.list();
      } else {
        const result=await (await api('/room/photos')).json();
        photos=result.photos || [];
        davidPhotos=result.davidPhotos || [];
      }
    } catch (_) {
      document.querySelector('.david-photo-status').hidden=false;
    }
  }
  engine.mountRoom3D(stage,{
    exchange, role:'david', outboxKey:'lynn:glass-outbox:'+(preview?'preview:':'')+'david',
    photoCatalog:[...photos,...davidPhotos],loadPhotoURL:loadURL,
    photos,davidPhotos,
    onPhoto:photo=>LynnRoomAlbum.open(photo,{photos:photo.owner==='david' ? davidPhotos : photos,loadURL,retryPhoto:forgetURL,readNotes,postNote,draftScope:preview ? 'preview-david' : 'david'}),
    startAt:preview && ['david-festival','david-window','david-sofa','lynn-sofa','fog-window','david-fog-window','entry','entry-inside','hall-board','shared-dusk'].includes(params.get('room-look')) ? params.get('room-look') : 'david',
    owned:['bed','lamp','rug','plant','outfit'],
    theme:preview && params.get('room-style')==='everyday' ? ''
      : window.LynnChristmas?.info?.() ? 'christmas' : window.LynnFestivals?.info?.()?.slug || ''
  });
  stage.classList.remove('is-loading');
  window.addEventListener('pagehide',event=>{
    if(!event.persisted) for(const id of urls.keys()) forgetURL(id);
  });
})().catch(error=>{
  document.querySelector('.room-3d-stage')?.classList.remove('is-loading');
  const message=document.querySelector('.david-room-message');
  message.textContent=error.message || '房间暂时没打开。';
  message.hidden=false;
});
