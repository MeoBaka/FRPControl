import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.post('/login', auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', auth.me);

// Profile của chính user (cần đăng nhập)
router.put('/profile', requireAuth, auth.updateProfile);
router.put('/password', requireAuth, auth.changePassword);
router.post('/2fa/setup', requireAuth, auth.setup2fa);
router.post('/2fa/enable', requireAuth, auth.enable2fa);
router.post('/2fa/disable', requireAuth, auth.disable2fa);

export default router;
