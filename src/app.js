import express from 'express';
import crypto from 'node:crypto';
import apiRoutes from './routes/index.js';
import { config } from './config.js';
import { attachUser, force2faGuard } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { apiErrorLogger } from './middleware/apiError.js';
import { getSettings } from './services/settings.service.js';
import { challengeResponse } from './services/ssl.service.js';
import { parseCookies, serializeCookie } from './utils/cookies.js';

const ENTRANCE_COOKIE = 'frpc_entry';
function entranceToken(entrance) {
  return crypto.createHmac('sha256', config.jwtSecret).update('entrance:' + entrance).digest('hex').slice(0, 32);
}
// Truy cập từ chính máy chạy server -> luôn cho vào (chống tự khóa qua Domain/Entrance).
// CHỈ tin địa chỉ TCP THẬT của kết nối (loopback). KHÔNG tin `Host` header vì attacker
// kiểm soát được (gửi `Host: localhost` sẽ vượt qua Domain/Security Entrance).
function isLocalReq(req) {
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return /^(::1$|::ffff:127\.|127\.)/.test(ip);
}

/** Cổng vào panel: kiểm tra Domain + Security Entrance (bỏ qua cho localhost). */
function panelGuard(req, res, next) {
  const s = getSettings();
  if (!s.panelDomain && !s.securityEntrance) return next();
  if (isLocalReq(req)) return next();

  if (s.panelDomain) {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (host !== s.panelDomain) return res.status(404).send('404 - Not Found');
  }
  if (s.securityEntrance) {
    const want = entranceToken(s.securityEntrance);
    if (req.path === s.securityEntrance || req.path === s.securityEntrance + '/') {
      res.setHeader('Set-Cookie', serializeCookie(ENTRANCE_COOKIE, want, { httpOnly: true, sameSite: 'Lax', maxAge: 30 * 24 * 3600 }));
      return res.redirect('/');
    }
    if (parseCookies(req.headers.cookie)[ENTRANCE_COOKIE] !== want) return res.status(404).send('404 - Not Found');
  }
  next();
}

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);

  // ACME HTTP-01 challenge — phải mở public (TRƯỚC panelGuard) để Let's Encrypt verify.
  app.get('/.well-known/acme-challenge/:token', (req, res) => {
    const keyAuth = challengeResponse(req.params.token);
    if (!keyAuth) return res.status(404).send('Not found');
    res.type('text/plain').send(keyAuth);
  });

  // Cổng vào panel (Domain / Security Entrance) — đặt TRƯỚC mọi thứ để ẩn hoàn toàn panel.
  app.use(panelGuard);
  app.use(express.json({ limit: '1mb' }));

  // Nạp user từ cookie phiên + ghi audit + ghi API error log + bắt buộc 2FA cho mọi request /api
  app.use('/api', attachUser, auditMiddleware, apiErrorLogger, force2faGuard);

  // API
  app.use('/api', apiRoutes);

  // Static frontend (TailwindCSS CDN dùng trong index.html)
  app.use(express.static(config.publicDir));

  // 404 cho API
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint không tồn tại.' });
  });

  // Fallback SPA -> index.html
  app.use((req, res) => {
    res.sendFile('index.html', { root: config.publicDir });
  });

  // Error handler tập trung
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[FRPControl] Lỗi:', err);
    // Không lộ chi tiết lỗi nội bộ (đường dẫn, stack…) cho lỗi 5xx — chỉ log ở server.
    const message = status >= 500 ? 'Lỗi máy chủ nội bộ.' : (err.message || 'Yêu cầu không hợp lệ.');
    res.status(status).json({
      error: message,
      ...(err.upstreamStatus ? { upstreamStatus: err.upstreamStatus } : {}),
    });
  });

  return app;
}
