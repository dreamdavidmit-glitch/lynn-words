import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';

const db=new DatabaseSync(':memory:');
const migrations=new URL('../cloudflare/migrations/',import.meta.url);
const files=readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort();
for (const file of files.slice(0,-1)) db.exec(readFileSync(new URL(file,migrations),'utf8'));
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKkQAAAAASUVORK5CYII=','base64');
db.prepare('INSERT INTO room_photos (object_key,content_type,caption,created_at,blob_data,wall_slot) VALUES (?,?,?,?,?,?)')
  .run('old','image/png','现有照片','2026-11-01T12:00:00Z',tiny,0);
assert.equal(files.at(-1),'0019_room_photo_owner.sql');
db.exec(readFileSync(new URL(files.at(-1),migrations),'utf8'));
assert.equal(db.prepare('SELECT owner FROM room_photos WHERE id=1').get().owner,'lynn');

const DB={
  prepare(sql){
    function bind(...values){
      const query=db.prepare(sql);
      return {
        first:async()=>query.get(...values) ?? null,
        all:async()=>({results:query.all(...values)}),
        run:async()=>{const res=query.run(...values);return {meta:{last_row_id:res.lastInsertRowid,changes:res.changes}};}
      };
    }
    return Object.assign(bind(),{bind});
  }
};
const SESSION_SECRET='local-ownership-test-secret';
const env={DB,SESSION_SECRET,ALLOWED_ORIGIN:'https://site.example'};
function auth(role) {
  const iat=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({iat,exp:iat+300,nonce:'test-'+role,role,generation:1})).toString('base64url');
  return payload+'.'+createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
}
async function req(role,path,method='GET',body=null,headers={}) {
  const h=new Headers({Origin:env.ALLOWED_ORIGIN,...headers});
  if(role)h.set('Authorization','Bearer '+auth(role));
  if(body && !(body instanceof Uint8Array)){body=JSON.stringify(body);h.set('Content-Type','application/json');}
  return worker.fetch(new Request('https://sync.example'+path,{method,headers:h,body}),env);
}
const url='/room/photos', upload=role=>req(role,url,'POST',tiny,{'Content-Type':'image/png'});
const move=(role,id,wallSlot)=>req(role,url+'/'+id,'PATCH',{wallSlot,frameStyle:'walnut'});
assert.equal((await upload(null)).status,401);
const david=await upload('care'), lynn=await upload('user');
assert.equal(david.status,201);assert.equal(lynn.status,201);
const d=(await david.json()).photo,l=(await lynn.json()).photo;
assert.equal(d.wallSlot,0);assert.equal(l.wallSlot,1);
const other=(await (await upload('care')).json()).photo;
assert.equal(other.wallSlot,1);
assert.equal((await move('care',d.id,1)).status,409);
assert.equal((await move('user',d.id,-1)).status,404);
assert.equal((await req('care',url+'/'+l.id,'DELETE')).status,404);
assert.equal((await req('user',url+'/'+d.id,'PATCH',{takenAt:'2026-11-18'})).status,404);
assert.equal((await req(null,url+'/'+d.id)).status,401);
const list=(await (await req('care',url)).json());
assert.deepEqual(list.photos.map(x=>x.id),[1,l.id]);
assert.deepEqual(list.davidPhotos.map(x=>x.id),[d.id,other.id]);
const shared=await req('user',url+'/'+d.id);
assert.equal(shared.status,200);
assert.deepEqual(Buffer.from(await shared.arrayBuffer()),tiny);
const notes=url+'/'+d.id+'/notes';
assert.equal((await req('user',notes,'POST',{body:'这张很好看',clientId:'photo-note-test-1'})).status,200);
assert.equal((await move('care',d.id,-1)).status,200);
assert.equal((await req('user',url+'/'+d.id)).status,404);
assert.equal((await req('user',notes)).status,404);
assert.equal((await req('care',notes)).status,200);
const visible=(await (await req('user',url)).json());
assert.deepEqual(visible.davidPhotos.map(x=>x.id),[other.id]);
for(let count=2;count<24;count++) assert.equal((await upload('care')).status,201);
assert.equal((await upload('care')).status,409);
assert.equal((await upload('user')).status,201);
assert.equal((await req('care',url+'/'+d.id,'DELETE')).status,200);
assert.equal((await req('user',url+'/1')).status,200);
console.log('PASS: old photos, separate slot/album quotas, owner write isolation, private unmounted photos, picture/notes access');
