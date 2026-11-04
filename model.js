(function (root) {
  'use strict';
  const VERSION = 1;
  const APP_ID = 'wordsequence-public';
  const DB_NAME = 'wordsequence-public-v1';
  const STORE_NAME = 'records';
  const LONG_TERM_GAP_MS = 8 * 60 * 60 * 1000;
  const DEFAULT_SETTINGS = Object.freeze({dailyTarget: 30, batchSize: 10, delayMinutes: 20, rate: 1, accent: 'en-US', voiceURI: '', autoPlay: true});
  const MAX_WORDS = 50000, MAX_DECK_WORDS = 20000, MAX_DECKS = 100;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !['__proto__', 'prototype', 'constructor'].includes(value);
  const validStamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
  function day(value = Date.now()) { const d = value instanceof Date ? value : new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00')) && day(new Date(value + 'T12:00:00')) === value; }
  function addDays(value, count) { const d = new Date(value + 'T12:00:00'); d.setDate(d.getDate() + count); return day(d); }
  function daysBetween(from, to) { return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000); }
  function checkStamp(now) { if (!validStamp(now)) throw new Error('学习时间无效。'); }
  function uuid(prefix) { return prefix + '-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
  function fresh() { return {version: VERSION, decks: [], settings: {...DEFAULT_SETTINGS}, activeDeckId: null, studyDays: [], dailyLog: {}, dailyPlan: null}; }
  function markStudyDay(state, now = Date.now()) { checkStamp(now); const today = day(now); if (!Array.isArray(state.studyDays)) state.studyDays = []; if (!state.studyDays.includes(today)) { state.studyDays.push(today); state.studyDays.sort(); if (state.studyDays.length > 3660) state.studyDays.splice(0, state.studyDays.length - 3660); } return state.studyDays; }
  function streak(state, now = Date.now()) { const days = new Set(Array.isArray(state.studyDays) ? state.studyDays : []); let cursor = day(now), count = 0; if (!days.has(cursor)) cursor = addDays(cursor, -1); while (days.has(cursor)) { count++; cursor = addDays(cursor, -1); } return {count, today: days.has(day(now)), total: days.size}; }
  function dailyEntry(state, now = Date.now()) {
    checkStamp(now); const key = day(now);
    if (!isRecord(state.dailyLog)) state.dailyLog = {};
    if (!isRecord(state.dailyLog[key])) state.dailyLog[key] = {activeMs: 0, attempts: 0, correct: 0, wrong: 0};
    const keys = Object.keys(state.dailyLog).filter(validDay).sort();
    if (keys.length > 400) for (const old of keys.slice(0, keys.length - 400)) delete state.dailyLog[old];
    return state.dailyLog[key];
  }
  function recordStudyTime(state, elapsedMs, now = Date.now()) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('学习时长无效。');
    const entry = dailyEntry(state, now); entry.activeMs = Math.min(24 * 60 * 60 * 1000, entry.activeMs + Math.min(5 * 60 * 1000, Math.round(elapsedMs)));
    if (elapsedMs >= 5000) markStudyDay(state, now);
    return entry;
  }
  function recordDailyAnswer(state, right, now = Date.now()) {
    if (typeof right !== 'boolean') throw new Error('答题结果必须是对或错。');
    const entry = dailyEntry(state, now); entry.attempts++; entry.correct += right ? 1 : 0; entry.wrong += right ? 0 : 1; markStudyDay(state, now); return entry;
  }
  function cleanText(value, max, label, empty = true) {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error(label + '格式不正确。');
    return value.trim();
  }
  function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(label + '超出允许范围。'); return value; }
  function normalizedWord(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
  function validatedSettings(raw = {}) {
    if (!isRecord(raw)) throw new Error('学习设置格式不正确。');
    const out = {...DEFAULT_SETTINGS};
    for (const [key, min, max] of [['dailyTarget', 5, 200], ['batchSize', 5, 30], ['delayMinutes', 5, 120]]) if (own(raw, key)) out[key] = integer(raw[key], min, max, '学习设置 ' + key);
    if (own(raw, 'rate')) { if (!Number.isFinite(raw.rate) || raw.rate < 0.5 || raw.rate > 1.5) throw new Error('读音速度需在 0.5 到 1.5 倍之间。'); out.rate = raw.rate; }
    if (own(raw, 'accent')) { if (!['en-US', 'en-GB'].includes(raw.accent)) throw new Error('读音口音设置不正确。'); out.accent = raw.accent; }
    if (own(raw, 'voiceURI')) out.voiceURI = cleanText(raw.voiceURI, 1000, '朗读声音');
    if (own(raw, 'autoPlay')) { if (typeof raw.autoPlay !== 'boolean') throw new Error('自动朗读设置不正确。'); out.autoPlay = raw.autoPlay; }
    return out;
  }
  function settingsDelay(settings) { return validatedSettings(settings || DEFAULT_SETTINGS).delayMinutes * 60000; }
  function validateWord(row, id) {
    if (!isRecord(row)) throw new Error('词表中有无法读取的条目。');
    const word = cleanText(row.word, 180, '英文词汇', false).replace(/\s+/g, ' ');
    if (!/[a-zA-Z]/.test(word)) throw new Error('词汇必须包含英文：' + word);
    if (!safeId(id)) throw new Error('词汇编号无效。');
    const out = {id, word, meaning: cleanText(row.meaning ?? '', 2000, '中文释义'), phonetic: cleanText(row.phonetic ?? '', 300, '音标'), sourceLine: cleanText(row.sourceLine ?? '', 6000, '原文行')};
    for (const key of ['meaningSource', 'audioKey']) if (row[key] != null) out[key] = cleanText(row[key], 500, key);
    if (row.page != null) out.page = integer(row.page, 1, 100000, '页码');
    return out;
  }
  function createDeck(title, rows, now = Date.now()) {
    checkStamp(now);
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_DECK_WORDS) throw new Error('每个词表需要 1 到 20,000 个词。');
    const words = [], seen = new Map();
    for (const row of rows) {
      const item = validateWord(row, uuid('w')), key = normalizedWord(item.word);
      if (seen.has(key)) { const previous = seen.get(key); if (!previous.meaning && item.meaning) previous.meaning = item.meaning; continue; }
      seen.set(key, item); words.push(item);
    }
    return {id: uuid('deck'), title: cleanText(title, 200, '词表名称', false), createdAt: now, updatedAt: now, sourceName: '', sourceType: '', words, progress: {}, session: null};
  }
  function updateDeckWords(deck, rows, now = Date.now()) {
    checkStamp(now);
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_DECK_WORDS) throw new Error('每个词表需要 1 到 20,000 个词。');
    const oldById = new Map(deck.words.map(w => [w.id, w])), oldByWord = new Map(deck.words.map(w => [normalizedWord(w.word), w]));
    const words = [], progress = {}, usedIds = new Set(), usedWords = new Set();
    for (const row of rows) {
      const prior = oldById.get(row?.id) || (typeof row?.word === 'string' ? oldByWord.get(normalizedWord(row.word)) : null);
      const id = prior?.id || uuid('w'), item = validateWord(row, id), key = normalizedWord(item.word);
      if (usedIds.has(id) || usedWords.has(key)) continue;
      usedIds.add(id); usedWords.add(key); words.push(item);
      if (prior && normalizedWord(prior.word) === key && prior.meaning.trim() === item.meaning && own(deck.progress, id)) progress[id] = deck.progress[id];
    }
    if (!words.length) throw new Error('词表至少需要一个有效英文词汇。');
    deck.words = words; deck.progress = progress; deck.session = null; deck.updatedAt = now;
    return deck;
  }
  function freshProgress() { return {seen: false, firstSeenAt: null, firstSeenDate: null, lastSeenAt: null, attempts: 0, correct: 0, wrong: 0, due: null, repetitions: 0, intervalDays: 0, ease: 2.5, lapses: 0, lastLapseDate: null, lastScheduled: null, lastReviewed: null, delayedDueAt: null, shortDelayMs: 20 * 60000, checkedAt: null, longTermSuccesses: 0, lastLongTermSuccessDate: null}; }
  function wordState(deck, id) {
    if (!safeId(id) || !deck.words.some(w => w.id === id)) throw new Error('这个词已不在当前词表中。');
    if (!own(deck.progress, id)) deck.progress[id] = freshProgress();
    return deck.progress[id];
  }
  function markSeen(w, now) { if (!w.seen) { w.seen = true; w.firstSeenAt = now; w.firstSeenDate = day(now); } }
  function see(deck, id, settings = DEFAULT_SETTINGS, now = Date.now()) {
    checkStamp(now); const w = wordState(deck, id); markSeen(w, now); w.lastSeenAt = now;
    if (w.delayedDueAt !== null) { w.shortDelayMs = settingsDelay(settings); w.delayedDueAt = now + w.shortDelayMs; }
    return reviewInfo(deck, id, now);
  }
  function answer(deck, id, right, settings = DEFAULT_SETTINGS, now = Date.now()) {
    checkStamp(now); if (typeof right !== 'boolean') throw new Error('答题结果必须是对或错。');
    const delay = settingsDelay(settings), today = day(now), w = wordState(deck, id);
    const previousScheduled = w.lastScheduled, previouslyDue = validDay(w.due) && w.due <= today;
    const gap = w.lastSeenAt === null ? null : now - w.lastSeenAt;
    const shortReady = w.delayedDueAt !== null && now >= w.delayedDueAt && gap !== null && gap >= w.shortDelayMs;
    markSeen(w, now); w.attempts++; w.correct += right ? 1 : 0; w.wrong += right ? 0 : 1;
    if (!right) {
      if (w.lastLapseDate !== today) { w.ease = Math.max(1.3, Math.round((w.ease - 0.54) * 100) / 100); w.lapses++; w.lastLapseDate = today; }
      w.repetitions = 0; w.intervalDays = 0; w.due = today; w.lastScheduled = null;
      w.lastSeenAt = now; w.shortDelayMs = delay; w.delayedDueAt = now + delay;
    } else if (w.lastScheduled !== today && (!w.due || w.due <= today)) {
      if (w.repetitions > 0 && gap !== null && gap < LONG_TERM_GAP_MS) {
        w.intervalDays = 1; w.repetitions = 1; w.shortDelayMs = delay; w.delayedDueAt = now + delay;
      } else {
        w.intervalDays = w.repetitions === 0 ? 1 : w.repetitions === 1 ? 6 : Math.min(36500, Math.ceil(w.intervalDays * w.ease));
        w.repetitions++;
      }
      w.due = addDays(today, w.intervalDays); w.lastScheduled = today;
    }
    if (right) {
      if (shortReady) { w.checkedAt = now; w.delayedDueAt = null; }
      else if (w.checkedAt === null && w.delayedDueAt === null) { if (w.lastSeenAt === null) w.lastSeenAt = now; w.shortDelayMs = delay; w.delayedDueAt = now + delay; }
      if (previouslyDue && previousScheduled && previousScheduled < today && gap !== null && gap >= LONG_TERM_GAP_MS && w.lastLongTermSuccessDate !== today) { w.longTermSuccesses++; w.lastLongTermSuccessDate = today; }
    }
    w.lastReviewed = today;
    return reviewInfo(deck, id, now);
  }
  function reviewInfo(deck, id, now = Date.now()) {
    const w = own(deck.progress, id) ? deck.progress[id] : freshProgress(), today = day(now);
    const daysUntil = validDay(w.due) ? daysBetween(today, w.due) : null;
    const isDayDue = daysUntil !== null && daysUntil <= 0, isShortDue = w.delayedDueAt !== null && now >= w.delayedDueAt;
    const overdueDays = daysUntil === null ? 0 : Math.max(0, -daysUntil), isDue = isDayDue || isShortDue;
    return {due: w.due, isDue, isDayDue, isShortDue, shortDueAt: w.delayedDueAt, shortMinutesUntil: w.delayedDueAt === null ? null : Math.max(0, Math.ceil((w.delayedDueAt - now) / 60000)), checkedAt: w.checkedAt, daysUntil, overdueDays, intervalDays: w.intervalDays, repetitions: w.repetitions, ease: w.ease, lapses: w.lapses, longTermSuccesses: w.longTermSuccesses, priority: isDue ? 100000 + overdueDays * 100 + (isShortDue ? 50 : 0) + Math.min(49, w.lapses * 3 + w.wrong) : -1};
  }
  function dueWords(deck, now = Date.now()) {
    return deck.words.filter(w => w.meaning.trim()).map(word => ({word, info: reviewInfo(deck, word.id, now)})).filter(x => x.info.isDue).sort((a, b) => b.info.priority - a.info.priority || (deck.progress[a.word.id]?.lastSeenAt || 0) - (deck.progress[b.word.id]?.lastSeenAt || 0)).map(x => x.word);
  }
  function stats(deck, settings = DEFAULT_SETTINGS, now = Date.now()) {
    const today = day(now), config = validatedSettings(settings), progress = deck.words.map(w => deck.progress[w.id]).filter(Boolean);
    const seen = progress.filter(w => w.seen).length, newToday = progress.filter(w => w.firstSeenDate === today).length;
    const pending = progress.filter(w => w.delayedDueAt !== null && w.delayedDueAt > now).map(w => w.delayedDueAt);
    return {total: deck.words.length, seen, unseen: deck.words.length - seen, newToday, remainingToday: Math.max(0, config.dailyTarget - newToday), due: dueWords(deck, now).length, delayedPending: pending.length, nextDelayedAt: pending.length ? Math.min(...pending) : null, longTerm: progress.filter(w => w.longTermSuccesses > 0).length, missingMeanings: deck.words.filter(w => !w.meaning.trim()).length, mistakes: progress.filter(w => w.wrong > 0).length};
  }
  function nextNewWords(deck, settings = DEFAULT_SETTINGS, now = Date.now()) { const remaining = stats(deck, settings, now).remainingToday; return deck.words.filter(w => !deck.progress[w.id]?.seen && w.meaning.trim()).slice(0, remaining); }
  function recommendDailyPlans(state, deck, settings = DEFAULT_SETTINGS, now = Date.now()) {
    const today = day(now), config = validatedSettings(settings), recent = [];
    for (let offset = 1; offset <= 7; offset++) { const entry = state.dailyLog?.[addDays(today, -offset)]; if (isRecord(entry)) recent.push(entry); }
    const attempts = recent.reduce((sum, entry) => sum + (entry.attempts || 0), 0);
    const correct = recent.reduce((sum, entry) => sum + (entry.correct || 0), 0);
    const accuracy = attempts ? correct / attempts : null;
    const activeDays = recent.filter(entry => (entry.activeMs || 0) >= 60000);
    const averageMinutes = activeDays.length ? activeDays.reduce((sum, entry) => sum + entry.activeMs, 0) / activeDays.length / 60000 : 0;
    const due = deck ? dueWords(deck, now).length : 0;
    let normal = Math.min(25, Math.max(10, Math.round(config.dailyTarget / 5) * 5));
    if (!attempts) normal = 15;
    else if (accuracy >= .88) normal += 5;
    else if (accuracy < .68) normal -= 5;
    if (due >= 20) normal -= 5;
    if (averageMinutes >= 38) normal -= 5;
    normal = Math.min(30, Math.max(10, Math.round(normal / 5) * 5));
    const targets = {light: Math.max(5, normal - 5), normal, sprint: Math.min(40, normal + 10)};
    let recommended = 'normal', reason = '最近节奏比较稳定，今天按适中的量走就刚刚好。';
    if (due >= 20) { recommended = 'light'; reason = `今天有 ${due} 个词等复习，先把旧朋友照顾好，新词少一点也算完成。`; }
    else if (accuracy !== null && accuracy < .68) { recommended = 'light'; reason = '最近正确率有点累，今天少背一点、记牢一点更划算。'; }
    else if (averageMinutes >= 38) { recommended = 'light'; reason = '最近每天花的时间已经不少，今天给大脑留一点余地。'; }
    else if (accuracy !== null && accuracy >= .9 && due < 5 && averageMinutes > 0 && averageMinutes < 25) { recommended = 'sprint'; reason = '最近答得又稳又快，今天状态允许的话可以多走一小段。'; }
    const names = {light: '轻松', normal: '适中', sprint: '冲刺'};
    const plans = Object.keys(targets).map(mode => ({mode, name: names[mode], target: targets[mode], estimatedMinutes: Math.max(5, Math.round((targets[mode] * 1.1 + Math.min(due, 30) * .3) / 5) * 5)}));
    return {date: today, recommended, reason, accuracy, attempts, averageMinutes: Math.round(averageMinutes), due, plans};
  }
  function dailyPlan(state, deck, settings = DEFAULT_SETTINGS, now = Date.now()) {
    const recommendation = recommendDailyPlans(state, deck, settings, now);
    const saved = state.dailyPlan;
    if (isRecord(saved) && saved.date === recommendation.date && ['light', 'normal', 'sprint'].includes(saved.mode)) {
      const plan = recommendation.plans.find(item => item.mode === saved.mode);
      if (plan) return {...recommendation, selected: saved.mode, target: plan.target, estimatedMinutes: plan.estimatedMinutes};
    }
    const plan = recommendation.plans.find(item => item.mode === recommendation.recommended) || recommendation.plans[1];
    return {...recommendation, selected: plan.mode, target: plan.target, estimatedMinutes: plan.estimatedMinutes};
  }
  function setDailyPlan(state, mode, deck, settings = DEFAULT_SETTINGS, now = Date.now()) {
    if (!['light', 'normal', 'sprint'].includes(mode)) throw new Error('请选择轻松、适中或冲刺。');
    const recommendation = recommendDailyPlans(state, deck, settings, now), plan = recommendation.plans.find(item => item.mode === mode);
    state.dailyPlan = {date: recommendation.date, mode, target: plan.target}; return dailyPlan(state, deck, settings, now);
  }
  function weeklyReport(state, now = Date.now()) {
    const end = day(now), start = addDays(end, -6), days = [];
    const allProgress = [];
    for (const deck of state.decks || []) for (const word of deck.words || []) { const progress = deck.progress?.[word.id]; if (progress) allProgress.push({word, deck, progress}); }
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(start, offset), entry = state.dailyLog?.[date] || {};
      days.push({date, activeMinutes: Math.round((entry.activeMs || 0) / 60000), attempts: entry.attempts || 0, correct: entry.correct || 0, wrong: entry.wrong || 0, newWords: allProgress.filter(item => item.progress.firstSeenDate === date).length, remembered: allProgress.filter(item => item.progress.lastLongTermSuccessDate === date).length});
    }
    const attempts = days.reduce((sum, item) => sum + item.attempts, 0), correct = days.reduce((sum, item) => sum + item.correct, 0);
    const studyDays = days.filter(item => (state.studyDays || []).includes(item.date)).length;
    const hardest = allProgress.filter(item => item.progress.wrong > 0).sort((a, b) => b.progress.wrong - a.progress.wrong || (a.progress.correct / Math.max(1, a.progress.attempts)) - (b.progress.correct / Math.max(1, b.progress.attempts))).slice(0, 5).map(item => ({word: item.word.word, meaning: item.word.meaning, wrong: item.progress.wrong, attempts: item.progress.attempts, deck: item.deck.title}));
    const newWords = days.reduce((sum, item) => sum + item.newWords, 0), remembered = days.reduce((sum, item) => sum + item.remembered, 0), minutes = days.reduce((sum, item) => sum + item.activeMinutes, 0);
    let summary = '这一周从一个词开始也很好，小紫怪会在这里等你。';
    if (studyDays >= 6) summary = '这一周你几乎每天都来见它们，稳定本身就是很厉害的能力，今天也可以放心休息。';
    else if (studyDays >= 3) summary = '不需要每天拼命，能一次次回来，就已经在把陌生慢慢变成熟悉。';
    else if (studyDays > 0) summary = '哪怕只学了几天，这些认真花过的时间都算数；下周继续轻轻往前走。';
    return {start, end, days, studyDays, newWords, remembered, minutes, attempts, accuracy: attempts ? correct / attempts : null, hardest, summary};
  }
  function shuffle(items, random = Math.random) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
  function meaningTokens(s) { return s.replace(/\([^)]*\)|（[^）]*）/g, '').replace(/\b(?:n|v|vt|vi|adj|adv|prep|conj)\./g, '').split(/[；;，,、\n]/).map(t => t.trim().replace(/的$/, '')).filter(t => t.length >= 2); }
  function overlap(a, b) { return meaningTokens(a).some(x => meaningTokens(b).some(y => x === y || x.includes(y) || y.includes(x))); }
  function chooseOptions(word, words, random = Math.random) {
    if (!word.meaning?.trim()) return [];
    const picked = [word], pool = shuffle(words.filter(w => w.id !== word.id && normalizedWord(w.word) !== normalizedWord(word.word) && w.meaning?.trim()), random);
    for (const w of pool) { if (picked.every(p => p.meaning.trim() !== w.meaning.trim() && !overlap(p.meaning, w.meaning))) picked.push(w); if (picked.length === 4) break; }
    return shuffle(picked.map(w => ({id: w.id, text: w.meaning})), random);
  }
  function validateProgress(raw) {
    if (!isRecord(raw)) throw new Error('词汇进度损坏。'); const w = freshProgress();
    if (own(raw, 'seen')) { if (typeof raw.seen !== 'boolean') throw new Error('学习状态格式不正确。'); w.seen = raw.seen; }
    for (const key of ['attempts', 'correct', 'wrong', 'repetitions', 'intervalDays', 'lapses', 'longTermSuccesses']) if (own(raw, key)) w[key] = integer(raw[key], 0, key === 'intervalDays' ? 36500 : 1000000000, '词汇进度');
    if (w.correct + w.wrong !== w.attempts) throw new Error('答题次数与正确、错误次数不一致。');
    for (const key of ['firstSeenAt', 'lastSeenAt', 'delayedDueAt', 'checkedAt']) if (raw[key] != null) { if (!validStamp(raw[key])) throw new Error('学习时间记录无效。'); w[key] = raw[key]; }
    for (const key of ['firstSeenDate', 'due', 'lastScheduled', 'lastReviewed', 'lastLapseDate', 'lastLongTermSuccessDate']) if (raw[key] != null) { if (!validDay(raw[key])) throw new Error('复习日期记录无效。'); w[key] = raw[key]; }
    if (own(raw, 'ease')) { if (!Number.isFinite(raw.ease) || raw.ease < 1.3 || raw.ease > 3) throw new Error('复习难度记录无效。'); w.ease = raw.ease; }
    if (own(raw, 'shortDelayMs')) w.shortDelayMs = integer(raw.shortDelayMs, 5 * 60000, 120 * 60000, '延迟复习间隔');
    if (w.seen && (w.firstSeenAt === null || !w.firstSeenDate)) throw new Error('缺少首次学习时间。');
    if (!w.seen && (w.firstSeenAt !== null || w.firstSeenDate !== null || w.attempts > 0)) throw new Error('首次学习状态不一致。');
    return w;
  }
  function validateSession(raw, words) {
    if (raw == null) return null;
    if (!isRecord(raw) || !['learn', 'review'].includes(raw.kind) || !['learn', 'quiz', 'repair', 'done'].includes(raw.phase)) throw new Error('未完成练习记录损坏。');
    const known = new Map(words.map(w => [w.id, w]));
    function ids(value, label, empty = false) { if (!Array.isArray(value) || (!empty && !value.length) || value.length > MAX_DECK_WORDS || value.some(id => !safeId(id) || !known.has(id)) || new Set(value).size !== value.length) throw new Error(label + '中的词汇编号无效。'); return [...value]; }
    const out = {name: cleanText(raw.name ?? '', 300, '练习名称'), kind: raw.kind, phase: raw.phase, primaryIds: ids(raw.primaryIds, '原始练习'), allIds: ids(raw.allIds, '完整练习'), ids: ids(raw.ids, '当前练习'), index: integer(raw.index, 0, raw.phase === 'done' ? raw.ids.length : raw.ids.length - 1, '当前题号')};
    if (out.primaryIds.some(id => !out.allIds.includes(id)) || out.ids.some(id => !out.allIds.includes(id))) throw new Error('当前练习与词汇范围不一致。');
    for (const key of ['revealed', 'recalled', 'guessed']) { if (raw[key] != null && typeof raw[key] !== 'boolean') throw new Error('练习状态格式不正确。'); out[key] = raw[key] === true; }
    out.selected = raw.selected ?? null; if (out.selected !== null && !known.has(out.selected)) throw new Error('选中的答案编号无效。');
    out.wrongIds = ids(raw.wrongIds ?? [], '错词练习', true); if (out.wrongIds.some(id => !out.allIds.includes(id))) throw new Error('错词超出本轮练习范围。');
    out.options = null;
    if (raw.options != null) { if (!Array.isArray(raw.options) || raw.options.length < 1 || raw.options.length > 4 || raw.options.some(o => !isRecord(o) || !known.has(o.id) || typeof o.text !== 'string' || o.text !== known.get(o.id).meaning) || new Set(raw.options.map(o => o.id)).size !== raw.options.length) throw new Error('选项记录损坏。'); out.options = raw.options.map(o => ({id: o.id, text: o.text})); }
    out.firstCorrect = integer(raw.firstCorrect ?? 0, 0, out.allIds.length, '首次正确数'); out.firstTotal = integer(raw.firstTotal ?? 0, 0, out.allIds.length, '首次作答数');
    if (out.firstCorrect > out.firstTotal) throw new Error('首次正确数不能超过作答数。');
    out.round = integer(raw.round ?? 0, 0, 1000000, '纠错轮数');
    return out;
  }
  function validate(raw) {
    if (!isRecord(raw) || raw.version !== VERSION || !Array.isArray(raw.decks) || raw.decks.length > MAX_DECKS) throw new Error('不是受支持的词序公开版备份。');
    const state = fresh(); state.settings = validatedSettings(raw.settings); const deckIds = new Set(); let total = 0;
    for (const source of raw.decks) {
      if (!isRecord(source) || !safeId(source.id) || deckIds.has(source.id) || !Array.isArray(source.words) || !source.words.length || source.words.length > MAX_DECK_WORDS || !isRecord(source.progress)) throw new Error('词表记录不完整或编号重复。');
      deckIds.add(source.id); total += source.words.length; if (total > MAX_WORDS) throw new Error('备份超过 50,000 个词的容量上限。');
      const createdAt = source.createdAt; if (!validStamp(createdAt) || (source.updatedAt != null && !validStamp(source.updatedAt))) throw new Error('词表创建时间无效。');
      const d = {id: source.id, title: cleanText(source.title, 200, '词表名称', false), createdAt, updatedAt: source.updatedAt ?? createdAt, sourceName: cleanText(source.sourceName ?? '', 300, '来源文件名'), sourceType: cleanText(source.sourceType ?? '', 100, '来源类型'), words: [], progress: {}, session: null}, wordIds = new Set();
      for (const row of source.words) { const word = validateWord(row, row?.id); if (wordIds.has(word.id)) throw new Error('词汇编号重复。'); wordIds.add(word.id); d.words.push(word); }
      for (const [id, p] of Object.entries(source.progress)) { if (!safeId(id) || !wordIds.has(id)) throw new Error('进度包含不属于当前词表的词。'); d.progress[id] = validateProgress(p); }
      d.session = validateSession(source.session, d.words); state.decks.push(d);
    }
    if (raw.activeDeckId != null && !deckIds.has(raw.activeDeckId)) throw new Error('当前词表已经不存在。');
    state.activeDeckId = raw.activeDeckId ?? null;
    if (raw.studyDays != null) { if (!Array.isArray(raw.studyDays) || raw.studyDays.length > 3660 || raw.studyDays.some(d => !validDay(d))) throw new Error('打卡记录格式不正确。'); state.studyDays = [...new Set(raw.studyDays)].sort(); }
    if (raw.dailyLog != null) {
      if (!isRecord(raw.dailyLog) || Object.keys(raw.dailyLog).length > 400) throw new Error('每日学习记录格式不正确。');
      state.dailyLog = {};
      for (const [date, entry] of Object.entries(raw.dailyLog)) {
        if (!validDay(date) || !isRecord(entry)) throw new Error('每日学习记录格式不正确。');
        const item = {};
        for (const [key, max] of [['activeMs', 86400000], ['attempts', 1000000], ['correct', 1000000], ['wrong', 1000000]]) item[key] = integer(entry[key] ?? 0, 0, max, '每日学习记录');
        if (item.correct + item.wrong !== item.attempts) throw new Error('每日答题次数记录不一致。');
        state.dailyLog[date] = item;
      }
    }
    if (raw.dailyPlan != null) {
      if (!isRecord(raw.dailyPlan) || !validDay(raw.dailyPlan.date) || !['light', 'normal', 'sprint'].includes(raw.dailyPlan.mode)) throw new Error('每日任务选择格式不正确。');
      state.dailyPlan = {date: raw.dailyPlan.date, mode: raw.dailyPlan.mode, target: integer(raw.dailyPlan.target, 5, 40, '每日任务量')};
    }
    return state;
  }
  function exportBackup(state) { return JSON.stringify({app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(), state: validate(state)}, null, 2); }
  function importBackup(text) {
    if (typeof text !== 'string' || text.length > 50 * 1024 * 1024) throw new Error('备份文件过大或格式不正确。');
    let data; try { data = JSON.parse(text); } catch (_) { throw new Error('无法读取备份，请选择词序公开版导出的 JSON 文件。'); }
    if (!isRecord(data) || data.app !== APP_ID || data.version !== VERSION) throw new Error('请选择词序公开版导出的学习备份。');
    return validate(data.state);
  }
  let databasePromise, saveQueue = Promise.resolve();
  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('当前浏览器不支持本地学习数据存储，请换用新版 Chrome、Edge 或 Safari。')); return; }
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); databasePromise = null; }; resolve(request.result); };
      request.onerror = () => reject(new Error('无法打开学习记录，请检查浏览器的存储权限。'));
      request.onblocked = () => reject(new Error('学习记录正在其他页面中使用，请关闭旧页面后重试。'));
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }
  async function load() {
    const db = await openDatabase();
    const data = await new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readonly'), req = tx.objectStore(STORE_NAME).get('main'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('读取学习记录失败；已有数据不会被覆盖。')); });
    return data === undefined ? fresh() : validate(data);
  }
  function save(state) {
    let snapshot; try { snapshot = validate(state); } catch (error) { return Promise.reject(error); }
    const operation = saveQueue.catch(() => {}).then(async () => {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(snapshot, 'main');
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('保存失败，可能是浏览器空间不足。请先导出备份；旧记录未被替换。'));
      });
      return snapshot;
    });
    saveQueue = operation; return operation;
  }
  const api = {VERSION, APP_ID, DB_NAME, DEFAULT_SETTINGS, LONG_TERM_GAP_MS, day, addDays, markStudyDay, streak, recordStudyTime, recordDailyAnswer, recommendDailyPlans, dailyPlan, setDailyPlan, weeklyReport, validDay, daysBetween, fresh, createDeck, updateDeckWords, wordState, see, answer, reviewInfo, dueWords, nextNewWords, stats, shuffle, overlap, chooseOptions, validate, validatedSettings, exportBackup, importBackup, load, save};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PublicModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
