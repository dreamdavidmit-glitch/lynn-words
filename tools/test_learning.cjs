const assert = require('node:assert/strict');
const M = require('../model.js');
const X = require('../extract.js');

const now = new Date(2026, 10, 4, 18, 0).getTime();
const state = M.fresh();
const deck = M.createDeck('测试词本', [
  {word: 'apple', meaning: '苹果'},
  {word: 'book', meaning: '书'},
  {word: 'gentle', meaning: '温柔的'}
], now - 86400000);
state.decks.push(deck);
state.activeDeckId = deck.id;

const first = M.dailyPlan(state, deck, state.settings, now);
assert.equal(first.selected, 'normal');
assert.equal(first.target, 15, '没有历史时默认适中应为 15 个，而不是固定 30 个');
assert.equal(state.settings.autoAdvance, false, '默认应保留手动点击下一题的思考缓冲');

for (let offset = 1; offset <= 3; offset++) {
  const date = now - offset * 86400000;
  for (let index = 0; index < 5; index++) M.recordDailyAnswer(state, index === 0, date);
  M.recordStudyTime(state, 40 * 60000, date);
}
const lighter = M.dailyPlan(state, deck, state.settings, now);
assert.equal(lighter.recommended, 'light');
assert.ok(lighter.target < lighter.plans.find(plan => plan.mode === 'normal').target);

M.see(deck, deck.words[0].id, state.settings, now);
M.answer(deck, deck.words[0].id, false, state.settings, now);
M.recordDailyAnswer(state, false, now);
M.answer(deck, deck.words[0].id, false, state.settings, now + 1000, {responseMs: 9000, confusedWith: deck.words[1].id});
M.answer(deck, deck.words[0].id, false, state.settings, now + 2000, {responseMs: 10000, confusedWith: deck.words[1].id});
const rescue = M.rescueWords(state, deck, now + 3000);
assert.equal(rescue[0].word.word, 'apple');
assert.ok(rescue[0].reasons.includes('连续答错'));
assert.ok(rescue[0].reasons.includes('反应偏慢'));
assert.ok(rescue[0].reasons.includes('容易混淆'));
M.markRescueDone(state, [deck.words[0].id], now + 3000);
assert.equal(M.rescueWords(state, deck, now + 3000).some(item => item.word.id === deck.words[0].id), false);
const report = M.weeklyReport(state, now);
assert.ok(report.studyDays >= 1);
assert.ok(report.newWords >= 1);
assert.equal(report.hardest[0].word, 'apple');
const calendar = M.activityCalendar(state, now);
assert.ok(calendar.cells.length >= 28 && calendar.cells.length <= 42);
assert.equal(calendar.cells.filter(cell => cell.today).length, 1);
const remote = M.validate(state);
M.see(remote.decks[0], remote.decks[0].words[1].id, remote.settings, now + 4000);
M.answer(remote.decks[0], remote.decks[0].words[1].id, true, remote.settings, now + 5000);
const merged = M.mergeStates(state, remote);
assert.equal(merged.decks[0].progress[remote.decks[0].words[1].id].attempts, 1);
assert.doesNotThrow(() => M.validate(state));

const rows = X.audit(X.parse('apple\t苹果\napple\t苹果\nhello world'));
assert.equal(rows.length, 2);
assert.equal(rows[0].duplicateCount, 2);
assert.equal(rows[0].confidence, 'medium');
assert.equal(rows[1].needsReview, true);
assert.ok(rows[1].issues.includes('缺少中文意思'));

console.log('Smart plans, rescue queue, calendar, merge, and import audit OK');
