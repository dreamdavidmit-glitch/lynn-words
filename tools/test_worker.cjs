const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function userToken(secret, generation) {
  const payload = base64url(JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: 'worker-test',
    role: 'user',
    generation
  }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function mockDB(row, generation) {
  return {
    prepare(sql) {
      return {
        async first() {
          if (sql.includes('auth_control')) return {generation};
          if (sql.includes('sync_state')) return row;
          throw new Error(`Unexpected query: ${sql}`);
        }
      };
    }
  };
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'src', 'worker.js'), 'utf8');
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
  const secret = 'test-session-secret-with-enough-entropy';
  const generation = 3;
  const payload = Uint8Array.from([31, 139, 8, 0, 76, 121, 110, 110, 0, 255]);
  const env = {
    SESSION_SECRET: secret,
    ALLOWED_ORIGIN: 'https://example.test',
    DB: mockDB({
      revision: 2,
      updated_at: '2026-11-03T15:33:17.423Z',
      device_id: 'test-device',
      encoding: 'gzip',
      payload: Array.from(payload)
    }, generation)
  };
  const request = new Request('https://sync.example.test/state', {
    headers: {
      Authorization: `Bearer ${userToken(secret, generation)}`,
      Origin: 'https://example.test'
    }
  });
  const response = await worker.fetch(request, env);
  const body = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Payload-Encoding'), 'gzip');
  assert.deepEqual(body, payload, 'D1 BLOB arrays must be returned as their original bytes');
  console.log(`Worker BLOB response OK: ${body.byteLength} bytes`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
