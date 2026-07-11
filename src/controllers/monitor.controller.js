import * as storage from '../services/storage.service.js';
import * as frps from '../services/frps.service.js';
import * as frpc from '../services/frpc.service.js';
import { canInstanceAction } from '../services/access.service.js';

async function loadInstance(req, res) {
  const instance = await storage.getInstanceWithSecret(req.params.id);
  if (!instance) {
    res.status(404).json({ error: 'Không tìm thấy instance.' });
    return null;
  }
  return instance;
}

/** Overview cho 1 instance (tự động phân nhánh theo role). */
export async function overview(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  // Instance đã tắt: không gọi FRP API, trả trạng thái "disabled".
  if (instance.enabled === false) {
    return res.json({
      instance: { id: instance.id, name: instance.name, role: instance.role, baseUrl: instance.baseUrl },
      role: instance.role, reachable: false, disabled: true, error: 'Instance đã tắt.',
    });
  }
  try {
    const data =
      instance.role === 'frps'
        ? await frps.getOverview(instance)
        : await frpc.getOverview(instance);
    res.json({
      instance: { id: instance.id, name: instance.name, role: instance.role, baseUrl: instance.baseUrl },
      ...data,
    });
  } catch (err) {
    // Không ném lỗi 5xx — trả reachable:false để dashboard vẫn hiển thị được.
    res.json({
      instance: { id: instance.id, name: instance.name, role: instance.role, baseUrl: instance.baseUrl },
      role: instance.role,
      reachable: false,
      error: err.message,
      upstreamStatus: err.upstreamStatus,
    });
  }
}

/** Overview tổng hợp cho TẤT CẢ instance (dùng cho trang dashboard chính). */
export async function overviewAll(req, res, next) {
  try {
    // Chỉ tổng hợp instance mà user được phép giám sát (role toàn cục HOẶC Assign Item).
    const list = (await storage.listInstances()).filter((meta) => canInstanceAction(req.auth, meta, 'monitor'));
    const results = await Promise.all(
      list.map(async (meta) => {
        // Bỏ qua instance đã tắt (không gọi API), đánh dấu disabled cho dashboard.
        if (meta.enabled === false) {
          return { id: meta.id, name: meta.name, role: meta.role, group: meta.group, baseUrl: meta.baseUrl, reachable: false, disabled: true };
        }
        const instance = await storage.getInstanceWithSecret(meta.id);
        try {
          const data =
            instance.role === 'frps'
              ? await frps.getOverview(instance)
              : await frpc.getOverview(instance);
          return { id: meta.id, name: meta.name, role: meta.role, group: meta.group, baseUrl: meta.baseUrl, reachable: true, summary: data.summary };
        } catch (err) {
          return {
            id: meta.id,
            name: meta.name,
            role: meta.role,
            group: meta.group,
            baseUrl: meta.baseUrl,
            reachable: false,
            error: err.message,
            upstreamStatus: err.upstreamStatus,
          };
        }
      })
    );
    res.json({ instances: results });
  } catch (err) {
    next(err);
  }
}

/** [frpc] Lấy nội dung file cấu hình. */
export async function getConfig(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  if (instance.role !== 'frpc') {
    return res.status(400).json({ error: 'Chỉ frpc mới có /api/config.' });
  }
  try {
    const content = await frpc.getConfig(instance);
    res.json({ content: typeof content === 'string' ? content : JSON.stringify(content, null, 2) });
  } catch (err) {
    next(err);
  }
}

