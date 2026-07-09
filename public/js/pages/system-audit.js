/* System · Audit Logs — nhật ký thao tác. */
window.Pages = window.Pages || {};
Pages['system/audit'] = {
  title: 'Audit Logs',
  subtitle: 'Nhật ký thao tác của người dùng',
  async render(root) {
    App.setToolbar(UI.btn('<i class="fa-solid fa-rotate-right"></i>', { size: 'sm', attrs: 'id="refresh"' }),
      (el) => el.querySelector('#refresh')?.addEventListener('click', () => App.rerender()));

    const F = Fmt;
    const { actions } = await API.auditActions().catch(() => ({ actions: [] }));
    const state = { q: '', action: '', method: '', status: '' };

    const HEADERS = ['Thời gian', 'User', 'Action', 'Method', 'Path', 'Status', 'IP'];
    const statusCls = (s) => s >= 500 ? 'text-red-400' : s === 403 || s === 401 ? 'text-amber-400' : s >= 200 && s < 300 ? 'text-emerald-400' : 'text-zinc-400';
    const rowHtml = (e) => `
      <tr data-row="${e.id}" class="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer">
        <td class="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap"><i data-caret class="fa-solid fa-chevron-right text-[9px] text-zinc-600 mr-1.5"></i>${F.escapeHtml(new Date(e.ts).toLocaleString('vi-VN'))}</td>
        <td class="px-3 py-2 font-medium">${F.escapeHtml(e.username || '—')}${e.roleName ? ` <span class="text-[10px] text-zinc-500">(${F.escapeHtml(e.roleName)})</span>` : ''}</td>
        <td class="px-3 py-2">${F.escapeHtml(e.action || '—')}${e.target ? ` · <span class="text-brand-300 font-medium">${F.escapeHtml(e.target)}</span>` : ''}${e.detail ? `<div class="text-[11px] text-zinc-500 truncate max-w-sm" title="${F.escapeHtml(e.detail)}">${F.escapeHtml(e.detail)}</div>` : ''}</td>
        <td class="px-3 py-2"><span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300">${F.escapeHtml(e.method || '')}</span></td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-400">${F.escapeHtml(e.path || '')}</td>
        <td class="px-3 py-2 tabular-nums ${statusCls(e.status)}">${e.status ?? ''}</td>
        <td class="px-3 py-2 font-mono text-[11px] text-zinc-500">${F.escapeHtml(e.ip || '')}</td>
      </tr>
      <tr data-detail="${e.id}" class="hidden bg-zinc-950/40 border-b border-zinc-800/60">
        <td colspan="7" class="px-4 py-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400">
            <div><span class="text-zinc-500">Request:</span> <span class="font-mono">${F.escapeHtml(e.method || '')} ${F.escapeHtml(e.path || '')}</span></div>
            <div><span class="text-zinc-500">Route:</span> <span class="font-mono">${F.escapeHtml(e.route || '—')}</span></div>
            <div><span class="text-zinc-500">Action:</span> ${F.escapeHtml(e.action || '—')}${e.target ? ` · <span class="text-brand-300 font-medium">${F.escapeHtml(e.target)}</span>` : ''}</div>
            <div><span class="text-zinc-500">Status:</span> <span class="${statusCls(e.status)}">${e.status ?? '—'}</span> · <span class="text-zinc-500">Thời lượng:</span> ${e.durationMs != null ? e.durationMs + ' ms' : '—'}</div>
            <div><span class="text-zinc-500">User:</span> ${F.escapeHtml(e.username || '—')}${e.roleName ? ` (${F.escapeHtml(e.roleName)})` : ''} · <span class="text-zinc-500">IP:</span> <span class="font-mono">${F.escapeHtml(e.ip || '—')}</span></div>
            ${e.detail ? `<div class="sm:col-span-2"><span class="text-zinc-500">Chi tiết:</span> ${F.escapeHtml(e.detail)}</div>` : ''}
            <div class="sm:col-span-2"><span class="text-zinc-500">User-Agent:</span> <span class="font-mono text-[11px]">${F.escapeHtml(e.userAgent || '—')}</span></div>
          </div>
        </td>
      </tr>`;

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input id="q" placeholder="Tìm (user / path / ip)..." class="flex-1 min-w-[200px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        <select id="f-action" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm"><option value="">Tất cả action</option>${actions.map((a) => `<option>${F.escapeHtml(a)}</option>`).join('')}</select>
        <select id="f-method" class="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm"><option value="">Method</option>${['GET', 'POST', 'PUT', 'DELETE'].map((m) => `<option>${m}</option>`).join('')}</select>
        <input id="f-status" placeholder="Status" class="w-24 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm" />
      </div>
      <div id="tbl">${UI.spinner()}</div>
    </div>`;

    const load = async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (state.q) params.set('q', state.q);
      if (state.action) params.set('action', state.action);
      if (state.method) params.set('method', state.method);
      if (state.status) params.set('status', state.status);
      try {
        const { items, total } = await API.listAudit('?' + params.toString());
        UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows: items.map(rowHtml), emptyText: 'Không có log phù hợp.' });
        if (total > 500) UI.toast(`Hiển thị 500/${total} log gần nhất. Dùng bộ lọc để thu hẹp.`, 'info');
      } catch (err) {
        root.querySelector('#tbl').innerHTML = UI.errorBox('Không tải được log: ' + err.message);
      }
    };
    await load();

    // Click 1 dòng -> mở/đóng dropdown chi tiết.
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
    root.querySelector('#f-action').addEventListener('change', (e) => { state.action = e.target.value; load(); });
    root.querySelector('#f-method').addEventListener('change', (e) => { state.method = e.target.value; load(); });
  },
};
