const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const base64url = value => Buffer.from(value).toString('base64url');
function signedToken(secret, role, generation = 1) {
  const payload = base64url(JSON.stringify({iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300, nonce: 'snapshot-test', role, generation}));
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
const bytes = value => value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : ArrayBuffer.isView(value) ? Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) : Array.from(value || []);
const payloadFor = revision => Buffer.from(JSON.stringify({app:'wordsequence-public',version:1,state:{decks:[{id:'deck-1',title:'CET-4',words:[{id:'a'},{id:'b'},{id:'c'}],progress:Object.fromEntries(['a','b','c'].slice(0,Math.min(3,revision)).map((id,index)=>[id,{seen:true,attempts:revision+index,longTermSuccesses:index?0:1,firstSeenDate:`2026-11-0${index+1}`,lastLongTermSuccessDate:index?'':`2026-11-0${index+1}`}]))}],activeDeckId:'deck-1',studyDays:['2026-11-01','2026-11-02','2026-11-03'].slice(0,Math.min(3,revision)),dailyLog:{'2026-11-01':{activeMs:600000,attempts:8,correct:6,wrong:2,rescueDone:[]},'2026-11-02':{activeMs:900000,attempts:12,correct:10,wrong:2,rescueDone:['a']},'2026-11-03':{activeMs:300000,attempts:4,correct:4,wrong:0,rescueDone:[]}}}}));

