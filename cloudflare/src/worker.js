const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_PAYLOAD = 1_900_000;
const MAX_DECOMPRESSED_PAYLOAD = 24_000_000;
const PASSWORD_ITERATIONS = 100_000;
const ADMIN_PASSWORD_ITERATIONS = 100_000;
const USER_TOKEN_LIFETIME_SECONDS = 180 * 24 * 60 * 60;
const ADMIN_TOKEN_LIFETIME_SECONDS = 30 * 60;
const SETUP_TOKEN_LIFETIME_SECONDS = 15 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_BLOCK_SECONDS = 15 * 60;
const RATE_MAX_FAILURES = 5;
const MAX_MONITORED_SITES = 20;
const MAX_ROOM_PHOTO = 1_500_000;

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

async function issueToken(secret, claims, lifetimeSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({iat: now, exp: now + lifetimeSeconds, nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12))), ...claims})));
  return `${payload}.${bytesToBase64Url(await hmac(secret, payload))}`;
}

async function verifyToken(secret, token) {
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return null;
    const expected = bytesToBase64Url(await hmac(secret, payload));
    if (!constantTimeEqual(signature, expected)) return null;
    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    return Number.isSafeInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch (_) { return null; }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (origin === env.ALLOWED_ORIGIN || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) return origin;
  return env.ALLOWED_ORIGIN;
}

function headers(request, env, extra = {}) {
  return {'Access-Control-Allow-Origin': allowedOrigin(request, env), 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Base-Revision, X-Device-Id, X-Payload-Encoding, X-Photo-Caption', 'Access-Control-Expose-Headers': 'X-Revision, X-Updated-At, X-Device-Id, X-Payload-Encoding', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', ...extra};
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: headers(request, env, {'Content-Type': 'application/json; charset=utf-8'})});
}

function blobValue(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return Uint8Array.from(value || []).buffer;
}

async function stateFromPayload(payload, encoding) {
  const bytes = blobValue(payload);
  let text;
  if (encoding === 'gzip') {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), chunks = [];
    let total = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_DECOMPRESSED_PAYLOAD) { await reader.cancel(); throw new Error('快照解压后超过安全大小。'); }
      chunks.push(value);
    }
    const combined = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    text = decoder.decode(combined);
  } else text = decoder.decode(bytes);
  const parsed = JSON.parse(text), state = parsed?.state;
  if (!state || !Array.isArray(state.decks)) throw new Error('快照中的学习记录无法读取。');
  return state;
}

async function stateSummaryFromPayload(payload, encoding) {
  const state = await stateFromPayload(payload, encoding);
  let words = 0, seen = 0, attempts = 0, remembered = 0;
  for (const deck of state.decks) {
    words += Array.isArray(deck.words) ? deck.words.length : 0;
    for (const progress of Object.values(deck.progress || {})) {
      if (progress?.seen) seen++;
      attempts += Number(progress?.attempts) || 0;
      if ((Number(progress?.longTermSuccesses) || 0) > 0) remembered++;
    }
  }
  const studyDates = [...new Set(Array.isArray(state.studyDays) ? state.studyDays.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) : [])].sort();
  let streak = 0;
  if (studyDates.length) {
    let cursor = studyDates[studyDates.length - 1];
    const known = new Set(studyDates);
    while (known.has(cursor)) { streak++; const date = new Date(cursor + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() - 1); cursor = date.toISOString().slice(0, 10); }
  }
  return {decks: state.decks.length, words, seen, attempts, remembered, studyDays: studyDates.length, streak};
}

function overviewFromState(state, revision, updatedAt) {
  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
  const studyDays = new Set(Array.isArray(state.studyDays) ? state.studyDays.filter(value => dayPattern.test(value)) : []);
  const daily = new Map();
  const ensureDay = date => {
    if (!dayPattern.test(date)) return null;
    if (!daily.has(date)) daily.set(date, {date, activeMinutes: 0, attempts: 0, correct: 0, wrong: 0, newWords: 0, remembered: 0, rescueDone: 0, studied: false});
    return daily.get(date);
  };
  for (const date of studyDays) {
    const item = ensureDay(date);
    if (item) item.studied = true;
  }
  for (const [date, entry] of Object.entries(state.dailyLog || {})) {
    const item = ensureDay(date);
    if (!item || !entry || typeof entry !== 'object') continue;
    item.activeMinutes = Math.max(0, Math.round((Number(entry.activeMs) || 0) / 60000));
    item.attempts = Math.max(0, Number(entry.attempts) || 0);
    item.correct = Math.max(0, Number(entry.correct) || 0);
    item.wrong = Math.max(0, Number(entry.wrong) || 0);
    item.rescueDone = Array.isArray(entry.rescueDone) ? Math.min(100, entry.rescueDone.length) : 0;
    item.studied ||= item.activeMinutes > 0 || item.attempts > 0 || item.rescueDone > 0;
  }

  let words = 0, seen = 0, attempts = 0, remembered = 0;
  const deckSummaries = [];
  for (const deck of state.decks) {
    const deckWords = Array.isArray(deck.words) ? deck.words.length : 0;
    let deckSeen = 0, deckRemembered = 0;
    words += deckWords;
    for (const progress of Object.values(deck.progress || {})) {
      if (!progress || typeof progress !== 'object') continue;
      if (progress.seen) { seen++; deckSeen++; }
      attempts += Math.max(0, Number(progress.attempts) || 0);
      if ((Number(progress.longTermSuccesses) || 0) > 0) { remembered++; deckRemembered++; }
      if (dayPattern.test(progress.firstSeenDate || '')) {
        const item = ensureDay(progress.firstSeenDate);
        if (item) { item.newWords++; item.studied = true; }
      }
      if (dayPattern.test(progress.lastLongTermSuccessDate || '')) {
        const item = ensureDay(progress.lastLongTermSuccessDate);
        if (item) { item.remembered++; item.studied = true; }
      }
    }
    deckSummaries.push({title: String(deck.title || '未命名词本').slice(0, 80), words: deckWords, seen: deckSeen, remembered: deckRemembered, active: deck.id === state.activeDeckId});
  }

  const days = [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-70);
  const latestStudyDate = [...days].reverse().find(item => item.studied)?.date || '';
  return {
    revision: Number(revision) || 0,
    updatedAt: updatedAt || '',
    totals: {decks: state.decks.length, words, seen, attempts, remembered, studyDays: studyDays.size},
    latestStudyDate,
    dailyPlan: state.dailyPlan && dayPattern.test(state.dailyPlan.date || '') ? {date: state.dailyPlan.date, mode: state.dailyPlan.mode || '', target: Math.max(0, Number(state.dailyPlan.target) || 0)} : null,
    decks: deckSummaries.sort((left, right) => Number(right.active) - Number(left.active)).slice(0, 20),
    days
  };
}

