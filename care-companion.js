(function(){'use strict';
const ENDPOINT='https://lynn-words-sync.lynn-words-work.workers.dev',TOKEN_KEY='lynn:careAdminToken';let overview=null,scheduled=[],surprises=[],loading=false,error='';
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(_){return''}};const moodNames={tired:'有点累',okay:'还可以',good:'状态很好'},moodIcons={tired:'🌙',okay:'☁️',good:'✨'};
async function api(path,options={}){const headers=new Headers(options.headers||{});if(token())headers.set('Authorization',`Bearer ${token()}`);const response=await fetch(ENDPOINT+path,{...options,headers,cache:'no-store'});if(!response.ok){let message=`请求失败（${response.status}）`;try{message=(await response.json()).error||message}catch(_){}throw Error(message)}return response.json()}
const time=value=>new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const localInput=(hours=1)=>new Date(Date.now()+hours*3600_000-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,16);
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);
function panelHTML(){const active=!!overview?.companion?.active,mood=overview?.mood,milestones=overview?.milestones||[],pending=scheduled.filter(x=>!x.deliveredAt).sort((a,b)=>a.scheduledFor.localeCompare(b.scheduledFor)),waiting=surprises.filter(x=>!x.openedAt).sort((a,b)=>a.unlockDate.localeCompare(b.unlockDate));return `<section class="paper-panel care-companion-panel"><div class="panel-heading companion-admin-heading"><div><span>GENTLE COMPANY</span><h2>陪伴、心情与小惊喜</h2></div><button class="companion-toggle ${active?'active':''}" data-companion-admin="toggle" data-active="${active?'0':'1'}" ${loading?'disabled':''}><i></i>${active?'正在陪她':'我在陪你'}</button></div><div class="site-warning" role="status" hidden></div><div class="care-companion-summary"><article class="care-mood"><span>LYNN TODAY</span>${mood?`<div><i>${moodIcons[mood.level]}</i><h3>${moodNames[mood.level]}</h3></div><p>${E(mood.note||'她只选择了心情，没有留下文字。')}</p><small>${E(mood.date)} · ${time(mood.createdAt)}</small>`:'<h3>今天还没有写下心情</h3><p>她写下后会安静地同步到这里。</p>'}</article><article class="care-milestones"><span>MEMORY BOOK</span><h3>${milestones.length} 个纪念时刻</h3>${milestones.length?`<p>最近一条：${E(milestones[0].title)}</p><small>${time(milestones[0].achievedAt)}</small>`:'<p>第一条纪念还在路上。</p>'}</article></div><div class="care-tools-grid"><section><div class="care-tool-title"><div><span>SCHEDULED NOTES</span><h3>定时投递留言</h3></div><b>${pending.length} 封等待中</b></div><form data-companion-form="schedule" class="care-soft-form"><textarea name="body" rows="3" placeholder="例如：早安，今天也慢慢来。" required></textarea><label>投递时间<input name="scheduledFor" type="datetime-local" value="${localInput()}" required></label><button type="submit" ${loading?'disabled':''}>安排投递</button></form><div class="care-mini-list">${pending.length?pending.slice(0,6).map(item=>`<article><div><strong>${E(item.body)}</strong><small>${time(item.scheduledFor)} 自动进入信箱</small></div><button data-companion-admin="delete-scheduled" data-id="${item.id}">取消</button></article>`).join(''):'<p>还没有等待投递的留言。</p>'}</div></section><section><div class="care-tool-title"><div><span>LOCKED SURPRISE</span><h3>学完才能打开的信</h3></div><b>${waiting.length} 封等待中</b></div><form data-companion-form="surprise" class="care-soft-form"><textarea name="body" rows="3" placeholder="完成今天的目标以后，她才会看到这里的内容。" required></textarea><div class="care-form-row"><label>小礼物<select name="gift"><option>💜</option><option>🎁</option><option>🍎</option><option>🌷</option><option>⭐</option><option>🧋</option></select></label><label>生效日期<input name="unlockDate" type="date" value="${today()}" required></label></div><button type="submit" ${loading?'disabled':''}>藏进小词窝</button></form><div class="care-mini-list">${waiting.length?waiting.slice(0,6).map(item=>`<article><div><strong>${E(item.gift)} ${E(item.body)}</strong><small>${E(item.unlockDate)} · 完成当天目标后解锁</small></div><button data-companion-admin="delete-surprise" data-id="${item.id}">移除</button></article>`).join(''):'<p>还没有等待解锁的惊喜信。</p>'}</div></section></div></section>`}
let loaded = false;
let refreshFurniture;
let fetching = false;
let generation = 0;

