import crypto from 'node:crypto';

/**
 * TOTP (RFC 6238) — xác thực 2 lớp tương thích Google Authenticator / Authy.
 * Tự cài bằng crypto built-in, không cần thư viện ngoài.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32decode(str) {
  const s = String(str).replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0; const out = [];
  for (const c of s) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { buf[i] = c % 256; c = Math.floor(c / 256); }
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

/** Sinh secret base32 (mặc định 20 byte = 160 bit). */
export function generateSecret(bytes = 20) {
  return base32encode(crypto.randomBytes(bytes));
}

/** Kiểm tra mã token (6 số) với cửa sổ ±window bước 30 giây. */
export function verifyToken(secretB32, token, window = 1) {
  const t = String(token || '').trim();
  if (!/^\d{6}$/.test(t)) return false;
  const secretBuf = base32decode(secretB32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBuf, counter + w) === t) return true;
  }
  return false;
}

/** URI otpauth:// để tạo QR code. */
export function otpauthURL(secretB32, label, issuer = 'FRPControl') {
  const l = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${l}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
