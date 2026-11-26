(function () {
  'use strict';

  let thread = [];
  let unread = 0;
  let busy = false;
  let error = '';
  let opened = false;
  let generation = 0;
  let sendError = '';
  const openDraftKey='lynn.mailbox.open';

  function rememberOpen(value) {
    try {
      if (value) sessionStorage.setItem(openDraftKey,'1');
      else sessionStorage.removeItem(openDraftKey);
    } catch (_) {}
  }

  function resumeDraft() {
    try {
      if (!opened && connected() && sessionStorage.getItem(openDraftKey)==='1' && LynnLetters.read('reply')?.body) {
        open();
        return true;
      }
    } catch (_) {}
    return false;
  }

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const time = value => {
    const date = new Date(value), today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay ? date.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
  };

  function connected() { return !!window.LynnSync?.connected?.(); }

  function ensureButton() {
    let button = document.querySelector('.message-pill');
    if (!connected()) { button?.remove(); return null; }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'message-pill';
      button.dataset.messageAction = 'open';
      button.setAttribute('aria-label', '打开留言信箱');
      document.body.appendChild(button);
    }
    button.classList.toggle('has-new', unread > 0);
    button.innerHTML = `<span class="message-envelope">✉</span><span>留言</span>${unread ? `<b>${Math.min(99, unread)}</b>` : ''}`;
    return button;
  }

  function messagesHTML() {
    if (!thread.length) return '<div class="message-empty"><span>💌</span><strong>信箱还是空的</strong><p>以后收到的留言会一直保存在这里。</p></div>';
    return thread.map(message => `<article class="message-bubble ${message.sender === 'lynn' ? 'mine' : 'theirs'}"><span>${message.sender === 'lynn' ? 'Lynn' : '给你的留言'}</span><p>${escape(message.body)}</p>${Number.isSafeInteger(message.photoId) && message.photoId>0 ? `<button type="button" class="daily-photo-link" data-memory-photo="${message.photoId}">查看记忆照片 →</button>` : ''}<small>${time(message.createdAt)}${message.sender === 'lynn' && message.readAt ? ' · 已读' : ''}</small></article>`).join('');
  }

  function renderModal() {
    if (!opened) return;
    let layer = document.querySelector('.message-modal');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'message-modal';
      layer.innerHTML = `<section class="message-dialog" role="dialog" aria-modal="true" aria-labelledby="message-title"><header><div><span>LYNN'S LITTLE MAILBOX</span><h2 id="message-title">小词窝留言信箱</h2></div><button type="button" data-message-action="close" aria-label="关闭">×</button></header><div class="message-error" role="status" hidden></div><div class="message-thread"></div><form class="message-compose"><textarea name="body" rows="2" placeholder="写下回复…" aria-label="回复内容" required></textarea><button type="submit">回复<span>→</span></button></form><small class="message-privacy">草稿保存在此浏览器，发送后只有你们两人可见。</small></section>`;
      document.body.appendChild(layer);
      document.body.classList.add('message-open');
      LynnLetters.mount(layer.querySelector('form'),'reply');
      layer.querySelector('[data-message-action="close"]').focus({preventScroll:true});
      window.dispatchEvent(new Event('lynn-mailbox-visibility'));
      requestAnimationFrame(() => layer.classList.add('is-ready'));
    }
    const status = layer.querySelector('.message-error');
    status.textContent = sendError || error;
    status.hidden = !status.textContent;
    layer.querySelector('button[type="submit"]').disabled = busy;
    layer.querySelector('textarea').readOnly = busy;
    LynnLetters.updateThread(layer.querySelector('.message-thread'),messagesHTML());
  }

  function close({remember=false}={}) {
    if (!remember) rememberOpen(false);
    if (!opened) return;
    opened = false;
    document.querySelector('.message-modal')?.remove();
    document.body.classList.remove('message-open');
    document.querySelector('.message-pill')?.focus({preventScroll:true});
    window.dispatchEvent(new Event('lynn-mailbox-visibility'));
  }

  async function load(markRead = false) {
    if (!connected() || busy) { ensureButton(); return; }
    const id = ++generation;
    try {
      const result = await window.LynnSync.messages(markRead);
      if (id !== generation || !connected()) return;
      thread = result.messages || [];
      unread = Number(result.unread) || 0;
      error = '';
    } catch (reason) { if (id !== generation) return; error = reason.message || '暂时收不到留言。'; }
    ensureButton();
    if (opened) renderModal();
  }

  async function open() {
    if (!connected()) { window.LynnSync?.open?.(); return; }
    rememberOpen(true);
    opened = true; error = ''; renderModal();
    await load(true);
  }

  document.addEventListener('click', event => {
    if (event.target.classList.contains('message-modal')) { close(); return; }
    const action = event.target.closest('[data-message-action]')?.dataset.messageAction;
    if (action === 'open') open();
    else if (action === 'close') close();
  });

  document.addEventListener('keydown', event => {
    if (!opened || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const stops = [...document.querySelectorAll('.message-modal button:not(:disabled),.message-modal textarea')];
    const first = stops[0], last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('.message-compose');
    if (!form) return;
    event.preventDefault();
    const body = String(new FormData(form).get('body') || '').trim();
    if (!body || busy) return;
    const submittedDraft = LynnLetters.read('reply');
    busy = true; sendError = ''; generation++; renderModal();
    let sent = false;
    try {
      const result = await window.LynnSync.reply(body);
      if (result.message) thread = [...thread.filter(m => m.id !== result.message.id),result.message];
      LynnLetters.clear('reply', submittedDraft);
      const current = document.querySelector('.message-compose');
      if (current) current.reset();
      sent = true;
    } catch (reason) { sendError = reason.message || '回复没有送出去，请再试一次。'; }
    finally { busy = false; renderModal(); }
    if (sent) await load(opened);
  });

  let wasConnected = false;
  window.addEventListener('lynn-sync-status', () => {
    const online = connected();
    if (online === wasConnected) return;
    wasConnected = online;
    if (online) { ensureButton(); if (!resumeDraft()) load(opened); }
    else { generation++; close({remember:true}); thread=[]; unread=0; ensureButton(); }
  });
  window.addEventListener('lynn-photo-notice-read',()=>load(opened));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(opened); });
  setInterval(() => { if (!document.hidden) load(opened); }, 60_000);
  setTimeout(() => { ensureButton(); if (!resumeDraft()) load(opened); }, 1600);
})();
