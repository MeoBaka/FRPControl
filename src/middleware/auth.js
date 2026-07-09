import { config } from '../config.js';
import { parseCookies } from '../utils/cookies.js';
import { verifyToken } from '../utils/jwt.js';
import * as sessions from '../services/session.service.js';
import * as users from '../services/user.service.js';
import * as roles from '../services/role.service.js';
import { getSettings } from '../services/settings.service.js';

/**
 * User có BẮT BUỘC phải bật 2FA không?
 * - Bật toàn cục (Google Authenticator), HOẶC
 * - Role có quyền security.req2fa (kiểm tra TƯỜNG MINH — '*' KHÔNG tính, vì đây là cờ chính sách
 *   chứ không phải năng lực; nếu không admin '*' luôn bị ép bật 2FA).
 */
export function mustEnable2fa(auth) {
  if (!auth || !auth.user) return false;
  if (auth.user.twoFactorEnabled) return false;
  if (getSettings().require2fa) return true;
  const perms = (auth.role && auth.role.permissions) || [];
  return perms.includes('security.req2fa');
}

/** Chặn mọi thao tác trừ nhóm /auth (để đi bật 2FA) khi user bắt buộc phải bật 2FA. */
export function force2faGuard(req, res, next) {
  if (!mustEnable2fa(req.auth)) return next();
  if (req.path.startsWith('/auth') || req.path === '/health') return next();
  return res.status(403).json({ error: 'Cần bật 2FA (Google Authenticator) trước khi tiếp tục.', code: 'MUST_ENABLE_2FA' });
}

/**
 * Nạp user hiện tại vào req.auth từ access token (JWT), không chặn.
 * Ngoài kiểm tra chữ ký + hạn của JWT, còn kiểm tra phiên (refresh token) còn tồn tại
 * để hỗ trợ THU HỒI phiên ngay lập tức.
 */
export async function attachUser(req, res, next) {
  try {
    const at = parseCookies(req.headers.cookie)[config.accessCookie];
    const payload = verifyToken(at);
    if (payload && payload.sub && payload.sid) {
      const session = sessions.getSession(payload.sid); // phiên bị thu hồi -> không còn -> hết hiệu lực
      if (session) {
        const user = await users.getUserRaw(payload.sub);
        if (user && user.status === 'active') {
          const role = await roles.getRole(user.roleId);
          req.auth = { sid: payload.sid, user, role };
        } else if (user && user.status !== 'active') {
          sessions.destroySession(payload.sid);
        }
      }
    }
  } catch { /* ignore */ }
  next();
}

/** Bắt buộc đã đăng nhập. */
export function requireAuth(req, res, next) {
  if (!req.auth || !req.auth.user) {
    return res.status(401).json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' });
  }
  next();
}

/** Bắt buộc có quyền `perm` (vd 'providers.create'). */
export function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' });
    }
    if (!roles.hasPermission(req.auth.role, perm)) {
      return res.status(403).json({ error: `Không có quyền: ${perm}`, code: 'FORBIDDEN' });
    }
    next();
  };
}

/** Kiểm tra quyền theo hàm (khi resource động, vd tùy role frps/frpc). */
export function requirePermissionFn(fn) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' });
    }
    const perm = fn(req);
    if (perm && !roles.hasPermission(req.auth.role, perm)) {
      return res.status(403).json({ error: `Không có quyền: ${perm}`, code: 'FORBIDDEN' });
    }
    next();
  };
}
