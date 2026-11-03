const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_PAYLOAD = 1_900_000;
const PASSWORD_ITERATIONS = 180_000;
const TOKEN_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index % Math.max(1, a.length)] || 0) ^ (b[index % Math.max(1, b.length)] || 0);
  return difference === 0;
}

async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, key, 256);
  return new Uint8Array(bits);
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function issueToken(secret) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)))
  })));
  return `${payload}.${bytesToBase64Url(await hmac(secret, payload))}`;
}

async function verifyToken(secret, token) {
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return false;
    const expected = bytesToBase64Url(await hmac(secret, payload));
    if (!constantTimeEqual(signature, expected)) return false;
    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    return Number.isSafeInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch (_) { return false; }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (origin === env.ALLOWED_ORIGIN || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) return origin;
  return env.ALLOWED_ORIGIN;
}

function headers(request, env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Base-Revision, X-Device-Id, X-Payload-Encoding',
    'Access-Control-Expose-Headers': 'X-Revision, X-Updated-At, X-Device-Id, X-Payload-Encoding',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: headers(request, env, {'Content-Type': 'application/json; charset=utf-8'})});
}

async function bodyJSON(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 4096) throw new Error('请求内容过大。');
  return request.json();
}

async function authorized(request, env) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i);
  return !!match && verifyToken(env.SESSION_SECRET, match[1]);
}

async function claim(request, env) {
  const body = await bodyJSON(request);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!constantTimeEqual(body.claimToken || '', env.CLAIM_TOKEN || '')) return json(request, env, {error: '初始化链接无效。'}, 403);
  if (password.length < 8 || password.length > 128) return json(request, env, {error: '同步密码需要 8 到 128 个字符。'}, 400);
  const existing = await env.DB.prepare('SELECT id FROM auth WHERE id = 1').first();
  if (existing) return json(request, env, {error: '云端同步已经初始化，请使用同步密码登录。'}, 409);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  await env.DB.prepare('INSERT INTO auth (id, salt, password_hash, iterations, created_at) VALUES (1, ?, ?, ?, ?)')
    .bind(bytesToBase64Url(salt), bytesToBase64Url(hash), PASSWORD_ITERATIONS, new Date().toISOString()).run();
  return json(request, env, {token: await issueToken(env.SESSION_SECRET), expiresIn: TOKEN_LIFETIME_SECONDS});
}

async function login(request, env) {
  const body = await bodyJSON(request);
  const password = typeof body.password === 'string' ? body.password : '';
  const row = await env.DB.prepare('SELECT salt, password_hash, iterations FROM auth WHERE id = 1').first();
  if (!row) return json(request, env, {error: '云端同步还没有初始化。'}, 409);
  if (!password || password.length > 128) return json(request, env, {error: '同步密码不正确。'}, 401);
  const candidate = bytesToBase64Url(await passwordHash(password, base64UrlToBytes(row.salt), row.iterations));
  if (!constantTimeEqual(candidate, row.password_hash)) return json(request, env, {error: '同步密码不正确。'}, 401);
  return json(request, env, {token: await issueToken(env.SESSION_SECRET), expiresIn: TOKEN_LIFETIME_SECONDS});
}

async function readState(request, env) {
  if (!await authorized(request, env)) return json(request, env, {error: '请重新输入同步密码。'}, 401);
  const row = await env.DB.prepare('SELECT revision, updated_at, device_id, encoding, payload FROM sync_state WHERE id = 1').first();
  if (!row) return json(request, env, {error: '云端还没有学习记录。'}, 404);
  return new Response(row.payload, {status: 200, headers: headers(request, env, {
    'Content-Type': 'application/octet-stream',
    'X-Revision': String(row.revision),
    'X-Updated-At': row.updated_at,
    'X-Device-Id': row.device_id,
    'X-Payload-Encoding': row.encoding
  })});
}

async function writeState(request, env) {
  if (!await authorized(request, env)) return json(request, env, {error: '请重新输入同步密码。'}, 401);
  const baseRevision = Number(request.headers.get('X-Base-Revision'));
  const deviceId = (request.headers.get('X-Device-Id') || '').slice(0, 100);
  const encoding = request.headers.get('X-Payload-Encoding') === 'gzip' ? 'gzip' : 'json';
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || !deviceId) return json(request, env, {error: '同步版本信息无效。'}, 400);
  const payload = await request.arrayBuffer();
  if (!payload.byteLength || payload.byteLength > MAX_PAYLOAD) return json(request, env, {error: '学习记录过大，暂时无法同步。'}, 413);
  const current = await env.DB.prepare('SELECT revision, updated_at, device_id FROM sync_state WHERE id = 1').first();
  const updatedAt = new Date().toISOString();
  if (!current) {
    if (baseRevision !== 0) return json(request, env, {error: '云端版本已经变化。', revision: 0}, 409);
    await env.DB.prepare('INSERT INTO sync_state (id, revision, updated_at, device_id, encoding, payload) VALUES (1, 1, ?, ?, ?, ?)')
      .bind(updatedAt, deviceId, encoding, payload).run();
    return json(request, env, {revision: 1, updatedAt, deviceId});
  }
  if (current.revision !== baseRevision) return json(request, env, {error: '另一台设备已经更新了进度。', revision: current.revision, updatedAt: current.updated_at, deviceId: current.device_id}, 409);
  const nextRevision = current.revision + 1;
  const result = await env.DB.prepare('UPDATE sync_state SET revision = ?, updated_at = ?, device_id = ?, encoding = ?, payload = ? WHERE id = 1 AND revision = ?')
    .bind(nextRevision, updatedAt, deviceId, encoding, payload, current.revision).run();
  if (!result.meta?.changes) return json(request, env, {error: '另一台设备刚刚更新了进度。'}, 409);
  return json(request, env, {revision: nextRevision, updatedAt, deviceId});
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: headers(request, env)});
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health' && request.method === 'GET') return json(request, env, {ok: true, service: 'lynn-words-sync'});
      if (url.pathname === '/claim' && request.method === 'POST') return await claim(request, env);
      if (url.pathname === '/session' && request.method === 'POST') return await login(request, env);
      if (url.pathname === '/state' && request.method === 'GET') return await readState(request, env);
      if (url.pathname === '/state' && request.method === 'PUT') return await writeState(request, env);
      return json(request, env, {error: '接口不存在。'}, 404);
    } catch (error) {
      console.error(error);
      return json(request, env, {error: '同步服务暂时出了点问题，请稍后再试。'}, 500);
    }
  }
};