function inject() {
  const content = document.querySelector('.care-content');
  const target = content?.querySelector('.owner-chat-panel,.sites-panel,.dashboard-grid');
  if (!target || !overview) return;
  const template = document.createElement('template');
  template.innerHTML = panelHTML();
  const next = template.content.firstElementChild;
  let panel = content.querySelector('.care-companion-panel');
  if (!panel) {
    target.before(next);
    panel = next;
    for (const form of panel.querySelectorAll('form')) LynnLetters.mount(form, form.dataset.companionForm);
  } else {
    for (const selector of ['.companion-admin-heading','.care-companion-summary','.care-tool-title','.care-mini-list']) {
      const fresh = next.querySelectorAll(selector);
      panel.querySelectorAll(selector).forEach((node,i) => {
        if (node.outerHTML !== fresh[i].outerHTML) node.replaceWith(fresh[i]);
      });
    }
  }
  const status = panel.querySelector('.site-warning');
  status.textContent = error; status.hidden = !error;
  for (const button of panel.querySelectorAll('form button')) button.disabled = loading;
}

async function readLists() {
  const id = ++generation;
  const [notes,letters] = await Promise.all([api('/care/scheduled'),api('/care/surprises')]);
  if (id !== generation) return;
  scheduled = notes.messages || []; surprises = letters.letters || []; loaded = true;
}

async function load() {
  if (!token() || loading || fetching) return;
  fetching = true;
  try { await readLists(); }
  catch (reason) { error = reason.message || '暂时读不到陪伴设置。'; }
  finally { fetching = false; inject(); }
}

window.addEventListener('lynn-care-rendered', event => {
  overview = event.detail?.overview || null;
  inject();
  const main = document.querySelector('.care-content');
  if (main && !main.querySelector('.wish-admin')) {
    const panel = document.createElement('section');
    panel.className = 'paper-panel wish-admin';
    main.querySelector('.care-companion-panel')?.after(panel);
    refreshFurniture = window.LynnCareFurniture?.mount(panel,api);
  } else if (!main?.querySelector('.wish-admin :focus')) refreshFurniture?.();
  if (!loaded || scheduled.some(note => !note.deliveredAt && Date.parse(note.scheduledFor) <= Date.now())) load();
});

async function update(action) {
  loading = true; error = ''; generation++; inject();
  try { await action(); await readLists(); }
  catch (reason) { error = reason.message || '暂时无法更新，请稍后再试。'; }
  finally { loading = false; inject(); }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-companion-admin]');
  if (!button || loading) return;
  await update(async () => {
    const action = button.dataset.companionAdmin;
    if (action === 'toggle') {
      const result = await api('/care/companion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:button.dataset.active==='1',minutes:45})});
      overview.companion = result.companion;
    } else if (action === 'delete-scheduled') await api(`/care/scheduled/${button.dataset.id}`,{method:'DELETE'});
    else if (action === 'delete-surprise') await api(`/care/surprises/${button.dataset.id}`,{method:'DELETE'});
  });
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-companion-form]');
  if (!form) return;
  event.preventDefault();
  if (loading) return;
  const kind = form.dataset.companionForm;
  const fields = Object.fromEntries(new FormData(form));
  const submittedDraft = LynnLetters.read(kind);
  await update(async () => {
    const schedule = kind === 'schedule';
    const body = schedule ? {body:fields.body,scheduledFor:new Date(fields.scheduledFor).toISOString()} : fields;
    await api(schedule ? '/care/scheduled' : '/care/surprises',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    // Keep anything the writer started changing during the request.
    if (Object.entries(fields).every(([name,value]) => form.elements.namedItem(name).value === value)) {
      form.reset();
      if (schedule) form.elements.scheduledFor.value = localInput();
      else form.elements.unlockDate.value = today();
      LynnLetters.clear(kind, submittedDraft);
    }
  });
});
})();
