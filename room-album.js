(() => {
  let roomAlbum=null;
  function photoMoment(photo) {
    const value = photo.takenAt || photo.createdAt;
    const time = Date.parse(value?.length === 10 ? value + 'T00:00:00' : value);
    return Number.isFinite(time) ? time : 0;
  }

  function open(photo,{photos:items,loadURL,retryPhoto,readNotes,postNote,draftScope,isAvailable=()=>true}) {
    if (!photo || !isAvailable()) return;
    const photos = [...items].sort((a,b) => photoMoment(a) - photoMoment(b) || Number(a.id) - Number(b.id));
    let index = photos.findIndex(item => Number(item.id) === Number(photo.id));
    if (index < 0) {
      if (!photo.url) return;
      index = photos.length;
      photos.push(photo);
    }
    roomAlbum?.close();
    const focusBefore = document.activeElement;
    const album = document.createElement('dialog');
    album.className = 'room-photo-viewer';
    album.setAttribute('aria-labelledby','room-album-title');
    album.innerHTML = `<header><h2 id="room-album-title">房间回忆册</h2><button type="button" class="room-album-close" aria-label="关闭照片" autofocus>×</button></header>
      <figure><div class="room-album-image"><img alt="" hidden><div class="room-album-status"><p role="status"></p><button type="button" hidden>重试</button></div></div>
      <figcaption><time></time><p class="room-album-caption"></p></figcaption></figure>
      <section class="room-album-back" id="room-album-back" hidden>
        <h3>相框背面</h3><button type="button" data-older hidden>更早的留言</button>
        <ol aria-label="照片留言"></ol><div class="room-note-feedback" role="status"></div>
        <button type="button" data-note-retry hidden>重试读取</button>
        <form><label>留句话<textarea rows="2" required></textarea></label>
        <button type="submit">写到背面</button></form>
      </section>
      <button class="room-album-flip" type="button" aria-controls="room-album-back" aria-expanded="false" hidden>翻到背面留言</button>
      <nav aria-label="翻阅照片"><button type="button" data-room-album-step="-1">上一张</button><output aria-live="polite"></output><button type="button" data-room-album-step="1">下一张</button></nav>`;
    roomAlbum = album;
    const image = album.querySelector('img'), date = album.querySelector('time'), caption = album.querySelector('.room-album-caption');
    const status = album.querySelector('.room-album-status p'), retry = album.querySelector('.room-album-status button');
    const previous = album.querySelector('[data-room-album-step="-1"]'), next = album.querySelector('[data-room-album-step="1"]');
    const count = album.querySelector('output');
    const back=album.querySelector('.room-album-back'), front=album.querySelector('figure');
    const flip=album.querySelector('.room-album-flip'), list=back.querySelector('ol');
    const feedback=back.querySelector('.room-note-feedback'), older=back.querySelector('[data-older]');
    const noteRetry=back.querySelector('[data-note-retry]'), form=back.querySelector('form');
    const field=form.querySelector('textarea'), send=form.querySelector('[type=submit]');
    const busy=new Set();
    let generation=0, threadVersion=0, entries=[];
    const key=()=>photos[index].id;
    const draftName=id=>'photo:'+draftScope+':'+id;
    const draft=id=>LynnLetters.read(draftName(id)) || {body:'',clientId:''};
    const renderEntries=()=>{
      list.replaceChildren(...entries.map(item=>{
        const li=document.createElement('li'), name=document.createElement('strong'), body=document.createElement('p');
        name.textContent=item.author==='david' ? 'David' : 'Lynn';
        body.textContent=item.body;
        li.append(name,body);
        return li;
      }));
    };
    async function fetchNotes(before) {
      const id=key(),version=++threadVersion;
      feedback.textContent='正在读取留言…';
      older.disabled=true;
      noteRetry.hidden=true;
      try {
        const result=await readNotes(id,before);
        if(version!==threadVersion || !album.open) return;
        entries=before ? [...result.notes,...entries] : result.notes;
        older.hidden=!result.more;
        renderEntries();
        feedback.textContent=entries.length ? '' : '这张照片背面还没有留言。';
      } catch (error) {
        if(version!==threadVersion || !album.open) return;
        feedback.textContent=error.message || '暂时读不到留言。';
        noteRetry.hidden=false;
      } finally {
        if(version===threadVersion) older.disabled=false;
      }
    }
    function drawBack() {
      threadVersion++;
      entries=[];
      renderEntries();
      older.hidden=true;
      field.value=draft(key()).body;
      send.disabled=field.disabled=busy.has(key());
      if (!back.hidden) fetchNotes();
    }
    flip.hidden=!readNotes || !postNote;
    flip.onclick=()=>{
      back.hidden=!back.hidden;
      front.hidden=!back.hidden;
      flip.textContent=back.hidden ? '翻到背面留言' : '翻回照片';
      flip.setAttribute('aria-expanded',String(!back.hidden));
      if (back.hidden) threadVersion++;
      else drawBack();
    };
    function saveDraft() {
      const id=key(),previous=draft(id);
      if (!busy.has(id) && previous.body!==field.value) LynnLetters.write(draftName(id),{body:field.value,clientId:''});
    }
    field.oninput=saveDraft;
    field.oncompositionend=saveDraft;
    older.onclick=()=>fetchNotes(entries[0]?.id);
    noteRetry.onclick=()=>fetchNotes();
    form.onsubmit=async event=>{
      event.preventDefault();
      const id=key(),note={...draft(id)},body=field.value.trim();
      if (!body || busy.has(id)) return;
      note.body=field.value;
      note.clientId ||= globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      LynnLetters.write(draftName(id),note);
      busy.add(id);
      field.disabled=send.disabled=true;
      feedback.textContent='正在保存…';
      try {
        await postNote(id,body,note.clientId);
        LynnLetters.clear(draftName(id),note);
        if(album.open && key()===id && !back.hidden) {
          field.value=draft(id).body;
          await fetchNotes();
        }
      } catch (error) {
        if(album.open && key()===id && !back.hidden) feedback.textContent=error.message || '留言还没保存，点按钮重试。';
      } finally {
        busy.delete(id);
        if(album.open && key()===id) field.disabled=send.disabled=false;
      }
    };

    async function drawPhoto() {
      const current = photos[index], render = ++generation;
      image.hidden = true;
      image.removeAttribute('src');
      status.textContent = '正在取照片…';
      retry.hidden = true;
      const recordedAt = current.takenAt || current.createdAt;
      const daysOnly = recordedAt?.length === 10;
      const displayDate = new Date(current.takenAt ? current.takenAt + (daysOnly ? 'T00:00:00Z' : 'Z') : current.createdAt);
      date.hidden = !Number.isFinite(displayDate.getTime());
      if (!date.hidden) {
        date.dateTime = recordedAt;
        const format = new Intl.DateTimeFormat('zh-CN',{
          year:'numeric',month:'long',day:'numeric',...(daysOnly ? {} : {hour:'2-digit',minute:'2-digit'}),
          ...(current.takenAt ? {timeZone:'UTC'} : {})
        });
        date.textContent = (current.takenAt ? '拍摄于 ' : '上传于 ') + format.format(displayDate);
      }
      caption.textContent = current.caption || '';
      caption.hidden = !current.caption;
      previous.disabled = index === 0;
      next.disabled = index === photos.length - 1;
      if (document.activeElement === previous && previous.disabled && !next.disabled) next.focus();
      if (document.activeElement === next && next.disabled && !previous.disabled) previous.focus();
      count.textContent = `${index+1} / ${photos.length}`;
      drawBack();
      try {
        const url=await loadURL(current.id);
        if (render !== generation || !album.open) return;
        image.alt = current.caption || '房间里的照片';
        image.src = url;
        await image.decode?.();
        if (render !== generation || !album.open) return;
        status.textContent = '';
        image.hidden = false;
      } catch (_) {
        if (render !== generation || !album.open) return;
        status.textContent = '这张照片暂时没取到。';
        retry.hidden = false;
      }
    }

    function step(amount) {
      const target = index + amount;
      if (target < 0 || target >= photos.length) return;
      index = target;
      drawPhoto();
    }
    previous.onclick = () => step(-1);
    next.onclick = () => step(1);
    retry.onclick = () => {
      const id = Number(photos[index].id);
      retryPhoto?.(id);
      drawPhoto();
    };
    album.querySelector('.room-album-close').onclick = () => album.close();
    album.addEventListener('keydown', event => {
      if (event.target===field || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    });
    let touch = null;
    image.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      touch = {x:event.clientX,y:event.clientY};
      image.setPointerCapture?.(event.pointerId);
    });
    image.addEventListener('pointerup', event => {
      if (!touch) return;
      const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
      touch = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)*1.3) step(dx < 0 ? 1 : -1);
    });
    image.addEventListener('pointercancel', () => { touch = null; });
    album.addEventListener('close', () => {
      generation++;
      threadVersion++;
      album.remove();
      if (roomAlbum === album) {
        roomAlbum = null;
        if (focusBefore?.isConnected && isAvailable()) focusBefore.focus({preventScroll:true});
      }
    });
    const stage = document.fullscreenElement;
    (stage?.matches('.room-3d-stage') ? stage : document.body).appendChild(album);
    album.showModal();
    drawPhoto();
  }

  window.LynnRoomAlbum={open,close:()=>roomAlbum?.close()};
})();
