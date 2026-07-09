import * as audit from '../services/audit.service.js';
import { getSettings } from '../services/settings.service.js';
import * as users from '../services/user.service.js';
import * as roles from '../services/role.service.js';
import * as storage from '../services/storage.service.js';
import { clientIp } from '../utils/clientIp.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Xác định "đối tượng" của thao tác (để audit biết SỬA AI / XÓA CÁI GÌ):
 *  - store proxy/visitor: tên nằm ngay trên path.
 *  - tạo mới (POST): tên trong body (username/name).
 *  - sửa/xóa theo id (uuid): resolve sang tên user/role/instance (làm TRƯỚC handler để xóa vẫn thấy).
 */
async function resolveTarget(req, pathname) {
  const b = req.body || {};
  const mName = pathname.match(/\/store\/(?:proxies|visitors)\/([^/]+)$/);
  if (mName) { try { return decodeURIComponent(mName[1]); } catch { return mName[1]; } }
  if (req.method === 'POST') return String(b.username || b.name || '').slice(0, 100);
  const uuid = pathname.split('/').find((s) => UUID_RE.test(s));
  if (!uuid) return '';
  try {
    if (pathname.includes('/system/users/')) return (await users.getUser(uuid))?.username || uuid.slice(0, 8);
    if (pathname.includes('/system/roles/')) return (await roles.getRole(uuid))?.name || uuid.slice(0, 8);
    if (pathname.includes('/instances/') || pathname.includes('/monitor/')) return (await storage.getInstance(uuid))?.name || uuid.slice(0, 8);
  } catch { /* ignore */ }
  return uuid.slice(0, 8);
}

/** Chuẩn hóa path: thay uuid -> :id để gộp action. */
function normalize(pathname) {
  return pathname.split('/').map((seg) => (UUID_RE.test(seg) ? ':id' : seg)).join('/');
}

// Nhãn hành động thân thiện theo "METHOD <route chuẩn hóa>"
const LABELS = {
  'POST /api/auth/logout': 'Đăng xuất',
  'PUT /api/auth/profile': 'Đổi hồ sơ',
  'PUT /api/auth/password': 'Đổi mật khẩu',
  'POST /api/auth/2fa/setup': 'Thiết lập 2FA',
  'POST /api/auth/2fa/enable': 'Bật 2FA',
  'POST /api/auth/2fa/disable': 'Tắt 2FA',
  'POST /api/instances': 'Thêm instance',
  'PUT /api/instances/:id': 'Sửa instance',
  'DELETE /api/instances/:id': 'Xóa instance',
  'POST /api/instances/:id/test': 'Test kết nối',
  'POST /api/monitor/:id/reload': 'Reload frpc',
  'POST /api/monitor/:id/stop': 'Stop frpc',
  'PUT /api/monitor/:id/config': 'Ghi cấu hình frpc',
  'POST /api/monitor/:id/store/proxies': 'Thêm store proxy',
  'POST /api/monitor/:id/store/visitors': 'Thêm store visitor',
  'DELETE /api/monitor/:id/proxies/offline': 'Xóa proxy offline',
  'POST /api/system/users': 'Thêm user',
  'POST /api/system/roles': 'Thêm role',
  'PUT /api/system/settings': 'Cập nhật settings',
};
// Các route có tham số tên ở cuối (proxy/visitor name, user id, role id)
function labelDynamic(method, route) {
  if (LABELS[`${method} ${route}`]) return LABELS[`${method} ${route}`];
  const m = `${method} ${route}`;
  if (/^PUT \/api\/monitor\/:id\/store\/proxies\//.test(m)) return 'Sửa store proxy';
  if (/^DELETE \/api\/monitor\/:id\/store\/proxies\//.test(m)) return 'Xóa store proxy';
  if (/^PUT \/api\/monitor\/:id\/store\/visitors\//.test(m)) return 'Sửa store visitor';
  if (/^DELETE \/api\/monitor\/:id\/store\/visitors\//.test(m)) return 'Xóa store visitor';
  if (/^POST \/api\/system\/users\/:id\/disable-2fa/.test(m)) return 'Admin tắt 2FA user';
  if (/^POST \/api\/system\/users\/:id\/revoke-sessions/.test(m)) return 'Thu hồi phiên user';
  if (/^PUT \/api\/system\/users\//.test(m)) return 'Sửa user';
  if (/^DELETE \/api\/system\/users\//.test(m)) return 'Xóa user';
  if (/^PUT \/api\/system\/roles\//.test(m)) return 'Sửa role';
  if (/^DELETE \/api\/system\/roles\//.test(m)) return 'Xóa role';
  return null;
}

// Không ghi audit cho các endpoint gây nhiễu / tự tham chiếu
function skip(method, pathname) {
  if (pathname === '/api/health') return true;
  if (pathname === '/api/auth/me') return true;
  if (pathname === '/api/auth/refresh') return true; // làm mới token, quá nhiều
  if (pathname === '/api/auth/login') return true; // login được audit riêng trong controller
  if (pathname.startsWith('/api/system/audit')) return true;
  return false;
}

export async function auditMiddleware(req, res, next) {
  const start = Date.now();
  // req.path bị cắt mất tiền tố /api khi mount -> dùng originalUrl để có path đầy đủ.
  const pathname = (req.originalUrl || req.url).split('?')[0];
  const method = req.method;

  // Bắt message lỗi từ body để audit biết LÝ DO khi thao tác thất bại (4xx/5xx).
  const origJson = res.json.bind(res);
  res.json = (b) => {
    if (res.statusCode >= 400 && b && typeof b === 'object') res._auditErrMsg = b.error || b.message || '';
    return origJson(b);
  };

  res.on('finish', () => {
    try {
      if (skip(method, pathname)) return;
      const isRead = method === 'GET';
      if (isRead && !getSettings().auditLogReads) return;

      const route = normalize(pathname);
      const action = labelDynamic(method, route) || (isRead ? `Xem ${route}` : `${method} ${route}`);
      const u = req.auth && req.auth.user;
      audit.record({
        userId: u ? u.id : null,
        username: u ? u.username : (req._loginUsername || 'anonymous'),
        roleName: (req.auth && req.auth.role && req.auth.role.name) || null,
        method, path: pathname, route, action,
        target: req._auditTarget || '',
        detail: req._auditDetail || (res.statusCode >= 400 ? (res._auditErrMsg ? `lỗi: ${res._auditErrMsg}` : '') : ''),
        status: res.statusCode,
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
        durationMs: Date.now() - start,
      });
    } catch { /* ignore */ }
  });

  // Resolve đối tượng TRƯỚC handler (để DELETE vẫn thấy tên trước khi bị xóa).
  if (method !== 'GET' && !skip(method, pathname)) {
    try { req._auditTarget = await resolveTarget(req, pathname); } catch { /* ignore */ }
  }
  next();
}
