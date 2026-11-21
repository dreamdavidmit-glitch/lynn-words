const expiry = 8500;
const roomNames = ['lynn','david','entry-lynn','entry-david'];

export function createPreviewRoomExchange(role) {
  const peerRole=role==='lynn' ? 'david' : 'lynn';
  const key=name=>'lynn:room-preview:presence:'+name;
  function read(name) {
    try { return JSON.parse(localStorage.getItem(key(name))); }
    catch (_) { return null; }
  }
  function exchange(body,leave) {
    if (leave) {
      if (read(role)?.visit===body.visit) localStorage.removeItem(key(role));
      return {ok:true};
    }
    const other=read(peerRole);
    const active=other && Date.now()-other.at<expiry;
    const privateKey='corner-note:'+role;
    if(body.cornerWrite?.kind==='note')localStorage.setItem(key(privateKey),JSON.stringify(body.cornerWrite.text));
    if(body.cornerWrite?.kind==='exhibit')localStorage.setItem(key('corner-exhibit:'+role),JSON.stringify(
      body.cornerWrite.photo===null?null:{author:role,photo:body.cornerWrite.photo,text:body.cornerWrite.text}));
    const corner=body.cornerRead||body.cornerWrite?{note:read(privateKey)||'',
      exhibits:['lynn','david'].map(r=>read('corner-exhibit:'+r)).filter(Boolean)}:undefined;
    const seat=body.seat && (!active || other.seat!==body.seat) ? body.seat : null;
    localStorage.setItem(key(role),JSON.stringify({visit:body.visit,pose:body.pose,gesture:body.gesture,ink:body.ink,cues:body.cues,seat,at:Date.now()}));
    if (body.door) localStorage.setItem(key('door:'+body.door.room),JSON.stringify(body.door.open));
    let marks=read('glass-v1') || [];
    if(body.mark && !marks.some(m=>m.id===body.mark.id && m.room===body.mark.room)) {
      const mark={...body.mark,seq:(marks.at(-1)?.seq || 0)+1};
      const old=marks.filter(m=>m.room===mark.room);
      if(old.length>=48) marks=marks.filter(m=>m!==old[0]);
      marks.push(mark);
      localStorage.setItem(key('glass-v1'),JSON.stringify(marks));
    }
    let board=read('hall-board-v1') || [];
    const draft=body.boardWrite;
    if(draft && !board.some(m=>m.id===draft.id && m.author===role) &&
      (draft.kind!=='erase' || board.some(m=>m.id===draft.data&&m.author===role&&m.kind!=='erase'))){
      board=[...board,{...draft,author:role,seq:(board.at(-1)?.seq||0)+1}].slice(-180);
      localStorage.setItem(key('hall-board-v1'),JSON.stringify(board));
    }
    return {corner,board:board.filter(m=>m.seq>(body.boardSince || 0)),marks:marks.filter(m=>m.seq>(body.glassSince || 0)),seat,peer:active ? {role:peerRole,pose:other.pose,seat:other.seat,gesture:other.gesture,ink:other.ink,cues:other.cues} : null,
      doors:Object.fromEntries(roomNames.map(name=>[name,Boolean(read('door:'+name))]))};
  }
  return async (body,{leave=false}={})=>{
    if (navigator.locks) return navigator.locks.request('lynn:room-preview:live',()=>exchange(body,leave));
    return exchange(body,leave);
  };
}

