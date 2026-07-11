/* Node Visitors — quản lý visitor (store) của 1 node được chọn. */
window.Pages = window.Pages || {};

// Khớp IsVisitorType của fork (client/http/model/visitor_definition.go).
const VISITOR_TYPES = ['stcp', 'sudp', 'xtcp', 'xudp', 'stcp+sudp', 'xtcp+xudp'];
// Visitor type mở rộng chỉ có ở fork Meobaka (v1.3.x+). KHÔNG ẩn — chỉ hiện note cảnh báo.
const EXTENDED_VISITOR_TYPES = ['xudp', 'stcp+sudp', 'xtcp+xudp'];
function visitorVersionNote(type, variant) {
  if (!EXTENDED_VISITOR_TYPES.includes(type)) return '';
  const standard = variant === 'standard';
  const cls = standard ? 'bg-red-900/30 border-red-700/60 text-red-300' : 'bg-amber-900/20 border-amber-700/50 text-amber-300';
  const msg = standard
    ? 'Node này đang đặt là <b>frp chuẩn/cũ</b> — visitor type mở rộng <b>sẽ KHÔNG chạy</b>. Cần <b>fork Meobaka v1.3.x+</b>.'
    : 'Visitor type mở rộng — chỉ chạy trên <b>fork Meobaka (v1.3.x+)</b>. frp gốc/cũ sẽ báo "invalid visitor type".';
  return `<div class="mt-2 rounded-lg border p-2.5 text-[11px] leading-relaxed ${cls}">${msg}</div>`;
}

