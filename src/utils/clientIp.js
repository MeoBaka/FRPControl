import { getSettings } from '../services/settings.service.js';

/**
 * IP client dùng CHUNG cho audit / AEL / login (để nhất quán + chống giả mạo).
 * Chỉ tin X-Forwarded-For khi bật "Tin proxy" (đứng sau reverse-proxy / frp tunnel);
 * mặc định dùng IP TCP thật (chống giả mạo IP khi vào trực tiếp).
 */
export function clientIp(req) {
  if (getSettings().trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}
