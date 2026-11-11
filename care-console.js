(function () {
  'use strict';

  const ENDPOINT = 'https://lynn-words-sync.lynn-words-work.workers.dev';
  const TOKEN_KEY = 'lynn:careAdminToken';
  let statuses = [];
  let configuredSites = [];
  let loading = false;
  let error = '';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } };
  const host = value => { try { return new URL(value).hostname; } catch (_) { return value; } };
  const checkedTime = value => value ? new Date(value).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) : '尚未检查';

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(ENDPOINT + path, {...options, headers, cache:'no-store'});
    if (!response.ok) {
      let message = `请求失败（${response.status}）`;
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    return response.json();
  }

  function cardHTML(site) {
    const state = site.ok ? 'ok' : 'down';
    const label = site.ok ? '运行正常' : site.error || '暂时不可用';
    return `<article class="site-card ${state}"><div class="site-state"><i></i><span>${label}</span></div><h3>${escape(site.name)}</h3><a href="${escape(site.url)}" target="_blank" rel="noopener noreferrer">${escape(host(site.url))}</a><div class="site-meta"><span>${site.status ? `HTTP ${site.status}` : '没有响应'}</span><span>${site.latency ? `${site.latency} ms` : '—'}</span><span>${checkedTime(site.checkedAt)}</span></div></article>`;
  }

  function panelHTML() {
    const cards = loading && !statuses.length ? '<div class="site-loading">正在轻轻敲门检查这些网站…</div>' : statuses.length ? statuses.map(cardHTML).join('') : `<div class="site-empty">${escape(error || '还没有添加需要查看的网站。')}</div>`;
    return `<section class="paper-panel sites-panel" id="sites"><div class="panel-heading"><div><span>SITE WATCH</span><h2>我的网站状态</h2></div><div class="site-actions"><small>${statuses.length ? `${statuses.filter(site => site.ok).length} / ${statuses.length} 正常` : '等待检查'}</small><button class="mini-button" data-console-action="refresh-sites" ${loading ? 'disabled' : ''}>${loading ? '检查中…' : '重新检查'}</button><button class="mini-button solid" data-console-action="open-settings">管理与密码</button></div></div>${error && statuses.length ? `<div class="site-warning">${escape(error)}</div>` : ''}<div class="site-grid">${cards}</div><p class="site-hint">状态检查只访问公开网址，不读取网站内容，也不会影响 Lynn 的学习进度。</p></section>`;
  }

  function injectPanel() {
    const content = document.querySelector('.care-content');
    const grid = content?.querySelector('.dashboard-grid');
    if (!content || !grid) return;
    let panel = content.querySelector('.sites-panel');
    if (!panel) {
      panel = document.createElement('section');
      grid.before(panel);
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = panelHTML();
    panel.replaceWith(wrapper.firstElementChild);
  }

  async function loadStatuses(force = false) {
    if (!token() || loading) return;
    loading = true; error = ''; injectPanel();
    try {
      const result = await api('/care/sites/status');
      statuses = result.sites || [];
    } catch (reason) { error = reason.message || '暂时无法检查网站状态。'; }
    finally { loading = false; injectPanel(); }
  }

  function settingsHTML(message = '') {
    const rows = configuredSites.length ? configuredSites.map(site => `<article><div><strong>${escape(site.name)}</strong><span>${escape(host(site.url))}</span></div><button type="button" data-console-action="remove-site" data-id="${site.id}" data-name="${escape(site.name)}">移除</button></article>`).join('') : '<p class="settings-empty">还没有添加网站。</p>';
    return `<div class="console-modal" role="dialog" aria-modal="true" aria-labelledby="console-title"><div class="console-dialog"><button class="console-close" type="button" data-console-action="close-settings" aria-label="关闭">×</button><span class="paper-label">PRIVATE CONSOLE</span><h2 id="console-title">网站与进入密码</h2><p class="console-intro">在这里添加需要查看的公开网站，也可以更换这个页面自己的进入密码。</p>${message ? `<div class="console-message">${escape(message)}</div>` : ''}<section><div class="console-section-title"><h3>我的网站</h3><span>最多 20 个</span></div><div class="configured-sites">${rows}</div><form class="console-form site-form" data-console-form="site"><label>网站名称<input name="name" maxlength="60" placeholder="例如：我的作品集" required></label><label>公开网址<input name="url" type="url" maxlength="500" placeholder="https://example.com" required></label><button type="submit">添加并检查</button></form></section><section><div class="console-section-title"><h3>设置进入密码</h3><span>至少 8 位</span></div><form class="console-form password-form" data-console-form="password"><label>新的进入密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label>再输入一次<input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button type="submit">保存新密码</button></form><p class="console-help">设置后，下次打开这个页面使用新密码；管理员总密码仍可作为恢复入口。</p></section></div></div>`;
  }

  function showSettings(message = '') {
    document.querySelector('.console-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', settingsHTML(message));
    document.body.classList.add('console-open');
  }

  function closeSettings() {
    document.querySelector('.console-modal')?.remove();
    document.body.classList.remove('console-open');
  }

  async function loadSettings() {
    try {
      const result = await api('/care/sites');
      configuredSites = result.sites || [];
      showSettings();
    } catch (reason) { showSettings(reason.message || '暂时无法读取网站列表。'); }
  }

  window.addEventListener('lynn-care-rendered', () => {
    injectPanel();
    if (!statuses.length && !loading) loadStatuses();
  });

  document.addEventListener('click', async event => {
    if (event.target.classList.contains('console-modal')) { closeSettings(); return; }
    const button = event.target.closest('[data-console-action]');
    if (!button) return;
    const action = button.dataset.consoleAction;
    if (action === 'refresh-sites') loadStatuses(true);
    else if (action === 'open-settings') loadSettings();
    else if (action === 'close-settings') closeSettings();
    else if (action === 'remove-site') {
      if (!confirm(`只从状态列表移除“${button.dataset.name}”？网站本身不会被删除。`)) return;
      button.disabled = true;
      try {
        await api(`/care/sites/${button.dataset.id}`, {method:'DELETE'});
        configuredSites = configuredSites.filter(site => String(site.id) !== button.dataset.id);
        showSettings('已经从状态列表移除。');
        await loadStatuses(true);
      } catch (reason) { showSettings(reason.message); }
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-console-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form), mode = form.dataset.consoleForm, submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (mode === 'site') {
        await api('/care/sites', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:data.get('name'), url:data.get('url')})});
        const result = await api('/care/sites'); configuredSites = result.sites || [];
        showSettings('网站已经加入状态检查。');
        await loadStatuses(true);
      } else {
        const password = String(data.get('password') || '');
        if (password !== String(data.get('confirm') || '')) throw new Error('两次输入的密码不一样。');
        const result = await api('/care/password', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password})});
        if (result.token) sessionStorage.setItem(TOKEN_KEY, result.token);
        showSettings('新的进入密码已经保存，下次请使用它进入。');
      }
    } catch (reason) { showSettings(reason.message || '保存失败，请稍后再试。'); }
  });

  setInterval(() => { if (!document.hidden && token()) loadStatuses(true); }, 120_000);
})();