function presenceFromRow(row, now = Date.now()) {
  if (!row?.last_seen_at) return {state: 'offline', studying: false, lastSeenAt: ''};
  const lastSeen = Date.parse(row.last_seen_at);
  const age = Number.isFinite(lastSeen) ? Math.max(0, now - lastSeen) : Infinity;
  let state = 'offline';
  if (row.status !== 'offline' && age <= 130_000) state = row.status === 'away' || !Number(row.active) ? 'away' : 'online';
  else if (row.status !== 'offline' && age <= 180_000) state = 'away';
  return {state, studying: state === 'online' && !!Number(row.studying), lastSeenAt: row.last_seen_at};
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z'));
}

function companionFromRow(row, now = Date.now()) {
  const until = row?.active_until || '';
  return {active: !!until && Date.parse(until) > now, activeUntil: until, updatedAt: row?.updated_at || ''};
}

async function syncMilestones(env, state, achievedAt = new Date().toISOString()) {
  const overview = overviewFromState(state, 0, achievedAt);
  const totals = overview.totals;
  const completeDeck = overview.decks.find(deck => deck.words > 0 && deck.seen >= deck.words);
  const candidates = [
    [totals.studyDays >= 1, 'first-study', '第一次认真出现', '从这一天开始，陌生的词慢慢变成了老朋友。'],
    [totals.seen >= 100, 'seen-100', '和第 100 个词见面', '已经认识 100 个单词，第一小段路好好走完了。'],
    [totals.seen >= 500, 'seen-500', '和第 500 个词见面', '五百次见面，已经足够装满小紫怪的一层书架。'],
    [totals.seen >= 1000, 'seen-1000', '认识了 1000 个词', '四位数的词汇旅程，从每一次小小开始攒起来。'],
    [totals.remembered >= 100, 'remembered-100', '真正记住 100 个词', '不是见过而已，是经过复习后真的留下来了。'],
    [totals.remembered >= 500, 'remembered-500', '真正记住 500 个词', '五百个词已经在记忆里拥有自己的位置。'],
    [totals.studyDays >= 7, 'study-days-7', '认真出现过 7 天', '不用天天拼命，愿意一次次回来就很了不起。'],
    [totals.studyDays >= 30, 'study-days-30', '认真出现过 30 天', '三十个认真出现过的日子，被小词窝好好收了起来。'],
    [!!completeDeck, 'first-deck', '第一次走完一本词书', completeDeck ? `《${completeDeck.title}》里的每个词都已经见过面。` : '']
  ].filter(([ready]) => ready);
  if (!candidates.length) return;
  await env.DB.batch(candidates.map(([, code, title, detail]) => env.DB.prepare('INSERT OR IGNORE INTO milestones (code, title, detail, achieved_at) VALUES (?, ?, ?, ?)').bind(code, title, detail, achievedAt)));
}

async function syncLatestMood(env, state) {
  const entries = Object.entries(state?.moodLog || {}).filter(([date, entry]) => validDay(date) && entry && ['tired', 'okay', 'good'].includes(entry.level));
  if (!entries.length) return;
  entries.sort(([left], [right]) => left.localeCompare(right));
  const [moodDate, mood] = entries.at(-1), note = typeof mood.note === 'string' ? mood.note.trim().slice(0, 200) : '';
  const latest = await env.DB.prepare('SELECT level, note FROM moods WHERE mood_date = ? ORDER BY id DESC LIMIT 1').bind(moodDate).first();
  if (latest?.level === mood.level && latest?.note === note) return;
  const createdAt = Number.isFinite(Number(mood.createdAt)) ? new Date(Number(mood.createdAt)).toISOString() : new Date().toISOString();
  await env.DB.prepare('INSERT INTO moods (mood_date, level, note, created_at) VALUES (?, ?, ?, ?)').bind(moodDate, mood.level, note, createdAt).run();
  await env.DB.prepare('DELETE FROM moods WHERE id NOT IN (SELECT id FROM moods ORDER BY id DESC LIMIT 400)').run();
}

async function deliverScheduledMessages(env) {
  const now = new Date().toISOString();
  const due = await env.DB.prepare('SELECT id FROM scheduled_messages WHERE delivered_at IS NULL AND scheduled_for <= ? ORDER BY scheduled_for LIMIT 20').bind(now).all();
  let delivered = 0;
  for (const row of due.results || []) {
    const claimed = await env.DB.prepare('UPDATE scheduled_messages SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL RETURNING body, scheduled_for').bind(now, row.id).first();
    if (!claimed) continue;
    await env.DB.prepare('INSERT INTO messages (sender, body, created_at, read_at) VALUES (?, ?, ?, NULL)').bind('owner', claimed.body, claimed.scheduled_for).run();
    delivered++;
  }
  if (delivered) await env.DB.prepare('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 300)').run();
  return delivered;
}

async function bodyJSON(request) {
  if (Number(request.headers.get('Content-Length') || 0) > 4096) throw new Error('请求内容过大。');
  return request.json();
}

function bearer(request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function currentGeneration(env) {
  const row = await env.DB.prepare('SELECT generation FROM auth_control WHERE id = 1').first();
  return Number(row?.generation) || 1;
}

async function userAuthorized(request, env) {
  const data = await verifyToken(env.SESSION_SECRET, bearer(request));
  return !!data && data.role === 'user' && Number(data.generation) === await currentGeneration(env);
}

async function adminAuthorized(request, env) {
  const data = await verifyToken(env.SESSION_SECRET, bearer(request));
  return !!data && data.role === 'admin';
}

async function careAuthorized(request, env) {
  const data = await verifyToken(env.SESSION_SECRET, bearer(request));
  return !!data && (data.role === 'care' || data.role === 'admin');
}

async function validAdminPassword(password, env) {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT || !password || password.length > 128) return false;
  const iterations = Number(env.ADMIN_PASSWORD_ITERATIONS) || ADMIN_PASSWORD_ITERATIONS;
  const candidate = bytesToBase64Url(await passwordHash(password, base64UrlToBytes(env.ADMIN_PASSWORD_SALT), iterations));
  return constantTimeEqual(candidate, env.ADMIN_PASSWORD_HASH);
}

