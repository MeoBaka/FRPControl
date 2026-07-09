/* Node Proxies — 1 node được chọn: tab Status (ảnh 6) + tab Store (CRUD, form ảnh 7). */
window.Pages = window.Pages || {};

const PROXY_TYPES = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'sudp', 'xtcp'];

// Giải thích ngắn cho từng loại proxy (hiện dưới ô Type trong form)
const PROXY_TYPE_INFO = {
  tcp: { icon: 'fa-plug', title: 'TCP — chuyển tiếp cổng TCP', desc: 'frps mở <b>Remote Port</b> công khai; mọi kết nối tới cổng đó được đẩy về dịch vụ local (localIP:localPort). Hợp SSH, database, API, game… bất kỳ dịch vụ TCP nào.' },
  udp: { icon: 'fa-plug', title: 'UDP — chuyển tiếp cổng UDP', desc: 'Như TCP nhưng cho giao thức UDP. Hợp DNS, game, VoIP, WireGuard…' },
  http: { icon: 'fa-globe', title: 'HTTP — web theo tên miền', desc: 'frps nhận request ở cổng vhostHTTP (vd 80) và định tuyến theo <b>Host header</b> (Custom Domains/Subdomain) về dịch vụ local. Nhiều web chung 1 cổng.' },
  https: { icon: 'fa-lock', title: 'HTTPS — web TLS theo tên miền', desc: 'Như HTTP nhưng ở cổng vhostHTTPS (vd 443), định tuyến theo SNI/Host. Thường passthrough TLS thẳng tới dịch vụ local.' },
  tcpmux: { icon: 'fa-layer-group', title: 'TCPMUX — ghép nhiều TCP qua 1 cổng', desc: 'Ghép nhiều dịch vụ TCP qua <b>một</b> cổng bằng multiplexer (httpconnect), định tuyến theo Custom Domains. Tiết kiệm cổng.' },
  stcp: { icon: 'fa-user-shield', title: 'STCP — TCP bảo mật (Secret)', desc: 'KHÔNG mở cổng public trên frps. Chỉ ai có <b>visitor</b> cùng tên + cùng <b>Secret Key</b> mới kết nối được. An toàn hơn TCP.' },
  sudp: { icon: 'fa-user-shield', title: 'SUDP — UDP bảo mật (Secret)', desc: 'Như STCP nhưng cho giao thức UDP.' },
  xtcp: { icon: 'fa-bolt', title: 'XTCP — kết nối P2P trực tiếp', desc: 'Bắt tay qua frps rồi 2 máy nối <b>trực tiếp P2P</b> (NAT traversal) → nhanh, giảm tải server. Cần visitor + Secret Key; có thể fallback về STCP nếu P2P thất bại.' },
};
function proxyTypeNote(type) {
  const i = PROXY_TYPE_INFO[type];
  if (!i) return '';
  return `<div class="rounded-lg bg-zinc-800/40 border border-zinc-700/60 p-3 text-[11px] text-zinc-400 leading-relaxed">
    <span class="text-zinc-300 font-medium"><i class="fa-solid ${i.icon} text-brand-400"></i> ${i.title}</span> — ${i.desc}
  </div>`;
}

// Backend Mode = Plugin: các loại plugin của frpc + field cấu hình (khớp pkg/config/v1/plugin).
const PLUGIN_TYPES = ['http2https', 'http2http', 'https2http', 'https2https', 'http_proxy', 'socks5', 'static_file', 'unix_domain_socket', 'tls2raw', 'virtual_net'];
const PLUGIN_FIELDS = {
  http2https: [['localAddr', 'Local Addr', '127.0.0.1:443'], ['hostHeaderRewrite', 'Host Header Rewrite', '']],
  http2http: [['localAddr', 'Local Addr', '127.0.0.1:80'], ['hostHeaderRewrite', 'Host Header Rewrite', '']],
  https2http: [['localAddr', 'Local Addr', '127.0.0.1:80'], ['hostHeaderRewrite', 'Host Header Rewrite', ''], ['crtPath', 'Cert Path (crt)', ''], ['keyPath', 'Key Path', '']],
  https2https: [['localAddr', 'Local Addr', '127.0.0.1:443'], ['hostHeaderRewrite', 'Host Header Rewrite', ''], ['crtPath', 'Cert Path (crt)', ''], ['keyPath', 'Key Path', '']],
  http_proxy: [['httpUser', 'HTTP User', ''], ['httpPassword', 'HTTP Password', '']],
  socks5: [['username', 'Username', ''], ['password', 'Password', '']],
  static_file: [['localPath', 'Local Path', '/var/www'], ['stripPrefix', 'Strip Prefix', ''], ['httpUser', 'HTTP User', ''], ['httpPassword', 'HTTP Password', '']],
  unix_domain_socket: [['unixPath', 'Unix Path', '/var/run/app.sock']],
  tls2raw: [['localAddr', 'Local Addr', '127.0.0.1:80'], ['crtPath', 'Cert Path (crt)', ''], ['keyPath', 'Key Path', '']],
  virtual_net: [],
};
// Chiều đi + mô tả từng plugin (pub = giao thức ở cổng public/remote, local = dịch vụ backend).
const PLUGIN_INFO = {
  http2https: { pub: 'HTTP', local: 'HTTPS', cert: false, desc: 'Nhận HTTP ở cổng public → đẩy tới dịch vụ local là HTTPS. Truy cập bằng http://…' },
  http2http: { pub: 'HTTP', local: 'HTTP', cert: false, desc: 'Reverse proxy HTTP → HTTP, có thể rewrite Host header. Truy cập bằng http://…' },
  https2http: { pub: 'HTTPS', local: 'HTTP', cert: true, desc: 'Đưa web HTTP local ra HTTPS công khai — chính là "expose panel HTTP thành HTTPS". Truy cập bằng https://…' },
  https2https: { pub: 'HTTPS', local: 'HTTPS', cert: true, desc: 'Public HTTPS → backend cũng HTTPS. Truy cập bằng https://…' },
  http_proxy: { pub: 'HTTP proxy', local: '—', cert: false, desc: 'Biến proxy thành một forward HTTP proxy (có thể đặt user/pass).' },
  socks5: { pub: 'SOCKS5', local: '—', cert: false, desc: 'Biến proxy thành SOCKS5 proxy (có thể đặt user/pass).' },
  static_file: { pub: 'HTTP (file)', local: 'thư mục', cert: false, desc: 'Phục vụ file tĩnh từ Local Path; có thể đặt user/pass để bảo vệ.' },
  unix_domain_socket: { pub: 'TCP', local: 'unix socket', cert: false, desc: 'Chuyển tiếp tới Unix domain socket local (Unix Path).' },
  tls2raw: { pub: 'TLS', local: 'raw TCP', cert: true, desc: 'Gỡ TLS ở cổng public rồi chuyển raw TCP tới backend (cần cert).' },
  virtual_net: { pub: '—', local: '—', cert: false, desc: 'Mạng ảo (virtual network) giữa các client frp.' },
};