function memoryDB() {
  const data = {state: null, presence: null, careAuth: null, sites: [], messages: [], snapshots: [], nextId: 1, nextSiteId: 1, nextMessageId: 1};
  const statement = (sql, values = []) => ({
    sql: sql.replace(/\s+/g, ' ').trim(), values,
    bind(...next) { return statement(sql, next); },
    async first() {
      if (this.sql.includes('FROM auth_control')) return {generation: 1};
      if (this.sql.includes('FROM auth_attempts')) return null;
      if (this.sql.includes('FROM care_auth')) return data.careAuth ? {...data.careAuth} : null;
      if (this.sql.includes('COUNT(*) AS count FROM monitored_sites')) return {count:data.sites.length};
      if (this.sql.includes('FROM presence')) return data.presence ? {...data.presence} : null;
      if (this.sql.includes('FROM sync_state')) return data.state ? {...data.state} : null;
      if (this.sql.includes('FROM progress_snapshots WHERE id')) return data.snapshots.find(item => item.id === Number(this.values[0])) || null;
      throw new Error(`Unexpected first: ${this.sql}`);
    },
    async all() {
      if (this.sql.includes('FROM messages')) return {results:[...data.messages].sort((a,b)=>b.id-a.id).slice(0,100)};
      if (this.sql.includes('FROM monitored_sites')) return {results:[...data.sites]};
      if (this.sql.includes('FROM progress_snapshots')) return {results: [...data.snapshots].sort((a,b) => b.id-a.id).slice(0,7)};
      throw new Error(`Unexpected all: ${this.sql}`);
    },
    async run() { return execute(this); }
  });
  async function execute(stmt) {
    const {sql, values:v} = stmt;
    if (sql.startsWith('INSERT INTO sync_state')) {
      if (data.state) throw new Error('UNIQUE');
      data.state = {revision:1, updated_at:v[0], device_id:v[1], encoding:v[2], payload:bytes(v[3])}; return {meta:{changes:1}};
    }
    if (sql.startsWith('INSERT INTO progress_snapshots') && sql.includes('VALUES')) {
      data.snapshots.push({id:data.nextId++, revision:1, created_at:v[0], device_id:v[1], encoding:v[2], payload:bytes(v[3]), reason:v[4]}); return {meta:{changes:1}};
    }
    if (sql.startsWith('INSERT INTO progress_snapshots') && sql.includes('WHERE EXISTS')) {
      const currentRevision = Number(v[6]);
      if (!data.state || data.state.revision !== currentRevision) return {meta:{changes:0}};
      data.snapshots.push({id:data.nextId++, revision:Number(v[0]), created_at:v[1], device_id:v[2], encoding:v[3], payload:bytes(v[4]), reason:v[5]}); return {meta:{changes:1}};
    }
    if (sql.startsWith('UPDATE sync_state SET revision')) {
      if (!data.state || data.state.revision !== Number(v[5])) return {meta:{changes:0}};
      data.state = {revision:Number(v[0]), updated_at:v[1], device_id:v[2], encoding:v[3], payload:bytes(v[4])}; return {meta:{changes:1}};
    }
    if (sql.startsWith('INSERT INTO presence')) {
      data.presence = {status:v[0], studying:Number(v[1]), active:Number(v[2]), last_seen_at:v[3]}; return {meta:{changes:1}};
    }
    if (sql.startsWith('INSERT INTO care_auth')) {
      data.careAuth = {salt:v[0], password_hash:v[1], iterations:Number(v[2]), updated_at:v[3]}; return {meta:{changes:1}};
    }
    if (sql.startsWith('INSERT INTO monitored_sites')) {
      if (data.sites.some(site => site.url === v[1])) throw new Error('UNIQUE');
      const id = data.nextSiteId++; data.sites.push({id,name:v[0],url:v[1],created_at:v[2]}); return {meta:{changes:1,last_row_id:id}};
    }
    if (sql.startsWith('DELETE FROM monitored_sites')) {
      const before=data.sites.length; data.sites=data.sites.filter(site=>site.id!==Number(v[0])); return {meta:{changes:before-data.sites.length}};
    }
    if (sql.startsWith('INSERT INTO messages')) {
      const id=data.nextMessageId++; data.messages.push({id,sender:v[0],body:v[1],created_at:v[2],read_at:null}); return {meta:{changes:1,last_row_id:id}};
    }
    if (sql.startsWith('UPDATE messages SET read_at')) {
      let changes=0; for(const message of data.messages){if(message.sender===v[1]&&!message.read_at){message.read_at=v[0];changes++;}} return {meta:{changes}};
    }
    if (sql.startsWith('DELETE FROM messages WHERE id NOT IN')) {
      data.messages=data.messages.sort((a,b)=>b.id-a.id).slice(0,300); return {meta:{changes:0}};
    }
    if (sql.startsWith('DELETE FROM auth_attempts')) return {meta:{changes:1}};
    if (sql.startsWith('DELETE FROM progress_snapshots')) { data.snapshots.sort((a,b)=>b.id-a.id); data.snapshots = data.snapshots.slice(0,7); return {meta:{changes:1}}; }
    throw new Error(`Unexpected batch statement: ${sql}`);
  }
  return {data, prepare: statement, async batch(statements) { const copy = structuredClone(data); try { return await Promise.all(statements.map(execute)); } catch (error) { Object.assign(data,copy); throw error; } }};
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'src', 'worker.js'), 'utf8');
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
  const secret = 'snapshot-test-secret-with-enough-entropy', db = memoryDB();
  const env = {SESSION_SECRET:secret, ALLOWED_ORIGIN:'https://example.test', DB:db};
  const user = signedToken(secret, 'user'), admin = signedToken(secret, 'admin');
  for (let revision = 0; revision < 8; revision++) {
    const response = await worker.fetch(new Request('https://sync.test/state', {method:'PUT', headers:{Authorization:`Bearer ${user}`, Origin:'https://example.test', 'X-Base-Revision':String(revision), 'X-Device-Id':'test-device', 'X-Payload-Encoding':'json'}, body:payloadFor(revision+1)}), env);
    assert.equal(response.status, 200, await response.text());
  }
  assert.equal(db.data.snapshots.length, 7);
  assert.equal(db.data.snapshots[0].revision, 8);
  const list = await worker.fetch(new Request('https://sync.test/admin/snapshots', {headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test'}}), env);
  const history = await list.json();
  assert.equal(history.snapshots.length, 7);
  const old = history.snapshots.at(-1);
  const previewResponse = await worker.fetch(new Request(`https://sync.test/admin/snapshots/${old.id}/preview`, {headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test'}}), env);
  assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
  const preview = await previewResponse.json();
  assert.equal(preview.revision, 2);
  assert.equal(preview.seen, 2);
  assert.equal(preview.streak, 2);
  assert.ok(preview.changes.attempts < 0);
  const unauthorizedOverview = await worker.fetch(new Request('https://sync.test/admin/overview', {headers:{Origin:'https://example.test'}}), env);
  assert.equal(unauthorizedOverview.status, 401);
  const unauthorizedPresence = await worker.fetch(new Request('https://sync.test/presence', {method:'POST', headers:{Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({status:'online',active:true,studying:true})}), env);
  assert.equal(unauthorizedPresence.status, 401);
  const presenceResponse = await worker.fetch(new Request('https://sync.test/presence', {method:'POST', headers:{Authorization:`Bearer ${user}`,Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({status:'online',active:true,studying:true})}), env);
  assert.equal(presenceResponse.status, 200, await presenceResponse.clone().text());
  const overviewResponse = await worker.fetch(new Request('https://sync.test/admin/overview', {headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test'}}), env);
  assert.equal(overviewResponse.status, 200, await overviewResponse.clone().text());
  const overview = await overviewResponse.json();
  assert.equal(overview.revision, 8);
  assert.equal(overview.latestStudyDate, '2026-11-03');
  assert.equal(overview.totals.seen, 3);
  assert.equal(overview.days.find(item => item.date === '2026-11-02').rescueDone, 1);
  assert.equal(overview.decks[0].active, true);
  assert.equal(overview.presence.state, 'online');
  assert.equal(overview.presence.studying, true);
  db.data.presence.last_seen_at = new Date(Date.now() - 181_000).toISOString();
  const staleOverviewResponse = await worker.fetch(new Request('https://sync.test/admin/overview', {headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test'}}), env);
  const staleOverview = await staleOverviewResponse.json();
  assert.equal(staleOverview.presence.state, 'offline');
  const carePassword = 'private-care-test';
  const setPassword = await worker.fetch(new Request('https://sync.test/care/password', {method:'PUT', headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({password:carePassword})}), env);
  assert.equal(setPassword.status, 200, await setPassword.clone().text());
  const careLogin = await worker.fetch(new Request('https://sync.test/care/session', {method:'POST', headers:{Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({password:carePassword})}), env);
  assert.equal(careLogin.status, 200, await careLogin.clone().text());
  const careToken = (await careLogin.json()).token;
  const addSite = await worker.fetch(new Request('https://sync.test/care/sites', {method:'POST', headers:{Authorization:`Bearer ${careToken}`,Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({name:'Test Site',url:'https://status.example.test/'})}), env);
  assert.equal(addSite.status, 201, await addSite.clone().text());
  const addedSite = await addSite.json();
  const realFetch = global.fetch;
  global.fetch = async () => new Response('ok', {status:200});
  const sitesStatus = await worker.fetch(new Request('https://sync.test/care/sites/status', {headers:{Authorization:`Bearer ${careToken}`,Origin:'https://example.test'}}), env);
  global.fetch = realFetch;
  assert.equal(sitesStatus.status, 200, await sitesStatus.clone().text());
  const statusBody = await sitesStatus.json();
  assert.equal(statusBody.sites[0].ok, true);
  const removeSite = await worker.fetch(new Request(`https://sync.test/care/sites/${addedSite.id}`, {method:'DELETE', headers:{Authorization:`Bearer ${careToken}`,Origin:'https://example.test'}}), env);
  assert.equal(removeSite.status, 200, await removeSite.text());
  assert.equal(db.data.sites.length, 0);
  const ownerMessage = await worker.fetch(new Request('https://sync.test/care/messages', {method:'POST', headers:{Authorization:`Bearer ${careToken}`,Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({body:'今天也要好好休息。'})}), env);
  assert.equal(ownerMessage.status, 201, await ownerMessage.clone().text());
  const lynnInbox = await worker.fetch(new Request('https://sync.test/messages?read=1', {headers:{Authorization:`Bearer ${user}`,Origin:'https://example.test'}}), env);
  const lynnInboxBody = await lynnInbox.json();
  assert.equal(lynnInboxBody.messages[0].body, '今天也要好好休息。');
  assert.ok(lynnInboxBody.messages[0].readAt);
  const lynnReply = await worker.fetch(new Request('https://sync.test/messages', {method:'POST', headers:{Authorization:`Bearer ${user}`,Origin:'https://example.test','Content-Type':'application/json'}, body:JSON.stringify({body:'好，我背完就休息。'})}), env);
  assert.equal(lynnReply.status, 201, await lynnReply.clone().text());
  const ownerInbox = await worker.fetch(new Request('https://sync.test/care/messages?read=1', {headers:{Authorization:`Bearer ${careToken}`,Origin:'https://example.test'}}), env);
  const ownerInboxBody = await ownerInbox.json();
  assert.equal(ownerInboxBody.messages.at(-1).body, '好，我背完就休息。');
  assert.ok(ownerInboxBody.messages.at(-1).readAt);
  const restore = await worker.fetch(new Request('https://sync.test/admin/snapshots/restore', {method:'POST', headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test', 'Content-Type':'application/json'}, body:JSON.stringify({id:old.id})}), env);
  assert.equal(restore.status, 200, await restore.text());
  assert.equal(db.data.state.revision, 9);
  assert.deepEqual(db.data.state.payload, bytes(payloadFor(2)));
  assert.equal(db.data.snapshots.length, 7);
  console.log('Worker keeps snapshots and protects the private learning overview OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
