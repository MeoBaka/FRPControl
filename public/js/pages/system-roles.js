/* System · Role Manager — phân quyền theo resource × action. */
window.Pages = window.Pages || {};
Pages['system/roles'] = {
  title: 'Role Manager',
  subtitle: 'Phân quyền (Xem / Thêm / Sửa / Xóa / Điều khiển)',
  async render(root) {
    const canCreate = Store.can('roles.create');
    App.setToolbar(canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm role', { variant: 'primary', attrs: 'id="add-role"' }) : '',
      (el) => el.querySelector('#add-role')?.addEventListener('click', () => openRoleForm(null)));

    const F = Fmt;
    const [{ roles }, { catalog, actionLabels }] = await Promise.all([API.listRoles(), API.permissionCatalog()]);
    window.__permCatalog = { catalog, actionLabels };

    const canUpdate = Store.can('roles.update');
    const canDelete = Store.can('roles.delete');
    const totalPerms = catalog.reduce((n, g) => n + g.actions.length, 0);
    const HEADERS = ['Tên', 'Mô tả', 'Quyền', 'Users', { label: 'Thao tác', align: 'right' }];
    const rows = roles.map((r) => {
      const permText = r.permissions.includes('*') ? `Toàn quyền` : `${r.permissions.length}/${totalPerms}`;
      return `<tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
        <td class="px-3 py-2 font-medium">${F.escapeHtml(r.name)} ${r.system ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-brand-600/20 text-brand-300 border border-brand-500/30">system</span>' : ''}</td>
        <td class="px-3 py-2 text-zinc-400 text-xs">${F.escapeHtml(r.description || '—')}</td>
        <td class="px-3 py-2 text-sm">${permText}</td>
        <td class="px-3 py-2 tabular-nums">${r.userCount}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canUpdate ? UI.btn(r.system ? 'Xem' : 'Sửa', { size: 'sm', attrs: `data-edit="${r.id}"` }) : ''}
          ${canDelete && !r.system ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${r.id}" data-name="${F.escapeHtml(r.name)}"` }) : ''}
        </td></tr>`;
    });

    root.innerHTML = `<div id="roles-view" class="p-6"><div id="tbl"></div></div>`;
    UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows, emptyText: 'Chưa có role nào.' });

    const view = root.querySelector('#roles-view');
    view.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) { const r = roles.find((x) => x.id === edit.dataset.edit); return openRoleForm(r); }
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!confirm(`Xóa role "${del.dataset.name}"?`)) return;
        try { await API.deleteRole(del.dataset.del); UI.toast('Đã xóa role.', 'success'); App.rerender(); }
        catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); }
      }
    });

    // Được điều hướng từ User Manager (click role) -> mở form role đó
    const openRoleId = sessionStorage.getItem('open.role');
    if (openRoleId) {
      sessionStorage.removeItem('open.role');
      const r = roles.find((x) => x.id === openRoleId);
      if (r) openRoleForm(r);
    }
  },
};

function openRoleForm(role) {
  const F = Fmt;
  const editing = Boolean(role);
  const readonly = editing && role.system;
  const { catalog, actionLabels } = window.__permCatalog || { catalog: [], actionLabels: {} };
  const isAll = editing && role.permissions.includes('*');
  const has = (perm) => isAll || (editing && role.permissions.includes(perm));

  const groups = catalog.map((g) => {
    const boxes = g.actions.map((a) => {
      const perm = `${g.resource}.${a}`;
      return `<label class="flex items-center gap-1.5 text-xs text-zinc-300">
        <input type="checkbox" data-perm="${perm}" ${has(perm) ? 'checked' : ''} ${readonly ? 'disabled' : ''} class="rounded bg-zinc-800 border-zinc-700" />
        ${F.escapeHtml(actionLabels[a] || a)}</label>`;
    }).join('');
    return `<div class="rounded-lg border border-zinc-800 p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium">${F.escapeHtml(g.label)}</span>
        ${readonly ? '' : `<button type="button" data-toggle-group="${g.resource}" class="text-[11px] text-brand-400 hover:text-brand-300">chọn tất cả</button>`}
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5">${boxes}</div>
    </div>`;
  }).join('');

  const body = `
    <form id="role-form" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs text-zinc-400 mb-1">Tên role *</label>
          <input name="name" value="${editing ? F.escapeHtml(role.name) : ''}" ${readonly ? 'disabled' : ''} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
        <div><label class="block text-xs text-zinc-400 mb-1">Mô tả</label>
          <input name="description" value="${editing ? F.escapeHtml(role.description || '') : ''}" ${readonly ? 'disabled' : ''} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
      </div>
      ${readonly ? '<div class="rounded-lg px-3 py-2 text-sm bg-brand-600/10 border border-brand-500/30 text-brand-300">Role hệ thống — toàn quyền, không thể sửa.</div>' : ''}
      <div class="space-y-2">${groups}</div>
      <div id="role-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
    </form>`;

  const footer = UI.btn(readonly ? 'Đóng' : 'Hủy', { attrs: 'data-modal-close' }) + (readonly ? '' : UI.btn(editing ? 'Lưu' : 'Tạo', { variant: 'primary', attrs: 'id="role-save"' }));
  UI.openModal({
    title: editing ? (readonly ? 'Role: ' + role.name : 'Sửa role: ' + role.name) : 'Thêm role', body, footer, size: 'xl',
    onMount(rootEl) {
      rootEl.querySelectorAll('[data-toggle-group]').forEach((btn) => btn.addEventListener('click', () => {
        const boxes = [...rootEl.querySelectorAll(`[data-perm^="${btn.dataset.toggleGroup}."]`)];
        const allOn = boxes.every((b) => b.checked);
        boxes.forEach((b) => { b.checked = !allOn; });
      }));
      const saveBtn = rootEl.querySelector('#role-save');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        const f = rootEl.querySelector('#role-form').elements;
        const errBox = rootEl.querySelector('#role-error');
        errBox.classList.add('hidden');
        const permissions = [...rootEl.querySelectorAll('[data-perm]')].filter((b) => b.checked).map((b) => b.dataset.perm);
        const payload = { name: f.name.value.trim(), description: f.description.value.trim(), permissions };
        try {
          if (editing) await API.updateRole(role.id, payload);
          else await API.createRole(payload);
          UI.toast('Đã lưu role.', 'success');
          UI.closeModal(); App.rerender();
        } catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
      });
    },
  });
}
