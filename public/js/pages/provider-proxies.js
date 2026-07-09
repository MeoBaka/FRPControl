/* Provider Proxies — proxy của 1 provider được chọn (ảnh 5). */
window.Pages = window.Pages || {};
Pages['providers/proxies'] = {
  title: 'Provider Proxies',
  subtitle: 'Toàn bộ proxy đang đăng ký trên FRPS',
  async render(root) {
    const providers = Store.providers();
    App.setToolbar(
      UI.btn('<i class="fa-solid fa-rotate-right"></i> Refresh', { size: 'sm', attrs: 'id="refresh"' }) +
      (Store.can('proxies.delete') ? UI.btn('<i class="fa-solid fa-trash-can"></i> Clear Offline', { size: 'sm', variant: 'danger', attrs: 'id="clear-offline"' }) : ''),
      (el) => {
        el.querySelector('#refresh')?.addEventListener('click', () => App.rerender());
        el.querySelector('#clear-offline')?.addEventListener('click', async () => {
          const provider = Store.selectedProvider(); if (!provider) return;
          if (!confirm('Xóa các proxy offline khỏi FRPS?')) return;
          try { await API.clearOffline(provider.id); UI.toast('Đã xóa proxy offline.', 'success'); App.rerender(); }
          catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
        });
      }
    );
    if (!providers.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có provider nào.')}</div>`; return; }

    const F = Fmt;
    const provider = Store.selectedProvider();
    const data = await API.overview(provider.id);
    const reachable = data.reachable;
    const proxies = reachable ? (data.proxies || []) : [];

    const TYPES = ['ALL', 'TCP', 'UDP', 'HTTP', 'HTTPS', 'TCPMUX', 'STCP', 'XTCP', 'SUDP'];
    const clientIds = [...new Set(proxies.map((p) => p.clientId).filter(Boolean))];
    const statuses = [...new Set(proxies.map((p) => p.status).filter(Boolean))].sort();
    // Được điều hướng từ Status -> lọc sẵn (proxy có kết nối / proxy online)
    const preConn = sessionStorage.getItem('open.proxyConn'); sessionStorage.removeItem('open.proxyConn');
    const preStatus = sessionStorage.getItem('open.proxyStatus'); sessionStorage.removeItem('open.proxyStatus');
    const state = { type: 'ALL', q: '', client: '', conn: preConn === 'active' ? 'active' : 'all', status: preStatus || 'all' };

    const HEADERS = ['Tên', 'Loại', 'Port', { label: 'Kết nối', align: 'right' }, 'Client', { label: 'Network', align: 'right' }, 'Trạng thái'];
    const rowHtml = (p) => `
      <tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
        <td class="px-3 py-2 font-medium"><button data-open-node-proxy="${F.escapeHtml(p.name)}" title="Sang Node Proxies tìm proxy này" class="text-brand-400 hover:text-brand-300 hover:underline">${F.escapeHtml(p.name)}</button></td>
        <td class="px-3 py-2">${F.typeTag(p.type)}</td>
        <td class="px-3 py-2 tabular-nums">${p.conf?.remotePort ?? '—'}</td>
        <td class="px-3 py-2 text-right tabular-nums ${(p.curConns ?? 0) > 0 ? 'text-emerald-400 font-medium' : 'text-zinc-500'}">${p.curConns ?? 0}</td>
        <td class="px-3 py-2 font-mono text-xs">${p.clientId
          ? `<button data-open-client="${F.escapeHtml(p.clientId)}" class="text-brand-400 hover:text-brand-300 hover:underline">${F.escapeHtml(p.clientId)}</button>`
          : '<span class="text-zinc-400">—</span>'}</td>
        <td class="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums"><i class="fa-solid fa-arrow-down text-emerald-400"></i> ${F.formatBytes(p.todayTrafficIn)} &nbsp;<i class="fa-solid fa-arrow-up text-sky-400"></i> ${F.formatBytes(p.todayTrafficOut)}</td>
        <td class="px-3 py-2">${F.statusPill(p.status)}</td>
      </tr>`;

    const tabHtml = () => TYPES.map((t) => {
      const active = state.type === t;
      return `<button data-type="${t}" class="px-3 py-1 rounded-full text-xs transition ${active ? 'bg-zinc-100 text-zinc-900 font-medium' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'}">${t}</button>`;
    }).join('');

    const applyFilter = () => proxies.filter((p) => {
      const conns = p.curConns ?? 0;
      const q = state.q;
      const matchQ = !q || p.name.toLowerCase().includes(q) || String(p.conf?.remotePort ?? '').includes(q);
      return (state.type === 'ALL' || p.type.toUpperCase() === state.type) &&
        (!state.client || p.clientId === state.client) &&
        (state.status === 'all' || p.status === state.status) &&
        (state.conn === 'all' || (state.conn === 'active' ? conns > 0 : conns === 0)) &&
        matchQ;
    });
    const draw = () => UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows: applyFilter().map(rowHtml), emptyText: 'Không có proxy phù hợp.' });

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-3">
        ${UI.selectorBar('provider')}
        <input id="q" placeholder="Tìm theo tên hoặc port..." class="flex-1 min-w-[180px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        <select id="status-filter" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
          <option value="all" ${state.status === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
          ${statuses.map((s) => `<option value="${F.escapeHtml(s)}" ${state.status === s ? 'selected' : ''}>${F.escapeHtml(s)}</option>`).join('')}
        </select>
        <select id="conn-filter" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
          <option value="all" ${state.conn === 'all' ? 'selected' : ''}>Tất cả kết nối</option>
          <option value="active" ${state.conn === 'active' ? 'selected' : ''}>Có kết nối (&gt;0)</option>
          <option value="idle" ${state.conn === 'idle' ? 'selected' : ''}>Không kết nối (0)</option>
        </select>
        <select id="client-filter" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
          <option value="">All Clients</option>
          ${clientIds.map((c) => `<option value="${F.escapeHtml(c)}">${F.escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      ${reachable ? `<div id="tabs" class="flex flex-wrap gap-2 mb-4">${tabHtml()}</div><div id="tbl"></div>`
                  : UI.errorBox('Không kết nối được.', data.error || '')}
    </div>`;
    UI.wireSelector(root);

    if (!reachable) return;
    draw();
    // Click vào Client -> mở trang chi tiết client (cùng provider đang chọn)
    root.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-open-client]');
      if (c) { sessionStorage.setItem('open.client', c.dataset.openClient); return App.navigate('#/providers/clients'); }
      // Click tên proxy -> tìm ĐÚNG node chứa proxy này rồi sang Node Proxies (lọc sẵn theo tên)
      const np = e.target.closest('[data-open-node-proxy]');
      if (np) {
        const name = np.dataset.openNodeProxy;
        sessionStorage.setItem('node.proxysearch', name);
        const nodes = Store.nodes();
        if (nodes.length > 1) {
          np.disabled = true;
          try {
            const res = await Promise.all(nodes.map((n) =>
              API.overview(n.id).then((ov) => ({ id: n.id, has: (ov.proxies || []).some((p) => p.name === name) })).catch(() => ({ id: n.id, has: false }))));
            const owner = res.find((r) => r.has);
            if (owner) Store.setNode(owner.id);
            else UI.toast(`Proxy "${name}" không thuộc node nào được quản lý.`, 'info');
          } catch { /* ignore */ }
        }
        App.navigate('#/nodes/proxies');
      }
    });
    root.querySelector('#q').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); draw(); });
    root.querySelector('#status-filter').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    root.querySelector('#conn-filter').addEventListener('change', (e) => { state.conn = e.target.value; draw(); });
    root.querySelector('#client-filter').addEventListener('change', (e) => { state.client = e.target.value; draw(); });
    root.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      state.type = b.dataset.type;
      root.querySelector('#tabs').innerHTML = tabHtml();
      draw();
    });
  },
};
