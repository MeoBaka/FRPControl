import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Nạp thủ công file .env (nếu có) vào process.env — tránh phụ thuộc thư viện dotenv.
 * Không ghi đè biến môi trường đã tồn tại.
 */
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const dataDir = path.resolve(ROOT, process.env.DATA_DIR || './data');

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  dataDir,
  instancesDir: path.join(dataDir, 'instances'),
  usersDir: path.join(dataDir, 'users'),
  rolesDir: path.join(dataDir, 'roles'),
  auditDir: path.join(dataDir, 'audit'),
  sessionsFile: path.join(dataDir, 'sessions.json'),
  settingsFile: path.join(dataDir, 'settings.json'),
  publicDir: path.join(ROOT, 'public'),
  secretKey: process.env.SECRET_KEY || '',
  frpApiTimeout: Number(process.env.FRP_API_TIMEOUT) || 8000,
  // Chỉ tin X-Forwarded-For khi ĐỨNG SAU proxy tin cậy (đặt TRUST_PROXY=1). Mặc định TẮT
  // để tránh giả mạo IP (vượt rate-limit brute-force / bơm log audit).
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  // JWT auth
  accessCookie: 'frpc_at',            // cookie chứa access token (JWT)
  refreshCookie: 'frpc_rt',           // cookie chứa refresh token (id phiên ở server)
  accessTokenSeconds: (Number(process.env.ACCESS_TOKEN_MINUTES) || 15) * 60,
};

// Đảm bảo các thư mục dữ liệu tồn tại
for (const d of [config.instancesDir, config.usersDir, config.rolesDir, config.auditDir]) {
  fs.mkdirSync(d, { recursive: true });
}

// Khóa ký JWT: ưu tiên SECRET_KEY; nếu không có thì tạo & lưu file để ổn định qua restart.
function resolveJwtSecret() {
  if (config.secretKey) return crypto.createHash('sha256').update(config.secretKey + ':jwt').digest('hex');
  const f = path.join(dataDir, '.jwt-secret');
  try { const s = fs.readFileSync(f, 'utf8').trim(); if (s) return s; } catch { /* create below */ }
  const s = crypto.randomBytes(48).toString('hex');
  try { fs.writeFileSync(f, s, 'utf8'); } catch { /* ignore */ }
  return s;
}
config.jwtSecret = resolveJwtSecret();

// Khóa mã hóa mật khẩu at-rest (AES-256-GCM) — LUÔN có (không còn fallback base64).
// Ưu tiên SECRET_KEY (sha256 -> 32 byte, tương thích dữ liệu enc: cũ); nếu không, tạo & lưu
// khóa ngẫu nhiên bền vững ở data/.enc-secret.
function resolveEncKey() {
  if (config.secretKey) return { key: crypto.createHash('sha256').update(config.secretKey, 'utf8').digest(), source: 'secret' };
  const f = path.join(dataDir, '.enc-secret');
  try { const hex = fs.readFileSync(f, 'utf8').trim(); if (/^[0-9a-f]{64}$/i.test(hex)) return { key: Buffer.from(hex, 'hex'), source: 'file' }; } catch { /* tạo mới bên dưới */ }
  const key = crypto.randomBytes(32);
  try { fs.writeFileSync(f, key.toString('hex'), 'utf8'); } catch { /* ignore */ }
  return { key, source: 'file' };
}
const _enc = resolveEncKey();
config.encKey = _enc.key;
config.encKeySource = _enc.source; // 'secret' (từ SECRET_KEY) | 'file' (tự sinh)
