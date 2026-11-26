import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';

const db=new DatabaseSync(':memory:');
const migrations=new URL('../cloudflare/migrations/',import.meta.url);
const files=readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort();
const migration=files.indexOf('0020_daily_corner.sql');
assert.ok(migration>0);
for (const file of files.slice(0,migration)) db.exec(readFileSync(new URL(file,migrations),'utf8'));
const bytes=new Uint8Array(readFileSync(new URL('../assets/checkin/checkin-01.webp',import.meta.url)));
assert.ok(bytes.length>1000);
db.prepare('INSERT INTO room_photos (object_key, content_type, caption, created_at, blob_data, wall_slot, owner) VALUES (?,?,?,?,?,?,?)')
  .run('old','image/webp','迁移前','2026-11-01T00:00:00Z',bytes,0,'david');
for (const file of files.slice(migration)) db.exec(readFileSync(new URL(file,migrations),'utf8'));
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages').get().count,0);
const DB={prepare(sql){
  function bind(...values){
    const query=db.prepare(sql);
    return {
      first:async()=>query.get(...values) ?? null,
      all:async()=>({results:query.all(...values)}),
      run:async()=>{const res=query.run(...values);return {meta:{last_row_id:res.lastInsertRowid,changes:res.changes}};}
    };
  }
  return Object.assign(bind(),{bind});
}};
const SESSION_SECRET='local-daily-test-secret';
const env={DB,SESSION_SECRET,ALLOWED_ORIGIN:'https://pages.example'};
const realNow=Date.now;
let time='2026-11-25T15:59:57Z';
Date.now=()=>Date.parse(time);
function auth(role) {
  const iat=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({iat,exp:iat+180,nonce:'test-'+role,role,generation:1})).toString('base64url');
  return payload+'.'+createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
}
async function request(role,path,method='GET',body=null,headers={}) {
  const h=new Headers({Origin:env.ALLOWED_ORIGIN,...headers});
  if(role)h.set('Authorization','Bearer '+auth(role));
  if(body && !(body instanceof Uint8Array)){body=JSON.stringify(body);h.set('Content-Type','application/json');}
  return worker.fetch(new Request('https://sync.example'+path,{method,headers:h,body}),env);
}
async function json(role,path,method='GET',body=null,status=200,headers={}) {
  const res=await request(role,path,method,body,headers);
  assert.equal(res.status,status, await res.clone().text());
  return res.json();
}
try {
  const tomorrow='/care/daily/card?date=2026-11-26';
  assert.equal((await request(null,'/daily')).status,401);
  assert.equal((await request('user',tomorrow,'PUT',{template:1})).status,401);
  assert.equal((await request('care','/daily/check-in','POST')).status,401);
  assert.equal((await json('care','/care/daily/card')).card.day,'2026-11-26');
  assert.equal((await json('user','/daily')).clock.day,'2026-11-25');
  assert.equal((await request('care','/care/daily/card?date=2026-11-25','PUT',{template:4})).status,409);
  assert.equal((await request('care',tomorrow,'PUT',{template:13})).status,400);
  assert.equal((await json('care',tomorrow,'PUT',{template:4})).card.template,4);
  assert.equal((await json('care',tomorrow,'DELETE')).card.configured,false);
  assert.equal((await json('care',tomorrow,'PUT',bytes,200,{'Content-Type':'image/webp'})).card.custom,true);
  assert.equal((await request('user','/daily/image?date=2026-11-26')).status,409);
  const reminder=(await json('user','/daily/reminders','POST',{label:'带水杯',time:'08:45'},201)).id;
  assert.equal((await request('care','/daily/reminders','POST',{label:'不应写入',time:'08:45'})).status,401);
  assert.equal((await request('user','/daily/reminders/'+reminder,'PUT',{label:'带水杯',time:'25:00'})).status,400);
  assert.equal((await json('user','/daily/check-in','POST')).card.day,'2026-11-25');
  time='2026-11-25T16:00:00Z';
  const today='/daily/image?date=2026-11-26';
  const atMidnight=await json('user','/daily');
  assert.equal(atMidnight.checkedAt,null);
  assert.equal(atMidnight.clock.time,'00:00');
  assert.equal(atMidnight.card.day,'2026-11-26');
  assert.equal(atMidnight.card.custom,true);
  const picture=await request('user',today);
  assert.deepEqual(new Uint8Array(await picture.arrayBuffer()),bytes);
  assert.equal((await request('care',tomorrow,'PUT',{template:2})).status,409);
  const dismiss='/daily/reminders/'+reminder+'/dismiss?date=';
  assert.equal((await request('user',dismiss+'2026-11-26','POST')).status,404);
  const first=await json('user','/daily/check-in','POST');
  time='2026-11-26T01:00:00Z';
  const second=await json('user','/daily/check-in','POST');
  assert.equal(first.checkedAt,second.checkedAt);
  assert.equal((await json('user',dismiss+'2026-11-26','POST')).ok,true);
  assert.equal((await json('user','/daily')).reminders[0].dismissedDay,'2026-11-26');
  time='2026-11-27T01:00:00Z';
  assert.equal((await json('user','/daily')).clock.day,'2026-11-27');
  assert.equal((await json('user','/daily')).reminders[0].dismissedDay,'2026-11-26');
  assert.equal((await json('user','/daily/reminders/'+reminder,'DELETE')).ok,true);
  const rotated=new Set();
  for (let i=0;i<12;i++) {
    time=new Date(Date.parse('2026-12-01T03:00:00Z')+i*86400000).toISOString();
    const result=await json('user','/daily');assert.equal(result.card.configured,false);
    rotated.add(result.card.template);
  }
  assert.equal(rotated.size,12);

  const photo=async(role)=>(await json(role,'/room/photos','POST',bytes,201,{'Content-Type':'image/webp'})).photo;
  const d=await photo('care'), l=await photo('user');
  const main=await json('user','/messages?read=1');
  assert.equal(main.unread,1);
  assert.equal(main.messages.find(row=>row.sender==='owner').photoId,d.id);
  const care=await json('care','/care/messages?read=1');
  assert.equal(care.unread,1);
  assert.equal(care.messages.find(row=>row.sender==='lynn').photoId,l.id);
  await json('care','/messages/photo/'+l.id+'/read','POST');
  assert.equal((await json('care','/care/messages')).unread,0);
  assert.equal((await json('user','/messages')).unread,1);
  const full=Array.from({length:11});
  for (const _ of full) await photo('care');
  const albumOnly=await photo('care');
  assert.equal(albumOnly.wallSlot,-1);
  const counts=id=>db.prepare('SELECT COUNT(*) AS n FROM messages WHERE photo_id=?').get(id).n;
  assert.equal(counts(albumOnly.id),0);
  const move=(id,wallSlot)=>json('care','/room/photos/'+id,'PATCH',{wallSlot,frameStyle:'walnut'});
  await move(d.id,-1);
  assert.equal((await request('user','/room/photos/'+d.id)).status,404);
  await move(albumOnly.id,d.wallSlot);
  await move(albumOnly.id,-1);
  await move(albumOnly.id,d.wallSlot);
  assert.equal(counts(albumOnly.id),1);
  assert.equal((await request('user','/room/photos/'+albumOnly.id)).status,200);
  await json('care','/room/photos/'+albumOnly.id,'DELETE');
  assert.equal(counts(albumOnly.id),0);
  console.log('PASS: Beijing midnight, tomorrow-only custom cards, 12 templates, idempotent check-in, private reminders, two-way photo notice and attachment');
} finally {
  Date.now=realNow;
  db.close();
}
