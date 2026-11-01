(function (root) {
  'use strict';
  const base = typeof document !== 'undefined' && document.currentScript ? new URL('.', document.currentScript.src).href : './';
  const cache = new Map();
  // 直接双击 index.html 打开时，浏览器不让网页读本地词典文件，只能用四级词库（cet4.js）补中文。
  const fileMode = typeof location !== 'undefined' && location.protocol === 'file:' && !!root.LynnData;
  let manifestPromise, cet4Promise;
  function normalize(value) {
    return String(value || '').normalize('NFKC').replace(/[’‘]/g,"'").replace(/[–—]/g,'-')
      .replace(/\s+/g,' ').trim().replace(/^[.,;:!?\"]+|[.,;:!?\"]+$/g,'').toLowerCase();
  }
  function prefix(word) { return word[0] + (/^[a-z]$/.test(word[1] || '') ? word[1] : '_'); }
  function aborted(signal) { if (signal?.aborted) throw new DOMException('已取消补充释义','AbortError'); }
  async function json(path) {
    let response;
    try { response = await fetch(base + path); }
    catch (_) { throw new Error('词典没加载出来，检查一下网络再试试～'); }
    if (!response.ok) throw new Error('词典文件没读到，刷新一下再试试～');
    return response.json();
  }
  function manifest() {
    if (!manifestPromise) manifestPromise = json('dictionary/manifest.json').catch(error=>{manifestPromise=null;throw error;});
    return manifestPromise;
  }
  async function shard(key) {
    const info = await manifest();
    if (!Object.prototype.hasOwnProperty.call(info.shards, key)) return null;
    if (!cache.has(key)) cache.set(key,json('dictionary/'+key+'.json').catch(error=>{cache.delete(key);throw error;}));
    return cache.get(key);
  }
  function cet4() {
    if (!cet4Promise) cet4Promise = root.LynnData.json('cet4.json').then(rows => {
      const map = new Map();
      for (const row of rows || []) { const key = normalize(row.word); if (key && !map.has(key)) map.set(key, row); }
      return map;
    }).catch(error => { cet4Promise = null; throw error; });
    return cet4Promise;
  }
  async function lookup(value, options={}) {
    const word = normalize(typeof value === 'object' ? value?.word : value);
    aborted(options.signal);
    if (!/^[a-z][a-z0-9 '&.,()/+\-]{0,99}$/.test(word)) return null;
    if (fileMode) {
      const row = (await cet4()).get(word);
      aborted(options.signal);
      return row ? {meaning:row.meaning,phonetic:row.phonetic||'',headword:row.word} : null;
    }
    let key = word;
    for(let depth=0;depth<3;depth++) {
      const records = await shard(prefix(key));
      aborted(options.signal);
      const entry = records && Object.prototype.hasOwnProperty.call(records,key) ? records[key] : null;
      if(!entry) return null;
      if(entry[0]) return {meaning:entry[0],phonetic:entry[1]||'',headword:entry[2]||key};
      if(!entry[2] || entry[2]===key) return null;
      key = entry[2];
    }
    return null;
  }
  async function lookupMany(words, {onProgress,signal}={}) {
    if(!Array.isArray(words)) throw new TypeError('待查询词汇必须是列表。');
    const results = new Array(words.length); let next=0,completed=0;
    function report(){if(onProgress)onProgress({completed,total:words.length});}
    report();
    await Promise.all(Array.from({length:Math.min(5,words.length)},async()=>{
      while(next<words.length){aborted(signal);const index=next++;results[index]=await lookup(words[index],{signal});completed++;report();}
    }));
    aborted(signal);return results;
  }
  const api = {lookup,lookupMany,normalize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.Dictionary=api;
})(typeof window!=='undefined'?window:globalThis);
