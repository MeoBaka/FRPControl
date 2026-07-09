/* System · Cert Manager — tạo & tải chứng chỉ self-signed (crt/key PEM). */
window.Pages = window.Pages || {};
Pages['system/certs'] = {
  title: 'Cert Manager',
  subtitle: 'Tạo & tải chứng chỉ self-signed cho plugin frpc (https2http/tls2raw) hoặc Panel SSL',
  async render(root) {
    const F = Fmt;
    const canCreate = Store.can('certs.create');
    const canDelete = Store.can('certs.delete');
    const canDownload = Store.can('certs.download');
    const { certs } = await API.listCerts();

    const genCard = canCreate ? UI.card('Tạo chứng chỉ self-signed', `
      <form id="cert-form" class="p-5 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Common Name * <span class="text-zinc-600">(domain hoặc IP)</span></label>
            <input name="commonName" placeholder="163.61.182.135" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Subject Alt Names <span class="text-zinc-600">(cách nhau dấu phẩy)</span></label>
            <input name="altNames" placeholder="163.61.182.135, panel.example.com" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-400 mb-1">Hiệu lực (ngày)</label>
            <input name="days" type="number" value="825" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-[11px] text-zinc-500 max-w-xl leading-relaxed">CN tự động được thêm vào SAN (IP nhận diện tự động). Dùng cho plugin <b>https2http / https2https / tls2raw</b> (điền vào Cert Path / Key Path) hoặc <b>Panel SSL</b> — tải 2 file <span class="font-mono">.crt/.key</span> rồi copy lên máy chạy frpc. Self-signed → trình duyệt cảnh báo "not trusted".</p>
          ${UI.btn('<i class="fa-solid fa-certificate"></i> Tạo chứng chỉ', { variant: 'primary', attrs: 'id="cert-gen"' })}
        </div>
        <div id="cert-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
      </form>`) : '';

    const dl = (id) => canDownload
      ? `<a href="${API.certDownloadUrl(id, 'crt')}" download class="inline-block text-xs px-2 py-1 rounded-lg border border-zinc-700 text-brand-300 hover:bg-zinc-800"><i class="fa-solid fa-download"></i> .crt</a>
         <a href="${API.certDownloadUrl(id, 'key')}" download class="inline-block text-xs px-2 py-1 rounded-lg border border-zinc-700 text-amber-300 hover:bg-zinc-800"><i class="fa-solid fa-key"></i> .key</a>`
      : '<span class="text-[11px] text-zinc-600">Không có quyền tải</span>';

    const rows = (certs || []).map((c) => {
      const exp = c.expiresAt ? new Date(c.expiresAt) : null;
      const days = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
      const color = days == null ? '' : (days <= 0 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-emerald-400');
      const left = days == null ? '' : (days <= 0 ? 'hết hạn' : `${days} ngày`);
      return `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
        <td class="px-3 py-2 font-medium">${F.escapeHtml(c.commonName)}</td>
        <td class="px-3 py-2 text-xs text-zinc-400 font-mono">${F.escapeHtml((c.altNames || []).join(', '))}</td>
        <td class="px-3 py-2 text-xs">${exp ? `${F.escapeHtml(exp.toLocaleDateString('vi-VN'))} · <span class="${color}">${left}</span>` : '—'}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap space-x-1">
          ${dl(c.id)}
          ${canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${c.id}" data-name="${F.escapeHtml(c.commonName)}"` }) : ''}
        </td></tr>`;
    });

    root.innerHTML = `<div class="p-6 space-y-5">
      ${genCard}
      ${UI.card('Chứng chỉ đã tạo', '<div id="tbl" class="p-4"></div>')}
    </div>`;
    UI.paginatedTable(root.querySelector('#tbl'), {
      headers: ['Common Name', 'SAN', 'Hết hạn', { label: 'Thao tác', align: 'right' }],
      rows, emptyText: 'Chưa có chứng chỉ nào.',
    });

    root.querySelector('#cert-gen')?.addEventListener('click', async () => {
      const f = root.querySelector('#cert-form').elements;
      const errBox = root.querySelector('#cert-error'); errBox.classList.add('hidden');
      const payload = { commonName: f.commonName.value.trim(), altNames: f.altNames.value.trim(), days: Number(f.days.value) || 825 };
      if (!payload.commonName) { errBox.textContent = '✗ Cần Common Name.'; errBox.classList.remove('hidden'); return; }
      try { await API.createCert(payload); UI.toast('Đã tạo chứng chỉ.', 'success'); App.rerender(); }
      catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
    });
    root.querySelector('#tbl')?.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]'); if (!del) return;
      if (!confirm(`Xóa chứng chỉ "${del.dataset.name}"?`)) return;
      try { await API.deleteCert(del.dataset.del); UI.toast('Đã xóa.', 'success'); App.rerender(); }
      catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); }
    });
  },
};
