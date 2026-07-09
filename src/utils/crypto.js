import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Mã hóa / giải mã mật khẩu FRP (và secret 2FA) trước khi lưu xuống file.
 *
 * LUÔN dùng AES-256-GCM. Khóa lấy từ SECRET_KEY, hoặc khóa ngẫu nhiên bền vững ở
 * data/.enc-secret (xem config.encKey). Đã BỎ fallback base64 — không còn ghi "b64:".
 *
 * Định dạng lưu trữ: "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 *   (vẫn ĐỌC được "b64:<base64>" và plaintext cũ để tự nâng cấp lên enc:).
 */

const ALGO = 'aes-256-gcm';

function key() { return config.encKey; }

/** At-rest luôn được mã hóa AES-256-GCM (dùng cho banner/health). */
export function hasStrongKey() { return true; }

/** Chuỗi đã ở dạng AES chưa? (dùng cho migration) */
export function isEncrypted(stored) { return typeof stored === 'string' && stored.startsWith('enc:'); }

export function encryptSecret(plaintext) {
  if (plaintext == null) plaintext = '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored) {
  if (stored == null) return '';
  const value = String(stored);

  if (value.startsWith('enc:')) {
    const [, ivHex, tagHex, dataHex] = value.split(':');
    try {
      const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Không giải mã được dữ liệu — SECRET_KEY (hoặc data/.enc-secret) khác lúc mã hóa.');
    }
  }

  // Legacy — chỉ ĐỌC để nâng cấp lên enc:, không bao giờ ghi lại các dạng này.
  if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
  return value; // plaintext cũ
}
