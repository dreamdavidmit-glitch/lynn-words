(function () {
  'use strict';

  const ENDPOINT = 'https://lynn-words-sync.lynn-words-work.workers.dev';
  const TOKEN_KEY = 'lynn:careAdminToken';
  const app = document.getElementById('care-app');
  let overview = null;
  let busy = false;
  let error = '';
  let lastLoadedAt = 0;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } };
  const setToken = value => { try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch (_) {} };
  const pad = value => String(value).padStart(2, '0');
  const day = value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const addDays = (key, amount) => { const value = new Date(`${key}T12:00:00`); value.setDate(value.getDate() + amount); return day(value); };
  const today = () => day(new Date());
  const percent = (correct, attempts) => attempts ? `${Math.round(correct / attempts * 100)}%` : '—';
  const formatDate = key => key ? new Date(`${key}T12:00:00`).toLocaleDateString('zh-CN', {month:'long', day:'numeric', weekday:'short'}) : '还没有记录';
  const friendlyTime = value => {
    if (!value) return '还没有出现过';
    const date = new Date(value), difference = Math.max(0, Date.now() - date.getTime());
    if (difference < 60_000) return '刚刚';
    if (difference < 3_600_000) return `${Math.max(1, Math.floor(difference / 60_000))} 分钟前`;
    if (difference < 86_400_000) return `今天 ${date.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
    return date.toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
  };
  const emptyDay = key => ({date:key, activeMinutes:0, attempts:0, correct:0, wrong:0, newWords:0, remembered:0, rescueDone:0, studied:false});
  const getDay = key => overview?.days?.find(item => item.date === key) || emptyDay(key);
  const range = (end, count) => Array.from({length:count}, (_, index) => getDay(addDays(end, index - count + 1)));

  async function message(response) {
    try { return (await response.json()).error || `请求失败（${response.status}）`; }
    catch (_) { return `请求失败（${response.status}）`; }
  }

  async function login(password) {
    const response = await fetch(`${ENDPOINT}/care/session`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password})});
    if (!response.ok) throw new Error(await message(response));
    const result = await response.json();
    setToken(result.token);
  }

  async function load({silent = false} = {}) {
    if (!token()) return renderLogin();
    busy = true; error = '';
    if (!silent) renderDashboard();
    try {
      const response = await fetch(`${ENDPOINT}/admin/overview`, {headers:{Authorization:`Bearer ${token()}`}, cache:'no-store'});
      if (response.status === 401) { setToken(''); throw new Error('管理员验证已过期，请重新输入密码。'); }
      if (!response.ok) throw new Error(await message(response));
      overview = await response.json();
      lastLoadedAt = Date.now();
    } catch (reason) {
      error = reason.message || '暂时无法读取学习概况。';
      if (!token()) return renderLogin();
    } finally { busy = false; }
    renderDashboard();
  }

  function renderLogin() {
    app.innerHTML = `<main class="login-wrap"><section class="login-paper"><div class="login-brand"><div class="brand-mark">L</div><div><strong>Lynn的小词窝</strong><small>PRIVATE CARE NOTE</small></div></div><div class="login-copy"><span class="paper-label">只给你看的私人入口</span><h1>看看她今天<br>有没有来过</h1><p>这里不展示具体答案，只留下在线状态、学习时长、网站运行情况和一点点成长的脚印。</p><form id="login-form"><label class="field">进入密码<input name="password" type="password" maxlength="128" autocomplete="current-password" required autofocus></label>${error ? `<div class="error" role="alert">${escape(error)}</div>` : ''}<button class="primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? '小紫怪正在开门…' : '打开我的控制台'}<span>→</span></button></form><small class="privacy-note">第一次可以使用管理员密码进入，之后可在设置里换成独立进入密码。</small></div><div class="login-friend"><span class="friend-note">我会收好她的脚印，也会替你看着网站有没有好好运行。</span><img src="mascot.svg" alt="抱着单词本的小紫怪"></div></section></main>`;
  }

  function presenceView() {
    const presence = overview?.presence || {state:'offline', studying:false, lastSeenAt:''};
    if (presence.state === 'online' && presence.studying) return {kind:'online', eyebrow:'ONLINE NOW', title:'Lynn 正在背单词', note:'她正在小词窝里学习，先不打扰她。', time:'刚刚还在认真'};
    if (presence.state === 'online') return {kind:'online', eyebrow:'ONLINE NOW', title:'Lynn 正在小词窝', note:'网页正在前台打开，也许正在选今天的任务。', time:'现在在线'};
    if (presence.state === 'away') return {kind:'away', eyebrow:'JUST AWAY', title:'她刚刚离开一下', note:'小词窝还留着她刚才的脚印，过一会儿再看看。', time:`最后出现 ${friendlyTime(presence.lastSeenAt)}`};
    return {kind:'offline', eyebrow:'RESTING NOW', title:'现在没有打开小词窝', note:'不用催她，认真和休息都应该被温柔对待。', time:`最后出现 ${friendlyTime(presence.lastSeenAt)}`};
  }

  function renderDashboard() {
    if (!overview) {
      app.innerHTML = `<section class="loading-card"><span class="pulse">●</span><p>${error ? escape(error) : '小紫怪正在翻找学习脚印…'}</p>${error ? '<button class="secondary" data-action="refresh">再试一次</button>' : ''}</section>`;
      return;
    }

    const key = today();
    const todayData = getDay(key);
    const week = range(key, 7);
    const weekAttempts = week.reduce((sum, item) => sum + item.attempts, 0);
    const weekMinutes = week.reduce((sum, item) => sum + item.activeMinutes, 0);
    const weekNew = week.reduce((sum, item) => sum + item.newWords, 0);
    const weekRemembered = week.reduce((sum, item) => sum + item.remembered, 0);
    const weekDays = week.filter(item => item.studied).length;
    const maxScore = Math.max(1, ...week.map(item => item.attempts + item.newWords * 2 + item.activeMinutes / 2));
    const activeDeck = overview.decks?.find(item => item.active) || overview.decks?.[0];
    const todayTarget = overview.dailyPlan?.date === key && overview.dailyPlan.target ? overview.dailyPlan.target : 15;
    const todayProgress = Math.min(100, Math.round(todayData.newWords / Math.max(1, todayTarget) * 100));
    const presence = presenceView();
    const warmLine = weekDays >= 5 ? '她这周来得很稳定。不是每一天都要很用力，愿意一次次回来就已经很好。' : weekDays >= 2 ? '这一周已经留下了好几枚脚印，每一次打开小词窝都算数。' : '这一周还很轻，小紫怪会在这里安静等她，不催促。';

    app.innerHTML = `<div class="care-page"><header class="care-header"><a class="brand" href="care.html"><span class="brand-mark">L</span><span><strong>Lynn的小词窝</strong><small>WORDS & LITTLE MONSTERS</small></span></a><div class="header-actions"><span class="cloud-note">云端版本 ${overview.revision}</span><button class="round-button" data-action="refresh" aria-label="刷新数据" title="刷新数据" ${busy ? 'disabled' : ''}>↻</button><button class="text-button" data-action="logout">退出</button></div></header>${error ? `<div class="error page-error" role="alert">${escape(error)}</div>` : ''}<main class="care-content"><section class="presence-card ${presence.kind}"><div class="presence-copy"><span class="presence-kicker"><i></i>${presence.eyebrow}</span><h1>${presence.title}</h1><p>${presence.note}</p><span class="last-seen">${presence.time}</span></div><div class="presence-friend"><span class="speech">${presence.kind === 'online' ? '嘘，她正在认真。' : presence.kind === 'away' ? '刚刚还在这里。' : '等她下次回来。'}</span><img src="mascot.svg" alt="抱着单词本的小紫怪"></div><div class="today-ring"><svg viewBox="0 0 140 140" role="img" aria-label="今日新词目标完成 ${todayProgress}%"><defs><linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#76549d"/><stop offset=".58" stop-color="#a77aca"/><stop offset="1" stop-color="#e78bab"/></linearGradient></defs><circle class="ring-track" cx="70" cy="70" r="56" pathLength="100"/><circle class="ring-progress" cx="70" cy="70" r="56" pathLength="100" style="--offset:${100 - todayProgress}"/></svg><div class="ring-copy"><small>今日新词</small><strong>${todayData.newWords}<span> / ${todayTarget}</span></strong><em>${todayProgress}%</em></div><span class="ring-note">做到这里就可以休息</span></div></section><section class="today-strip"><article><span>今天学习</span><strong>${todayData.activeMinutes}<small>分钟</small></strong><em>${todayData.studied ? '认真出现过就算数' : '今天还没有新记录'}</em></article><article><span>完成练习</span><strong>${todayData.attempts}<small>次</small></strong><em>正确率 ${percent(todayData.correct, todayData.attempts)}</em></article><article><span>真正记住</span><strong>${todayData.remembered}<small>个</small></strong><em>经过复习验证的词</em></article><article><span>本周出现</span><strong>${weekDays}<small>天</small></strong><em>没有排名，只有脚印</em></article></section><div class="dashboard-grid"><section class="paper-panel week-panel"><div class="panel-heading"><div><span>THIS WEEK</span><h2>这一周的节奏</h2></div><strong>${weekMinutes}<small> 分钟</small></strong></div><div class="week-chart">${week.map(item => { const score = item.attempts + item.newWords * 2 + item.activeMinutes / 2; const height = Math.max(item.studied ? 10 : 3, Math.round(score / maxScore * 100)); return `<article class="day-column ${item.date === key ? 'today' : ''} ${item.studied ? 'studied' : 'rest'}"><div class="day-bar"><i style="height:${height}%"></i>${item.studied ? '<b>✦</b>' : ''}</div><strong>${new Date(`${item.date}T12:00:00`).toLocaleDateString('zh-CN', {weekday:'short'})}</strong><small>${item.attempts ? `${item.attempts}题` : '休息'}</small></article>`; }).join('')}</div><p class="warm-line">${warmLine}</p></section><section class="paper-panel book-panel"><span class="panel-label">CURRENT BOOK</span><h2>${activeDeck ? escape(activeDeck.title) : '还没有词本'}</h2>${activeDeck ? `<div class="book-progress"><div><i style="width:${activeDeck.words ? Math.min(100, activeDeck.seen / activeDeck.words * 100) : 0}%"></i></div><span>${activeDeck.seen} / ${activeDeck.words}</span></div><div class="book-numbers"><p><strong>${overview.totals.seen}</strong><span>见过的词</span></p><p><strong>${overview.totals.remembered}</strong><span>真正记住</span></p></div>` : '<p class="empty-copy">云端还没有词本记录。</p>'}<div class="week-note"><strong>本周小结</strong><p>新认识 ${weekNew} 个词，完成 ${weekAttempts} 次练习，记住 ${weekRemembered} 个。</p></div></section><section class="paper-panel footprints-panel"><div class="panel-heading"><div><span>LITTLE FOOTPRINTS</span><h2>最近七天的脚印</h2></div><small>空白不是失败，只是休息。</small></div><div class="footprint-list">${[...week].reverse().map(item => `<article><time><strong>${formatDate(item.date)}</strong><small>${item.date}</small></time><div class="footprint-line"><i class="${item.studied ? 'active' : ''}"></i><span></span></div><div class="footprint-detail">${item.studied ? `<strong>${item.activeMinutes} 分钟</strong><span>${item.attempts} 次练习 · ${item.newWords} 个新词${item.rescueDone ? ` · 急救 ${item.rescueDone} 个` : ''}</span>` : '<strong>好好休息</strong><span>这一天安静留白</span>'}</div></article>`).join('')}</div></section></div><footer><span>💜</span><p>这里只收好学习时间和数量，不记录位置、设备，也不展示具体答案。</p><small>最后刷新 ${friendlyTime(overview.updatedAt)}</small></footer></main></div>`;
    window.dispatchEvent(new CustomEvent('lynn-care-rendered', {detail:{overview}}));
  }

  app.addEventListener('submit', async event => {
    if (event.target.id !== 'login-form') return;
    event.preventDefault();
    const password = new FormData(event.target).get('password');
    busy = true; error = ''; renderLogin();
    try { await login(password); overview = null; await load(); }
    catch (reason) { error = reason.message || '验证失败。'; busy = false; renderLogin(); }
  });

  app.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh' && !busy) load();
    else if (action === 'logout') { setToken(''); overview = null; error = ''; renderLogin(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && token() && Date.now() - lastLoadedAt > 30_000) load({silent:true});
  });
  setInterval(() => { if (!document.hidden && token() && !busy) load({silent:true}); }, 45_000);

  token() ? load() : renderLogin();
})();
