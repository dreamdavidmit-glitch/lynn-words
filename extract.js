(function (root) {
  'use strict';
  const HAN = /[\u3400-\u9fff]/;
  const POS = /\b(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|num|art|det|aux|phr)\s*[.．]\s*/gi;
  const HEADER = /^(?:english(?:\s+words?)?|words?|vocabulary|word\s*list|meaning|definition|translation|pronunciation|phonetic|中文(?:释义)?|词汇(?:表)?|单词|释义|音标|词性|序号|页码|list\s*\d*|unit\s*\d*|chapter\s*\d*|page\s*\d*|第\s*\d+\s*[页课单元])$/i;
  function clean(value) {
    return String(value || '').normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/[‘’]/g, "'").replace(/[‐‑–—]/g, '-').trim();
  }
  function noNumber(value) { return clean(value).replace(/^(?:[•●▪□☐✓√*]\s*|(?:\(?\d{1,4}[).、:\-]?|[A-Z][.)])\s+)/, '').trim(); }
  function noIPA(value) { return value.replace(/\/[^/\n]{1,100}\//g, ' ').replace(/\[[^\]\n]*[ɑɐɒæəɜɞɪʊʌɔθðʃʒŋˈˌ:][^\]\n]*\]/g, ' '); }
  function wordClean(value) {
    return noIPA(noNumber(value)).replace(POS, ' ').replace(/\b(?:noun|verb|adjective|adverb)\b\s*$/i, '').replace(/^[|:;,.\-]+|[|:;,.\-]+$/g, '').replace(/\s+/g, ' ').trim();
  }
  function acceptable(value) {
    return value.length >= 1 && value.length <= 100 && /[A-Za-z]/.test(value) && /^[A-Za-z][A-Za-z0-9 '\-]*(?:\([A-Za-z ]+\))?$/.test(value) && value.split(' ').length <= 9 && !HEADER.test(value);
  }
  function meaningClean(value) { return clean(value).replace(/^[|:;,.\-]+/, '').replace(/\s+/g, ' ').trim(); }
  function parse(text, options = {}) {
    const mode = options.mode || 'wordlist';
    const input = clean(text).replace(/([A-Za-z]{2,})-\r?\n([a-z]{2,})/g, '$1$2');
    const rows = [], byWord = new Map(); let pending = null;
    function add(word, meaning, sourceLine, extra = {}) {
      word = wordClean(word); meaning = meaningClean(meaning);
      if (!acceptable(word)) return null;
      const key = word.toLowerCase();
      if (byWord.has(key)) {
        const old = byWord.get(key);
        old.duplicateCount = (old.duplicateCount || 1) + 1;
        const nextSource = clean(sourceLine).slice(0, 500);
        if (nextSource && !old.sourceLine.includes(nextSource)) old.sourceLine = (old.sourceLine + '\n' + nextSource).slice(0, 1500);
        if (meaning && !old.meaning) old.meaning = meaning;
        else if (meaning && old.meaning !== meaning && !old.meaning.split('；').includes(meaning)) old.meaning += '；' + meaning;
        return old;
      }
      const item = {word, meaning, sourceLine: clean(sourceLine).slice(0, 500), selected: true, duplicateCount: 1, ...extra};
      rows.push(item); byWord.set(key, item); return item;
    }
    if (mode === 'article') {
      for (const match of input.matchAll(/\b[A-Za-z][A-Za-z'’-]{1,44}\b/g)) add(match[0].toLowerCase(), '', match[0]);
      return rows;
    }
    for (const raw of input.split(/\r?\n/)) {
      let line = noNumber(raw);
      if (!line || HEADER.test(line) || /^[-_=|\s]+$/.test(line) || /^\d+$/.test(line)) continue;
      line = noIPA(line);
      // Tabs represent visually separated table cells. A broad whitespace gap
      // from OCR is treated in the same way, while spaces inside phrases remain.
      const cells = line.split(/\t+| {3,}|\s*\|\s*/).map(clean).filter(Boolean);
      if (cells.length > 1) {
        let english = '', meaning = '';
        const flush = () => { if (english) pending = add(english, meaning, raw); english = ''; meaning = ''; };
        for (const cell of cells) {
          if (HEADER.test(cell) || /^\d+$/.test(cell) || /^(?:n|v|vt|vi|adj|adv|prep|pron|conj|phr)\.?$/i.test(cell)) continue;
          if (HAN.test(cell)) {
            const firstHan = cell.search(HAN), before = wordClean(cell.slice(0, firstHan));
            if (acceptable(before)) { flush(); english = before; meaning = cell.slice(firstHan); }
            else if (english) meaning += (meaning ? '；' : '') + cell;
          } else {
            const candidate = wordClean(cell);
            if (acceptable(candidate)) { flush(); english = candidate; }
          }
        }
        flush(); continue;
      }
      if (!HAN.test(line)) {
        const candidates = line.split(/\s*[,;]\s*/);
        if (candidates.length > 1) { for (const candidate of candidates) pending = add(candidate, '', raw); }
        else pending = add(line, '', raw);
        continue;
      }
      // Locate each English headword immediately before a Chinese meaning.
      // This also handles OCR that collapsed the columns of a two-column table.
      const normalized = line.replace(POS, ' ').replace(/\s+/g, ' ');
      const starts = [...normalized.matchAll(/([A-Za-z][A-Za-z0-9'\-]*(?: +[A-Za-z][A-Za-z0-9'\-]*){0,8})\s*[:：.\-]?\s*(?=[\u3400-\u9fff])/g)];
      if (starts.length) {
        starts.forEach((match, index) => {
          const meaningStart = match.index + match[0].length;
          const meaningEnd = index + 1 < starts.length ? starts[index + 1].index : normalized.length;
          pending = add(match[1], normalized.slice(meaningStart, meaningEnd), raw);
        });
      } else if (pending && !pending.meaning && /^[\u3400-\u9fff（(]/.test(line)) {
        pending.meaning = meaningClean(line); pending.sourceLine += '\n' + line;
      }
    }
    return rows;
  }
  function audit(rows) {
    if (!Array.isArray(rows)) return [];
    for (const row of rows) {
      const word = clean(row.word), meaning = clean(row.meaning), issues = [];
      if (!word || !/[A-Za-z]/.test(word)) issues.push('英文栏需要检查');
      if (!meaning) issues.push('缺少中文意思');
      else if (!HAN.test(meaning)) issues.push('中文栏可能错位');
      if (word.length > 70 || /[^A-Za-z0-9 '\-()/.&]/.test(word) || /(?:[A-Za-z]\d|\d[A-Za-z])/.test(word)) issues.push('拼写看起来不确定');
      if (/\b(?:page|unit|list|chapter)\s*\d*\b/i.test(word) || HEADER.test(word)) issues.push('可能是页眉，不是单词');
      if ((row.duplicateCount || 1) > 1) issues.push(`已合并 ${row.duplicateCount} 条重复词`);
      row.issues = [...new Set(issues)];
      row.needsReview = row.issues.some(issue => !issue.startsWith('已合并'));
      row.confidence = row.needsReview ? 'low' : row.issues.length ? 'medium' : 'high';
      if (!row.needsReview) row.confirmed = true;
      else if (typeof row.confirmed !== 'boolean') row.confirmed = false;
    }
    return rows;
  }
  // Reconstruct lines from PDF text coordinates before the parser sees them.
  // A large x gap becomes a cell delimiter; small gaps preserve English phrases.
  function layoutText(items) {
    const positioned = items.filter(i => typeof i.str === 'string' && i.str.trim()).map(i => ({text:i.str, x:i.transform[4], y:i.transform[5], width:Math.abs(i.width || 0), height:Math.max(5, Math.abs(i.height || i.transform[3] || 10))}));
    positioned.sort((a,b) => b.y-a.y || a.x-b.x);
    const lines = [];
    for (const item of positioned) {
      let row = lines.find(r => Math.abs(r.y-item.y) <= Math.max(2, Math.min(r.height,item.height)*0.35));
      if (!row) { row = {y:item.y,height:item.height,items:[]}; lines.push(row); }
      row.items.push(item);
    }
    lines.sort((a,b) => b.y-a.y);
    return lines.map(row => {
      row.items.sort((a,b) => a.x-b.x); let result = '', last = null;
      for (const item of row.items) {
        if (last) {
          const gap = item.x-last.x-last.width;
          if (gap > Math.max(16, item.height*1.7)) result += '\t';
          else if (!/\s$/.test(result) && !/^\s/.test(item.text) && (/[A-Za-z0-9]$/.test(result) || /^[A-Za-z0-9]/.test(item.text)) && gap > item.height*0.15) result += ' ';
        }
        result += item.text; last = item;
      }
      return result.trim();
    }).join('\n');
  }
  const api = {parse, audit, layoutText, clean};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ExtractWords = api;
})(typeof window !== 'undefined' ? window : globalThis);
