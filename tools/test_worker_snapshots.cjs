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
const payloadFor = revision => Buffer.from(JSON.stringify({app:'wordsequence-public',version:1,state:{decks:[{words:[{id:'a'},{id:'b'},{id:'c'}],progress:Object.fromEntries(['a','b','c'].slice(0,Math.min(3,revision)).map((id,index)=>[id,{seen:true,attempts:revision+index,longTermSuccesses:index?0:1}]))}],studyDays:['2026-11-01','2026-11-02','2026-11-03'].slice(0,Math.min(3,revision))}}));

function memoryDB() {
  const data = {state: null, snapshots: [], nextId: 1};
  const statement = (sql, values = []) => ({
    sql: sql.replace(/\s+/g, ' ').trim(), values,
    bind(...next) { return statement(sql, next); },
    async first() {
      if (this.sql.includes('FROM auth_control')) return {generation: 1};
      if (this.sql.includes('FROM sync_state')) return data.state ? {...data.state} : null;
      if (this.sql.includes('FROM progress_snapshots WHERE id')) return data.snapshots.find(item => item.id === Number(this.values[0])) || null;
      throw new Error(`Unexpected first: ${this.sql}`);
    },
    async all() {
      if (this.sql.includes('FROM progress_snapshots')) return {results: [...data.snapshots].sort((a,b) => b.id-a.id).slice(0,7)};
      throw new Error(`Unexpected all: ${this.sql}`);
    }
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
    if (sql.startsWith('DELETE FROM progress_snapshots')) { data.snapshots.sort((a,b)=>b.id-a.id); data.snapshots = data.snapshots.slice(0,7); return {meta:{changes:1}}; }
    throw new Error(`Unexpected batch statement: ${sql}`);
  }
  return {data, prepare: statement, async batch(statements) { const copy = structuredClone(data); try { return await Promise.all(statements.map(execute)); } catch (error) { data.state=copy.state;data.snapshots=copy.snapshots;data.nextId=copy.nextId;throw error; } }};
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
  const restore = await worker.fetch(new Request('https://sync.test/admin/snapshots/restore', {method:'POST', headers:{Authorization:`Bearer ${admin}`, Origin:'https://example.test', 'Content-Type':'application/json'}, body:JSON.stringify({id:old.id})}), env);
  assert.equal(restore.status, 200, await restore.text());
  assert.equal(db.data.state.revision, 9);
  assert.deepEqual(db.data.state.payload, bytes(payloadFor(2)));
  assert.equal(db.data.snapshots.length, 7);
  console.log('Worker keeps, previews, compares, and restores 7 snapshots OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
