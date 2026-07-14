import { Router } from 'express';
import * as ctrl from '../controllers/monitor.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { instanceCap } from '../middleware/access.js';

const router = Router();
router.use(requireAuth);

// Đọc/giám sát: role monitoring.view TOÀN CỤC hoặc được gán 'monitor' trên instance.
const canView = instanceCap('monitoring.view', 'monitor');

// Overview tổng hợp (đã tự lọc theo quyền trong controller)
router.get('/overview', ctrl.overviewAll);
router.get('/:id/overview', canView, ctrl.overview);

// frps — clients / traffic
router.get('/:id/clients', canView, ctrl.providerClients);
router.get('/:id/clients/:key', canView, ctrl.providerClient);
router.get('/:id/traffic/:name', canView, ctrl.proxyTraffic);
router.delete('/:id/proxies/offline', instanceCap('proxies.delete', 'update'), ctrl.clearOffline);

// frps — firewall native (fork)
router.get('/:id/firewall', canView, ctrl.providerFirewall);
router.put('/:id/firewall', instanceCap('providers.update', 'update'), ctrl.putProviderFirewall);

// frpc — config
router.get('/:id/config', instanceCap('configs.view', 'monitor'), ctrl.getConfig);
router.put('/:id/config', instanceCap('configs.update', 'update'), ctrl.putConfig);
router.post('/:id/reload', instanceCap('configs.control', 'update'), ctrl.reload);
router.post('/:id/stop', instanceCap('configs.control', 'update'), ctrl.stop);

// frpc — config chi tiết proxy/visitor
router.get('/:id/proxy/:name/config', canView, ctrl.proxyConfig);
router.get('/:id/visitor/:name/config', canView, ctrl.visitorConfig);

// frpc — Store tổng hợp
router.get('/:id/store', canView, ctrl.store);

// frpc — Store proxies
router.get('/:id/store/proxies', instanceCap('proxies.view', 'monitor'), ctrl.listStoreProxies);
router.post('/:id/store/proxies', instanceCap('proxies.create', 'update'), ctrl.createStoreProxy);
router.get('/:id/store/proxies/:name', instanceCap('proxies.view', 'monitor'), ctrl.getStoreProxy);
router.put('/:id/store/proxies/:name', instanceCap('proxies.update', 'update'), ctrl.updateStoreProxy);
router.delete('/:id/store/proxies/:name', instanceCap('proxies.delete', 'update'), ctrl.deleteStoreProxy);

// frpc — Store visitors
router.get('/:id/store/visitors', instanceCap('visitors.view', 'monitor'), ctrl.listStoreVisitors);
router.post('/:id/store/visitors', instanceCap('visitors.create', 'update'), ctrl.createStoreVisitor);
router.get('/:id/store/visitors/:name', instanceCap('visitors.view', 'monitor'), ctrl.getStoreVisitor);
router.put('/:id/store/visitors/:name', instanceCap('visitors.update', 'update'), ctrl.updateStoreVisitor);
router.delete('/:id/store/visitors/:name', instanceCap('visitors.delete', 'update'), ctrl.deleteStoreVisitor);

export default router;
