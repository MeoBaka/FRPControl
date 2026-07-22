/* System · Firewall — blacklist IP: trạng thái, tra cứu, API key chia sẻ, tài liệu. */
window.Pages = window.Pages || {};
Pages['system/firewall'] = {
  title: 'Firewall',
  subtitle: 'Chặn IP xấu theo blacklist (tự cập nhật hàng ngày) + API chia sẻ tra cứu IP',
  async render(root) {
    const F = Fmt;
    const canUpdate = Store.can('firewall.update');
    const canKeys = Store.can('firewall.keys');

    const st = await API.firewallStats();
    const num = (n) => Number(n || 0).toLocaleString('vi-VN');
    // Số IP bị ban (đã giãn CIDR) có thể vượt Number (IPv6 /32 = 2^96) -> nhóm nghìn trên CHUỖI BigInt.
    const bigNum = (s) => String(s ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const mb = (n) => (Number(n || 0) / 1048576).toFixed(1) + ' MB';

    App.setToolbar(
      (canUpdate ? UI.btn('Cập nhật blacklist ngay', { size: 'sm', variant: 'primary', attrs: 'id="fw-refresh"' }) : '') +
      ' ' + UI.btn('Tải lại', { size: 'sm', attrs: 'id="fw-reload"' }),
      (el) => {
        el.querySelector('#fw-reload')?.addEventListener('click', () => App.rerender());
        el.querySelector('#fw-refresh')?.addEventListener('click', async (e) => {
          const btn = e.target.closest('button'); btn.disabled = true; btn.textContent = 'Đang tải nguồn…';
          try { const r = await API.firewallRefresh(); UI.toast(`Đã cập nhật: ${num(r.meta.ipv4Ranges)} dải IPv4.`, 'success'); App.rerender(); }
          catch (err) { UI.toast('Cập nhật lỗi: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Cập nhật blacklist ngay'; }
        });
      }
    );

    // ---- Trạng thái ----
    const statusPill = st.enabled
      ? `<span class="text-emerald-400">Đang bật</span> <span class="text-zinc-500">· chế độ ${st.mode === 'monitor' ? 'giám sát (không chặn)' : 'chặn (403)'}</span>`
      : '<span class="text-zinc-400">Đang tắt</span> <span class="text-zinc-600">· bật trong Configs</span>';
    const built = st.builtAt ? `${new Date(st.builtAt).toLocaleString('vi-VN')} (${F.timeAgo(st.builtAt)})` : '—';

    const cards = `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${UI.statCard({ label: 'IP IPv4 bị ban (đã giãn CIDR)', value: bigNum(st.ipv4AddressesCovered), sub: `${num(st.ipv4Ranges)} dải` })}
      ${UI.statCard({ label: 'Dải IPv6', value: num(st.ipv6Ranges), sub: 'mỗi dải có thể rất lớn' })}
      ${UI.statCard({ label: 'Chặn thủ công (đang hiệu lực)', value: num(st.customCount) })}
      ${UI.statCard({ label: 'Đã chặn/đánh dấu', value: num(st.hits) })}
    </div>`;

    const apiPill = st.apiEnabled
      ? '<span class="text-emerald-400">Đang bật</span> <span class="text-zinc-500">· dịch vụ ngoài gọi được /api/fw/*</span>'
      : '<span class="text-zinc-400">Đang tắt</span> <span class="text-zinc-600">· bật trong Configs để chia sẻ</span>';
    const infoCard = UI.card('Trạng thái blacklist', `<div class="p-4 text-sm space-y-1.5">
      <div><span class="text-zinc-500 inline-block w-40">Chặn panel</span> ${statusPill}</div>
      <div><span class="text-zinc-500 inline-block w-40">Firewall API</span> ${apiPill}</div>
      <div><span class="text-zinc-500 inline-block w-40">Tự cập nhật</span> ${st.autoUpdate ? `Bật — mỗi ngày lúc <b>${F.escapeHtml(st.updateTime || '00:00')}</b>` : 'Tắt'}</div>
      <div class="flex"><span class="text-zinc-500 inline-block w-40 shrink-0">Nguồn (${(st.sources || []).length})</span>
        <span class="flex-1 min-w-0">${(st.sources && st.sources.length
          ? st.sources.map((u) => {
            const failed = (st.sourcesFailed || []).find((x) => x.url === u);
            return `<span class="block font-mono text-xs break-all ${failed ? 'text-red-400' : 'text-zinc-400'}">${F.escapeHtml(u)}${failed ? ` <span class="text-red-500">— lỗi: ${F.escapeHtml(failed.error)}</span>` : ''}</span>`;
          }).join('')
          : '<span class="text-zinc-600 text-xs">—</span>')}</span></div>
      <div><span class="text-zinc-500 inline-block w-40">Tổng IP bị ban</span> IPv4: <b class="text-zinc-200">${bigNum(st.ipv4AddressesCovered)}</b> <span class="text-zinc-600">(${num(st.ipv4Ranges)} dải gộp)</span> · IPv6: <b class="text-zinc-200">${bigNum(st.ipv6AddressesCovered)}</b> <span class="text-zinc-600">(${num(st.ipv6Ranges)} dải)</span></div>
      <div><span class="text-zinc-500 inline-block w-40">Nhãn (reason)</span> ${st.labelCount ? `<b class="text-zinc-200">${num(st.labelCount)}</b> loại lấy từ list nguồn` : '<span class="text-zinc-600">— list nguồn chưa ghi lý do sau IP</span>'}</div>
      <div><span class="text-zinc-500 inline-block w-40">Build gần nhất</span> ${F.escapeHtml(built)}${st.sourceCount ? ` <span class="text-zinc-600">· gộp ${st.sourceCount} nguồn</span>` : ''}</div>
      <div><span class="text-zinc-500 inline-block w-40">Bộ nhớ dùng</span> ${mb(st.memoryBytes)} <span class="text-zinc-600">(nạp thẳng vào RAM)</span></div>
      ${st.lastError ? `<div class="text-red-400"><span class="text-zinc-500 inline-block w-40">Lỗi lần cập nhật</span> ${F.escapeHtml(st.lastError)}</div>` : ''}
      ${!st.loaded ? '<div class="text-amber-400 mt-1">Chưa có dữ liệu blacklist — bấm "Cập nhật blacklist ngay" để tải lần đầu.</div>' : ''}
    </div>`);

    // ---- Công cụ tra cứu ----
    const checkCard = UI.card('Tra cứu IP', `<div class="p-4 space-y-3">
      <textarea id="fw-ips" rows="4" spellcheck="false" placeholder="Mỗi dòng 1 IP (v4/v6). Vd:\n1.0.0.104\n8.8.8.8\n2a14:c380:d70:3::a" class="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none"></textarea>
      <div class="flex items-center gap-3">
        ${UI.btn('Kiểm tra', { size: 'sm', variant: 'primary', attrs: 'id="fw-check"' })}
        <span class="text-[11px] text-zinc-500">Tối đa 10.000 IP/lần. IP nằm trong bất kỳ dải bị chặn = <span class="text-red-400">BẨN</span>.</span>
      </div>
      <div id="fw-check-result"></div>
    </div>`);

    // ---- Chặn IP thủ công ----
    const customCard = canUpdate ? UI.card('Chặn IP thủ công', `<div class="p-4 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">IP hoặc CIDR</label>
          <input id="cb-ip" placeholder="1.2.3.4 hoặc 1.2.3.0/24" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Số ngày</label>
          <input id="cb-days" type="number" value="14" min="1" class="w-24 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <label class="flex items-center gap-1.5 text-sm text-zinc-300 pb-2"><input type="checkbox" id="cb-perm" class="rounded bg-zinc-800 border-zinc-700"/> Vĩnh viễn</label>
        ${UI.btn('Chặn', { size: 'sm', variant: 'primary', attrs: 'id="cb-add"' })}
      </div>
      <input id="cb-reason" placeholder="Lý do (tùy chọn)" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      <p class="text-[11px] text-zinc-500">Mặc định cấm <b>14 ngày</b> rồi tự bỏ. Tick <b>Vĩnh viễn</b> để chặn mãi. Danh sách này gộp cùng blacklist tải về khi kiểm tra.</p>
      <div id="fw-custom"></div>
    </div>`) : '';

    // ---- API keys ----
    const keyApiNote = st.apiEnabled ? '' : '<div class="mx-4 mt-3 rounded-lg bg-amber-900/20 border border-amber-700/50 p-2.5 text-[11px] text-amber-200">Firewall API đang <b>tắt</b> — key tạo ở đây chưa dùng được cho tới khi bật "Firewall API" trong <b>Configs</b>.</div>';
    const keysCard = canKeys ? UI.card('API key (chia sẻ tra cứu)',
      `${keyApiNote}<div id="fw-keys" class="p-4"></div>`,
      UI.btn('Tạo API key', { size: 'sm', variant: 'primary', attrs: 'id="fw-add-key"' })) : '';

    root.innerHTML = `<div class="p-6 space-y-5">
      ${cards}
      ${infoCard}
      ${checkCard}
      ${customCard}
      ${keysCard}
      ${docsHtml(location.origin)}
    </div>`;

    // Tra cứu
    root.querySelector('#fw-check').addEventListener('click', async () => {
      const box = root.querySelector('#fw-check-result');
      const ips = root.querySelector('#fw-ips').value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      if (!ips.length) { box.innerHTML = '<p class="text-xs text-amber-400">Nhập ít nhất 1 IP.</p>'; return; }
      box.innerHTML = UI.spinner();
      try {
        const r = await API.firewallCheck(ips);
        const srcTag = (s) => (s === 'custom' ? '<span class="text-amber-400">chặn tay</span>' : s === 'list' ? '<span class="text-zinc-500">list</span>' : '');
        const rows = r.results.map((x) => `<tr class="border-b border-zinc-800/60">
          <td class="px-3 py-1.5 font-mono text-xs">${F.escapeHtml(x.ip)}</td>
          <td class="px-3 py-1.5">${x.blacklisted ? '<span class="text-red-400 font-medium">BẨN — bị chặn</span>' : '<span class="text-emerald-400">Sạch</span>'}</td>
          <td class="px-3 py-1.5 text-xs text-zinc-300">${F.escapeHtml(x.reason || '')}</td>
          <td class="px-3 py-1.5 text-xs">${srcTag(x.source)}</td>
        </tr>`).join('');
        box.innerHTML = `<div class="mt-1 text-xs text-zinc-400">${r.blacklisted}/${r.count} IP nằm trong blacklist.</div>
          <div class="overflow-x-auto mt-2"><table class="w-full text-sm"><tbody>${rows}</tbody></table></div>`;
      } catch (err) { box.innerHTML = `<p class="text-xs text-red-400">Lỗi: ${F.escapeHtml(err.message)}</p>`; }
    });

    // Chặn thủ công
    if (canUpdate) {
      const custMount = root.querySelector('#fw-custom');
      await drawCustom(custMount, F);
      const permEl = root.querySelector('#cb-perm');
      const daysEl = root.querySelector('#cb-days');
      permEl.addEventListener('change', () => { daysEl.disabled = permEl.checked; });
      root.querySelector('#cb-add').addEventListener('click', async () => {
        const ip = root.querySelector('#cb-ip').value.trim();
        if (!ip) { UI.toast('Nhập IP/CIDR.', 'error'); return; }
        const permanent = permEl.checked;
        try {
          await API.firewallAddBlock({ ip, permanent, days: Number(daysEl.value) || 14, reason: root.querySelector('#cb-reason').value.trim() });
          UI.toast(`Đã chặn ${ip}.`, 'success');
          root.querySelector('#cb-ip').value = ''; root.querySelector('#cb-reason').value = '';
          await drawCustom(custMount, F);
        } catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
      });
      custMount.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-unblock]'); if (!del) return;
        try { await API.firewallRemoveBlock(del.dataset.unblock); UI.toast('Đã bỏ chặn.', 'success'); await drawCustom(custMount, F); }
        catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
      });
    }

    // API keys
    if (canKeys) {
      await drawKeys(root.querySelector('#fw-keys'), F);
      root.querySelector('#fw-add-key').addEventListener('click', () => openCreateKey(root, F));
      root.querySelector('#fw-keys').addEventListener('click', async (e) => {
        const copy = e.target.closest('[data-copy-key]');
        if (copy) { navigator.clipboard?.writeText(copy.dataset.copyKey); UI.toast('Đã copy API key.', 'success'); return; }
        const edit = e.target.closest('[data-edit-key]');
        if (edit) { openEditKey(root, F, edit.dataset.editKey, edit.dataset.canAdd === '1', edit.dataset.keyName); return; }
        const del = e.target.closest('[data-del-key]'); if (!del) return;
        if (!confirm(`Xóa API key "${del.dataset.name}"? Dịch vụ đang dùng key này sẽ mất quyền tra cứu.`)) return;
        try { await API.firewallDeleteKey(del.dataset.delKey); UI.toast('Đã xóa key.', 'success'); await drawKeys(root.querySelector('#fw-keys'), F); }
        catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); }
      });
    }
  },
};