async function requestFingerprint(request, env, scope) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return bytesToBase64Url(await hmac(env.SESSION_SECRET, `${scope}:${ip}`)).slice(0, 32);
}

async function rateStatus(request, env, scope) {
  const fingerprint = await requestFingerprint(request, env, scope);
  const row = await env.DB.prepare('SELECT failures, window_started, blocked_until FROM auth_attempts WHERE scope = ? AND fingerprint = ?').bind(scope, fingerprint).first();
  const now = Math.floor(Date.now() / 1000);
  return {fingerprint, now, blocked: Number(row?.blocked_until || 0) > now, row};
}

async function recordFailure(env, scope, status) {
  const withinWindow = status.row && status.now - Number(status.row.window_started) < RATE_WINDOW_SECONDS;
  const failures = withinWindow ? Number(status.row.failures) + 1 : 1;
  const windowStarted = withinWindow ? Number(status.row.window_started) : status.now;
  const blockedUntil = failures >= RATE_MAX_FAILURES ? status.now + RATE_BLOCK_SECONDS : 0;
  await env.DB.prepare(`INSERT INTO auth_attempts (scope, fingerprint, failures, window_started, blocked_until) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, fingerprint) DO UPDATE SET failures = excluded.failures, window_started = excluded.window_started, blocked_until = excluded.blocked_until`).bind(scope, status.fingerprint, failures, windowStarted, blockedUntil).run();
}

async function clearFailures(env, scope, fingerprint) {
  await env.DB.prepare('DELETE FROM auth_attempts WHERE scope = ? AND fingerprint = ?').bind(scope, fingerprint).run();
}

async function adminSession(request, env) {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT) return json(request, env, {error: '管理员认证尚未配置。'}, 503);
  const status = await rateStatus(request, env, 'admin');
  if (status.blocked) return json(request, env, {error: '尝试次数过多，请 15 分钟后再试。'}, 429);
  const body = await bodyJSON(request);
  const password = typeof body.password === 'string' ? body.password : '';
  const valid = await validAdminPassword(password, env);
  if (!valid) {
    await recordFailure(env, 'admin', status);
    return json(request, env, {error: '管理员密码不正确。'}, 401);
  }
  await clearFailures(env, 'admin', status.fingerprint);
  return json(request, env, {token: await issueToken(env.SESSION_SECRET, {role: 'admin'}, ADMIN_TOKEN_LIFETIME_SECONDS), expiresIn: ADMIN_TOKEN_LIFETIME_SECONDS});
}

async function careSession(request, env) {
  const status = await rateStatus(request, env, 'care');
  if (status.blocked) return json(request, env, {error: '尝试次数过多，请 15 分钟后再试。'}, 429);
  const body = await bodyJSON(request), password = typeof body.password === 'string' ? body.password : '';
  const row = await env.DB.prepare('SELECT salt, password_hash, iterations FROM care_auth WHERE id = 1').first();
  let valid = false;
  if (row && password && password.length <= 128) {
    const candidate = bytesToBase64Url(await passwordHash(password, base64UrlToBytes(row.salt), row.iterations));
    valid = constantTimeEqual(candidate, row.password_hash);
  }
  if (!valid) valid = await validAdminPassword(password, env);
  if (!valid) {
    await recordFailure(env, 'care', status);
    return json(request, env, {error: row ? '进入密码不正确。' : '请先使用管理员密码进入并设置独立密码。'}, 401);
  }
  await clearFailures(env, 'care', status.fingerprint);
  return json(request, env, {token: await issueToken(env.SESSION_SECRET, {role: 'care'}, ADMIN_TOKEN_LIFETIME_SECONDS), expiresIn: ADMIN_TOKEN_LIFETIME_SECONDS, usingAdminPassword: !row});
}

