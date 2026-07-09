import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getSettings } from './settings.service.js';

/**
 * Kho refresh token (mỗi bản ghi = 1 phiên đăng nhập/thiết bị, thu hồi được).
 * Lưu ở data/sessions.json. `sid` chính là refresh token (opaque, nằm trong cookie httpOnly).
 * Access token là JWT ngắn hạn, tham chiếu tới sid này.
 */

let sessions = new Map();

function load() {
  try {
    const arr = JSON.parse(fs.readFileSync(config.sessionsFile, 'utf8'));
    sessions = new Map(arr.map((s) => [s.sid, s]));
  } catch { sessions = new Map(); }
}
function persist() {
  // Ghi nguyên tử: tmp -> rename (tránh hỏng file nếu crash giữa chừng).
  try {
    const tmp = `${config.sessionsFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...sessions.values()]), 'utf8');
    fs.renameSync(tmp, config.sessionsFile);
  } catch { /* ignore */ }
}
load();

function ttlMs(remember) {
  const s = getSettings();
  return remember
    ? (s.rememberDays || 30) * 24 * 60 * 60 * 1000
    : (s.sessionTimeoutMinutes || 480) * 60 * 1000;
}

export function createSession(userId, ip, userAgent, remember = false) {
  const sid = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const s = { sid, userId, remember: Boolean(remember), ip: ip || '', userAgent: (userAgent || '').slice(0, 200), createdAt: now, lastSeenAt: now, expiresAt: now + ttlMs(remember) };
  sessions.set(sid, s);
  persist();
  return s;
}

export function getSession(sid) {
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(sid); persist(); return null; }
  return s;
}

export function touchSession(sid) {
  const s = sessions.get(sid);
  if (!s) return;
  s.lastSeenAt = Date.now();
  s.expiresAt = Date.now() + ttlMs(s.remember);
  persist();
}

/** Danh sách phiên còn hiệu lực của 1 user (để hiển thị/đếm). */
export function listUserSessions(userId) {
  const now = Date.now();
  return [...sessions.values()].filter((s) => s.userId === userId && s.expiresAt > now)
    .map(({ sid, ...rest }) => ({ id: sid.slice(0, 8), ...rest }));
}

/** Dọn các phiên đã hết hạn (gọi định kỳ). */
export function sweepExpired() {
  const now = Date.now();
  let changed = false;
  for (const [sid, s] of sessions) if (s.expiresAt <= now) { sessions.delete(sid); changed = true; }
  if (changed) persist();
}

export function destroySession(sid) {
  if (sessions.delete(sid)) persist();
}

/** Xóa toàn bộ session của 1 user (khi đổi mật khẩu / vô hiệu hóa / xóa). */
export function destroyUserSessions(userId) {
  let changed = false;
  for (const [sid, s] of sessions) if (s.userId === userId) { sessions.delete(sid); changed = true; }
  if (changed) persist();
}

/** Xóa session của 1 user trừ 1 sid (giữ phiên hiện tại khi tự đổi mật khẩu). */
export function destroyUserSessionsExcept(userId, keepSid) {
  let changed = false;
  for (const [sid, s] of sessions) if (s.userId === userId && sid !== keepSid) { sessions.delete(sid); changed = true; }
  if (changed) persist();
}

/** Max-Age (giây) cho cookie khi "Ghi nhớ". Không nhớ -> trả null (cookie phiên, mất khi đóng trình duyệt). */
export function cookieMaxAgeSeconds(remember) {
  return remember ? Math.floor(ttlMs(true) / 1000) : null;
}

// Dọn phiên hết hạn định kỳ (mỗi 10 phút) + khi khởi động.
sweepExpired();
setInterval(sweepExpired, 10 * 60 * 1000).unref?.();
