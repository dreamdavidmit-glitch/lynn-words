(function (root) {
  'use strict';

  const ENDPOINT = 'https://lynn-words-sync.lynn-words-work.workers.dev';
  const TOKEN_KEY = 'lynn:syncToken';
  const META_KEY = 'lynn:syncMeta';
  const DEVICE_KEY = 'lynn:syncDevice';
  const CLAIM_PREFIX = '#sync-setup=';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let model, getState, applyState, notify, timer = 0, claimOpenTimer = 0, ready = false, busy = false, pendingRemote = null;
  let status = {kind: 'disconnected', text: '仅保存在本机'};

  const storage = {
    get(key) { try { return root.localStorage?.getItem(key) || ''; } catch (_) { return ''; } },
    set(key, value) { try { root.localStorage?.setItem(key, value); } catch (_) {} },
    remove(key) { try { root.localStorage?.removeItem(key); } catch (_) {} }
  };
  const token = () => storage.get(TOKEN_KEY);
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
    const headers = new Headers(options.headers || {});
    if (options.auth !== false && token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(ENDPOINT + path, {...options, headers});
    if (response.status === 401) { storage.remove(TOKEN_KEY); ready = false; setStatus('disconnected', '请重新连接云端'); }
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
      setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? '同步失败，点此重试' : '离线中，本机已保存', error.message);
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
    const path = claimToken ? '/claim' : '/session';
    const response = await api(path, {method: 'POST', auth: false, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(claimToken ? {password, claimToken} : {password})});
    if (!response.ok) throw new Error(await errorMessage(response));
    const result = await response.json(); storage.set(TOKEN_KEY, result.token); ready = true;
    return result;
  }

  function claimTokenFromURL() {
    return root.location?.hash.startsWith(CLAIM_PREFIX) ? decodeURIComponent(root.location.hash.slice(CLAIM_PREFIX.length)) : '';
  }

  function modalHTML() {
    const claimToken = claimTokenFromURL();
    if (pendingRemote) return `<div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">☁️</div><h2 id="sync-title">发现两份学习进度</h2><p>云端最后更新于 ${escapeHTML(new Date(pendingRemote.updatedAt).toLocaleString('zh-CN'))}。请选择要继续使用哪一份，另一份会被替换。</p><div class="sync-choice"><button class="btn" data-sync-action="use-cloud">使用云端进度</button><button class="btn secondary" data-sync-action="use-device">保留这台设备</button></div><small>不确定时先关闭，当前本机记录不会丢。</small></div>`;
    if (claimToken) return `<form class="sync-dialog" data-sync-form="claim" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">☁️</div><span class="tag">第一次设置</span><h2 id="sync-title">开启 Lynn 的云端进度</h2><p>请设置一个至少 8 位的同步密码。以后换设备时，用它就能接着学习。</p><label class="field">设置同步密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field">再输入一次<input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button class="btn" type="submit">保存密码并上传这台设备的进度</button><small>密码不会写进网站代码，也不会发送给 GitHub。</small></form>`;
    if (!token()) return `<form class="sync-dialog" data-sync-form="login" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button type="button" class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">☁️</div><h2 id="sync-title">连接 Lynn 的云端进度</h2><p>在新手机、iPad 或电脑上输入同步密码，就能读取上次学习的位置。</p><label class="field">同步密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><button class="btn" type="submit">连接并读取进度</button><small>本机进度会先保留，不会在登录前被覆盖。</small></form>`;
    const old = meta();
    return `<div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-title"><button class="sync-close" data-sync-action="close" aria-label="关闭">×</button><div class="sync-cloud">${status.kind === 'synced' ? '☁️✓' : '☁️'}</div><h2 id="sync-title">云端进度已连接</h2><p>${escapeHTML(status.text)}${old.revision ? ` · 云端版本 ${old.revision}` : ''}</p><div class="sync-choice"><button class="btn" data-sync-action="sync-now">立即同步</button><button class="btn secondary" data-sync-action="restore">从云端恢复</button></div><button class="sync-disconnect" data-sync-action="disconnect">断开这台设备</button><small>本地记录始终保留；断网时会等网络恢复后再上传。</small></div>`;
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
    if (claimTokenFromURL()) { setStatus('disconnected', '完成首次云端设置'); openAfterWelcome(); return state; }
    if (!token()) { setStatus('disconnected', '仅保存在本机'); return state; }
    try { const next = await reconcile(state); return next; }
    catch (error) { setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? '云端暂时不可用' : '离线中，本机已保存', error.message); return state; }
  }

  function init(options) {
    model = options.model; getState = options.getState; applyState = options.applyState; notify = options.notify || (() => {});
    root.document.addEventListener('click', event => {
      const openButton = event.target.closest('[data-sync-open]'); if (openButton) { open(); return; }
      const button = event.target.closest('[data-sync-action]'); if (!button) return;
      const action = button.dataset.syncAction;
      if (action === 'close') close();
      else if (action === 'disconnect') { storage.remove(TOKEN_KEY); storage.remove(META_KEY); ready = false; pendingRemote = null; close(); setStatus('disconnected', '仅保存在本机'); notify('这台设备已断开云端，本地进度还在。'); }
      else if (action === 'sync-now') { push(getState(), meta().revision || 0, true).then(ok => { if (ok) { close(); notify('云端进度同步好啦 ✓'); } }); }
      else if (action === 'restore') { readRemote().then(async remote => { if (!remote) throw new Error('云端还没有进度。'); await applyState(remote.state); saveRemoteMeta(remote, await digest(remote.text)); close(); notify('已经恢复到云端进度 ✓'); }).catch(error => notify(error.message)); }
      else if (action === 'use-cloud') { const remote = pendingRemote; pendingRemote = null; applyState(remote.state).then(async () => { saveRemoteMeta(remote, await digest(remote.text)); close(); notify('已经使用云端进度 ✓'); }); }
      else if (action === 'use-device') { const revision = pendingRemote.revision; pendingRemote = null; push(getState(), revision, true).then(ok => { if (ok) { close(); notify('这台设备的进度已上传 ✓'); } }); }
    });
    root.document.addEventListener('submit', event => {
      const form = event.target.closest('[data-sync-form]'); if (!form) return; event.preventDefault();
      const data = new FormData(form), password = String(data.get('password') || ''), mode = form.dataset.syncForm;
      if (mode === 'claim' && password !== String(data.get('confirm') || '')) { notify('两次输入的密码不一样。'); return; }
      const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = '正在连接…';
      authenticate(password, mode === 'claim' ? claimTokenFromURL() : '').then(async () => {
        if (mode === 'claim') root.history.replaceState(null, '', root.location.pathname + root.location.search);
        close(); const next = await reconcile(getState(), mode !== 'claim');
        if (next !== getState()) await applyState(next);
        notify(mode === 'claim' ? '云端同步已经开启 ✓' : '云端进度连接成功 ✓');
      }).catch(error => { notify(error.message); submit.disabled = false; submit.textContent = mode === 'claim' ? '保存密码并上传这台设备的进度' : '连接并读取进度'; });
    });
    root.addEventListener('online', () => schedule(getState(), true));
    root.addEventListener('offline', () => setStatus('offline', '离线中，本机已保存'));
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden && token() && ready) push(getState(), meta().revision || 0); });
  }

  root.LynnSync = {init, bootstrap, schedule, flush: () => push(getState(), meta().revision || 0, true), open, status: () => ({...status})};
})(typeof window !== 'undefined' ? window : globalThis);