export function mountRoomPresence(exchange,{onPeer,onDoor,onStatus,onSeat,onMarks,onInkQueue,onBoard,onBoardQueue,onCorner,outboxKey}) {
  const visit=globalThis.crypto?.randomUUID?.() || 'visit-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const pending=new Map(),cornerPending=new Map();
  let nextCorner=0,cues=null;
  const cornerKey=outboxKey && outboxKey+':corners';
  if(cornerKey)try{for(const v of JSON.parse(sessionStorage.getItem(cornerKey))||[])cornerPending.set(v.kind,v);}catch{}
  const saveCorners=()=>{if(cornerKey)try{
    if(cornerPending.size)sessionStorage.setItem(cornerKey,JSON.stringify([...cornerPending.values()]));
    else sessionStorage.removeItem(cornerKey);
  }catch{}};

  let pose=null, timer=0, sequence=0, stopped=false, busy=false, peer=null, lastReply=0;
  let seat=null,gesture=null,gestureUntil=0,ink=null,urgent=false;
  let failures=0, glassSince=0; const marks=[];
  if(outboxKey)try{const draft=JSON.parse(sessionStorage.getItem(outboxKey));if(Array.isArray(draft))marks.push(...draft);}catch{}
  const saveOutbox=()=>{if(outboxKey)try{if(marks.length)sessionStorage.setItem(outboxKey,JSON.stringify(marks));else sessionStorage.removeItem(outboxKey);}catch{}};
  const reportQueue=()=>onInkQueue?.(marks.length,failures>0);
  if(marks.length)onMarks?.(marks);reportQueue();
  const boardKey=outboxKey && outboxKey+':hall-board';
  const boardWrites=[];
  let boardSince=0,boardSupported=null;
  if(boardKey)try{const draft=JSON.parse(sessionStorage.getItem(boardKey));if(Array.isArray(draft))boardWrites.push(...draft);}catch{}
  const saveBoard=()=>{if(boardKey)try{
    if(boardWrites.length)sessionStorage.setItem(boardKey,JSON.stringify(boardWrites));
    else sessionStorage.removeItem(boardKey);
  }catch{}};
  const reportBoard=()=>onBoardQueue?.(boardWrites.length,failures>0||boardSupported===false,boardSupported===true);
  if(boardWrites.length)onBoard?.(boardWrites);
  reportBoard();
  let announced='', left=false;
  function status(label) {
    if (announced===label) return;
    announced=label;
    onStatus(label);
  }
  function leave() {
    if (left) return;
    left=true;
    if (sequence) exchange({visit},{leave:true}).catch(()=>{});
  }
  async function tick() {
    if (stopped || busy) return;
    if (!pose || document.hidden) {
      timer=setTimeout(tick,1000);
      return;
    }
    busy=true;
    urgent=false;
    const door=pending.values().next().value;
    const cornerWrite=cornerPending.values().next().value;
    const cornerRead=!!onCorner && (Date.now()>=nextCorner || !!cornerWrite);
    const requestedSeat=seat, sentMark=marks[0],sentBoard=boardWrites[0];
    try {
      const result=await exchange({visit,sequence:++sequence,pose,door,seat,glassSince,mark:sentMark,ink,boardSince:onBoard ? boardSince : undefined,boardWrite:sentBoard,cornerRead,cornerWrite,cues:cues ? Object.fromEntries(Object.entries(cues).filter(([,c])=>Date.now()-c.start<600000)):null,gesture:Date.now()<gestureUntil ? gesture : null});
      if (stopped) return;
      if (door && pending.get(door.room)===door) pending.delete(door.room);
      if (Array.isArray(result.marks)) {
        if (result.marks.length) {onMarks?.(result.marks);glassSince=Math.max(glassSince,...result.marks.map(m=>m.seq));}
        if (sentMark && marks[0]===sentMark) {marks.shift();saveOutbox();}
      }
      if(cornerRead){
        nextCorner=Date.now()+5000;
        if(result.corner){
          if(cornerWrite && cornerPending.get(cornerWrite.kind)===cornerWrite){cornerPending.delete(cornerWrite.kind);saveCorners();}
          onCorner?.(result.corner,cornerPending);
        }
      }
      if(onBoard){
        boardSupported=Array.isArray(result.board);
        if(boardSupported){
          if(result.board.length){onBoard(result.board);boardSince=Math.max(boardSince,...result.board.map(m=>m.seq));}
          if(sentBoard&&boardWrites[0]===sentBoard){boardWrites.shift();saveBoard();}
        }
      }
      failures=0;reportBoard();reportQueue();lastReply=Date.now();
      peer=result.peer;
      for (const room of roomNames) {
        if (!pending.has(room)) onDoor(room,Boolean(result.doors?.[room]));
      }
      onPeer(peer);
      if (seat===requestedSeat) onSeat?.(result.seat);
      status(peer ? (peer.role==='david' ? 'David 同场' : 'Lynn 同场') : '等待对方进入');
    } catch (_) {
      failures=Math.min(5,failures+1);reportBoard();reportQueue();status('双人房间暂时连不上');
      if (seat===requestedSeat) onSeat?.(undefined);
      if (Date.now()-lastReply>expiry) { peer=null; onPeer(null); }
    } finally {
      busy=false;
      if (stopped) leave();
      else timer=setTimeout(tick,failures ? Math.min(12000,500*2**failures) : urgent ? 25 : pending.size || marks.length || (boardWrites.length&&boardSupported!==false) ? 250 : peer?.ink || ink ? 280 : peer ? 650 : 1600);
    }
  }
  function refresh() {
    urgent=true;
    if (!stopped && !busy && !failures) { clearTimeout(timer);tick(); }
  }
  function destroy() {
    if (stopped) return;
    stopped=true;
    clearTimeout(timer);
    window.removeEventListener('pagehide',onPageHide);window.removeEventListener('online',reconnect);
    if (!busy) leave();
  }
  function onPageHide(event) {
    if (!event.persisted) {
      destroy();
      // Delivery while unloading is best effort. The room also expires idle poses.
      leave();
    }
  }
  status('正在连接双人房间');
  timer=setTimeout(tick,0);
  const reconnect=()=>{failures=0;refresh();};
  window.addEventListener('pagehide',onPageHide);window.addEventListener('online',reconnect);
  return {
    sample(value){pose=value;},
    setDoor(room,open){
      pending.set(room,{room,open});
      refresh();
    },
    previewInk(value){ink=value;},
    setCues(value){cues=value;refresh();},
    setCorner(value){cornerPending.set(value.kind,value);saveCorners();refresh();},
    addBoard(value){boardWrites.push(value);saveBoard();reportBoard();refresh();},
    addMark(value){marks.push(value);saveOutbox();reportQueue();refresh();},
    setSeat(value){seat=value;refresh();},
    sendGesture(value){gesture=value;gestureUntil=Date.now()+4200;refresh();},
    destroy
  };
}
