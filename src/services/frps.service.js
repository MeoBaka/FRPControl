import { callFrpApi } from './frpApi.service.js';

/**
 * Service cho FRPS (server) Admin API.
 *
 * Chiến lược v2-first (fork/frp>=0.70.0) + fallback v1:
 *   - Thử endpoint v2; nếu frps KHÔNG có v2 (route 404) thì tự dùng v1.
 *   - Chuẩn hóa response v2 về ĐÚNG shape v1 mà controller/frontend đang dùng.
 *   - Áp dụng cho: serverInfo, proxies (1 request thay vì burst 14 loại), clients, traffic, prune.
 *   - v2 proxy spec thiếu block mc/pe/xudp/combo -> conf (remotePort) rỗng cho các type đó,
 *     nhưng proxy vẫn liệt kê đủ. Khi frps không có v2, fallback v1 (đủ cả conf).
 */

// Các loại proxy mà frps hỗ trợ liệt kê qua /api/proxy/{type}.
export const PROXY_TYPES = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'sudp', 'xtcp', 'xudp', 'tcp+udp', 'stcp+sudp', 'xtcp+xudp', 'mc', 'pe'];

/** Thử fn2 (v2); nếu route v2 không tồn tại (404) -> fallback fn1 (v1). Lỗi khác -> ném tiếp. */
async function v2OrV1(fn2, fn1) {
  try { return await fn2(); }
  catch (err) { if (err && err.upstreamStatus === 404) return fn1(); throw err; }
}

// v2 bọc payload trong envelope { code, msg, data }; v1 trả thẳng. Luôn lấy .data cho v2.
async function callV2(instance, path, opts) {
  const r = await callFrpApi(instance, path, opts);
  return r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r;
}

/** Gộp tất cả trang của endpoint v2 (paginated {total,page,pageSize,items}). pageSize tối đa 200. */
async function fetchAllV2(instance, basePath, pageSize = 200) {
  const out = [];
  const sep = basePath.includes('?') ? '&' : '?';
  for (let page = 1; page <= 1000; page++) {
    const d = await callV2(instance, `${basePath}${sep}page=${page}&pageSize=${pageSize}`);
    const items = (d && d.items) || [];
    out.push(...items);
    if (items.length < pageSize || out.length >= ((d && d.total) || 0)) break;
  }
  return out;
}

/** serverinfo: v2 /api/v2/system/info (làm phẳng version+status+config) hoặc v1 /api/serverinfo. */
export function getServerInfo(instance) {
  return v2OrV1(
    async () => {
      const v = await callV2(instance, '/api/v2/system/info');
      return { version: v.version, ...(v.status || {}), ...(v.config || {}) };
    },
    () => callFrpApi(instance, '/api/serverinfo'),
  );
}

export function getProxiesByType(instance, type) {
  return callFrpApi(instance, `/api/proxy/${encodeURIComponent(type)}`);
}

/** traffic 7 ngày: v2 history[] -> {trafficIn:[], trafficOut:[]} hoặc v1 /api/traffic/{name}. */
export function getProxyTraffic(instance, name) {
  return v2OrV1(
    async () => {
      const v = await callV2(instance, `/api/v2/proxies/${encodeURIComponent(name)}/traffic`);
      const hist = (v && v.history) || [];
      return { name, trafficIn: hist.map((h) => h.trafficIn ?? 0), trafficOut: hist.map((h) => h.trafficOut ?? 0) };
    },
    () => callFrpApi(instance, `/api/traffic/${encodeURIComponent(name)}`),
  );
}

/** Danh sách client (MẢNG trần — controller tự bọc {clients}). v2 items = ClientInfoResp giống v1. */
export function getClients(instance) {
  return v2OrV1(
    () => fetchAllV2(instance, '/api/v2/clients'),
    () => callFrpApi(instance, '/api/clients'),
  );
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

/** Xóa proxy offline: v2 POST /api/v2/system/prune (trả {cleared,total}) hoặc v1 DELETE /api/proxies?status=offline. */
export function clearOfflineProxies(instance) {
  return v2OrV1(
    () => callFrpApi(instance, '/api/v2/system/prune?type=offline_proxies', { method: 'POST' }),
    () => callFrpApi(instance, '/api/proxies?status=offline', { method: 'DELETE' }),
  );
}

/**
 * Lấy toàn bộ proxy trên frps -> mảng phẳng:
 *   { name, type, status, user, clientId, todayTrafficIn, todayTrafficOut, curConns,
 *     lastStartTime, lastCloseTime, conf }
 *
 * ⚠ v2 /api/v2/proxies BỎ QUA các type mới (tcp+udp/stcp+sudp/xtcp+xudp/xudp/mc/pe) — chỉ
 * liệt kê 8 type gốc. Nên KHÔNG dùng nó để list.
 * Thay vào đó: đọc proxyTypeCount từ /api/v2/system/info -> biết CHÍNH XÁC type nào ĐANG có
 * proxy -> query v1 /api/proxy/{type} CHỈ những type đó (đúng đủ mọi type + ít request, không
 * burst 14). frps cũ (system/info 404) -> fallback query toàn bộ PROXY_TYPES qua v1.
 */
export function getAllProxies(instance) {
  return v2OrV1(() => getAllProxiesSmart(instance), () => collectProxiesByTypes(instance, PROXY_TYPES));
}

async function getAllProxiesSmart(instance) {
  const info = await callV2(instance, '/api/v2/system/info'); // 404 -> v2OrV1 fallback query toàn bộ v1
  const counts = (info && info.status && info.status.proxyTypeCount) || {};
  const types = Object.keys(counts).filter((t) => counts[t] > 0);
  if (!types.length) return [];
  return collectProxiesByTypes(instance, types);
}

/** Query v1 /api/proxy/{type} cho danh sách type, gộp + chuẩn hóa thành mảng phẳng. */
async function collectProxiesByTypes(instance, types) {
  const results = await Promise.allSettled(types.map((t) => getProxiesByType(instance, t)));
  const proxies = [];
  results.forEach((r, idx) => {
    const type = types[idx];
    if (r.status !== 'fulfilled' || !r.value) return;
    for (const p of (r.value.proxies || [])) {
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
