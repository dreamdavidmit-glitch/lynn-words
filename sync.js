(function (root) {
  'use strict';

  const ENDPOINT = 'https://lynn-words-sync.lynn-words-work.workers.dev';
  const TOKEN_KEY = 'lynn:syncToken';
  const META_KEY = 'lynn:syncMeta';
  const DEVICE_KEY = 'lynn:syncDevice';
  const ADMIN_TOKEN_KEY = 'lynn:adminToken';
  const SETUP_TOKEN_KEY = 'lynn:setupToken';
  const CLAIM_PREFIX = '#sync-setup=';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let model, getState, applyState, notify, timer = 0, claimOpenTimer = 0, ready = false, busy = false, pendingRemote = null, adminMode = '', adminSnapshots = null, snapshotPreview = null;
  let status = {kind: 'disconnected', text: '仅保存在本机'};

  const storage = {
    get(key) { try { return root.localStorage?.getItem(key) || ''; } catch (_) { return ''; } },
    set(key, value) { try { root.localStorage?.setItem(key, value); } catch (_) {} },
    remove(key) { try { root.localStorage?.removeItem(key); } catch (_) {} }
  };
  const session = {
    get(key) { try { return root.sessionStorage?.getItem(key) || ''; } catch (_) { return ''; } },
    set(key, value) { try { root.sessionStorage?.setItem(key, value); } catch (_) {} },
    remove(key) { try { root.sessionStorage?.removeItem(key); } catch (_) {} }
  };
  const token = () => storage.get(TOKEN_KEY);
  const adminToken = () => session.get(ADMIN_TOKEN_KEY);
  const setupToken = () => session.get(SETUP_TOKEN_KEY);
  const meta = () => { try { return JSON.parse(storage.get(META_KEY)) || {}; } catch (_) { return {}; } };
  const setMeta = value => storage.set(META_KEY, JSON.stringify(value));
  const deviceId = () => {
    let value = storage.get(DEVICE_KEY);
    if (!value) { value = root.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`; storage.set(DEVICE_KEY, value); }
    return value;
  };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

  function setStatus(kind, text, detail = '') {
    status = {kind, text, detail};
    renderBadge();
    root.dispatchEvent?.(new CustomEvent('lynn-sync-status', {detail: status}));
  }

  function friendlyTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}); }
    catch (_) { return ''; }
  }

  function renderBadge() {
    let button = root.document?.querySelector('.sync-pill');
    if (!button && root.document?.body) {
      button = root.document.createElement('button');
      button.type = 'button'; button.className = 'sync-pill'; button.dataset.syncOpen = '1';
      root.document.body.appendChild(button);
    }
    if (!button) return;
    const icon = status.kind === 'synced' ? '☁️' : status.kind === 'syncing' ? '↻' : status.kind === 'conflict' ? '⚠️' : status.kind === 'offline' ? '⌁' : '☁︎';
    button.className = `sync-pill is-${status.kind}`;
    button.innerHTML = `<span>${icon}</span><span>${escapeHTML(status.text)}</span>`;
    button.title = status.detail || '打开云端同步';
  }

  function payloadFor(state) {
    return JSON.stringify({app: model.APP_ID, version: model.VERSION, state: model.validate(state)});
  }

  async function digest(text) {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function encodePayload(text) {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      return {body: await new Response(stream).arrayBuffer(), encoding: 'gzip'};
    }
    return {body: encoder.encode(text), encoding: 'json'};
  }

  async function decodePayload(buffer, encoding) {
    if (encoding === 'gzip') {
      if (typeof DecompressionStream !== 'function') throw new Error('这个浏览器太旧，暂时无法读取云端进度。');
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text();
    }
    return decoder.decode(buffer);
  }

  async function api(path, options = {}) {
    const {auth = true, tokenOverride = '', ...fetchOptions} = options;
    const headers = new Headers(fetchOptions.headers || {});
    if (tokenOverride) headers.set('Authorization', `Bearer ${tokenOverride}`);
    else if (auth && token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(ENDPOINT + path, {...fetchOptions, headers});
    if (response.status === 401 && auth && !tokenOverride) { storage.remove(TOKEN_KEY); ready = false; setStatus('disconnected', '请重新连接云端'); }
    return response;
  }

  async function errorMessage(response) {
    try { const data = await response.json(); return data.error || `同步失败（${response.status}）`; }
    catch (_) { return `同步失败（${response.status}）`; }
  }

  async function readRemote() {
    const response = await api('/state');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await errorMessage(response));
    const text = await decodePayload(await response.arrayBuffer(), response.headers.get('X-Payload-Encoding') || 'json');
    return {
      revision: Number(response.headers.get('X-Revision')) || 0,
      updatedAt: response.headers.get('X-Updated-At') || '',
      deviceId: response.headers.get('X-Device-Id') || '',
      text,
      state: model.importBackup(text)
    };
  }

  function saveRemoteMeta(remote, hash) {
    const value = {revision: remote.revision, lastHash: hash, lastSyncAt: Date.now(), updatedAt: remote.updatedAt || new Date().toISOString()};
    setMeta(value); setStatus('synced', `已同步 ${friendlyTime(value.lastSyncAt)}`, `云端版本 ${value.revision}`);
  }

  function activity(state) {
    let score = Array.isArray(state.studyDays) ? state.studyDays.length : 0;
    for (const deck of state.decks || []) {
      score += Object.keys(deck.progress || {}).length;
      if (deck.sourceType !== 'builtin-cet4') score += 10;
    }
    return score;
  }

  function stateSummary(state) {
    let words = 0, seen = 0, attempts = 0, remembered = 0;
    for (const deck of state?.decks || []) {
      words += deck.words?.length || 0;
      for (const progress of Object.values(deck.progress || {})) { if (progress.seen) seen++; attempts += progress.attempts || 0; if (progress.longTermSuccesses > 0) remembered++; }
    }
    return {decks: state?.decks?.length || 0, words, seen, attempts, remembered, studyDays: state?.studyDays?.length || 0};
  }

  async function push(state, baseRevision, force = false) {
    if (!token() || busy || (!ready && !force)) return false;
    busy = true; clearTimeout(timer); timer = 0; setStatus('syncing', '正在同步…');
    try {
      const text = payloadFor(state), hash = await digest(text), old = meta();
      if (!force && old.lastHash === hash) { setStatus('synced', `已同步 ${friendlyTime(old.lastSyncAt)}`); return true; }
      const encoded = await encodePayload(text);
      const response = await api('/state', {method: 'PUT', body: encoded.body, headers: {
        'Content-Type': 'application/octet-stream', 'X-Base-Revision': String(baseRevision),
        'X-Device-Id': deviceId(), 'X-Payload-Encoding': encoded.encoding
      }});
      if (response.status === 409) {
        pendingRemote = await readRemote();
        setStatus('conflict', '发现另一台设备的进度', '点这里选择保留哪一份'); open(); return false;
      }
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json(); saveRemoteMeta(result, hash); return true;
    } catch (error) {
      const signedOut = !token();
      setStatus(signedOut ? 'disconnected' : navigator.onLine ? 'error' : 'offline', signedOut ? '请重新连接云端' : navigator.onLine ? '同步失败，点此重试' : '离线中，本机已保存', error.message);
      return false;
    } finally { busy = false; }
  }

  async function reconcile(localState, firstConnection = false) {
    setStatus('syncing', '正在读取云端…');
    const remote = await readRemote();
    const localText = payloadFor(localState), localHash = await digest(localText), old = meta();
    if (!remote) { ready = true; await push(localState, 0, true); return localState; }
    const remoteHash = await digest(remote.text);
    if (firstConnection && activity(localState) > 0 && !old.revision) {
      pendingRemote = remote; ready = true; setStatus('conflict', '请选择首次同步方式'); open(); return localState;
    }
    if (remote.revision > (old.revision || 0)) {
      if (old.lastHash && old.lastHash !== localHash) {
        pendingRemote = remote; ready = true; setStatus('conflict', '两台设备都有新进度'); open(); return localState;
      }
      saveRemoteMeta(remote, remoteHash); ready = true; return remote.state;
    }
    ready = true;
    if (localHash !== old.lastHash) schedule(localState, true);
    else setStatus('synced', `已同步 ${friendlyTime(old.lastSyncAt)}`);
    return localState;
  }

  async function authenticate(password, claimToken = '') {
    const claiming = !!claimToken || !!setupToken();
    const path = claiming ? '/claim' : '/session';
    const authorization = claiming ? (setupToken() || adminToken()) : '';
    const response = await api(path, {method: 'POST', auth: !claiming, tokenOverride: authorization, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(claiming ? {password, claimToken} : {password})});
    if (!response.ok) throw new Error(await errorMessage(response));
    const result = await response.json(); storage.set(TOKEN_KEY, result.token); ready = true;
    return result;
  }

  async function authenticateAdmin(password) {
    const response = await api('/admin/session', {method: 'POST', auth: false, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
    if (!response.ok) throw new Error(await errorMessage(response));
    const result = await response.json(); session.set(ADMIN_TOKEN_KEY, result.token); return result;
  }

  async function resetUserPassword() {
    const response = await api('/admin/reset', {method: 'POST', auth: false, tokenOverride: adminToken()});
    if (!response.ok) throw new Error(await errorMessage(response));
    const result = await response.json();
    session.set(SETUP_TOKEN_KEY, result.setupToken);
    session.remove(ADMIN_TOKEN_KEY);
    storage.remove(TOKEN_KEY); storage.remove(META_KEY);
    ready = false; pendingRemote = null; adminMode = '';
    return result;
  }

  async function loadAdminSnapshots() {
    const response = await api('/admin/snapshots', {auth: false, tokenOverride: adminToken()});
    if (!response.ok) throw new Error(await errorMessage(response));
    adminSnapshots = await response.json(); snapshotPreview = null; return adminSnapshots;
  }

  async function previewAdminSnapshot(id) {
    const response = await api(`/admin/snapshots/${id}/preview`, {auth: false, tokenOverride: adminToken()});
    if (!response.ok) throw new Error(await errorMessage(response));
    snapshotPreview = await response.json(); return snapshotPreview;
  }

  async function restoreAdminSnapshot(id) {
    const response = await api('/admin/snapshots/restore', {method: 'POST', auth: false, tokenOverride: adminToken(), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
    if (!response.ok) throw new Error(await errorMessage(response));
    const result = await response.json();
    if (token()) {
      const remote = await readRemote();
      if (remote) { await applyState(remote.state); saveRemoteMeta(remote, await digest(remote.text)); }
    } else storage.remove(META_KEY);
    adminSnapshots = null; return result;
  }

  function claimTokenFromURL() {
    return root.location?.hash.startsWith(CLAIM_PREFIX) ? decodeURIComponent(root.location.hash.slice(CLAIM_PREFIX.length)) : '';
  }

  function modalHTML() {
    const claimToken = claimTokenFromURL();
    if (pendingRemote) { const localSummary = stateSummary(getState()), cloudSummary = stateSummary(pendingRemote.state); return `<div class="sync-dialog sync-conflict" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">两台设备</div><h2 id="sync-title">发现两份学习进度</h2><p>云端最后更新于 ${escapeHTML(new Date(pendingRemote.updatedAt).toLocaleString('zh-CN'))}。先比较，再决定怎么继续。</p><div class="conflict-compare"><article><span>这台设备</span><strong>${localSummary.seen} 个已学</strong><small>${localSummary.attempts} 次练习</small></article><article><span>云端记录</span><strong>${cloudSummary.seen} 个已学</strong><small>${cloudSummary.attempts} 次练习</small></article></div><div class="sync-choice sync-choice-stack"><button class="btn" data-sync-action="merge">自动合并两份记录</button><button class="btn secondary" data-sync-action="use-cloud">只使用云端进度</button><button class="btn secondary" data-sync-action="use-device">只保留这台设备</button></div><small>自动合并会保留两边不同单词的进度；同一个词同时变化时，采用最近练习较多的一份。</small></div>`; }
    if (adminMode === 'history') {
      if (!adminToken()) return `<form class="sync-dialog" data-sync-form="admin-auth" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">🛟</div><span class="tag">管理员权限</span><h2 id="sync-title">打开云端进度保险箱</h2><p>验证后可以查看最近 7 次自动快照，并把 Lynn 的进度恢复到其中任意一次。</p><label class="field">管理员密码<input name="password" type="password" maxlength="128" autocomplete="current-password" required></label><button class="btn" type="submit">验证并查看历史</button><small>连续输错 5 次会暂时锁定 15 分钟。</small></form>`;
      if (!adminSnapshots) return `<div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">🛟</div><h2 id="sync-title">正在读取进度快照…</h2><p>小紫怪正在检查最近 7 次云端记录。</p></div>`;
      const snapshots = adminSnapshots.snapshots || [];
      const preview = snapshotPreview ? `<section class="snapshot-preview"><span>恢复前预览</span><h3>${escapeHTML(new Date(snapshotPreview.createdAt).toLocaleString('zh-CN'))}</h3><div><p><strong>${snapshotPreview.seen}</strong>已学单词</p><p><strong>${snapshotPreview.remembered}</strong>真正记住</p><p><strong>${snapshotPreview.studyDays}</strong>学习天数</p><p><strong>${snapshotPreview.attempts}</strong>练习次数</p></div><small>${snapshotPreview.decks} 本词本 · 共 ${snapshotPreview.words} 个词 · 版本 ${snapshotPreview.revision}</small>${snapshotPreview.current?'<em>这就是当前云端进度</em>':`<button class="btn" data-sync-action="admin-restore-snapshot" data-id="${snapshotPreview.id}">确认恢复这一份</button>`}</section>`:'';
      return `<div class="sync-dialog sync-history" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">进度保险箱</div><span class="tag">云端进度保护</span><h2 id="sync-title">最近 7 次自动快照</h2><p>先查看内容，再决定是否恢复。恢复学习进度不会重置同步密码。当前云端版本是 ${adminSnapshots.currentRevision || 0}。</p>${snapshots.length?`<div class="snapshot-list">${snapshots.map((item,index)=>`<article class="${snapshotPreview?.id===item.id?'selected':''}"><div><strong>${item.current?'当前进度':`历史记录 ${index+1}`}</strong><span>${escapeHTML(new Date(item.createdAt).toLocaleString('zh-CN'))} · 版本 ${item.revision}</span></div><button class="btn secondary compact" data-sync-action="admin-preview-snapshot" data-id="${item.id}">${snapshotPreview?.id===item.id?'已预览':'查看内容'}</button></article>`).join('')}</div>${preview}`:'<div class="sync-warning">还没有快照。第一次成功同步后会自动开始保留。</div>'}<small>每次成功上传都会生成一份，超过 7 次后自动删除最旧的一份。</small></div>`;
    }
    if (adminMode === 'reset') {
      if (!adminToken()) return `<form class="sync-dialog" data-sync-form="admin-auth" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">🔐</div><span class="tag">管理员权限</span><h2 id="sync-title">验证后重置密码</h2><p>这里只重置 Lynn 的同步密码；已经上传的学习进度会继续保留。</p><label class="field">管理员密码<input name="password" type="password" maxlength="128" autocomplete="current-password" required></label><button class="btn" type="submit">验证管理员身份</button><small>连续输错 5 次会暂时锁定 15 分钟。</small></form>`;
      return `<div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">🔐</div><span class="tag">管理员已验证</span><h2 id="sync-title">确认重置同步密码？</h2><p>旧密码和所有旧设备的登录凭证都会立即失效，云端学习进度不会删除。</p><div class="sync-warning">重置后请把设备交给 Lynn，让她在 15 分钟内设置新密码。</div><div class="sync-choice"><button class="btn" data-sync-action="admin-reset-confirm">确认重置</button><button class="btn secondary" data-sync-action="close">先不重置</button></div></div>`;
    }
    if (claimToken && !adminToken() && !setupToken()) return `<form class="sync-dialog" data-sync-form="admin-auth" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">🔐</div><span class="tag">第一步 · 管理员确认</span><h2 id="sync-title">请管理员先解锁</h2><p>网站是公开的，所以必须先由管理员确认，之后 Lynn 才能设置自己的同步密码。</p><label class="field">管理员密码<input name="password" type="password" maxlength="128" autocomplete="current-password" required></label><button class="btn" type="submit">管理员确认并继续</button><small>管理员密码只用于验证，不会保存到这台设备。</small></form>`;
    if (claimToken || setupToken()) {
      const resetting = !!setupToken();
      return `<form class="sync-dialog" data-sync-form="claim" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">☁️</div><span class="tag">${resetting ? '重新设置' : '第二步 · Lynn 设置'}</span><h2 id="sync-title">${resetting ? '设置新的同步密码' : '开启 Lynn 的云端进度'}</h2><p>请由 Lynn 设置一个至少 8 位的同步密码。以后换设备时，用它就能接着学习。</p><label class="field">设置同步密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field">再输入一次<input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button class="btn" type="submit">保存密码并同步这台设备的进度</button><small>管理员验证已经通过；两个密码彼此独立。</small></form>`;
    }
    if (!token()) return `<form class="sync-dialog" data-sync-form="login" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">☁️</div><h2 id="sync-title">连接 Lynn 的云端进度</h2><p>在新手机、iPad 或电脑上输入同步密码，就能读取上次学习的位置。</p><label class="field">同步密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><button class="btn" type="submit">连接并读取进度</button><button class="sync-admin-link" type="button" data-sync-action="admin-history-open">管理员恢复历史进度</button><button class="sync-admin-link" type="button" data-sync-action="admin-reset-open">管理员重置同步密码</button><small>本机进度会先保留，不会在登录前被覆盖。</small></form>`;
    const old = meta();
    return `<div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">${status.kind === 'synced' ? '☁️✓' : '☁️'}</div><h2 id="sync-title">云端进度已连接</h2><p>${escapeHTML(status.text)}${old.revision ? ` · 云端版本 ${old.revision}` : ''}</p><div class="sync-choice"><button class="btn" data-sync-action="sync-now">立即同步</button><button class="btn secondary" data-sync-action="restore">从云端恢复</button></div><button class="sync-admin-link" data-sync-action="admin-history-open">管理员恢复最近 7 次进度</button><button class="sync-admin-link" data-sync-action="admin-reset-open">管理员重置同步密码</button><button class="sync-disconnect" data-sync-action="disconnect">断开这台设备</button><small>本地记录始终保留；断网时会等网络恢复后再上传。</small></div>`;
  }

  function open() {
    if (!root.document?.body) return;
    close(); const layer = root.document.createElement('div'); layer.className = 'sync-modal'; layer.innerHTML = modalHTML();
    root.document.body.appendChild(layer); root.document.body.classList.add('sync-open');
    root.requestAnimationFrame(() => layer.classList.add('is-ready'));
    layer.querySelector('input')?.focus({preventScroll: true});
  }

  function openAfterWelcome() {
    clearTimeout(claimOpenTimer);
    const showWhenClear = () => {
      if (!claimTokenFromURL()) return;
      if (root.document?.querySelector('.daily-welcome')) {
        claimOpenTimer = setTimeout(showWhenClear, 180);
        return;
      }
      open();
    };
    claimOpenTimer = setTimeout(showWhenClear, 350);
  }

  function close() { root.document?.querySelector('.sync-modal')?.remove(); root.document?.body?.classList.remove('sync-open'); }

  function schedule(state, immediate = false) {
    if (state) currentState = state;
    if (!token() || !ready) return;
    clearTimeout(timer); timer = setTimeout(() => push(getState(), meta().revision || 0), immediate ? 80 : 8000);
  }

  let currentState = null;
  async function bootstrap(state) {
    currentState = state; renderBadge();
    if (claimTokenFromURL()) { setStatus('disconnected', '完成首次云端设置'); return state; }
    if (!token()) { setStatus('disconnected', '仅保存在本机'); return state; }
    try { const next = await reconcile(state); return next; }
    catch (error) { const signedOut = !token(); setStatus(signedOut ? 'disconnected' : navigator.onLine ? 'error' : 'offline', signedOut ? '请重新连接云端' : navigator.onLine ? '云端暂时不可用' : '离线中，本机已保存', error.message); return state; }
  }

  function init(options) {
    model = options.model; getState = options.getState; applyState = options.applyState; notify = options.notify || (() => {});
    root.document.addEventListener('click', event => {
      const openButton = event.target.closest('[data-sync-open]'); if (openButton) { open(); return; }
      const button = event.target.closest('[data-sync-action]'); if (!button) return;
      const action = button.dataset.syncAction;
      if (action === 'close') { adminMode = ''; adminSnapshots = null; snapshotPreview = null; session.remove(ADMIN_TOKEN_KEY); close(); }
      else if (action === 'disconnect') { storage.remove(TOKEN_KEY); storage.remove(META_KEY); session.remove(ADMIN_TOKEN_KEY); session.remove(SETUP_TOKEN_KEY); ready = false; pendingRemote = null; close(); setStatus('disconnected', '仅保存在本机'); notify('这台设备已断开云端，本地进度还在。'); }
      else if (action === 'admin-reset-open') { adminMode = 'reset'; session.remove(ADMIN_TOKEN_KEY); open(); }
      else if (action === 'admin-history-open') { adminMode = 'history'; adminSnapshots = null; snapshotPreview = null; session.remove(ADMIN_TOKEN_KEY); open(); }
      else if (action === 'admin-preview-snapshot') {
        const id = Number(button.dataset.id); button.disabled = true; button.textContent = '正在读取…';
        previewAdminSnapshot(id).then(open).catch(error => { notify(error.message); button.disabled = false; button.textContent = '查看内容'; });
      }
      else if (action === 'admin-restore-snapshot') {
        const id = Number(button.dataset.id);
        if (!snapshotPreview || snapshotPreview.id !== id) { notify('请先预览这份记录。'); return; }
        if (!confirm('确定把云端学习进度恢复到这一份吗？当前进度也已经在最近快照里，可以再次恢复。')) return;
        button.disabled = true; button.textContent = '正在恢复…';
        restoreAdminSnapshot(id).then(() => { close(); adminMode = ''; session.remove(ADMIN_TOKEN_KEY); notify('云端进度已经恢复，当前设备也已更新 ✓'); }).catch(error => { notify(error.message); adminSnapshots = null; loadAdminSnapshots().then(open).catch(() => { session.remove(ADMIN_TOKEN_KEY); open(); }); });
      }
      else if (action === 'admin-reset-confirm') {
        button.disabled = true; button.textContent = '正在安全重置…';
        resetUserPassword().then(result => { setStatus('disconnected', '请设置新的同步密码'); open(); notify(result.preservedProgress ? '旧密码已失效，云端进度已保留 ✓' : '旧密码已失效，现在请设置新密码 ✓'); }).catch(error => { notify(error.message); session.remove(ADMIN_TOKEN_KEY); adminMode = 'reset'; open(); });
      }
      else if (action === 'sync-now') { push(getState(), meta().revision || 0, true).then(ok => { if (ok) { close(); notify('云端进度同步好啦 ✓'); } }); }
      else if (action === 'restore') { readRemote().then(async remote => { if (!remote) throw new Error('云端还没有进度。'); await applyState(remote.state); saveRemoteMeta(remote, await digest(remote.text)); close(); notify('已经恢复到云端进度 ✓'); }).catch(error => notify(error.message)); }
      else if (action === 'use-cloud') { const remote = pendingRemote; pendingRemote = null; applyState(remote.state).then(async () => { saveRemoteMeta(remote, await digest(remote.text)); close(); notify('已经使用云端进度 ✓'); }); }
      else if (action === 'use-device') { const revision = pendingRemote.revision; pendingRemote = null; push(getState(), revision, true).then(ok => { if (ok) { close(); notify('这台设备的进度已上传 ✓'); } }); }
      else if (action === 'merge') { const remote = pendingRemote, merged = model.mergeStates(getState(), remote.state); pendingRemote = null; button.disabled = true; button.textContent = '正在合并…'; applyState(merged).then(() => push(merged, remote.revision, true)).then(ok => { if (ok) { close(); notify('两台设备的学习记录已经合并 ✓'); } }).catch(error => notify(error.message)); }
    });
    root.document.addEventListener('submit', event => {
      const form = event.target.closest('[data-sync-form]'); if (!form) return; event.preventDefault();
      const data = new FormData(form), password = String(data.get('password') || ''), mode = form.dataset.syncForm;
      if (mode === 'claim' && password !== String(data.get('confirm') || '')) { notify('两次输入的密码不一样。'); return; }
      const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = '正在连接…';
      if (mode === 'admin-auth') {
        authenticateAdmin(password).then(async () => { if (adminMode === 'history') await loadAdminSnapshots(); open(); notify(adminMode === 'reset' ? '管理员身份已确认 ✓' : adminMode === 'history' ? '最近 7 次进度已经读取 ✓' : '管理员确认完成，请交给 Lynn 设置密码 ✓'); }).catch(error => { notify(error.message); submit.disabled = false; submit.textContent = adminMode === 'reset' ? '验证管理员身份' : adminMode === 'history' ? '验证并查看历史' : '管理员确认并继续'; });
        return;
      }
      authenticate(password, mode === 'claim' ? claimTokenFromURL() : '').then(async () => {
        if (mode === 'claim') {
          session.remove(ADMIN_TOKEN_KEY); session.remove(SETUP_TOKEN_KEY);
          if (claimTokenFromURL()) root.history.replaceState(null, '', root.location.pathname + root.location.search);
        }
        close(); const next = await reconcile(getState(), mode !== 'claim');
        if (next !== getState()) await applyState(next);
        notify(mode === 'claim' ? '云端同步已经开启 ✓' : '云端进度连接成功 ✓');
      }).catch(error => { notify(error.message); submit.disabled = false; submit.textContent = mode === 'claim' ? '保存密码并同步这台设备的进度' : '连接并读取进度'; });
    });
    root.addEventListener('online', () => schedule(getState(), true));
    root.addEventListener('offline', () => setStatus('offline', '离线中，本机已保存'));
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden && token() && ready) push(getState(), meta().revision || 0); });
  }

  root.LynnSync = {init, bootstrap, schedule, showSetup: openAfterWelcome, flush: () => push(getState(), meta().revision || 0, true), open, status: () => ({...status})};
})(typeof window !== 'undefined' ? window : globalThis);
