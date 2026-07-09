import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import selfsigned from 'selfsigned';
import { config } from '../config.js';
import { isValidId } from '../utils/id.js';

/**
 * Cert Manager: tạo chứng chỉ self-signed (crt + key PEM) để tải về cấu hình cho
 * plugin https2http/https2https/tls2raw của frpc, hoặc Panel SSL thủ công.
 * Mỗi cert = data/certs/<uuid>/{cert.crt, key.key, meta.json}.
 */

const CERTS_DIR = path.join(config.dataDir, 'certs');
fs.mkdirSync(CERTS_DIR, { recursive: true });

function dirFor(id) {
  if (!isValidId(id)) { const e = new Error('ID không hợp lệ.'); e.status = 400; throw e; }
  return path.join(CERTS_DIR, id);
}

/** Tạo cert self-signed. altNames: mảng chuỗi (IP hoặc domain); tự phát hiện loại. */
export async function generateCert({ commonName, altNames, days }) {
  const cn = String(commonName || '').trim();
  if (!cn) { const e = new Error('Thiếu Common Name (domain hoặc IP).'); e.status = 400; throw e; }
  const d = Math.min(3650, Math.max(1, Number(days) || 825));

  // Danh sách SAN (luôn kèm CN), khử trùng lặp, phân biệt IP/DNS.
  const rawInput = Array.isArray(altNames) ? altNames : String(altNames || '').split(',');
  const raw = [cn, ...rawInput].map((s) => String(s).trim()).filter(Boolean);
  const seen = new Set();
  const sans = [];
  for (const v of raw) {
    if (seen.has(v)) continue;
    seen.add(v);
    sans.push(net.isIP(v) ? { type: 7, ip: v } : { type: 2, value: v });
  }

  const pems = await selfsigned.generate([{ name: 'commonName', value: cn }], {
    days: d, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: sans }],
  });

  const id = crypto.randomUUID();
  const dir = path.join(CERTS_DIR, id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'cert.crt'), pems.cert, 'utf8');
  await fsp.writeFile(path.join(dir, 'key.key'), pems.private, 'utf8');

  let expiresAt = null;
  try { expiresAt = new Date(new crypto.X509Certificate(pems.cert).validTo).toISOString(); } catch { /* ignore */ }
  const meta = { id, commonName: cn, altNames: [...seen], days: d, createdAt: new Date().toISOString(), expiresAt };
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export async function listCerts() {
  let ids = [];
  try { ids = await fsp.readdir(CERTS_DIR); } catch { return []; }
  const out = [];
  for (const id of ids) {
    try { out.push(JSON.parse(await fsp.readFile(path.join(CERTS_DIR, id, 'meta.json'), 'utf8'))); } catch { /* skip */ }
  }
  out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return out;
}

/** Nội dung file cert (kind = 'crt' | 'key'). null nếu không có. */
export async function getCertFile(id, kind) {
  const dir = dirFor(id);
  const file = kind === 'key' ? 'key.key' : 'cert.crt';
  try { return await fsp.readFile(path.join(dir, file), 'utf8'); }
  catch { return null; }
}

export async function deleteCert(id) {
  const dir = dirFor(id);
  try { await fsp.rm(dir, { recursive: true, force: true }); return true; }
  catch { return false; }
}
