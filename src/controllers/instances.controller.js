import * as storage from '../services/storage.service.js';
import * as frps from '../services/frps.service.js';
import * as frpc from '../services/frpc.service.js';
import { canInstanceAction } from '../services/access.service.js';

/** Kiểm tra kết nối tới một instance (dùng cho cả test lúc chưa lưu và đã lưu). */
async function probe(instance) {
  if (instance.role === 'frps') {
    const info = await frps.getServerInfo(instance);
    return { ok: true, role: 'frps', version: info?.version || '', detail: info };
  }
  const status = await frpc.getStatus(instance);
  const count = Object.values(status || {}).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0
  );
  return { ok: true, role: 'frpc', proxyCount: count };
}

export async function list(req, res, next) {
  try {
    // Chỉ trả instance mà user được phép xem (role toàn cục HOẶC được gán - Assign Item).
    const all = await storage.listInstances();
    res.json({ instances: all.filter((inst) => canInstanceAction(req.auth, inst, 'view')) });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const item = await storage.getInstance(req.params.id);
    if (!item) return res.status(404).json({ error: 'Không tìm thấy instance.' });
    res.json({ instance: item });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const item = await storage.createInstance(req.body || {});
    res.status(201).json({ instance: item });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const item = await storage.updateInstance(req.params.id, req.body || {});
    if (!item) return res.status(404).json({ error: 'Không tìm thấy instance.' });
    // Audit rõ hành động bật/tắt (khi payload chỉ đổi enabled).
    if (req.body && req.body.enabled !== undefined) {
      req._auditDetail = req.body.enabled ? 'bật instance' : 'tắt instance';
    }
    res.json({ instance: item });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const ok = await storage.deleteInstance(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy instance.' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

/** Test kết nối cho instance ĐÃ lưu. */
export async function testSaved(req, res, next) {
  try {
    const instance = await storage.getInstanceWithSecret(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Không tìm thấy instance.' });
    const result = await probe(instance);
    res.json(result);
  } catch (err) {
    res.status(err.status && err.status < 500 ? err.status : 200).json({
      ok: false,
      error: err.message,
      upstreamStatus: err.upstreamStatus,
    });
  }
}

/** Test kết nối cho thông tin CHƯA lưu (form nhập). */
export async function testAdhoc(req, res, next) {
  try {
    const { role, baseUrl, user, password, tls } = req.body || {};
    if (!role || !baseUrl) {
      return res.status(400).json({ ok: false, error: 'Cần role và baseUrl.' });
    }
    const normalized = /^https?:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
    const instance = {
      role,
      baseUrl: normalized.replace(/\/+$/, ''),
      user: user || '',
      password: password || '',
      tls: Boolean(tls),
    };
    const result = await probe(instance);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, error: err.message, upstreamStatus: err.upstreamStatus });
  }
}
