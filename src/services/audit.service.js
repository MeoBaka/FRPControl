import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Audit log — ghi mọi thao tác của user. Lưu dạng JSONL append-only: data/audit/audit.jsonl
 */

const FILE = () => path.join(config.auditDir, 'audit.jsonl');

export function record(entry) {
  const line = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...entry,
  };
  try { fs.appendFileSync(FILE(), JSON.stringify(line) + '\n', 'utf8'); } catch { /* ignore */ }
  return line;
}

/**
 * Truy vấn log (mới nhất trước). filters: { username, action, method, status, q, from, to }
 * Trả về { total, items } đã phân trang.
 */
export async function query({ limit = 50, offset = 0, filters = {} } = {}) {
  let content = '';
  try { content = await fsp.readFile(FILE(), 'utf8'); } catch { return { total: 0, items: [] }; }
  const lines = content.split('\n').filter(Boolean);
  const all = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    try { all.push(JSON.parse(lines[i])); } catch { /* skip */ }
  }
  const f = filters;
  const filtered = all.filter((e) => {
    if (f.username && (e.username || '').toLowerCase() !== String(f.username).toLowerCase()) return false;
    if (f.action && e.action !== f.action) return false;
    if (f.method && e.method !== f.method) return false;
    if (f.status && String(e.status) !== String(f.status)) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.q) {
      const hay = `${e.username} ${e.action} ${e.path} ${e.detail || ''} ${e.ip || ''}`.toLowerCase();
      if (!hay.includes(String(f.q).toLowerCase())) return false;
    }
    return true;
  });
  return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
}

/** Danh sách action distinct (cho bộ lọc). */
export async function distinctActions() {
  let content = '';
  try { content = await fsp.readFile(FILE(), 'utf8'); } catch { return []; }
  const set = new Set();
  for (const l of content.split('\n')) {
    if (!l) continue;
    try { const e = JSON.parse(l); if (e.action) set.add(e.action); } catch { /* skip */ }
  }
  return [...set].sort();
}