async function drawKeys(mount, F) {
  const { keys } = await API.firewallKeys();
  if (!keys.length) { mount.innerHTML = '<p class="text-sm text-zinc-500">Chưa có API key. Bấm "Tạo API key" để cấp quyền tra cứu cho dịch vụ ngoài.</p>'; return; }
  const rows = keys.map((k) => `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
    <td class="px-3 py-2 font-medium">${F.escapeHtml(k.name)}</td>
    <td class="px-3 py-2 font-mono text-xs text-zinc-400">${F.escapeHtml(k.prefix)}…</td>
    <td class="px-3 py-2 text-xs">${k.canAdd ? '<span class="text-amber-400">tra cứu + thêm chặn</span>' : '<span class="text-zinc-400">chỉ tra cứu</span>'}</td>
    <td class="px-3 py-2 text-xs text-zinc-400">${new Date(k.createdAt).toLocaleDateString('vi-VN')}</td>
    <td class="px-3 py-2 text-xs text-zinc-400">${k.lastUsedAt ? F.timeAgo(k.lastUsedAt) : '—'}</td>
    <td class="px-3 py-2 text-xs tabular-nums">${Number(k.requests || 0).toLocaleString('vi-VN')}</td>
    <td class="px-3 py-2 text-right whitespace-nowrap space-x-1">
      ${k.key ? UI.btn('Copy', { size: 'sm', attrs: `data-copy-key="${F.escapeHtml(k.key)}"` }) : UI.btn('Copy', { size: 'sm', attrs: 'disabled title="Key cũ không lưu raw"' })}
      ${UI.btn('Sửa', { size: 'sm', attrs: `data-edit-key="${k.id}" data-can-add="${k.canAdd ? 1 : 0}" data-key-name="${F.escapeHtml(k.name)}"` })}
      ${UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del-key="${k.id}" data-name="${F.escapeHtml(k.name)}"` })}
    </td>
  </tr>`).join('');
  mount.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead class="text-xs text-zinc-500"><tr><th class="px-3 py-1.5 text-left">Tên</th><th class="px-3 py-1.5 text-left">Prefix</th><th class="px-3 py-1.5 text-left">Quyền</th><th class="px-3 py-1.5 text-left">Tạo</th><th class="px-3 py-1.5 text-left">Dùng lần cuối</th><th class="px-3 py-1.5 text-left">Requests</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

async function drawCustom(mount, F) {
  const { custom } = await API.firewallListCustom();
  if (!custom.length) { mount.innerHTML = '<p class="text-sm text-zinc-500">Chưa có IP chặn thủ công.</p>'; return; }
  const fmtExp = (c) => {
    if (c.permanent) return '<span class="text-zinc-300">Vĩnh viễn</span>';
    if (c.expired) return '<span class="text-zinc-600">Đã hết hạn</span>';
    const left = Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 86400000));
    return `<span class="text-amber-400">còn ${left} ngày</span>`;
  };
  const rows = custom.map((c) => `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30 ${c.expired ? 'opacity-50' : ''}">
    <td class="px-3 py-2 font-mono text-xs">${F.escapeHtml(c.input)}</td>
    <td class="px-3 py-2 text-xs text-zinc-400">${F.escapeHtml(c.reason || '—')}</td>
    <td class="px-3 py-2 text-xs text-zinc-500">${F.escapeHtml(c.addedBy || '—')}</td>
    <td class="px-3 py-2 text-xs">${fmtExp(c)}</td>
    <td class="px-3 py-2 text-right">${UI.btn('Bỏ chặn', { size: 'sm', variant: 'danger', attrs: `data-unblock="${F.escapeHtml(c.input)}"` })}</td>
  </tr>`).join('');
  mount.innerHTML = `<div class="overflow-x-auto mt-1"><table class="w-full text-sm">
    <thead class="text-xs text-zinc-500"><tr><th class="px-3 py-1.5 text-left">IP / CIDR</th><th class="px-3 py-1.5 text-left">Lý do</th><th class="px-3 py-1.5 text-left">Thêm bởi</th><th class="px-3 py-1.5 text-left">Hết hạn</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function openCreateKey(root, F) {
  UI.openModal({
    title: 'Tạo API key firewall',
    body: `<form id="fw-key-form" class="space-y-3">
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Tên gợi nhớ</label>
        <input name="name" placeholder="vd: server-web-01" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      </div>
      <label class="flex items-start gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="canAdd" class="mt-0.5 rounded bg-zinc-800 border-zinc-700" />
        <span>Cho phép <b>thêm IP chặn</b> (không chỉ tra cứu)<br><span class="text-[11px] text-zinc-500">Key này có thể gọi <span class="font-mono">POST /api/fw/block</span> để đẩy IP vào danh sách chặn.</span></span>
      </label>
      <div id="fw-key-out" class="hidden"></div>
    </form>`,
    footer: UI.btn('Đóng', { attrs: 'data-modal-close' }) + UI.btn('Tạo', { variant: 'primary', attrs: 'id="fw-key-create"' }),
    onMount(el) {
      el.querySelector('#fw-key-create').addEventListener('click', async () => {
        const name = el.querySelector('[name="name"]').value.trim();
        const canAdd = el.querySelector('[name="canAdd"]').checked;
        try {
          const { key } = await API.firewallCreateKey(name, canAdd);
          const out = el.querySelector('#fw-key-out');
          out.classList.remove('hidden');
          out.innerHTML = `<div class="rounded-lg bg-amber-900/20 border border-amber-700/50 p-3 text-xs text-amber-200 space-y-2">
            <div>API key mới (có thể <b>Copy</b> lại sau ở bảng):</div>
            <div class="flex items-center gap-2"><code class="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 font-mono text-emerald-300 break-all">${F.escapeHtml(key.key)}</code>
              <button type="button" id="fw-copy" class="px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800">Copy</button></div>
          </div>`;
          out.querySelector('#fw-copy').addEventListener('click', () => { navigator.clipboard?.writeText(key.key); UI.toast('Đã copy key.', 'success'); });
          el.querySelector('#fw-key-create').remove();
          el.querySelector('[name="name"]').disabled = true;
          drawKeys(root.querySelector('#fw-keys'), Fmt);
        } catch (err) { UI.toast('Tạo key lỗi: ' + err.message, 'error'); }
      });
    },
  });
}