async function setCarePassword(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  const body = await bodyJSON(request), password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 128) return json(request, env, {error: '进入密码需要 8 到 128 个字符。'}, 400);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO care_auth (id, salt, password_hash, iterations, updated_at) VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash,
      iterations = excluded.iterations, updated_at = excluded.updated_at`)
    .bind(bytesToBase64Url(salt), bytesToBase64Url(hash), PASSWORD_ITERATIONS, updatedAt).run();
  return json(request, env, {ok: true, token: await issueToken(env.SESSION_SECRET, {role: 'care'}, ADMIN_TOKEN_LIFETIME_SECONDS), updatedAt});
}

function safeSiteURL(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 500) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '0.0.0.0') return null;
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
      if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)) return null;
    }
    url.hash = '';
    return url.href;
  } catch (_) { return null; }
}

async function careSites(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, name, url, created_at FROM monitored_sites ORDER BY id').all();
    return json(request, env, {sites: (rows.results || []).map(row => ({id:Number(row.id), name:row.name, url:row.url, createdAt:row.created_at}))});
  }
  const body = await bodyJSON(request);
  const name = String(body.name || '').trim().slice(0, 60), url = safeSiteURL(body.url);
  if (!name || !url) return json(request, env, {error: '请填写名称和有效的公开网站地址。'}, 400);
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM monitored_sites').first();
  if (Number(count?.count) >= MAX_MONITORED_SITES) return json(request, env, {error: `最多可以添加 ${MAX_MONITORED_SITES} 个网站。`}, 400);
  try {
    const result = await env.DB.prepare('INSERT INTO monitored_sites (name, url, created_at) VALUES (?, ?, ?)').bind(name, url, new Date().toISOString()).run();
    return json(request, env, {ok:true, id:Number(result.meta?.last_row_id) || 0, name, url}, 201);
  } catch (_) { return json(request, env, {error:'这个网站已经在列表里了。'}, 409); }
}

async function removeCareSite(request, env, id) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error:'网站编号无效。'}, 400);
  const result = await env.DB.prepare('DELETE FROM monitored_sites WHERE id = ?').bind(id).run();
  return json(request, env, {ok:true, removed:Number(result.meta?.changes) || 0});
}

async function checkSite(row) {
  const started = Date.now(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(row.url, {method:'GET', redirect:'follow', signal:controller.signal, headers:{Accept:'text/html,application/json;q=0.9,*/*;q=0.1'}});
    response.body?.cancel().catch(() => {});
    return {id:Number(row.id), name:row.name, url:row.url, ok:response.status < 500, status:response.status, latency:Date.now() - started, checkedAt:new Date().toISOString()};
  } catch (error) {
    return {id:Number(row.id), name:row.name, url:row.url, ok:false, status:0, latency:Date.now() - started, checkedAt:new Date().toISOString(), error:error?.name === 'AbortError' ? '检查超时' : '无法连接'};
  } finally { clearTimeout(timeout); }
}

async function careSiteStatus(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  const rows = await env.DB.prepare('SELECT id, name, url FROM monitored_sites ORDER BY id LIMIT 20').all();
  return json(request, env, {sites: await Promise.all((rows.results || []).map(checkSite))});
}

async function messageThread(request, env, role) {
  const authorized = role === 'owner' ? await careAuthorized(request, env) : await userAuthorized(request, env);
  if (!authorized) return json(request, env, {error: role === 'owner' ? '请重新验证进入密码。' : '请先连接云端进度。'}, 401);
  await deliverScheduledMessages(env);
  const other = role === 'owner' ? 'lynn' : 'owner';
  const url = new URL(request.url);
  if (url.searchParams.get('read') === '1') {
    await env.DB.prepare('UPDATE messages SET read_at = ? WHERE sender = ? AND read_at IS NULL').bind(new Date().toISOString(), other).run();
  }
  const rows = await env.DB.prepare('SELECT id, sender, body, created_at, read_at FROM messages ORDER BY id DESC LIMIT 100').all();
  const messages = (rows.results || []).reverse().map(row => ({id:Number(row.id), sender:row.sender, body:row.body, createdAt:row.created_at, readAt:row.read_at || ''}));
  return json(request, env, {messages, unread:messages.filter(message => message.sender === other && !message.readAt).length});
}

async function sendMessage(request, env, sender) {
  const authorized = sender === 'owner' ? await careAuthorized(request, env) : await userAuthorized(request, env);
  if (!authorized) return json(request, env, {error: sender === 'owner' ? '请重新验证进入密码。' : '请先连接云端进度。'}, 401);
  const body = await bodyJSON(request), text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 500) return json(request, env, {error:'每条留言需要 1 到 500 个字符。'}, 400);
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare('INSERT INTO messages (sender, body, created_at, read_at) VALUES (?, ?, ?, NULL)').bind(sender, text, createdAt).run();
  await env.DB.prepare('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 300)').run();
  return json(request, env, {ok:true, message:{id:Number(result.meta?.last_row_id) || 0, sender, body:text, createdAt, readAt:''}}, 201);
}

async function careCompanion(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT active_until, updated_at FROM companionship WHERE id = 1').first();
    return json(request, env, {companion: companionFromRow(row)});
  }
  const body = await bodyJSON(request), active = body.active === true;
  const minutes = Math.max(15, Math.min(120, Number(body.minutes) || 45));
  const updatedAt = new Date().toISOString(), activeUntil = active ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await env.DB.prepare(`INSERT INTO companionship (id, active_until, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET active_until = excluded.active_until, updated_at = excluded.updated_at`).bind(activeUntil, updatedAt).run();
  return json(request, env, {ok:true, companion:companionFromRow({active_until:activeUntil, updated_at:updatedAt})});
}

async function careScheduledMessages(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  await deliverScheduledMessages(env);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, body, scheduled_for, created_at, delivered_at FROM scheduled_messages ORDER BY scheduled_for DESC LIMIT 50').all();
    return json(request, env, {messages:(rows.results || []).map(row => ({id:Number(row.id), body:row.body, scheduledFor:row.scheduled_for, createdAt:row.created_at, deliveredAt:row.delivered_at || ''}))});
  }
  const body = await bodyJSON(request), text = typeof body.body === 'string' ? body.body.trim() : '';
  const when = typeof body.scheduledFor === 'string' ? new Date(body.scheduledFor) : new Date(NaN);
  if (!text || text.length > 500) return json(request, env, {error:'定时留言需要 1 到 500 个字符。'}, 400);
  if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() - 60_000 || when.getTime() > Date.now() + 366 * 86400_000) return json(request, env, {error:'请选择未来一年内的有效投递时间。'}, 400);
  const createdAt = new Date().toISOString(), scheduledFor = when.toISOString();
  const result = await env.DB.prepare('INSERT INTO scheduled_messages (body, scheduled_for, created_at, delivered_at) VALUES (?, ?, ?, NULL)').bind(text, scheduledFor, createdAt).run();
  return json(request, env, {ok:true, message:{id:Number(result.meta?.last_row_id) || 0, body:text, scheduledFor, createdAt, deliveredAt:''}}, 201);
}

async function removeScheduledMessage(request, env, id) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error:'定时留言编号无效。'}, 400);
  const result = await env.DB.prepare('DELETE FROM scheduled_messages WHERE id = ? AND delivered_at IS NULL').bind(id).run();
  return json(request, env, {ok:true, removed:Number(result.meta?.changes) || 0});
}

async function careSurprises(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, body, gift, unlock_date, created_at, opened_at FROM surprise_letters ORDER BY unlock_date DESC, id DESC LIMIT 50').all();
    return json(request, env, {letters:(rows.results || []).map(row => ({id:Number(row.id), body:row.body, gift:row.gift, unlockDate:row.unlock_date, createdAt:row.created_at, openedAt:row.opened_at || ''}))});
  }
  const body = await bodyJSON(request), text = typeof body.body === 'string' ? body.body.trim() : '', gift = typeof body.gift === 'string' ? body.gift.trim() : '💜', unlockDate = String(body.unlockDate || '');
  if (!text || text.length > 500) return json(request, env, {error:'惊喜信需要 1 到 500 个字符。'}, 400);
  if (!gift || [...gift].length > 4) return json(request, env, {error:'请选择一个简短的礼物图标。'}, 400);
  if (!validDay(unlockDate)) return json(request, env, {error:'惊喜信日期无效。'}, 400);
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare('INSERT INTO surprise_letters (body, gift, unlock_date, created_at, opened_at) VALUES (?, ?, ?, ?, NULL)').bind(text, gift, unlockDate, createdAt).run();
  return json(request, env, {ok:true, letter:{id:Number(result.meta?.last_row_id) || 0, body:text, gift, unlockDate, createdAt, openedAt:''}}, 201);
}

async function removeSurprise(request, env, id) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error:'惊喜信编号无效。'}, 400);
  const result = await env.DB.prepare('DELETE FROM surprise_letters WHERE id = ? AND opened_at IS NULL').bind(id).run();
  return json(request, env, {ok:true, removed:Number(result.meta?.changes) || 0});
}

async function companionHome(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error:'请先连接云端进度。'}, 401);
  await deliverScheduledMessages(env);
  const stateRow = await env.DB.prepare('SELECT encoding, payload FROM sync_state WHERE id = 1').first();
  if (stateRow) {
    try { await syncMilestones(env, await stateFromPayload(stateRow.payload, stateRow.encoding)); }
    catch (error) { console.error(JSON.stringify({event:'milestone_sync_failed', message:error?.message || String(error)})); }
  }
  const [companion, milestones, surprises, photos] = await Promise.all([
    env.DB.prepare('SELECT active_until, updated_at FROM companionship WHERE id = 1').first(),
    env.DB.prepare('SELECT code, title, detail, achieved_at FROM milestones ORDER BY achieved_at DESC LIMIT 30').all(),
    env.DB.prepare('SELECT id, body, gift, unlock_date, created_at, opened_at FROM surprise_letters WHERE opened_at IS NULL ORDER BY unlock_date, id LIMIT 10').all(),
    env.DB.prepare('SELECT id, caption, content_type, created_at FROM room_photos ORDER BY created_at DESC, id DESC LIMIT 12').all()
  ]);
  return json(request, env, {
    companion:companionFromRow(companion),
    milestones:(milestones.results || []).map(row => ({code:row.code, title:row.title, detail:row.detail, achievedAt:row.achieved_at})),
    surprises:(surprises.results || []).map(row => ({id:Number(row.id), body:row.body, gift:row.gift, unlockDate:row.unlock_date, createdAt:row.created_at, openedAt:row.opened_at || ''})),
    photos:(photos.results || []).map(row => ({id:Number(row.id), caption:row.caption, contentType:row.content_type, createdAt:row.created_at}))
  });
}

async function recordMood(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error:'请先连接云端进度。'}, 401);
  const body = await bodyJSON(request), level = String(body.level || ''), note = typeof body.note === 'string' ? body.note.trim() : '', moodDate = String(body.date || '');
  if (!['tired', 'okay', 'good'].includes(level) || !validDay(moodDate)) return json(request, env, {error:'今天的心情格式不正确。'}, 400);
  if (note.length > 200) return json(request, env, {error:'心情文字最多 200 个字符。'}, 400);
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO moods (mood_date, level, note, created_at) VALUES (?, ?, ?, ?)').bind(moodDate, level, note, createdAt).run();
  await env.DB.prepare('DELETE FROM moods WHERE id NOT IN (SELECT id FROM moods ORDER BY id DESC LIMIT 400)').run();
  return json(request, env, {ok:true, mood:{date:moodDate, level, note, createdAt}}, 201);
}

async function openSurprise(request, env, id) {
  if (!await userAuthorized(request, env)) return json(request, env, {error:'请先连接云端进度。'}, 401);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error:'惊喜信编号无效。'}, 400);
  const openedAt = new Date().toISOString();
  const letter = await env.DB.prepare('UPDATE surprise_letters SET opened_at = ? WHERE id = ? AND opened_at IS NULL RETURNING id, body, gift, unlock_date, created_at, opened_at').bind(openedAt, id).first();
  if (!letter) return json(request, env, {error:'这封惊喜信已经打开或不存在。'}, 404);
  return json(request, env, {ok:true, letter:{id:Number(letter.id), body:letter.body, gift:letter.gift, unlockDate:letter.unlock_date, createdAt:letter.created_at, openedAt:letter.opened_at}});
}

async function uploadRoomPhoto(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error:'请先连接云端进度。'}, 401);
  const photoCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM room_photos').first();
  if (Number(photoCount?.count) >= 12) return json(request, env, {error:'照片墙最多放 12 张，先移除一张再添加吧。'}, 409);
  const contentType = (request.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return json(request, env, {error:'请选择 JPG、PNG 或 WebP 图片。'}, 415);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_ROOM_PHOTO) return json(request, env, {error:'压缩后的图片不能超过 1.5 MB。'}, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_ROOM_PHOTO) return json(request, env, {error:'压缩后的图片不能超过 1.5 MB。'}, 413);
  let caption = '';
  try { caption = decodeURIComponent(request.headers.get('X-Photo-Caption') || '').trim().slice(0, 120); }
  catch (_) { return json(request, env, {error:'照片说明格式不正确。'}, 400); }
  const key = `d1:${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare('INSERT INTO room_photos (object_key, content_type, caption, created_at, blob_data) VALUES (?, ?, ?, ?, ?)').bind(key, contentType, caption, createdAt, bytes).run();
  return json(request, env, {ok:true, photo:{id:Number(result.meta?.last_row_id) || 0, caption, contentType, createdAt}}, 201);
}

async function roomPhoto(request, env, id) {
  const authorized = await userAuthorized(request, env) || await careAuthorized(request, env);
  if (!authorized) return json(request, env, {error:'没有权限查看这张图片。'}, 401);
  const row = await env.DB.prepare('SELECT content_type, blob_data FROM room_photos WHERE id = ?').bind(id).first();
  if (!row?.blob_data) return json(request, env, {error:'图片不存在。'}, 404);
  const bytes = blobValue(row.blob_data);
  return new Response(bytes, {headers:headers(request, env, {'Content-Type':row.content_type, 'Content-Length':String(bytes.byteLength), 'Cache-Control':'private, max-age=300'})});
}

async function removeRoomPhoto(request, env, id) {
  if (!await userAuthorized(request, env)) return json(request, env, {error:'请先连接云端进度。'}, 401);
  const result = await env.DB.prepare('DELETE FROM room_photos WHERE id = ?').bind(id).run();
  return json(request, env, {ok:true, removed:Number(result.meta?.changes) || 0});
}

async function claim(request, env) {
  const body = await bodyJSON(request);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 128) return json(request, env, {error: '同步密码需要 8 到 128 个字符。'}, 400);
  const tokenData = await verifyToken(env.SESSION_SECRET, bearer(request));
  const generation = await currentGeneration(env);
  const initialAccess = tokenData?.role === 'admin' && constantTimeEqual(body.claimToken || '', env.CLAIM_TOKEN || '');
  const resetAccess = tokenData?.role === 'setup' && Number(tokenData.generation) === generation;
  if (!initialAccess && !resetAccess) return json(request, env, {error: '请先通过管理员验证。'}, 403);
  const existing = await env.DB.prepare('SELECT id FROM auth WHERE id = 1').first();
  if (existing) return json(request, env, {error: '云端同步已经初始化，请使用同步密码登录。'}, 409);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  await env.DB.prepare('INSERT INTO auth (id, salt, password_hash, iterations, created_at) VALUES (1, ?, ?, ?, ?)').bind(bytesToBase64Url(salt), bytesToBase64Url(hash), PASSWORD_ITERATIONS, new Date().toISOString()).run();
  return json(request, env, {token: await issueToken(env.SESSION_SECRET, {role: 'user', generation}, USER_TOKEN_LIFETIME_SECONDS), expiresIn: USER_TOKEN_LIFETIME_SECONDS});
}

