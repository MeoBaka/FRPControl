/**
 * Blacklist / Firewall IP service.
 *
 * - Nguồn: 1 URL text (mỗi dòng IP đơn hoặc CIDR). Mặc định bitwire-it/ipblocklist.
 * - Build: parse -> dải [lo,hi] -> sắp xếp + gộp -> nhị phân (ipv4-ranges.bin + ipv6-ranges.json).
 * - Tra cứu: nạp zero-copy vào Uint32Array + binary search theo dải. ~sub-microsecond.
 * - Không chiếm port, không tiến trình phụ; chạy in-process trong panel.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import https from 'node:https';
import http from 'node:http';
import { config } from '../config.js';
import { getSettings } from './settings.service.js';
import { parseEntry, parseIp, hexToBig } from '../utils/ip.js';

export const DEFAULT_SOURCE_URL = 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/inbound.txt';

const DIR = path.join(config.dataDir, 'blacklist');
const V4_BIN = path.join(DIR, 'ipv4-ranges.bin');
const V6_JSON = path.join(DIR, 'ipv6-ranges.json');
const META = path.join(DIR, 'meta.json');

// ----- State trong RAM (sau khi load) -----
let v4 = new Uint32Array(0); // [lo,hi, lo,hi, ...] đã sắp xếp theo lo
let v6lo = [];               // BigInt[]
let v6hi = [];               // BigInt[]
let meta = null;
let loaded = false;
let building = false;

function isLittleEndian() {
  const b = new ArrayBuffer(2);
  new DataView(b).setUint16(0, 1, true);
  return new Uint8Array(b)[0] === 1;
}
function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// ============================ BUILD ============================
/**
 * Đọc file text nguồn -> ghi nhị phân đã gộp dải vào DIR. Trả meta.
 */
export async function buildFromFile(srcPath) {
  const t0 = Date.now();
  fs.mkdirSync(DIR, { recursive: true });

  let packed = new BigUint64Array(1 << 22); // (lo<<32)|hi cho v4
  let plen = 0;
  const v6 = [];
  let invalid = 0;
  let total = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(srcPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    total += 1;
    const e = parseEntry(line);
    if (!e) { invalid += 1; continue; }
    if (e.v === 4) {
      if (plen === packed.length) {
        const bigger = new BigUint64Array(packed.length * 2);
        bigger.set(packed);
        packed = bigger;
      }
      packed[plen++] = (BigInt(e.lo) << 32n) | BigInt(e.hi);
    } else {
      v6.push({ lo: e.lo, hi: e.hi });
    }
  }

  // v4: sort + merge (overlap hoặc kề nhau)
  const view = packed.subarray(0, plen);
  view.sort();
  const mLo = [];
  const mHi = [];
  let covered = 0n;
  if (plen > 0) {
    let curLo = Number(view[0] >> 32n);
    let curHi = Number(view[0] & 0xffffffffn);
    for (let i = 1; i < plen; i++) {
      const lo = Number(view[i] >> 32n);
      const hi = Number(view[i] & 0xffffffffn);
      if (lo <= curHi + 1) { if (hi > curHi) curHi = hi; }
      else { mLo.push(curLo); mHi.push(curHi); covered += BigInt(curHi - curLo + 1); curLo = lo; curHi = hi; }
    }
    mLo.push(curLo); mHi.push(curHi); covered += BigInt(curHi - curLo + 1);
  }
  const out = new Uint32Array(mLo.length * 2);
  for (let i = 0; i < mLo.length; i++) { out[i * 2] = mLo[i]; out[i * 2 + 1] = mHi[i]; }
  let buf = Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  if (!isLittleEndian()) { buf = Buffer.from(buf); buf.swap32(); }
  writeAtomic(V4_BIN, buf);

  // v6: sort + merge
  v6.sort((a, b) => (a.lo < b.lo ? -1 : a.lo > b.lo ? 1 : 0));
  const v6m = [];
  for (const iv of v6) {
    const last = v6m[v6m.length - 1];
    if (last && iv.lo <= last.hi + 1n) { if (iv.hi > last.hi) last.hi = iv.hi; }
    else v6m.push({ lo: iv.lo, hi: iv.hi });
  }
  const toHex = (b) => b.toString(16).padStart(32, '0');
  writeAtomic(V6_JSON, JSON.stringify(v6m.map((iv) => [toHex(iv.lo), toHex(iv.hi)])));

  const result = {
    ipv4Ranges: mLo.length,
    ipv6Ranges: v6m.length,
    ipv4AddressesCovered: covered.toString(),
    rawEntries: total,
    invalidLines: invalid,
    sourceSize: fs.statSync(srcPath).size,
    builtAt: new Date().toISOString(),
    buildMs: Date.now() - t0,
  };
  writeAtomic(META, JSON.stringify(result, null, 2));
  return result;
}

