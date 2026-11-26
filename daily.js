(() => {
  'use strict';
  const care=!!document.getElementById('care-app');
  const endpoint='https://lynn-words-sync.lynn-words-work.workers.dev';
  const names=['晨光热茶','雨窗读书','星星被窝','金色银杏','草莓野餐','圣诞雪窗',
    '桌前暖灯','湖边月光','香草小院','星星饼干','山间暮色','紫色来信'];
  const picture=n=>'assets/checkin/checkin-'+String(n).padStart(2,'0')+'.webp';
  const node=(tag,text)=>{const element=document.createElement(tag);if(text)element.textContent=text;return element;};
  const token=()=>{try{return sessionStorage.getItem('lynn:careAdminToken');}catch(_){return null;}};
  const jsonBody=body=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const dateQuery=day=>'?date='+encodeURIComponent(day);
  async function request(path,options={}) {
    if (!care) return window.LynnSync.dailyRequest(path,options);
    const current=token();
    if (!current) throw Error('请先登录关心面板。');
    const response=await fetch(endpoint+path,{
      signal:AbortSignal.timeout(25000),...options,
      headers:{Authorization:'Bearer '+current,...options.headers}
    });
    if (!response.ok) throw Error((await response.json().catch(()=>null))?.error || '请求失败，请重试。');
    if (current!==token()) throw Error('登录状态已变化。');
    return response;
  }
  const api=async(path,options)=>await (await request(path,options)).json();
  const shanghai=now=>new Date(now+8*3_600_000).toISOString();
  let dialog, dialogURL, dialogTurn=0;
  function dismissDialog() {
    dialogTurn++;
    if (dialogURL) URL.revokeObjectURL(dialogURL);
    dialogURL=null;
    dialog?.remove();
    dialog=null;
  }
  document.addEventListener('click',async event=>{
    const trigger=event.target.closest('[data-memory-photo]');
    if (!trigger) return;
    const id=Number(trigger.dataset.memoryPhoto);
    if (!Number.isSafeInteger(id) || id<1) return;
    dismissDialog();
    const turn=dialogTurn;
    const layer=node('dialog');layer.className='daily-memory-dialog';
    layer.setAttribute('aria-label','记忆照片');
    const close=node('button','关闭');close.type='button';close.onclick=()=>layer.close();
    const title=node('h2','新来的记忆照片');
    const status=node('p','正在打开照片…');status.setAttribute('role','status');
    const img=node('img');img.hidden=true;img.alt='信箱里的记忆照片';
    layer.append(close,title,status,img);
    layer.addEventListener('close',()=>{if (dialog===layer)dismissDialog();});
    layer.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
    document.body.append(layer);dialog=layer;layer.showModal();
    // Treat opening the notification as acknowledging it, even if the photo was taken down.
    api('/messages/photo/'+id+'/read',{method:'POST'})
      .then(()=>window.dispatchEvent(new Event('lynn-photo-notice-read'))).catch(()=>{});
    try {
      const blob=await (await request('/room/photos/'+id)).blob();
      if (turn!==dialogTurn) return;
      if (!blob.size) throw Error('照片没有读到。');
      dialogURL=URL.createObjectURL(blob);img.src=dialogURL;
      await img.decode();
      if (turn===dialogTurn) {img.hidden=false;status.hidden=true;}
    } catch (error) {
      if (turn===dialogTurn) status.textContent=error?.message==='图片不存在。'
        ? '这张照片可能已经取下或删除了。' : '照片暂时没读到，关闭后可以重新打开。';
    }
  });

  // A new image is shown only once its bytes have decoded; older requests cannot overwrite it.
  function imageViewer(img) {
    let serial=0, liveURL=null;
    return async (card,base,status)=>{
      const turn=++serial;
      if(liveURL) URL.revokeObjectURL(liveURL);
      liveURL=null;img.removeAttribute('src');img.hidden=true;
      if (!card) return;
      status.textContent='正在准备图片…';
      const reveal=async(src)=>{
        const sample=new Image();sample.src=src;await sample.decode();
        if(turn!==serial)return;
        img.src=src;img.hidden=false;
      };
      try {
        if (card.custom) {
          const blob=await (await request(base+'/image'+dateQuery(card.day))).blob();
          if(turn!==serial)return;
          liveURL=URL.createObjectURL(blob);await reveal(liveURL);
        } else await reveal(picture(card.template));
        if(turn===serial)status.textContent='';
      } catch (_) {
        if(turn!==serial)return;
        if (card.custom) {
          try {await reveal(picture(card.template));if(turn===serial)status.textContent='自定义图暂时没读到，先显示默认插画。';return;}
          catch (_) {}
        }
        if(turn===serial)status.textContent='图片暂时没读到，重新打开可以重试。';
      }
    };
  }

  if (care) {
    let panel, activeToken, card, running=false;
    function mountCare() {
      const area=document.querySelector('.care-content'), auth=token();
      if (!area || !auth) return;
      if (!panel || activeToken!==auth) {
        panel?.remove();card=null;activeToken=auth;
        const section=node('section');section.className='paper-panel daily-card daily-care';
        section.innerHTML='<div class="daily-eyebrow">A LITTLE GIFT FOR TOMORROW</div><h2>明天的打卡图片</h2><details><summary>设置或预览</summary><p class="daily-date"></p><p>不设置就自动轮换小紫怪插画。Lynn 点「今日打卡」后才会看到。</p><img class="daily-art" alt="明天的打卡图预览" hidden><p class="daily-image-status" role="status"></p><form><fieldset disabled><label>选一张默认插画 <select name="template"></select></label><label>或从相册上传 <input name="image" type="file" accept="image/*"></label><div class="daily-actions"><button type="submit">设为明天的打卡图</button><button type="button" data-clear>恢复自动轮换</button></div></fieldset></form><button type="button" data-reload>刷新明日设置</button><p class="daily-status" role="status"></p></details>';
        const form=section.querySelector('form'), fields=form.querySelector('fieldset');
        const notice=section.querySelector('.daily-status');
        const select=form.elements.template;
        names.forEach((name,i)=>{const option=node('option',name);option.value=String(i+1);select.append(option);});
        const show=imageViewer(section.querySelector('img'));
        const showCard=()=>show(card,'/care/daily/card',section.querySelector('.daily-image-status'));
        function apply(next) {
          card=next;
          section.querySelector('.daily-date').textContent='北京时间 '+next.day+' · '+(next.configured?'已设置':'自动轮换');
          select.value=String(next.template);
          showCard();
        }
        async function act(action) {
          if (running) return;
          running=true;const account=activeToken;
          fields.disabled=true;notice.textContent='正在处理…';
          try {
            const [next,text]=await action();
            if (account!==token()) return;
            apply(next);notice.textContent=text;
          } catch (error) {notice.textContent=error.message || '操作没完成，请重试。';}
          finally {running=false;fields.disabled=!card;}
        }
        const loadCard=()=>act(async()=>[(await api('/care/daily/card')).card,'']);
        section.querySelector('details').ontoggle=e=>{if(e.target.open)loadCard();};
        section.querySelector('[data-reload]').onclick=loadCard;
        select.onchange=()=>show({...card,custom:false,template:Number(select.value)},'/care/daily/card',section.querySelector('.daily-image-status'));
        form.onsubmit=e=>{
          e.preventDefault();if(!card)return;
          act(async()=>{
            const file=form.elements.image.files[0];
            const data=file ? await window.LynnCarePhotos.compress(file) : null;
            const options=data ? {headers:{'Content-Type':data.type},body:data} : jsonBody({template:Number(select.value)});
            const next=await api('/care/daily/card'+dateQuery(card.day),{method:'PUT',...options});
            form.elements.image.value='';
            return [next.card,'已设好，明天打卡时会显示。'];
          });
        };
        section.querySelector('[data-clear]').onclick=()=>{
          if(!card)return;
          act(async()=>{
            const next=await api('/care/daily/card'+dateQuery(card.day),{method:'DELETE'});
            form.elements.image.value='';
            return [next.card,'已恢复自动轮换。'];
          });
        };
        panel=section;
      }
      if (!area.contains(panel)) area.prepend(panel);
    }
    window.addEventListener('lynn-care-rendered',mountCare);
    return;
  }

  let panel, notice, data, clockAt=performance.now(), run=0, saving=false, fetching=false, lastError='', artKey='', dueKey='';
  let showArt;
  const connected=()=>window.LynnSync?.connected?.();
  const remoteNow=()=>data ? data.clock.now+Math.max(0,performance.now()-clockAt) : Date.now();
  function hint() {
    if (!connected() || !data) {notice?.remove();notice=null;dueKey='';return;}
    const current=shanghai(remoteNow()), day=current.slice(0,10), time=current.slice(11,16);
    if (day!==data.clock.day) {notice?.remove();notice=null;dueKey='';load();return;}
    const due=data.reminders.filter(item=>item.time<=time && item.dismissedDay!==day);
    const key=JSON.stringify(due.map(x=>[x.id,x.label,x.time]));
    if (key===dueKey) return;
    dueKey=key;notice?.remove();notice=null;
    if (!due.length) return;
    const item=due[0], card=node('aside');
    card.className='daily-reminder-toast';card.setAttribute('aria-label','每日提醒');
    const line=node('p',item.time+' · '+item.label);line.setAttribute('role','status');
    const button=node('button','知道啦');button.type='button';
    button.onclick=async()=>{
      button.disabled=true;
      try {
        await api('/daily/reminders/'+item.id+'/dismiss'+dateQuery(day),{method:'POST'});
        if (data?.clock.day===day) {
          data.reminders=data.reminders.map(reminder=>reminder.id===item.id ? {...reminder,dismissedDay:day} : reminder);
          renderData();
        }
      } catch (error) {line.textContent=error.message || '稍后再试。';}
      finally {button.disabled=false;}
    };
    card.append(node('small',due.length>1 ? '给自己的提醒 · '+due.length+' 条' : '给自己的提醒'),line,button);
    document.body.append(card);notice=card;
  }
  function renderData() {
    hint();
    if (!panel) return;
    const check=panel.querySelector('[data-check]');
    panel.querySelector('.daily-status').textContent=lastError;
    panel.querySelector('.daily-reload').hidden=!lastError;
    check.disabled=saving || !data;
    check.textContent=data?.checkedAt ? '今日已打卡 ✓' : '今日打卡，拆开图片';
    panel.querySelector('.daily-date').textContent=data ? '北京时间 '+data.clock.day : '按北京时间更新';
    const field=panel.querySelector('form fieldset');
    field.disabled=!data || saving;
    const imgArea=panel.querySelector('.daily-today-art');
    imgArea.hidden=!data?.checkedAt;
    const key=data?.checkedAt ? JSON.stringify(data.card) : '';
    if (key!==artKey) {
      artKey=key;
      showArt(data?.checkedAt ? data.card : null,'/daily',imgArea.querySelector('.daily-image-status'));
    }
    const list=panel.querySelector('.daily-reminder-list');
    const listKey=JSON.stringify(data?.reminders.map(x=>[x.id,x.time,x.label]) || []);
    if (list.dataset.key===listKey) return;
    list.dataset.key=listKey;list.replaceChildren();
    if (!data?.reminders.length) {list.append(node('p','还没设置每日提醒。'));return;}
    for (const item of data.reminders) {
      const li=node('li');
      li.append(node('span',item.time+' · '+item.label));
      const edit=node('button','编辑'), remove=node('button','移除');
      edit.type=remove.type='button';
      edit.onclick=()=>{
        const form=panel.querySelector('form');
        form.dataset.edit=String(item.id);form.elements.label.value=item.label;form.elements.time.value=item.time;
        form.querySelector('[data-save-label]').textContent='保存修改';form.querySelector('[data-cancel]').hidden=false;
        form.elements.label.focus();
      };
      remove.onclick=()=>perform(async()=>{
        await api('/daily/reminders/'+item.id,{method:'DELETE'});
        const form=panel.querySelector('form');
        if (Number(form.dataset.edit)===item.id) resetForm(form);
        data.reminders=data.reminders.filter(x=>x.id!==item.id);
      });
      li.append(edit,remove);list.append(li);
    }
  }
  async function load() {
    if (!connected() || fetching || saving) return;
    fetching=true;const ticket=++run;
    try {
      const next=await api('/daily');
      if (ticket!==run || !connected()) return;
      data=next;clockAt=performance.now();lastError='';renderData();
    } catch (error) {
      if(ticket===run && connected()){
        lastError=error.message || '打卡和提醒暂时读不到。';renderData();
      }
    } finally {fetching=false;}
  }
  async function perform(action) {
    if (saving || !connected() || !data) return;
    saving=true;run++;lastError='';renderData();
    try {await action();}
    catch(error){lastError=error.message || '操作没完成，请重试。';}
    finally {saving=false;renderData();}
  }
  function resetForm(form) {
    form.reset();delete form.dataset.edit;
    form.querySelector('[data-save-label]').textContent='添加提醒';
    form.querySelector('[data-cancel]').hidden=true;
  }
  function mount() {
    if (panel) return panel;
    const section=node('section');section.className='daily-card daily-home';
    section.innerHTML='<div class="daily-eyebrow">ONE SMALL MOMENT</div><div class="daily-heading"><div><h2>每日打卡</h2><p class="daily-date"></p></div><button type="button" data-check disabled>今日打卡，拆开图片</button></div><div class="daily-today-art" hidden><img class="daily-art" alt="今日打卡插画" hidden><p class="daily-image-status" role="status"></p></div><details><summary>给自己设个每日提醒</summary><p>按北京时间每天提醒。网页没开，今天再回来时会补提醒。</p><ul class="daily-reminder-list"></ul><form><fieldset disabled><label>要提醒什么 <input name="label" maxlength="100" placeholder="例如：带上水杯" required></label><label>几点提醒 <input name="time" type="time" required></label><div class="daily-actions"><button type="submit" data-save-label>添加提醒</button><button type="button" data-cancel hidden>取消编辑</button></div></fieldset></form></details><p class="daily-status" role="status"></p><button type="button" class="daily-reload" hidden>重新载入</button>';
    showArt=imageViewer(section.querySelector('img'));
    const reload=section.querySelector('.daily-reload');
    reload.onclick=load;
    section.querySelector('[data-check]').onclick=()=>{
      if (data?.checkedAt) {
        showArt(data.card,'/daily',section.querySelector('.daily-image-status'));
        return;
      }
      perform(async()=>{
        const next=await api('/daily/check-in',{method:'POST'});
        data={...data,...next};clockAt=performance.now();
      });
    };
    const form=section.querySelector('form');
    form.querySelector('[data-cancel]').onclick=()=>resetForm(form);
    form.onsubmit=e=>{
      e.preventDefault();
      const label=form.elements.label.value.trim(),time=form.elements.time.value;
      const id=Number(form.dataset.edit)||null;
      if (!label || !time) return;
      perform(async()=>{
        const result=await api('/daily/reminders'+(id ? '/'+id : ''),{method:id ? 'PUT' : 'POST',...jsonBody({label,time})});
        const old=data.reminders.find(x=>x.id===result.id);
        data.reminders=[...data.reminders.filter(x=>x.id!==result.id),{...old,id:result.id,label,time}].sort((a,b)=>a.time.localeCompare(b.time)||a.id-b.id);
        resetForm(form);
      });
    };
    return section;
  }
  function render(route) {
    if (route!=='home' || !connected()) {panel?.remove();return;}
    const target=document.querySelector('#app .hero');
    if (!target) return;
    panel=mount();
    if (!panel.isConnected) target.after(panel);
    renderData();
    if (!data && !lastError) load();
  }
  window.LynnDaily={render};
  window.addEventListener('lynn-sync-status',()=>{
    if (!connected()) {run++;data=null;lastError='';panel?.remove();hint();return;}
    if (!data) load();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){hint();load();}});
  setInterval(()=>{if(!document.hidden){hint();load();}},45_000);
  setInterval(()=>{if(!document.hidden)hint();},10_000);
})();
