/* Component & UI dùng chung. Gắn vào window.UI. */
window.UI = (() => {
  const { escapeHtml } = Fmt;

  // ---------------- Toast ----------------
  function toast(message, type = 'info') {
    const colors = {
      info: 'bg-zinc-800 border-zinc-700',
      success: 'bg-emerald-900/80 border-emerald-700 text-emerald-100',
      error: 'bg-red-900/80 border-red-700 text-red-100',
    };
    const el = document.createElement('div');
    el.className = `rounded-lg border px-4 py-2.5 text-sm shadow-lg ${colors[type] || colors.info} transition-all`;
    el.textContent = message;
    document.getElementById('toast').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
  }

  // ---------------- Modal ----------------
  const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  function openModal({ title, body, footer = '', size = 'md', onMount }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
        <div class="w-full ${SIZES[size] || SIZES.md} my-8 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 rounded-t-xl">
            <h2 class="font-semibold">${escapeHtml(title)}</h2>
            <button data-modal-close class="text-zinc-500 hover:text-zinc-200 text-xl leading-none">&times;</button>
          </div>
          <div class="modal-body p-5">${body}</div>
          ${footer ? `<div class="px-5 py-4 border-t border-zinc-800 flex items-center justify-end gap-2">${footer}</div>` : ''}
        </div>
      </div>`;
    const overlay = root.querySelector('.modal-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    // Có nhiều nút đóng: dấu × ở header và nút "Hủy" ở footer -> gắn cho TẤT CẢ.
    root.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
    if (onMount) onMount(root);
  }
  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

  // ---------------- Blocks ----------------
  function spinner(text = 'Đang tải...') {
    return `<div class="flex items-center justify-center gap-2 py-16 text-zinc-500 text-sm"><span class="inline-block w-4 h-4 border-2 border-zinc-600 border-t-brand-500 rounded-full animate-spin"></span>${escapeHtml(text)}</div>`;
  }
  function emptyState(msg) {
    return `<div class="py-16 text-center text-zinc-500 text-sm">${escapeHtml(msg)}</div>`;
  }
  // Note giải thích cho vùng TRỐNG: icon + tiêu đề + nội dung (html) + nút hành động tùy chọn.
  function emptyNote({ icon = 'fa-circle-info', title = '', html = '', action = '' }) {
    return `<div class="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-zinc-800/70 flex items-center justify-center text-brand-400 text-xl mb-3"><i class="fa-solid ${icon}"></i></div>
      ${title ? `<h3 class="font-medium text-zinc-200">${escapeHtml(title)}</h3>` : ''}
      <div class="text-sm text-zinc-500 mt-2 max-w-lg mx-auto leading-relaxed text-left">${html}</div>
      ${action ? `<div class="mt-4">${action}</div>` : ''}
    </div>`;
  }
  function errorBox(msg, hint = '') {
    return `<div class="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
      <p class="text-red-400 font-medium">${escapeHtml(msg)}</p>
      ${hint ? `<p class="text-xs text-zinc-500 mt-2">${escapeHtml(hint)}</p>` : ''}</div>`;
  }
  function needSelection(kind) {
    const what = kind === 'provider' ? 'provider (frps)' : 'node (frpc)';
    return `<div class="p-6"><div class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
      <p class="text-zinc-300 font-medium">Chưa có ${what} nào được chọn</p>
      <p class="text-sm text-zinc-500 mt-1">Hãy thêm và chọn một ${what} để xem dữ liệu.</p></div></div>`;
  }

  function statCard({ label, value, sub = '', accent = 'text-zinc-100', icon = '', attrs = '' }) {
    const clickable = attrs ? 'cursor-pointer hover:border-brand-500/50 hover:bg-zinc-900/80 transition' : '';
    return `<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 ${clickable}" ${attrs}>
      <div class="flex items-center justify-between">
        <div class="text-2xl font-semibold ${accent}">${value}</div>
        ${icon ? `<div class="text-xl opacity-70">${icon}</div>` : ''}
      </div>
      <div class="text-xs text-zinc-500 mt-1">${escapeHtml(label)}${sub ? ` · ${escapeHtml(sub)}` : ''}</div>
    </div>`;
  }

  function card(title, bodyHtml, toolbarHtml = '') {
    return `<div class="rounded-xl border border-zinc-800 overflow-hidden">
      <div class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
        <h3 class="font-medium">${title}</h3>
        <div class="flex items-center gap-2">${toolbarHtml}</div>
      </div>
      ${bodyHtml}
    </div>`;
  }

  function btn(label, { variant = 'default', attrs = '', size = 'md' } = {}) {
    const variants = {
      default: 'border border-zinc-700 hover:bg-zinc-800',
      primary: 'bg-brand-600 hover:bg-brand-700',
      danger: 'border border-red-800 text-red-400 hover:bg-red-900/30',
    };
    const sizes = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-3 py-2' };
    // type="button" mặc định: nút trong <form> KHÔNG submit kiểu GET (chống lộ field lên URL).
    return `<button type="button" class="rounded-lg transition ${variants[variant]} ${sizes[size]}" ${attrs}>${label}</button>`;
  }

  // ---------------- Selector provider/node (top toolbar) ----------------
  // Trả về HTML <select>; tự wire sau khi render qua wireSelector().
  function selector(kind) {
    const items = kind === 'provider' ? Store.activeProviders() : Store.activeNodes();
    const selId = kind === 'provider' ? Store.state.selectedProviderId : Store.state.selectedNodeId;
    if (!items.length) return '';
    const opts = items.map((i) => `<option value="${i.id}" ${i.id === selId ? 'selected' : ''}>${escapeHtml(i.name)} — ${escapeHtml(i.baseUrl)}</option>`).join('');
    return `<select data-selector="${kind}" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none max-w-xs">${opts}</select>`;
  }
  function wireSelector(container) {
    container.querySelectorAll('[data-selector]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const kind = sel.dataset.selector;
        if (kind === 'provider') Store.setProvider(sel.value);
        else Store.setNode(sel.value);
        App.rerender();
      });
    });
  }

  // Ô chọn provider/node kèm nhãn, đặt trong khu vực lọc. Nhớ gọi wireSelector(container) sau khi render.
  function selectorBar(kind) {
    const items = kind === 'provider' ? Store.activeProviders() : Store.activeNodes();
    const selId = kind === 'provider' ? Store.state.selectedProviderId : Store.state.selectedNodeId;
    const label = kind === 'provider' ? 'Provider' : 'Node';
    const opts = items.map((i) => `<option value="${i.id}" ${i.id === selId ? 'selected' : ''}>${escapeHtml(i.name)} — ${escapeHtml(i.baseUrl)}</option>`).join('');
    return `<label class="text-sm text-zinc-400 flex items-center gap-2 shrink-0"><span class="font-medium text-zinc-300">${label}:</span>
      <select data-selector="${kind}" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none max-w-sm">${opts}</select>
    </label>`;
  }

  // ---------------- Table (tĩnh) ----------------
  function table(headers, rowsHtml, colspan) {
    const ths = headers.map((h) => {
      const align = h.align === 'right' ? 'text-right' : 'text-left';
      return `<th class="px-3 py-2 ${align} font-medium">${h.label ?? h}</th>`;
    }).join('');
    return `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="text-xs text-zinc-500 bg-zinc-900/40"><tr>${ths}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${colspan || headers.length}" class="px-3 py-10 text-center text-zinc-500">Không có dữ liệu.</td></tr>`}</tbody>
    </table></div>`;
  }

  // ---------------- Bảng có phân trang ----------------
  // paginatedTable(mount, { headers, rows: string[] (<tr>), pageSize, emptyText })
  // Chỉ tbody được render lại khi đổi trang -> đăng ký sự kiện hàng bằng delegation trên `mount`.
  const PAGE_SIZES = [10, 20, 50, 100, 200];
  function paginatedTable(mount, { headers, rows, pageSize, emptyText = 'Không có dữ liệu.', emptyHtml = '', onRender }) {
    // Trống + có note giải thích -> hiện hẳn note thay cho bảng rỗng.
    if (!rows.length && emptyHtml) { mount.innerHTML = emptyHtml; return; }
    // Ghi nhớ số dòng/trang trong localStorage để không mất khi F5 hoặc khi lọc lại.
    const saved = Number(localStorage.getItem('frpc.pageSize'));
    const initial = PAGE_SIZES.includes(saved) ? saved : (Number(pageSize) || 10);
    const st = { page: 1, size: initial };
    const ths = headers.map((h) => {
      const align = h.align === 'right' ? 'text-right' : 'text-left';
      return `<th class="px-3 py-2 ${align} font-medium">${h.label ?? h}</th>`;
    }).join('');

    mount.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-3 text-sm">
        <label class="text-zinc-400 flex items-center gap-1.5">Hiển thị
          <select data-pt-size class="rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none">
            ${PAGE_SIZES.map((s) => `<option value="${s}" ${s === st.size ? 'selected' : ''}>${s}</option>`).join('')}
          </select> dòng
        </label>
        <span data-pt-count class="text-zinc-500"></span>
      </div>
      <div class="rounded-xl border border-zinc-800 overflow-hidden">
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead class="text-xs text-zinc-500 bg-zinc-900/40"><tr>${ths}</tr></thead>
          <tbody data-pt-body></tbody>
        </table></div>
      </div>
      <div class="flex items-center justify-between gap-2 mt-3 text-sm">
        <span data-pt-range class="text-zinc-500"></span>
        <div class="flex items-center gap-1">
          <button data-pt-prev class="rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1"><i class="fa-solid fa-chevron-left"></i></button>
          <span data-pt-page class="px-2 text-zinc-400"></span>
          <button data-pt-next class="rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>`;

    const bodyEl = mount.querySelector('[data-pt-body]');
    const prevBtn = mount.querySelector('[data-pt-prev]');
    const nextBtn = mount.querySelector('[data-pt-next]');
    const total = rows.length;

    function render() {
      const pages = Math.max(1, Math.ceil(total / st.size));
      if (st.page > pages) st.page = pages;
      const start = (st.page - 1) * st.size;
      const slice = rows.slice(start, start + st.size);
      bodyEl.innerHTML = slice.join('') || `<tr><td colspan="${headers.length}" class="px-3 py-10 text-center text-zinc-500">${escapeHtml(emptyText)}</td></tr>`;
      mount.querySelector('[data-pt-count]').textContent = `Tổng ${total}`;
      mount.querySelector('[data-pt-range]').textContent = total ? `Dòng ${start + 1}–${Math.min(start + st.size, total)} / ${total}` : '';
      mount.querySelector('[data-pt-page]').textContent = `Trang ${st.page}/${pages}`;
      prevBtn.disabled = st.page <= 1;
      nextBtn.disabled = st.page >= pages;
      if (onRender) onRender(bodyEl); // hook: khôi phục checkbox bulk sau khi đổi trang
    }

    mount.querySelector('[data-pt-size]').addEventListener('change', (e) => {
      st.size = Number(e.target.value);
      localStorage.setItem('frpc.pageSize', st.size);
      st.page = 1; render();
    });
    prevBtn.addEventListener('click', () => { if (st.page > 1) { st.page--; render(); } });
    nextBtn.addEventListener('click', () => { st.page++; render(); });
    render();
  }

  // ---------------- Bulk action (chọn nhiều dòng) ----------------
  /** Chạy fn cho từng id (song song), toast tổng kết thành/bại. */
  async function bulkRun(ids, fn, label = 'Xử lý') {
    const res = await Promise.allSettled(ids.map((id) => fn(id)));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    const fail = res.length - ok;
    toast(fail ? `${label}: ${ok} thành công, ${fail} lỗi.` : `${label}: ${ok} mục.`, fail ? 'error' : 'success');
  }

  /**
   * Bulk select cho bảng phân trang. Lựa chọn theo id, GIỮ nguyên khi đổi trang.
   *   const bulk = UI.bulkSelect({ actions: [{label, variant, confirm(n), run(ids)}], onDone });
   *   headers: [bulk.th(), ...]        row: `<tr>${bulk.td(id)}...</tr>`
   *   UI.paginatedTable(tbl, { ..., onRender: () => bulk.sync() });
   *   bulk.attach(tbl, barEl);
   */
  function bulkSelect({ actions = [], onDone } = {}) {
    const sel = new Set();
    let tableEl = null;
    let barEl = null;
    const CB = 'rounded bg-zinc-800 border-zinc-700 cursor-pointer';

    const th = () => ({ label: `<input type="checkbox" data-bulk-all class="${CB}" title="Chọn tất cả trang này" />` });
    const td = (id) => `<td class="px-3 py-2"><input type="checkbox" data-bulk="${escapeHtml(String(id))}" class="${CB}" /></td>`;
    const pageIds = () => [...tableEl.querySelectorAll('[data-bulk]')].map((c) => c.dataset.bulk);

    function renderBar() {
      if (!barEl) return;
      if (!sel.size) { barEl.innerHTML = ''; barEl.classList.add('hidden'); return; }
      barEl.classList.remove('hidden');
      barEl.innerHTML = `<div class="flex flex-wrap items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-600/10 px-3 py-2 mb-3">
        <span class="text-sm text-brand-200">Đã chọn <b>${sel.size}</b></span>
        <div class="flex-1"></div>
        ${actions.map((a, i) => btn(a.label, { size: 'sm', variant: a.variant, attrs: `data-bulk-act="${i}"` })).join(' ')}
        ${btn('Bỏ chọn', { size: 'sm', attrs: 'data-bulk-clear' })}
      </div>`;
    }
    function sync() {
      if (!tableEl) return;
      tableEl.querySelectorAll('[data-bulk]').forEach((c) => { c.checked = sel.has(c.dataset.bulk); });
      const all = tableEl.querySelector('[data-bulk-all]');
      if (all) {
        const ids = pageIds();
        const every = ids.length > 0 && ids.every((i) => sel.has(i));
        all.checked = every;
        all.indeterminate = !every && ids.some((i) => sel.has(i));
      }
      renderBar();
    }
    function attach(table, bar) {
      tableEl = table; barEl = bar;
      table.addEventListener('change', (e) => {
        const all = e.target.closest('[data-bulk-all]');
        if (all) {
          const ids = pageIds();
          ids.forEach((i) => (all.checked ? sel.add(i) : sel.delete(i)));
          sync(); return;
        }
        const cb = e.target.closest('[data-bulk]');
        if (cb) { if (cb.checked) sel.add(cb.dataset.bulk); else sel.delete(cb.dataset.bulk); sync(); }
      });
      bar.addEventListener('click', async (e) => {
        if (e.target.closest('[data-bulk-clear]')) { sel.clear(); sync(); return; }
        const el = e.target.closest('[data-bulk-act]');
        if (!el) return;
        const act = actions[Number(el.dataset.bulkAct)];
        const ids = [...sel];
        if (!ids.length) return;
        if (act.confirm && !confirm(act.confirm(ids.length))) return;
        bar.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await act.run(ids); sel.clear(); if (onDone) onDone(); }
        catch (err) { toast('Lỗi: ' + err.message, 'error'); sync(); }
      });
      sync();
    }
    return { sel, th, td, attach, sync };
  }

  // ---------------- Form thêm/sửa instance (provider/node) ----------------
  function openInstanceModal(role, id) {
    const editing = Boolean(id);
    const inst = editing ? Store.getInstance(id) : null;
    const what = role === 'frps' ? 'Provider (frps)' : 'Node (frpc)';
    const field = (label, name, value = '', opts = {}) => `
      <div class="${opts.full ? 'col-span-2' : ''}">
        <label class="block text-xs text-zinc-400 mb-1">${label}</label>
        <input name="${name}" ${opts.type ? `type="${opts.type}"` : ''} ${opts.required ? 'required' : ''}
          value="${escapeHtml(value)}" placeholder="${escapeHtml(opts.placeholder || '')}"
          autocomplete="off" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        ${opts.hint ? `<p class="text-[11px] text-zinc-500 mt-1">${opts.hint}</p>` : ''}
      </div>`;

    const body = `
      <form id="instance-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          ${field('Tên hiển thị *', 'name', inst?.name || '', { required: true, full: true, placeholder: role === 'frps' ? 'VD: FRPS Hà Nội' : 'VD: Node văn phòng' })}
          ${field('Nhóm', 'group', inst?.group || '', { placeholder: 'VD: Production' })}
          <div>
            <label class="block text-xs text-zinc-400 mb-1">URL web dashboard *</label>
            <input name="baseUrl" required value="${escapeHtml(inst?.baseUrl || '')}" placeholder="${role === 'frps' ? 'http://ip:7500' : 'http://ip:7400'}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          ${field('User', 'user', inst?.user || '', { placeholder: 'admin' })}
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Password</label>
            <input name="password" type="password" autocomplete="new-password" placeholder="${editing && inst?.hasPassword ? '•••••• (giữ nguyên)' : '••••••'}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            ${editing ? '<p class="text-[11px] text-zinc-500 mt-1">Để trống nếu không đổi.</p>' : ''}
          </div>
          <label class="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
            <input name="tls" type="checkbox" ${inst?.tls ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700" />
            Dùng HTTPS + cho phép chứng chỉ self-signed
          </label>
          <div class="col-span-2">
            <label class="block text-xs text-zinc-400 mb-1">Phiên bản frp (type hỗ trợ)</label>
            <select name="frpVariant" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
              <option value="extended" ${inst?.frpVariant !== 'standard' ? 'selected' : ''}>Meobaka fork — đầy đủ type mới (xudp, tcp+udp, stcp+sudp, xtcp+xudp)</option>
              <option value="standard" ${inst?.frpVariant === 'standard' ? 'selected' : ''}>frp chuẩn / cũ — chỉ type gốc</option>
            </select>
            <p class="text-[11px] text-zinc-500 mt-1">Chọn "chuẩn / cũ" nếu chạy frp gốc (vd v0.69.1). Không ẩn type nào — chỉ <b>cảnh báo đỏ</b> khi chọn type mở rộng mà node là bản chuẩn (sẽ báo "invalid proxy type").</p>
          </div>
        </div>
        <div id="inst-test-result" class="hidden rounded-lg px-3 py-2 text-sm"></div>
      </form>`;

    const footer = `
      ${btn('Test kết nối', { attrs: 'id="inst-test"' })}
      <div class="flex-1"></div>
      ${btn('Hủy', { attrs: 'data-modal-close' })}
      ${btn('Lưu', { variant: 'primary', attrs: 'id="inst-save"' })}`;

    openModal({
      title: (editing ? 'Sửa ' : 'Thêm ') + what,
      body, footer, size: 'lg',
      onMount(root) {
        const form = root.querySelector('#instance-form');
        const readForm = () => {
          const f = form.elements;
          const payload = { name: f.name.value.trim(), role, group: f.group.value.trim(), baseUrl: f.baseUrl.value.trim(), user: f.user.value, tls: f.tls.checked, frpVariant: f.frpVariant.value };
          if (f.password.value !== '') payload.password = f.password.value;
          return payload;
        };
        root.querySelector('#inst-save').addEventListener('click', async () => {
          const payload = readForm();
          if (!payload.name || !payload.baseUrl) return toast('Cần nhập Tên và URL.', 'error');
          try {
            if (editing) { await API.updateInstance(id, payload); toast('Đã cập nhật.', 'success'); }
            else { if (payload.password === undefined) payload.password = ''; await API.createInstance(payload); toast('Đã thêm.', 'success'); }
            closeModal();
            await Store.loadInstances();
            App.rerender();
          } catch (err) { toast('Lưu lỗi: ' + err.message, 'error'); }
        });
        root.querySelector('#inst-test').addEventListener('click', async () => {
          const box = root.querySelector('#inst-test-result');
          box.className = 'rounded-lg px-3 py-2 text-sm bg-zinc-800 border border-zinc-700';
          box.textContent = 'Đang kiểm tra...';
          box.classList.remove('hidden');
          const f = form.elements;
          try {
            let result;
            if (editing && f.password.value === '') result = await API.testSaved(id);
            else result = await API.testAdhoc({ role, baseUrl: f.baseUrl.value.trim(), user: f.user.value, password: f.password.value, tls: f.tls.checked });
            if (result.ok) {
              box.className = 'rounded-lg px-3 py-2 text-sm bg-emerald-900/40 border border-emerald-700 text-emerald-200';
              box.textContent = result.role === 'frps' ? `✓ OK — frps ${result.version || ''}` : `✓ OK — frpc, ${result.proxyCount ?? 0} proxy`;
            } else {
              box.className = 'rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200';
              box.textContent = '✗ ' + (result.error || 'Không kết nối được');
            }
          } catch (err) {
            box.className = 'rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200';
            box.textContent = '✗ ' + err.message;
          }
        });
      },
    });
  }

  // Switch bật/tắt 1 instance (Node/Provider). enabled=false → không poll, ẩn khỏi selector.
  function instanceSwitch(inst) {
    const on = inst.enabled !== false;
    return `<button type="button" data-toggle-enabled="${inst.id}" role="switch" aria-checked="${on}"
      title="${on ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}"
      class="align-middle relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-zinc-600'}">
      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}"></span>
    </button>`;
  }
  async function toggleInstanceEnabled(id) {
    const inst = Store.getInstance(id);
    if (!inst) return;
    const next = inst.enabled === false; // đang tắt -> bật, đang bật -> tắt
    try {
      await API.updateInstance(id, { enabled: next });
      toast(next ? `Đã bật "${inst.name}".` : `Đã tắt "${inst.name}".`, 'success');
      await Store.loadInstances();
      App.rerender();
    } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
  }

  async function deleteInstance(inst) {
    if (!confirm(`Xóa "${inst.name}" khỏi FRPControl? (Không ảnh hưởng frps/frpc thực tế)`)) return false;
    try {
      await API.deleteInstance(inst.id);
      toast('Đã xóa.', 'success');
      await Store.loadInstances();
      App.rerender();
      return true;
    } catch (err) { toast('Xóa lỗi: ' + err.message, 'error'); return false; }
  }

  // ---------------- Help "?" (icon + popover giải thích) ----------------
  // Nội dung trợ giúp theo từng khu vực. Thêm entry mới thoải mái để dùng qua UI.help('key').
  const HELP = {
    'health-check': { title: 'Health Check', html: `
      <p>frp kiểm tra <b>dịch vụ local</b> (localIP:localPort), không phải URL remote.</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5">
        <li><b>tcp</b>: chỉ cần mở được cổng là "khỏe" — hợp mọi dịch vụ, không cần Path.</li>
        <li><b>http</b>: gửi <code class="text-zinc-300">GET http://localIP:localPort{Path}</code>, phải trả <b>2xx</b>. Path sai (404) → luôn fail → proxy kẹt.</li>
        <li>Path hợp lệ Ollama: <code>/</code>, <code>/api/version</code>. Web app thường có <code>/health</code>, <code>/healthz</code>.</li>
        <li>Đủ <b>Max Failed</b> lần fail liên tiếp → frp gỡ proxy. Nên để ≥ 3.</li>
      </ul>` },
    'load-balancer': { title: 'Load Balancer (cân bằng tải)', html: `
      <p>Nhiều proxy có <b>cùng Group + cùng Group Key + cùng Remote Port</b> sẽ được frps gộp 1 nhóm và <b>chia đều kết nối (random)</b>.</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5">
        <li>Group Key phải <b>giống hệt</b> giữa các proxy cùng nhóm (chống chen ngang).</li>
        <li>Bật <b>Health Check</b> → frp tự loại backend mà dịch vụ local chết.</li>
        <li>Chỉ 1 backend → để trống cả hai.</li>
      </ul>` },
    'transport': { title: 'Transport', html: `
      <ul class="list-disc list-inside space-y-0.5">
        <li><b>Use Encryption</b>: mã hóa traffic frpc↔frps (ngoài TLS).</li>
        <li><b>Use Compression</b>: nén dữ liệu — hợp text/web, tốn CPU.</li>
        <li><b>Bandwidth Limit</b>: giới hạn băng thông mỗi proxy (vd 1MB, 500KB); Mode client/server = giới hạn ở phía nào.</li>
        <li><b>Proxy Protocol</b>: gửi IP thật của khách tới dịch vụ local (dịch vụ phải hỗ trợ đọc).</li>
      </ul>` },
    'proxy-protocol': { title: 'Proxy Protocol Version', html: `
      <p>Chèn IP thật của khách vào đầu kết nối tới dịch vụ local (để app log/giới hạn theo IP thật thay vì thấy 127.0.0.1). <b>Dịch vụ local phải bật đọc PROXY protocol</b> (nginx proxy_protocol, HAProxy...).</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5">
        <li><b>v1</b>: header dạng text, dễ đọc/debug, tương thích rộng.</li>
        <li><b>v2</b>: header nhị phân, gọn & nhanh hơn, hỗ trợ thêm metadata.</li>
        <li>Không chắc dịch vụ hỗ trợ → để <b>None</b>.</li>
      </ul>` },
    'metadata': { title: 'Metadata', html: `
      <ul class="list-disc list-inside space-y-0.5">
        <li><b>Metadatas</b>: dữ liệu tùy ý gắn kèm proxy; server plugin/xác thực đọc được (vd token, môi trường).</li>
        <li><b>Annotations</b>: nhãn mô tả proxy để quản lý/hiển thị, không ảnh hưởng tới traffic.</li>
      </ul>
      <p class="mt-1.5">Cả hai là cặp key/value tùy chọn, để trống nếu không dùng.</p>` },
    'custom-domains': { title: 'Custom Domains', html: `
      <p>Chỉ dùng cho proxy <b>http/https</b>. frps định tuyến theo <b>Host header</b>: request tới cổng vhost của frps mang đúng domain sẽ được đẩy về proxy này.</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5">
        <li>Muốn trình duyệt vào được: <b>tự trỏ DNS</b> (A record) domain → IP của frps.</li>
        <li>frps phải bật <code>vhostHTTPPort</code>/<code>vhostHTTPSPort</code>.</li>
        <li>Nhiều domain cách nhau dấu phẩy. Proxy TCP/UDP không dùng (định tuyến theo cổng).</li>
      </ul>` },
    'proxy-types': { title: 'Các loại proxy', html: `
      <ul class="space-y-1.5">
        <li><b>tcp</b> — chuyển tiếp 1 cổng TCP ra frps (SSH, DB, API, game…).</li>
        <li><b>udp</b> — như tcp nhưng cho UDP (DNS, game, VoIP, WireGuard…).</li>
        <li><b>http</b> — web theo tên miền qua cổng vhostHTTP, định tuyến theo Host header.</li>
        <li><b>https</b> — như http nhưng TLS qua cổng vhostHTTPS, định tuyến theo SNI/Host.</li>
        <li><b>tcpmux</b> — ghép nhiều dịch vụ TCP qua 1 cổng (multiplexer), theo domain.</li>
        <li><b>stcp</b> — TCP bảo mật, không mở cổng public; cần visitor + Secret Key.</li>
        <li><b>sudp</b> — như stcp nhưng cho UDP.</li>
        <li><b>xtcp</b> — kết nối P2P trực tiếp giữa 2 máy (nhanh, giảm tải frps); cần visitor.</li>
      </ul>` },
    'store': { title: 'Store proxies', html: `
      <p>Store = danh sách proxy <b>động</b> mà frpc đọc từ file (mục <code>[store]</code>), cho phép Thêm/Sửa/Xóa proxy qua API mà không cần sửa file config tay.</p>
      <p class="mt-1.5">Mỗi lần lưu, frpc tự nạp lại và áp dụng. Proxy khai báo tĩnh trong file config chính không nằm ở đây.</p>` },
    'visitors': { title: 'Visitors', html: `
      <p>Visitor dùng cho proxy loại <b>stcp/xtcp/sudp</b> (P2P/bảo mật). Bên chạy dịch vụ tạo proxy stcp với <b>Secret Key</b>; bên muốn truy cập tạo <b>visitor</b> cùng tên + cùng Secret Key để mở cổng local nối tới.</p>
      <p class="mt-1.5">Khác proxy thường: không mở cổng public trên frps, chỉ người có Secret Key kết nối được.</p>` },
    'assign-item': { title: 'Assign Item (phân quyền theo instance)', html: `
      <p>Cấp quyền cho user trên <b>từng</b> provider/node cụ thể (cộng thêm ngoài role).</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5">
        <li><b>Xem</b>: thấy instance trong danh sách.</li>
        <li><b>Giám sát</b>: xem status/proxies/clients/config.</li>
        <li><b>Sửa</b>: chỉnh sửa & điều khiển.</li>
        <li><b>Xóa</b>: xóa instance.</li>
      </ul>` },
  };

  let helpPop = null;
  function closeHelpPopover() {
    if (!helpPop) return;
    helpPop.remove(); helpPop = null;
    window.removeEventListener('scroll', closeHelpPopover, true);
    window.removeEventListener('resize', closeHelpPopover);
  }
  function openHelpPopover(anchor, key) {
    const h = HELP[key];
    if (!h) return;
    closeHelpPopover();
    helpPop = document.createElement('div');
    helpPop._key = key;
    helpPop.className = 'help-pop fixed z-[70] w-80 max-w-[92vw] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-4';
    helpPop.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <div class="font-semibold text-sm text-zinc-100 flex items-center gap-1.5"><i class="fa-regular fa-circle-question text-brand-400"></i> ${escapeHtml(h.title)}</div>
        <button data-help-close class="text-zinc-500 hover:text-zinc-200 text-lg leading-none">&times;</button>
      </div>
      <div class="text-[12px] text-zinc-400 leading-relaxed space-y-1">${h.html}</div>`;
    document.body.appendChild(helpPop);
    const r = anchor.getBoundingClientRect();
    const pw = helpPop.offsetWidth, ph = helpPop.offsetHeight;
    let left = r.left, top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    helpPop.style.left = `${left}px`;
    helpPop.style.top = `${top}px`;
    window.addEventListener('scroll', closeHelpPopover, true);
    window.addEventListener('resize', closeHelpPopover);
  }
  // Icon "?" — trả HTML; click sẽ mở popover (xử lý bởi listener toàn cục bên dưới).
  function help(key, opts = {}) {
    if (!HELP[key]) return '';
    return `<button type="button" data-help="${key}" title="Giải thích cách hoạt động" class="inline-flex items-center justify-center align-middle text-zinc-500 hover:text-brand-400 ${opts.class || ''}"><i class="fa-regular fa-circle-question"></i></button>`;
  }
  // 1 listener toàn cục: mở/đóng popover trợ giúp.
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-help]');
    if (opener) { e.preventDefault(); e.stopPropagation();
      if (helpPop && helpPop._key === opener.dataset.help) closeHelpPopover();
      else openHelpPopover(opener, opener.dataset.help);
      return;
    }
    if (helpPop && (e.target.closest('[data-help-close]') || !e.target.closest('.help-pop'))) closeHelpPopover();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHelpPopover(); });

  return {
    toast, openModal, closeModal,
    spinner, emptyState, emptyNote, errorBox, needSelection,
    statCard, card, btn, table, paginatedTable, bulkSelect, bulkRun,
    selector, selectorBar, wireSelector,
    openInstanceModal, deleteInstance, instanceSwitch, toggleInstanceEnabled,
    help, HELP,
  };
})();
