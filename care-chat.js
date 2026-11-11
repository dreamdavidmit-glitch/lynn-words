(function () {
  'use strict';

  const ENDPOINT = 'https://lynn-words-sync.lynn-words-work.workers.dev';
  const TOKEN_KEY = 'lynn:careAdminToken';
  let messages = [];
  let loading = false;
  let error = '';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } };
  const time = value => new Date(value).toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});

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

  function threadHTML() {
    if (loading && !messages.length) return '<div class="owner-chat-empty">正在打开留言信箱…</div>';
    if (!messages.length) return '<div class="owner-chat-empty">还没有留言。你写下的第一句话会在 Lynn 下次打开网站时出现。</div>';
    return messages.slice(-12).map(message => `<article class="owner-message ${message.sender === 'owner' ? 'mine' : 'reply'}"><span>${message.sender === 'owner' ? '你发给 Lynn' : 'Lynn 的回复'}</span><p>${escape(message.body)}</p><small>${time(message.createdAt)}${message.sender === 'owner' ? message.readAt ? ' · Lynn 已读' : ' · 等待查看' : ''}</small></article>`).join('');
  }

  function panelHTML() {
    return `<section class="paper-panel owner-chat-panel"><div class="owner-chat-heading"><div><span>LEAVE A LITTLE NOTE</span><h2>给 Lynn 的留言</h2><p>她不在线也没关系，留言会留在小词窝；她的回复也会回到这里。</p></div><i>💌</i></div>${error ? `<div class="site-warning">${escape(error)}</div>` : ''}<div class="owner-chat-thread">${threadHTML()}</div><form class="owner-chat-form"><textarea name="body" maxlength="500" rows="2" placeholder="写一句想留给 Lynn 的话…" aria-label="留言内容" required></textarea><button type="submit" ${loading ? 'disabled' : ''}>${loading ? '正在送信…' : '送进小词窝'}<span>→</span></button></form><small class="owner-chat-hint">最多 500 字 · 离线留言会一直保留 · 只有你和 Lynn 可以看到</small></section>`;
  }

  function inject() {
    const content = document.querySelector('.care-content');
    const target = content?.querySelector('.sites-panel') || content?.querySelector('.dashboard-grid');
    if (!content || !target) return;
    let panel = content.querySelector('.owner-chat-panel');
    if (!panel) { panel = document.createElement('section'); target.before(panel); }
    const wrapper = document.createElement('div'); wrapper.innerHTML = panelHTML(); panel.replaceWith(wrapper.firstElementChild);
    const thread = content.querySelector('.owner-chat-thread'); if (thread) thread.scrollTop = thread.scrollHeight;
  }

  async function load() {
    if (!token() || loading) return;
    loading = true; error = ''; inject();
    try { const result = await api('/care/messages?read=1'); messages = result.messages || []; }
    catch (reason) { error = reason.message || '暂时收不到留言。'; }
    finally { loading = false; inject(); }
  }

  window.addEventListener('lynn-care-rendered', () => { inject(); if (!messages.length && !loading) load(); });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('.owner-chat-form');
    if (!form) return;
    event.preventDefault();
    const body = String(new FormData(form).get('body') || '').trim();
    if (!body || loading) return;
    loading = true; error = ''; inject();
    try {
      await api('/care/messages', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({body})});
      const result = await api('/care/messages?read=1'); messages = result.messages || [];
    } catch (reason) { error = reason.message || '留言没有送出去，请再试一次。'; }
    finally { loading = false; inject(); }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 45_000);
})();
