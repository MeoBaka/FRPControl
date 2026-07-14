/**
 * Firewall middleware — chặn IP nằm trong blacklist ở tầng panel.
 *
 * - Chỉ hoạt động khi settings.firewallEnabled = true.
 * - LUÔN bỏ qua localhost/loopback (chống tự khóa) + route ACME (đã xử lý trước panelGuard).
 * - Bỏ qua Firewall API công khai (/api/fw/*): dịch vụ bên ngoài tự xác thực bằng API key,
 *   không thể để IP của chính họ (có thể bị flag) chặn luôn khả năng tra cứu.
 * - mode 'block'   -> trả 403.
 * - mode 'monitor' -> cho qua, chỉ đếm hit (để test trước khi bật chặn thật).
 */
import { getSettings } from '../services/settings.service.js';
import { isBlacklisted, recordHit } from '../services/blacklist.service.js';
import { clientIp } from '../utils/clientIp.js';

function isLoopback(req) {
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return /^(::1$|::ffff:127\.|127\.)/.test(ip);
}

export function firewallMiddleware(req, res, next) {
  const s = getSettings();
  if (!s.firewallEnabled) return next();
  if (isLoopback(req)) return next();
  if (req.path.startsWith('/api/fw/')) return next(); // Firewall API công khai tự lo bằng API key

  const ip = clientIp(req);
  if (!ip || !isBlacklisted(ip)) return next();

  recordHit();
  req._firewallHit = ip;
  if (s.firewallMode === 'monitor') return next(); // chỉ đánh dấu, không chặn
  return res.status(403).json({ error: 'Truy cập bị từ chối: IP nằm trong danh sách chặn (firewall).' });
}
