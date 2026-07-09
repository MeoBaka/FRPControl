import { callFrpApi } from './frpApi.service.js';

/**
 * Service cho FRPC (client) Admin API — đầy đủ endpoint của frp.
 *
 * Cơ bản:
 *   GET  /api/status                 -> trạng thái các proxy (map theo type)
 *   GET  /api/config                 -> nội dung file cấu hình (text)
 *   PUT  /api/config                 -> cập nhật cấu hình
 *   GET  /api/reload                 -> nạp lại cấu hình
 *   POST /api/stop                   -> dừng frpc
 *   GET  /api/proxy/{name}/config    -> ProxyDefinition của 1 proxy
 *   GET  /api/visitor/{name}/config  -> VisitorDefinition của 1 visitor
 *
 * Store (chỉ khả dụng khi frpc bật storeSource — [store] path=... ; nếu tắt sẽ trả 404):
 *   GET/POST            /api/store/proxies
 *   GET/PUT/DELETE      /api/store/proxies/{name}
 *   GET/POST            /api/store/visitors
 *   GET/PUT/DELETE      /api/store/visitors/{name}
 */

// ---------------- Cơ bản ----------------

export function getStatus(instance) {
  return callFrpApi(instance, '/api/status');
}

export function getConfig(instance) {
  return callFrpApi(instance, '/api/config');
}

export function putConfig(instance, content) {
  return callFrpApi(instance, '/api/config', { method: 'PUT', body: content });
}

export function reload(instance) {
  return callFrpApi(instance, '/api/reload');
}

export function stop(instance) {
  return callFrpApi(instance, '/api/stop', { method: 'POST' });
}

export function getProxyConfig(instance, name) {
  return callFrpApi(instance, `/api/proxy/${encodeURIComponent(name)}/config`);
}

export function getVisitorConfig(instance, name) {
  return callFrpApi(instance, `/api/visitor/${encodeURIComponent(name)}/config`);
}

// ---------------- Store: Proxies ----------------

export function listStoreProxies(instance) {
  return callFrpApi(instance, '/api/store/proxies');
}

export function getStoreProxy(instance, name) {
  return callFrpApi(instance, `/api/store/proxies/${encodeURIComponent(name)}`);
}

export function createStoreProxy(instance, definition) {
  return callFrpApi(instance, '/api/store/proxies', { method: 'POST', body: definition });
}

export function updateStoreProxy(instance, name, definition) {
  return callFrpApi(instance, `/api/store/proxies/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: definition,
  });
}

export function deleteStoreProxy(instance, name) {
  return callFrpApi(instance, `/api/store/proxies/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

// ---------------- Store: Visitors ----------------

export function listStoreVisitors(instance) {
  return callFrpApi(instance, '/api/store/visitors');
}

export function getStoreVisitor(instance, name) {
  return callFrpApi(instance, `/api/store/visitors/${encodeURIComponent(name)}`);
}

export function createStoreVisitor(instance, definition) {
  return callFrpApi(instance, '/api/store/visitors', { method: 'POST', body: definition });
}

export function updateStoreVisitor(instance, name, definition) {
  return callFrpApi(instance, `/api/store/visitors/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: definition,
  });
}

export function deleteStoreVisitor(instance, name) {
  return callFrpApi(instance, `/api/store/visitors/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

/**
 * Lấy toàn bộ dữ liệu store (proxies + visitors) và cờ enabled.
 * Nếu frpc không bật store, các route trả 404 -> trả enabled:false thay vì ném lỗi.
 */
/** Địa chỉ FRPS mà frpc kết nối tới (serverAddr) — parse từ config; dùng dựng URL remote đúng IP. */
async function getServerAddr(instance) {
  try {
    const cfg = await getConfig(instance);
    const text = typeof cfg === 'string' ? cfg : String((cfg && cfg.content) ?? cfg ?? '');
    const m = text.match(/(?:^|\n)\s*server[_]?[Aa]ddr\s*=\s*["']?([^"'\s#\n]+)/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

export async function getStore(instance) {
  try {
    const [proxiesResp, visitorsResp, serverAddr] = await Promise.all([
      listStoreProxies(instance),
      listStoreVisitors(instance),
      getServerAddr(instance),
    ]);
    return {
      enabled: true,
      serverAddr,
      proxies: proxiesResp?.proxies || [],
      visitors: visitorsResp?.visitors || [],
    };
  } catch (err) {
    if (err.upstreamStatus === 404) {
      return { enabled: false, serverAddr: '', proxies: [], visitors: [] };
    }
    throw err;
  }
}

// ---------------- Overview ----------------

/**
 * Chuẩn hóa response /api/status (map theo type) thành mảng phẳng.
 * Mỗi phần tử: { name, type, status, err, localAddr, remoteAddr, plugin, source }
 */
function flattenStatus(statusMap) {
  const proxies = [];
  if (!statusMap || typeof statusMap !== 'object') return proxies;
  for (const [type, list] of Object.entries(statusMap)) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      proxies.push({
        name: p.name,
        type: p.type || type,
        status: p.status,
        err: p.err || '',
        localAddr: p.local_addr || '',
        remoteAddr: p.remote_addr || '',
        plugin: p.plugin || '',
        source: p.source || '', // 'store' nếu proxy tới từ store
      });
    }
  }
  proxies.sort((a, b) => a.name.localeCompare(b.name));
  return proxies;
}

/**
 * Tổng hợp overview cho một frpc: trạng thái các proxy.
 */
export async function getOverview(instance) {
  const statusMap = await getStatus(instance);
  const proxies = flattenStatus(statusMap);
  const running = proxies.filter((p) => p.status === 'running').length;

  return {
    role: 'frpc',
    reachable: true,
    proxies,
    summary: {
      totalProxies: proxies.length,
      runningProxies: running,
      problemProxies: proxies.filter((p) => p.status !== 'running').length,
    },
  };
}
