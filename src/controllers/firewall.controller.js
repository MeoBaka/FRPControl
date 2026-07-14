import * as bl from '../services/blacklist.service.js';
import * as keys from '../services/firewallKeys.service.js';
import { getSettings } from '../services/settings.service.js';

const MAX_BATCH = 10000;

/** Thu thập danh sách IP cần check từ query (?ip=) hoặc body {ips:[]}. */
function collectIps(req) {
  const out = [];
  const q = req.query.ip;
  if (Array.isArray(q)) out.push(...q);
  else if (q) out.push(q);
  if (Array.isArray(req.body?.ips)) out.push(...req.body.ips);
  else if (req.body?.ip) out.push(req.body.ip);
  return out.map((x) => String(x).trim()).filter(Boolean);
}

/** Tra cứu (dùng chung panel + public). */
export function check(req, res) {
  const ips = collectIps(req);
  if (!ips.length) return res.status(400).json({ error: 'Thiếu IP. Dùng ?ip=1.2.3.4 hoặc body {"ips":["..."]}.' });
  if (ips.length > MAX_BATCH) return res.status(413).json({ error: `Tối đa ${MAX_BATCH} IP mỗi request.` });
  const results = ips.map((ip) => ({ ip, blacklisted: bl.isBlacklisted(ip) }));
  res.json({
    ready: bl.isLoaded(),
    count: results.length,
    blacklisted: results.filter((r) => r.blacklisted).length,
    results,
  });
}

// ---------------- Panel (session + quyền) ----------------
export function stats(req, res) {
  const s = getSettings();
  res.json({
    ...bl.stats(),
    enabled: s.firewallEnabled,
    mode: s.firewallMode,
    autoUpdate: s.firewallAutoUpdate,
    keyCount: keys.listKeys().length,
  });
}

export async function refresh(req, res) {
  try {
    const meta = await bl.refresh('thủ công (UI)');
    res.json({ ok: true, meta });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

export function listKeys(req, res) { res.json({ keys: keys.listKeys() }); }

export function createKey(req, res) {
  const created = keys.createKey(req.body?.name);
  req._auditDetail = `tạo API key firewall "${created.name}"`;
  res.status(201).json({ key: created }); // raw hiện 1 lần
}

export function deleteKey(req, res) {
  const ok = keys.deleteKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Không tìm thấy API key.' });
  res.json({ deleted: true });
}

// ---------------- Public API (xác thực bằng API key) ----------------
export function apiKeyAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const raw = req.get('x-api-key') || (req.query.key ? String(req.query.key) : '') || header.replace(/^Bearer\s+/i, '');
  const rec = keys.verifyKey(raw);
  if (!rec) return res.status(401).json({ error: 'API key không hợp lệ hoặc thiếu.' });
  req.fwKey = rec;
  next();
}

/** Thống kê rút gọn cho public (không lộ nội bộ). */
export function publicStats(req, res) {
  const st = bl.stats();
  res.json({
    ready: st.loaded,
    ipv4Ranges: st.ipv4Ranges,
    ipv6Ranges: st.ipv6Ranges,
    ipv4AddressesCovered: st.ipv4AddressesCovered,
    builtAt: st.builtAt,
  });
}
