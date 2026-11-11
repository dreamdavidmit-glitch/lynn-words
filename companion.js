(function (root) {
  'use strict';

  let context = null;
  let cloud = {companion:{active:false}, milestones:[], surprises:[], photos:[]};
  let loading = false;
  let loaded = false;
  let error = '';
  const photoURLs = new Map();
  const moodNames = {tired:'今天有点累', okay:'今天还可以', good:'今天状态很好'};
  const rooms = [
    {key:'lamp', stars:25, icon:'🛋️', name:'一盏暖灯'},
    {key:'shelf', stars:100, icon:'📚', name:'紫色书架'},
    {key:'window', stars:250, icon:'🪟', name:'星光窗户'},
    {key:'rug', stars:500, icon:'🟣', name:'软软地毯'},
    {key:'plant', stars:900, icon:'🪴', name:'记忆小树'},
    {key:'crown', stars:1600, icon:'👑', name:'小紫怪皇冠'}
  ];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const connected = () => !!root.LynnSync?.connected?.();
  const stars = () => Math.max(0, (context?.seen || 0) + (context?.remembered || 0) * 2 + (context?.studyDays || 0) * 5);
  const unlocked = () => rooms.filter(item => stars() >= item.stars);
  const nextRoom = () => rooms.find(item => stars() < item.stars);

  async function load(silent = false) {
    if (!connected() || loading) return;
    loading = true; if (!silent) inject();
    try { cloud = await root.LynnSync.companion(); loaded = true; error = ''; }
    catch (reason) { error = reason.message || '陪伴空间暂时没有连上云端。'; }
    finally { loading = false; inject(); }
  }

  function moodHTML() {
    const mood = context?.mood;
    if (mood) return `<section class="companion-card mood-saved"><span class="companion-label">TODAY'S FEELING</span><div class="saved-mood"><i>${mood.level === 'tired' ? '🌙' : mood.level === 'good' ? '✨' : '☁️'}</i><div><h3>${moodNames[mood.level]}</h3><p>${mood.note ? escape(mood.note) : '今天不用解释太多，照顾好自己的节奏就好。'}</p><small>小紫怪已经按这个心情调整了今天的任务。</small></div></div></section>`;
    return `<section class="companion-card mood-card"><span class="companion-label">A SOFT CHECK-IN</span><h2>今天心里是什么天气？</h2><p>可以只选一个，也可以写下一点点。只有你和管理页面能看到。</p><form class="mood-form"><div class="mood-options"><label><input type="radio" name="level" value="tired" required><span>🌙<b>有点累</b><small>今天变轻</small></span></label><label><input type="radio" name="level" value="okay"><span>☁️<b>还可以</b><small>舒服就好</small></span></label><label><input type="radio" name="level" value="good"><span>✨<b>状态很好</b><small>多走一点</small></span></label></div><textarea name="note" maxlength="200" rows="2" placeholder="想写的话就留在这里…" aria-label="写下今天的情绪"></textarea><button type="submit">收好今天的心情</button></form></section>`;
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

  function roomHTML() {
    const total = stars(), owned = new Set(unlocked().map(item => item.key)), next = nextRoom();
    const photos = (cloud.photos || []).map(photo => `<figure class="room-photo"><div class="room-photo-frame"><span>正在取照片…</span><img data-room-photo="${photo.id}" alt="${escape(photo.caption || 'Lynn 放进房间的照片')}"></div><figcaption>${escape(photo.caption || '房间里的小照片')}<button type="button" data-companion-action="delete-photo" data-id="${photo.id}" aria-label="移除这张照片">×</button></figcaption></figure>`).join('');
    return `<section class="companion-card room-card"><div class="room-copy"><span class="companion-label">LITTLE MONSTER'S ROOM</span><h2>小紫怪的房间</h2><p>认真学习会变成星光，慢慢把房间填满。休息不会扣掉任何东西。</p><div class="star-wallet">✦ ${total} 点星光</div>${next ? `<small>再有 ${next.stars - total} 点，解锁「${next.name}」</small>` : '<small>房间里的东西已经全部亮起来啦。</small>'}<div class="room-unlocks">${rooms.map(item => `<span class="${owned.has(item.key) ? 'owned' : 'locked'}" title="${item.name} · ${item.stars} 点">${owned.has(item.key) ? item.icon : '·'}<b>${item.name}</b></span>`).join('')}</div></div><div class="monster-room ${[...owned].map(key => 'has-' + key).join(' ')}"><div class="room-window">✦</div><div class="room-lamp">☼</div><div class="room-shelf">A B C</div><div class="room-plant">♧</div><div class="room-rug"></div><img src="mascot.svg" alt="小紫怪在自己的房间里"><div class="room-crown">♛</div></div><div class="room-gallery"><div class="room-gallery-head"><div><h3>房间照片墙</h3><p>从相册挑喜欢的照片放进小房间，最多 12 张。</p></div><label class="photo-upload">从相册选择<input type="file" accept="image/jpeg,image/png,image/webp" data-room-upload></label></div><label class="photo-caption">给照片写一句话（可不写）<input maxlength="120" data-room-caption placeholder="例如：今天让我开心的小事情"></label><div class="room-photos">${photos || '<p class="room-photo-empty">照片墙还是空的，第一张由你来选。</p>'}</div></div></section>`;
  }

  function milestonesHTML() {
    const items = cloud.milestones || [];
    return `<section class="companion-card milestone-card"><span class="companion-label">LYNN'S PRIVATE MEMORY BOOK</span><h2>Lynn 的私人纪念册</h2><p>不是排行榜，只把那些值得记住的第一次，好好留在这里。</p>${items.length ? `<div class="milestone-line">${items.slice(0, 8).map(item => `<article><i>✦</i><div><time>${new Date(item.achievedAt).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</time><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></div></article>`).join('')}</div>` : '<div class="milestone-empty">第一条纪念正在路上。认真出现一次，它就会开始记录。</div>'}</section>`;
  }

  function inject() {
    document.querySelector('.companion-space')?.remove();
    document.querySelector('.companion-presence')?.remove();
    if (!context || context.route !== 'home') return;
    const hero = document.querySelector('#app .hero');
    if (!hero) return;
    if (cloud.companion?.active) hero.insertAdjacentHTML('beforebegin', companionHTML());
    const space = document.createElement('div');
    space.className = 'companion-space';
    space.innerHTML = `${error ? `<div class="companion-error">${escape(error)}</div>` : ''}${moodHTML()}${surpriseHTML()}${roomHTML()}${milestonesHTML()}`;
    const target = document.querySelector('#app .today-card') || hero.nextElementSibling;
    (target || hero).insertAdjacentElement(target ? 'afterend' : 'afterend', space);
    hydratePhotos();
  }

  async function hydratePhotos() {
    for (const image of document.querySelectorAll('img[data-room-photo]')) {
      const id = Number(image.dataset.roomPhoto);
      try {
        let url = photoURLs.get(id);
        if (!url) { url = URL.createObjectURL(await root.LynnSync.roomPhoto(id)); photoURLs.set(id, url); }
        image.src = url; image.closest('.room-photo-frame')?.classList.add('loaded');
      } catch (_) { image.closest('.room-photo-frame')?.classList.add('failed'); }
    }
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

  document.addEventListener('submit', event => {
    const form = event.target.closest('.mood-form'); if (!form) return;
    event.preventDefault(); const data = new FormData(form), level = String(data.get('level') || ''), note = String(data.get('note') || '').trim();
    root.dispatchEvent(new CustomEvent('lynn-mood-submit', {detail:{level, note}}));
  });

  document.addEventListener('change', async event => {
    const input = event.target.closest('[data-room-upload]'); if (!input) return;
    const file = input.files?.[0]; if (!file) return;
    if (!connected()) { root.LynnSync?.open?.(); input.value = ''; return; }
    const label = input.closest('.photo-upload'), original = label.firstChild.textContent; label.firstChild.textContent = '正在整理照片…'; input.disabled = true;
    try { const blob = await compressPhoto(file); const caption = document.querySelector('[data-room-caption]')?.value.trim() || ''; await root.LynnSync.uploadRoomPhoto(blob, caption); await load(); }
    catch (reason) { error = reason.message || '照片没有放进去，请再试一次。'; inject(); }
    finally { input.value = ''; input.disabled = false; label.firstChild.textContent = original; }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-companion-action]'); if (!button) return;
    const action = button.dataset.companionAction;
    if (action === 'close-letter') { button.closest('.surprise-modal')?.remove(); return; }
    if (action === 'open-surprise') {
      button.disabled = true; button.textContent = '正在拆信…';
      try { const result = await root.LynnSync.openSurprise(button.dataset.id); cloud.surprises = cloud.surprises.filter(item => item.id !== result.letter.id); inject(); showLetter(result.letter); }
      catch (reason) { error = reason.message; inject(); }
    }
    if (action === 'delete-photo') {
      if (!confirm('把这张照片从小紫怪房间移除吗？')) return;
      button.disabled = true;
      try { const id = Number(button.dataset.id); await root.LynnSync.removeRoomPhoto(id); const url = photoURLs.get(id); if (url) URL.revokeObjectURL(url); photoURLs.delete(id); await load(); }
      catch (reason) { error = reason.message; inject(); }
    }
  });

  root.addEventListener('lynn-sync-status', () => { if (connected()) load(true); else inject(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && connected()) load(true); });
  setInterval(() => { if (!document.hidden && connected()) load(true); }, 60_000);

  root.LynnCompanion = {
    render(nextContext) { context = nextContext; inject(); if (connected() && !loading && !loaded) load(true); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
