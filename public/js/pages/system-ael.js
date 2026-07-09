/* System · API Error Logs (AEL) — nhật ký lỗi request (chỉ xem). */
window.Pages = window.Pages || {};
Pages['system/ael'] = {
  title: 'API Error Logs',
  subtitle: 'Nhật ký lỗi khi gọi Admin API của FRPS/FRPC (lỗi API panel xem ở Audit Logs)',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));

    const F = Fmt;
    const state = { q: '', method: '', status: '' };

    const HEADERS = ['Thời gian', 'User', 'Method', 'Path', 'Status', 'Code', 'Message', 'IP'];
    const statusCls = (s) => s >= 500 ? 'text-red-400' : (s === 403 || s === 429) ? 'text-amber-400' : s === 404 ? 'text-sky-400' : 'text-zinc-300';
    const rowHtml = (e) => {
      const detailObj = e.response ?? { error: e.message || '', code: e.code || '', status: e.status };
      const detailJson = JSON.stringify(detailObj, null, 2);
      return `
      <tr data-row="${e.id}" class="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer">
        <td class="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap"><i data-caret class="fa-solid fa-chevron-right text-[9px] text-zinc-600 mr-1.5"></i>${F.escapeHtml(new Date(e.ts).toLocaleString('vi-VN'))}</td>
        <td class="px-3 py-2 font-medium">${F.escapeHtml(e.username || '—')}</td>
        <td class="px-3 py-2"><span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300">${F.escapeHtml(e.method || '')}</span></td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-400">${F.escapeHtml(e.path || '')}</td>
        <td class="px-3 py-2 tabular-nums font-semibold ${statusCls(e.status)}">${e.status ?? ''}</td>
        <td class="px-3 py-2 text-[11px] text-zinc-500">${F.escapeHtml(e.code || '')}</td>
        <td class="px-3 py-2 text-xs text-red-300 max-w-md truncate" title="${F.escapeHtml(e.message || '')}">${F.escapeHtml(e.message || '')}</td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-500">${F.escapeHtml(e.ip || '')}</td>
      </tr>
      <tr data-detail="${e.id}" class="hidden bg-zinc-950/40 border-b border-zinc-800/60">
        <td colspan="8" class="px-4 py-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400 mb-2">
            <div><span class="text-zinc-500">Request:</span> <span class="font-mono">${F.escapeHtml(e.method || '')} ${F.escapeHtml(e.path || '')}${e.query ? '?' + F.escapeHtml(e.query) : ''}</span></div>
            <div><span class="text-zinc-500">User:</span> ${F.escapeHtml(e.username || '—')} · <span class="text-zinc-500">IP:</span> <span class="font-mono">${F.escapeHtml(e.ip || '—')}</span></div>
            <div class="sm:col-span-2"><span class="text-zinc-500">User-Agent:</span> <span class="font-mono text-[11px]">${F.escapeHtml(e.userAgent || '—')}</span></div>
          </div>
          <div class="text-[11px] text-zinc-500 mb-1">Response JSON (HTTP ${e.status ?? ''}):</div>
          <pre class="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap">${F.escapeHtml(detailJson)}</pre>
        </td>
      </tr>`;
    };

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input id="q" placeholder="Tìm (user / path / message / ip)..." class="flex-1 min-w-[220px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        <select id="f-method" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm"><option value="">Method</option>${['GET', 'POST', 'PUT', 'DELETE'].map((m) => `<option>${m}</option>`).join('')}</select>
        <input id="f-status" placeholder="Status" class="w-24 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm" />
      </div>
      <div id="tbl">${UI.spinner()}</div>
    </div>`;

    const load = async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (state.q) params.set('q', state.q);
      if (state.method) params.set('method', state.method);
      if (state.status) params.set('status', state.status);
      try {
        const { items, total } = await API.listApiErrors('?' + params.toString());
        UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows: items.map(rowHtml), emptyText: 'Chưa có lỗi nào được ghi nhận.' });
        if (total > 500) UI.toast(`Hiển thị 500/${total} lỗi gần nhất. Dùng bộ lọc để thu hẹp.`, 'info');
      } catch (err) {
        root.querySelector('#tbl').innerHTML = UI.errorBox('Không tải được log: ' + err.message);
      }
    };
    await load();

    // Click 1 dòng -> mở/đóng dropdown chi tiết (JSON response). Click trong vùng chi tiết không đóng.
    root.querySelector('#tbl').addEventListener('click', (e) => {
      const row = e.target.closest('[data-row]');
      if (!row) return;
      const detail = root.querySelector(`[data-detail="${row.dataset.row}"]`);
      if (!detail) return;
      const open = !detail.classList.toggle('hidden');
      const caret = row.querySelector('[data-caret]');
      if (caret) { caret.classList.toggle('fa-chevron-right', !open); caret.classList.toggle('fa-chevron-down', open); }
    });

    let t;
    const debounce = (fn) => { clearTimeout(t); t = setTimeout(fn, 350); };
    root.querySelector('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); debounce(load); });
    root.querySelector('#f-status').addEventListener('input', (e) => { state.status = e.target.value.trim(); debounce(load); });
    root.querySelector('#f-method').addEventListener('change', (e) => { state.method = e.target.value; load(); });
  },
};
