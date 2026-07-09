import { config } from '../config.js';
import { serializeCookie, parseCookies } from '../utils/cookies.js';
import { verifyPassword } from '../utils/password.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { generateSecret, verifyToken, otpauthURL } from '../utils/totp.js';
import { signToken } from '../utils/jwt.js';
import * as users from '../services/user.service.js';
import * as roles from '../services/role.service.js';
import * as sessions from '../services/session.service.js';
import * as loginGuard from '../services/loginGuard.js';
import { getSettings } from '../services/settings.service.js';
import { mustEnable2fa } from '../middleware/auth.js';
import * as audit from '../services/audit.service.js';
import { clientIp } from '../utils/clientIp.js';

export async function mePayload(user, role) {
  const s = getSettings();
  return {
    user: {
      id: user.id, username: user.username, displayName: user.displayName,
      roleId: user.roleId, status: user.status, lastLoginAt: user.lastLoginAt,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      assignments: user.assignments || {},
    },
    role: role ? { id: role.id, name: role.name, permissions: role.permissions } : null,
    permissions: role ? role.permissions : [],
    settings: { siteName: s.siteName, loginSubtitle: s.loginSubtitle, strongPassword: Boolean(s.strongPassword) },
    mustEnable2fa: mustEnable2fa({ user, role }),
  };
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    const ip = clientIp(req);
    const ua = (req.headers['user-agent'] || '').slice(0, 200);
    const guardKey = `${ip}|${String(username || '').toLowerCase()}`;
    // Thông báo đồng nhất để không lộ tài khoản tồn tại/bị vô hiệu hóa.
    const GENERIC = 'Sai tài khoản hoặc mật khẩu.';
    const fail = (msg, detail) => {
      loginGuard.recordFail(guardKey);
      audit.record({ userId: null, username: username || '', roleName: null, method: 'POST', path: '/api/auth/login', route: '/api/auth/login', action: 'Đăng nhập thất bại', status: 401, ip, userAgent: ua, detail: detail || msg });
      res.status(401).json({ error: msg });
    };

    // Chống brute-force
    const blockedMin = loginGuard.blockedMinutes(guardKey);
    if (blockedMin) {
      audit.record({ userId: null, username: username || '', roleName: null, method: 'POST', path: '/api/auth/login', route: '/api/auth/login', action: 'Đăng nhập bị chặn (rate-limit)', status: 429, ip, userAgent: ua });
      return res.status(429).json({ error: `Quá nhiều lần thử. Vui lòng thử lại sau ${blockedMin} phút.` });
    }

    if (!username || !password) return fail('Thiếu username hoặc mật khẩu.');
    const user = await users.getByUsername(username);
    if (!user) return fail(GENERIC, 'user không tồn tại');
    if (user.status !== 'active') return fail(GENERIC, 'tài khoản bị vô hiệu hóa');
    if (!verifyPassword(password, user.passwordHash)) return fail(GENERIC, 'sai mật khẩu');

    // Bước 2: xác thực 2 lớp (nếu bật)
    if (user.twoFactorEnabled) {
      const token = (req.body && req.body.token) || '';
      if (!token) return res.json({ twoFactorRequired: true });
      const secret = decryptSecret(user.twoFactorSecret);
      if (!verifyToken(secret, token)) {
        loginGuard.recordFail(guardKey);
        audit.record({ userId: user.id, username: user.username, roleName: null, method: 'POST', path: '/api/auth/login', route: '/api/auth/login', action: 'Đăng nhập thất bại (2FA)', status: 401, ip, userAgent: ua, detail: 'Mã 2FA sai' });
        return res.status(401).json({ error: 'Mã xác thực 2FA không đúng.', twoFactorRequired: true });
      }
    }

    loginGuard.recordSuccess(guardKey);
    const remember = Boolean(req.body && req.body.remember);
    const session = sessions.createSession(user.id, ip, ua, remember);
    await users.markLogin(user.id, ip);
    setAuthCookies(res, signToken({ sub: user.id, sid: session.sid }, config.accessTokenSeconds), session.sid, remember, req);
    audit.record({ userId: user.id, username: user.username, roleName: null, method: 'POST', path: '/api/auth/login', route: '/api/auth/login', action: 'Đăng nhập' + (remember ? ' (ghi nhớ)' : ''), status: 200, ip, userAgent: ua });

    const role = await roles.getRole(user.roleId);
    res.json(await mePayload(user, role));
  } catch (err) { next(err); }
}