Pages['nodes/visitors'] = {
  title: 'Node Visitors',
  subtitle: 'Quản lý visitor (store) trên FRPC',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));
    const nodes = Store.activeNodes();
    if (!nodes.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có node nào đang bật.', 'Tất cả node đã tắt — bật lại ở trang Nodes.')}</div>`; return; }
    const node = Store.selectedNode();

    const F = Fmt;
    const store = await API.getStore(node.id);

    const canCreate = Store.can('visitors.create');
    const canUpdate = Store.can('visitors.update');
    const canDelete = Store.can('visitors.delete');
    const bar = `<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">${UI.selectorBar('node')} ${UI.help('visitors')}</div>
      ${store.enabled && canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm visitor', { size: 'sm', variant: 'primary', attrs: 'id="add-visitor"' }) : ''}
    </div>`;

    if (!store.enabled) {
      root.innerHTML = `<div class="p-6">${bar}
        <div class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 class="font-medium mb-1">Store chưa được bật</h3>
          <p class="text-sm text-zinc-500">Cần cấu hình <span class="font-mono text-zinc-400">[store]</span> trong frpc.toml để quản lý visitor động.</p></div>
      </div>`;
      UI.wireSelector(root);
      return;
    }

    const HEADERS = ['Tên', 'Loại', 'Tóm tắt', { label: 'Thao tác', align: 'right' }];
    const rowHtml = (def) => {
      const cfg = def[def.type] || {};
      const summary = [
        cfg.serverName ? `→ ${cfg.serverName}` : '',
        (cfg.bindAddr || cfg.bindPort != null) ? `bind ${cfg.bindAddr || '127.0.0.1'}:${cfg.bindPort ?? '?'}` : '',
      ].filter(Boolean).join(' · ');
      return `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
        <td class="px-3 py-2 font-medium">${F.escapeHtml(def.name)}</td>
        <td class="px-3 py-2">${F.typeTag(def.type)}</td>
        <td class="px-3 py-2 text-xs text-zinc-400">${F.escapeHtml(summary || '—')}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canUpdate ? UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${F.escapeHtml(def.name)}"` }) : ''}
          ${canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${F.escapeHtml(def.name)}"` }) : ''}
        </td></tr>`;
    };

    root.innerHTML = `<div id="visitors-view" class="p-6">${bar}<div id="tbl"></div></div>`;
    UI.wireSelector(root);
    const visitorEmpty = UI.emptyNote({
      icon: 'fa-user-shield',
      title: 'Chưa có visitor nào',
      html: `<p>Visitor dùng cho proxy loại <b>stcp/xtcp/sudp</b> (kết nối bảo mật/P2P, không mở cổng public).</p>
        <ul class="list-disc list-inside mt-1.5 space-y-0.5">
          <li>Bên chạy dịch vụ tạo proxy <b>stcp</b> kèm <b>Secret Key</b>.</li>
          <li>Bên muốn truy cập tạo <b>visitor</b> cùng <b>Server Name</b> + cùng <b>Secret Key</b> → mở cổng local nối tới.</li>
          <li>Chỉ người có đúng Secret Key mới kết nối được.</li>
        </ul>`,
      action: canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm visitor đầu tiên', { size: 'sm', variant: 'primary', attrs: 'id="add-visitor-empty"' }) : '',
    });
    UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows: (store.visitors || []).map(rowHtml), emptyText: 'Chưa có visitor nào trong store.', emptyHtml: visitorEmpty });

    const view = root.querySelector('#visitors-view');
    const variant = node.frpVariant || 'extended';
    view.querySelector('#add-visitor')?.addEventListener('click', () => openVisitorForm(node.id, 'create', null, variant));
    view.querySelector('#add-visitor-empty')?.addEventListener('click', () => openVisitorForm(node.id, 'create', null, variant));
    view.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        try { const def = await API.getStoreVisitor(node.id, edit.dataset.edit); openVisitorForm(node.id, 'edit', def, variant); }
        catch (err) { UI.toast('Không lấy được: ' + err.message, 'error'); }
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!confirm(`Xóa visitor "${del.dataset.del}" khỏi store?`)) return;
        try { await API.deleteStoreVisitor(node.id, del.dataset.del); UI.toast('Đã xóa.', 'success'); App.rerender(); }
        catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); }
      }
    });
  },
};

function openVisitorForm(nodeId, mode, existingDef, variant = 'extended') {
  const F = Fmt;
  const editing = mode === 'edit';
  const typeOptions = editing && existingDef && !VISITOR_TYPES.includes(existingDef.type)
    ? [existingDef.type, ...VISITOR_TYPES] : VISITOR_TYPES;
  const type0 = editing ? existingDef.type : 'stcp';
  const inner0 = editing ? (existingDef[existingDef.type] || {}) : {};
  const transport0 = inner0.transport || {};
  const enable0 = editing ? inner0.enabled !== false : true;
  const nat0 = inner0.natTraversal || {};
  const plugin0 = inner0.plugin || {};
  // Tùy chọn P2P chỉ áp dụng cho visitor xtcp/xudp/xtcp+xudp. fallbackTimeoutMs chỉ có ở xtcp & xtcp+xudp.
  const isP2P = (t) => ['xtcp', 'xudp', 'xtcp+xudp'].includes(t);
  const hasFallback = (t) => t === 'xtcp' || t === 'xtcp+xudp';

  const input = (label, name, value = '', opts = {}) => `
    <div class="${opts.full ? 'col-span-2' : ''}">
      <label class="block text-xs text-zinc-400 mb-1">${label}</label>
      <input name="${name}" type="${opts.type || 'text'}" value="${F.escapeHtml(value)}" placeholder="${F.escapeHtml(opts.ph || '')}" ${opts.disabled ? 'disabled' : ''}
        class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${opts.disabled ? 'text-zinc-500 cursor-not-allowed' : ''}" />
      ${opts.hint ? `<p class="text-[11px] text-zinc-500 mt-1">${opts.hint}</p>` : ''}
    </div>`;
  const toggle = (name, checked) => `
    <label class="inline-flex items-center cursor-pointer">
      <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} class="sr-only peer" />
      <div class="relative w-11 h-6 bg-zinc-600 peer-checked:bg-brand-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
    </label>`;

  const bodyHtml = `
    <form id="visitor-form" class="space-y-4">
      <div class="grid grid-cols-[1fr_1fr_auto] gap-3 items-start">
        ${input('Name *', 'name', editing ? existingDef.name : '', { ph: 'my-visitor', disabled: editing, hint: editing ? 'Không đổi được tên sau khi tạo.' : '' })}
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Type *</label>
          <select name="type" ${editing ? 'disabled' : ''} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${editing ? 'text-zinc-500 cursor-not-allowed' : ''}">
            ${typeOptions.map((t) => `<option value="${t}" ${t === type0 ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1 text-center">Enabled</label>
          <div class="mt-1.5">${toggle('enabled', enable0)}</div>
        </div>
      </div>
      <div id="visitor-type-note">${visitorVersionNote(type0, variant)}</div>

      <div class="rounded-lg border border-zinc-800 p-4">
        <div class="text-sm text-zinc-300 mb-3">Connection</div>
        <div class="grid grid-cols-2 gap-3">
          ${input('Server Name *', 'serverName', inner0.serverName || '', { ph: 'tên proxy stcp/xtcp/sudp bên cung cấp' })}
          ${input('Server User', 'serverUser', inner0.serverUser || '', { ph: 'để trống = cùng user' })}
          ${input('Secret Key', 'secretKey', inner0.secretKey || '', { full: true, ph: 'shared secret' })}
          ${input('Bind Address', 'bindAddr', inner0.bindAddr || '127.0.0.1')}
          ${input('Bind Port *', 'bindPort', inner0.bindPort ?? '', { type: 'number', hint: 'Dùng -1 khi chỉ nhận qua visitor khác / plugin virtual_net (không mở cổng local).' })}
        </div>
      </div>

      <div class="rounded-lg border border-zinc-800 p-4">
        <div class="text-sm text-zinc-300 mb-3">Plugin</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Plugin Type</label>
            <select name="pluginType" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
              <option value="" ${!plugin0.type ? 'selected' : ''}>None</option>
              <option value="virtual_net" ${plugin0.type === 'virtual_net' ? 'selected' : ''}>virtual_net</option>
            </select>
          </div>
          <div id="visitor-plugin-fields" class="${plugin0.type === 'virtual_net' ? '' : 'hidden'}">
            ${input('Destination IP', 'destinationIP', plugin0.destinationIP || '', { ph: '10.10.10.10' })}
          </div>
        </div>
        <p class="text-[11px] text-zinc-500 mt-2"><b>virtual_net</b>: nối visitor vào mạng ảo của frp; <b>Destination IP</b> là IP đích trong virtual net cần truy cập.</p>
      </div>

      <div class="rounded-lg border border-zinc-800 p-4">
        <div class="text-sm text-zinc-300 mb-3">Transport Options ${UI.help('transport')}</div>
        <div class="grid grid-cols-2 gap-3">
          <div><div class="text-xs text-zinc-400 mb-1.5">Use Encryption</div>${toggle('useEncryption', transport0.useEncryption)}</div>
          <div><div class="text-xs text-zinc-400 mb-1.5">Use Compression</div>${toggle('useCompression', transport0.useCompression)}</div>
        </div>
      </div>

      <div id="p2p-options" class="${isP2P(type0) ? '' : 'hidden'} space-y-4">
        <details class="rounded-lg border border-zinc-800 p-3" open>
          <summary class="text-sm text-zinc-300 cursor-pointer">XTCP Options</summary>
          <div class="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Protocol</label>
              <select name="protocol" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                <option value="quic" ${(inner0.protocol || 'quic') === 'quic' ? 'selected' : ''}>QUIC</option>
                <option value="kcp" ${inner0.protocol === 'kcp' ? 'selected' : ''}>KCP</option>
              </select>
              <p class="text-[11px] text-zinc-500 mt-1">Giao thức tunnel tin cậy chạy trên UDP hole đã đục (không phải payload).</p>
            </div>
            <div><div class="text-xs text-zinc-400 mb-1.5">Keep Tunnel Open</div>${toggle('keepTunnelOpen', inner0.keepTunnelOpen)}
              <p class="text-[11px] text-zinc-500 mt-1">Giữ tunnel P2P luôn mở thay vì mở khi cần.</p></div>
            ${input('Max Retries per Hour', 'maxRetriesAnHour', inner0.maxRetriesAnHour ?? '', { type: 'number', ph: '0 = không giới hạn' })}
            ${input('Min Retry Interval (s)', 'minRetryInterval', inner0.minRetryInterval ?? '', { type: 'number' })}
            <div id="fallback-field" class="col-span-2 ${hasFallback(type0) ? '' : 'hidden'}">
              ${input('Fallback Timeout (ms)', 'fallbackTimeoutMs', inner0.fallbackTimeoutMs ?? '', { type: 'number', ph: '1000', hint: 'xtcp+xudp: chờ P2P bao lâu (ms) trước khi tự fallback về relay. Mặc định 1000.' })}
            </div>
          </div>
        </details>
        <details class="rounded-lg border border-zinc-800 p-3" ${nat0.disableAssistedAddrs ? 'open' : ''}>
          <summary class="text-sm text-zinc-300 cursor-pointer">NAT Traversal</summary>
          <div class="mt-3">
            <div class="text-xs text-zinc-400 mb-1.5">Disable Assisted Addresses</div>
            ${toggle('disableAssistedAddrs', nat0.disableAssistedAddrs)}
            <p class="text-[11px] text-zinc-500 mt-1">Chỉ dùng địa chỉ public do STUN phát hiện (bỏ qua địa chỉ mạng nội bộ hỗ trợ).</p>
          </div>
        </details>
      </div>

      <details class="rounded-lg border border-zinc-800 p-3">
        <summary class="text-sm text-zinc-300 cursor-pointer">Advanced (JSON)</summary>
        <textarea name="advanced" spellcheck="false" class="w-full h-24 mt-3 rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none"></textarea>
      </details>
      <div id="visitor-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
    </form>`;

  const footer = UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn(editing ? 'Lưu' : 'Tạo', { variant: 'primary', attrs: 'id="visitor-save"' });

  UI.openModal({
    title: editing ? 'Sửa visitor: ' + existingDef.name : 'New Visitor', body: bodyHtml, footer, size: 'lg',
    onMount(rootEl) {
      const form = rootEl.querySelector('#visitor-form');
      // Đổi Type -> ẩn/hiện khối P2P và field Fallback Timeout tương ứng.
      form.elements.type.addEventListener('change', () => {
        const t = form.elements.type.value;
        rootEl.querySelector('#p2p-options').classList.toggle('hidden', !isP2P(t));
        rootEl.querySelector('#fallback-field').classList.toggle('hidden', !hasFallback(t));
        rootEl.querySelector('#visitor-type-note').innerHTML = visitorVersionNote(t, variant);
      });
      // Plugin virtual_net: hiện field Destination IP khi chọn.
      form.elements.pluginType.addEventListener('change', () => {
        rootEl.querySelector('#visitor-plugin-fields').classList.toggle('hidden', form.elements.pluginType.value !== 'virtual_net');
      });
      rootEl.querySelector('#visitor-save').addEventListener('click', async () => {
        const errBox = rootEl.querySelector('#visitor-error');
        errBox.classList.add('hidden');
        try {
          const def = buildVisitorDefinition(form);
          if (editing) await API.updateStoreVisitor(nodeId, existingDef.name, def);
          else await API.createStoreVisitor(nodeId, def);
          UI.toast('Đã lưu visitor.', 'success');
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

function buildVisitorDefinition(form) {
  const g = (n) => (form.elements[n]?.value ?? '').trim();
  const name = g('name');
  if (!name) throw new Error('Thiếu Name.');
  const type = form.elements.type.value;
  const inner = { name, type };
  if (g('serverName')) inner.serverName = g('serverName');
  if (g('secretKey')) inner.secretKey = g('secretKey');
  if (g('bindAddr')) inner.bindAddr = g('bindAddr');
  if (g('bindPort')) inner.bindPort = Number(g('bindPort'));
  if (g('serverUser')) inner.serverUser = g('serverUser');
  const transport = {};
  if (form.elements.useEncryption?.checked) transport.useEncryption = true;
  if (form.elements.useCompression?.checked) transport.useCompression = true;
  if (Object.keys(transport).length) inner.transport = transport;

  // Tùy chọn P2P (chỉ với visitor xtcp/xudp/xtcp+xudp).
  if (['xtcp', 'xudp', 'xtcp+xudp'].includes(type)) {
    if (g('protocol')) inner.protocol = g('protocol');
    if (form.elements.keepTunnelOpen?.checked) inner.keepTunnelOpen = true;
    if (g('maxRetriesAnHour')) inner.maxRetriesAnHour = Number(g('maxRetriesAnHour'));
    if (g('minRetryInterval')) inner.minRetryInterval = Number(g('minRetryInterval'));
    // fallbackTimeoutMs chỉ hợp lệ cho xtcp & xtcp+xudp (xudp không có field này).
    if ((type === 'xtcp' || type === 'xtcp+xudp') && g('fallbackTimeoutMs')) inner.fallbackTimeoutMs = Number(g('fallbackTimeoutMs'));
    if (form.elements.disableAssistedAddrs?.checked) inner.natTraversal = { disableAssistedAddrs: true };
  }

  // Plugin visitor (virtual_net) — issue fatedier/frp#5410.
  if (g('pluginType') === 'virtual_net') {
    const plugin = { type: 'virtual_net' };
    if (g('destinationIP')) plugin.destinationIP = g('destinationIP');
    inner.plugin = plugin;
  }

  inner.enabled = form.elements.enabled ? form.elements.enabled.checked : true;
  const adv = g('advanced');
  if (adv) {
    let extra; try { extra = JSON.parse(adv); } catch (e) { throw new Error('Advanced JSON lỗi: ' + e.message); }
    for (const k of Object.keys(extra || {})) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      inner[k] = extra[k];
    }
  }
  return { name, type, [type]: inner };
}
