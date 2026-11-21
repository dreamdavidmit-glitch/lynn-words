// Only explicitly mounted forms save drafts. Draft text stays in this browser.
window.LynnLetters = (() => {
  const prefix = 'lynn.letter.draft.';
  const memory = new Map();
  const threads = new WeakMap();

  function readStorage(storage,key) {
    try { return JSON.parse(window[storage].getItem(key)); } catch (_) { return null; }
  }

  function read(name) {
    const key=prefix+name;
    return memory.get(key) || readStorage('sessionStorage',key) || readStorage('localStorage',key);
  }

  function write(name,values) {
    const key=prefix+name, value=JSON.stringify(values);
    memory.set(key,values);
    for (const storage of ['sessionStorage','localStorage']) {
      try { window[storage].setItem(key,value); } catch (_) {}
    }
  }

  function mount(form, name) {
    if (!form || form.dataset.draftMounted) return;
    form.dataset.draftMounted='true';
    const saved=read(name);
    const fields = [...form.querySelectorAll('textarea[name],select[name],input[type="date"],input[type="datetime-local"],input[type="radio"][name]')];
    for (const field of fields) {
      const value=saved?.[field.name];
      if (typeof value !== 'string') continue;
      if (field.type==='radio') field.checked=field.value===value;
      else field.value=value;
    }
    const note = document.createElement('small');
    note.className = 'letter-draft-note';
    form.after(note);
    function showLength() {
      const field=form.querySelector('textarea');
      const length=field.value.length;
      note.hidden=!length;
      note.textContent=length ? '此浏览器中的草稿' : '';
    }
    showLength();
    form.addEventListener('reset', () => queueMicrotask(showLength));
    function save() {
      const values=Object.fromEntries(fields.filter(field=>field.type!=='radio' || field.checked)
        .map(field=>[field.name,field.value]));
      showLength();
      write(name,values);
    }
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    form.addEventListener('compositionend',save);
  }

  function clear(name,expected=read(name)) {
    const key = prefix + name;
    const matches=value=>JSON.stringify(value)===JSON.stringify(expected);
    if (matches(memory.get(key))) memory.delete(key);
    for (const storage of ['sessionStorage','localStorage']) {
      try { if (matches(readStorage(storage,key))) window[storage].removeItem(key); } catch (_) {}
    }
  }

  function updateThread(node, html) {
    if (threads.get(node) === html) return;
    const follow = !threads.has(node) || node.scrollHeight - node.clientHeight - node.scrollTop < 24;
    const top = node.scrollTop;
    node.innerHTML = html;
    node.scrollTop = follow ? node.scrollHeight : top;
    threads.set(node, html);
  }

  return {mount, read, write, clear, updateThread};
})();
