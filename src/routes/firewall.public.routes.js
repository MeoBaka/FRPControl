/**
 * Firewall API CÔNG KHAI — cho dịch vụ bên ngoài tra cứu IP bẩn.
 * Xác thực bằng API key (header X-API-Key / Authorization: Bearer / ?key=).
 * Mount TRƯỚC panelGuard để không bị Domain/Security Entrance chặn.
 */
import { Router } from 'express';
import * as fw from '../controllers/firewall.controller.js';

const router = Router();
router.use(fw.apiKeyAuth);

router.get('/check', fw.check);   // ?ip=1.2.3.4  (lặp ?ip= để nhiều)
router.post('/check', fw.check);  // { "ips": ["1.2.3.4", ...] }
router.post('/block', fw.publicAddBlock); // { ip, days?, permanent?, reason? } — cần key có canAdd
router.get('/stats', fw.publicStats);

export default router;
