import { Router } from 'express';
import * as ctrl from '../controllers/instances.controller.js';
import { requireAuth, requirePermissionFn } from '../middleware/auth.js';
import { instanceRoleCap } from '../middleware/access.js';

const router = Router();
router.use(requireAuth);

// Quyền tạo tùy theo role trong payload (frps -> providers, frpc -> nodes).
// Tạo mới KHÔNG thể cấp qua assignment (chưa có instance để gán) -> chỉ role-perm.
const createPerm = requirePermissionFn((req) => {
  const role = (req.body && req.body.role) === 'frpc' ? 'nodes' : 'providers';
  return `${role}.create`;
});

router.get('/', ctrl.list);                          // liệt kê (đã lọc theo quyền xem)
router.post('/', createPerm, ctrl.create);
router.post('/test', createPerm, ctrl.testAdhoc);    // test URL tùy ý -> chỉ user có quyền tạo (chống SSRF từ Viewer)
router.get('/:id', instanceRoleCap('view'), ctrl.getOne);
router.put('/:id', instanceRoleCap('update'), ctrl.update);
router.delete('/:id', instanceRoleCap('delete'), ctrl.remove);
router.post('/:id/test', instanceRoleCap('view'), ctrl.testSaved);

export default router;
