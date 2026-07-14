import fs from 'node:fs';
import { config } from '../config.js';
import { isPrivateIP } from '../utils/net.js';
import * as ssl from './ssl.service.js';

/** Cấu hình web, lưu ở data/settings.json. */

const DEFAULTS = {
  siteName: 'FRPControl',
  loginSubtitle: 'Đăng nhập để tiếp tục quản lý FRP',
  sessionTimeoutMinutes: 480, // TTL refresh token khi KHÔNG chọn "Ghi nhớ" (8 giờ)
  rememberDays: 30,           // TTL refresh token khi chọn "Ghi nhớ đăng nhập"
  auditLogReads: false,       // có ghi audit cho request GET (đọc) không
  auditRetentionDays: 90,     // giữ log tối đa (thông tin, chưa tự dọn)

  // ----- Máy chủ panel (áp dụng khi lưu, đã kiểm tra port/cert trước) -----
  serverIP: '',               // '' = tất cả interface (0.0.0.0)
  serverPort: 0,              // 0 = dùng PORT trong .env / mặc định 3000
  panelSSL: false,            // bật HTTPS cho panel
  sslMode: 'selfsigned',      // 'selfsigned' | 'acme' (khi để trống Cert/Key file -> tự tạo)
  sslCertFile: '',            // (tùy chọn) đường dẫn file chứng chỉ PEM — có thì dùng thẳng
  sslKeyFile: '',             // (tùy chọn) đường dẫn file private key PEM
  acmeEmail: '',              // email đăng ký Let's Encrypt
  acmeAutoRenew: true,        // tự gia hạn cert ACME khi gần hết hạn
  acmeStaging: false,         // dùng Let's Encrypt staging để thử (cert không tin cậy)

  // ----- Bảo mật -----
  trustProxy: config.trustProxy, // tin X-Forwarded-For (đứng sau reverse-proxy / frp tunnel) -> lấy đúng IP client
  frpApiTimeout: 8000,        // ms — timeout gọi Admin API của frps/frpc
  require2fa: false,          // Google Authenticator: bắt buộc mọi user bật 2FA
  strongPassword: false,      // bắt buộc mật khẩu mạnh (>=8, hoa/thường/số/ký tự đặc biệt)
  panelDomain: '',            // chỉ cho truy cập panel qua domain này ('' = mọi host)
  securityEntrance: '',       // path bí mật để vào panel ('' = tắt), vd /f5bce1a2

  // ---- Firewall / IP blacklist ----
  // 2 công tắc ĐỘC LẬP (đều cần blacklist data — data được duy trì nếu BẤT KỲ cái nào bật):
  firewallEnabled: false,     // CHẶN panel: request từ IP blacklist bị 403/đếm
  firewallApiEnabled: false,  // API tra cứu công khai /api/fw/* (chia sẻ) — không liên quan chặn panel
  firewallMode: 'block',      // (chỉ khi firewallEnabled) 'block' = 403 | 'monitor' = chỉ đếm
  firewallSourceUrl: 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/inbound.txt',
  firewallAutoUpdate: true,   // tự tải nguồn + build lại mỗi ngày 00:00 (khi firewall/API bật)
};

