import * as roles from './role.service.js';

/**
 * Phân quyền theo TỪNG instance (Assign Item).
 * Mô hình ADDITIVE: assignment chỉ CẤP THÊM quyền trên instance cụ thể, không thu hồi
 * quyền toàn cục của role. Quyền hiệu lực trên instance X cho action A =
 *   role có quyền toàn cục cho A  HOẶC  user được gán A trên X.
 */

// Các action có thể gán cho 1 instance.
export const ASSIGN_ACTIONS = ['view', 'monitor', 'update', 'delete'];
export const ASSIGN_LABELS = { view: 'Xem', monitor: 'Giám sát', update: 'Sửa', delete: 'Xóa' };

/** Role-perm toàn cục tương ứng với action trên instance (frps→providers, frpc→nodes). */
function rolePermFor(instanceRole, action) {
  const res = instanceRole === 'frpc' ? 'nodes' : 'providers';
  return {
    view: `${res}.view`,
    monitor: 'monitoring.view',
    update: `${res}.update`,
    delete: `${res}.delete`,
  }[action];
}

/** Mảng action đã gán cho instance có cấp `action` yêu cầu không (có bao hàm). */
export function assignmentGrants(assigned, action) {
  if (!Array.isArray(assigned) || assigned.length === 0) return false;
  if (assigned.includes(action)) return true;
  if (action === 'view') return true;                      // bất kỳ assignment nào cũng cho xem
  if (action === 'monitor') return assigned.includes('update'); // 'update' bao hàm 'monitor'
  return false;
}

function assignmentsFor(auth, instanceId) {
  const a = auth && auth.user && auth.user.assignments;
  return (a && a[instanceId]) || [];
}

/** Có quyền `action` (view|monitor|update|delete) trên instance? (role-perm theo instanceRole HOẶC assignment) */
export function canInstanceAction(auth, instance, action) {
  if (!auth || !auth.user || !instance) return false;
  const perm = rolePermFor(instance.role, action);
  if (perm && roles.hasPermission(auth.role, perm)) return true;
  return assignmentGrants(assignmentsFor(auth, instance.id), action);
}

/** Có quyền theo role-perm CỐ ĐỊNH (vd 'proxies.create') HOẶC assignment action (thường 'update')? */
export function canCap(auth, instance, rolePerm, assignAction) {
  if (!auth || !auth.user || !instance) return false;
  if (rolePerm && roles.hasPermission(auth.role, rolePerm)) return true;
  return assignmentGrants(assignmentsFor(auth, instance.id), assignAction);
}

/** Chuẩn hóa object assignments: { <instanceId(uuid)>: [action...] }. Bỏ id/action không hợp lệ. */
export function sanitizeAssignments(input, isValidId) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (isValidId && !isValidId(k)) continue;
    if (!Array.isArray(v)) continue;
    const acts = [...new Set(v.filter((a) => ASSIGN_ACTIONS.includes(a)))];
    if (acts.length) out[k] = acts;
  }
  return out;
}