/** [frpc] Cập nhật file cấu hình. */
export async function putConfig(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  if (instance.role !== 'frpc') {
    return res.status(400).json({ error: 'Chỉ frpc mới có /api/config.' });
  }
  try {
    const content = (req.body && req.body.content) ?? '';
    await frpc.putConfig(instance, content);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** [frpc] Reload cấu hình. */
export async function reload(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  if (instance.role !== 'frpc') {
    return res.status(400).json({ error: 'Chỉ frpc mới hỗ trợ reload.' });
  }
  try {
    await frpc.reload(instance);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** [frpc] Dừng frpc. */
export async function stop(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  if (instance.role !== 'frpc') {
    return res.status(400).json({ error: 'Chỉ frpc mới hỗ trợ stop.' });
  }
  try {
    await frpc.stop(instance);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** [frps] Lịch sử traffic của một proxy. */
export async function proxyTraffic(req, res, next) {
  const instance = await loadInstance(req, res);
  if (!instance) return;
  if (instance.role !== 'frps') {
    return res.status(400).json({ error: 'Chỉ frps mới có dữ liệu traffic.' });
  }
  try {
    const data = await frps.getProxyTraffic(instance, req.params.name);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ==================== FRPS: Clients ====================

async function loadFrps(req, res) {
  const instance = await loadInstance(req, res);
  if (!instance) return null;
  if (instance.role !== 'frps') {
    res.status(400).json({ error: 'Chức năng này chỉ áp dụng cho frps (provider).' });
    return null;
  }
  return instance;
}

/** [frps] Danh sách client kết nối. */
export async function providerClients(req, res, next) {
  const instance = await loadFrps(req, res);
  if (!instance) return;
  try {
    const clients = await frps.getClients(instance);
    res.json({ clients: Array.isArray(clients) ? clients : [] });
  } catch (err) {
    next(err);
  }
}

/** [frps] Chi tiết 1 client + các proxy của client đó. */
export async function providerClient(req, res, next) {
  const instance = await loadFrps(req, res);
  if (!instance) return;
  const key = req.params.key;
  try {
    const [client, allProxies] = await Promise.all([
      frps.getClient(instance, key),
      frps.getAllProxies(instance),
    ]);
    const proxies = allProxies.filter((p) => p.clientId === key);
    const curConns = proxies.reduce((n, p) => n + (p.curConns || 0), 0);
    res.json({ client, proxies, curConns });
  } catch (err) {
    next(err);
  }
}

/** [frps] Xóa các proxy offline. */
export async function clearOffline(req, res, next) {
  const instance = await loadFrps(req, res);
  if (!instance) return;
  try {
    const result = await frps.clearOfflineProxies(instance);
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
}

// ==================== FRPC: Store & Config ====================

/** Nạp instance và đảm bảo role là frpc. Trả về null nếu không hợp lệ (đã res). */
async function loadFrpc(req, res) {
  const instance = await loadInstance(req, res);
  if (!instance) return null;
  if (instance.role !== 'frpc') {
    res.status(400).json({ error: 'Chức năng này chỉ áp dụng cho frpc.' });
    return null;
  }
  return instance;
}

/** [frpc] Toàn bộ store: { enabled, proxies, visitors }. */
export async function store(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.getStore(instance));
  } catch (err) {
    next(err);
  }
}

/** [frpc] Cấu hình (ProxyDefinition) của 1 proxy đang chạy. */
export async function proxyConfig(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.getProxyConfig(instance, req.params.name));
  } catch (err) {
    next(err);
  }
}

/** [frpc] Cấu hình (VisitorDefinition) của 1 visitor. */
export async function visitorConfig(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.getVisitorConfig(instance, req.params.name));
  } catch (err) {
    next(err);
  }
}

// ---- Store Proxies (CRUD) ----

export async function listStoreProxies(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.listStoreProxies(instance));
  } catch (err) {
    next(err);
  }
}

export async function getStoreProxy(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.getStoreProxy(instance, req.params.name));
  } catch (err) {
    next(err);
  }
}

export async function createStoreProxy(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.status(201).json(await frpc.createStoreProxy(instance, req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function updateStoreProxy(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.updateStoreProxy(instance, req.params.name, req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function deleteStoreProxy(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    await frpc.deleteStoreProxy(instance, req.params.name);
    res.json({ ok: true, deleted: req.params.name });
  } catch (err) {
    next(err);
  }
}

// ---- Store Visitors (CRUD) ----

export async function listStoreVisitors(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.listStoreVisitors(instance));
  } catch (err) {
    next(err);
  }
}

export async function getStoreVisitor(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.getStoreVisitor(instance, req.params.name));
  } catch (err) {
    next(err);
  }
}

export async function createStoreVisitor(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.status(201).json(await frpc.createStoreVisitor(instance, req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function updateStoreVisitor(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    res.json(await frpc.updateStoreVisitor(instance, req.params.name, req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function deleteStoreVisitor(req, res, next) {
  const instance = await loadFrpc(req, res);
  if (!instance) return;
  try {
    await frpc.deleteStoreVisitor(instance, req.params.name);
    res.json({ ok: true, deleted: req.params.name });
  } catch (err) {
    next(err);
  }
}
