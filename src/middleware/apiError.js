import * as ael from '../services/apiError.service.js';
import { clientIp } from '../utils/clientIp.js';

// AEL CHỈ ghi lỗi khi gọi upstream FRPC/FRPS (lỗi API của panel đã có Audit Log lo).
// Tín hiệu lỗi FRP: body có upstreamStatus (frps/frpc trả non-2xx) HOẶC 502/504 (kết nối/timeout).
function isFrpError(res, status) {
  if (res._aelBody && res._aelBody.upstreamStatus != null) return true;
  return status === 502 || status === 504;
}

/**
 * Ghi API Error Log cho mọi response status >= 400.
 * Bọc res.json để lấy được error/code/message từ body trước khi ghi ở sự kiện finish.
 */
export function apiErrorLogger(req, res, next) {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === 'object') {
      res._aelMsg = body.error || body.message || '';
      res._aelCode = body.code || '';
      res._aelBody = body; // lưu nguyên response để xem chi tiết
    }
    return origJson(body);
  };

  res.on('finish', () => {
    try {
      const status = res.statusCode;
      const pathname = (req.originalUrl || req.url).split('?')[0];
      if (status < 400 || !isFrpError(res, status)) return; // chỉ lỗi FRPC/FRPS
      const u = req.auth && req.auth.user;
      ael.record({
        method: req.method,
        path: pathname,
        status,
        code: res._aelCode || '',
        message: res._aelMsg || '',
        response: res._aelBody || null,
        query: (req.originalUrl || '').split('?')[1] || '',
        username: u ? u.username : '',
        userId: u ? u.id : null,
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
      });
    } catch { /* ignore */ }
  });

  next();
}
