(() => {
  'use strict';
  const endpoint='https://lynn-words-sync.lynn-words-work.workers.dev';
  const cap=1_500_000;
  let panel=null, session=null, pending=false, photos=[], supported=false;
  const token=()=>{try{return sessionStorage.getItem('lynn:careAdminToken');}catch(_){return null;}};
  const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
  async function api(path,options={}) {
    if (!session || session!==token()) throw Error('请重新登录关心面板。');
    const response=await fetch(endpoint+path,{
      ...options,signal:AbortSignal.timeout(35000),
      headers:{Authorization:'Bearer '+session,...options.headers}
    });
    if (!response.ok) {
      const info=await response.json().catch(()=>null);
      throw Error(info?.error || '照片请求失败，请重试。');
    }
    return response;
  }
  async function compress(file) {
    if (!file.size || file.size>20_000_000) throw Error('请选择不超过 20 MB 的照片。');
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();
      await new Promise((resolve,reject)=>{
        image.onload=resolve;
        image.onerror=()=>reject(Error('浏览器读不到这张图片。请换成 JPG、PNG 或 WebP。'));
        image.src=url;
      });
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d',{alpha:false});
      for (const [edge,quality] of [[1600,.86],[1600,.7],[1200,.72],[900,.66]]) {
        const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if (blob?.size && blob.size<=cap) return blob;
      }
      throw Error('照片压缩后仍然太大，请选另一张。');
    } finally { URL.revokeObjectURL(url); }
  }
  function renderList(list) {
    list.replaceChildren();
    if (!photos.length) list.append(el('p','David 的相册还是空的。'));
    for (const photo of photos) {
      const row=el('article','');
      const title=el('strong',photo.caption || '照片 '+photo.id);
      row.append(title);
      const select=document.createElement('select');
      select.setAttribute('aria-label',(photo.caption || '照片 '+photo.id)+'的位置');
      for (let i=-1;i<12;i++) {
        const option=el('option',i<0 ? '仅在相册' : '第 '+(i+1)+' 个画框');
        option.value=String(i);
        option.disabled=i>=0 && photos.some(p=>p.id!==photo.id && p.wallSlot===i);
        select.append(option);
      }
      select.value=String(photo.wallSlot);
      select.onchange=()=>perform(async()=>{
        try {
          await api('/room/photos/'+photo.id,{method:'PATCH',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({wallSlot:Number(select.value),frameStyle:photo.frameStyle || 'walnut'})});
          await refresh();status('照片位置已更新。');
        } catch (error) {select.value=String(photo.wallSlot);throw error;}
      });
      const remove=el('button','删除');
      remove.type='button';
      remove.onclick=()=>{
        if (!confirm('永久删除 David 的这张照片及相框留言？')) return;
        perform(async()=>{
          await api('/room/photos/'+photo.id,{method:'DELETE'});
          await refresh();status('照片已删除。');
        });
      };
      row.append(select,remove);list.append(row);
    }
  }
  function status(message) { if (panel) panel.querySelector('[role=status]').textContent=message; }
  async function refresh() {
    const current=panel;
    const data=await (await api('/room/photos')).json();
    if (current!==panel) return;
    supported=Array.isArray(data.davidPhotos);
    if (!supported) throw Error('照片服务尚未更新，请稍后重试。');
    photos=data.davidPhotos;
    renderList(panel.querySelector('.care-mini-list'));
    panel.querySelector('[data-album-count]').textContent=photos.length+' / 24 张';
  }
  async function perform(action) {
    if (pending || !panel) return;
    pending=true;
    const current=panel;
    current.querySelector('fieldset').disabled=true;
    status('正在处理…');
    try { await action(); }
    catch(error) { if(current===panel) status(error.name==='TimeoutError'?'照片请求超时，请先刷新列表确认结果。':error.message || '操作没完成，请重试。'); }
    finally {
      pending=false;
      if (panel) {
        panel.querySelector('fieldset').disabled=false;
        panel.querySelector('[type=submit]').disabled=!supported;
      }
    }
  }
  function makePanel() {
    const card=document.createElement('section');
    card.className='paper-panel care-david-album';
    card.innerHTML='<div class="panel-heading"><div><span>DAVID’S ROOM</span><h2>David 的窗边相册</h2></div><a class="text-button" href="david-room.html">进入 David 的房间 →</a></div><details><summary>上传和管理照片 <small data-album-count></small></summary><p>照片放进 David 的相框，不会占用 Lynn 的位置。两个人走进房间时都能看到挂在墙上的照片。</p><fieldset><form class="care-soft-form"><label>选择相册里的图片<input name="photo" type="file" accept="image/*" required></label><label>照片配文（选填）<input name="caption" type="text" maxlength="120" placeholder="想记住这一刻的什么？"></label><button type="submit" disabled>上传到 David 的相册</button></form><button type="button" data-refresh>刷新相册</button><div class="care-mini-list"></div></fieldset><p role="status"></p></details>';
    const details=card.querySelector('details'), form=card.querySelector('form');
    const reload=()=>perform(async()=>{await refresh();status('');});
    details.ontoggle=()=>{if (details.open&&!supported) reload();};
    card.querySelector('[data-refresh]').onclick=reload;
    form.onsubmit=event=>{
      event.preventDefault();
      const file=form.elements.photo.files[0];
      if (!file || !supported) return;
      perform(async()=>{
        status('正在整理并上传照片…');
        const caption=form.elements.caption.value.trim();
        const [blob,takenAt]=await Promise.all([compress(file),Promise.resolve().then(()=>window.LynnPhotoDates?.fromFile(file)).catch(()=>null)]);
        const headers={'Content-Type':blob.type,'X-Photo-Caption':encodeURIComponent(caption)};
        if (takenAt) headers['X-Photo-Taken-At']=takenAt;
        const created=await (await api('/room/photos',{method:'POST',headers,body:blob})).json();
        form.reset();
        // The write is already committed. A list refresh failure must not invite duplicate uploads.
        photos=[created.photo,...photos];
        renderList(panel.querySelector('.care-mini-list'));
        panel.querySelector('[data-album-count]').textContent=photos.length+' / 24 张';
        status(created.photo.wallSlot<0 ? '已存进相册；有空画框后可再挂上去。' : '已挂上第 '+(created.photo.wallSlot+1)+' 个画框。');
      });
    };
    return card;
  }
  window.LynnCarePhotos=Object.freeze({compress});
  window.addEventListener('lynn-care-rendered',()=>{
    const content=document.querySelector('.care-content'), current=token();
    if (!content || !current) return;
    if (!panel || session!==current) {
      panel?.remove();
      session=current;photos=[];supported=false;panel=makePanel();
    }
    if (!content.contains(panel)) content.prepend(panel);
  });
})();
