import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { isValidId } from '../utils/id.js';

/**
 * Role/quyền — RBAC. Mỗi role = 1 file data/roles/<id>.json.
 * Quyền dạng chuỗi "resource.action". Role có permissions=['*'] nghĩa là toàn quyền.
 */

// Danh mục quyền: resource -> các action. UI phân quyền dựa vào đây.
export const PERMISSION_CATALOG = [
  { resource: 'providers', label: 'Providers (FRPS)', actions: ['view', 'create', 'update', 'delete'] },
  { resource: 'nodes', label: 'Nodes (FRPC)', actions: ['view', 'create', 'update', 'delete'] },
  { resource: 'monitoring', label: 'Giám sát (status/clients/proxies)', actions: ['view'] },
  { resource: 'proxies', label: 'Store Proxies', actions: ['view', 'create', 'update', 'delete'] },
  { resource: 'visitors', label: 'Store Visitors', actions: ['view', 'create', 'update', 'delete'] },
  { resource: 'configs', label: 'Cấu hình frpc (toml)', actions: ['view', 'update', 'control'] },
  { resource: 'users', label: 'User Manager', actions: ['view', 'create', 'update', 'delete', 'disable2fa', 'revoke', 'assign'] },
  { resource: 'roles', label: 'Role Manager', actions: ['view', 'create', 'update', 'delete'] },
  { resource: 'audit', label: 'Audit Logs', actions: ['view'] },
  { resource: 'ael', label: 'API Error Logs', actions: ['view'] },
  { resource: 'settings', label: 'Configs (web)', actions: ['view', 'update'] },
  { resource: 'certs', label: 'Cert Manager', actions: ['view', 'create', 'download', 'delete'] },
  { resource: 'security', label: 'Bảo mật', actions: ['req2fa'] },
];

export const ALL_PERMISSIONS = PERMISSION_CATALOG.flatMap((g) => g.actions.map((a) => `${g.resource}.${a}`));

const ACTION_LABELS = { view: 'Xem', create: 'Thêm', update: 'Sửa', delete: 'Xóa', control: 'Điều khiển', disable2fa: 'Tắt 2FA', revoke: 'Thu hồi phiên', assign: 'Phân quyền item', req2fa: 'Bắt buộc 2FA', download: 'Tải về' };
export function actionLabel(a) { return ACTION_LABELS[a] || a; }

function filePathFor(id) {
  if (!isValidId(id)) { const e = new Error('ID không hợp lệ.'); e.status = 400; throw e; }
  return path.join(config.rolesDir, `${id}.json`);
}
function nowIso() { return new Date().toISOString(); }

export function hasPermission(role, perm) {
  if (!role || !Array.isArray(role.permissions)) return false;
  if (role.permissions.includes('*')) return true;
  return role.permissions.includes(perm);
}

async function readRaw(id) {
  let fp;
  try { fp = filePathFor(id); } catch { return null; }
  try { return JSON.parse(await fs.readFile(fp, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function writeRaw(role) {
  await fs.writeFile(filePathFor(role.id), JSON.stringify(role, null, 2), 'utf8');
}

export async function listRoles() {
  const files = (await fs.readdir(config.rolesDir)).filter((f) => f.endsWith('.json'));
  const roles = [];
  for (const f of files) {
    try { roles.push(JSON.parse(await fs.readFile(path.join(config.rolesDir, f), 'utf8'))); } catch { /* skip */ }
  }
  roles.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return roles;
}

export async function getRole(id) { return readRaw(id); }

function validatePermissions(list) {
  if (!Array.isArray(list)) return [];
  if (list.includes('*')) return ['*'];
  return [...new Set(list.filter((p) => ALL_PERMISSIONS.includes(p)))];
}

export async function createRole({ name, description, permissions }) {
  if (!name || !String(name).trim()) { const e = new Error('Thiếu tên role.'); e.status = 400; throw e; }
  const role = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    description: String(description || '').trim(),
    permissions: validatePermissions(permissions),
    system: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await writeRaw(role);
  return role;
}

export async function updateRole(id, patch) {
  const role = await readRaw(id);
  if (!role) return null;
  if (patch.name !== undefined) role.name = String(patch.name).trim();
  if (patch.description !== undefined) role.description = String(patch.description || '').trim();
  // Không cho đổi quyền của role hệ thống (Administrator) để tránh tự khóa toàn bộ.
  if (patch.permissions !== undefined && !role.system) role.permissions = validatePermissions(patch.permissions);
  role.updatedAt = nowIso();
  await writeRaw(role);
  return role;
}

export async function deleteRole(id) {
  const role = await readRaw(id);
  if (!role) return false;
  if (role.system) { const e = new Error('Không thể xóa role hệ thống.'); e.status = 400; throw e; }
  await fs.unlink(filePathFor(id));
  return true;
}

/** Seed các role mặc định nếu chưa có role nào. Trả về role Administrator. */
export async function seedDefaultRoles() {
  const existing = await listRoles();
  if (existing.length) return existing.find((r) => r.system) || existing[0];

  const admin = {
    id: crypto.randomUUID(), name: 'Administrator', description: 'Toàn quyền hệ thống',
    permissions: ['*'], system: true, createdAt: nowIso(), updatedAt: nowIso(),
  };
  const operator = {
    id: crypto.randomUUID(), name: 'Operator', description: 'Quản lý FRP (không quản trị hệ thống)',
    permissions: [
      'providers.view', 'providers.create', 'providers.update', 'providers.delete',
      'nodes.view', 'nodes.create', 'nodes.update', 'nodes.delete',
      'monitoring.view',
      'proxies.view', 'proxies.create', 'proxies.update', 'proxies.delete',
      'visitors.view', 'visitors.create', 'visitors.update', 'visitors.delete',
      'configs.view', 'configs.update', 'configs.control',
    ], system: false, createdAt: nowIso(), updatedAt: nowIso(),
  };
  const viewer = {
    id: crypto.randomUUID(), name: 'Viewer', description: 'Chỉ xem',
    permissions: ['providers.view', 'nodes.view', 'monitoring.view', 'proxies.view', 'visitors.view', 'configs.view'],
    system: false, createdAt: nowIso(), updatedAt: nowIso(),
  };
  for (const r of [admin, operator, viewer]) {
    fss.writeFileSync(filePathFor(r.id), JSON.stringify(r, null, 2), 'utf8');
  }
  return admin;
}