async function login(request, env) {
  const status = await rateStatus(request, env, 'user');
  if (status.blocked) return json(request, env, {error: '尝试次数过多，请 15 分钟后再试。'}, 429);
  const body = await bodyJSON(request);
  const password = typeof body.password === 'string' ? body.password : '';
  const row = await env.DB.prepare('SELECT salt, password_hash, iterations FROM auth WHERE id = 1').first();
  if (!row) return json(request, env, {error: '云端同步还没有初始化。'}, 409);
  let valid = false;
  if (password && password.length <= 128) {
    const candidate = bytesToBase64Url(await passwordHash(password, base64UrlToBytes(row.salt), row.iterations));
    valid = constantTimeEqual(candidate, row.password_hash);
  }
  if (!valid) {
    await recordFailure(env, 'user', status);
    return json(request, env, {error: '同步密码不正确。'}, 401);
  }
  await clearFailures(env, 'user', status.fingerprint);
  const generation = await currentGeneration(env);
  return json(request, env, {token: await issueToken(env.SESSION_SECRET, {role: 'user', generation}, USER_TOKEN_LIFETIME_SECONDS), expiresIn: USER_TOKEN_LIFETIME_SECONDS});
}

async function adminStatus(request, env) {
  if (!await adminAuthorized(request, env)) return json(request, env, {error: '请重新进行管理员验证。'}, 401);
  const [auth, state, snapshots, generation] = await Promise.all([env.DB.prepare('SELECT COUNT(*) AS count FROM auth').first(), env.DB.prepare('SELECT COUNT(*) AS count FROM sync_state').first(), env.DB.prepare('SELECT COUNT(*) AS count FROM progress_snapshots').first(), currentGeneration(env)]);
  return json(request, env, {initialized: Number(auth?.count) > 0, hasProgress: Number(state?.count) > 0, snapshots: Number(snapshots?.count) || 0, generation});
}

