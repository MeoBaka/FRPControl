/* Provider Status — thông tin server của 1 provider được chọn (ảnh 2). */
window.Pages = window.Pages || {};
Pages['providers/status'] = {
  title: 'Provider Status',
  subtitle: 'Thông tin & cấu hình FRPS',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));

    const providers = Store.activeProviders();
    if (!providers.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có provider nào đang bật.', 'Tất cả provider đã tắt — bật lại ở trang Providers.')}</div>`; return; }
    const provider = Store.selectedProvider();

    const bar = `<div class="flex flex-wrap items-center gap-3 mb-4">${UI.selectorBar('provider')}</div>`;
    root.innerHTML = `<div class="p-6">${bar}<div id="content">${UI.spinner()}</div></div>`;
    UI.wireSelector(root);

    const content = root.querySelector('#content');
    const data = await API.overview(provider.id);
    if (!data.reachable) { content.innerHTML = UI.errorBox('Không kết nối được tới provider.', data.error || ''); return; }
    const info = data.serverInfo || {};
    const s = data.summary || {};
    const F = Fmt;

    const cfgItem = (label, value, accent = '') => `
      <div class="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
        <div class="text-[11px] text-zinc-500">${label}</div>
        <div class="text-sm font-medium mt-0.5 ${accent}">${value}</div>
      </div>`;

    const proxyTypes = info.proxyTypeCount || {};
    const typeCards = Object.keys(proxyTypes).length
      ? Object.entries(proxyTypes).map(([t, n]) => `
          <div class="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center min-w-[90px]">
            <div class="text-[11px] uppercase text-zinc-500">${F.escapeHtml(t)}</div>
            <div class="text-xl font-semibold mt-0.5">${n}</div>
          </div>`).join('')
      : `<div class="text-sm text-zinc-500">Không có proxy.</div>`;

    content.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${UI.statCard({ label: 'Connected clients', value: s.clientCounts ?? 0, icon: '<i class="fa-solid fa-users text-brand-400"></i>', attrs: 'data-goto-clients="1" title="Xem client kết nối"' })}
          ${UI.statCard({ label: 'Active proxies', value: s.onlineProxies ?? 0, sub: `tổng ${s.totalProxies ?? 0}`, icon: '<i class="fa-solid fa-diagram-project text-emerald-400"></i>', attrs: 'data-goto-online="1" title="Xem proxy đang online"' })}
          ${UI.statCard({ label: 'Current connections', value: s.curConns ?? 0, icon: '<i class="fa-solid fa-plug text-sky-400"></i>', attrs: 'data-goto-conn="active" title="Xem proxy đang có kết nối"' })}
          ${UI.statCard({ label: 'Traffic hôm nay', value: F.formatBytes((s.totalTrafficIn||0)+(s.totalTrafficOut||0)), icon: '<i class="fa-solid fa-chart-line text-amber-400"></i>' })}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${UI.card('Network Traffic <span class="text-[11px] text-zinc-500">(hôm nay)</span>', `
            <div class="p-5 grid grid-cols-2 gap-4">
              <div><div class="text-xs text-zinc-500 flex items-center gap-1.5"><i class="fa-solid fa-arrow-down text-emerald-400"></i> Inbound</div><div class="text-2xl font-semibold mt-1">${F.formatBytes(s.totalTrafficIn)}</div></div>
              <div><div class="text-xs text-zinc-500 flex items-center gap-1.5"><i class="fa-solid fa-arrow-up text-sky-400"></i> Outbound</div><div class="text-2xl font-semibold mt-1">${F.formatBytes(s.totalTrafficOut)}</div></div>
            </div>`)}
          ${UI.card('Proxy Types', `<div class="p-5 flex flex-wrap gap-3">${typeCards}</div>`)}
        </div>

        ${UI.card(`Server Configuration <span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">v${F.escapeHtml(info.version || '?')}</span>`, `
          <div class="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            ${cfgItem('Bind Port', info.bindPort ?? '—')}
            ${cfgItem('Max Pool Count', info.maxPoolCount ?? '—')}
            ${cfgItem('Max Ports/Client', (info.maxPortsPerClient ? info.maxPortsPerClient : 'no limit'))}
            ${cfgItem('Allow Ports', info.allowPortsStr || 'all')}
            ${cfgItem('TLS Force', info.tlsForce ? '<span class="text-emerald-400">Enabled</span>' : '<span class="text-zinc-400">Disabled</span>')}
            ${cfgItem('Heartbeat Timeout', `${info.heartbeatTimeout ?? info.heartBeatTimeout ?? '—'}s`)}
            ${cfgItem('vhost HTTP Port', info.vhostHTTPPort || '—')}
            ${cfgItem('vhost HTTPS Port', info.vhostHTTPSPort || '—')}
            ${cfgItem('KCP Bind Port', info.kcpBindPort || '—')}
            ${cfgItem('QUIC Bind Port', info.quicBindPort || '—')}
            ${cfgItem('Subdomain Host', info.subdomainHost || '—')}
            ${cfgItem('TCPMux HTTP Connect', info.tcpmuxHTTPConnectPort || '—')}
          </div>`)}
      </div>`;

    // Các stat card bấm được -> điều hướng nhanh (giữ nguyên provider đang chọn)
    content.querySelector('[data-goto-conn]')?.addEventListener('click', () => {
      sessionStorage.setItem('open.proxyConn', 'active');
      App.navigate('#/providers/proxies');
    });
    content.querySelector('[data-goto-online]')?.addEventListener('click', () => {
      sessionStorage.setItem('open.proxyStatus', 'online');
      App.navigate('#/providers/proxies');
    });
    content.querySelector('[data-goto-clients]')?.addEventListener('click', () => {
      App.navigate('#/providers/clients');
    });
  },
};
