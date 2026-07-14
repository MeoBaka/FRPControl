import { Router } from 'express';
import * as ctrl from '../controllers/system.controller.js';
import * as fw from '../controllers/firewall.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Danh mục quyền (cho UI Role Manager)
router.get('/permissions', requirePermission('roles.view'), ctrl.permissionCatalog);

// Users
router.get('/users', requirePermission('users.view'), ctrl.listUsers);
router.post('/users', requirePermission('users.create'), ctrl.createUser);
router.put('/users/:id', requirePermission('users.update'), ctrl.updateUser);
router.post('/users/:id/disable-2fa', requirePermission('users.disable2fa'), ctrl.disableUser2fa);
router.post('/users/:id/revoke-sessions', requirePermission('users.revoke'), ctrl.revokeUserSessions);
router.delete('/users/:id', requirePermission('users.delete'), ctrl.deleteUser);

// Assign Item — phân quyền theo từng instance cho user
router.get('/assign/instances', requirePermission('users.assign'), ctrl.assignInstances);
router.put('/users/:id/assignments', requirePermission('users.assign'), ctrl.updateUserAssignments);

// Cert Manager
router.get('/certs', requirePermission('certs.view'), ctrl.listCerts);
router.post('/certs', requirePermission('certs.create'), ctrl.createCert);
router.get('/certs/:id/download', requirePermission('certs.download'), ctrl.downloadCert);
router.delete('/certs/:id', requirePermission('certs.delete'), ctrl.deleteCert);

// Roles
router.get('/roles', requirePermission('roles.view'), ctrl.listRoles);
router.post('/roles', requirePermission('roles.create'), ctrl.createRole);
router.put('/roles/:id', requirePermission('roles.update'), ctrl.updateRole);
router.delete('/roles/:id', requirePermission('roles.delete'), ctrl.deleteRole);

// Audit
router.get('/audit', requirePermission('audit.view'), ctrl.listAudit);
router.get('/audit/actions', requirePermission('audit.view'), ctrl.auditActions);

// API Error Logs (chỉ xem)
router.get('/ael', requirePermission('ael.view'), ctrl.listApiErrors);

// Settings
router.get('/settings', requirePermission('settings.view'), ctrl.getSettings);
router.put('/settings', requirePermission('settings.update'), ctrl.updateSettings);

// Firewall (quản lý trong panel)
router.get('/firewall/stats', requirePermission('firewall.view'), fw.stats);
router.post('/firewall/check', requirePermission('firewall.view'), fw.check);
router.post('/firewall/refresh', requirePermission('firewall.update'), fw.refresh);
router.get('/firewall/keys', requirePermission('firewall.keys'), fw.listKeys);
router.post('/firewall/keys', requirePermission('firewall.keys'), fw.createKey);
router.delete('/firewall/keys/:id', requirePermission('firewall.keys'), fw.deleteKey);

export default router;
