/* Lớp giao tiếp với backend FRPControl. Gắn vào window.API. */
window.API = (() => {
  // Làm mới access token bằng refresh token (gộp các lần gọi đồng thời).
  let refreshing = null;
  function silentRefresh() {
    if (!refreshing) {
      refreshing = fetch('/api/auth/refresh', { method: 'POST' })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/me'];

  async function request(method, path, body, _retried) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`/api${path}`, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      // Access token hết hạn trên endpoint bảo vệ -> thử refresh 1 lần rồi gọi lại.
      if (res.status === 401 && !_retried && !AUTH_ENDPOINTS.includes(path)) {
        if (await silentRefresh()) return request(method, path, body, true);
        if (window.App && App.onUnauthenticated) App.onUnauthenticated();
      }
      const message = (data && data.error) || `Lỗi ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    health: () => request('GET', '/health'),

    // Auth
    login: (username, password, token, remember) => request('POST', '/auth/login', { username, password, ...(token ? { token } : {}), ...(remember ? { remember: true } : {}) }),
    refresh: () => request('POST', '/auth/refresh'),
    logout: () => request('POST', '/auth/logout'),
    me: () => request('GET', '/auth/me'),
    // Profile của chính mình
    updateProfile: (displayName) => request('PUT', '/auth/profile', { displayName }),
    changePassword: (currentPassword, newPassword) => request('PUT', '/auth/password', { currentPassword, newPassword }),
    setup2fa: (password) => request('POST', '/auth/2fa/setup', { password }),
    enable2fa: (token) => request('POST', '/auth/2fa/enable', { token }),
    disable2fa: (password) => request('POST', '/auth/2fa/disable', { password }),

    // System — users
    listUsers: () => request('GET', '/system/users'),
    createUser: (p) => request('POST', '/system/users', p),
    updateUser: (id, p) => request('PUT', `/system/users/${id}`, p),
    disableUser2fa: (id) => request('POST', `/system/users/${id}/disable-2fa`),
    revokeUserSessions: (id) => request('POST', `/system/users/${id}/revoke-sessions`),
    deleteUser: (id) => request('DELETE', `/system/users/${id}`),
    // System — Assign Item (phân quyền theo instance)
    assignInstances: () => request('GET', '/system/assign/instances'),
    updateUserAssignments: (id, assignments) => request('PUT', `/system/users/${id}/assignments`, { assignments }),
    // System — Cert Manager
    listCerts: () => request('GET', '/system/certs'),
    createCert: (p) => request('POST', '/system/certs', p),
    deleteCert: (id) => request('DELETE', `/system/certs/${id}`),
    certDownloadUrl: (id, kind) => `/api/system/certs/${id}/download?kind=${kind}`,
    // System — roles
    permissionCatalog: () => request('GET', '/system/permissions'),
    listRoles: () => request('GET', '/system/roles'),
    createRole: (p) => request('POST', '/system/roles', p),
    updateRole: (id, p) => request('PUT', `/system/roles/${id}`, p),
    deleteRole: (id) => request('DELETE', `/system/roles/${id}`),
    // System — audit
    listAudit: (qs = '') => request('GET', `/system/audit${qs}`),
    auditActions: () => request('GET', '/system/audit/actions'),
    // System — API Error Logs
    listApiErrors: (qs = '') => request('GET', `/system/ael${qs}`),
    // System — settings
    getSettings: () => request('GET', '/system/settings'),
    updateSettings: (p) => request('PUT', '/system/settings', p),

    // System — Firewall
    firewallStats: () => request('GET', '/system/firewall/stats'),
    firewallCheck: (ips) => request('POST', '/system/firewall/check', { ips }),
    firewallRefresh: () => request('POST', '/system/firewall/refresh'),
    firewallKeys: () => request('GET', '/system/firewall/keys'),
    firewallCreateKey: (name, canAdd) => request('POST', '/system/firewall/keys', { name, canAdd }),
    firewallDeleteKey: (id) => request('DELETE', `/system/firewall/keys/${id}`),
    firewallListCustom: () => request('GET', '/system/firewall/custom'),
    firewallAddBlock: (p) => request('POST', '/system/firewall/custom', p),
    firewallRemoveBlock: (ip) => request('DELETE', `/system/firewall/custom?ip=${encodeURIComponent(ip)}`),

    // Instances (provider = frps, node = frpc)
    listInstances: () => request('GET', '/instances'),
    getInstance: (id) => request('GET', `/instances/${id}`),
    createInstance: (p) => request('POST', '/instances', p),
    updateInstance: (id, p) => request('PUT', `/instances/${id}`, p),
    deleteInstance: (id) => request('DELETE', `/instances/${id}`),
    testAdhoc: (p) => request('POST', '/instances/test', p),
    testSaved: (id) => request('POST', `/instances/${id}/test`),

    // Monitor chung
    overviewAll: () => request('GET', '/monitor/overview'),
    overview: (id) => request('GET', `/monitor/${id}/overview`),

    // Provider (frps)
    clients: (id) => request('GET', `/monitor/${id}/clients`),
    client: (id, key) => request('GET', `/monitor/${id}/clients/${encodeURIComponent(key)}`),
    clearOffline: (id) => request('DELETE', `/monitor/${id}/proxies/offline`),
    traffic: (id, name) => request('GET', `/monitor/${id}/traffic/${encodeURIComponent(name)}`),

    // Node (frpc) — config file tổng
    getConfig: (id) => request('GET', `/monitor/${id}/config`),
    putConfig: (id, content) => request('PUT', `/monitor/${id}/config`, { content }),
    reload: (id) => request('POST', `/monitor/${id}/reload`),
    stop: (id) => request('POST', `/monitor/${id}/stop`),

    // Node — config chi tiết
    proxyConfig: (id, name) => request('GET', `/monitor/${id}/proxy/${encodeURIComponent(name)}/config`),
    visitorConfig: (id, name) => request('GET', `/monitor/${id}/visitor/${encodeURIComponent(name)}/config`),

    // Node — Store
    getStore: (id) => request('GET', `/monitor/${id}/store`),
    listStoreProxies: (id) => request('GET', `/monitor/${id}/store/proxies`),
    getStoreProxy: (id, name) => request('GET', `/monitor/${id}/store/proxies/${encodeURIComponent(name)}`),
    createStoreProxy: (id, def) => request('POST', `/monitor/${id}/store/proxies`, def),
    updateStoreProxy: (id, name, def) => request('PUT', `/monitor/${id}/store/proxies/${encodeURIComponent(name)}`, def),
    deleteStoreProxy: (id, name) => request('DELETE', `/monitor/${id}/store/proxies/${encodeURIComponent(name)}`),
    listStoreVisitors: (id) => request('GET', `/monitor/${id}/store/visitors`),
    getStoreVisitor: (id, name) => request('GET', `/monitor/${id}/store/visitors/${encodeURIComponent(name)}`),
    createStoreVisitor: (id, def) => request('POST', `/monitor/${id}/store/visitors`, def),
    updateStoreVisitor: (id, name, def) => request('PUT', `/monitor/${id}/store/visitors/${encodeURIComponent(name)}`, def),
    deleteStoreVisitor: (id, name) => request('DELETE', `/monitor/${id}/store/visitors/${encodeURIComponent(name)}`),
  };
})();