async function adminOverview(request, env) {
  if (!await careAuthorized(request, env)) return json(request, env, {error: '请重新验证进入密码。'}, 401);
  const [row, presence, mood, milestones, companion] = await Promise.all([
    env.DB.prepare('SELECT revision, updated_at, encoding, payload FROM sync_state WHERE id = 1').first(),
    env.DB.prepare('SELECT status, studying, active, last_seen_at FROM presence WHERE id = 1').first(),
    env.DB.prepare('SELECT mood_date, level, note, created_at FROM moods ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare('SELECT code, title, detail, achieved_at FROM milestones ORDER BY achieved_at DESC LIMIT 30').all(),
    env.DB.prepare('SELECT active_until, updated_at FROM companionship WHERE id = 1').first()
  ]);
  if (!row) return json(request, env, {error: '云端还没有学习记录。'}, 404);
  const state = await stateFromPayload(row.payload, row.encoding);
  await syncMilestones(env, state);
  const currentMilestones = await env.DB.prepare('SELECT code, title, detail, achieved_at FROM milestones ORDER BY achieved_at DESC LIMIT 30').all();
  return json(request, env, {
    ...overviewFromState(state, row.revision, row.updated_at),
    presence: presenceFromRow(presence),
    mood:mood ? {date:mood.mood_date, level:mood.level, note:mood.note, createdAt:mood.created_at} : null,
    milestones:(currentMilestones.results || milestones.results || []).map(item => ({code:item.code, title:item.title, detail:item.detail, achievedAt:item.achieved_at})),
    companion:companionFromRow(companion)
  });
}

async function updatePresence(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error: '请重新输入同步密码。'}, 401);
  const body = await bodyJSON(request);
  const status = ['online', 'away', 'offline'].includes(body.status) ? body.status : '';
  if (!status) return json(request, env, {error: '在线状态无效。'}, 400);
  const studying = status === 'online' && body.studying === true ? 1 : 0;
  const active = status === 'online' && body.active === true ? 1 : 0;
  const lastSeenAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO presence (id, status, studying, active, last_seen_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, studying = excluded.studying,
      active = excluded.active, last_seen_at = excluded.last_seen_at`)
    .bind(status, studying, active, lastSeenAt).run();
  return json(request, env, {ok: true, presence: presenceFromRow({status, studying, active, last_seen_at: lastSeenAt})});
}

async function adminReset(request, env) {
  if (!await adminAuthorized(request, env)) return json(request, env, {error: '请重新进行管理员验证。'}, 401);
  const updatedAt = new Date().toISOString();
  await env.DB.batch([env.DB.prepare('UPDATE auth_control SET generation = generation + 1, updated_at = ? WHERE id = 1').bind(updatedAt), env.DB.prepare('DELETE FROM auth WHERE id = 1')]);
  const generation = await currentGeneration(env);
  const state = await env.DB.prepare('SELECT COUNT(*) AS count FROM sync_state').first();
  return json(request, env, {ok: true, preservedProgress: Number(state?.count) > 0, setupToken: await issueToken(env.SESSION_SECRET, {role: 'setup', generation}, SETUP_TOKEN_LIFETIME_SECONDS), expiresIn: SETUP_TOKEN_LIFETIME_SECONDS});
}

async function adminSnapshots(request, env) {
  if (!await adminAuthorized(request, env)) return json(request, env, {error: '请重新进行管理员验证。'}, 401);
  const [rows, current] = await Promise.all([
    env.DB.prepare('SELECT id, revision, created_at, device_id, reason FROM progress_snapshots ORDER BY created_at DESC, id DESC LIMIT 7').all(),
    env.DB.prepare('SELECT revision FROM sync_state WHERE id = 1').first()
  ]);
  return json(request, env, {currentRevision: Number(current?.revision) || 0, snapshots: (rows.results || []).map(row => ({id: Number(row.id), revision: Number(row.revision), createdAt: row.created_at, deviceId: row.device_id, reason: row.reason, current: Number(row.revision) === Number(current?.revision)}))});
}

async function adminPreviewSnapshot(request, env, id) {
  if (!await adminAuthorized(request, env)) return json(request, env, {error: '请重新进行管理员验证。'}, 401);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error: '历史记录编号无效。'}, 400);
  const [snapshot, current] = await Promise.all([
    env.DB.prepare('SELECT id, revision, created_at, device_id, encoding, payload FROM progress_snapshots WHERE id = ?').bind(id).first(),
    env.DB.prepare('SELECT revision, encoding, payload FROM sync_state WHERE id = 1').first()
  ]);
  if (!snapshot) return json(request, env, {error: '这份历史记录已经不在最近 7 次之内。'}, 404);
  const summary = await stateSummaryFromPayload(snapshot.payload, snapshot.encoding);
  const isCurrent = Number(snapshot.revision) === Number(current?.revision);
  let changes = {seen: 0, remembered: 0, attempts: 0, studyDays: 0};
  if (current && !isCurrent) {
    const currentSummary = await stateSummaryFromPayload(current.payload, current.encoding);
    changes = {seen: summary.seen - currentSummary.seen, remembered: summary.remembered - currentSummary.remembered, attempts: summary.attempts - currentSummary.attempts, studyDays: summary.studyDays - currentSummary.studyDays};
  }
  return json(request, env, {id: Number(snapshot.id), revision: Number(snapshot.revision), createdAt: snapshot.created_at, deviceId: snapshot.device_id, current: isCurrent, changes, ...summary});
}

async function adminRestoreSnapshot(request, env) {
  if (!await adminAuthorized(request, env)) return json(request, env, {error: '请重新进行管理员验证。'}, 401);
  const body = await bodyJSON(request), id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) return json(request, env, {error: '历史记录编号无效。'}, 400);
  const [snapshot, current] = await Promise.all([
    env.DB.prepare('SELECT id, encoding, payload FROM progress_snapshots WHERE id = ?').bind(id).first(),
    env.DB.prepare('SELECT revision FROM sync_state WHERE id = 1').first()
  ]);
  if (!snapshot || !current) return json(request, env, {error: '这份历史记录已经不在最近 7 次之内。'}, 404);
  const nextRevision = Number(current.revision) + 1, updatedAt = new Date().toISOString(), deviceId = 'admin-restore';
  const snapshotPayload = blobValue(snapshot.payload);
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO progress_snapshots (revision, created_at, device_id, encoding, payload, reason)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND revision = ?)`)
      .bind(nextRevision, updatedAt, deviceId, snapshot.encoding, snapshotPayload, `restore:${id}`, current.revision),
    env.DB.prepare('UPDATE sync_state SET revision = ?, updated_at = ?, device_id = ?, encoding = ?, payload = ? WHERE id = 1 AND revision = ?')
      .bind(nextRevision, updatedAt, deviceId, snapshot.encoding, snapshotPayload, current.revision),
    env.DB.prepare('DELETE FROM progress_snapshots WHERE id NOT IN (SELECT id FROM progress_snapshots ORDER BY created_at DESC, id DESC LIMIT 7)')
  ]);
  if (!results[1]?.meta?.changes) return json(request, env, {error: '云端进度刚刚发生变化，请刷新历史记录后再试。'}, 409);
  console.log(JSON.stringify({event: 'snapshot_restored', revision: nextRevision, snapshotId: id}));
  return json(request, env, {ok: true, revision: nextRevision, updatedAt, restoredFrom: id});
}

