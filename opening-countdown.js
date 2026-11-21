(() => {
  'use strict';
  // Beijing, 24 -> 25 November. This parses identically in every browser timezone.
  const opensAt=Date.parse('2026-11-25T00:00:00+08:00');
  const endpoint='https://lynn-words-sync.lynn-words-work.workers.dev/release/opening';
  const local=location.protocol==='file:'||['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  let sample=null, opened=false, tickTimer=0, syncTimer=0, busy=false;
  const now=()=>sample ? sample.now+Math.max(0,performance.now()-sample.at) : Date.now();
  const isOpen=()=> (local||!!sample) && now()>=opensAt;
  window.LynnOpening=Object.freeze({opensAt,isOpen});
  const banner=document.querySelector('#opening-countdown');
  const label=banner?.querySelector('[data-opening-state]'),clock=banner?.querySelector('[data-countdown]');

  function tick(){
    clearTimeout(tickTimer);
    const remaining=Math.max(0,Math.ceil((opensAt-now())/1000));
    const open=isOpen();
    if(clock){
      const days=Math.floor(remaining/86400);
      clock.textContent=(days?days+' 天 ':'')+[Math.floor(remaining/3600)%24,Math.floor(remaining/60)%60,remaining%60].map(n=>String(n).padStart(2,'0')).join(':');
      clock.hidden=remaining===0;
      const message=open?'已经开放':remaining===0?'正在确认开放时间…':'有一点新东西，先保密';
      if(label.textContent!==message)label.textContent=message;
    }
    if(open&&!opened){opened=true;window.dispatchEvent(new Event('lynn-opening'));}
    if(!open)tickTimer=setTimeout(tick,remaining>0?Math.max(20,(opensAt-now())%1000||1000):1000);
  }
  async function sync(){
    if(local||busy||opened)return;
    busy=true;clearTimeout(syncTimer);
    let healthy=false;
    try{
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(5500)});
      if(!response.ok)throw Error('clock request failed');
      const data=await response.json();
      if(!Number.isSafeInteger(data.now)||data.opensAt!==opensAt)throw Error('release clock mismatch');
      sample={now:data.now,at:performance.now()};healthy=true;
    }catch{}finally{
      busy=false;tick();
      if(!opened)syncTimer=setTimeout(sync,healthy?60000:10000);
    }
  }
  function refresh(){if(!document.hidden){tick();sync();}}
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pageshow',refresh);
  window.addEventListener('online',refresh);
  tick();sync();
})();
