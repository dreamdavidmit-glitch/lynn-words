(function (root) {
  'use strict';

  const STORAGE_KEY = 'lynn:dailyWelcomeDate';
  const RELEASE_STORAGE_KEY = 'lynn:seenRelease';
  const MESSAGES = [
    '今天不用一下子变得很厉害，只要比昨天多认识一个词。',
    '把注意力留给眼前这一小组，剩下的路会自己慢慢变短。',
    '有些词第一次见很陌生，多见几次，就会变成老朋友。',
    '今天的努力不需要很响亮，安安静静完成就已经很好。',
    '记不住不是失败，只是这个词还想再和你见一面。',
    '慢一点也没关系，认真想过的答案会留得更久。',
    '先开始五分钟。通常最难的那一步，只是把页面打开。',
    '别急着追赶谁，今天的你只需要照顾好今天的进度。',
    '每一个终于想起来的瞬间，都是之前认真见面的回声。',
    '把不会的留下来，把会的带走，今天就算没有白来。',
    '小目标不是降低标准，是让坚持有一个容易抵达的入口。',
    '先听清，再想起，最后确认。记忆喜欢这种不慌不忙的顺序。',
    '今天也给大脑一点耐心，它正在悄悄替你整理这些单词。',
    '不用等状态完美。开始以后，状态会慢慢跟上来。',
    '一个词、一个意思、一次认真回想——今天就从这里开始。',
    '真正记住不是一次全对，而是忘了以后还能再捡回来。',
    '先把最容易拖延的十分钟用掉，后面的你会谢谢现在的你。',
    '今天不和困难较劲，只和昨天那个想放弃的瞬间擦肩而过。',
    '背词不是赶路，是一点点把陌生世界变成自己认识的地方。',
    '答错的时候别躲开，那往往正是记得最牢的开始。',
    '今天的任务很小，但连续很多天以后，它会变成很大的底气。',
    '不用证明自己很自律，完成这一组就是最好的证明。',
    '给每个单词三秒钟认真回想，比匆忙看答案更值得。',
    '把今天该做的做好，然后心安理得地去过今天。',
    '你不是从零开始，你是带着昨天留下的记忆继续往前。',
    '有节奏地重复，比偶尔拼命一次更接近真正记住。',
    '今天也允许自己忘记，但别忘了回来复习。',
    '小紫怪已经把词本翻好了，你只负责认真完成眼前这一页。',
    '不要小看一次普通的打卡，它正在替未来的你省很多力气。',
    '先完成，再完美。今天能留下来的词，都是额外赚到的。',
    '愿今天遇到的每个难词，最后都变成考场上的熟面孔。'
  ];
  const SIGN_OFFS = [
    '认真一点点，轻松一整天。',
    '先做完这一组，再放心去玩。',
    '不求很多，只求真的想一遍。',
    '今天也和小紫怪并肩作战。',
    '把今天的份，稳稳放进记忆里。',
    '慢慢背，但不要悄悄溜走。',
    '带着好奇开始，带着成就感离开。',
    '今天的 Lynn，也会比昨天更熟练。'
  ];

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function period(hour) {
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    if (hour < 23) return '晚上好';
    return '夜深了';
  }

  function studyPlan(context) {
    const stats = context.stats || null;
    const target = Math.max(1, Number(context.dailyTarget) || 20);
    const batch = Math.max(1, Number(context.batchSize) || 10);
    if (!stats) return '今天的小约定：先挑一本想背的词本，再认识第一组新朋友。';
    if (context.hasSession) return '今天的小约定：上次那一组还在等你，先从停下的地方继续。';
    if (stats.due > 0) return `今天的小约定：先和 ${stats.due} 个到期的老朋友见面，再学新词。`;
    if (stats.newToday >= target) return `今天的 ${target} 个新词已经完成。想继续就多背一组，不想也可以安心收工。`;
    const remaining = Math.max(0, target - stats.newToday);
    return `今天的小约定：先认真完成 ${Math.min(batch, remaining)} 个新词，结束后再决定要不要继续。`;
  }

  function dailyContent(date = new Date(), context = {}) {
    const christmas = context.christmas || null;
    const occasion = context.occasion || christmas;
    const key = occasion?.welcomeKey || dayKey(date);
    const seed = hash(key);
    const birthday = context.birthday === true;
    const name = occasion?.name || (birthday ? '童雯凌' : (seed % 2 ? 'Lynn' : '童雯凌'));
    const message = occasion?.blessing || (birthday
      ? '今天先收下所有祝福，再慢慢长大。单词可以背，蛋糕也一定要吃。'
      : MESSAGES[seed % MESSAGES.length]);
    return {
      key,
      dateKey: occasion?.key || key,
      name,
      salutation: occasion?.salutation || (birthday ? '生日快乐' : period(date.getHours())),
      message,
      plan: studyPlan(context),
      signOff: occasion?.signOff || SIGN_OFFS[Math.floor(seed / MESSAGES.length) % SIGN_OFFS.length],
      dateLabel: occasion?.dateLabel || new Intl.DateTimeFormat('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'}).format(date),
      streak: Math.max(0, Number(context.streak) || 0),
      birthday,
      christmas,
      occasion
    };
  }

  function seenToday(date = new Date()) {
    try { return root.localStorage && root.localStorage.getItem(STORAGE_KEY) === dayKey(date); }
    catch (_) { return false; }
  }

  function remember(date = new Date()) {
    try { root.localStorage && root.localStorage.setItem(STORAGE_KEY, dayKey(date)); }
    catch (_) {}
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function showRelease(release, onClose) {
    if (!release?.id || !root.document || root.document.querySelector('.daily-welcome')) return false;
    if (release.level === 'minor') {
      try { root.localStorage?.setItem(RELEASE_STORAGE_KEY, release.id); } catch (_) {}
      return false;
    }
    try { if (root.localStorage?.getItem(RELEASE_STORAGE_KEY) === release.id) return false; }
    catch (_) {}
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousFocus = root.document.activeElement;
    const items = Array.isArray(release.items) ? release.items.slice(0, 12) : [];
    const layer = root.document.createElement('div');
    layer.className = 'daily-welcome release-welcome';
    layer.innerHTML = `
      <div class="daily-welcome__paper release-welcome__paper" role="dialog" aria-modal="true" aria-labelledby="release-welcome-title" aria-describedby="release-welcome-message">
        <section class="daily-welcome__copy release-welcome__copy">
          <div class="daily-welcome__meta">
            <span>LYNN’S LITTLE UPDATE</span>
            <time>${escapeHTML(release.date || release.version)}</time>
          </div>
          <div class="release-welcome__badge">NEW · ${escapeHTML(release.version)}</div>
          <h1 id="release-welcome-title"><span>版本更新信</span>${escapeHTML(release.title || '小词窝更新啦')}</h1>
          <p id="release-welcome-message" class="daily-welcome__message">${escapeHTML(release.message || '')}</p>
          <div class="release-welcome__list">
            ${items.map(item => `<article><span aria-hidden="true">${escapeHTML(item.icon || '✦')}</span><div><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.text)}</p></div></article>`).join('')}
          </div>
          <button type="button" class="daily-welcome__start" data-release-close>
            <span>知道啦，开始背词</span><span aria-hidden="true">→</span>
          </button>
        </section>
        <aside class="daily-welcome__side release-welcome__side" aria-label="小紫怪的更新留言">
          <span class="daily-welcome__number">NEW</span>
          <img src="mascot.svg" alt="抱着单词本的小紫怪">
          <p>${escapeHTML(release.signOff || '小紫怪会继续陪你认真背词。')}</p>
          <small>这封更新信只会出现一次</small>
        </aside>
      </div>`;

    let closed = false;
    const finish = () => {
      layer.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      if (typeof onClose === 'function') onClose();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      try { root.localStorage?.setItem(RELEASE_STORAGE_KEY, release.id); }
      catch (_) {}
      layer.classList.add('is-leaving');
      root.document.body.classList.remove('welcome-open');
      root.document.removeEventListener('keydown', onKeydown, true);
      root.setTimeout(finish, reduced ? 0 : 260);
    };
    const onKeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab') {
        const button = layer.querySelector('[data-release-close]');
        if (button) { event.preventDefault(); button.focus(); }
      }
    };
    layer.querySelector('[data-release-close]').addEventListener('click', close);
    root.document.addEventListener('keydown', onKeydown, true);
    root.document.body.appendChild(layer);
    root.document.body.classList.add('welcome-open');
    root.requestAnimationFrame(() => {
      layer.classList.add('is-ready');
      layer.querySelector('[data-release-close]').focus({preventScroll: true});
    });
    return true;
  }

  function show(context = {}, options = {}) {
    if (!root.document || root.document.querySelector('.daily-welcome')) return false;
    const now = options.date instanceof Date ? options.date : new Date();
    const content = dailyContent(now, context);
    try { if (!options.force && root.localStorage?.getItem(STORAGE_KEY) === content.key) return false; }
    catch (_) {}
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousFocus = root.document.activeElement;
    const layer = root.document.createElement('div');
    layer.className = `daily-welcome${content.christmas ? ` is-christmas is-christmas-${content.christmas.stage}` : content.occasion ? ` is-festival is-festival-${content.occasion.slug}` : ''}`;
    layer.innerHTML = `
      <div class="daily-welcome__paper" role="dialog" aria-modal="true" aria-labelledby="daily-welcome-title" aria-describedby="daily-welcome-message">
        <section class="daily-welcome__copy">
          <div class="daily-welcome__meta">
            <span>LYNN’S DAILY NOTE</span>
            <time datetime="${content.dateKey}">${content.dateLabel}</time>
          </div>
          <h1 id="daily-welcome-title"><span>${content.salutation}，</span>${content.name}。</h1>
          <p id="daily-welcome-message" class="daily-welcome__message">${content.message}</p>
          <div class="daily-welcome__promise">
            <span>今天的小约定</span>
            <p>${content.plan}</p>
          </div>
          <button type="button" class="daily-welcome__start" data-welcome-close>
            <span>开始今天的学习</span><span aria-hidden="true">→</span>
          </button>
        </section>
        <aside class="daily-welcome__side" aria-label="小紫怪的今日留言">
          <span class="daily-welcome__number">${String(now.getDate()).padStart(2, '0')}</span>
          ${content.occasion?.sideWord ? `<span class="daily-welcome__festival-word" aria-hidden="true">${escapeHTML(content.occasion.sideWord)}</span>` : ''}
          <img src="${content.occasion?.mascot || (content.birthday ? 'mascot-bday.svg' : 'mascot.svg')}" alt="抱着单词本的小紫怪">
          <p>${escapeHTML(content.signOff)}</p>
          ${content.streak ? `<small>已经连续学习 ${content.streak} 天</small>` : '<small>今天也从一小步开始</small>'}
        </aside>
      </div>`;

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (content.christmas) root.LynnChristmas?.startMusic?.();
      try { root.localStorage?.setItem(STORAGE_KEY, content.key); }
      catch (_) {}
      layer.classList.add('is-leaving');
      root.document.body.classList.remove('welcome-open');
      root.document.removeEventListener('keydown', onKeydown, true);
      root.setTimeout(() => {
        layer.remove();
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      }, reduced ? 0 : 260);
    };
    const onKeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab') {
        const button = layer.querySelector('[data-welcome-close]');
        if (button) { event.preventDefault(); button.focus(); }
      }
    };
    layer.querySelector('[data-welcome-close]').addEventListener('click', close);
    root.document.addEventListener('keydown', onKeydown, true);
    root.document.body.appendChild(layer);
    root.document.body.classList.add('welcome-open');
    root.requestAnimationFrame(() => {
      layer.classList.add('is-ready');
      layer.querySelector('[data-welcome-close]').focus({preventScroll: true});
    });
    return true;
  }

  root.LynnWelcome = {STORAGE_KEY, RELEASE_STORAGE_KEY, dayKey, dailyContent, seenToday, show, showRelease};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LynnWelcome;
})(typeof window !== 'undefined' ? window : globalThis);