/** Đặt cookie access + refresh. Không "ghi nhớ" -> cookie phiên (mất khi đóng trình duyệt). */
function setAuthCookies(res, accessToken, sid, remember, req) {
  const maxAge = sessions.cookieMaxAgeSeconds(remember);
  const base = { httpOnly: true, sameSite: 'Lax', secure: req.secure };
  const opts = maxAge != null ? { ...base, maxAge } : base;
  res.setHeader('Set-Cookie', [
    serializeCookie(config.accessCookie, accessToken, opts),
    serializeCookie(config.refreshCookie, sid, opts),
  ]);
}
function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    serializeCookie(config.accessCookie, '', { httpOnly: true, sameSite: 'Lax', maxAge: 0 }),
    serializeCookie(config.refreshCookie, '', { httpOnly: true, sameSite: 'Lax', maxAge: 0 }),
  ]);
}

/** Cấp access token mới bằng refresh token (cookie). */
export async function refresh(req, res, next) {
  try {
    const rt = parseCookies(req.headers.cookie)[config.refreshCookie];
    const session = sessions.getSession(rt);
    if (!session) { clearAuthCookies(res); return res.status(401).json({ error: 'Phiên đã hết hạn.', code: 'UNAUTHENTICATED' }); }
    const user = await users.getUserRaw(session.userId);
    if (!user || user.status !== 'active') { sessions.destroySession(rt); clearAuthCookies(res); return res.status(401).json({ error: 'Tài khoản không hợp lệ.', code: 'UNAUTHENTICATED' }); }
    sessions.touchSession(rt); // gia hạn trượt
    setAuthCookies(res, signToken({ sub: user.id, sid: rt }, config.accessTokenSeconds), rt, session.remember, req);
    const role = await roles.getRole(user.roleId);
    res.json(await mePayload(user, role));
  } catch (err) { next(err); }
}

export async function logout(req, res) {
  const rt = parseCookies(req.headers.cookie)[config.refreshCookie];
  if (rt) sessions.destroySession(rt);
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function me(req, res) {
  if (!req.auth || !req.auth.user) return res.status(401).json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' });
  res.json(await mePayload(req.auth.user, req.auth.role));
}

// ---------------- Profile của chính user ----------------
export async function updateProfile(req, res, next) {
  try {
    const u = await users.updateProfile(req.auth.user.id, { displayName: req.body && req.body.displayName });
    res.json({ user: u });
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    await users.changeOwnPassword(req.auth.user.id, currentPassword, newPassword);
    // Đổi mật khẩu -> hủy các phiên khác, giữ phiên hiện tại
    sessions.destroyUserSessionsExcept(req.auth.user.id, req.auth.sid);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------------- 2FA (của chính user) ----------------
export async function setup2fa(req, res, next) {
  try {
    const { password } = req.body || {};
    if (!(await users.verifyOwnPassword(req.auth.user.id, password))) return res.status(400).json({ error: 'Mật khẩu không đúng.' });
    if (req.auth.user.twoFactorEnabled) return res.status(400).json({ error: '2FA đã được bật.' });
    const secret = generateSecret();
    await users.setPending2fa(req.auth.user.id, encryptSecret(secret));
    res.json({ secret, otpauthUrl: otpauthURL(secret, req.auth.user.username, getSettings().siteName || 'FRPControl') });
  } catch (err) { next(err); }
}

export async function enable2fa(req, res, next) {
  try {
    const { token } = req.body || {};
    const pendingEnc = await users.getPending2fa(req.auth.user.id);
    if (!pendingEnc) return res.status(400).json({ error: 'Chưa bắt đầu thiết lập 2FA.' });
    if (!verifyToken(decryptSecret(pendingEnc), token)) return res.status(400).json({ error: 'Mã không đúng, vui lòng thử lại.' });
    await users.enable2fa(req.auth.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function disable2fa(req, res, next) {
  try {
    const { password } = req.body || {};
    if (!(await users.verifyOwnPassword(req.auth.user.id, password))) return res.status(400).json({ error: 'Mật khẩu không đúng.' });
    await users.disable2fa(req.auth.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
