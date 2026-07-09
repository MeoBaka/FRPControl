/* System · User Manager. */
window.Pages = window.Pages || {};
Pages['system/users'] = {
  title: 'User Manager',
  subtitle: 'Quản lý tài khoản người dùng',
  async render(root) {
    const canCreate = Store.can('users.create');
    App.setToolbar(canCreate ? UI.btn('<i class="fa-solid fa-plus"></i> Thêm user', { variant: 'primary', attrs: 'id="add-user"' }) : '',
      (el) => el.querySelector('#add-user')?.addEventListener('click', () => openUserForm(null)));

    const F = Fmt;
    const [{ users }, { roles }] = await Promise.all([API.listUsers(), API.listRoles()]);

    const canUpdate = Store.can('users.update');
    const canDelete = Store.can('users.delete');
    const canDisable2fa = Store.can('users.disable2fa');
    const canRevoke = Store.can('users.revoke');
    const canViewRoles = Store.can('roles.view');
    const canAssign = Store.can('users.assign');
    const HEADERS = ['Username', 'Tên hiển thị', 'Role', 'Trạng thái', '2FA', { label: 'Phiên', align: 'right' }, 'Đăng nhập cuối', 'IP', { label: 'Thao tác', align: 'right' }];
    const rows = users.map((u) => `
      <tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30">
        <td class="px-3 py-2 font-medium">${F.escapeHtml(u.username)}</td>
        <td class="px-3 py-2 text-zinc-300">${F.escapeHtml(u.displayName || '—')}</td>
        <td class="px-3 py-2">${canViewRoles && u.roleId
          ? `<button data-role="${u.roleId}" class="text-[11px] px-2 py-0.5 rounded bg-zinc-700/40 text-brand-300 hover:bg-zinc-700 hover:underline">${F.escapeHtml(u.roleName || '—')}</button>`
          : `<span class="text-[11px] px-2 py-0.5 rounded bg-zinc-700/40 text-zinc-300">${F.escapeHtml(u.roleName || '—')}</span>`}</td>
        <td class="px-3 py-2">${u.status === 'active'
          ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">active</span>'
          : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">disabled</span>'}</td>
        <td class="px-3 py-2">${u.twoFactorEnabled
          ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><i class="fa-solid fa-shield-halved"></i> bật</span>'
          : '<span class="text-[11px] text-zinc-500">tắt</span>'}</td>
        <td class="px-3 py-2 text-right tabular-nums">${u.activeSessions ? `<span class="text-emerald-400">${u.activeSessions}</span>` : '<span class="text-zinc-600">0</span>'}</td>
        <td class="px-3 py-2 text-xs text-zinc-500">${u.lastLoginAt ? F.escapeHtml(new Date(u.lastLoginAt).toLocaleString('vi-VN')) : 'chưa'}</td>
        <td class="px-3 py-2 text-xs text-zinc-500 font-mono">${u.lastLoginIp ? F.escapeHtml(u.lastLoginIp) : '—'}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${canRevoke && u.activeSessions > 0 ? UI.btn('Thu hồi phiên', { size: 'sm', attrs: `data-revoke="${u.id}" data-name="${F.escapeHtml(u.username)}"` }) : ''}
          ${canDisable2fa && u.twoFactorEnabled ? UI.btn('Tắt 2FA', { size: 'sm', attrs: `data-disable2fa="${u.id}" data-name="${F.escapeHtml(u.username)}"` }) : ''}
          ${canAssign ? UI.btn(`<i class="fa-solid fa-diagram-project"></i> Phân quyền${assignCount(u) ? ` <span class="ml-0.5 text-[10px] px-1 rounded bg-brand-500/20 text-brand-300">${assignCount(u)}</span>` : ''}`, { size: 'sm', attrs: `data-assign="${u.id}"` }) : ''}
          ${canUpdate ? UI.btn('Sửa', { size: 'sm', attrs: `data-edit="${u.id}"` }) : ''}
          ${canDelete ? UI.btn('Xóa', { size: 'sm', variant: 'danger', attrs: `data-del="${u.id}" data-name="${F.escapeHtml(u.username)}"` }) : ''}
        </td></tr>`);

    root.innerHTML = `<div id="users-view" class="p-6"><div id="tbl"></div></div>`;
    UI.paginatedTable(root.querySelector('#tbl'), { headers: HEADERS, rows, emptyText: 'Chưa có user nào.' });

    const view = root.querySelector('#users-view');
    view.addEventListener('click', async (e) => {
      const roleBtn = e.target.closest('[data-role]');
      if (roleBtn) { sessionStorage.setItem('open.role', roleBtn.dataset.role); return App.navigate('#/system/roles'); }
      const asg = e.target.closest('[data-assign]');
      if (asg) { const u = users.find((x) => x.id === asg.dataset.assign); return openAssignForm(u); }
      const edit = e.target.closest('[data-edit]');
      if (edit) { const u = users.find((x) => x.id === edit.dataset.edit); return openUserForm(u, roles); }
      const d2fa = e.target.closest('[data-disable2fa]');
      if (d2fa) {
        if (!confirm(`Tắt 2FA của user "${d2fa.dataset.name}"? User sẽ đăng nhập không cần mã 2FA.`)) return;
        try { await API.disableUser2fa(d2fa.dataset.disable2fa); UI.toast('Đã tắt 2FA của user.', 'success'); App.rerender(); }
        catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
        return;
      }
      const rev = e.target.closest('[data-revoke]');
      if (rev) {
        if (!confirm(`Thu hồi tất cả phiên của "${rev.dataset.name}"? User sẽ bị đăng xuất trên mọi thiết bị.`)) return;
        try { await API.revokeUserSessions(rev.dataset.revoke); UI.toast('Đã thu hồi phiên.', 'success'); App.rerender(); }
        catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!confirm(`Xóa user "${del.dataset.name}"?`)) return;
        try { await API.deleteUser(del.dataset.del); UI.toast('Đã xóa user.', 'success'); App.rerender(); }
        catch (err) { UI.toast('Xóa lỗi: ' + err.message, 'error'); }
      }
    });

    // gắn roles cho form khi thêm mới
    window.__rolesCache = roles;
  },
};

