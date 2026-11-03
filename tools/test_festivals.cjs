const assert = require('node:assert/strict');
const Festivals = require('../festival.js');

function shanghaiDate(value) {
  return new Date(`${value}T12:00:00+08:00`);
}

const cases = [
  ['2026-01-01', 'newyear'],
  ['2026-02-17', 'spring'],
  ['2026-03-03', 'lantern'],
  ['2026-04-04', 'qingming'],
  ['2026-06-19', 'dragonboat'],
  ['2026-08-19', 'qixi'],
  ['2026-09-25', 'midautumn'],
  ['2026-10-01', 'national'],
  ['2026-11-07', 'lidong'],
  ['2026-11-08', 'lidong'],
  ['2026-12-22', 'dongzhi']
];

for (const [date, expected] of cases) {
  assert.equal(Festivals.info(shanghaiDate(date))?.slug, expected, `${date} should use ${expected}`);
}

assert.equal(Festivals.info(shanghaiDate('2026-11-03')), null, 'ordinary dates should keep the normal theme');
for (const theme of Object.values(Festivals.THEMES)) {
  assert.ok(theme.title && theme.blessing && theme.signOff && theme.ritual, `${theme.slug} copy is incomplete`);
  assert.equal(theme.decorations.length, 3, `${theme.slug} needs three decorative marks`);
}
assert.equal(Festivals.THEMES.lidong.mascot, 'assets/festivals/mascot-lidong.png');
console.log(`Festival calendar OK: ${cases.length} date checks, ${Object.keys(Festivals.THEMES).length} themes`);
