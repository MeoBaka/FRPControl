import * as storage from '../services/storage.service.js';
import { canInstanceAction, canCap } from '../services/access.service.js';

/**
 * Chặn theo action trên instance với role-perm ĐỘNG theo frps/frpc + assignment.
 * action ∈ view | monitor | update | delete.
 */
export function instanceRoleCap(action) {
  return async (req, res, next) => {
    try {
      const inst = await storage.getInstance(req.params.id);
      if (!inst) return res.status(404).json({ error: 'Không tìm thấy instance.' });
      if (!canInstanceAction(req.auth, inst, action)) {
        return res.status(403).json({ error: 'Không có quyền trên instance này.', code: 'FORBIDDEN' });
      }
      req._instance = inst;
      next();
    } catch (err) { next(err); }
  };
}

/**
 * Chặn theo role-perm CỐ ĐỊNH (vd 'proxies.create', 'monitoring.view') + assignment action.
 * Dùng cho các endpoint monitor/store/config nơi role-perm không đổi theo frps/frpc.
 */
export function instanceCap(rolePerm, assignAction) {
  return async (req, res, next) => {
    try {
      const inst = await storage.getInstance(req.params.id);
      if (!inst) return res.status(404).json({ error: 'Không tìm thấy instance.' });
      if (!canCap(req.auth, inst, rolePerm, assignAction)) {
        return res.status(403).json({ error: `Không có quyền: ${rolePerm}`, code: 'FORBIDDEN' });
      }
      req._instance = inst;
      next();
    } catch (err) { next(err); }
  };
}
