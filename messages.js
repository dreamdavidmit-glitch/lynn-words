(function () {
  'use strict';

  let thread = [];
  let unread = 0;
  let busy = false;
  let error = '';
  let opened = false;

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
    return thread.map(message => `<article class="message-bubble ${message.sender === 'lynn' ? 'mine' : 'theirs'}"><span>${message.sender === 'lynn' ? 'Lynn' : '给你的留言'}</span><p>${escape(message.body)}</p><small>${time(message.createdAt)}${message.sender === 'lynn' && message.readAt ? ' · 已读' : ''}</small></article>`).join('');
  }

  function renderModal() {
    document.querySelector('.message-modal')?.remove();
    if (!opened) return;
    const layer = document.createElement('div');
    layer.className = 'message-modal';
    layer.innerHTML = `<section class="message-dialog" role="dialog" aria-modal="true" aria-labelledby="message-title"><header><div><span>LYNN'S LITTLE MAILBOX</span><h2 id="message-title">小词窝留言信箱</h2></div><button type="button" data-message-action="close" aria-label="关闭">×</button></header><p class="message-intro">留言不会因为离线消失。你有空时再看、再回复就好。</p>${error ? `<div class="message-error">${escape(error)}</div>` : ''}<div class="message-thread">${messagesHTML()}</div><form class="message-compose"><textarea name="body" maxlength="500" rows="2" placeholder="写下回复…" aria-label="回复内容" required></textarea><button type="submit" ${busy ? 'disabled' : ''}>${busy ? '正在送出…' : '回复'}<span>→</span></button></form><small class="message-privacy">这里只是你们之间的站内留言，不会公开显示。</small></section>`;
    document.body.appendChild(layer);
    document.body.classList.add('message-open');
    requestAnimationFrame(() => layer.classList.add('is-ready'));
    const list = layer.querySelector('.message-thread');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function close() {
    opened = false;
    document.querySelector('.message-modal')?.remove();
    document.body.classList.remove('message-open');
  }

  async function load(markRead = false) {
    if (!connected() || busy) { ensureButton(); return; }
    try {
      const result = await window.LynnSync.messages(markRead);
      thread = result.messages || [];
      unread = markRead ? 0 : Number(result.unread) || 0;
      error = '';
    } catch (reason) { error = reason.message || '暂时收不到留言。'; }
    ensureButton();
    if (opened) renderModal();
  }

  async function open() {
    if (!connected()) { window.LynnSync?.open?.(); return; }
    opened = true; error = ''; renderModal();
    await load(true);
  }

  document.addEventListener('click', event => {
    if (event.target.classList.contains('message-modal')) { close(); return; }
    const action = event.target.closest('[data-message-action]')?.dataset.messageAction;
    if (action === 'open') open();
    else if (action === 'close') close();
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('.message-compose');
    if (!form) return;
    event.preventDefault();
    const body = String(new FormData(form).get('body') || '').trim();
    if (!body || busy) return;
    busy = true; error = ''; renderModal();
    try { await window.LynnSync.reply(body); await load(true); }
    catch (reason) { error = reason.message || '回复没有送出去，请再试一次。'; }
    finally { busy = false; renderModal(); }
  });

  window.addEventListener('lynn-sync-status', () => { ensureButton(); if (connected()) load(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(opened); });
  setInterval(() => { if (!document.hidden) load(opened); }, 60_000);
  setTimeout(() => { ensureButton(); load(false); }, 1600);
})();
