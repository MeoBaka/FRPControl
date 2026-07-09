import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { isValidId } from '../utils/id.js';
import { sanitizeAssignments } from './access.service.js';
import { getSettings } from './settings.service.js';

/** Kiểm tra chính sách mật khẩu. Tối thiểu 6 ký tự; nếu bật Strong password: >=8 + hoa/thường/số/ký tự đặc biệt. */
function assertPasswordPolicy(pw) {
  const s = String(pw || '');
  if (getSettings().strongPassword) {
    const strong = s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s) && /[^A-Za-z0-9]/.test(s);
    if (!strong) { const e = new Error('Mật khẩu mạnh: tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'); e.status = 400; throw e; }
  } else if (s.length < 6) {
    const e = new Error('Mật khẩu tối thiểu 6 ký tự.'); e.status = 400; throw e;
  }
}

/** Người dùng — mỗi user = 1 file data/users/<id>.json. */

function filePathFor(id) {
  if (!isValidId(id)) { const e = new Error('ID không hợp lệ.'); e.status = 400; throw e; }
  return path.join(config.usersDir, `${id}.json`);
}
function nowIso() { return new Date().toISOString(); }

function toPublic(u) {
  if (!u) return null;
  const { passwordHash, twoFactorSecret, twoFactorPendingSecret, ...rest } = u;
  return { ...rest, twoFactorEnabled: Boolean(u.twoFactorEnabled) };
}

async function readRaw(id) {
  let fp;
  try { fp = filePathFor(id); } catch { return null; }
  try { return JSON.parse(await fs.readFile(fp, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function writeRaw(u) { await fs.writeFile(filePathFor(u.id), JSON.stringify(u, null, 2), 'utf8'); }

export async function listRaw() {
  const files = (await fs.readdir(config.usersDir)).filter((f) => f.endsWith('.json'));
  const users = [];
  for (const f of files) {
    try { users.push(JSON.parse(await fs.readFile(path.join(config.usersDir, f), 'utf8'))); } catch { /* skip */ }
  }
  return users;
}

export async function listUsers() {
  const users = await listRaw();
  users.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  return users.map(toPublic);
}

export async function getUser(id) { return toPublic(await readRaw(id)); }
export async function getUserRaw(id) { return readRaw(id); }

export async function getByUsername(username) {
  const u = (await listRaw()).find((x) => x.username.toLowerCase() === String(username).toLowerCase());
  return u || null;
}

export async function countUsers() {
  return (await fs.readdir(config.usersDir)).filter((f) => f.endsWith('.json')).length;
}

export async function createUser({ username, password, displayName, roleId, status }) {
  username = String(username || '').trim();
  if (!username) { const e = new Error('Thiếu username.'); e.status = 400; throw e; }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) { const e = new Error('Username 3-32 ký tự (chữ, số, . _ -).'); e.status = 400; throw e; }
  if (await getByUsername(username)) { const e = new Error('Username đã tồn tại.'); e.status = 400; throw e; }
  assertPasswordPolicy(password);
  if (!roleId) { const e = new Error('Thiếu role.'); e.status = 400; throw e; }

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: String(displayName || username).trim(),
    roleId,
    status: status === 'disabled' ? 'disabled' : 'active',
    passwordHash: hashPassword(password),
    assignments: {},           // phân quyền theo từng instance (Assign Item)
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastLoginAt: null,
  };
  await writeRaw(user);
  return toPublic(user);
}

export async function updateUser(id, patch) {
  const user = await readRaw(id);
  if (!user) return null;
  if (patch.displayName !== undefined) user.displayName = String(patch.displayName || '').trim();
  if (patch.roleId !== undefined) user.roleId = patch.roleId;
  if (patch.status !== undefined) user.status = patch.status === 'disabled' ? 'disabled' : 'active';
  if (patch.password) {
    assertPasswordPolicy(patch.password);
    user.passwordHash = hashPassword(patch.password);
  }
  user.updatedAt = nowIso();
  await writeRaw(user);
  return toPublic(user);
}

/** Cập nhật phân quyền theo instance (Assign Item). assignments = { <instanceId>: [action...] }. */
export async function updateAssignments(id, assignments) {
  const user = await readRaw(id);
  if (!user) return null;
  user.assignments = sanitizeAssignments(assignments, isValidId);
  user.updatedAt = nowIso();
  await writeRaw(user);
  return toPublic(user);
}

export async function markLogin(id, ip) {
  const user = await readRaw(id);
  if (!user) return;
  user.lastLoginAt = nowIso();
  if (ip) user.lastLoginIp = String(ip).slice(0, 64);
  await writeRaw(user);
}

// ---------------- Profile của chính user ----------------
export async function updateProfile(id, { displayName }) {
  const user = await readRaw(id);
  if (!user) return null;
  if (displayName !== undefined) user.displayName = String(displayName || '').trim() || user.username;
  user.updatedAt = nowIso();
  await writeRaw(user);
  return toPublic(user);
}

export async function changeOwnPassword(id, currentPassword, newPassword) {
  const user = await readRaw(id);
  if (!user) { const e = new Error('Không tìm thấy user.'); e.status = 404; throw e; }
  if (!verifyPassword(currentPassword, user.passwordHash)) { const e = new Error('Mật khẩu hiện tại không đúng.'); e.status = 400; throw e; }
  assertPasswordPolicy(newPassword);
  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = nowIso();
  await writeRaw(user);
  return true;
}

export async function verifyOwnPassword(id, password) {
  const user = await readRaw(id);
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

// ---------------- 2FA ----------------
export async function setPending2fa(id, encryptedSecret) {
  const user = await readRaw(id);
  if (!user) return null;
  user.twoFactorPendingSecret = encryptedSecret;
  user.updatedAt = nowIso();
  await writeRaw(user);
  return true;
}

/** Lấy secret (đã mã hóa) đang chờ xác nhận. */
export async function getPending2fa(id) {
  const user = await readRaw(id);
  return user ? user.twoFactorPendingSecret : null;
}
export async function getActive2fa(id) {
  const user = await readRaw(id);
  return user ? user.twoFactorSecret : null;
}

export async function enable2fa(id) {
  const user = await readRaw(id);
  if (!user || !user.twoFactorPendingSecret) return false;
  user.twoFactorSecret = user.twoFactorPendingSecret;
  user.twoFactorPendingSecret = null;
  user.twoFactorEnabled = true;
  user.updatedAt = nowIso();
  await writeRaw(user);
  return true;
}

export async function disable2fa(id) {
  const user = await readRaw(id);
  if (!user) return false;
  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  user.twoFactorPendingSecret = null;
  user.updatedAt = nowIso();
  await writeRaw(user);
  return true;
}

export async function deleteUser(id) {
  let fp;
  try { fp = filePathFor(id); } catch { return false; }
  try { await fs.unlink(fp); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

/** Seed 1 admin nếu chưa có user nào. Trả về { username, password } nếu vừa tạo. */
export async function seedAdmin(adminRoleId) {
  if (await countUsers() > 0) return null;
  const password = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Admin12345';
  const user = {
    id: crypto.randomUUID(),
    username: 'admin',
    displayName: 'Administrator',
    roleId: adminRoleId,
    status: 'active',
    passwordHash: hashPassword(password),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastLoginAt: null,
  };
  fss.writeFileSync(filePathFor(user.id), JSON.stringify(user, null, 2), 'utf8');
  return { username: 'admin', password };
}
