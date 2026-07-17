/* Nodes — danh sách FRPC, thêm/sửa/xóa. */
window.Pages = window.Pages || {};
Pages['nodes'] = {
  title: 'Nodes',
  subtitle: 'Danh sách FRPC (client) — thêm, sửa, xóa',
  async render(root) {
    App.setToolbar(Store.can('nodes.create') ? UI.btn('+ Thêm Node', { variant: 'primary', attrs: 'id="add-node"' }) : '', (el) => {
      el.querySelector('#add-node')?.addEventListener('click', () => UI.openInstanceModal('frpc'));
    });
    const canUpdate = Store.can('nodes.update');
    const canDelete = Store.can('nodes.delete');

    const nodes = Store.nodes();
    if (!nodes.length) {
      root.innerHTML = `<div class="p-6">${UI.emptyNote({
        icon: 'fa-microchip',
        title: 'Chưa có Node (FRPC) nào',
        html: `<p><b>Node</b> = một máy chủ <b>frpc</b> (client) mà FRPControl kết nối qua Admin API để xem trạng thái proxy, quản lý store proxies/visitors và cấu hình.</p>
          <ul class="list-disc list-inside mt-1.5 space-y-0.5">
            <li>Cần frpc đã bật <code>webServer</code> (port + user + password).</li>
            <li>Bấm <b>+ Thêm Node</b> rồi nhập URL dashboard, user, password và <b>Test kết nối</b>.</li>
          </ul>`,
        action: Store.can('nodes.create') ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm Node', { size: 'sm', variant: 'primary', attrs: 'id="add-node-empty"' }) : '',
      })}</div>`;
      root.querySelector('#add-node-empty')?.addEventListener('click', () => UI.openInstanceModal('frpc'));
      return;
    }

    const F = Fmt;
    // Bulk action: bật/tắt/xóa nhiều node cùng lúc.
    const bulk = UI.bulkSelect({
      onDone: () => App.rerender(),
      actions: [
        ...(canUpdate ? [
          { label: 'Bật', variant: 'primary', run: (ids) => UI.bulkRun(ids, (id) => API.updateInstance(id, { enabled: true }), 'Bật node').then(() => Store.loadInstances()) },
          { label: 'Tắt', run: (ids) => UI.bulkRun(ids, (id) => API.updateInstance(id, { enabled: false }), 'Tắt node').then(() => Store.loadInstances()) },
        ] : []),
        ...(canDelete ? [{
          label: 'Xóa', variant: 'danger',
          confirm: (n) => `Xóa ${n} node khỏi FRPControl? (Không ảnh hưởng frpc thực tế)`,
          run: (ids) => UI.bulkRun(ids, (id) => API.deleteInstance(id), 'Xóa node').then(() => Store.loadInstances()),
        }] : []),
      ],
    });
    const HEADERS = [bulk.th(), '', { label: 'Bật', align: 'center' }, 'Tên', 'Nhóm', 'URL', 'Trạng thái', 'Proxy chạy', 'Lỗi', { label: 'Thao tác', align: 'right' }];

    const rowInner = (n, ov) => {
      const disabled = n.enabled === false;
      const loading = !disabled && ov === undefined;
      const reachable = !disabled && !!(ov && ov.reachable);
      const s = (ov && ov.summary) || {};
      const dot = disabled
        ? '<span class="inline-block w-2 h-2 rounded-full bg-zinc-600"></span>'
        : (loading
          ? '<span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>'
          : F.reachDot(reachable));
      const switchCell = canUpdate
        ? UI.instanceSwitch(n)
        : `<span class="text-[11px] px-2 py-0.5 rounded-full ${disabled ? 'bg-zinc-600/20 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400'}">${disabled ? 'Tắt' : 'Bật'}</span>`;
      const statusCell = disabled
        ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">Đã tắt</span>'
        : (loading
          ? '<span class="inline-flex items-center gap-1.5 text-[11px] text-amber-400"><span class="inline-block w-3 h-3 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin"></span> Đang kết nối…</span>'
          : (reachable
            ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Online</span>'
            : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Offline</span>'));
      const proxy = disabled ? '<span class="text-zinc-600">—</span>' : (loading ? '<span class="text-zinc-600">…</span>' : (reachable
        ? `<button data-goto-proxies="${n.id}" class="text-brand-400 hover:text-brand-300 hover:underline">${s.runningProxies}/${s.totalProxies}</button>`
        : '—'));
      const problem = disabled ? '<span class="text-zinc-600">—</span>' : (loading ? '<span class="text-zinc-600">…</span>' : (reachable
        ? (s.problemProxies ? `<span class="text-red-400">${s.problemProxies}</span>` : '<span class="text-zinc-500">0</span>')
        : `<span class="inline-flex items-center gap-1 text-red-400 cursor-help" title="${F.escapeHtml((ov && ov.error) || 'Không kết nối được')}"><i class="fa-solid fa-circle-exclamation"></i><span class="text-xs">Lỗi</span></span>`));
      return `
        ${bulk.td(n.id)}
        <td class="px-3 py-2">${dot}</td>
        <td class="px-3 py-2 text-center">${switchCell}</td>
        <td class="px-3 py-2 font-medium ${disabled ? 'text-zinc-500' : ''}">${F.escapeHtml(n.name)}</td>
        <td class="px-3 py-2 text-zinc-400">${n.group ? F.escapeHtml(n.group) : '—'}</td>
        <td class="px-3 py-2 text-xs text-zinc-400 font-mono">${F.escapeHtml(n.baseUrl)}</td>
        <td class="px-3 py-2">${statusCell}</td>
        <td class="px-3 py-2 text-sm">${proxy}</td>
        <td class="px-3 py-2 text-sm">${problem}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canUpdate ? UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${n.id}"` }) : ''}
          ${canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${n.id}"` }) : ''}
        </td>`;
    };

    const results = {};
    root.innerHTML = `<div class="p-6"><div id="bulk-bar" class="hidden"></div><div id="tbl"></div></div>`;
    const draw = () => UI.paginatedTable(root.querySelector('#tbl'), {
      headers: HEADERS,
      rows: nodes.map((n) => `<tr data-ovid="${n.id}" class="border-b border-zinc-800/60 hover:bg-zinc-800/30">${rowInner(n, results[n.id])}</tr>`),
      onRender: () => bulk.sync(), // giữ lựa chọn khi đổi trang
    });
    draw();
    bulk.attach(root.querySelector('#tbl'), root.querySelector('#bulk-bar'));
    nodes.forEach((n) => {
      if (n.enabled === false) return; // node đã tắt: không gọi API
      const apply = (ov) => {
        results[n.id] = ov;
        const tr = root.querySelector(`[data-ovid="${n.id}"]`);
        if (tr) { tr.innerHTML = rowInner(n, ov); bulk.sync(); } else draw();
      };
      API.overview(n.id).then(apply).catch((err) => apply({ reachable: false, error: err.message }));
    });

    root.addEventListener('click', (e) => {
      const tg = e.target.closest('[data-toggle-enabled]');
      if (tg) return UI.toggleInstanceEnabled(tg.dataset.toggleEnabled);
      const goto = e.target.closest('[data-goto-proxies]');
      if (goto) { Store.setNode(goto.dataset.gotoProxies); return App.navigate('#/nodes/proxies'); }
      const edit = e.target.closest('[data-edit]'); if (edit) return UI.openInstanceModal('frpc', edit.dataset.edit);
      const del = e.target.closest('[data-del]'); if (del) return UI.deleteInstance(Store.getInstance(del.dataset.del));
    });
  },
};