// ============================ DOWNLOAD ============================
/** Tải URL về file tmp (theo redirect). Trả path file tmp. */
function downloadToFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { timeout: 60000, headers: { 'User-Agent': 'FRPControl-Firewall' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Quá nhiều redirect.'));
        const next = new URL(res.headers.location, url).href;
        return resolve(downloadToFile(next, destPath, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} khi tải nguồn.`)); }
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve(destPath)));
      ws.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Hết thời gian chờ khi tải nguồn.')));
    req.on('error', reject);
  });
}

/** Tải nguồn từ URL -> build -> nạp lại vào RAM. Trả meta. Chống chạy song song. */
export async function downloadAndBuild(url = DEFAULT_SOURCE_URL) {
  if (building) throw new Error('Đang build blacklist, thử lại sau.');
  building = true;
  const tmp = path.join(DIR, `source-${Date.now()}.tmp`);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    await downloadToFile(url, tmp);
    const m = await buildFromFile(tmp);
    load();
    return m;
  } finally {
    building = false;
    try { await fsp.unlink(tmp); } catch { /* ignore */ }
  }
}

// ============================ LOAD ============================
/** Nạp file nhị phân vào RAM (zero-copy cho v4). Trả true nếu có dữ liệu. */
export function load() {
  try {
    if (!fs.existsSync(V4_BIN)) { loaded = false; return false; }
    const buf = fs.readFileSync(V4_BIN);
    // Uint32Array cần byteOffset chia hết 4. File lớn -> buffer riêng (offset 0), nhưng phòng xa.
    if (buf.byteOffset % 4 === 0) {
      v4 = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength >>> 2);
    } else {
      const copy = Buffer.from(buf);
      v4 = new Uint32Array(copy.buffer, copy.byteOffset, copy.byteLength >>> 2);
    }
    const v6raw = fs.existsSync(V6_JSON) ? JSON.parse(fs.readFileSync(V6_JSON, 'utf8')) : [];
    v6lo = v6raw.map(([lo]) => hexToBig(lo));
    v6hi = v6raw.map(([, hi]) => hexToBig(hi));
    meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : null;
    loaded = true;
    return true;
  } catch (err) {
    loaded = false;
    return false;
  }
}

// ============================ LOOKUP ============================
function inV4(n) {
  let lo = 0;
  let hi = (v4.length >>> 1) - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (v4[mid * 2] <= n) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && n <= v4[ans * 2 + 1];
}
function inV6(big) {
  let lo = 0;
  let hi = v6lo.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (v6lo[mid] <= big) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && big <= v6hi[ans];
}

/** IP (chuỗi) có nằm trong blacklist không. IP không hợp lệ -> false. */
export function isBlacklisted(ipStr) {
  if (!loaded) return false;
  const p = parseIp(ipStr);
  if (!p) return false;
  return p.v === 4 ? inV4(p.n) : inV6(hexToBig(p.hex));
}

export function isLoaded() { return loaded; }
export function getMeta() { return meta; }

// Đếm số lần IP bị chặn/đánh dấu (từ lúc panel khởi động) — hiển thị ở UI.
let hits = 0;
export function recordHit() { hits += 1; }
export function getHits() { return hits; }

// ============================ SCHEDULER ============================
let dailyTimer = null;
let lastError = null;

/** Tải + build (nền) và ghi log; nuốt lỗi để không làm sập panel. */
export function refresh(reason = 'manual') {
  const url = getSettings().firewallSourceUrl;
  console.log(`[FRPControl] Firewall: đang cập nhật blacklist (${reason})…`);
  return downloadAndBuild(url)
    .then((m) => { lastError = null; console.log(`[FRPControl] Firewall: xong — ${m.ipv4Ranges.toLocaleString()} dải IPv4, phủ ${Number(m.ipv4AddressesCovered).toLocaleString()} IP.`); return m; })
    .catch((err) => { lastError = err.message; console.error(`[FRPControl] Firewall: cập nhật lỗi — ${err.message}`); throw err; });
}

/** Nạp dữ liệu sẵn có lúc khởi động + lên lịch build mỗi ngày 00:00. Tải ngay nếu bật mà chưa có data. */
export function startScheduler() {
  load();
  scheduleNextMidnight();
  const s = getSettings();
  if (s.firewallEnabled && s.firewallAutoUpdate && !loaded) {
    refresh('khởi tạo lần đầu').catch(() => {});
  }
}

function scheduleNextMidnight() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // 00:00 ngày kế tiếp (giờ máy chủ)
  const ms = next.getTime() - now.getTime();
  dailyTimer = setTimeout(() => {
    if (getSettings().firewallAutoUpdate) refresh('lịch 00:00 hàng ngày').catch(() => {});
    scheduleNextMidnight(); // tự đặt lại cho ngày kế (tránh trôi giờ/DST)
  }, ms);
  dailyTimer.unref?.();
}
export function stats() {
  return {
    loaded,
    building,
    ipv4Ranges: meta?.ipv4Ranges ?? 0,
    ipv6Ranges: meta?.ipv6Ranges ?? 0,
    ipv4AddressesCovered: meta?.ipv4AddressesCovered ?? '0',
    builtAt: meta?.builtAt ?? null,
    rawEntries: meta?.rawEntries ?? 0,
    memoryBytes: v4.byteLength + v6lo.length * 32,
    hits,
    lastError,
    sourceUrl: getSettings().firewallSourceUrl,
  };
}
