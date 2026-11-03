(function (root) {
  'use strict';

  const TIME_ZONE = 'Asia/Shanghai';
  const THEMES = {
    lidong: {
      slug: 'lidong', icon: '🧣', sideWord: '暖冬', label: '立冬 · 天气转凉啦', salutation: '立冬安好', name: '童雯凌',
      title: '冬天到了，先把自己照顾暖',
      blessing: '愿你有热乎乎的饭、软绵绵的棉衣，也有一个愿意慢下来照顾自己的冬天。今天不用赶，暖暖地完成一点就很好。',
      signOff: '小紫怪已经穿好棉衣，也替你把今天的词本捂热了。',
      ritual: '今天的小仪式：喝一口热水，搓搓手，再翻开第一组单词。',
      mascot: 'assets/festivals/mascot-lidong.png', gift: {label: '收下暖手热饮', title: '暖意已经送到', message: '愿这杯热饮把今天的手心和心情都捂暖。慢一点也没关系，先照顾好自己。'}, decorations: ['🧶', '☕', '❄']
    },
    dongzhi: {
      slug: 'dongzhi', icon: '🥣', sideWord: '冬至', label: '冬至 · 白昼从今天慢慢变长', salutation: '冬至快乐', name: 'Lynn',
      title: '最长的夜，也会等来更长的光',
      blessing: '愿你今天有人惦记、有热汤暖胃，也愿那些暂时看不到结果的努力，都在安静地向光生长。',
      signOff: '吃好、睡好，再稳稳地记住几个词，冬至就很圆满。',
      ritual: '今天的小仪式：给自己留一碗热乎乎的汤，也留十分钟安静学习。',
      mascot: 'assets/festivals/mascot-dongzhi.png', gift: {label: '收下热汤圆', title: '冬至圆满', message: '最长的夜里，也有人替你留着一碗热乎乎的惦记。愿你温暖、踏实、常被关心。'}, decorations: ['🥟', '♨', '☀']
    },
    newyear: {
      slug: 'newyear', icon: '✨', sideWord: '新年', label: '01 / 01 · NEW YEAR', salutation: '新年快乐', name: '童雯凌',
      title: '新的一年，继续成为喜欢的自己',
      blessing: '愿新一年有新的答案、新的勇气和很多值得期待的小事。没完成的可以慢慢来，已经走过的路都算数。',
      signOff: '新年第一组词，不求很多，只求是一个轻轻松松的开始。',
      ritual: '今天的小仪式：写下一个小愿望，再背完一组词替它开个好头。',
      mascot: 'assets/festivals/mascot-newyear.png', gift: {label: '收下新年星光', title: '新年星光已点亮', message: '愿新一年的每一个小愿望，都有人认真听见，也被你一步一步走近。'}, decorations: ['✦', '2027', '✧']
    },
    spring: {
      slug: 'spring', icon: '🧧', sideWord: '新春', label: '正月初一 · 新春特别版', salutation: '新春快乐', name: '童雯凌',
      title: '新岁启封，愿所有好事都有回音',
      blessing: '愿你新的一年平安、自在、有底气；努力的事有结果，喜欢的人和事都常在身边。',
      signOff: '小紫怪给你拜年啦：愿单词记得住，考试答得对，日子过得甜。',
      ritual: '今天的小仪式：收下一句好话，也送未来的自己一小组新词。',
      mascot: 'assets/festivals/mascot-spring.png', gift: {label: '收下新春红包', title: '新春好运已装好', message: '红包里没有压力，只有平安、底气和一点点好运。愿你新岁自在，认真也开心。'}, decorations: ['🧧', '灯', '福']
    },
    lantern: {
      slug: 'lantern', icon: '🏮', sideWord: '元宵', label: '正月十五 · 元宵节', salutation: '元宵节快乐', name: 'Lynn',
      title: '灯火可亲，愿你的心愿也圆圆满满',
      blessing: '愿今晚有灯、有甜、有团圆，也愿你心里惦记的事情，都能慢慢靠近一个温柔的答案。',
      signOff: '汤圆负责甜，小紫怪负责陪你把今天这一组背完。',
      ritual: '今天的小仪式：吃一颗汤圆，猜一个词义，把圆满装进口袋。',
      mascot: 'assets/festivals/mascot-lantern.png', gift: {label: '点亮一盏心愿灯', title: '心愿灯亮起来啦', message: '愿这盏小灯替你照亮想去的方向，也照见身边那些一直陪着你的温柔。'}, decorations: ['🏮', '○', '✨']
    },
    qingming: {
      slug: 'qingming', icon: '🌿', sideWord: '清明', label: '清明 · 人间四月', salutation: '清明安好', name: '童雯凌',
      title: '风有思念，春天也有新的生长',
      blessing: '愿你记得来处，也安心走向前方。想念不必很响亮，被认真珍藏过的人和事，从来没有真正离开。',
      signOff: '今天适合慢一点，看看新绿，也温柔地照顾自己的心情。',
      ritual: '今天的小仪式：望一眼窗外的新绿，再安静完成眼前这一小组。',
      mascot: 'assets/festivals/mascot-qingming.png', gift: {label: '收下一片新绿', title: '春天正在长大', message: '愿想念被春风轻轻接住，愿新的嫩芽也提醒你：日子一直在温柔地向前。'}, decorations: ['🌱', '雨', '燕']
    },
    dragonboat: {
      slug: 'dragonboat', icon: '🌿', sideWord: '端午', label: '五月初五 · 端午安康', salutation: '端午安康', name: 'Lynn',
      title: '粽叶清香，愿你一整个夏天都安康',
      blessing: '愿你有乘风破浪的勇气，也有靠岸休息的安心；愿忙碌有收获，努力不被辜负。',
      signOff: '粽子要趁热吃，单词也趁现在记，小紫怪陪你一起。',
      ritual: '今天的小仪式：挑一个喜欢的粽子口味，再挑一组新词认真记住。',
      mascot: 'assets/festivals/mascot-dragonboat.png', gift: {label: '收下安康香囊', title: '今日安康已系好', message: '愿你有向前划的力气，也永远有可以安心靠岸的地方。这个夏天，顺遂安康。'}, decorations: ['🍃', '粽', '〰']
    },
    qixi: {
      slug: 'qixi', icon: '🌌', sideWord: '七夕', label: '七月初七 · 七夕', salutation: '七夕快乐', name: '童雯凌',
      title: '愿所有真心，都被温柔接住',
      blessing: '愿你喜欢的人和事也刚好喜欢你；就算星河很远，也总有人愿意认真听你说话、陪你走一段路。',
      signOff: '今天的浪漫，是有人记得你的认真，也记得提醒你别忘了背词。',
      ritual: '今天的小仪式：对喜欢的生活认真一点，也对今天的进度认真一点。',
      mascot: 'assets/festivals/mascot-qixi.png', gift: {label: '收下一颗真心星', title: '星河替你保存真心', message: '愿所有认真说出的话都被听见，所有真诚伸出的手都被温柔接住。'}, decorations: ['✦', '♡', '鹊']
    },
    midautumn: {
      slug: 'midautumn', icon: '🌕', sideWord: '月圆', label: '八月十五 · 中秋节', salutation: '中秋快乐', name: 'Lynn',
      title: '月亮很圆，愿牵挂的人都在身边',
      blessing: '愿你抬头有月光，低头有喜欢的日常；相隔再远的惦念，也能在今晚落到同一片温柔里。',
      signOff: '月饼慢慢吃，月亮慢慢看，今天的单词也慢慢记。',
      ritual: '今天的小仪式：留一会儿给月亮，再留一小组给未来的自己。',
      mascot: 'assets/festivals/mascot-midautumn.png', gift: {label: '收下今晚月光', title: '月光已经装进口袋', message: '愿你想念的人平安，身边的人常在，也愿你一直拥有抬头看月亮的心情。'}, decorations: ['🌕', '桂', '☁']
    },
    national: {
      slug: 'national', icon: '⭐', sideWord: '中国', label: '10 / 01 · 国庆节', salutation: '国庆快乐', name: '童雯凌',
      title: '山河辽阔，愿你的未来也有无限可能',
      blessing: '愿你看见更大的世界，也一直拥有选择方向的勇气。每一个认真生活的今天，都在铺向更远的地方。',
      signOff: '假期要好好玩，也可以用一小组单词保持轻轻的节奏。',
      ritual: '今天的小仪式：看看喜欢的风景，再给自己的目标向前添一小步。',
      mascot: 'assets/festivals/mascot-national.png', gift: {label: '收下远行地图', title: '下一段风景已标记', message: '愿你一直有看更大世界的好奇，也有选择自己方向的勇气。路很长，慢慢走。'}, decorations: ['⭐', '山河', '✦']
    }
  };

  function parts(date = new Date()) {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date).map(part => [part.type, part.value]));
    return {year: Number(values.year), month: Number(values.month), day: Number(values.day)};
  }

  function lunarParts(date = new Date()) {
    try {
      const values = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-chinese', {timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric'}).formatToParts(date).map(part => [part.type, part.value]));
      return {year: Number(values.relatedYear), month: Number(values.month), day: Number(values.day)};
    } catch (_) { return {year: 0, month: 0, day: 0}; }
  }

  function previewSlug() {
    if (!root.location || typeof root.URLSearchParams !== 'function') return '';
    const slug = new URLSearchParams(root.location.search).get('festival-preview') || '';
    return THEMES[slug] ? slug : '';
  }

  function matchedSlug(date) {
    const solar = parts(date), lunar = lunarParts(date);
    if (solar.month === 1 && solar.day === 1) return 'newyear';
    if (solar.month === 4 && (solar.day === 4 || solar.day === 5)) return 'qingming';
    if (solar.month === 10 && solar.day >= 1 && solar.day <= 3) return 'national';
    if (solar.month === 11 && (solar.day === 7 || solar.day === 8)) return 'lidong';
    if (solar.month === 12 && (solar.day === 21 || solar.day === 22)) return 'dongzhi';
    if (lunar.month === 1 && lunar.day >= 1 && lunar.day <= 3) return 'spring';
    if (lunar.month === 1 && lunar.day === 15) return 'lantern';
    if (lunar.month === 5 && lunar.day === 5) return 'dragonboat';
    if (lunar.month === 7 && lunar.day === 7) return 'qixi';
    if (lunar.month === 8 && lunar.day === 15) return 'midautumn';
    return '';
  }

  function info(date) {
    if (!(date instanceof Date) && root.LynnChristmas?.info?.()) return null;
    const actual = date instanceof Date ? date : new Date();
    const preview = date instanceof Date ? '' : previewSlug();
    const slug = preview || matchedSlug(actual);
    if (!slug) return null;
    const content = THEMES[slug], value = parts(actual);
    const key = `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
    return {
      active: true, ...content, date: actual, key,
      welcomeKey: preview ? `preview-${slug}-${key}` : `festival-${slug}-${key}`,
      dateLabel: preview ? `${content.label} · 主题预览` : new Intl.DateTimeFormat('zh-CN', {timeZone: TIME_ZONE, month: 'long', day: 'numeric', weekday: 'long'}).format(actual)
    };
  }

  function topGreeting(date) {
    const festival = info(date);
    return festival ? `${festival.icon} ${festival.salutation} · ${festival.signOff}` : '';
  }

  function focusLine(stats, settings = {}) {
    if (!stats) return '先挑一本词本，让今天从一个轻轻的小开始出发。';
    if (stats.due > 0) return `先和 ${stats.due} 个到期词见面，把旧记忆稳稳接住。`;
    const target = Math.max(1, Number(settings.dailyTarget) || 20);
    if (stats.newToday >= target) return `今天的 ${target} 个新词已经完成，可以安心收下这份节日小成就。`;
    return `今天已经认识 ${stats.newToday} 个新词，再完成一小组，就离目标更近一点。`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function banner(stats, settings) {
    const festival = info();
    if (!festival) return '';
    const got = received(festival);
    return `<section class="festival-card festival-card--${festival.slug}" aria-labelledby="festival-title"><div class="festival-card__decor" aria-hidden="true">${festival.decorations.map(item => `<span>${escapeHTML(item)}</span>`).join('')}</div><div class="festival-card__copy"><span class="festival-card__tag">${escapeHTML(festival.label)}</span><h2 id="festival-title">${escapeHTML(festival.title)}</h2><p class="festival-card__blessing">${escapeHTML(festival.blessing)}</p><p class="festival-card__ritual">${escapeHTML(festival.ritual)}</p><p class="festival-card__focus">${escapeHTML(focusLine(stats, settings))}</p><button type="button" class="festival-card__gift${got ? ' is-received' : ''}" data-action="festival-gift">${got ? '今天的祝福已收好 ✓' : `${festival.icon} ${escapeHTML(festival.gift.label)}`}</button></div></section>`;
  }

  function giftKey(festival) { return `lynn:festival-gift:${festival.welcomeKey}`; }

  function received(festival = info()) {
    if (!festival || !root.localStorage) return false;
    try { return root.localStorage.getItem(giftKey(festival)) === '1'; }
    catch (_) { return false; }
  }

  function receive(date) {
    const festival = info(date);
    if (!festival || !root.document) return null;
    try { root.localStorage?.setItem(giftKey(festival), '1'); } catch (_) {}
    root.document.querySelector('.festival-gift-layer')?.remove();
    const layer = root.document.createElement('div');
    layer.className = 'festival-gift-layer';
    layer.innerHTML = `<div class="festival-gift-dialog" role="dialog" aria-modal="true" aria-labelledby="festival-gift-title"><button type="button" class="festival-gift-close" data-festival-gift-close aria-label="关闭">×</button><img src="${escapeHTML(festival.mascot)}" alt="${escapeHTML(festival.label)}的小紫怪"><span>${escapeHTML(festival.label)}</span><h2 id="festival-gift-title">${escapeHTML(festival.gift.title)}</h2><p>${escapeHTML(festival.gift.message)}</p><button type="button" class="festival-gift-keep" data-festival-gift-close>收好啦</button></div>`;
    const close = () => { root.removeEventListener('keydown', onKey); layer.classList.remove('is-ready'); setTimeout(() => layer.remove(), 220); };
    const onKey = event => { if (event.key === 'Escape') close(); };
    layer.addEventListener('click', event => { if (event.target === layer || event.target.closest('[data-festival-gift-close]')) close(); });
    root.document.body.appendChild(layer);
    root.addEventListener('keydown', onKey);
    requestAnimationFrame(() => layer.classList.add('is-ready'));
    layer.querySelector('.festival-gift-keep')?.focus();
    return {...festival.gift, toast: `${festival.gift.label} ✓`};
  }

  function apply(date) {
    const festival = info(date);
    if (!root.document) return festival;
    Array.from(root.document.body.classList).forEach(name => { if (name === 'festival-active' || name.startsWith('festival-')) root.document.body.classList.remove(name); });
    if (festival) {
      root.document.body.classList.add('festival-active', `festival-${festival.slug}`);
      root.document.body.dataset.festival = festival.slug;
    } else delete root.document.body.dataset.festival;
    return festival;
  }

  root.LynnFestivals = {TIME_ZONE, THEMES, parts, lunarParts, matchedSlug, info, topGreeting, banner, received, receive, apply};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LynnFestivals;
})(typeof window !== 'undefined' ? window : globalThis);
