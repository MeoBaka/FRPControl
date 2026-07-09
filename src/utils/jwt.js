import crypto from 'node:crypto';
import { config } from '../config.js';

/** JWT HS256 tối giản (không cần thư viện ngoài). */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) { return b64url(Buffer.from(JSON.stringify(obj), 'utf8')); }
function fromB64url(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Buffer.from(t, 'base64');
}

/** Ký JWT: payload + iat/exp, TTL tính bằng giây. */
export function signToken(payload, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/** Xác minh JWT (chữ ký + hạn). Trả payload nếu hợp lệ, ngược lại null. */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(data).digest();
  const got = fromB64url(parts[2]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let body;
  try { body = JSON.parse(fromB64url(parts[1]).toString('utf8')); } catch { return null; }
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
  return body;
}
