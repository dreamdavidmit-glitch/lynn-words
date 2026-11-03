const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const christmas = require('../christmas.js');

assert.deepEqual(Object.keys(christmas.DAYS).map(Number), [24, 25, 26, 27, 28, 29, 30]);

for (let day = 24; day <= 30; day += 1) {
  const date = new Date(Date.UTC(2026, 11, day, 4));
  const info = christmas.info(date);
  assert.equal(info?.active, true);
  assert.equal(info?.day, day);
}

for (const [month, day] of [[11, 23], [11, 31], [0, 1], [6, 25]]) {
  const date = new Date(Date.UTC(2026, month, day, 4));
  assert.equal(christmas.info(date), null);
}

const audio = path.join(__dirname, '..', 'assets', 'christmas', 'jingle-bells.mp3');
assert.ok(fs.statSync(audio).size > 100_000, 'Christmas audio should be present and non-empty');

console.log('Christmas date guard and audio asset OK');
