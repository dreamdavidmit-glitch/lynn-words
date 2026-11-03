(function (root) {
  'use strict';

  const TIME_ZONE = 'Asia/Shanghai';
  const APPLE_PREFIX = 'lynn:christmasApple:';
  const MUSIC_KEY = 'lynn:christmasMusicEnabled';
  const MUSIC_SRC = 'assets/christmas/jingle-bells.mp3';
  let music = null;
  let musicArmed = false;
  const DAYS = {
    24: {stage:'eve',label:'12 / 24 · 平安夜',salutation:'平安夜快乐',name:'童雯凌',title:'今晚，先把平安送给你',blessing:'愿你今晚有热饮、有好梦，也有人把你的平安认真放在心上。',signOff:'平安果已经准备好，只等你收下。'},
    25: {stage:'day',label:'12 / 25 · CHRISTMAS DAY',salutation:'圣诞快乐',name:'Lynn',title:'圣诞节，愿快乐准时抵达',blessing:'愿你的冬天被喜欢的事、想见的人和越来越熟的单词填满。',signOff:'今天可以认真背词，也可以认真开心。'},
    26: {stage:'week',label:'12 / 26 · 圣诞周',salutation:'冬日快乐',name:'童雯凌',title:'把昨天的快乐，再留久一点',blessing:'愿圣诞节过去以后，温暖没有立刻散场，好心情继续陪你向前。',signOff:'节日会过去，认真生活的光不会。'},
    27: {stage:'week',label:'12 / 27 · 圣诞周',salutation:'今天也要开心',name:'Lynn',title:'今天也有一份小小的冬日祝福',blessing:'愿你遇到的难题都有答案，记不住的单词也愿意再回来一次。',signOff:'慢慢来，冬天很长，进步也正在发生。'},
    28: {stage:'week',label:'12 / 28 · 圣诞周',salutation:'冬日安好',name:'童雯凌',title:'给忙碌留一点柔软的位置',blessing:'愿你今天做完该做的事，也给自己留一点发呆、喝热饮和开心的时间。',signOff:'认真努力的人，也值得被温柔照顾。'},
    29: {stage:'week',label:'12 / 29 · 圣诞周',salutation:'晚上好',name:'Lynn',title:'今年快要翻到最后几页了',blessing:'愿这一年的遗憾轻一点，收获多一点，想完成的事情都在慢慢靠近。',signOff:'今天背下的词，也算写给明年的礼物。'},
    30: {stage:'week',label:'12 / 30 · 圣诞周最后一天',salutation:'圣诞周快乐',name:'童雯凌',title:'收好最后一份圣诞周祝福',blessing:'愿你带着这一周的温暖走进新年，平安、自由，也一直有勇气喜欢生活。',signOff:'圣诞装饰明天收起，祝福不会过期。'}
  };

  function parts(date = new Date()) {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part => [part.type, part.value]));
    return {year:Number(values.year),month:Number(values.month),day:Number(values.day)};
  }
  function previewDay() {
    if (!root.location || typeof root.URLSearchParams !== 'function') return null;
    const value = new URLSearchParams(root.location.search).get('christmas-preview');
    if (!value) return null;
    if (value === 'eve') return 24;
    if (value === 'day') return 25;
    if (value === 'week') return 27;
    const n = Number(value);
    return Number.isInteger(n) && n >= 24 && n <= 30 ? n : null;
  }
  function effectiveDate(date) {
    if (date instanceof Date) return date;
    const preview = previewDay();
    if (!preview) return new Date();
    return new Date(Date.UTC(parts(new Date()).year, 11, preview, 4));
  }
  function info(date) {
    const actual = effectiveDate(date), value = parts(actual), content = value.month === 12 ? DAYS[value.day] : null;
    if (!content) return null;
    const key = `${value.year}-12-${String(value.day).padStart(2,'0')}`;
    return {active:true,...content,year:value.year,day:value.day,key,welcomeKey:previewDay()?`preview-${key}`:key,date:actual,dateLabel:new Intl.DateTimeFormat('zh-CN',{timeZone:TIME_ZONE,month:'long',day:'numeric',weekday:'long'}).format(actual),mascot:'assets/christmas/lynn-mascot-christmas.png'};
  }
  function topGreeting(date) {
    const season = info(date);
    if (!season) return '';
    return season.day === 24 ? '平安夜快乐，Lynn · 平安果已就位' : season.day === 25 ? 'MERRY CHRISTMAS, LYNN!' : `${season.label} · 小紫怪冬日值班中`;
  }
  function appleKey(year) { return APPLE_PREFIX + (previewDay() ? `preview:${year}` : year); }
  function hasApple(date) {
    const season = info(date);
    if (!season) return false;
    try { return root.localStorage?.getItem(appleKey(season.year)) === 'received'; }
    catch (_) { return false; }
  }
  function receiveApple(date) {
    const season = info(date);
    if (!season || hasApple(season.date)) return false;
    try { root.localStorage?.setItem(appleKey(season.year), 'received'); } catch (_) {}
    return true;
  }
  function musicEnabled() {
    try { return root.localStorage?.getItem(MUSIC_KEY) !== 'off'; }
    catch (_) { return true; }
  }
  function rememberMusic(enabled) {
    try { root.localStorage?.setItem(MUSIC_KEY, enabled ? 'on' : 'off'); }
    catch (_) {}
  }
  function ensureMusic() {
    if (!music && typeof root.Audio === 'function') {
      music = new root.Audio(MUSIC_SRC);
      music.loop = true;
      music.preload = 'auto';
      music.volume = .24;
      music.setAttribute('playsinline', '');
    }
    return music;
  }
  function isMusicPlaying() {
    return !!music && !music.paused && !music.ended;
  }
  function syncMusicButton() {
    if (!root.document) return;
    const playing = isMusicPlaying();
    root.document.querySelectorAll('[data-action="christmas-music"]').forEach(button => {
      button.classList.toggle('is-playing', playing);
      button.setAttribute('aria-pressed', String(playing));
      button.innerHTML = `<span aria-hidden="true">${playing?'⏸':'♫'}</span>${playing?'暂停圣诞音乐':'播放圣诞音乐'}`;
    });
  }
  async function startMusic(force = false) {
    if (!info()) return false;
    if (force) rememberMusic(true);
    if (!musicEnabled()) return false;
    const player = ensureMusic();
    if (!player) return false;
    if (isMusicPlaying()) { syncMusicButton(); return true; }
    try { await player.play(); syncMusicButton(); return true; }
    catch (_) { return false; }
  }
  function pauseMusic(remember = false) {
    if (music) music.pause();
    if (remember) rememberMusic(false);
    syncMusicButton();
  }
  async function toggleMusic() {
    if (!info()) return false;
    if (isMusicPlaying()) { pauseMusic(true); return false; }
    rememberMusic(true);
    const player = ensureMusic();
    if (!player) return false;
    try { await player.play(); syncMusicButton(); return true; }
    catch (_) { return false; }
  }
  function armMusic() {
    if (musicArmed || isMusicPlaying() || !root.document || !musicEnabled()) return;
    musicArmed = true;
    const resume = event => {
      root.document.removeEventListener('pointerdown', resume, true);
      root.document.removeEventListener('keydown', resume, true);
      musicArmed = false;
      if (event?.target?.closest?.('[data-action="christmas-music"]')) return;
      startMusic();
    };
    root.document.addEventListener('pointerdown', resume, {once:true,capture:true});
    root.document.addEventListener('keydown', resume, {once:true,capture:true});
  }
  function focusLine(stats, settings = {}) {
    if (!stats) return '先挑一本词本，和小紫怪一起拆开今天的第一份学习礼物。';
    if (stats.due > 0) return `先复习 ${stats.due} 个到期词，再放心拆开今天的新词礼物。`;
    const target = Math.max(1, Number(settings.dailyTarget) || 20);
    if (stats.newToday >= target) return `今天的 ${target} 个新词已经完成，这份圣诞周进度可以安心打勾。`;
    return `今天已经认识 ${stats.newToday} 个新词，再完成一小组就离目标更近了。`;
  }
  function banner(stats, settings) {
    const season = info();
    if (!season) return '';
    const received = hasApple(season.date);
    const playing = isMusicPlaying();
    return `<section class="christmas-card christmas-card--${season.stage}" aria-labelledby="christmas-title"><img class="christmas-card__garland" src="assets/christmas/pieces/garland-lights.png" alt="" aria-hidden="true"><div class="christmas-card__copy"><div class="christmas-card__tools"><span class="christmas-card__tag">${season.label}</span><button type="button" class="christmas-music ${playing?'is-playing':''}" data-action="christmas-music" aria-pressed="${playing}"><span aria-hidden="true">${playing?'⏸':'♫'}</span>${playing?'暂停圣诞音乐':'播放圣诞音乐'}</button></div><h2 id="christmas-title">${season.title}</h2><p class="christmas-card__blessing">${season.blessing}</p><p class="christmas-card__focus">${focusLine(stats,settings)}</p></div><div class="christmas-apple ${received?'is-received':''}"><span class="christmas-apple__fruit" aria-hidden="true">🍎</span><div><strong>${received?'平安果已送达':'有人给你留了一颗平安果'}</strong><p>${received?'愿你新的一年也平平安安、顺顺利利。':'从平安夜开始都可以收下，只送一次，但祝福一直有效。'}</p></div>${received?'<span class="christmas-apple__check" aria-label="已收下">✓</span>':'<button type="button" class="btn christmas-apple__button" data-action="christmas-apple">收下平安果</button>'}</div></section>`;
  }
  function apply(date) {
    const season = info(date);
    if (!root.document) return season;
    root.document.body.classList.remove('christmas-active','christmas-eve','christmas-day','christmas-weekday');
    if (season) {
      root.document.body.classList.add('christmas-active',season.stage==='eve'?'christmas-eve':season.stage==='day'?'christmas-day':'christmas-weekday');
      armMusic();
    } else pauseMusic();
    return season;
  }
  function appleBurst() {
    if (!root.document || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const box = root.document.createElement('div'); box.className = 'apple-burst'; box.setAttribute('aria-hidden','true');
    for (let i=0;i<12;i++) { const apple=root.document.createElement('i'); apple.textContent=i%4===0?'✨':'🍎'; apple.style.setProperty('--x',`${(Math.random()-.5)*260}px`); apple.style.setProperty('--y',`${-80-Math.random()*180}px`); apple.style.setProperty('--r',`${(Math.random()-.5)*180}deg`); apple.style.animationDelay=`${Math.random()*.15}s`; box.appendChild(apple); }
    root.document.body.appendChild(box); root.setTimeout(()=>box.remove(),1800);
  }
  root.LynnChristmas = {TIME_ZONE,DAYS,parts,effectiveDate,info,topGreeting,hasApple,receiveApple,musicEnabled,isMusicPlaying,startMusic,pauseMusic,toggleMusic,banner,apply,appleBurst};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LynnChristmas;
})(typeof window !== 'undefined' ? window : globalThis);
