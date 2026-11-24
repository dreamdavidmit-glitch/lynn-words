(function (root) {
  'use strict';

  let context = null;
  let cloud = {companion:{active:false}, milestones:[], surprises:[], photos:[]};
  let loading = null;
  let loaded = false;
  let error = '';
  let room3D = null;
  let room3DModule = null;
  let room3DLoader = null;
  let roomObserver = null;
  let roomPhotosKey = '';
  const photoURLs = new Map();
  const photoLoads = new Map();
  const moodNames = {tired:'今天有点累', okay:'今天还可以', good:'今天状态很好'};
  const roomSlots = ['正墙中下','正墙左下','正墙右下','正墙左上','正墙中左上','正墙中右上','正墙右上','左墙前','左墙后','右墙前','右墙中','右墙后'];
  const roomFrames = {walnut:'胡桃木框', champagne:'香槟金框', black:'黑色细框'};
  const roomFurniture = ['bed','lamp','rug','plant','outfit'];
  let wishSending = false;
  let wishStatus = '';
  let wishAttempt = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const connected = () => !!root.LynnSync?.connected?.();
  function roomTheme() {
    if (root.location?.pathname?.endsWith('/room-preview.html') && new URLSearchParams(root.location.search).get('room-style')==='everyday') return '';
    if (root.LynnChristmas?.info?.()) return 'christmas';
    return root.LynnFestivals?.info?.()?.slug || '';
  }

  async function load({afterWrite = false} = {}) {
    if (!connected()) return;
    if (loading) {
      if (!afterWrite) return loading;
      await loading;
      return load({afterWrite});
    }
    loading = refreshCloud();
    try { await loading; }
    finally { loading = null; }
  }

  async function refreshCloud() {
    let refresh = true;
    try {
      const next = await root.LynnSync.companion();
      if (!connected()) return;
      const room = document.querySelector('.monster-room');
      const {wishes:priorWishes, ...prior} = cloud;
      const {wishes:nextWishes, ...current} = next;
      if (loaded && !error && room?.dataset.roomTheme === roomTheme() &&
          JSON.stringify(prior) === JSON.stringify(current)) refresh = false;
      cloud = next; loaded = true; error = '';
      if (!refresh && JSON.stringify(priorWishes) !== JSON.stringify(nextWishes)) renderRoomWishes();
    }
    catch (reason) { error = reason.message || '陪伴空间暂时没有连上云端。'; }
    finally { if (refresh) inject(); }
  }

  function moodHTML() {
    const mood = context?.mood;
    if (mood) return `<section class="companion-card mood-saved"><span class="companion-label">TODAY'S FEELING</span><div class="saved-mood"><i>${mood.level === 'tired' ? '🌙' : mood.level === 'good' ? '✨' : '☁️'}</i><div><h3>${moodNames[mood.level]}</h3><p>${mood.note ? escape(mood.note) : '今天不用解释太多，照顾好自己的节奏就好。'}</p><small>小紫怪已经按这个心情调整了今天的任务。</small></div></div></section>`;
    return `<section class="companion-card mood-card"><span class="companion-label">A SOFT CHECK-IN</span><h2>今天心里是什么天气？</h2><p>选个心情，今天的任务会跟着调整。想写几句也可以，只有你和管理员能看到。</p><form class="mood-form"><div class="mood-options"><label><input type="radio" name="level" value="tired" required><span>🌙<b>有点累</b><small>今天变轻</small></span></label><label><input type="radio" name="level" value="okay"><span>☁️<b>还可以</b><small>舒服就好</small></span></label><label><input type="radio" name="level" value="good"><span>✨<b>状态很好</b><small>多走一点</small></span></label></div><textarea name="note" rows="2" placeholder="想写的话就留在这里…" aria-label="写下今天的情绪"></textarea><button type="submit">收好今天的心情</button></form></section>`;
  }

  function companionHTML() {
    if (!cloud.companion?.active) return '';
    return `<div class="companion-presence" role="status"><span><i></i>有人正在远处陪你一起认真</span><small>不催你，也不看答案，只是安静在这里。</small></div>`;
  }

  function surpriseHTML() {
    const letter = (cloud.surprises || []).find(item => item.unlockDate <= (context?.date || ''));
    if (!letter) return '';
    const ready = !!context?.goalDone;
    return `<section class="companion-card surprise-card ${ready ? 'is-ready' : ''}"><div class="surprise-gift">${escape(letter.gift)}</div><div><span class="companion-label">A LITTLE SURPRISE</span><h2>${ready ? '今天的惊喜信可以打开啦' : '这里藏着一封完成后才能打开的信'}</h2><p>${ready ? '今天的目标已经完成，这封信现在属于你。' : `再认识 ${Math.max(0, (context?.plan?.target || 0) - (context?.newToday || 0))} 个词，就能拆开它。`}</p></div><button type="button" data-companion-action="open-surprise" data-id="${letter.id}" ${ready ? '' : 'disabled'}>${ready ? '打开惊喜信 →' : '完成后解锁'}</button></section>`;
  }

  function roomWishHTML() {
    return `<details class="room-wish">
      <summary>想添件家具？</summary>
      <p>写下想放进房间的家具，可以顺便说说喜欢的颜色或摆放位置。提交后由管理者决定要扣多少星光。</p>
      <form data-room-wish>
        <label>家具愿望<textarea name="body" maxlength="180" rows="3" required placeholder="比如：想在沙发旁放一张浅木色边几。"></textarea></label>
        <button type="submit">送出愿望</button>
      </form>
      <p data-wish-status role="status" hidden></p>
      <ul data-wish-list aria-label="家具愿望记录"></ul>
    </details>`;
  }

  function renderRoomWishes() {
    const panel = document.querySelector('.room-wish');
    if (!panel) return;
    const status = panel.querySelector('[data-wish-status]');
    status.textContent = wishStatus;
    status.hidden = !wishStatus;
    const button = panel.querySelector('button');
    button.disabled = wishSending;
    button.textContent = wishSending ? '正在送出…' : '送出愿望';
    panel.querySelector('textarea').readOnly = wishSending;
    panel.querySelector('[data-wish-list]').innerHTML = (cloud.wishes || []).map(wish => {
      const label = wish.status === 'approved' ? (wish.cost ? `已确认 · 扣除 ${Number(wish.cost)} 点星光` : '已确认 · 免费') :
        wish.status === 'declined' ? '暂不安排' : '待处理';
      return `<li><span>${escape(wish.body)}</span><small>${label}</small></li>`;
    }).join('');
  }

  const roomOpen=()=>root.location?.pathname?.endsWith('/room-preview.html')||root.LynnOpening?.isOpen()===true;
  function roomHTML() {
    if(!roomOpen())return '<section class="companion-card room-card"><div class="room-copy"><h2>小词窝有个小秘密</h2><p>北京时间 11 月 25 日 00:00 再见。现在可以照常背词。</p></div></section>';
    const theme = roomTheme();
    const photoList = cloud.photos || [];
    const occupiedSlots = new Map(photoList.map((photo,index) => [Number.isInteger(Number(photo.wallSlot)) ? Number(photo.wallSlot) : index, Number(photo.id)]));
    const photos = photoList.map((photo,index) => {
      const slot = Number(photo.wallSlot)===-1?-1:Number.isInteger(Number(photo.wallSlot)) && Number(photo.wallSlot) >= 0 && Number(photo.wallSlot) < roomSlots.length ? Number(photo.wallSlot) : index;
      const frameStyle = roomFrames[photo.frameStyle] ? photo.frameStyle : 'walnut';
      const slotOptions = `<option value="-1" ${slot===-1?'selected':''}>未上墙 · 保留在相册</option>`+roomSlots.map((name,slotIndex) => `<option value="${slotIndex}" ${slotIndex === slot ? 'selected' : ''} ${occupiedSlots.has(slotIndex) && occupiedSlots.get(slotIndex) !== Number(photo.id) ? 'disabled' : ''}>${slotIndex + 1} · ${name}</option>`).join('');
      const frameOptions = Object.entries(roomFrames).map(([value,name]) => `<option value="${value}" ${value === frameStyle ? 'selected' : ''}>${name}</option>`).join('');
      return `<figure class="room-photo" data-photo-id="${photo.id}"><div class="room-photo-frame"><span data-photo-status>正在取照片…</span><button type="button" class="room-photo-open" data-companion-action="open-room-photo" data-id="${photo.id}" aria-label="在回忆册中查看${escape(photo.caption || '照片')}"><img data-room-photo="${photo.id}" alt=""></button><button type="button" class="photo-retry" data-companion-action="retry-photo" data-id="${photo.id}">重新加载</button></div><figcaption><span>${escape(photo.caption || '房间里的小照片')}</span><span class="room-photo-actions">${slot>=0?`<button type="button" data-companion-action="unhang-photo" data-id="${photo.id}">从墙上取下</button>`:'<small>未上墙</small>'}<button type="button" data-companion-action="delete-photo" data-id="${photo.id}">删除照片</button></span></figcaption><div class="room-photo-layout"><label>3D 位置<select data-room-photo-slot>${slotOptions}</select></label><label>画框<select data-room-photo-frame>${frameOptions}</select></label><label class="room-photo-date">拍摄日期<input type="date" data-room-photo-date value="${escape(photo.takenAt?.slice(0,10) || '')}" aria-label="拍摄日期"></label></div></figure>`;
    }).join('');
    return `<section class="companion-card room-card"><div class="room-copy"><h2>Lynn 的 3D 房间</h2></div>
      <div class="monster-room" data-room-theme="${escape(theme)}">
        <div class="room-3d-stage" aria-hidden="true"></div>
        <div class="room-load-idle"><button type="button" data-companion-action="open-room">打开 3D 房间</button></div>
        <div class="room-load-error" hidden><p role="status"></p><button type="button" data-companion-action="retry-room">重新加载房间</button></div>
      </div>
      ${roomWishHTML()}<div class="room-gallery"><div class="room-gallery-head"><div><h3>房间照片墙</h3><p>相册可以保存 24 张，墙上可挂 12 张。照片取下后仍在相册里。</p></div><label class="photo-upload">从相册选择<input type="file" accept="image/jpeg,image/png,image/webp" data-room-upload></label></div><label class="photo-caption">给照片写一句话（可不写）<input maxlength="120" data-room-caption placeholder="例如：今天让我开心的小事情"></label><div class="room-photos">${photos || '<p class="room-photo-empty">照片墙还是空的，第一张由你来选。</p>'}</div></div></section>`;
  }

  function milestonesHTML() {
    const items = cloud.milestones || [];
    return `<section class="companion-card milestone-card"><h2>Lynn 的私人纪念册</h2><p>第一次背词、记住第 100 个词、学完第一本词书，都可以在这里回看。</p>${items.length ? `<div class="milestone-line">${items.slice(0, 8).map(item => `<article><i>✦</i><div><time>${new Date(item.achievedAt).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</time><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></div></article>`).join('')}</div>` : '<div class="milestone-empty">完成第一次练习后，这里会留下第一条纪念。</div>'}</section>`;
  }

  function inject() {
    if (document.fullscreenElement?.matches('.room-3d-stage')) {
      document.addEventListener('fullscreenchange', inject, {once:true});
      return;
    }
    const previous = document.querySelector('.companion-space');
    const focused = previous?.contains(document.activeElement) ? document.activeElement : null;
    const oldRoom = previous?.querySelector('.room-card');
    const oldMood = previous?.querySelector('.mood-card');
    const oldWish = oldRoom?.querySelector('.room-wish');
    const oldCaption = oldRoom?.querySelector('[data-room-caption]');
    const hero = context?.route === 'home' ? document.querySelector('#app .hero') : null;
    const photosKey = JSON.stringify([cloud.photos||[],cloud.davidPhotos||[]]);
    const keepRoom = !!hero && oldRoom?.querySelector('.monster-room')?.dataset.roomTheme === roomTheme() && roomPhotosKey === photosKey;
    const reopenRoom = !!hero && !!oldRoom?.querySelector('.room-3d-ready, .room-3d-stage.is-loading');
    if (!keepRoom) {
      roomObserver?.disconnect();
      roomObserver = null;
      room3D?.destroy?.(); room3D = null;
    }
    document.querySelector('.companion-presence')?.remove();
    if (!hero) { previous?.remove(); return; }
    if (cloud.companion?.active) hero.insertAdjacentHTML('beforebegin', companionHTML());
    const space = document.createElement('div');
    space.className = 'companion-space';
    space.innerHTML = `${error ? `<div class="companion-error">${escape(error)}</div>` : ''}${moodHTML()}${surpriseHTML()}${keepRoom ? '<div data-room-placeholder></div>' : roomHTML()}${milestonesHTML()}`;
    const target = document.querySelector('#app .today-card') || hero.nextElementSibling || hero;
    target.insertAdjacentElement('afterend', space);
    if (oldMood && !context.mood) space.querySelector('.mood-card').replaceWith(oldMood);
    else root.LynnLetters?.mount(space.querySelector('.mood-form'), 'mood');
    if (keepRoom) space.querySelector('[data-room-placeholder]').replaceWith(oldRoom);
    else {
      if (oldWish) space.querySelector('.room-wish').replaceWith(oldWish);
      else root.LynnLetters?.mount(space.querySelector('.room-wish form'), 'room-wish');
      if (oldCaption) space.querySelector('[data-room-caption]').replaceWith(oldCaption);
      roomPhotosKey = photosKey;
      observeRoom(space.querySelector('.room-card'), reopenRoom);
    }
    previous?.remove();
    if (focused?.isConnected) focused.focus({preventScroll:true});
    renderRoomWishes();
  }

  function observeRoom(card, reopenRoom) {
    const room = card?.querySelector('.monster-room'), gallery = card?.querySelector('.room-gallery');
    if(!room || !gallery)return; // The countdown view deliberately has no 3D or gallery nodes.
    const isPreview = root.location?.pathname?.endsWith('/room-preview.html');
    if (isPreview || !root.IntersectionObserver) hydratePhotos(gallery);
    else {
      roomObserver = new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !entry.target.isConnected) continue;
          observer.unobserve(entry.target);
          if (entry.target === room) mount3DRoom(room);
          else hydratePhotos(gallery);
        }
      }, {rootMargin: '180px 0px'});
      roomObserver.observe(gallery);
      if (!reopenRoom) roomObserver.observe(room);
    }
    if (isPreview || reopenRoom) mount3DRoom(room);
  }

  function loadRoom3DEngine() {
    if (root.LynnRoom3D) return Promise.resolve(root.LynnRoom3D);
    if (room3DLoader) return room3DLoader;
    const localAssets = root.location?.protocol === 'file:' && !root.LynnRoomLocalAssets ? new Promise((resolve,reject) => {
      const pack = document.createElement('script');
      pack.src = 'room3d.assets.local.js';
      pack.onload = resolve;
      pack.onerror = () => reject(new Error('请先生成本地房间素材包，或从本地预览网址打开'));
      document.head.appendChild(pack);
    }) : Promise.resolve();
    room3DLoader = localAssets.then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'room3d.bundle.js?v=david-album-1';
      script.async = true;
      script.dataset.room3dEngine = 'true';
      script.onload = () => root.LynnRoom3D ? resolve(root.LynnRoom3D) : reject(new Error('3D engine did not initialize'));
      script.onerror = () => reject(new Error('3D engine could not be loaded'));
      document.head.appendChild(script);
    }));
    room3DLoader = room3DLoader.catch(error => { room3DLoader = null; throw error; });
    return room3DLoader;
  }

  async function mount3DRoom(room) {
    if(!roomOpen())return;
    const stage = room?.querySelector('.room-3d-stage');
    if (!stage?.isConnected || stage.classList.contains('is-loading') || room3D) return;
    roomObserver?.unobserve(room);
    room.querySelector('.room-load-idle').hidden = true;
    const failure = room.querySelector('.room-load-error');
    failure.hidden = true;
    stage.classList.add('is-loading');
    try {
      room3DModule ||= await loadRoom3DEngine();
      if (!stage.isConnected) return;
      if (!room3DModule.supportsRoom3D()) throw new Error('当前浏览器无法打开 3D 房间。');
      const photos=cloud.photos || [], davidPhotos=cloud.davidPhotos || [];
      const localPreview=root.location?.pathname?.endsWith('/room-preview.html');
      const exchange=localPreview ? room3DModule.createPreviewRoomExchange('lynn') : (connected() ? root.LynnSync?.roomLive : null);
      room3D = room3DModule.mountRoom3D(stage, {owned:roomFurniture, photos, davidPhotos, photoCatalog:[...photos,...davidPhotos], loadPhotoURL:ensurePhotoURL, theme:room.dataset.roomTheme, onPhoto:show3DPhoto, exchange, outboxKey:'lynn:glass-outbox:'+(localPreview?'preview:':'')+'lynn'});
      stage.classList.remove('is-loading');
    } catch (reason) {
      if (!stage.isConnected) return;
      console.warn('[Lynn room] 3D load failed:', reason);
      stage.classList.remove('is-loading');
      failure.querySelector('p').textContent = '3D 房间暂时没打开。可以重试，或用支持 3D 的浏览器打开。';
      failure.hidden = false;
    }
  }

  async function showPhoto(image, url) {
    const frame = image.closest('.room-photo-frame');
    frame?.classList.remove('loaded', 'failed');
    const ready = new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, {once:true});
      image.addEventListener('error', () => reject(new Error('照片解码失败')), {once:true});
    });
    image.src = url;
    if (!(image.complete && image.naturalWidth > 0)) await ready;
    if (typeof image.decode === 'function') await image.decode().catch(() => {});
    frame?.classList.add('loaded');
  }

  async function ensurePhotoURL(id) {
    const cached = photoURLs.get(id);
    if (cached) return cached;
    if (photoLoads.has(id)) return photoLoads.get(id);
    const task = (async () => {
      const blob = await root.LynnSync.roomPhoto(id);
      if (!blob?.size) throw new Error('云端返回的照片是空的');
      const url = URL.createObjectURL(blob);
      photoURLs.set(id, url);
      return url;
    })();
    photoLoads.set(id, task);
    try { return await task; }
    finally { photoLoads.delete(id); }
  }

  async function hydratePhoto(image, force = false) {
    const id = Number(image.dataset.roomPhoto), frame = image.closest('.room-photo-frame');
    const status = frame?.querySelector('[data-photo-status]');
    try {
      if (force) {
        const previous = photoURLs.get(id);
        if (previous) URL.revokeObjectURL(previous);
        photoURLs.delete(id);
      }
      const url = await ensurePhotoURL(id);
      await showPhoto(image, url);
    } catch (_) {
      frame?.classList.remove('loaded');
      frame?.classList.add('failed');
      if (status) status.textContent = '照片暂时没取到';
    }
  }

  async function hydratePhotos(card) {
    await Promise.allSettled([...card.querySelectorAll('img[data-room-photo]')].map(image => hydratePhoto(image)));
  }

  async function compressPhoto(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
    if (file.size > 20 * 1024 * 1024) throw new Error('原图不能超过 20 MB。');
    let source, width, height, cleanup = () => {};
    if (typeof createImageBitmap === 'function') { source = await createImageBitmap(file, {imageOrientation:'from-image'}); width = source.width; height = source.height; cleanup = () => source.close?.(); }
    else { const url = URL.createObjectURL(file); source = await new Promise((resolve,reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('这张图片暂时无法读取。')); image.src = url; }); width = source.naturalWidth; height = source.naturalHeight; cleanup = () => URL.revokeObjectURL(url); }
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height); cleanup();
    let blob = null;
    for (const quality of [.82, .68, .56]) { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality)); if (blob && blob.size <= 1_500_000) break; }
    if (!blob) throw new Error('这张图片暂时无法压缩。');
    if (blob.size > 1_500_000) throw new Error('图片压缩后仍然太大，请换一张。');
    return blob;
  }

  function showLetter(letter) {
    const layer = document.createElement('div'); layer.className = 'surprise-modal';
    layer.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="surprise-title"><button type="button" data-companion-action="close-letter" aria-label="关闭">×</button><div class="opened-gift">${escape(letter.gift)}</div><span class="companion-label">JUST FOR LYNN</span><h2 id="surprise-title">今天的惊喜信</h2><p>${escape(letter.body).replace(/\n/g,'<br>')}</p><small>完成今天的目标以后，它才来到你手里。</small></section>`;
    document.body.appendChild(layer); requestAnimationFrame(() => layer.classList.add('show'));
  }

  function show3DPhoto(photo) {
    root.LynnRoomAlbum.open(photo,{
      photos:(photo.owner==='david' ? cloud.davidPhotos : cloud.photos) || [],loadURL:ensurePhotoURL,isAvailable:connected,
      draftScope:location.pathname.endsWith('/room-preview.html') ? 'preview-lynn' : 'lynn',
      readNotes:root.LynnSync?.roomPhotoNotes,postNote:root.LynnSync?.postRoomPhotoNote,
      retryPhoto(id) {
        const url=photoURLs.get(id);
        if (url) URL.revokeObjectURL(url);
        photoURLs.delete(id);
      }
    });
  }

  document.addEventListener('submit', event => {
    const wish = event.target.closest('[data-room-wish]');
    if (wish) {
      event.preventDefault();
      if (wishSending) return;
      if (!connected()) { root.LynnSync?.open?.(); return; }
      const text = wish.elements.body.value.trim();
      if (!text) { wishStatus = '请先写下想添的家具。'; renderRoomWishes(); return; }
      wishAttempt = wishAttempt?.text === text ? wishAttempt : {text, key:crypto.randomUUID()};
      wishSending = true;
      wishStatus = '';
      renderRoomWishes();
      root.LynnSync.submitRoomWish(text,wishAttempt.key).then(({wish:created}) => {
        cloud.wishes = [created,...(cloud.wishes || []).filter(item => item.id !== created.id)];
        wish.reset();
        root.LynnLetters?.clear('room-wish');
        wishAttempt = null;
        wishStatus = '愿望送到啦。处理结果会留在这里。';
      }).catch(reason => { wishStatus = reason.message || '愿望暂时没送到，可以再试一次。'; })
        .finally(() => { wishSending = false; renderRoomWishes(); });
      return;
    }
    const form = event.target.closest('.mood-form'); if (!form) return;
    event.preventDefault(); const data = new FormData(form), level = String(data.get('level') || ''), note = String(data.get('note') || '').trim();
    root.dispatchEvent(new CustomEvent('lynn-mood-submit', {detail:{level, note}}));
  });

  document.addEventListener('change', async event => {
    const dateInput = event.target.closest('[data-room-photo-date]');
    if (dateInput) {
      const id = Number(dateInput.closest('.room-photo')?.dataset.photoId);
      const photo = cloud.photos.find(item => Number(item.id) === id);
      if (!photo) return;
      const previous = photo.takenAt?.slice(0,10) || '';
      if (dateInput.value === previous) return;
      dateInput.disabled = true;
      try {
        await root.LynnSync.updateRoomPhotoDate(id,dateInput.value || null);
        await load({afterWrite:true});
      } catch (reason) {
        dateInput.value = previous;
        error = reason.message || '拍摄日期没有保存，请再试一次。';
        inject();
      } finally { dateInput.disabled = false; }
      return;
    }
    const layoutInput = event.target.closest('[data-room-photo-slot], [data-room-photo-frame]');
    if (layoutInput) {
      const figure = layoutInput.closest('.room-photo'), id = Number(figure?.dataset.photoId);
      const wallSlot = Number(figure?.querySelector('[data-room-photo-slot]')?.value);
      const frameStyle = String(figure?.querySelector('[data-room-photo-frame]')?.value || 'walnut');
      const controls = [...(figure?.querySelectorAll('select') || [])]; controls.forEach(control => { control.disabled = true; });
      try { await root.LynnSync.updateRoomPhotoLayout(id, wallSlot, frameStyle); await load({afterWrite:true}); }
      catch (reason) {
        const photo = cloud.photos.find(item => Number(item.id) === id);
        if (photo) {
          figure.querySelector('[data-room-photo-slot]').value = photo.wallSlot;
          figure.querySelector('[data-room-photo-frame]').value = photo.frameStyle || 'walnut';
        }
        error = reason.message || '照片位置没有保存，请再试一次。'; inject();
      }
      finally { controls.forEach(control => { control.disabled = false; }); }
      return;
    }
    const input = event.target.closest('[data-room-upload]'); if (!input) return;
    const file = input.files?.[0]; if (!file) return;
    if (!connected()) { root.LynnSync?.open?.(); input.value = ''; return; }
    const label = input.closest('.photo-upload'), original = label.firstChild.textContent; label.firstChild.textContent = '正在整理照片…'; input.disabled = true;
    const captionInput = input.closest('.room-gallery').querySelector('[data-room-caption]');
    const caption = captionInput.value.trim();
    try {
      const takenAt = await root.LynnPhotoDates?.fromFile(file);
      const blob = await compressPhoto(file);
      await root.LynnSync.uploadRoomPhoto(blob, caption, takenAt);
      if (captionInput.value.trim() === caption) captionInput.value = '';
      await load({afterWrite:true});
    }
    catch (reason) { error = reason.message || '照片没有放进去，请再试一次。'; inject(); }
    finally { input.value = ''; input.disabled = false; label.firstChild.textContent = original; }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-companion-action]'); if (!button) return;
    const action = button.dataset.companionAction;
    if (action === 'close-letter') { button.closest('.surprise-modal')?.remove(); return; }
    if (action === 'open-room-photo') {
      show3DPhoto(cloud.photos.find(photo => Number(photo.id) === Number(button.dataset.id)));
      return;
    }
    if (action === 'open-room' || action === 'retry-room') { mount3DRoom(button.closest('.monster-room')); return; }
    if (action === 'open-surprise') {
      button.disabled = true; button.textContent = '正在拆信…';
      try { const result = await root.LynnSync.openSurprise(button.dataset.id); cloud.surprises = cloud.surprises.filter(item => item.id !== result.letter.id); inject(); showLetter(result.letter); }
      catch (reason) { error = reason.message; inject(); }
    }
    if (action === 'retry-photo') {
      const image = button.closest('.room-photo-frame')?.querySelector('img[data-room-photo]');
      if (!image) return;
      button.disabled = true;
      const status = button.closest('.room-photo-frame')?.querySelector('[data-photo-status]');
      if (status) status.textContent = '正在重新取照片…';
      await hydratePhoto(image, true);
      button.disabled = false;
      return;
    }
    if (action === 'unhang-photo') {
      const id=Number(button.dataset.id),photo=cloud.photos.find(p=>Number(p.id)===id);if(!photo)return;
      button.disabled=true;
      try{await root.LynnSync.updateRoomPhotoLayout(id,-1,photo.frameStyle||'walnut');await load({afterWrite:true});}
      catch(reason){error=reason.message;inject();}
      finally{button.disabled=false;}
      return;
    }
    if (action === 'delete-photo') {
      if (!confirm('永久删除这张照片及背面的留言？如果只想腾出画框，请选「从墙上取下」。')) return;
      button.disabled = true;
      try { const id = Number(button.dataset.id); await root.LynnSync.removeRoomPhoto(id); const url = photoURLs.get(id); if (url) URL.revokeObjectURL(url); photoURLs.delete(id); await load({afterWrite:true}); }
      catch (reason) { error = reason.message; inject(); }
    }
  });

  let wasConnected = false;
  root.addEventListener('lynn-opening',()=>{if(context?.route==='home')inject();});
  root.addEventListener('lynn-sync-status', () => {
    const online = connected();
    if (online === wasConnected) return;
    wasConnected = online;
    if (online && context?.route === 'home') load();
    if (!online) { root.LynnRoomAlbum?.close(); inject(); }
  });
  function refreshHome() {
    if (!document.hidden && connected() && context?.route === 'home') load();
  }
  document.addEventListener('visibilitychange', refreshHome);
  setInterval(refreshHome, 60_000);
  root.addEventListener('pagehide', () => { for (const url of photoURLs.values()) URL.revokeObjectURL(url); photoURLs.clear(); photoLoads.clear(); });

  root.LynnCompanion = {
    render(nextContext) {
      const enteringHome = context?.route !== 'home' && nextContext.route === 'home';
      context = nextContext;
      inject();
      if (enteringHome && connected()) load();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
