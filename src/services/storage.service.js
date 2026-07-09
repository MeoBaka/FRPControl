import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { encryptSecret, decryptSecret, isEncrypted } from '../utils/crypto.js';
import { isValidId } from '../utils/id.js';

/**
 * Storage service — lưu mỗi FRP instance thành 1 file JSON riêng trong data/instances/.
 *
 * Model một instance (file <id>.json):
 * {
 *   id, name, role: 'frps'|'frpc', baseUrl, user, password (đã mã hóa),
 *   tls, group, note, createdAt, updatedAt
 * }
 *
 * Mật khẩu được mã hóa khi lưu và chỉ giải mã khi cần gọi API (xem getInstanceWithSecret).
 */

const VALID_ROLES = new Set(['frps', 'frpc']);

// Chỉ chấp nhận id dạng UUID -> không thể chèn '../' để traversal.
function filePathFor(id) {
  if (!isValidId(id)) { const e = new Error('ID không hợp lệ.'); e.status = 400; throw e; }
  return path.join(config.instancesDir, `${id}.json`);
}

function normalizeBaseUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, ''); // bỏ dấu / ở cuối
}

function nowIso() {
  return new Date().toISOString();
}

/** Loại bỏ mật khẩu khỏi object trước khi trả về client. */
function toPublic(instance) {
  const { password, ...rest } = instance;
  return { ...rest, hasPassword: Boolean(password) };
}

function validate(payload, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || payload.name !== undefined) {
    if (!payload.name || !String(payload.name).trim()) errors.push('Thiếu "name".');
    else out.name = String(payload.name).trim();
  }
  if (!partial || payload.role !== undefined) {
    if (!VALID_ROLES.has(payload.role)) errors.push('"role" phải là "frps" hoặc "frpc".');
    else out.role = payload.role;
  }
  if (!partial || payload.baseUrl !== undefined) {
    const url = normalizeBaseUrl(payload.baseUrl);
    if (!url) errors.push('Thiếu "baseUrl" (URL của web dashboard frps/frpc).');
    else out.baseUrl = url;
  }
  if (!partial || payload.user !== undefined) {
    out.user = payload.user == null ? '' : String(payload.user);
  }
  if (payload.tls !== undefined) out.tls = Boolean(payload.tls);
  if (payload.group !== undefined) out.group = String(payload.group || '').trim();
  if (payload.note !== undefined) out.note = String(payload.note || '');

  return { errors, value: out };
}

/** Đọc raw instance (bao gồm password đã mã hóa) — dùng nội bộ. */
async function readRaw(id) {
  let fp;
  try { fp = filePathFor(id); } catch { return null; } // id không hợp lệ -> coi như không tồn tại
  try {
    const content = await fs.readFile(fp, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeRaw(instance) {
  const dest = filePathFor(instance.id); // validate id
  const tmp = `${dest}.tmp`;              // an toàn: nối vào path đã validate
  await fs.writeFile(tmp, JSON.stringify(instance, null, 2), 'utf8');
  await fs.rename(tmp, dest);
}

/** Nâng cấp mọi mật khẩu instance còn ở dạng cũ (base64/plaintext) sang AES-256-GCM. */
export async function migrateSecrets() {
  let upgraded = 0;
  let files;
  try { files = (await fs.readdir(config.instancesDir)).filter((f) => f.endsWith('.json')); } catch { return 0; }
  for (const f of files) {
    const raw = await readRaw(f.replace(/\.json$/, ''));
    if (!raw) continue;
    const pw = String(raw.password || '');
    if (pw && !isEncrypted(pw)) {
      raw.password = encryptSecret(decryptSecret(pw));
      await writeRaw(raw);
      upgraded += 1;
    }
  }
  return upgraded;
}

export async function listInstances() {
  const files = await fs.readdir(config.instancesDir);
  const jsons = files.filter((f) => f.endsWith('.json'));
  const items = [];
  for (const f of jsons) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(config.instancesDir, f), 'utf8'));
      items.push(toPublic(raw));
    } catch {
      // Bỏ qua file hỏng
    }
  }
  items.sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
  return items;
}

export async function getInstance(id) {
  const raw = await readRaw(id);
  return raw ? toPublic(raw) : null;
}

/** Trả về instance kèm mật khẩu đã giải mã — chỉ dùng ở tầng service gọi FRP API. */
export async function getInstanceWithSecret(id) {
  const raw = await readRaw(id);
  if (!raw) return null;
  return { ...raw, password: decryptSecret(raw.password) };
}

export async function createInstance(payload) {
  const { errors, value } = validate(payload, { partial: false });
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID();
  const record = {
    id,
    name: value.name,
    role: value.role,
    baseUrl: value.baseUrl,
    user: value.user ?? '',
    password: encryptSecret(payload.password ?? ''),
    tls: value.tls ?? false,
    group: value.group ?? '',
    note: value.note ?? '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await writeRaw(record);
  return toPublic(record);
}

export async function updateInstance(id, payload) {
  const raw = await readRaw(id);
  if (!raw) return null;

  const { errors, value } = validate(payload, { partial: true });
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }

  const updated = { ...raw, ...value, updatedAt: nowIso() };
  // Chỉ cập nhật mật khẩu khi client gửi trường password (chuỗi rỗng = xóa mật khẩu).
  if (payload.password !== undefined) {
    updated.password = encryptSecret(payload.password);
  }
  await writeRaw(updated);
  return toPublic(updated);
}

export async function deleteInstance(id) {
  let fp;
  try { fp = filePathFor(id); } catch { return false; }
  try {
    await fs.unlink(fp);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}
