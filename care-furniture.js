(function (root) {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function mount(panel, api) {
    panel.innerHTML = `<header class="wish-admin-head"><div><h2>家具愿望</h2><p data-wish-wallet>正在读取星光…</p></div><button type="button" data-wish-refresh>刷新</button></header>
      <p data-wish-notice role="status" hidden></p><div data-care-wishes></div>`;
    const list = panel.querySelector('[data-care-wishes]');
    const wallet = panel.querySelector('[data-wish-wallet]');
    const notice = panel.querySelector('[data-wish-notice]');
    let inFlight = false;
    let lastResult;
    let available = null;

    function show(message) { notice.textContent = message; notice.hidden = !message; }

    function render(data) {
      const {wishes, earned, spent} = data;
      available = data.available;
      wallet.textContent = `可用 ${available} 点星光 · 累计获得 ${earned} · 已扣 ${spent}`;
      const signature = JSON.stringify(wishes);
      if (signature === lastResult) return;
      lastResult = signature;
      const inputs = new Map([...list.querySelectorAll('form')].map(form => [form.dataset.wishId, form.elements.cost.value]));
      const focus = document.activeElement;
      const focusId = focus?.closest('form')?.dataset.wishId;
      list.innerHTML = wishes.length ? wishes.map(wish => {
        const id = Number(wish.id);
        const date = new Date(wish.createdAt).toLocaleDateString('zh-CN');
        const status = wish.status === 'approved' ? `已确认 · 扣 ${Number(wish.cost)} 点` : wish.status === 'declined' ? '暂不安排' : '待处理';
        return `<article class="wish-admin-item">
          <header><small>${escape(date)}</small><span>${status}</span></header>
          <p>${escape(wish.body)}</p>
          ${wish.status === 'pending' ? `<form data-wish-id="${id}">
            <label>扣除星光<input type="number" min="0" step="1" name="cost" required inputmode="numeric" placeholder="0 为免费"></label>
            <button type="submit" value="approved">确认并扣除</button>
            <button type="submit" value="declined" formnovalidate>暂不安排</button>
          </form>` : ''}
        </article>`;
      }).join('') : '<p>暂时还没有家具愿望。</p>';
      for (const form of list.querySelectorAll('form')) {
        form.elements.cost.value = inputs.get(form.dataset.wishId) || '';
        if (focusId === form.dataset.wishId && focus?.name === 'cost') form.elements.cost.focus({preventScroll:true});
      }
    }

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try { render(await api('/care/room/wishes')); }
      catch (error) { show(error.message); }
      finally { inFlight = false; }
    }

    panel.querySelector('[data-wish-refresh]').addEventListener('click', () => { show(''); refresh(); });
    panel.addEventListener('submit', async event => {
      event.preventDefault();
      if (inFlight) return;
      const form = event.target;
      const status = event.submitter?.value || 'approved';
      const cost = form.elements.cost.valueAsNumber;
      if (status === 'approved' && (!Number.isSafeInteger(cost) || cost < 0 || (available !== null && cost > available))) {
        show('请输入不超过可用星光的整数。'); return;
      }
      if (status === 'approved' && !root.confirm(`确认家具愿望并扣除 ${cost} 点星光？`)) return;
      inFlight = true;
      show('');
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach(button => { button.disabled = true; });
      try {
        await api('/care/room/wishes/' + form.dataset.wishId, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status,cost})
        });
        show(status === 'approved' ? `已确认，扣除 ${cost} 点星光。` : '已标记为暂不安排。');
        const latest = await api('/care/room/wishes');
        render(latest);
      } catch (error) { show(error.message); }
      finally { inFlight = false; buttons.forEach(button => { button.disabled = false; }); }
    });

    refresh();
    return refresh;
  }

  root.LynnCareFurniture = {mount};
})(window);
