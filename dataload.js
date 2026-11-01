// Lynn 的小词窝 · 读取内置数据（四级词库、读音索引）
// 用网址打开时直接读 .json。
// 直接双击 index.html 打开时（地址是 file://），浏览器不允许网页读取本地的 .json 文件，
// 这时改为加载旁边同名的 .js 副本：内容完全一样，只是外面包了一层 LynnData.put(...)。
// 以后如果改了 cet4.json 或 audio/index.json，记得同时更新对应的 .js 副本。
(function (root) {
  'use strict';
  const fileMode = !!(root.location && root.location.protocol === 'file:');
  const pending = new Map();
  const twinOf = url => String(url).replace(/\.json(?=$|[?#])/i, '.js');
  const nameOf = url => String(url).split(/[?#]/)[0].split('/').slice(-2).join('/');

  function viaScript(url) {
    const src = twinOf(url);
    if (pending.has(src)) return pending.get(src);
    const job = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.async = true;
      el.src = src;
      el.onload = () => {
        el.remove(); pending.delete(src);
        if (Object.prototype.hasOwnProperty.call(el, 'lynnData')) resolve(el.lynnData);
        else reject(new Error('内置数据 ' + nameOf(src) + ' 格式不对，请重新复制整个网站文件夹。'));
      };
      el.onerror = () => {
        el.remove(); pending.delete(src);
        reject(new Error('没找到内置数据 ' + nameOf(src) + '。请确认整个网站文件夹都在，再刷新试试。'));
      };
      document.head.appendChild(el);
    });
    pending.set(src, job);
    return job;
  }

  async function json(url) {
    if (fileMode) return viaScript(url);
    let response;
    try { response = await fetch(url); }
    catch (_) { return viaScript(url).catch(() => { throw new Error('网络开小差了，' + nameOf(url) + ' 没读到。检查一下网络，刷新再试试～'); }); }
    if (!response.ok) throw new Error(nameOf(url) + ' 没读到（' + response.status + '），刷新一下再试试～');
    return response.json();
  }

  root.LynnData = {
    fileMode,
    json,
    // .js 副本会调用这个函数，把数据交回给正在加载它的那个 <script>
    put(data) { const el = document.currentScript; if (el) el.lynnData = data; }
  };
})(window);
