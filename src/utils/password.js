import crypto from 'node:crypto';

/**
 * Băm & kiểm tra mật khẩu người dùng bằng scrypt (built-in, không cần thư viện ngoài).
 * Định dạng lưu: "scrypt$<salt_hex>$<hash_hex>"
 */

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
