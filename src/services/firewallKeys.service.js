/**
 * API key cho Firewall API công khai (chia sẻ dịch vụ check IP).
 *
 * - Key được sinh ngẫu nhiên, CHỈ hiện raw MỘT LẦN lúc tạo; lưu dạng SHA-256.
 * - File data/firewall-keys.json (đã .gitignore theo data/).
 * - Xác thực: hash key gửi lên rồi so khớp -> O(n) trên số key (rất nhỏ).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';

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

/** Bỏ hash khỏi bản ghi trước khi trả về client. */
function toPublic(k) {
  const { hash, ...rest } = k;
  return rest;
}

export function listKeys() {
  return loadAll().map(toPublic);
}

/** Tạo key mới. Trả bản ghi + `key` raw (hiện 1 lần duy nhất). canAdd = cho phép THÊM IP chặn. */
export function createKey(name, canAdd = false) {
  loadAll();
  const raw = 'fwk_' + crypto.randomBytes(24).toString('hex'); // 48 hex
  const rec = {
    id: crypto.randomUUID(),
    name: String(name || '').trim().slice(0, 80) || 'API key',
    hash: sha256(raw),
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
