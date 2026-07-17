/* Provider · Firewall — cấu hình firewall NATIVE của frps (fork): rules + blacklist provider. */
window.Pages = window.Pages || {};

const FW_DEFAULT_PROVIDER = () => ({
  mode: 'off', frpControlURL: '', frpControlAPIKey: '',
  url: '', method: 'GET', body: '', headers: {}, blockedPath: 'results.0.blacklisted',
  cacheTTLSec: 300, timeoutMs: 800, failOpen: false, insecureTLS: false,
});

Pages['providers/firewall'] = {
  title: 'Provider Firewall',
  subtitle: 'Firewall native của frps: chặn theo IP nguồn + port đích, kèm nguồn reputation (hỏi IP lạ)',
  async render(root) {
    const F = Fmt;
    const providers = Store.activeProviders();
    const canUpdate = Store.can('providers.update');

    if (!providers.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có provider nào đang bật.')}</div>`; return; }
    const provider = Store.selectedProvider();

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">${UI.selectorBar('provider')}</div>
      <div id="fw-body">${UI.spinner()}</div>
    </div>`;
    UI.wireSelector(root);
    if (!provider) return;

    const body = root.querySelector('#fw-body');
    let snap;
    // Bản MỚI khớp theo IP nguồn + PORT đích, và có thêm `controlPort`.
    // Bản CŨ khớp theo proxy/user. Nhận diện bằng sự có mặt của field `controlPort` trong response.
    let isNew = false;
    try {
      const s = await API.providerFirewall(provider.id);
      isNew = Object.prototype.hasOwnProperty.call(s, 'controlPort');
      snap = {
        enabled: Boolean(s.enabled),
        default: s.default === 'deny' ? 'deny' : 'allow',
        rules: Array.isArray(s.rules) ? s.rules : [],
        provider: { ...FW_DEFAULT_PROVIDER(), ...(s.provider || {}) },
      };
      if (isNew) snap.controlPort = Boolean(s.controlPort);
      if (!snap.provider.headers) snap.provider.headers = {};
    } catch (err) {
      const hint = /404/.test(err.message) ? 'frps này có thể là bản chuẩn/cũ (không có firewall API). Cần fork Meobaka.' : err.message;
      body.innerHTML = UI.errorBox('Không lấy được cấu hình firewall.', hint);
      return;
    }

    const esc = F.escapeHtml;
    const inp = (val, attrs = '', ph = '') => `<input value="${esc(String(val ?? ''))}" placeholder="${esc(ph)}" ${attrs} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />`;

    // ---- Khối provider (nguồn reputation) ----
    const providerFieldsHtml = () => {
      const p = snap.provider;
      if (p.mode === 'off') return '<p class="text-xs text-zinc-500">Tắt — chỉ dùng luật thủ công + default policy.</p>';
      let inner = '';
      if (p.mode === 'frpcontrol') {
        inner = `<div class="grid grid-cols-1 gap-3">
          <label class="block"><span class="text-xs text-zinc-400">FRPControl URL (base)</span>${inp(p.frpControlURL, 'data-p="frpControlURL"', 'https://163.61.182.135:7002')}</label>
          <label class="block"><span class="text-xs text-zinc-400">API key</span>${inp(p.frpControlAPIKey, 'data-p="frpControlAPIKey" type="password"', 'fwk_xxx')}</label>
          <p class="text-[11px] text-zinc-500">frps gọi <span class="font-mono">POST {url}/api/fw/check</span> kèm header <span class="font-mono">X-API-Key</span> và đọc <span class="font-mono">results.0.blacklisted</span>. Tạo API key ở <b>System → Firewall</b> (cần bật Firewall API).</p>
        </div>`;
      } else if (p.mode === 'custom') {
        inner = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block sm:col-span-2"><span class="text-xs text-zinc-400">URL (dùng {ip})</span>${inp(p.url, 'data-p="url"', 'https://host/api/check?ip={ip}')}</label>
          <label class="block"><span class="text-xs text-zinc-400">Method</span>
            <select data-p="method" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
              <option value="GET" ${p.method !== 'POST' ? 'selected' : ''}>GET</option>
              <option value="POST" ${p.method === 'POST' ? 'selected' : ''}>POST</option>
            </select></label>
          <label class="block sm:col-span-2 ${p.method === 'POST' ? '' : 'hidden'}" data-post-only><span class="text-xs text-zinc-400">POST body (dùng {ip})</span>${inp(p.body, 'data-p="body"', '{"ips":["{ip}"]}')}</label>
          <label class="block sm:col-span-2"><span class="text-xs text-zinc-400">Headers (mỗi dòng "Key: value")</span>
            <textarea data-p="headers" rows="2" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none" placeholder="X-API-Key: fwk_xxx">${esc(Object.entries(p.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n'))}</textarea></label>
          <label class="block sm:col-span-2"><span class="text-xs text-zinc-400">Blocked JSON path (dot, hỗ trợ {ip} + index)</span>${inp(p.blockedPath, 'data-p="blockedPath"', 'results.0.blacklisted')}</label>
        </div>`;
      }
      const common = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-zinc-800">
        <label class="block"><span class="text-xs text-zinc-400">Cache TTL (s)</span>${inp(p.cacheTTLSec, 'data-p="cacheTTLSec" type="number"', '300')}</label>
        <label class="block"><span class="text-xs text-zinc-400">Timeout (ms)</span>${inp(p.timeoutMs, 'data-p="timeoutMs" type="number"', '800')}</label>
        <label class="flex items-center gap-2 text-sm text-zinc-300 pt-5"><input type="checkbox" data-p="failOpen" ${p.failOpen ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700"/> Fail-open <span class="text-[11px] text-zinc-500">(lỗi = cho qua)</span></label>
        <label class="flex items-center gap-2 text-sm text-zinc-300 pt-5"><input type="checkbox" data-p="insecureTLS" ${p.insecureTLS ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700"/> Insecure TLS <span class="text-[11px] text-zinc-500">(self-signed)</span></label>
      </div>`;
      return inner + common;
    };

    // ---- Bảng rules ----
    const expiryText = (exp) => {
      if (!exp) return '<span class="text-zinc-300">vĩnh viễn</span>';
      const d = Math.round((exp - Date.now() / 1000) / 86400);
      return d <= 0 ? '<span class="text-zinc-600">hết hạn</span>' : `<span class="text-amber-400">${d}d</span>`;
    };
    // Cột giữa: bản mới = Port (IP nguồn + port đích); bản cũ = Proxy + User.
    const matchCols = isNew ? 1 : 2;
    const rulesHeadHtml = () => (isNew
      ? '<th class="px-3 py-1.5 text-left">Port</th>'
      : '<th class="px-3 py-1.5 text-left">Proxy</th><th class="px-3 py-1.5 text-left">User</th>');
    const rulesBodyHtml = () => {
      if (!snap.rules.length) return `<tr><td colspan="${5 + matchCols}" class="px-3 py-6 text-center text-zinc-500 text-sm">Chưa có luật — chỉ áp provider + default policy.</td></tr>`;
      return snap.rules.map((r, i) => `<tr class="border-b border-zinc-800/60">
        <td class="px-3 py-2"><span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.action === 'allow' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}">${esc(r.action)}</span></td>
        <td class="px-3 py-2 font-mono text-xs">${esc(r.cidr || 'any')}</td>
        ${isNew
          ? `<td class="px-3 py-2 font-mono text-xs">${esc(r.port || 'all')}</td>`
          : `<td class="px-3 py-2 text-xs">${esc(r.proxy || 'any')}</td><td class="px-3 py-2 text-xs">${esc(r.user || 'any')}</td>`}
        <td class="px-3 py-2 text-xs">${expiryText(r.expiresAt)}</td>
        <td class="px-3 py-2 text-xs text-zinc-400">${esc(r.note || '')}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canUpdate ? `${UI.btn('Lên', { size: 'sm', attrs: `data-up="${i}" ${i === 0 ? 'disabled' : ''}` })} ${UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${i}"` })} ${UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${i}"` })}` : ''}
        </td></tr>`).join('');
    };
    const drawRules = () => { body.querySelector('#fw-rules-body').innerHTML = rulesBodyHtml(); };
    const drawProvider = () => { body.querySelector('#fw-provider-fields').innerHTML = providerFieldsHtml(); wireProviderInputs(); };

    body.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-4">
        <div class="text-sm text-zinc-400">Thứ tự áp dụng: <b>luật thủ công</b> → <b>provider</b> (nếu bật) → <b>default policy</b>.</div>
        <label class="flex items-center gap-2 text-sm text-zinc-300"><span>Bật firewall</span>
          <input type="checkbox" id="fw-enabled" ${snap.enabled ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} class="rounded bg-zinc-800 border-zinc-700"/></label>
      </div>

      ${isNew ? UI.card('Phạm vi áp dụng (Scope)', `<div class="p-4 space-y-3">
        <p class="text-[11px] text-zinc-400 leading-relaxed">Luật khớp theo <b>IP nguồn</b> + <b>port đích trên frps</b> (tcp, udp, http, https, mc, pe, tcpmux, tcp+udp). Mỗi port tại một thời điểm thuộc về một proxy → luật vẫn đúng khi proxy đăng ký lại với tên khác. Lưu ý: http/https dùng chung port vhost, mc có thể dùng chung port → luật ở đó áp cho tất cả. <b>stcp/xtcp</b> (và biến thể udp) xác thực bằng visitor nên <b>không</b> thuộc phạm vi này.</p>
        <label class="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" id="fw-controlport" ${snap.controlPort ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} class="mt-0.5 rounded bg-zinc-800 border-zinc-700"/>
          <span>Bảo vệ cả <b>control port</b> của frps
            <span class="block text-[11px] text-zinc-500 mt-0.5">Áp luật cho frpc kết nối tới <b>bindPort</b> (trước khi login) — ghi port đó vào một luật để chặn client đăng nhập.</span>
          </span>
        </label>
        <div class="rounded-lg bg-amber-900/20 border border-amber-700/50 p-2.5 text-[11px] text-amber-200">Cẩn thận: nếu <b>default policy = deny</b>, bật cái này sẽ <b>khóa mọi client</b> không có luật allow tường minh.</div>
      </div>`) : ''}

      ${UI.card('Blacklist provider (hỏi IP lạ)', `<div class="p-4 space-y-3">
        <label class="block max-w-xs"><span class="text-xs text-zinc-400">Chế độ</span>
          <select id="fw-pmode" ${canUpdate ? '' : 'disabled'} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
            <option value="off" ${snap.provider.mode === 'off' ? 'selected' : ''}>Tắt (chỉ luật + default)</option>
            <option value="frpcontrol" ${snap.provider.mode === 'frpcontrol' ? 'selected' : ''}>FRPControl</option>
            <option value="custom" ${snap.provider.mode === 'custom' ? 'selected' : ''}>Custom API</option>
          </select></label>
        <div id="fw-provider-fields">${providerFieldsHtml()}</div>
      </div>`)}

      ${UI.card('Luật thủ công (manual rules)', `<div class="p-4">
        <div class="flex items-center gap-3 mb-3">
          <label class="text-sm text-zinc-300 flex items-center gap-2">Default policy
            <select id="fw-default" ${canUpdate ? '' : 'disabled'} class="rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm">
              <option value="allow" ${snap.default === 'allow' ? 'selected' : ''}>allow</option>
              <option value="deny" ${snap.default === 'deny' ? 'selected' : ''}>deny</option>
            </select></label>
          <div class="flex-1"></div>
          ${canUpdate ? UI.btn('Thêm luật', { size: 'sm', attrs: 'id="fw-add-rule"' }) : ''}
        </div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead class="text-xs text-zinc-500"><tr>
            <th class="px-3 py-1.5 text-left">Action</th><th class="px-3 py-1.5 text-left">CIDR/IP</th>${rulesHeadHtml()}<th class="px-3 py-1.5 text-left">Hết hạn</th><th class="px-3 py-1.5 text-left">Ghi chú</th><th></th>
          </tr></thead>
          <tbody id="fw-rules-body">${rulesBodyHtml()}</tbody>
        </table></div>
      </div>`)}

      ${canUpdate ? `<div class="mt-4">${UI.btn('Lưu cấu hình firewall', { variant: 'primary', attrs: 'id="fw-save"' })}</div>` : '<p class="text-xs text-zinc-500 mt-3">Bạn không có quyền sửa (cần providers.update).</p>'}
    `;

    // ---- Wiring ----
    function wireProviderInputs() {
      body.querySelectorAll('#fw-provider-fields [data-p]').forEach((el) => {
        const key = el.dataset.p;
        const ev = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(ev, () => {
          if (el.type === 'checkbox') snap.provider[key] = el.checked;
          else if (key === 'headers') {
            const h = {}; el.value.split('\n').forEach((line) => { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }); snap.provider.headers = h;
          } else if (key === 'cacheTTLSec' || key === 'timeoutMs') snap.provider[key] = Number(el.value) || 0;
          else snap.provider[key] = el.value;
          if (key === 'method') drawProvider(); // hiện/ẩn body POST
        });
      });
    }
    wireProviderInputs();

    body.querySelector('#fw-enabled')?.addEventListener('change', (e) => { snap.enabled = e.target.checked; });
    body.querySelector('#fw-controlport')?.addEventListener('change', (e) => { snap.controlPort = e.target.checked; });
    body.querySelector('#fw-default')?.addEventListener('change', (e) => { snap.default = e.target.value; });
    body.querySelector('#fw-pmode')?.addEventListener('change', (e) => { snap.provider.mode = e.target.value; drawProvider(); });
    body.querySelector('#fw-add-rule')?.addEventListener('click', () => openRuleModal(-1));

    body.querySelector('#fw-rules-body').addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]'); const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
      if (up) { const i = +up.dataset.up; if (i > 0) { const r = snap.rules.splice(i, 1)[0]; snap.rules.splice(i - 1, 0, r); drawRules(); } }
      else if (ed) openRuleModal(+ed.dataset.edit);
      else if (del) { snap.rules.splice(+del.dataset.del, 1); drawRules(); }
    });

    body.querySelector('#fw-save')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); btn.disabled = true;
      try {
        const payload = { enabled: snap.enabled, default: snap.default, rules: snap.rules, provider: snap.provider };
        if (isNew) payload.controlPort = Boolean(snap.controlPort); // chỉ gửi khi frps hỗ trợ
        await API.putProviderFirewall(provider.id, payload);
        UI.toast('Đã lưu cấu hình firewall frps.', 'success');
      } catch (err) { UI.toast('Lưu lỗi: ' + err.message, 'error'); }
      btn.disabled = false;
    });

    // ---- Modal thêm/sửa luật ----
    function openRuleModal(index) {
      const blank = isNew
        ? { action: 'deny', cidr: '', port: '', note: '', expiresAt: 0 }
        : { action: 'deny', cidr: '', proxy: '', user: '', note: '', expiresAt: 0 };
      const r = index === -1 ? blank : { ...snap.rules[index] };
      const curDays = r.expiresAt ? Math.max(1, Math.round((r.expiresAt - Date.now() / 1000) / 86400)) : 14;
      const dur = !r.expiresAt ? 'perm' : '14';
      // Bản mới khớp theo PORT đích; bản cũ khớp theo proxy/user.
      const matchFields = isNew
        ? `<label class="block"><span class="text-xs text-zinc-400">Port (trống = all)</span>${inp(r.port, 'name="port"', 'all')}
             <span class="block text-[11px] text-zinc-500 mt-1">Port trên frps mà client kết nối tới: một port (<code>6000</code>), dải (<code>6000-6010</code>), danh sách (<code>80,443,7000-7010</code>) hoặc <code>all</code>.</span></label>`
        : `<label class="block"><span class="text-xs text-zinc-400">Proxy (glob, trống = mọi)</span>${inp(r.proxy, 'name="proxy"', 'rdp-*')}</label>
           <label class="block"><span class="text-xs text-zinc-400">User (glob, trống = mọi)</span>${inp(r.user, 'name="user"', '')}</label>`;
      UI.openModal({
        title: index === -1 ? 'Thêm luật' : 'Sửa luật',
        body: `<form id="rule-form" class="space-y-3">
          <label class="block"><span class="text-xs text-zinc-400">Action</span>
            <select name="action" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
              <option value="deny" ${r.action !== 'allow' ? 'selected' : ''}>deny</option>
              <option value="allow" ${r.action === 'allow' ? 'selected' : ''}>allow</option>
            </select></label>
          <label class="block"><span class="text-xs text-zinc-400">CIDR / IP (trống = mọi IP)</span>${inp(r.cidr, 'name="cidr"', '1.2.3.0/24, ::1, 1.2.3.4')}</label>
          ${matchFields}
          <div class="grid grid-cols-2 gap-3">
            <label class="block"><span class="text-xs text-zinc-400">Thời hạn</span>
              <select name="dur" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">
                <option value="perm" ${dur === 'perm' ? 'selected' : ''}>Vĩnh viễn</option>
                <option value="days" ${dur !== 'perm' ? 'selected' : ''}>Số ngày</option>
              </select></label>
            <label class="block"><span class="text-xs text-zinc-400">Số ngày</span>${inp(curDays, 'name="days" type="number" min="1"', '14')}</label>
          </div>
          <label class="block"><span class="text-xs text-zinc-400">Ghi chú</span>${inp(r.note, 'name="note"')}</label>
        </form>`,
        footer: UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn('OK', { variant: 'primary', attrs: 'id="rule-ok"' }),
        onMount(el) {
          el.querySelector('#rule-ok').addEventListener('click', () => {
            const f = el.querySelector('#rule-form').elements;
            const rule = { ...r, action: f.action.value, cidr: f.cidr.value.trim(), note: f.note.value.trim() };
            if (isNew) rule.port = f.port.value.trim();
            else { rule.proxy = f.proxy.value.trim(); rule.user = f.user.value.trim(); }
            rule.expiresAt = f.dur.value === 'perm' ? 0 : Math.floor(Date.now() / 1000) + (Number(f.days.value) || 1) * 86400;
            if (index === -1) snap.rules.push(rule); else snap.rules[index] = rule;
            UI.closeModal(); drawRules();
          });
        },
      });
    }
  },
};