function assignCount(u) { return Object.keys((u && u.assignments) || {}).length; }

/* Assign Item — phân quyền theo từng instance (provider/node) cho 1 user.
   Chọn nhóm Providers / Nodes trước rồi mới hiện danh sách (tránh quá dài). */
async function openAssignForm(user) {
  const F = Fmt;
  let data;
  try { data = await API.assignInstances(); }
  catch (err) { return UI.toast('Không tải được danh sách instance: ' + err.message, 'error'); }
  const instances = data.instances || [];
  const actions = data.actions || ['view', 'monitor', 'update', 'delete'];
  const labels = data.actionLabels || { view: 'Xem', monitor: 'Giám sát', update: 'Sửa', delete: 'Xóa' };

  const providersList = instances.filter((i) => i.role === 'frps');
  const nodesList = instances.filter((i) => i.role === 'frpc');
  let activeRole = providersList.length ? 'frps' : 'frpc';

  // Quyền TOÀN CỤC của role user -> khóa các ô đã có sẵn (khỏi phân trùng).
  let rolePerms = [];
  try { const { roles } = await API.listRoles(); const r = (roles || []).find((x) => x.id === user.roleId); rolePerms = (r && r.permissions) || []; } catch { /* ignore */ }
  const hasPerm = (perm) => rolePerms.includes('*') || rolePerms.includes(perm);
  const grantedByRole = (inst, action) => {
    const res = inst.role === 'frpc' ? 'nodes' : 'providers';
    return hasPerm({ view: `${res}.view`, monitor: 'monitoring.view', update: `${res}.update`, delete: `${res}.delete` }[action]);
  };

  // Giữ trạng thái tick trong bộ nhớ (loại action đã có từ role).
  const selected = {};
  for (const [id, acts] of Object.entries((user && user.assignments) || {})) {
    const inst = instances.find((x) => x.id === id);
    const kept = acts.filter((a) => !(inst && grantedByRole(inst, a)));
    if (kept.length) selected[id] = new Set(kept);
  }
  const countFor = (list) => list.reduce((n, i) => n + ((selected[i.id] && selected[i.id].size) ? 1 : 0), 0);

  const instRow = (i) => {
    const set = selected[i.id] || new Set();
    const checks = actions.map((a) => {
      const g = grantedByRole(i, a);
      return `
      <label class="inline-flex items-center gap-1.5 text-xs select-none ${g ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"${g ? ' title="Đã có sẵn từ role — không cần phân"' : ''}>
        <input type="checkbox" data-inst="${i.id}" data-act="${a}" ${(g || set.has(a)) ? 'checked' : ''} ${g ? 'disabled' : ''} class="accent-brand-500 w-3.5 h-3.5" />
        <span>${labels[a] || a}${g ? ' <span class="text-[9px] text-zinc-500">role</span>' : ''}</span>
      </label>`;
    }).join('');
    return `<tr class="border-b border-zinc-800/60">
      <td class="px-3 py-2 align-top">
        <div class="font-medium text-sm">${F.escapeHtml(i.name)}</div>
        <div class="text-[11px] text-zinc-500 font-mono">${F.escapeHtml(i.baseUrl || '')}</div>
      </td>
      <td class="px-3 py-2"><div class="flex flex-wrap gap-x-4 gap-y-1.5">${checks}</div></td>
    </tr>`;
  };

  const tableFor = (list) => list.length
    ? `<div class="border border-zinc-800 rounded-lg overflow-hidden max-h-[52vh] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-zinc-900/80 text-zinc-400 text-xs sticky top-0"><tr><th class="px-3 py-2 text-left font-medium">Instance</th><th class="px-3 py-2 text-left font-medium">Quyền được cấp</th></tr></thead>
          <tbody>${list.map(instRow).join('')}</tbody>
        </table></div>`
    : '<div class="text-sm text-zinc-500 px-3 py-6 text-center border border-zinc-800 rounded-lg">Không có instance trong nhóm này.</div>';

  const tabBtn = (role, label, list) => {
    const active = activeRole === role;
    const c = countFor(list);
    const badge = c ? ` <span class="ml-0.5 text-[10px] px-1 rounded ${active ? 'bg-zinc-900/20 text-zinc-800' : 'bg-brand-500/20 text-brand-300'}">${c}</span>` : '';
    return `<button data-tab="${role}" class="px-3 py-1.5 rounded-lg text-sm transition ${active ? 'bg-zinc-100 text-zinc-900 font-medium' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'}">${label}${badge}</button>`;
  };

  const body = `
    <div class="space-y-3">
      <p class="text-xs text-zinc-400 leading-relaxed">Cấp quyền cho <b class="text-zinc-200">${F.escapeHtml(user.username)}</b> trên từng instance (cộng thêm ngoài role).
        <span class="text-zinc-300">Xem</span>=thấy trong danh sách ·
        <span class="text-zinc-300">Giám sát</span>=xem status/proxies/clients/config ·
        <span class="text-zinc-300">Sửa</span>=chỉnh sửa &amp; điều khiển ·
        <span class="text-zinc-300">Xóa</span>=xóa instance.</p>
      <p class="text-[11px] text-zinc-500">Ô mờ kèm <span class="text-zinc-400">role</span> = quyền user đã có sẵn từ <b>role</b> (áp cho mọi instance) nên không cần phân thêm.</p>
      <div class="text-[11px] text-zinc-500 flex items-center gap-1">Chọn nhóm trước: ${UI.help('assign-item')}</div>
      <div id="assign-tabs" class="flex gap-2"></div>
      <div id="assign-body"></div>
    </div>`;

  const footer = UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn('Lưu phân quyền', { variant: 'primary', attrs: 'id="assign-save"' });
  UI.openModal({
    title: 'Phân quyền item: ' + user.username, body, footer, size: 'lg',
    onMount(rootEl) {
      const tabsEl = rootEl.querySelector('#assign-tabs');
      const bodyEl = rootEl.querySelector('#assign-body');
      const drawTabs = () => { tabsEl.innerHTML = tabBtn('frps', 'Providers · FRPS', providersList) + tabBtn('frpc', 'Nodes · FRPC', nodesList); };
      const drawBody = () => { bodyEl.innerHTML = tableFor(activeRole === 'frps' ? providersList : nodesList); };
      drawTabs(); drawBody();

      tabsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        activeRole = b.dataset.tab; drawTabs(); drawBody();
      });
      // Cập nhật state khi tick để giữ nguyên khi đổi tab + cập nhật badge đếm.
      bodyEl.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
        const id = cb.dataset.inst, a = cb.dataset.act;
        if (!selected[id]) selected[id] = new Set();
        if (cb.checked) selected[id].add(a); else selected[id].delete(a);
        if (!selected[id].size) delete selected[id];
        drawTabs();
      });

      rootEl.querySelector('#assign-save')?.addEventListener('click', async () => {
        const assignments = {};
        for (const [id, set] of Object.entries(selected)) { if (set.size) assignments[id] = [...set]; }
        try {
          await API.updateUserAssignments(user.id, assignments);
          UI.toast('Đã lưu phân quyền.', 'success');
          UI.closeModal(); App.rerender();
        } catch (err) { UI.toast('Lỗi: ' + err.message, 'error'); }
      });
    },
  });
}