function openEditKey(root, F, id, canAdd, name) {
  UI.openModal({
    title: 'Sửa API key',
    body: `<form id="fw-key-edit" class="space-y-3">
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Tên gợi nhớ</label>
        <input name="name" value="${F.escapeHtml(name || '')}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
      </div>
      <label class="flex items-start gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="canAdd" ${canAdd ? 'checked' : ''} class="mt-0.5 rounded bg-zinc-800 border-zinc-700" />
        <span>Cho phép <b>thêm IP chặn</b> (gọi <span class="font-mono">POST /api/fw/block</span>)</span>
      </label>
    </form>`,
    footer: UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn('Lưu', { variant: 'primary', attrs: 'id="fw-key-save"' }),
    onMount(el) {
      el.querySelector('#fw-key-save').addEventListener('click', async () => {
        const f = el.querySelector('#fw-key-edit').elements;
        try {
          await API.firewallUpdateKey(id, { name: f.name.value.trim(), canAdd: f.canAdd.checked });
          UI.toast('Đã cập nhật key.', 'success');
          UI.closeModal();
          await drawKeys(root.querySelector('#fw-keys'), F);
        } catch (err) { UI.toast('Lưu lỗi: ' + err.message, 'error'); }
      });
    },
  });
}

function docsHtml(origin) {
  const esc = Fmt.escapeHtml;
  return `<details class="rounded-xl border border-zinc-800 bg-zinc-900/40">
    <summary class="px-5 py-3 text-sm font-medium text-zinc-200 cursor-pointer">Hướng dẫn &amp; API Docs</summary>
    <div class="px-5 pb-5 pt-1 text-sm text-zinc-300 space-y-4 leading-relaxed">
      <div>
        <div class="font-medium text-zinc-100 mb-1">Firewall hoạt động thế nào</div>
        <ul class="list-disc list-inside space-y-1 text-zinc-400">
          <li>Panel tải danh sách IP xấu (IP đơn + dải CIDR) từ nguồn, xử lý thành file nhị phân nạp vào RAM.</li>
          <li><b>Lý do (reason)</b>: phần ghi sau địa chỉ trong list nguồn được giữ làm nhãn — <span class="font-mono text-zinc-300">45.8.146.0/24 # botnet c2</span> hoặc không cần <span class="font-mono text-zinc-300">#</span> cũng được (<span class="font-mono text-zinc-300">2.56.189.17 nordvpn</span>). IP chặn tay dùng lý do bạn nhập. Không có gì thì reason rỗng.</li>
          <li>Tự cập nhật lại <b>mỗi ngày lúc 00:00</b> (có thể tắt trong Configs).</li>
          <li>Khi <b>bật</b>: request tới panel từ IP nằm trong blacklist bị <b>chặn 403</b> (chế độ <i>chặn</i>) hoặc chỉ <b>đếm</b> (chế độ <i>giám sát</i>). <b>Localhost luôn được bỏ qua</b> để không tự khóa.</li>
          <li>Bật/tắt + đổi chế độ + nguồn: <b>System → Configs → Firewall</b>.</li>
        </ul>
      </div>
      <div>
        <div class="font-medium text-zinc-100 mb-1">API tra cứu công khai (chia sẻ)</div>
        <p class="text-zinc-400 mb-2">Cấp <b>API key</b> ở trên rồi gọi các endpoint sau (không cần đăng nhập panel). Xác thực qua header <code class="text-zinc-300">X-API-Key</code> (hoặc <code class="text-zinc-300">Authorization: Bearer</code>, hoặc <code class="text-zinc-300">?key=</code>).</p>
        <div class="rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs text-zinc-300 space-y-3 overflow-x-auto">
          <div><span class="text-emerald-400">GET</span>  ${esc(origin)}/api/fw/check?ip=1.2.3.4
            <div class="text-zinc-500"># nhiều IP: lặp ?ip=a&amp;ip=b</div>
            <div class="text-zinc-500"># trả kèm reason + source cho mỗi IP</div></div>
          <div><span class="text-sky-400">POST</span> ${esc(origin)}/api/fw/check
            <div class="text-zinc-500"># body: {"ips":["1.2.3.4","8.8.8.8"]}  · tối đa 10.000</div></div>
          <div><span class="text-amber-400">POST</span> ${esc(origin)}/api/fw/block
            <div class="text-zinc-500"># THÊM IP chặn — chỉ key có "thêm IP chặn"</div>
            <div class="text-zinc-500"># body: {"ip":"1.2.3.4","days":14,"permanent":false,"reason":"abuse"}</div></div>
          <div><span class="text-emerald-400">GET</span>  ${esc(origin)}/api/fw/stats
            <div class="text-zinc-500"># trạng thái blacklist</div></div>
        </div>
        <div class="mt-3 font-medium text-zinc-100 mb-1">Ví dụ curl</div>
        <pre class="rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-[11px] text-zinc-300 overflow-x-auto">curl -H "X-API-Key: fwk_xxx" "${esc(origin)}/api/fw/check?ip=1.0.0.104"
# -> {"ready":true,"count":1,"blacklisted":1,
#     "results":[{"ip":"1.0.0.104","blacklisted":true,"reason":"botnet c2","source":"list"}]}

curl -X POST "${esc(origin)}/api/fw/check" \\
  -H "X-API-Key: fwk_xxx" -H "Content-Type: application/json" \\
  -d '{"ips":["1.0.0.104","8.8.8.8"]}'

# Thêm IP vào danh sách chặn (key phải có quyền "thêm IP chặn"):
curl -X POST "${esc(origin)}/api/fw/block" \\
  -H "X-API-Key: fwk_xxx" -H "Content-Type: application/json" \\
  -d '{"ip":"45.61.12.9","days":14,"reason":"brute-force"}'
# permanent: {"ip":"45.61.12.9","permanent":true}</pre>
        <div class="mt-3 font-medium text-zinc-100 mb-1">Tích hợp nhanh (Nginx allow/deny, fail2ban, script)</div>
        <p class="text-zinc-400">Dịch vụ của bạn gọi <code class="text-zinc-300">/api/fw/check</code> với IP khách; nếu <code class="text-zinc-300">blacklisted=true</code> thì từ chối. Kết quả trả về JSON gọn để tự động hóa.</p>
      </div>
    </div>
  </details>`;
}
