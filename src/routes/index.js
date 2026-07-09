import { Router } from 'express';
import instancesRoutes from './instances.routes.js';
import monitorRoutes from './monitor.routes.js';
import authRoutes from './auth.routes.js';
import systemRoutes from './system.routes.js';
import { getSettings } from '../services/settings.service.js';

const router = Router();

router.get('/health', (req, res) => {
  const s = getSettings();
  res.json({
    ok: true, service: 'frpcontrol',
    encryption: 'aes-256-gcm',   // at-rest luôn AES-256-GCM (đã bỏ base64)
    siteName: s.siteName,
    loginSubtitle: s.loginSubtitle,
  });
});

router.use('/auth', authRoutes);
router.use('/system', systemRoutes);
router.use('/instances', instancesRoutes);
router.use('/monitor', monitorRoutes);

export default router;
