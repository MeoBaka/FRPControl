/**
 * API key cho Firewall API công khai (chia sẻ dịch vụ check IP).
 *
 * - Xác thực bằng SHA-256 (so khớp nhanh).
 * - Raw key lưu thêm dạng AES-256-GCM (encryptSecret) để có thể COPY lại sau
 *   (giống cách lưu mật khẩu FRP). File data/firewall-keys.json (đã .gitignore).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const FILE = `${config.dataDir}/firewall-keys.json`;
let cache = null;

function loadAll() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { cache = []; }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}
function persist() {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

/** Bỏ hash + secret khỏi bản ghi trước khi trả về client. */
function toPublic(k) {
  const { hash, secret, ...rest } = k;
  return rest;
}
/** Giải mã raw key (null nếu key cũ chưa lưu secret / khóa đổi). */
function revealRaw(k) {
  if (!k.secret) return null;
  try { return decryptSecret(k.secret); } catch { return null; }
}

/** listKeys kèm `key` = raw (để copy); null với key cũ chưa lưu raw. */
export function listKeys() {
  return loadAll().map((k) => ({ ...toPublic(k), key: revealRaw(k) }));
}

/** Tạo key mới. Trả bản ghi + `key` raw. canAdd = cho phép THÊM IP chặn. */
export function createKey(name, canAdd = false) {
  loadAll();
  const raw = 'fwk_' + crypto.randomBytes(24).toString('hex'); // 48 hex
  const rec = {
    id: crypto.randomUUID(),
    name: String(name || '').trim().slice(0, 80) || 'API key',
    hash: sha256(raw),
    secret: encryptSecret(raw), // raw mã hóa để copy lại sau
    prefix: raw.slice(0, 12),
    canAdd: Boolean(canAdd),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requests: 0,
  };
  cache.push(rec);
  persist();
  return { ...toPublic(rec), key: raw };
}

/** Sửa quyền/tên key. Trả bản ghi public (kèm raw) hoặc null nếu không thấy. */
export function updateKey(id, patch = {}) {
  loadAll();
  const rec = cache.find((k) => k.id === id);
  if (!rec) return null;
  if (patch.name !== undefined) { const n = String(patch.name).trim().slice(0, 80); if (n) rec.name = n; }
  if (patch.canAdd !== undefined) rec.canAdd = Boolean(patch.canAdd);
  persist();
  return { ...toPublic(rec), key: revealRaw(rec) };
}

export function deleteKey(id) {
  loadAll();
  const i = cache.findIndex((k) => k.id === id);
  if (i === -1) return false;
  cache.splice(i, 1);
  persist();
  return true;
}

// Ghi thống kê sử dụng theo lô (tránh ghi đĩa mỗi request).
let dirty = false;
let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; if (dirty) { dirty = false; persist(); } }, 5000);
  flushTimer.unref?.();
}

/** Xác thực key raw. Trả bản ghi (public) nếu hợp lệ, null nếu không. */
export function verifyKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const h = sha256(raw);
  const rec = loadAll().find((k) => k.hash === h);
  if (!rec) return null;
  rec.lastUsedAt = new Date().toISOString();
  rec.requests = (rec.requests || 0) + 1;
  dirty = true;
  scheduleFlush();
  return toPublic(rec);
}