function openUserForm(user, rolesArg) {
  const F = Fmt;
  const editing = Boolean(user);
  const roles = rolesArg || window.__rolesCache || [];
  const roleOpts = roles.map((r) => `<option value="${r.id}" ${user && user.roleId === r.id ? 'selected' : ''}>${F.escapeHtml(r.name)}</option>`).join('');

  const body = `
    <form id="user-form" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Username *</label>
          <input name="username" ${editing ? 'disabled' : ''} value="${editing ? F.escapeHtml(user.username) : ''}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${editing ? 'text-zinc-500' : ''}" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Tên hiển thị</label>
          <input name="displayName" value="${editing ? F.escapeHtml(user.displayName || '') : ''}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Role *</label>
          <select name="roleId" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">${roleOpts}</select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Trạng thái</label>
          <select name="status" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
            <option value="active" ${!editing || user.status === 'active' ? 'selected' : ''}>active</option>
            <option value="disabled" ${editing && user.status === 'disabled' ? 'selected' : ''}>disabled</option>
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-xs text-zinc-400 mb-1">Mật khẩu ${editing ? '(để trống nếu không đổi)' : '*'}</label>
          <input name="password" type="password" autocomplete="new-password" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      </div>
      <div id="user-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
    </form>`;

  const footer = UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn(editing ? 'Lưu' : 'Tạo', { variant: 'primary', attrs: 'id="user-save"' });
  UI.openModal({
    title: editing ? 'Sửa user: ' + user.username : 'Thêm user', body, footer, size: 'lg',
    onMount(rootEl) {
      rootEl.querySelector('#user-save').addEventListener('click', async () => {
        const f = rootEl.querySelector('#user-form').elements;
        const errBox = rootEl.querySelector('#user-error');
        errBox.classList.add('hidden');
        const payload = { displayName: f.displayName.value.trim(), roleId: f.roleId.value, status: f.status.value };
        if (f.password.value) payload.password = f.password.value;
        try {
          if (editing) await API.updateUser(user.id, payload);
          else { payload.username = f.username.value.trim(); payload.password = f.password.value; await API.createUser(payload); }
          UI.toast('Đã lưu user.', 'success');
          UI.closeModal(); App.rerender();
        } catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
      });
    },
  });
}
