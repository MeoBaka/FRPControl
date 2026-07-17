/* Providers — danh sách FRPS, thêm/sửa/xóa. */
window.Pages = window.Pages || {};
Pages['providers'] = {
  title: 'Providers',
  subtitle: 'Danh sách FRPS (server) — thêm, sửa, xóa',
  async render(root) {
    App.setToolbar(Store.can('providers.create') ? UI.btn('+ Thêm Provider', { variant: 'primary', attrs: 'id="add-provider"' }) : '', (el) => {
      el.querySelector('#add-provider')?.addEventListener('click', () => UI.openInstanceModal('frps'));
    });
    const canUpdate = Store.can('providers.update');
    const canDelete = Store.can('providers.delete');

    const providers = Store.providers();
    if (!providers.length) {
      root.innerHTML = `<div class="p-6">${UI.emptyNote({
        icon: 'fa-server',
        title: 'Chưa có Provider (FRPS) nào',
        html: `<p><b>Provider</b> = một máy chủ <b>frps</b> mà FRPControl kết nối qua Admin API (web dashboard của frps) để đọc trạng thái, client, proxy và quản lý.</p>
          <ul class="list-disc list-inside mt-1.5 space-y-0.5">
            <li>Cần frps đã bật <code>webServer</code> (port + user + password).</li>
            <li>Bấm <b>+ Thêm Provider</b> rồi nhập URL dashboard, user, password và <b>Test kết nối</b>.</li>
          </ul>`,
        action: Store.can('providers.create') ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm Provider', { size: 'sm', variant: 'primary', attrs: 'id="add-provider-empty"' }) : '',
      })}</div>`;
      root.querySelector('#add-provider-empty')?.addEventListener('click', () => UI.openInstanceModal('frps'));
      return;
    }

    const F = Fmt;
    // Bulk action: bật/tắt/xóa nhiều provider cùng lúc.
    const bulk = UI.bulkSelect({
      onDone: () => App.rerender(),
      actions: [
        ...(canUpdate ? [
          { label: 'Bật', variant: 'primary', run: (ids) => UI.bulkRun(ids, (id) => API.updateInstance(id, { enabled: true }), 'Bật provider').then(() => Store.loadInstances()) },
          { label: 'Tắt', run: (ids) => UI.bulkRun(ids, (id) => API.updateInstance(id, { enabled: false }), 'Tắt provider').then(() => Store.loadInstances()) },
        ] : []),
        ...(canDelete ? [{
          label: 'Xóa', variant: 'danger',
          confirm: (n) => `Xóa ${n} provider khỏi FRPControl? (Không ảnh hưởng frps thực tế)`,
          run: (ids) => UI.bulkRun(ids, (id) => API.deleteInstance(id), 'Xóa provider').then(() => Store.loadInstances()),
        }] : []),
      ],
    });
    const HEADERS = [bulk.th(), '', { label: 'Bật', align: 'center' }, 'Tên', 'Nhóm', 'URL', 'Trạng thái', 'Phiên bản', 'Proxy', 'Network', { label: 'Thao tác', align: 'right' }];

    // Nội dung 1 dòng theo trạng thái overview: undefined = đang tải, {reachable,...} = đã xong.
    const rowInner = (p, ov) => {
      const disabled = p.enabled === false;
      const loading = !disabled && ov === undefined;
      const reachable = !disabled && !!(ov && ov.reachable);
      const s = (ov && ov.summary) || {};
      const dot = disabled
        ? '<span class="inline-block w-2 h-2 rounded-full bg-zinc-600"></span>'
        : (loading
          ? '<span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>'
          : F.reachDot(reachable));
      const switchCell = canUpdate
        ? UI.instanceSwitch(p)
        : `<span class="text-[11px] px-2 py-0.5 rounded-full ${disabled ? 'bg-zinc-600/20 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400'}">${disabled ? 'Tắt' : 'Bật'}</span>`;
      const statusCell = disabled
        ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">Đã tắt</span>'
        : (loading
          ? '<span class="inline-flex items-center gap-1.5 text-[11px] text-amber-400"><span class="inline-block w-3 h-3 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin"></span> Đang kết nối…</span>'
          : (reachable
            ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Online</span>'
            : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Offline</span>'));
      const version = disabled ? '<span class="text-zinc-600">—</span>' : (loading ? '<span class="text-zinc-600">…</span>' : (reachable ? `<span class="text-zinc-300">v${F.escapeHtml(s.version || '?')}</span>` : '—'));
      const proxy = disabled ? '<span class="text-zinc-600">—</span>' : (loading ? '<span class="text-zinc-600">…</span>' : (reachable
        ? `<button data-goto-proxies="${p.id}" class="text-brand-400 hover:text-brand-300 hover:underline">${s.onlineProxies}/${s.totalProxies}</button> <span class="text-xs text-zinc-500">· ${s.clientCounts ?? 0} client</span>`
        : '—'));
      const network = disabled ? '<span class="text-zinc-600">—</span>' : (loading ? '<span class="text-zinc-600">…</span>' : (reachable
        ? `<span class="text-xs"><i class="fa-solid fa-arrow-down text-emerald-400"></i> ${F.formatBytes(s.totalTrafficIn)} &nbsp;<i class="fa-solid fa-arrow-up text-sky-400"></i> ${F.formatBytes(s.totalTrafficOut)}</span>`
        : `<span class="inline-flex items-center gap-1 text-red-400 cursor-help" title="${F.escapeHtml((ov && ov.error) || 'Không kết nối được')}"><i class="fa-solid fa-circle-exclamation"></i><span class="text-xs">Lỗi</span></span>`));
      return `
        ${bulk.td(p.id)}
        <td class="px-3 py-2">${dot}</td>
        <td class="px-3 py-2 text-center">${switchCell}</td>
        <td class="px-3 py-2 font-medium ${disabled ? 'text-zinc-500' : ''}">${F.escapeHtml(p.name)}</td>
        <td class="px-3 py-2 text-zinc-400">${p.group ? F.escapeHtml(p.group) : '—'}</td>
        <td class="px-3 py-2 text-xs text-zinc-400 font-mono">${F.escapeHtml(p.baseUrl)}</td>
        <td class="px-3 py-2">${statusCell}</td>
        <td class="px-3 py-2 text-sm">${version}</td>
        <td class="px-3 py-2 text-sm">${proxy}</td>
        <td class="px-3 py-2">${network}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canUpdate ? UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${p.id}"` }) : ''}
          ${canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${p.id}"` }) : ''}
        </td>`;
    };

    // Hiện bảng ngay (tất cả "đang kết nối"), rồi cập nhật TỪNG dòng khi overview của nó xong.
    const results = {};
    root.innerHTML = `<div class="p-6"><div id="bulk-bar" class="hidden"></div><div id="tbl"></div></div>`;
    const draw = () => UI.paginatedTable(root.querySelector('#tbl'), {
      headers: HEADERS,
      rows: providers.map((p) => `<tr data-ovid="${p.id}" class="border-b border-zinc-800/60 hover:bg-zinc-800/30">${rowInner(p, results[p.id])}</tr>`),
      onRender: () => bulk.sync(), // giữ lựa chọn khi đổi trang
    });
    draw();
    bulk.attach(root.querySelector('#tbl'), root.querySelector('#bulk-bar'));
    // Cập nhật in-place khi dòng đang hiển thị, fallback vẽ lại (đổi trang) đều đúng nhờ results[].
    providers.forEach((p) => {
      if (p.enabled === false) return; // provider đã tắt: không gọi API
      const apply = (ov) => {
        results[p.id] = ov;
        const tr = root.querySelector(`[data-ovid="${p.id}"]`);
        if (tr) { tr.innerHTML = rowInner(p, ov); bulk.sync(); } else draw();
      };
      API.overview(p.id).then(apply).catch((err) => apply({ reachable: false, error: err.message }));
    });

    root.addEventListener('click', (e) => {
      const tg = e.target.closest('[data-toggle-enabled]');
      if (tg) return UI.toggleInstanceEnabled(tg.dataset.toggleEnabled);
      const goto = e.target.closest('[data-goto-proxies]');
      if (goto) { Store.setProvider(goto.dataset.gotoProxies); return App.navigate('#/providers/proxies'); }
      const edit = e.target.closest('[data-edit]'); if (edit) return UI.openInstanceModal('frps', edit.dataset.edit);
      const del = e.target.closest('[data-del]'); if (del) return UI.deleteInstance(Store.getInstance(del.dataset.del));
    });
  },
};
