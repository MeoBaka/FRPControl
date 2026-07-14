import * as users from '../services/user.service.js';
import * as roles from '../services/role.service.js';
import * as audit from '../services/audit.service.js';
import * as apiErrors from '../services/apiError.service.js';
import * as settings from '../services/settings.service.js';
import * as sessions from '../services/session.service.js';
import * as storage from '../services/storage.service.js';
import { ASSIGN_ACTIONS, ASSIGN_LABELS } from '../services/access.service.js';
import * as runtime from '../runtime.js';
import * as ssl from '../services/ssl.service.js';
import * as certs from '../services/cert.service.js';
import * as blacklist from '../services/blacklist.service.js';

// ---------------- Users ----------------
export async function listUsers(req, res, next) {
  try {
    const [list, roleList] = await Promise.all([users.listUsers(), roles.listRoles()]);
    const roleMap = Object.fromEntries(roleList.map((r) => [r.id, r.name]));
    res.json({ users: list.map((u) => ({ ...u, roleName: roleMap[u.roleId] || '—', activeSessions: sessions.listUserSessions(u.id).length })) });
  } catch (err) { next(err); }
}

export async function revokeUserSessions(req, res, next) {
  try {
    const target = await users.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy user.' });
    sessions.destroyUserSessions(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
export async function createUser(req, res, next) {
  try {
    const user = await users.createUser(req.body || {});
    const role = await roles.getRole(user.roleId);
    req._auditDetail = `role: ${role?.name || user.roleId}`;
    res.status(201).json({ user });
  } catch (err) { next(err); }
}
export async function updateUser(req, res, next) {
  try {
    // Không cho tự vô hiệu hóa / đổi role chính mình (tránh tự khóa & tự nâng quyền).
    if (req.params.id === req.auth.user.id && req.body) {
      if (req.body.status === 'disabled') {
        return res.status(400).json({ error: 'Không thể tự vô hiệu hóa tài khoản của chính mình.' });
      }
      if (req.body.roleId && req.body.roleId !== req.auth.user.roleId) {
        return res.status(400).json({ error: 'Không thể tự đổi role của chính mình.' });
      }
    }
    const before = await users.getUser(req.params.id); // trạng thái cũ để ghi chi tiết thay đổi
    const b = req.body || {};
    const user = await users.updateUser(req.params.id, b);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy user.' });
    // Chi tiết thay đổi cho audit
    const parts = [];
    if (before && b.roleId && b.roleId !== before.roleId) {
      const [oldR, newR] = await Promise.all([roles.getRole(before.roleId), roles.getRole(b.roleId)]);
      parts.push(`role: ${oldR?.name || before.roleId} → ${newR?.name || b.roleId}`);
    }
    if (before && b.status && b.status !== before.status) parts.push(`trạng thái: ${before.status} → ${b.status}`);
    if (before && b.displayName !== undefined && b.displayName !== before.displayName) parts.push(`tên hiển thị: "${before.displayName || ''}" → "${b.displayName || ''}"`);
    if (b.password) parts.push('đổi mật khẩu');
    if (parts.length) req._auditDetail = parts.join(' · ');
    // Đổi mật khẩu / vô hiệu hóa / đổi role -> hủy các phiên cũ của user đó
    if (b.password || b.status === 'disabled' || b.roleId) {
      if (req.params.id !== req.auth.user.id) sessions.destroyUserSessions(req.params.id);
    }
    res.json({ user });
  } catch (err) { next(err); }
}
export async function disableUser2fa(req, res, next) {
  try {
    const target = await users.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy user.' });
    await users.disable2fa(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.auth.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình.' });
    const all = await users.listUsers();
    if (all.length <= 1) return res.status(400).json({ error: 'Phải còn ít nhất 1 user.' });
    const ok = await users.deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy user.' });
    sessions.destroyUserSessions(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

// ---------------- Assign Item (phân quyền theo instance) ----------------
/** Danh sách instance để chọn khi phân quyền + bảng action. */
export async function assignInstances(req, res, next) {
  try {
    const all = await storage.listInstances();
    res.json({
      instances: all.map((i) => ({ id: i.id, name: i.name, role: i.role, group: i.group || '', baseUrl: i.baseUrl })),
      actions: ASSIGN_ACTIONS,
      actionLabels: ASSIGN_LABELS,
    });
  } catch (err) { next(err); }
}

/** Ghi phân quyền theo instance cho 1 user. */
export async function updateUserAssignments(req, res, next) {
  try {
    const target = await users.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy user.' });
    const user = await users.updateAssignments(req.params.id, (req.body && req.body.assignments) || {});
    res.json({ user });
  } catch (err) { next(err); }
}

// ---------------- Cert Manager ----------------
export async function listCerts(req, res, next) {
  try { res.json({ certs: await certs.listCerts() }); } catch (err) { next(err); }
}
export async function createCert(req, res, next) {
  try { res.status(201).json({ cert: await certs.generateCert(req.body || {}) }); } catch (err) { next(err); }
}
export async function downloadCert(req, res, next) {
  try {
    const kind = req.query.kind === 'key' ? 'key' : 'crt';
    const content = await certs.getCertFile(req.params.id, kind);
    if (content == null) return res.status(404).json({ error: 'Không tìm thấy chứng chỉ.' });
    const fname = `${req.params.id.slice(0, 8)}.${kind === 'key' ? 'key' : 'crt'}`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.type('application/x-pem-file').send(content);
  } catch (err) { next(err); }
}
export async function deleteCert(req, res, next) {
  try {
    const ok = await certs.deleteCert(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy chứng chỉ.' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

// ---------------- Roles ----------------
export async function permissionCatalog(req, res) {
  res.json({ catalog: roles.PERMISSION_CATALOG, actionLabels: { view: 'Xem', create: 'Thêm', update: 'Sửa', delete: 'Xóa', control: 'Điều khiển', disable2fa: 'Tắt 2FA', revoke: 'Thu hồi phiên', assign: 'Phân quyền item', req2fa: 'Bắt buộc 2FA', download: 'Tải về' } });
}
export async function listRoles(req, res, next) {
  try {
    const [roleList, userList] = await Promise.all([roles.listRoles(), users.listUsers()]);
    const counts = {};
    userList.forEach((u) => { counts[u.roleId] = (counts[u.roleId] || 0) + 1; });
    res.json({ roles: roleList.map((r) => ({ ...r, userCount: counts[r.id] || 0 })) });
  } catch (err) { next(err); }
}
export async function createRole(req, res, next) {
  try { res.status(201).json({ role: await roles.createRole(req.body || {}) }); }
  catch (err) { next(err); }
}
export async function updateRole(req, res, next) {
  try {
    const before = await roles.getRole(req.params.id); // để diff quyền
    const b = req.body || {};
    const role = await roles.updateRole(req.params.id, b);
    if (!role) return res.status(404).json({ error: 'Không tìm thấy role.' });
    const parts = [];
    if (before && b.name && b.name !== before.name) parts.push(`tên role: "${before.name}" → "${b.name}"`);
    if (before && Array.isArray(b.permissions)) {
      const oldP = new Set(before.permissions || []);
      const newP = new Set(role.permissions || []);
      const added = [...newP].filter((p) => !oldP.has(p));
      const removed = [...oldP].filter((p) => !newP.has(p));
      if (added.length) parts.push(`thêm quyền: ${added.join(', ')}`);
      if (removed.length) parts.push(`bỏ quyền: ${removed.join(', ')}`);
    }
    if (parts.length) req._auditDetail = parts.join(' · ');
    res.json({ role });
  } catch (err) { next(err); }
}
export async function deleteRole(req, res, next) {
  try {
    const userList = await users.listUsers();
    if (userList.some((u) => u.roleId === req.params.id)) {
      return res.status(400).json({ error: 'Còn user đang dùng role này, không thể xóa.' });
    }
    const ok = await roles.deleteRole(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy role.' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

// ---------------- Audit ----------------
export async function listAudit(req, res, next) {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const filters = {
      username: req.query.username || '', action: req.query.action || '',
      method: req.query.method || '', status: req.query.status || '', q: req.query.q || '',
      from: req.query.from || '', to: req.query.to || '',
    };
    const { total, items } = await audit.query({ limit, offset, filters });
    res.json({ total, items, limit, offset });
  } catch (err) { next(err); }
}
export async function auditActions(req, res, next) {
  try { res.json({ actions: await audit.distinctActions() }); }
  catch (err) { next(err); }
}

// ---------------- API Error Logs (AEL) ----------------
export async function listApiErrors(req, res, next) {
  try {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const filters = {
      method: req.query.method || '', status: req.query.status || '',
      username: req.query.username || '', q: req.query.q || '',
    };
    const { total, items } = await apiErrors.query({ limit, offset, filters });
    res.json({ total, items, limit, offset });
  } catch (err) { next(err); }
}

// ---------------- Settings ----------------
export async function getSettings(req, res) {
  const s = settings.getSettings();
  res.json({ settings: s, listen: runtime.getListenInfo(), sslStatus: ssl.sslStatus(s) });
}
export async function updateSettings(req, res, next) {
  try {
    const prev = settings.getSettings();
    const nextS = settings.previewSettings(req.body || {});   // validate (ném 400 nếu sai)
    await ssl.ensureCertReady(nextS);                          // tạo self-signed nếu cần (async) TRƯỚC khi kiểm tra
    const desired = settings.getListenConfig(nextS);
    const cur = runtime.getListenInfo();
    const portChanged = !cur || desired.port !== cur.port;
    const sslToggled = Boolean(desired.ssl) !== Boolean(cur && cur.ssl);
    const sslFieldsChanged = desired.ssl && (
      nextS.sslMode !== prev.sslMode || nextS.panelDomain !== prev.panelDomain || nextS.serverIP !== prev.serverIP ||
      nextS.sslCertFile !== prev.sslCertFile || nextS.sslKeyFile !== prev.sslKeyFile ||
      nextS.acmeStaging !== prev.acmeStaging || nextS.acmeEmail !== prev.acmeEmail
    );
    const listenerChanged = portChanged || sslToggled || sslFieldsChanged;
    const urlChanged = portChanged || sslToggled;

    if (listenerChanged) await runtime.checkListen(desired); // KIỂM TRA port/cert TRƯỚC — lỗi thì không lưu
    settings.commitSettings(nextS);
    blacklist.ensureData(); // vừa bật firewall/API mà chưa có blacklist -> tải nền ngay

    if (listenerChanged) {
      // Chuyển listener SAU khi đã trả response (đã checkListen nên gần như chắc chắn thành công).
      setTimeout(() => { runtime.applyServer(settings.getListenConfig()).catch((e) => console.error('[FRPControl] applyServer lỗi:', e.message)); }, 800);
    }
    let panel = { changed: false };
    if (urlChanged) {
      // Ưu tiên serverIP; nếu lấy host từ header thì chỉ chấp nhận hostname/IP hợp lệ.
      const rawHost = String(req.headers.host || '').split(':')[0];
      const safeHost = /^[a-zA-Z0-9.-]+$/.test(rawHost) ? rawHost : 'localhost';
      const host = nextS.serverIP || safeHost;
      panel = { changed: true, url: `${desired.ssl ? 'https' : 'http'}://${host}:${desired.port}` };
    }
    res.json({ settings: nextS, listen: runtime.getListenInfo(), sslStatus: ssl.sslStatus(nextS), panel });
  } catch (err) { next(err); }
}
