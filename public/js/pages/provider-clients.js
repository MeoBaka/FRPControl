/* Provider Clients — client của 1 provider được chọn (ảnh 3) + chi tiết (ảnh 4). */
window.Pages = window.Pages || {};
Pages['providers/clients'] = {
  title: 'Provider Clients',
  subtitle: 'Client (frpc) kết nối tới FRPS',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));
    const providers = Store.activeProviders();
    if (!providers.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có provider nào đang bật.', 'Tất cả provider đã tắt — bật lại ở trang Providers.')}</div>`; return; }
    const provider = Store.selectedProvider();
    // Nếu được điều hướng kèm yêu cầu mở 1 client cụ thể (từ trang Proxies)
    const openKey = sessionStorage.getItem('open.client');
    if (openKey) { sessionStorage.removeItem('open.client'); await renderDetail(root, provider, openKey); return; }
    await renderList(root, provider);
  },
};

async function renderList(root, provider) {
  const F = Fmt;
  const { clients } = await API.clients(provider.id);
  const online = clients.filter((c) => c.online).length;

  const HEADERS = ['', 'Client ID', 'Hostname', 'Version', 'Protocol', 'IP', 'Kết nối lúc', 'Trạng thái'];
  const rowHtml = (c) => `
    <tr data-client="${F.escapeHtml(c.key)}" class="client-row border-b border-zinc-800/60 hover:bg-zinc-800/40 cursor-pointer">
      <td class="px-3 py-2">${F.reachDot(c.online)}</td>
      <td class="px-3 py-2 font-medium">${F.escapeHtml(c.key)}</td>
      <td class="px-3 py-2 text-zinc-400">${F.escapeHtml(c.hostname || '—')}</td>
      <td class="px-3 py-2">${c.version ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">v${F.escapeHtml(c.version)}</span>` : '—'}</td>
      <td class="px-3 py-2 text-zinc-400">${F.escapeHtml(c.wireProtocol || '—')}</td>
      <td class="px-3 py-2 font-mono text-xs text-zinc-300">${F.escapeHtml(c.clientIP || '—')}</td>
      <td class="px-3 py-2 text-xs text-zinc-500">${F.timeAgo(c.lastConnectedAt)}</td>
      <td class="px-3 py-2">${c.online
        ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Online</span>'
        : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">Offline</span>'}</td>
    </tr>`;

  root.innerHTML = `<div id="clients-view" class="p-6">
    <div class="flex flex-wrap items-center gap-3 mb-4">
      ${UI.selectorBar('provider')}
      <span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Online ${online}</span>
      <span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">Offline ${clients.length - online}</span>
      <input id="client-search" placeholder="Tìm client..." class="ml-auto rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm w-64 focus:border-brand-500 focus:outline-none" />
    </div>
    <div id="tbl"></div>
  </div>`;
  UI.wireSelector(root);

  const view = root.querySelector('#clients-view');
  const draw = (items) => UI.paginatedTable(view.querySelector('#tbl'), { headers: HEADERS, rows: items.map(rowHtml), emptyText: 'Chưa có client nào kết nối.' });
  draw(clients);

  const search = view.querySelector('#client-search');
  search?.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    draw(clients.filter((c) => (c.key + (c.hostname || '') + (c.clientIP || '')).toLowerCase().includes(q)));
  });

  view.addEventListener('click', (e) => {
    const row = e.target.closest('.client-row');
    if (row) renderDetail(root, provider, row.dataset.client);
  });
}

async function renderDetail(root, provider, key) {
  const F = Fmt;
  root.innerHTML = UI.spinner('Đang tải client...');
  const { client, proxies, curConns } = await API.client(provider.id, key);

  const info = (label, value) => `<div><span class="text-zinc-500 text-xs">${label}:</span> <span class="text-sm font-medium">${value}</span></div>`;
  const rows = proxies.map((p) => `
    <tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
      <td class="px-3 py-2 font-medium">${F.escapeHtml(p.name)}</td>
      <td class="px-3 py-2">${F.typeTag(p.type)}</td>
      <td class="px-3 py-2">${F.statusPill(p.status)}</td>
      <td class="px-3 py-2 text-right tabular-nums">${p.curConns ?? 0}</td>
      <td class="px-3 py-2 text-right tabular-nums text-emerald-400">${F.formatBytes(p.todayTrafficIn)}</td>
      <td class="px-3 py-2 text-right tabular-nums text-sky-400">${F.formatBytes(p.todayTrafficOut)}</td>
    </tr>`);

  root.innerHTML = `<div class="p-6 space-y-4">
    <button id="back" class="text-sm text-zinc-400 hover:text-zinc-200"><i class="fa-solid fa-arrow-left"></i> Clients</button>
    <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-brand-600/80 flex items-center justify-center font-semibold">${F.escapeHtml((client.hostname || client.key || '?').slice(0,2))}</div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-semibold">${F.escapeHtml(client.key)}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">v${F.escapeHtml(client.version || '?')}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300">Protocol ${F.escapeHtml(client.wireProtocol || '?')}</span>
            </div>
            <div class="text-sm text-zinc-500 mt-0.5">${F.escapeHtml(client.clientIP || '')} ${client.hostname ? '· ' + F.escapeHtml(client.hostname) : ''}</div>
          </div>
        </div>
        <span class="text-[11px] px-2.5 py-1 rounded-full ${client.online ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-600/20 text-zinc-400 border border-zinc-600/40'}">${client.online ? 'Online' : 'Offline'}</span>
      </div>
      <div class="flex flex-wrap gap-x-8 gap-y-2 mt-4 pt-4 border-t border-zinc-800">
        ${info('Connections', curConns ?? 0)}
        ${info('Run ID', F.escapeHtml(client.runID || '—'))}
        ${info('Protocol', F.escapeHtml(client.wireProtocol || '—'))}
        ${info('First Connected', F.timeAgo(client.firstConnectedAt))}
        ${info('Connected', F.timeAgo(client.lastConnectedAt))}
      </div>
    </div>
    <div id="proxy-tbl"></div>
  </div>`;

  UI.paginatedTable(root.querySelector('#proxy-tbl'), {
    headers: ['Tên', 'Loại', 'Trạng thái', { label: 'Kết nối', align: 'right' }, { label: 'Vào', align: 'right' }, { label: 'Ra', align: 'right' }],
    rows, emptyText: 'Client chưa có proxy nào.',
  });

  root.querySelector('#back').addEventListener('click', () => renderList(root, provider));
}