async function readState(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error: '请重新输入同步密码。'}, 401);
  const row = await env.DB.prepare('SELECT revision, updated_at, device_id, encoding, payload FROM sync_state WHERE id = 1').first();
  if (!row) return json(request, env, {error: '云端还没有学习记录。'}, 404);
  const payload = row.payload instanceof ArrayBuffer ? new Uint8Array(row.payload) : Uint8Array.from(row.payload || []);
  return new Response(payload, {status: 200, headers: headers(request, env, {'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.byteLength), 'X-Revision': String(row.revision), 'X-Updated-At': row.updated_at, 'X-Device-Id': row.device_id, 'X-Payload-Encoding': row.encoding})});
}

async function writeState(request, env) {
  if (!await userAuthorized(request, env)) return json(request, env, {error: '请重新输入同步密码。'}, 401);
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
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO sync_state (id, revision, updated_at, device_id, encoding, payload) VALUES (1, 1, ?, ?, ?, ?)').bind(updatedAt, deviceId, encoding, payload),
        env.DB.prepare('INSERT INTO progress_snapshots (revision, created_at, device_id, encoding, payload, reason) VALUES (1, ?, ?, ?, ?, ?)').bind(updatedAt, deviceId, encoding, payload, 'sync'),
        env.DB.prepare('DELETE FROM progress_snapshots WHERE id NOT IN (SELECT id FROM progress_snapshots ORDER BY created_at DESC, id DESC LIMIT 7)')
      ]);
    } catch (error) {
      const raced = await env.DB.prepare('SELECT revision, updated_at, device_id FROM sync_state WHERE id = 1').first();
      if (raced) return json(request, env, {error: '另一台设备已经更新了进度。', revision: raced.revision, updatedAt: raced.updated_at, deviceId: raced.device_id}, 409);
      throw error;
    }
    try { const state = await stateFromPayload(payload, encoding); await syncMilestones(env, state, updatedAt); await syncLatestMood(env, state); } catch (error) { console.error(JSON.stringify({event:'companion_sync_failed', message:error?.message || String(error)})); }
    return json(request, env, {revision: 1, updatedAt, deviceId});
  }
  if (current.revision !== baseRevision) return json(request, env, {error: '另一台设备已经更新了进度。', revision: current.revision, updatedAt: current.updated_at, deviceId: current.device_id}, 409);
  const nextRevision = current.revision + 1;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO progress_snapshots (revision, created_at, device_id, encoding, payload, reason)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND revision = ?)`)
      .bind(nextRevision, updatedAt, deviceId, encoding, payload, 'sync', current.revision),
    env.DB.prepare('UPDATE sync_state SET revision = ?, updated_at = ?, device_id = ?, encoding = ?, payload = ? WHERE id = 1 AND revision = ?').bind(nextRevision, updatedAt, deviceId, encoding, payload, current.revision),
    env.DB.prepare('DELETE FROM progress_snapshots WHERE id NOT IN (SELECT id FROM progress_snapshots ORDER BY created_at DESC, id DESC LIMIT 7)')
  ]);
  if (!results[1]?.meta?.changes) return json(request, env, {error: '另一台设备刚刚更新了进度。'}, 409);
  try { const state = await stateFromPayload(payload, encoding); await syncMilestones(env, state, updatedAt); await syncLatestMood(env, state); } catch (error) { console.error(JSON.stringify({event:'companion_sync_failed', message:error?.message || String(error)})); }
  return json(request, env, {revision: nextRevision, updatedAt, deviceId});
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: headers(request, env)});
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health' && request.method === 'GET') return json(request, env, {ok: true, service: 'lynn-words-sync'});
      if (url.pathname === '/admin/session' && request.method === 'POST') return await adminSession(request, env);
      if (url.pathname === '/care/session' && request.method === 'POST') return await careSession(request, env);
      if (url.pathname === '/care/password' && request.method === 'PUT') return await setCarePassword(request, env);
      if (url.pathname === '/care/sites' && ['GET', 'POST'].includes(request.method)) return await careSites(request, env);
      if (url.pathname === '/care/sites/status' && request.method === 'GET') return await careSiteStatus(request, env);
      if (url.pathname === '/care/messages' && request.method === 'GET') return await messageThread(request, env, 'owner');
      if (url.pathname === '/care/messages' && request.method === 'POST') return await sendMessage(request, env, 'owner');
      if (url.pathname === '/care/companion' && ['GET', 'POST'].includes(request.method)) return await careCompanion(request, env);
      if (url.pathname === '/care/scheduled' && ['GET', 'POST'].includes(request.method)) return await careScheduledMessages(request, env);
      if (url.pathname === '/care/surprises' && ['GET', 'POST'].includes(request.method)) return await careSurprises(request, env);
      const careSiteDelete = url.pathname.match(/^\/care\/sites\/(\d+)$/);
      if (careSiteDelete && request.method === 'DELETE') return await removeCareSite(request, env, Number(careSiteDelete[1]));
      const scheduledDelete = url.pathname.match(/^\/care\/scheduled\/(\d+)$/);
      if (scheduledDelete && request.method === 'DELETE') return await removeScheduledMessage(request, env, Number(scheduledDelete[1]));
      const surpriseDelete = url.pathname.match(/^\/care\/surprises\/(\d+)$/);
      if (surpriseDelete && request.method === 'DELETE') return await removeSurprise(request, env, Number(surpriseDelete[1]));
      if (url.pathname === '/admin/status' && request.method === 'GET') return await adminStatus(request, env);
      if (url.pathname === '/admin/overview' && request.method === 'GET') return await adminOverview(request, env);
      if (url.pathname === '/admin/reset' && request.method === 'POST') return await adminReset(request, env);
      if (url.pathname === '/admin/snapshots' && request.method === 'GET') return await adminSnapshots(request, env);
      const snapshotPreview = url.pathname.match(/^\/admin\/snapshots\/(\d+)\/preview$/);
      if (snapshotPreview && request.method === 'GET') return await adminPreviewSnapshot(request, env, Number(snapshotPreview[1]));
      if (url.pathname === '/admin/snapshots/restore' && request.method === 'POST') return await adminRestoreSnapshot(request, env);
      if (url.pathname === '/claim' && request.method === 'POST') return await claim(request, env);
      if (url.pathname === '/session' && request.method === 'POST') return await login(request, env);
      if (url.pathname === '/presence' && request.method === 'POST') return await updatePresence(request, env);
      if (url.pathname === '/messages' && request.method === 'GET') return await messageThread(request, env, 'lynn');
      if (url.pathname === '/messages' && request.method === 'POST') return await sendMessage(request, env, 'lynn');
      if (url.pathname === '/companion' && request.method === 'GET') return await companionHome(request, env);
      if (url.pathname === '/mood' && request.method === 'POST') return await recordMood(request, env);
      if (url.pathname === '/room/photos' && request.method === 'POST') return await uploadRoomPhoto(request, env);
      const surpriseOpen = url.pathname.match(/^\/surprises\/(\d+)\/open$/);
      if (surpriseOpen && request.method === 'POST') return await openSurprise(request, env, Number(surpriseOpen[1]));
      const roomPhotoRoute = url.pathname.match(/^\/room\/photos\/(\d+)$/);
      if (roomPhotoRoute && request.method === 'GET') return await roomPhoto(request, env, Number(roomPhotoRoute[1]));
      if (roomPhotoRoute && request.method === 'DELETE') return await removeRoomPhoto(request, env, Number(roomPhotoRoute[1]));
      if (url.pathname === '/state' && request.method === 'GET') return await readState(request, env);
      if (url.pathname === '/state' && request.method === 'PUT') return await writeState(request, env);
      return json(request, env, {error: '接口不存在。'}, 404);
    } catch (error) {
      console.error(JSON.stringify({event: 'worker_error', path: new URL(request.url).pathname, message: error?.message || String(error)}));
      return json(request, env, {error: '同步服务暂时出了点问题，请稍后再试。'}, 500);
    }
  }
};
