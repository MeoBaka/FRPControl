/* Router + sidebar (thu gọn) + tabs + auth/login + phân quyền UI. Gắn vào window.App. */
window.App = (() => {
  const icon = (name) => `<i class="fa-solid ${name} w-4 text-center shrink-0"></i>`;
  const ICONS = {
    dashboard: icon('fa-gauge-high'), server: icon('fa-server'), status: icon('fa-wave-square'),
    clients: icon('fa-users'), proxies: icon('fa-right-left'), node: icon('fa-microchip'),
    visitors: icon('fa-user-shield'), config: icon('fa-file-code'),
    users: icon('fa-user-group'), roles: icon('fa-user-lock'), audit: icon('fa-clipboard-list'), settings: icon('fa-gear'),
    certs: icon('fa-certificate'), ael: icon('fa-triangle-exclamation'), firewall: icon('fa-shield-halved'),
  };

  // anyPerm: hiện item nếu có BẤT KỲ quyền nào trong danh sách (rỗng = luôn hiện)
  const NAV = [
    { type: 'item', route: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, anyPerm: [] },
    { type: 'section', label: 'Providers · FRPS', anyPerm: ['providers.view', 'monitoring.view'], orAssigned: true },
    { type: 'item', route: 'providers', label: 'Providers', icon: ICONS.server, anyPerm: ['providers.view'], orAssigned: true },
    { type: 'item', route: 'providers/status', label: 'Status', icon: ICONS.status, anyPerm: ['monitoring.view'], orAssigned: true },
    { type: 'item', route: 'providers/clients', label: 'Clients', icon: ICONS.clients, anyPerm: ['monitoring.view'], orAssigned: true },
    { type: 'item', route: 'providers/proxies', label: 'Proxies', icon: ICONS.proxies, anyPerm: ['monitoring.view'], orAssigned: true },
    { type: 'section', label: 'Nodes · FRPC', anyPerm: ['nodes.view', 'monitoring.view'], orAssigned: true },
    { type: 'item', route: 'nodes', label: 'Nodes', icon: ICONS.node, anyPerm: ['nodes.view'], orAssigned: true },
    { type: 'item', route: 'nodes/proxies', label: 'Proxies', icon: ICONS.proxies, anyPerm: ['monitoring.view', 'proxies.view'], orAssigned: true },
    { type: 'item', route: 'nodes/visitors', label: 'Visitors', icon: ICONS.visitors, anyPerm: ['visitors.view'], orAssigned: true },
    { type: 'item', route: 'nodes/configs', label: 'Configs', icon: ICONS.config, anyPerm: ['configs.view'], orAssigned: true },
    { type: 'section', label: 'System', anyPerm: ['users.view', 'roles.view', 'certs.view', 'audit.view', 'ael.view', 'settings.view'] },
    { type: 'item', route: 'system/users', label: 'User Manager', icon: ICONS.users, anyPerm: ['users.view'] },
    { type: 'item', route: 'system/roles', label: 'Role Manager', icon: ICONS.roles, anyPerm: ['roles.view'] },
    { type: 'item', route: 'system/certs', label: 'Cert Manager', icon: ICONS.certs, anyPerm: ['certs.view'] },
    { type: 'item', route: 'system/firewall', label: 'Firewall', icon: ICONS.firewall, anyPerm: ['firewall.view'] },
    { type: 'item', route: 'system/audit', label: 'Audit Logs', icon: ICONS.audit, anyPerm: ['audit.view'] },
    { type: 'item', route: 'system/ael', label: 'API Error Logs', icon: ICONS.ael, anyPerm: ['ael.view'] },
    { type: 'item', route: 'system/settings', label: 'Configs', icon: ICONS.settings, anyPerm: ['settings.view'] },
  ];
  const ROUTE_PERM = Object.fromEntries(NAV.filter((n) => n.type === 'item').map((n) => [n.route, n.anyPerm || []]));
  // Route mở được nhờ Assign Item (dù role không có quyền toàn cục)
  const ROUTE_ASSIGNABLE = new Set(NAV.filter((n) => n.type === 'item' && n.orAssigned).map((n) => n.route));
  const visible = (it) => {
    const has = !it.anyPerm || !it.anyPerm.length || Store.canAny(it.anyPerm);
    return has || (it.orAssigned && Store.hasAssignments());
  };

  const COLLAPSE_KEY = 'frpc.sidebarCollapsed';
  const TABS_KEY = 'frpc.openTabs';
  let collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  let openTabs = [];
  try { openTabs = JSON.parse(localStorage.getItem(TABS_KEY) || '[]').filter((r) => Pages[r]); } catch { openTabs = []; }
  const PINNED_KEY = 'frpc.pinnedTabs';
  let pinnedTabs = new Set();
  try { pinnedTabs = new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]').filter((r) => Pages[r])); } catch { pinnedTabs = new Set(); }

  // Lịch sử điều hướng để làm nút Back
  let backStack = [];
  let lastRouteKey = null;
  let suppressBackPush = false;

  function goBack() {
    if (!backStack.length) return;
    const prev = backStack.pop();
    suppressBackPush = true;
    navigate('#/' + prev);
  }

  function currentRoute() {
    const r = location.hash.replace(/^#\/?/, '') || 'dashboard';
    return Pages[r] ? r : 'dashboard';
  }

  // ---------------- Sidebar ----------------

  function userBoxHtml() {
    const u = Store.state.user; const role = Store.state.role;
    if (!u) return '';
    const initials = (u.displayName || u.username || '?').slice(0, 2).toUpperCase();
    const avatar = `<div class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-xs font-semibold shrink-0">${Fmt.escapeHtml(initials)}</div>`;
    const menu = `<div id="user-menu" class="hidden absolute bottom-full mb-2 left-0 ${collapsed ? 'w-52' : 'right-0'} rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden z-20">
      <div class="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2">${avatar}<div class="min-w-0"><div class="text-sm text-zinc-100 truncate">${Fmt.escapeHtml(u.displayName || u.username)}</div><div class="text-[11px] text-zinc-500 truncate">@${Fmt.escapeHtml(u.username)}${role ? ' · ' + Fmt.escapeHtml(role.name) : ''}</div></div></div>
      <button data-user-action="profile" class="w-full text-left px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2.5"><i class="fa-solid fa-gear w-4 text-center"></i> Cài đặt tài khoản</button>
      <button data-user-action="logout" class="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2.5"><i class="fa-solid fa-right-from-bracket w-4 text-center"></i> Đăng xuất</button>
    </div>`;
    if (collapsed) {
      return `<div class="relative flex justify-center">
        <button id="user-menu-btn" title="Tài khoản" class="rounded-lg hover:ring-2 hover:ring-zinc-700 transition">${avatar}</button>
        ${menu}</div>`;
    }
    return `<div class="relative">
      <button id="user-menu-btn" class="w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-zinc-800/60 transition">
        ${avatar}
        <div class="min-w-0 flex-1 text-left"><div class="text-sm text-zinc-200 truncate">${Fmt.escapeHtml(u.displayName || u.username)}</div>
          <div class="text-[11px] text-zinc-500 truncate">${Fmt.escapeHtml(role ? role.name : '')}</div></div>
        <i class="fa-solid fa-chevron-up text-xs text-zinc-500"></i>
      </button>
      ${menu}</div>`;
  }

  function renderTopbarBrand() {
    const el = document.getElementById('topbar-brand');
    el.className = `shrink-0 border-r border-zinc-800 flex items-center transition-all duration-200 ${collapsed ? 'w-16 justify-center px-2' : 'w-64 justify-between px-3'}`;
    el.innerHTML = `
      ${collapsed ? '' : `<div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-lg shrink-0">F</div>
        <div class="min-w-0"><h1 class="font-semibold leading-tight truncate">${Fmt.escapeHtml(Store.state.settings.siteName || 'FRPControl')}</h1><p class="text-[11px] text-zinc-500 truncate">Quản lý FRP</p></div>
      </div>`}
      <button id="sidebar-toggle" title="Thu gọn / mở rộng" class="text-zinc-400 hover:text-zinc-100 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 shrink-0"><i class="fa-solid ${collapsed ? 'fa-angles-right' : 'fa-bars'}"></i></button>`;
    el.querySelector('#sidebar-toggle').addEventListener('click', toggleCollapse);
  }

  function renderSidebar() {
    const active = currentRoute();
    renderTopbarBrand();
    const aside = document.getElementById('sidebar');
    aside.className = `shrink-0 border-r border-zinc-800 bg-zinc-900/40 flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`;

    const headerHtml = (it) => collapsed
      ? `<div class="my-2 mx-2 border-t border-zinc-800/70"></div><div><div class="space-y-0.5">`
      : `<div><div class="px-2 pb-1 text-[10px] uppercase tracking-wide text-zinc-600">${it.label}</div><div class="space-y-0.5">`;
    const itemHtml = (it) => {
      const isActive = active === it.route;
      const cls = isActive ? 'bg-brand-600/15 text-brand-300 ring-1 ring-brand-500/30' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200';
      return collapsed
        ? `<a href="#/${it.route}" title="${it.label}" class="flex items-center justify-center rounded-lg h-10 transition ${cls}">${it.icon}</a>`
        : `<a href="#/${it.route}" class="flex items-center gap-2.5 rounded-lg px-3 py-2 transition ${cls}">${it.icon}<span>${it.label}</span></a>`;
    };

    let nav = '';
    let openGroup = false;      // đang trong 1 group đã mở (header + wrapper)
    let pendingHeader = null;   // header của section đang chờ item đầu tiên (null nếu section ẩn)
    let seenSection = false;
    const closeGroup = () => { if (openGroup) { nav += '</div></div>'; openGroup = false; } };
    for (const it of NAV) {
      if (it.type === 'section') {
        closeGroup();
        seenSection = true;
        pendingHeader = visible(it) ? headerHtml(it) : null;
        continue;
      }
      if (!visible(it)) continue;
      if (!seenSection) {
        nav += `<div class="space-y-0.5">${itemHtml(it)}</div>`;
      } else if (pendingHeader !== null) {
        if (!openGroup) { nav += pendingHeader; openGroup = true; }
        nav += itemHtml(it);
      }
    }
    closeGroup();

    const footer = `<div class="p-3 border-t border-zinc-800 space-y-2">
      ${userBoxHtml()}
    </div>`;

    aside.innerHTML = `<nav class="flex-1 overflow-y-auto px-3 py-4 space-y-3 text-sm">${nav}</nav>${footer}`;
    const menuBtn = document.getElementById('user-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('user-menu')?.classList.toggle('hidden'); });
    aside.querySelectorAll('[data-user-action]').forEach((b) => b.addEventListener('click', () => {
      document.getElementById('user-menu')?.classList.add('hidden');
      if (b.dataset.userAction === 'profile') navigate('#/profile');
      else if (b.dataset.userAction === 'logout') logout();
    }));
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    renderSidebar();
  }

  // ---------------- Tabs ----------------
  function saveTabs() { localStorage.setItem(TABS_KEY, JSON.stringify(openTabs)); }
  function savePinned() { localStorage.setItem(PINNED_KEY, JSON.stringify([...pinnedTabs])); }
  // Sắp xếp: tab ghim lên đầu (giữ thứ tự tương đối).
  function sortPinnedFront() { openTabs = [...openTabs.filter((r) => pinnedTabs.has(r)), ...openTabs.filter((r) => !pinnedTabs.has(r))]; saveTabs(); }
  function togglePin(route) {
    if (pinnedTabs.has(route)) pinnedTabs.delete(route);
    else { pinnedTabs.add(route); openTabs = [route, ...openTabs.filter((r) => r !== route)]; }
    savePinned(); sortPinnedFront(); renderTabs();
  }
  // Đóng mọi tab KHÔNG ghim (giữ lại tab ghim).
  function clearUnpinned() {
    const kept = openTabs.filter((r) => pinnedTabs.has(r));
    openTabs = kept.length ? kept : ['dashboard'];
    saveTabs();
    if (!openTabs.includes(currentRoute())) navigate('#/' + openTabs[0]);
    else renderTabs();
  }
  function closeTabMenu() { document.getElementById('tab-ctx-menu')?.remove(); }
  function showTabMenu(x, y, route) {
    closeTabMenu();
    const pinned = pinnedTabs.has(route);
    const menu = document.createElement('div');
    menu.id = 'tab-ctx-menu';
    menu.className = 'fixed z-[80] min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl py-1 text-sm';
    menu.innerHTML = `
      <button data-act="pin" class="w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2"><i class="fa-solid fa-thumbtack w-4 text-brand-400"></i> ${pinned ? 'Bỏ ghim tab này' : 'Ghim lên đầu'}</button>
      <button data-act="clear" class="w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2"><i class="fa-solid fa-broom w-4 text-zinc-400"></i> Đóng các tab không ghim</button>`;
    document.body.appendChild(menu);
    menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 8)}px`;
    menu.querySelector('[data-act="pin"]').addEventListener('click', () => { closeTabMenu(); togglePin(route); });
    menu.querySelector('[data-act="clear"]').addEventListener('click', () => { closeTabMenu(); clearUnpinned(); });
    setTimeout(() => document.addEventListener('click', closeTabMenu, { once: true }), 0);
  }
  function ensureTab(route) { if (!openTabs.includes(route)) { openTabs.push(route); saveTabs(); } }
  function closeTab(route) {
    const idx = openTabs.indexOf(route);
    if (idx === -1) return;
    if (pinnedTabs.delete(route)) savePinned();
    const wasActive = currentRoute() === route;
    openTabs.splice(idx, 1);
    saveTabs();
    if (!openTabs.length) { openTabs = ['dashboard']; saveTabs(); navigate('#/dashboard'); return; }
    if (wasActive) navigate('#/' + openTabs[Math.max(0, idx - 1)]);
    else renderTabs();
  }
  function reorderTabs(fromRoute, toRoute, after) {
    if (fromRoute === toRoute) return;
    const arr = openTabs.filter((r) => r !== fromRoute);
    let idx = arr.indexOf(toRoute);
    if (idx === -1) return;
    if (after) idx += 1;
    arr.splice(idx, 0, fromRoute);
    openTabs = arr;
    saveTabs();
    renderTabs();
  }

  function renderTabs() {
    const bar = document.getElementById('tab-bar');
    const active = currentRoute();
    bar.innerHTML = openTabs.map((route) => {
      const label = (Pages[route] && Pages[route].title) || route;
      const isActive = route === active;
      const base = 'tab-item group flex items-center gap-2 pl-3 pr-2 h-9 rounded-t-lg cursor-pointer text-sm whitespace-nowrap border border-b-0 transition-colors';
      const cls = isActive ? 'bg-zinc-900 text-zinc-100 border-zinc-700' : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-800/50';
      const pinned = pinnedTabs.has(route);
      return `<div data-tab-route="${route}" draggable="true" title="Chuột phải để ghim / dọn tab" class="${base} ${cls}">
        ${pinned ? '<i class="fa-solid fa-thumbtack text-[10px] text-brand-400 pointer-events-none"></i>' : ''}
        <span class="pointer-events-none select-none">${label}</span>
        <button data-tab-close="${route}" title="Đóng tab" class="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}"><i class="fa-solid fa-xmark text-xs pointer-events-none"></i></button>
      </div>`;
    }).join('');

    let dragRoute = null;
    const clearMarks = () => bar.querySelectorAll('[data-tab-route]').forEach((t) => { t.style.boxShadow = ''; });

    bar.querySelectorAll('[data-tab-route]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab-close]')) return;
        navigate('#/' + el.dataset.tabRoute);
      });
      // Chuột phải -> menu ghim / dọn tab
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabMenu(e.clientX, e.clientY, el.dataset.tabRoute); });
      // Kéo-thả sắp xếp tab
      el.addEventListener('dragstart', (e) => {
        dragRoute = el.dataset.tabRoute;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragRoute); } catch { /* ignore */ }
        setTimeout(() => el.classList.add('opacity-40'), 0);
      });
      el.addEventListener('dragend', () => { el.classList.remove('opacity-40'); clearMarks(); dragRoute = null; });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        clearMarks();
        el.style.boxShadow = after ? 'inset -2px 0 0 0 #ef4444' : 'inset 2px 0 0 0 #ef4444';
      });
      el.addEventListener('dragleave', () => { el.style.boxShadow = ''; });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        clearMarks();
        const from = dragRoute || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
        if (!from) return;
        const rect = el.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        reorderTabs(from, el.dataset.tabRoute, after);
      });
    });

    bar.querySelectorAll('[data-tab-close]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(b.dataset.tabClose);
    }));
  }

  // ---------------- Toolbar & Router ----------------
  function setToolbar(html = '', onMount) {
    const el = document.getElementById('page-toolbar');
    el.innerHTML = html;
    if (onMount) onMount(el);
    UI.wireSelector(el);
  }

  async function route() {
    let key = currentRoute();
    // Bắt buộc bật 2FA: ép về Profile cho tới khi bật xong.
    if (typeof update2faBanner === 'function') update2faBanner();
    if (Store.state.mustEnable2fa && key !== 'profile') { location.hash = '#/profile'; return; }
    const page = Pages[key] || Pages['dashboard'];
    // Cập nhật lịch sử cho nút Back (bỏ qua khi chính nút Back gây điều hướng)
    if (!suppressBackPush && lastRouteKey && lastRouteKey !== key) backStack.push(lastRouteKey);
    suppressBackPush = false;
    lastRouteKey = key;
    const backBtn = document.getElementById('header-back');
    if (backBtn) { backBtn.classList.toggle('hidden', backStack.length === 0); backBtn.classList.toggle('flex', backStack.length > 0); }

    ensureTab(key);
    renderSidebar();
    renderTabs();
    document.getElementById('page-title').textContent = page.title || '';
    document.getElementById('page-subtitle').textContent = page.subtitle || '';
    setToolbar('');
    let content = document.getElementById('page-content');
    const fresh = content.cloneNode(false);
    content.replaceWith(fresh);
    content = fresh;
    // Chặn nếu không đủ quyền vào route (route FRP còn mở được nhờ Assign Item)
    const need = ROUTE_PERM[key] || [];
    const okAssigned = ROUTE_ASSIGNABLE.has(key) && Store.hasAssignments();
    if (need.length && !Store.canAny(need) && !okAssigned) {
      content.innerHTML = `<div class="p-6">${UI.errorBox('Bạn không có quyền truy cập trang này.', 'Liên hệ quản trị viên để được cấp quyền.')}</div>`;
      return;
    }
    content.innerHTML = UI.spinner();
    try { await page.render(content); }
    catch (err) { content.innerHTML = `<div class="p-6">${UI.errorBox('Lỗi khi tải trang: ' + err.message)}</div>`; }
  }

  function rerender() { route(); }
  function navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  // ---------------- Auth ----------------
  function renderLogin(message) {
    document.getElementById('app-shell').style.display = 'none';
    let el = document.getElementById('login-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'login-overlay'; document.body.appendChild(el); }
    const siteName = Store.state.settings.siteName || 'FRPControl';
    const subtitle = Store.state.settings.loginSubtitle || 'Đăng nhập để tiếp tục';
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950 p-4';
    el.innerHTML = `
      <div class="w-full max-w-sm">
        <div class="flex flex-col items-center text-center mb-8">
          <div class="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center font-bold text-2xl shadow-lg shadow-brand-600/20 mb-5">F</div>
          <h1 id="login-title" class="text-2xl font-semibold tracking-tight">${Fmt.escapeHtml(siteName)}</h1>
          <p id="login-subtitle" class="text-sm text-zinc-500 mt-1.5">${Fmt.escapeHtml(subtitle)}</p>
        </div>
        <form id="login-form" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-zinc-200 mb-1.5">Tài khoản</label>
            <input name="username" autocomplete="username" autofocus placeholder="tên đăng nhập" class="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3.5 py-2.5 text-sm placeholder-zinc-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none transition" />
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-200 mb-1.5">Mật khẩu</label>
            <div class="relative">
              <input name="password" type="password" autocomplete="current-password" placeholder="Mật khẩu" class="w-full rounded-lg bg-zinc-900 border border-zinc-700 pl-3.5 pr-10 py-2.5 text-sm placeholder-zinc-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none transition" />
              <button type="button" id="toggle-pass" tabindex="-1" title="Hiện/ẩn mật khẩu" class="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-zinc-500 hover:text-zinc-200"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
          <div id="login-2fa" class="hidden">
            <label class="block text-sm font-medium text-zinc-200 mb-1.5">Mã xác thực 2FA</label>
            <input name="token" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" class="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3.5 py-2.5 text-sm tracking-[0.4em] text-center placeholder-zinc-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none transition" />
            <p class="text-[11px] text-zinc-500 mt-1.5">Nhập mã 6 số từ ứng dụng Authenticator.</p>
          </div>
          <label class="flex items-center gap-2 text-sm text-zinc-300 select-none cursor-pointer">
            <input type="checkbox" name="remember" class="rounded bg-zinc-800 border-zinc-700" />
            Ghi nhớ đăng nhập
          </label>
          <div id="login-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
          <button type="submit" id="login-submit" class="w-full rounded-lg bg-brand-600 hover:bg-brand-700 active:bg-brand-700 transition px-4 py-2.5 text-sm font-semibold">Đăng nhập</button>
        </form>
        <p class="text-center text-[11px] text-zinc-600 mt-8">${Fmt.escapeHtml(siteName)} · quản lý FRP tập trung</p>
      </div>`;
    if (message) { const b = el.querySelector('#login-error'); b.textContent = message; b.classList.remove('hidden'); }
    // Luôn lấy branding mới nhất (public) để tiêu đề/phụ đề đúng cấu hình hiện tại
    API.health().then((h) => {
      if (h.siteName) { Store.state.settings.siteName = h.siteName; el.querySelector('#login-title').textContent = h.siteName; }
      if (h.loginSubtitle !== undefined) { Store.state.settings.loginSubtitle = h.loginSubtitle; if (h.loginSubtitle) el.querySelector('#login-subtitle').textContent = h.loginSubtitle; }
    }).catch(() => {});
    // Ẩn/hiện mật khẩu
    el.querySelector('#toggle-pass').addEventListener('click', () => {
      const inp = el.querySelector('input[name=password]');
      const icon = el.querySelector('#toggle-pass i');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });
    const form = el.querySelector('#login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const btn = el.querySelector('#login-submit');
      const errBox = el.querySelector('#login-error');
      const twoFaBox = el.querySelector('#login-2fa');
      const need2fa = !twoFaBox.classList.contains('hidden');
      errBox.classList.add('hidden');
      btn.disabled = true; btn.textContent = 'Đang xử lý...';
      try {
        const token = need2fa ? (f.token.value.trim()) : '';
        const me = await API.login(f.username.value.trim(), f.password.value, token, f.remember.checked);
        if (me && me.twoFactorRequired) {
          twoFaBox.classList.remove('hidden');
          f.token.focus();
          btn.disabled = false; btn.textContent = 'Xác nhận';
          return;
        }
        await startApp(me);
      } catch (err) {
        if (err.data && err.data.twoFactorRequired) twoFaBox.classList.remove('hidden');
        errBox.textContent = err.message || 'Đăng nhập thất bại.';
        errBox.classList.remove('hidden');
        btn.disabled = false; btn.textContent = need2fa || (err.data && err.data.twoFactorRequired) ? 'Xác nhận' : 'Đăng nhập';
      }
    });
  }
  function removeLogin() { const el = document.getElementById('login-overlay'); if (el) el.remove(); }

  function onUnauthenticated() {
    if (document.getElementById('login-overlay')) return;
    UI.toast('Phiên đã hết hạn, vui lòng đăng nhập lại.', 'error');
    renderLogin();
  }

  async function logout() {
    try { await API.logout(); } catch { /* ignore */ }
    Store.setAuth({ user: null, role: null, permissions: [], settings: Store.state.settings });
    renderLogin();
  }

  // Banner nhắc bắt buộc bật 2FA (Google Authenticator)
  function update2faBanner() {
    let el = document.getElementById('force-2fa-banner');
    if (Store.state.mustEnable2fa) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'force-2fa-banner';
        el.className = 'shrink-0 bg-amber-900/40 border-b border-amber-700 text-amber-100 text-sm px-6 py-2 flex items-center gap-2';
        el.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Bắt buộc bật 2FA (Google Authenticator) trước khi sử dụng. Vào <b>Profile</b> để thiết lập.';
        const shell = document.getElementById('app-shell');
        shell.insertBefore(el, shell.firstChild);
      }
    } else if (el) { el.remove(); }
  }

  async function startApp(me) {
    Store.setAuth(me);
    removeLogin();
    document.getElementById('app-shell').style.display = '';
    update2faBanner();
    if (Store.state.mustEnable2fa) {
      // Bắt buộc bật 2FA trước — không tải dữ liệu khác (backend cũng chặn).
      if (currentRoute() !== 'profile') location.hash = '#/profile';
      route();
      return;
    }
    try { await Store.loadInstances(); } catch (err) { UI.toast('Không tải được danh sách: ' + err.message, 'error'); }
    if (!openTabs.length) openTabs = ['dashboard'];
    if (!location.hash) location.hash = '#/dashboard';
    route();
  }

  async function init() {
    window.addEventListener('hashchange', route);
    document.getElementById('header-back')?.addEventListener('click', goBack);
    // Đóng menu user khi click ra ngoài
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('user-menu');
      if (!menu || menu.classList.contains('hidden')) return;
      if (e.target.closest('#user-menu-btn') || e.target.closest('#user-menu')) return;
      menu.classList.add('hidden');
    });
    try {
      const h = await API.health();
      Store.state.encryption = h.encryption;
      if (h.siteName) Store.state.settings.siteName = h.siteName;
      if (h.loginSubtitle !== undefined) Store.state.settings.loginSubtitle = h.loginSubtitle;
    } catch { /* ignore */ }
    let me = null;
    try { me = await API.me(); } catch { /* access có thể đã hết hạn */ }
    // Access token hết hạn nhưng còn refresh token (nhất là khi "Ghi nhớ") -> tự đăng nhập lại.
    if (!me) { try { me = await API.refresh(); } catch { /* chưa đăng nhập */ } }
    if (!me) { renderLogin(); return; }
    await startApp(me);
  }

  return { rerender, navigate, setToolbar, currentRoute, route, init, onUnauthenticated, logout };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