Pages['nodes/proxies'] = {
  title: 'Node Proxies',
  subtitle: 'Proxy trên FRPC — trạng thái live + quản lý store',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));
    const nodes = Store.nodes();
    if (!nodes.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có node nào.')}</div>`; return; }
    const node = Store.selectedNode();

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">${UI.selectorBar('node')}</div>
      <div id="tab-body">${UI.spinner()}</div>
    </div>`;
    UI.wireSelector(root);
    await renderProxies(root.querySelector('#tab-body'), node);
  },
};

// ---------------- Bảng gộp: trạng thái live + quản lý store ----------------
async function renderProxies(body, node) {
  const F = Fmt;
  // Lấy song song: trạng thái live + định nghĩa store (kèm serverAddr). Lỗi 1 bên vẫn hiển thị bên kia.
  const [ov, store] = await Promise.all([
    API.overview(node.id).catch((e) => ({ reachable: false, error: e.message, proxies: [] })),
    API.getStore(node.id).catch(() => ({ enabled: false, proxies: [], serverAddr: '' })),
  ]);
  if (!ov.reachable && !store.enabled) { body.innerHTML = UI.errorBox('Không kết nối được.', ov.error || ''); return; }

  const canCreate = Store.can('proxies.create');
  const canUpdate = Store.can('proxies.update');
  const canDelete = Store.can('proxies.delete');
  const storeEnabled = Boolean(store.enabled);
  const frpsHost = String(store.serverAddr || '').trim(); // host FRPS thật (serverAddr), dùng fallback

  const live = ov.proxies || [];
  const storeDefs = store.proxies || [];
  const storeByName = new Map(storeDefs.map((d) => [d.name, d]));
  const liveNames = new Set(live.map((p) => p.name));
  // Gộp: proxy live + proxy store chưa xuất hiện trong status (vừa thêm, chưa nạp).
  const rows0 = [
    ...live.map((p) => ({ ...p, def: storeByName.get(p.name) || null, isStore: storeByName.has(p.name) })),
    ...storeDefs.filter((d) => !liveNames.has(d.name)).map((d) => ({ name: d.name, type: d.type, status: 'new', remoteAddr: '', localAddr: '', source: 'store', err: '', def: d, isStore: true })),
  ];

  const cell = (url, text) => url
    ? `<a href="${F.escapeHtml(url)}" target="_blank" rel="noopener" class="font-mono text-xs text-brand-400 hover:text-brand-300 hover:underline">${F.escapeHtml(text || url)}</a>`
    : (text ? `<span class="font-mono text-xs text-zinc-400">${F.escapeHtml(text)}</span>` : '<span class="text-zinc-500">—</span>');

  const localOf = (p) => {
    const cfg = p.def ? (p.def[p.def.type] || {}) : {};
    let text = '';
    if (cfg.plugin && cfg.plugin.type) {
      // Backend = Plugin: dùng localAddr/localPath/unixPath của plugin.
      const pl = cfg.plugin;
      text = pl.localAddr || pl.localPath || pl.unixPath || `plugin: ${pl.type}`;
    } else {
      text = p.localAddr || ((cfg.localIP || cfg.localPort != null) ? `${cfg.localIP || '127.0.0.1'}:${cfg.localPort ?? '?'}` : '');
    }
    const url = /:\d+$/.test(text) ? 'http://' + (text.startsWith(':') ? '127.0.0.1' + text : text) : null;
    return { url, text };
  };
  // Scheme của cổng public: plugin https2http/https2https/tls2raw hoặc type=https -> https, còn lại http.
  const remoteScheme = (p) => {
    const cfg = p.def ? (p.def[p.def.type] || {}) : {};
    const pt = cfg.plugin && cfg.plugin.type;
    if (pt && /^(https2http|https2https|tls2raw)$/.test(pt)) return 'https';
    if (String(p.type).toLowerCase() === 'https') return 'https';
    return 'http';
  };
  // URL remote đúng IP: ưu tiên remote_addr (live) → serverAddr; port từ remote_addr → remotePort của def.
  const remoteOf = (p) => {
    const cfg = p.def ? (p.def[p.def.type] || {}) : {};
    let host = '', port = '';
    const ra = String(p.remoteAddr || '');
    const m = ra.match(/^(.*):(\d+)$/);
    if (m) { host = m[1]; port = m[2]; }
    else if (/^\d+$/.test(ra)) { port = ra; }
    else if (ra) { host = ra; }
    if (!host) host = frpsHost;
    if (!port && cfg.remotePort != null) port = String(cfg.remotePort);
    if (host && port) { const url = `${remoteScheme(p)}://${host}:${port}`; return { url, text: url }; }
    return { url: null, text: port ? `:${port}` : '' };
  };

  // Toggle bật/tắt proxy store (enable !== false = bật). Bấm để đảo trạng thái.
  const enableSwitch = (p) => {
    const on = (p.def ? (p.def[p.def.type] || {}) : {}).enabled !== false;
    return `<button type="button" data-toggle="${F.escapeHtml(p.name)}" role="switch" aria-checked="${on}" title="${on ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}" class="align-middle relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-zinc-600'}"><span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}"></span></button>`;
  };

  const TYPES = ['ALL', 'TCP', 'UDP', 'HTTP', 'HTTPS', 'TCPMUX', 'STCP', 'XTCP', 'SUDP'];
  // Được điều hướng từ Provider Proxies (click tên) -> lọc sẵn theo tên/port proxy.
  const preSearch = sessionStorage.getItem('node.proxysearch') || '';
  if (preSearch) sessionStorage.removeItem('node.proxysearch');
  const state = { status: 'all', source: '', type: 'ALL', q: preSearch.toLowerCase() };
  const counts = () => ({
    all: rows0.length,
    running: rows0.filter((p) => p.status === 'running').length,
    error: rows0.filter((p) => ['error', 'start error', 'closed'].includes(p.status)).length,
    waiting: rows0.filter((p) => ['wait start', 'new', 'check config'].includes(p.status)).length,
  });
  const chip = (key, label, c) => `<button data-status="${key}" class="px-3 py-1 rounded-full text-xs transition ${state.status === key ? 'bg-zinc-100 text-zinc-900 font-medium' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'}">${label} ${c[key]}</button>`;
  const chipsHtml = () => { const c = counts(); return `${chip('all', 'All', c)} ${chip('running', 'Running', c)} ${chip('error', 'Error', c)} ${chip('waiting', 'Waiting', c)}`; };
  const typeHtml = () => TYPES.map((t) => `<button data-type="${t}" class="px-3 py-1 rounded-full text-xs transition ${state.type === t ? 'bg-zinc-100 text-zinc-900 font-medium' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'}">${t}</button>`).join('');

  const HEADERS = ['Tên', 'Loại', 'Trạng thái', 'URL Local', { label: 'URL Remote', align: 'right' }, 'Source', 'Lỗi', { label: 'Thao tác', align: 'right' }];
  const rowHtml = (p) => {
    const loc = localOf(p); const rem = remoteOf(p);
    const nameCell = p.isStore
      ? `<button data-edit="${F.escapeHtml(p.name)}" class="font-medium text-brand-400 hover:text-brand-300 hover:underline">${F.escapeHtml(p.name)}</button>`
      : `<span class="font-medium">${F.escapeHtml(p.name)}</span>`;
    return `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
      <td class="px-3 py-2">${nameCell}</td>
      <td class="px-3 py-2">${F.typeTag(p.type)}</td>
      <td class="px-3 py-2">${F.statusPill(p.status)}</td>
      <td class="px-3 py-2">${cell(loc.url, loc.text)}</td>
      <td class="px-3 py-2 text-right">${cell(rem.url, rem.text)}</td>
      <td class="px-3 py-2 text-xs text-zinc-500">${F.escapeHtml(p.source || '—')}</td>
      <td class="px-3 py-2 text-xs text-red-400">${F.escapeHtml(p.err || '')}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">
        ${p.isStore && canUpdate ? enableSwitch(p) + ' ' : ''}
        ${p.isStore && canUpdate ? UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${F.escapeHtml(p.name)}"` }) : ''}
        ${p.isStore && canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${F.escapeHtml(p.name)}"` }) : ''}
        ${!p.isStore ? '<span class="text-[10px] text-zinc-600">config tĩnh</span>' : ''}
      </td></tr>`;
  };

  const applyFilter = () => rows0.filter((p) => {
    if (state.status === 'running' && p.status !== 'running') return false;
    if (state.status === 'error' && !['error', 'start error', 'closed'].includes(p.status)) return false;
    if (state.status === 'waiting' && !['wait start', 'new', 'check config'].includes(p.status)) return false;
    if (state.source && p.source !== state.source) return false;
    if (state.type !== 'ALL' && String(p.type).toUpperCase() !== state.type) return false;
    if (state.q && !(p.name.toLowerCase().includes(state.q) || remoteOf(p).text.toLowerCase().includes(state.q))) return false;
    return true;
  });
  const emptyHtml = (rows0.length === 0 && storeEnabled) ? UI.emptyNote({
    icon: 'fa-right-left', title: 'Chưa có proxy nào',
    html: `<p>Store là danh sách proxy <b>động</b> frpc đọc từ file — Thêm/Sửa/Xóa qua giao diện, không cần sửa config tay.</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5"><li><b>TCP/UDP</b>: mở dịch vụ theo cổng.</li><li><b>HTTP/HTTPS</b>: mở web theo tên miền.</li></ul>`,
    action: canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm proxy đầu tiên', { size: 'sm', variant: 'primary', attrs: 'id="add-proxy-empty"' }) : '',
  }) : '';
  const draw = () => UI.paginatedTable(body.querySelector('#tbl'), { headers: HEADERS, rows: applyFilter().map(rowHtml), emptyText: 'Không có proxy phù hợp.', emptyHtml });

  const sources = [...new Set(rows0.map((p) => p.source).filter(Boolean))];
  body.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div id="chips" class="flex flex-wrap items-center gap-2">${chipsHtml()}</div>
      ${storeEnabled && canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm proxy', { size: 'sm', variant: 'primary', attrs: 'id="add-proxy"' }) : ''}
    </div>
    ${!storeEnabled ? `<div class="mb-3 text-[11px] text-amber-400/90 flex items-center gap-1.5">frpc chưa bật <span class="font-mono">[store]</span> — chỉ xem trạng thái, không sửa/xóa được. ${UI.help('store')}</div>` : ''}
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <input id="q" value="${F.escapeHtml(preSearch)}" placeholder="Tìm theo tên hoặc port..." class="flex-1 min-w-[180px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      <label class="text-xs text-zinc-500">Source
        <select id="f-source" class="ml-1 rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm"><option value="">All</option>${sources.map((s) => `<option>${F.escapeHtml(s)}</option>`).join('')}</select>
      </label>
    </div>
    <div id="types" class="flex flex-wrap gap-2 mb-4">${typeHtml()}</div>
    <div id="tbl"></div>`;

  draw();
  body.querySelector('#q').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); draw(); });
  body.querySelector('#f-source').addEventListener('change', (e) => { state.source = e.target.value; draw(); });
  body.querySelector('#types').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; state.type = b.dataset.type; body.querySelector('#types').innerHTML = typeHtml(); draw(); });
  body.querySelector('#chips').addEventListener('click', (e) => { const b = e.target.closest('[data-status]'); if (!b) return; state.status = b.dataset.status; body.querySelector('#chips').innerHTML = chipsHtml(); draw(); });
  body.querySelector('#add-proxy')?.addEventListener('click', () => openProxyForm(node.id, 'create'));
  body.querySelector('#add-proxy-empty')?.addEventListener('click', () => openProxyForm(node.id, 'create'));

  body.addEventListener('click', async (e) => {
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const name = tog.dataset.toggle;
      const def = storeByName.get(name);
      const p = rows0.find((x) => x.name === name);
      if (!def || !p) return;
      const inner = def[def.type] || {};
      const cur = inner.enabled !== false;
      tog.disabled = true;
      try {
        await API.updateStoreProxy(node.id, name, { ...def, [def.type]: { ...inner, enabled: !cur } });
        inner.enabled = !cur;         // cập nhật state cục bộ
        p.def = def;
        tog.outerHTML = enableSwitch(p); // chỉ vẽ lại nút toggle, KHÔNG re-render cả bảng
        UI.toast(cur ? `Đã tắt "${name}".` : `Đã bật "${name}".`, 'success');
      } catch (err) { tog.disabled = false; UI.toast('Lỗi: ' + err.message, 'error'); }
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) { try { const def = await API.getStoreProxy(node.id, edit.dataset.edit); openProxyForm(node.id, 'edit', def); } catch (err) { UI.toast('Không lấy được: ' + err.message, 'error'); } return; }
    const del = e.target.closest('[data-del]');
    if (del) { if (!confirm(`Xóa proxy "${del.dataset.del}" khỏi store?`)) return; try { await API.deleteStoreProxy(node.id, del.dataset.del); UI.toast('Đã xóa.', 'success'); App.rerender(); } catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); } }
  });

  // Điều hướng từ nơi khác (click tên proxy) -> mở form sửa proxy đó
  const openName = sessionStorage.getItem('open.storeProxy');
  if (openName) {
    sessionStorage.removeItem('open.storeProxy');
    try { const def = await API.getStoreProxy(node.id, openName); openProxyForm(node.id, 'edit', def); }
    catch (err) {
      if (err.data?.upstreamStatus === 404 || /404/.test(err.message)) UI.toast(`Proxy "${openName}" là config tĩnh (không nằm trong store).`, 'info');
      else UI.toast('Không mở được proxy: ' + err.message, 'error');
    }
  }
}

// ---------------- Form thêm/sửa proxy (ảnh 7) ----------------
function openProxyForm(nodeId, mode, existingDef) {
  const F = Fmt;
  const editing = mode === 'edit';
  const type0 = editing ? existingDef.type : 'tcp';
  const inner0 = editing ? (existingDef[existingDef.type] || {}) : {};
  const transport0 = inner0.transport || {};
  const lb0 = inner0.loadBalancer || {};
  const hc0 = inner0.healthCheck || {};
  // Dữ liệu khởi tạo cho các bảng key/value
  const headerItems0 = (hc0.httpHeaders || []).map((h) => [h.name || '', h.value || '']);
  const metaItems0 = Object.entries(inner0.metadatas || {});
  const annItems0 = Object.entries(inner0.annotations || {});
  const enable0 = editing ? inner0.enabled !== false : true; // mặc định bật
  const plugin0 = inner0.plugin || {};
  const backendMode0 = (plugin0 && plugin0.type) ? 'plugin' : 'direct';

  const input = (label, name, value = '', opts = {}) => `
    <div class="${opts.full ? 'col-span-2' : ''}">
      <label class="block text-xs text-zinc-400 mb-1">${label}</label>
      <input name="${name}" type="${opts.type || 'text'}" value="${F.escapeHtml(value)}" placeholder="${F.escapeHtml(opts.ph || '')}" ${opts.disabled ? 'disabled' : ''}
        class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${opts.disabled ? 'text-zinc-500 cursor-not-allowed' : ''}" />
      ${opts.hint ? `<p class="text-[11px] text-zinc-500 mt-1">${opts.hint}</p>` : ''}
    </div>`;

  // Bảng key/value động (dùng cho HTTP Headers, Metadatas, Annotations)
  const kvRow = (k = '', v = '', keyPh = 'Key', valPh = 'Value') => `
    <div class="kv-row grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
      <input data-kv-key value="${F.escapeHtml(k)}" placeholder="${F.escapeHtml(keyPh)}" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      <input data-kv-val value="${F.escapeHtml(v)}" placeholder="${F.escapeHtml(valPh)}" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      <button type="button" data-kv-del title="Xóa dòng" class="px-3 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><i class="fa-solid fa-trash-can"></i></button>
    </div>`;
  const kvBlock = (key, items, keyPh = 'Key', valPh = 'Value') => {
    const rows = (items.length ? items : [['', '']]).map(([k, v]) => kvRow(k, v, keyPh, valPh)).join('');
    return `<div data-kv="${key}" data-kv-keyph="${F.escapeHtml(keyPh)}" data-kv-valph="${F.escapeHtml(valPh)}">${rows}</div>
      <button type="button" data-kv-add="${key}" class="text-xs px-2 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"><i class="fa-solid fa-plus"></i> Add</button>`;
  };

  // Field "phơi ra" phía server theo từng loại (KHÔNG gồm backend local — xem Backend Mode).
  const typeFields = (type, inner) => {
    if (['tcp', 'udp'].includes(type))
      return input('Remote Port', 'remotePort', inner.remotePort ?? '', { type: 'number', ph: '0 = ngẫu nhiên' });
    if (['http', 'https'].includes(type))
      return input(`Custom Domains (cách nhau dấu phẩy) ${UI.help('custom-domains')}`, 'customDomains', (inner.customDomains || []).join(','), { full: true }) +
        input('Subdomain', 'subdomain', inner.subdomain || '');
    if (type === 'tcpmux')
      return input(`Custom Domains ${UI.help('custom-domains')}`, 'customDomains', (inner.customDomains || []).join(','), { full: true }) +
        input('Multiplexer', 'multiplexer', inner.multiplexer || 'httpconnect');
    return input('Secret Key', 'secretKey', inner.secretKey || '', { full: true }); // stcp/sudp/xtcp
  };
  // Field cấu hình cho 1 plugin (Backend Mode = Plugin).
  const pluginFields = (pt) => {
    const fs = PLUGIN_FIELDS[pt] || [];
    if (!fs.length) return '<p class="text-xs text-zinc-500 col-span-2">Plugin này không cần cấu hình thêm.</p>';
    return fs.map(([f, label, ph]) => input(label, `pl_${f}`, plugin0[f] || '', { ph, type: /password/i.test(f) ? 'password' : 'text', full: f === 'localPath' })).join('');
  };
  // Note chiều đi của plugin (public ↔ local) để khỏi nhầm.
  const pluginNote = (pt) => {
    const i = PLUGIN_INFO[pt];
    if (!i) return '';
    return `<div class="rounded-lg bg-zinc-800/40 border border-zinc-700/60 p-2.5 text-[11px] text-zinc-400 leading-relaxed">
      <span class="text-zinc-300"><b>Public (cổng remote):</b> ${i.pub} → <b>Local:</b> ${i.local}</span>${i.cert ? ' · <span class="text-amber-400">cần crt/key</span>' : ''}<br>${i.desc}
    </div>`;
  };

  const bodyHtml = `
    <form id="proxy-form" class="space-y-4">
      <div class="grid grid-cols-[1fr_1fr_auto] gap-3 items-start">
        ${input('Name *', 'name', editing ? existingDef.name : '', { ph: 'my-proxy', disabled: editing, hint: editing ? 'Không đổi được tên sau khi tạo.' : '' })}
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Type * ${UI.help('proxy-types')}</label>
          <select name="type" ${editing ? 'disabled' : ''} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${editing ? 'text-zinc-500 cursor-not-allowed' : ''}">
            ${PROXY_TYPES.map((t) => `<option value="${t}" ${t === type0 ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1 text-center">Enabled</label>
          <label class="inline-flex items-center cursor-pointer mt-1.5">
            <input type="checkbox" name="enabled" ${enable0 ? 'checked' : ''} class="sr-only peer" />
            <div class="relative w-11 h-6 bg-zinc-600 peer-checked:bg-brand-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
          </label>
        </div>
      </div>
      <div id="type-note">${proxyTypeNote(type0)}</div>
      <div id="type-fields" class="grid grid-cols-2 gap-3">${typeFields(type0, inner0)}</div>

      <div class="rounded-lg border border-zinc-800 p-3">
        <div class="text-sm text-zinc-300 mb-2">Backend Mode</div>
        <div class="flex gap-5 mb-3 text-sm text-zinc-300">
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="backendMode" value="direct" ${backendMode0 === 'direct' ? 'checked' : ''} class="accent-brand-500"/> Direct <span class="text-[11px] text-zinc-500">(chuyển tới localIP:localPort)</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="backendMode" value="plugin" ${backendMode0 === 'plugin' ? 'checked' : ''} class="accent-brand-500"/> Plugin</label>
        </div>
        <div id="backend-direct" class="grid grid-cols-2 gap-3 ${backendMode0 === 'plugin' ? 'hidden' : ''}">
          ${input('Local IP', 'localIP', inner0.localIP || '127.0.0.1')}
          ${input('Local Port', 'localPort', inner0.localPort ?? '', { type: 'number' })}
        </div>
        <div id="backend-plugin" class="${backendMode0 === 'direct' ? 'hidden' : ''}">
          <div class="mb-2">
            <label class="block text-xs text-zinc-400 mb-1">Plugin Type</label>
            <select name="pluginType" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
              ${PLUGIN_TYPES.map((t) => `<option value="${t}" ${t === (plugin0.type || 'http2https') ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div id="plugin-note" class="mb-3">${pluginNote(plugin0.type || 'http2https')}</div>
          <div id="plugin-fields" class="grid grid-cols-2 gap-3">${pluginFields(plugin0.type || 'http2https')}</div>
        </div>
        <p class="text-[11px] text-zinc-500 mt-2">Chọn <b>Plugin</b> để frpc tự xử lý (http2https, socks5, static_file…) thay vì chuyển tới local — khi đó bỏ qua Local IP/Port.</p>
      </div>

      <details class="rounded-lg border border-zinc-800 p-3">
        <summary class="text-sm text-zinc-300 cursor-pointer">Transport ${UI.help('transport')}</summary>
        <div class="grid grid-cols-2 gap-3 mt-3">
          <label class="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" name="useEncryption" ${transport0.useEncryption ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700"/> Use Encryption</label>
          <label class="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" name="useCompression" ${transport0.useCompression ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700"/> Use Compression</label>
          ${input('Bandwidth Limit', 'bandwidthLimit', transport0.bandwidthLimit || '', { ph: '1MB, 500KB' })}
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Bandwidth Limit Mode</label>
            <select name="bandwidthLimitMode" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
              <option value="client" ${transport0.bandwidthLimitMode !== 'server' ? 'selected' : ''}>client</option>
              <option value="server" ${transport0.bandwidthLimitMode === 'server' ? 'selected' : ''}>server</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Proxy Protocol Version ${UI.help('proxy-protocol')}</label>
            <select name="proxyProtocolVersion" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
              <option value="" ${!transport0.proxyProtocolVersion ? 'selected' : ''}>None</option>
              <option value="v1" ${transport0.proxyProtocolVersion === 'v1' ? 'selected' : ''}>v1</option>
              <option value="v2" ${transport0.proxyProtocolVersion === 'v2' ? 'selected' : ''}>v2</option>
            </select>
          </div>
        </div>
        <p class="text-[11px] text-zinc-500 mt-2"><b>Proxy Protocol</b>: gửi IP thật của khách tới dịch vụ local (dịch vụ phải bật đọc PROXY protocol). <b>v1</b> = text dễ đọc, <b>v2</b> = nhị phân gọn/nhanh hơn. Không rõ thì để <b>None</b>.</p>
      </details>

      <details class="rounded-lg border border-zinc-800 p-3" ${lb0.group ? 'open' : ''}>
        <summary class="text-sm text-zinc-300 cursor-pointer">Load Balancer ${UI.help('load-balancer')}</summary>
        <div class="grid grid-cols-2 gap-3 mt-3">
          ${input('Group', 'group', lb0.group || '')}
          ${input('Group Key', 'groupKey', lb0.groupKey || '')}
        </div>
        <div class="mt-3 rounded-lg bg-zinc-800/40 border border-zinc-700/60 p-3 text-[11px] text-zinc-400 leading-relaxed">
          <div class="text-zinc-300 font-medium mb-1"><i class="fa-solid fa-scale-balanced text-brand-400"></i> Cân bằng tải &amp; dự phòng</div>
          Nhiều proxy có <b>cùng Group</b> + <b>cùng Group Key</b> + <b>cùng Remote Port</b> sẽ được frps gộp thành 1 nhóm và <b>chia đều kết nối (random)</b> cho các backend. Một backend chết thì dồn sang backend còn lại.
          <ul class="list-disc list-inside mt-1.5 space-y-0.5">
            <li>Group Key phải <b>giống hệt</b> giữa các proxy cùng nhóm (chống người lạ chen vào nhóm).</li>
            <li>Nên bật <b>Health Check</b> bên dưới → frp tự loại backend mà <i>dịch vụ local</i> chết (không chỉ khi cả frpc sập).</li>
            <li>Chỉ có <b>1 backend</b> thì <b>để trống</b> cả hai (không có tác dụng).</li>
          </ul>
        </div>
      </details>

      <details class="rounded-lg border border-zinc-800 p-3" ${hc0.type ? 'open' : ''}>
        <summary class="text-sm text-zinc-300 cursor-pointer">Health Check ${UI.help('health-check')}</summary>
        <div class="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Type</label>
            <select name="hcType" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
              <option value="" ${!hc0.type ? 'selected' : ''}>Disabled</option>
              <option value="tcp" ${hc0.type === 'tcp' ? 'selected' : ''}>tcp</option>
              <option value="http" ${hc0.type === 'http' ? 'selected' : ''}>http</option>
            </select>
          </div>
          ${input('Interval (giây)', 'hcInterval', hc0.intervalSeconds || 10, { type: 'number', ph: '10' })}
          ${input('Timeout (giây)', 'hcTimeout', hc0.timeoutSeconds || 3, { type: 'number', ph: '3' })}
          ${input('Max Failed', 'hcMaxFailed', hc0.maxFailed || 3, { type: 'number', ph: '3' })}
          ${input('Path (chỉ http)', 'hcPath', hc0.path || '', { full: true, ph: '/  ·  /api/version  ·  /health' })}
        </div>
        <div class="mt-3">
          <div class="text-xs text-zinc-400 mb-1.5">HTTP Headers <span class="text-zinc-600">— chỉ dùng khi Type = http (vd Host, Authorization)</span></div>
          ${kvBlock('httpHeaders', headerItems0, 'Header', 'Value')}
        </div>
        <div class="mt-3 rounded-lg bg-zinc-800/40 border border-zinc-700/60 p-3 text-[11px] text-zinc-400 leading-relaxed">
          <div class="text-zinc-300 font-medium mb-1"><i class="fa-solid fa-heart-pulse text-brand-400"></i> Về Health Check &amp; Path</div>
          frp kiểm tra <b>dịch vụ local</b> (localIP:localPort), <b>không phải</b> URL remote.
          <ul class="list-disc list-inside mt-1.5 space-y-0.5">
            <li><b>tcp</b>: chỉ cần mở được cổng là "khỏe" — hợp mọi dịch vụ, <b>không cần Path</b>.</li>
            <li><b>http</b>: gửi <code class="text-zinc-300">GET http://localIP:localPort{Path}</code>, <b>phải trả mã 2xx</b> mới khỏe. Path sai (404) → luôn fail → proxy kẹt.</li>
            <li>Path hợp lệ của <b>Ollama</b>: <code class="text-zinc-300">/</code>, <code class="text-zinc-300">/api/version</code>, <code class="text-zinc-300">/api/tags</code>. Web app thường có <code class="text-zinc-300">/health</code>, <code class="text-zinc-300">/healthz</code>, <code class="text-zinc-300">/ping</code>.</li>
            <li>Đủ <b>Max Failed</b> lần fail liên tiếp → frp gỡ proxy khỏi frps. Nên để Max Failed ≥ 3.</li>
            <li>Hữu ích nhất khi dùng <b>Load Balancer</b> (tự loại backend chết). Không dùng thì để Type = Disabled.</li>
          </ul>
        </div>
      </details>

      <details class="rounded-lg border border-zinc-800 p-3" ${(metaItems0.length || annItems0.length) ? 'open' : ''}>
        <summary class="text-sm text-zinc-300 cursor-pointer">Metadata ${UI.help('metadata')}</summary>
        <div class="mt-3 space-y-4">
          <div>
            <div class="text-xs text-zinc-400 mb-1.5">Metadatas <span class="text-zinc-600">— dữ liệu tùy ý gắn kèm proxy; server/plugin xác thực đọc được</span></div>
            ${kvBlock('metadatas', metaItems0, 'Key', 'Value')}
          </div>
          <div>
            <div class="text-xs text-zinc-400 mb-1.5">Annotations <span class="text-zinc-600">— nhãn mô tả proxy (quản lý/hiển thị), không ảnh hưởng traffic</span></div>
            ${kvBlock('annotations', annItems0, 'Key', 'Value')}
          </div>
        </div>
      </details>

      <details class="rounded-lg border border-zinc-800 p-3">
        <summary class="text-sm text-zinc-300 cursor-pointer">Advanced (JSON — gộp thêm field khác vào config)</summary>
        <textarea name="advanced" spellcheck="false" placeholder='{ "hostHeaderRewrite": "example.com" }' class="w-full h-24 mt-3 rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none"></textarea>
      </details>
      <div id="proxy-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
    </form>`;

  const footer = UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn(editing ? 'Lưu' : 'Tạo', { variant: 'primary', attrs: 'id="proxy-save"' });

  UI.openModal({
    title: (editing ? 'Sửa proxy: ' + existingDef.name : 'New Proxy'), body: bodyHtml, footer, size: 'lg',
    onMount(rootEl) {
      const form = rootEl.querySelector('#proxy-form');
      form.elements.type.addEventListener('change', () => {
        const t = form.elements.type.value;
        rootEl.querySelector('#type-fields').innerHTML = typeFields(t, {});
        rootEl.querySelector('#type-note').innerHTML = proxyTypeNote(t);
      });
      // Backend Mode: Direct <-> Plugin
      rootEl.querySelectorAll('[name="backendMode"]').forEach((r) => r.addEventListener('change', () => {
        const plugin = form.elements.backendMode.value === 'plugin';
        rootEl.querySelector('#backend-direct').classList.toggle('hidden', plugin);
        rootEl.querySelector('#backend-plugin').classList.toggle('hidden', !plugin);
      }));
      // Đổi Plugin Type -> render lại field
      rootEl.querySelector('[name="pluginType"]')?.addEventListener('change', (e) => {
        rootEl.querySelector('#plugin-fields').innerHTML = pluginFields(e.target.value);
        rootEl.querySelector('#plugin-note').innerHTML = pluginNote(e.target.value);
      });
      // Thêm dòng key/value
      rootEl.querySelectorAll('[data-kv-add]').forEach((btn) => btn.addEventListener('click', () => {
        const cont = rootEl.querySelector(`[data-kv="${btn.dataset.kvAdd}"]`);
        cont.insertAdjacentHTML('beforeend', kvRow('', '', cont.dataset.kvKeyph, cont.dataset.kvValph));
      }));
      // Xóa dòng key/value (luôn chừa lại tối thiểu 1 dòng trống)
      form.addEventListener('click', (e) => {
        const del = e.target.closest('[data-kv-del]'); if (!del) return;
        const row = del.closest('.kv-row'); const cont = row.parentElement; row.remove();
        if (!cont.querySelector('.kv-row')) cont.insertAdjacentHTML('beforeend', kvRow('', '', cont.dataset.kvKeyph, cont.dataset.kvValph));
      });
      rootEl.querySelector('#proxy-save').addEventListener('click', async () => {
        const errBox = rootEl.querySelector('#proxy-error');
        errBox.classList.add('hidden');
        try {
          const def = buildProxyDefinition(form);
          if (editing) await API.updateStoreProxy(nodeId, existingDef.name, def);
          else await API.createStoreProxy(nodeId, def);
          UI.toast('Đã lưu proxy vào store.', 'success');
          UI.closeModal();
          App.rerender();
        } catch (err) {
          errBox.textContent = '✗ ' + err.message;
          errBox.classList.remove('hidden');
        }
      });
    },
  });
}

function buildProxyDefinition(form) {
  const g = (n) => (form.elements[n]?.value ?? '').trim();
  // Đọc bảng key/value động
  const readKv = (key) => {
    const rows = [];
    form.querySelectorAll(`[data-kv="${key}"] .kv-row`).forEach((row) => {
      const k = (row.querySelector('[data-kv-key]')?.value || '').trim();
      const v = (row.querySelector('[data-kv-val]')?.value || '').trim();
      if (k) rows.push([k, v]);
    });
    return rows;
  };
  const kvToObject = (key) => Object.fromEntries(readKv(key));
  const kvToHeaders = (key) => readKv(key).map(([name, value]) => ({ name, value }));

  const name = g('name');
  if (!name) throw new Error('Thiếu Name.');
  const type = form.elements.type.value;
  const inner = { name, type };
  const setNum = (n) => { const v = g(n); if (v !== '') inner[n] = Number(v); };
  const setStr = (n) => { const v = g(n); if (v) inner[n] = v; };
  const setDomains = () => { const v = g('customDomains'); if (v) inner.customDomains = v.split(',').map((s) => s.trim()).filter(Boolean); };

  // Field phơi ra phía server (không gồm backend local — xử lý ở Backend Mode).
  if (['tcp', 'udp'].includes(type)) { setNum('remotePort'); }
  else if (['http', 'https'].includes(type)) { setDomains(); setStr('subdomain'); }
  else if (type === 'tcpmux') { setDomains(); setStr('multiplexer'); }
  else { setStr('secretKey'); }

  // Backend Mode: Direct (localIP/localPort) | Plugin (inner.plugin).
  const backendMode = form.elements.backendMode ? form.elements.backendMode.value : 'direct';
  if (backendMode === 'plugin') {
    const pt = g('pluginType');
    if (pt) {
      const plugin = { type: pt };
      for (const [f] of (PLUGIN_FIELDS[pt] || [])) { const v = (form.elements[`pl_${f}`]?.value ?? '').trim(); if (v) plugin[f] = v; }
      inner.plugin = plugin;
    }
  } else { setStr('localIP'); setNum('localPort'); }

  const transport = {};
  if (form.elements.useEncryption?.checked) transport.useEncryption = true;
  if (form.elements.useCompression?.checked) transport.useCompression = true;
  if (g('bandwidthLimit')) transport.bandwidthLimit = g('bandwidthLimit');
  if (g('bandwidthLimitMode') && g('bandwidthLimitMode') !== 'client') transport.bandwidthLimitMode = g('bandwidthLimitMode');
  if (g('proxyProtocolVersion')) transport.proxyProtocolVersion = g('proxyProtocolVersion');
  if (Object.keys(transport).length) inner.transport = transport;

  if (g('group')) { inner.loadBalancer = { group: g('group') }; if (g('groupKey')) inner.loadBalancer.groupKey = g('groupKey'); }

  if (g('hcType')) {
    const hc = { type: g('hcType') };
    if (g('hcInterval')) hc.intervalSeconds = Number(g('hcInterval'));
    if (g('hcTimeout')) hc.timeoutSeconds = Number(g('hcTimeout'));
    if (g('hcMaxFailed')) hc.maxFailed = Number(g('hcMaxFailed'));
    if (g('hcPath')) hc.path = g('hcPath');
    const headers = kvToHeaders('httpHeaders');
    if (headers.length) hc.httpHeaders = headers;
    inner.healthCheck = hc;
  }

  const metadatas = kvToObject('metadatas');
  if (Object.keys(metadatas).length) inner.metadatas = metadatas;
  const annotations = kvToObject('annotations');
  if (Object.keys(annotations).length) inner.annotations = annotations;

  const adv = g('advanced');
  if (adv) {
    let extra; try { extra = JSON.parse(adv); } catch (e) { throw new Error('Advanced JSON lỗi: ' + e.message); }
    // Merge an toàn: bỏ qua key nguy hiểm (chống prototype pollution).
    for (const k of Object.keys(extra || {})) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      inner[k] = extra[k];
    }
  }

  // Bật/tắt proxy (field frp: enabled *bool, nằm trong object [type]).
  inner.enabled = form.elements.enabled ? form.elements.enabled.checked : true;
  return { name, type, [type]: inner };
}
