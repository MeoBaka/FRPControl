import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * API Error Logs (AEL) — ghi nhận các request trả lỗi (status >= 400).
 * JSONL append-only tại data/ael/api-errors.jsonl, tự cắt bớt giữ MAX_LINES dòng gần nhất.
 */

const DIR = path.join(config.dataDir, 'ael');
fs.mkdirSync(DIR, { recursive: true });
const FILE = path.join(DIR, 'api-errors.jsonl');
const MAX_LINES = 5000;
let sinceTrim = 0;

function trim() {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) fs.writeFileSync(FILE, lines.slice(-MAX_LINES).join('\n') + '\n', 'utf8');
  } catch { /* ignore */ }
}

export function record(entry) {
  const line = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...entry };
  try { fs.appendFileSync(FILE, JSON.stringify(line) + '\n', 'utf8'); } catch { return line; }
  if (++sinceTrim >= 500) { sinceTrim = 0; trim(); }
  return line;
}

/** Truy vấn (mới nhất trước). filters: { method, status, username, q }. */
export async function query({ limit = 100, offset = 0, filters = {} } = {}) {
  let content = '';
  try { content = await fsp.readFile(FILE, 'utf8'); } catch { return { total: 0, items: [] }; }
  const lines = content.split('\n').filter(Boolean);
  const all = [];
  for (let i = lines.length - 1; i >= 0; i--) { try { all.push(JSON.parse(lines[i])); } catch { /* skip */ } }
  const f = filters;
  const filtered = all.filter((e) => {
    if (f.method && e.method !== f.method) return false;
    if (f.status && String(e.status) !== String(f.status)) return false;
    if (f.username && (e.username || '').toLowerCase() !== String(f.username).toLowerCase()) return false;
    if (f.q) {
      const hay = `${e.username} ${e.method} ${e.path} ${e.message || ''} ${e.code || ''} ${e.ip || ''}`.toLowerCase();
      if (!hay.includes(String(f.q).toLowerCase())) return false;
    }
    return true;
  });
  return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
}
