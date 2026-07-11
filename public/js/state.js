/* State toàn cục + tải danh sách instance + ghi nhớ lựa chọn. Gắn vào window.Store. */
window.Store = (() => {
  const state = {
    instances: [],
    selectedProviderId: localStorage.getItem('frpc.provider') || null,
    selectedNodeId: localStorage.getItem('frpc.node') || null,
    encryption: null,
    user: null,          // { id, username, displayName, roleId, ... }
    role: null,          // { id, name, permissions }
    permissions: [],     // mảng quyền, có thể là ['*']
    settings: {},        // { siteName }
  };

  function setAuth(me) {
    state.user = me.user;
    state.role = me.role;
    state.permissions = me.permissions || [];
    state.settings = me.settings || {};
    state.mustEnable2fa = Boolean(me.mustEnable2fa);
  }

  // Kiểm tra quyền (hỗ trợ '*' = toàn quyền)
  function can(perm) {
    if (state.permissions.includes('*')) return true;
    return state.permissions.includes(perm);
  }
  // Có bất kỳ quyền nào trong danh sách
  function canAny(perms) { return perms.some((p) => can(p)); }

  // Phân quyền theo từng instance (Assign Item)
  function assignments() { return (state.user && state.user.assignments) || {}; }
  function hasAssignments() { return Object.keys(assignments()).length > 0; }
  // Có quyền `action` trên 1 instance cụ thể (role toàn cục HOẶC được gán)
  function canOnInstance(instanceId, action, rolePerms) {
    if (canAny(Array.isArray(rolePerms) ? rolePerms : [rolePerms])) return true;
    const a = assignments()[instanceId] || [];
    if (!a.length) return false;
    if (a.includes(action)) return true;
    if (action === 'view') return true;
    if (action === 'monitor') return a.includes('update');
    return false;
  }

  async function loadInstances() {
    const { instances } = await API.listInstances();
    state.instances = instances;
    // Đảm bảo lựa chọn còn hợp lệ (và đang BẬT), nếu không thì chọn cái đầu tiên đang bật.
    if (!activeProviders().some((p) => p.id === state.selectedProviderId)) {
      setProvider(activeProviders()[0]?.id || null);
    }
    if (!activeNodes().some((n) => n.id === state.selectedNodeId)) {
      setNode(activeNodes()[0]?.id || null);
    }
    return state.instances;
  }

  const providers = () => state.instances.filter((i) => i.role === 'frps');
  const nodes = () => state.instances.filter((i) => i.role === 'frpc');
  // Chỉ instance đang bật — dùng cho selector/dropdown ở các trang vận hành.
  const activeProviders = () => providers().filter((p) => p.enabled !== false);
  const activeNodes = () => nodes().filter((n) => n.enabled !== false);

  const getInstance = (id) => state.instances.find((i) => i.id === id) || null;
  const selectedProvider = () => getInstance(state.selectedProviderId);
  const selectedNode = () => getInstance(state.selectedNodeId);

  function setProvider(id) {
    state.selectedProviderId = id;
    if (id) localStorage.setItem('frpc.provider', id);
    else localStorage.removeItem('frpc.provider');
  }
  function setNode(id) {
    state.selectedNodeId = id;
    if (id) localStorage.setItem('frpc.node', id);
    else localStorage.removeItem('frpc.node');
  }

  // Gọi fn(instance) song song trên nhiều instance, gom kết quả (không ném lỗi cả cụm).
  // Trả về [{ instance, ok, value } | { instance, ok:false, error }]
  async function gather(instances, fn) {
    const settled = await Promise.allSettled(instances.map((i) => fn(i)));
    return settled.map((r, idx) =>
      r.status === 'fulfilled'
        ? { instance: instances[idx], ok: true, value: r.value }
        : { instance: instances[idx], ok: false, error: r.reason?.message || 'Không kết nối được' }
    );
  }

  return {
    state,
    loadInstances,
    providers,
    nodes,
    activeProviders,
    activeNodes,
    getInstance,
    selectedProvider,
    selectedNode,
    setProvider,
    setNode,
    gather,
    setAuth,
    can,
    canAny,
    assignments,
    hasAssignments,
    canOnInstance,
  };
})();
