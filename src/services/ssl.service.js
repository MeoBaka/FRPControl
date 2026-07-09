import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import selfsigned from 'selfsigned';
import acme from 'acme-client';
import { config } from '../config.js';

/**
 * Cấp/chứng thực SSL cho panel:
 *  - self-signed: tự tạo từ IP/domain (chạy mọi nơi, trình duyệt cảnh báo not-trusted).
 *  - acme: Let's Encrypt qua HTTP-01 (cần domain public + port 80 reachable).
 * Cert tự cấp lưu ở data/ssl/.
 */

const SSL_DIR = path.join(config.dataDir, 'ssl');
const SELF_CERT = path.join(SSL_DIR, 'selfsigned-cert.pem');
const SELF_KEY = path.join(SSL_DIR, 'selfsigned-key.pem');
const SELF_META = path.join(SSL_DIR, 'selfsigned.meta');
const ACME_CERT = path.join(SSL_DIR, 'acme-cert.pem');
const ACME_KEY = path.join(SSL_DIR, 'acme-key.pem');
const ACME_ACCOUNT = path.join(SSL_DIR, 'acme-account.pem');

function ensureDir() { fs.mkdirSync(SSL_DIR, { recursive: true }); }

// ---------------- Thông tin cert ----------------
export function certExpiry(certFile) {
  try { return new Date(new crypto.X509Certificate(fs.readFileSync(certFile)).validTo); }
  catch { return null; }
}
export function certUsable(certFile, keyFile, bufferDays = 0) {
  try { if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return false; } catch { return false; }
  const exp = certExpiry(certFile);
  return Boolean(exp) && exp.getTime() > Date.now() + bufferDays * 86400000;
}

// ---------------- Self-signed ----------------
// selfsigned v5: generate() là ASYNC (trả Promise -> {private, public, cert}).
async function generateSelfSigned({ ip, domain }) {
  ensureDir();
  const cn = domain || ip || 'localhost';
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];
  if (domain) altNames.unshift({ type: 2, value: domain });
  if (ip) altNames.push({ type: 7, ip });
  const pems = await selfsigned.generate([{ name: 'commonName', value: cn }], {
    days: 825, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  fs.writeFileSync(SELF_CERT, pems.cert);
  fs.writeFileSync(SELF_KEY, pems.private);
  return { certFile: SELF_CERT, keyFile: SELF_KEY };
}
async function ensureSelfSigned(settings) {
  const want = JSON.stringify({ ip: settings.serverIP || '', domain: settings.panelDomain || '' });
  let have = null; try { have = fs.readFileSync(SELF_META, 'utf8'); } catch { /* none */ }
  if (have === want && certUsable(SELF_CERT, SELF_KEY, 1)) return { certFile: SELF_CERT, keyFile: SELF_KEY };
  const r = await generateSelfSigned({ ip: settings.serverIP, domain: settings.panelDomain });
  ensureDir(); fs.writeFileSync(SELF_META, want);
  return r;
}

/**
 * Đảm bảo cert đã sẵn sàng trên đĩa TRƯỚC khi lắng nghe (bất đồng bộ vì tạo self-signed là async).
 * Gọi trước getListenConfig/binding ở mọi nhánh có SSL.
 */
export async function ensureCertReady(settings) {
  if (!settings.panelSSL) return;
  if (settings.sslCertFile && settings.sslKeyFile) return;        // dùng file thủ công
  if (settings.sslMode === 'acme' && certUsable(ACME_CERT, ACME_KEY, 0)) return; // đã có cert acme
  await ensureSelfSigned(settings);                               // self-signed (hoặc placeholder cho acme)
}

// ---------------- ACME (Let's Encrypt) ----------------
const challenges = new Map(); // token -> keyAuthorization (HTTP-01)
export function challengeResponse(token) { return challenges.get(token) || null; }

async function loadOrCreateAccountKey() {
  ensureDir();
  try { const k = fs.readFileSync(ACME_ACCOUNT); if (k && k.length) return k; } catch { /* create */ }
  const key = await acme.crypto.createPrivateKey();
  fs.writeFileSync(ACME_ACCOUNT, key);
  return key;
}

/** Xin/gia hạn cert ACME cho domain. Ghi acme-cert.pem/acme-key.pem. Ném lỗi nếu thất bại. */
export async function obtainAcmeCert(settings) {
  const domain = String(settings.panelDomain || '').trim();
  if (!domain) { const e = new Error('ACME cần Domain (panelDomain).'); e.status = 400; throw e; }
  ensureDir();
  const accountKey = await loadOrCreateAccountKey();
  const client = new acme.Client({
    directoryUrl: settings.acmeStaging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey,
  });
  const [certKey, csr] = await acme.crypto.createCsr({ commonName: domain });
  const cert = await client.auto({
    csr,
    email: String(settings.acmeEmail || '').trim() || undefined,
    termsOfServiceAgreed: true,
    challengePriority: ['http-01'],
    challengeCreateFn: async (authz, challenge, keyAuthorization) => { challenges.set(challenge.token, keyAuthorization); },
    challengeRemoveFn: async (authz, challenge) => { challenges.delete(challenge.token); },
  });
  fs.writeFileSync(ACME_CERT, cert);
  fs.writeFileSync(ACME_KEY, certKey);
  return { certFile: ACME_CERT, keyFile: ACME_KEY };
}

/** Có cần xin cert ACME (chưa có / gần hết hạn) không? */
export function acmeNeedsIssue(settings) {
  if (settings.sslMode !== 'acme') return false;
  return !certUsable(ACME_CERT, ACME_KEY, 30);
}

// ---------------- Giải quyết cert để lắng nghe ----------------
/**
 * Trả { certFile, keyFile, needsAcme }. Không bao giờ ném — luôn có cert để HTTPS lên được:
 *  - file thủ công nếu cấu hình,
 *  - acme nếu đã có cert hợp lệ (else tạm self-signed + needsAcme=true),
 *  - self-signed.
 */
export function resolveCert(settings) {
  if (settings.sslCertFile && settings.sslKeyFile) {
    return { certFile: settings.sslCertFile, keyFile: settings.sslKeyFile, needsAcme: false };
  }
  if (settings.sslMode === 'acme') {
    if (certUsable(ACME_CERT, ACME_KEY, 0)) {
      return { certFile: ACME_CERT, keyFile: ACME_KEY, needsAcme: acmeNeedsIssue(settings) };
    }
    return { certFile: SELF_CERT, keyFile: SELF_KEY, needsAcme: true }; // placeholder (ensureCertReady đã tạo)
  }
  return { certFile: SELF_CERT, keyFile: SELF_KEY, needsAcme: false };
}

/** Mô tả trạng thái cert cho UI. */
export function sslStatus(settings) {
  const mode = settings.sslCertFile && settings.sslKeyFile ? 'manual' : (settings.sslMode || 'selfsigned');
  const file = mode === 'acme' ? ACME_CERT : (mode === 'manual' ? settings.sslCertFile : SELF_CERT);
  return { mode, expiresAt: certExpiry(file), acmeReady: certUsable(ACME_CERT, ACME_KEY, 0) };
}