let cache = null;

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(config.settingsFile, 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

/** Chuẩn hóa Security Entrance -> '/token' (chữ, số, _ -). Rỗng = tắt. */
export function normalizeEntrance(v) {
  let s = String(v ?? '').trim().replace(/^\/+/, '');
  s = s.replace(/[^A-Za-z0-9_-]/g, '');
  return s ? `/${s}` : '';
}

/** Chuẩn hóa domain -> hostname thường (bỏ scheme, path, port). */
export function normalizeDomain(v) {
  let s = String(v ?? '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  return s;
}

/** Tính toán bản settings mới (đã validate) từ patch — CHƯA ghi xuống đĩa. */
export function previewSettings(patch) {
  const current = getSettings();
  const next = { ...current };
  const bool = (v) => Boolean(v);
  if (patch.siteName !== undefined) next.siteName = String(patch.siteName).slice(0, 100);
  if (patch.loginSubtitle !== undefined) next.loginSubtitle = String(patch.loginSubtitle).slice(0, 200);
  if (patch.sessionTimeoutMinutes !== undefined) next.sessionTimeoutMinutes = Math.max(5, Number(patch.sessionTimeoutMinutes) || DEFAULTS.sessionTimeoutMinutes);
  if (patch.rememberDays !== undefined) next.rememberDays = Math.max(1, Number(patch.rememberDays) || DEFAULTS.rememberDays);
  if (patch.auditLogReads !== undefined) next.auditLogReads = bool(patch.auditLogReads);
  if (patch.auditRetentionDays !== undefined) next.auditRetentionDays = Math.max(1, Number(patch.auditRetentionDays) || DEFAULTS.auditRetentionDays);

  if (patch.serverIP !== undefined) next.serverIP = String(patch.serverIP).trim().slice(0, 64);
  if (patch.serverPort !== undefined) {
    const p = Number(patch.serverPort) || 0;
    if (p !== 0 && (p < 1 || p > 65535)) { const e = new Error('Server Port phải trong 1–65535 (hoặc 0 = mặc định).'); e.status = 400; throw e; }
    next.serverPort = p;
  }
  if (patch.panelSSL !== undefined) next.panelSSL = bool(patch.panelSSL);
  if (patch.sslMode !== undefined) next.sslMode = patch.sslMode === 'acme' ? 'acme' : 'selfsigned';
  if (patch.sslCertFile !== undefined) next.sslCertFile = String(patch.sslCertFile).trim();
  if (patch.sslKeyFile !== undefined) next.sslKeyFile = String(patch.sslKeyFile).trim();
  if (patch.acmeEmail !== undefined) next.acmeEmail = String(patch.acmeEmail).trim().slice(0, 120);
  if (patch.acmeAutoRenew !== undefined) next.acmeAutoRenew = bool(patch.acmeAutoRenew);
  if (patch.acmeStaging !== undefined) next.acmeStaging = bool(patch.acmeStaging);

  if (patch.trustProxy !== undefined) next.trustProxy = bool(patch.trustProxy);
  if (patch.frpApiTimeout !== undefined) next.frpApiTimeout = Math.min(120000, Math.max(1000, Number(patch.frpApiTimeout) || DEFAULTS.frpApiTimeout));
  if (patch.require2fa !== undefined) next.require2fa = bool(patch.require2fa);
  if (patch.strongPassword !== undefined) next.strongPassword = bool(patch.strongPassword);
  if (patch.panelDomain !== undefined) next.panelDomain = normalizeDomain(patch.panelDomain);
  if (patch.securityEntrance !== undefined) next.securityEntrance = normalizeEntrance(patch.securityEntrance);

  if (patch.firewallEnabled !== undefined) next.firewallEnabled = bool(patch.firewallEnabled);
  if (patch.firewallApiEnabled !== undefined) next.firewallApiEnabled = bool(patch.firewallApiEnabled);
  if (patch.firewallMode !== undefined) next.firewallMode = patch.firewallMode === 'monitor' ? 'monitor' : 'block';
  if (patch.firewallSourceUrl !== undefined) {
    const u = String(patch.firewallSourceUrl).trim();
    if (u && !/^https?:\/\//i.test(u)) { const e = new Error('Firewall source URL phải bắt đầu bằng http(s)://'); e.status = 400; throw e; }
    next.firewallSourceUrl = u || DEFAULTS.firewallSourceUrl;
  }
  if (patch.firewallAutoUpdate !== undefined) next.firewallAutoUpdate = bool(patch.firewallAutoUpdate);

  if (next.panelSSL) {
    // Bật SSL bắt buộc có Server IP + Port (cert tự tạo gắn theo IP; panel có địa chỉ rõ ràng).
    if (!next.serverIP) { const e = new Error('Bật Panel SSL cần đặt Server IP.'); e.status = 400; throw e; }
    if (!next.serverPort) { const e = new Error('Bật Panel SSL cần đặt Server Port.'); e.status = 400; throw e; }
    const hasManual = next.sslCertFile && next.sslKeyFile;
    if (!hasManual && next.sslMode === 'acme') {
      if (!next.panelDomain) { const e = new Error('ACME (Let\'s Encrypt) cần Domain public.'); e.status = 400; throw e; }
      if (!next.acmeEmail) { const e = new Error('ACME cần Email đăng ký.'); e.status = 400; throw e; }
      if (isPrivateIP(next.serverIP)) { const e = new Error('IP LAN/nội bộ không lấy được cert Let\'s Encrypt. Hãy dùng self-signed hoặc IP public.'); e.status = 400; throw e; }
    }
  }
  return next;
}

/** Ghi settings xuống đĩa + cập nhật cache. */
export function commitSettings(next) {
  fs.writeFileSync(config.settingsFile, JSON.stringify(next, null, 2), 'utf8');
  cache = next;
  return next;
}

/** Validate + ghi (giữ tương thích cho các nơi gọi cũ). */
export function updateSettings(patch) {
  return commitSettings(previewSettings(patch));
}

/**
 * Cổng/SSL để lắng nghe. LUÔN bind mọi interface (host='') để localhost không bao giờ mất
 * (chống tự khóa). serverIP chỉ dùng làm IP quảng bá: SAN của cert, kiểm tra LAN cho ACME, URL.
 */
export function getListenConfig(s = getSettings()) {
  const base = { port: s.serverPort || config.port, host: '', advertiseIP: s.serverIP || '', ssl: Boolean(s.panelSSL) };
  if (!base.ssl) return { ...base, certFile: '', keyFile: '', needsAcme: false };
  const c = ssl.resolveCert(s);            // luôn có cert (self-signed nếu chưa có acme)
  return { ...base, certFile: c.certFile, keyFile: c.keyFile, needsAcme: c.needsAcme };
}
