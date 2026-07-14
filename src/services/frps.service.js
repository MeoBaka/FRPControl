import { callFrpApi } from './frpApi.service.js';

/**
 * Service cho FRPS (server) Admin API.
 * Endpoints: /api/serverinfo, /api/proxy/{type}, /api/proxy/{type}/{name}, /api/traffic/{name}
 */

// Các loại proxy mà frps hỗ trợ liệt kê qua /api/proxy/{type}.
// Khớp IsProxyType của fork (client/http/model/proxy_definition.go). tcp+udp/stcp+sudp/xtcp+xudp
// là type thật. Không có "http+https". Type không tồn tại trên frps sẽ trả 404 và bị bỏ qua (allSettled).
export const PROXY_TYPES = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'sudp', 'xtcp', 'xudp', 'tcp+udp', 'stcp+sudp', 'xtcp+xudp', 'mc', 'pe'];

export function getServerInfo(instance) {
  return callFrpApi(instance, '/api/serverinfo');
}

export function getProxiesByType(instance, type) {
  return callFrpApi(instance, `/api/proxy/${encodeURIComponent(type)}`);
}

export function getProxyTraffic(instance, name) {
  return callFrpApi(instance, `/api/traffic/${encodeURIComponent(name)}`);
}

/** Danh sách client (frpc) đang/đã kết nối tới frps. */
export function getClients(instance) {
  return callFrpApi(instance, '/api/clients');
}

/** [fork] Firewall native của frps: đọc snapshot { enabled, default, rules, provider }. */
export function getFirewall(instance) {
  return callFrpApi(instance, '/api/firewall');
}

/** [fork] Ghi cấu hình firewall của frps. */
export function putFirewall(instance, body) {
  return callFrpApi(instance, '/api/firewall', { method: 'PUT', body });
}

/** Chi tiết 1 client theo key/runID. */
export function getClient(instance, key) {
  return callFrpApi(instance, `/api/clients/${encodeURIComponent(key)}`);
}

/** Xóa TẤT CẢ proxy offline khỏi frps (frps chỉ hỗ trợ xóa hàng loạt, cần ?status=offline). */
export function clearOfflineProxies(instance) {
  return callFrpApi(instance, '/api/proxies?status=offline', { method: 'DELETE' });
}

/**
 * Lấy toàn bộ proxy trên frps (gộp tất cả loại) và chuẩn hóa thành 1 mảng phẳng.
 * Kết quả mỗi phần tử: { name, type, status, user, todayTrafficIn, todayTrafficOut, curConns,
 *                        lastStartTime, lastCloseTime, conf }
 */
export async function getAllProxies(instance) {
  const results = await Promise.allSettled(
    PROXY_TYPES.map((type) => getProxiesByType(instance, type))
  );

  const proxies = [];
  results.forEach((r, idx) => {
    const type = PROXY_TYPES[idx];
    if (r.status !== 'fulfilled' || !r.value) return;
    const list = r.value.proxies || [];
    for (const p of list) {
      proxies.push({
        name: p.name,
        type,
        status: p.status,
        user: p.user || '',
        clientId: p.clientID || p.clientId || '',
        todayTrafficIn: p.todayTrafficIn ?? 0,
        todayTrafficOut: p.todayTrafficOut ?? 0,
        curConns: p.curConns ?? 0,
        lastStartTime: p.lastStartTime || '',
        lastCloseTime: p.lastCloseTime || '',
        conf: p.conf || null,
      });
    }
  });

  proxies.sort((a, b) => a.name.localeCompare(b.name));
  return proxies;
}

/**
 * Tổng hợp overview cho một frps: serverinfo + danh sách proxy.
 */
export async function getOverview(instance) {
  const [serverInfo, proxies] = await Promise.all([
    getServerInfo(instance),
    getAllProxies(instance),
  ]);

  const online = proxies.filter((p) => p.status === 'online').length;
  return {
    role: 'frps',
    reachable: true,
    serverInfo,
    proxies,
    summary: {
      version: serverInfo?.version || '',
      totalProxies: proxies.length,
      onlineProxies: online,
      offlineProxies: proxies.length - online,
      curConns: serverInfo?.curConns ?? 0,
      clientCounts: serverInfo?.clientCounts ?? 0,
      totalTrafficIn: serverInfo?.totalTrafficIn ?? 0,
      totalTrafficOut: serverInfo?.totalTrafficOut ?? 0,
    },
  };
}
