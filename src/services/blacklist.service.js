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
import { getSettings, firewallSourceList } from './settings.service.js';
import { parseEntry, parseIp, hexToBig } from '../utils/ip.js';

export const DEFAULT_SOURCE_URL = 'https://raw.githubusercontent.com/bitwire-it/ipblocklist/main/inbound.txt';

const DIR = path.join(config.dataDir, 'blacklist');
const V4_BIN = path.join(DIR, 'ipv4-ranges.bin');
const V4_LAB = path.join(DIR, 'ipv4-labels.bin');   // Uint16 mỗi dải -> id nhãn (song song V4_BIN)
const LABELS_JSON = path.join(DIR, 'labels.json');  // từ điển nhãn: labels[id] = "botnet c2"
const V6_JSON = path.join(DIR, 'ipv6-ranges.json');
const META = path.join(DIR, 'meta.json');
const CUSTOM_FILE = path.join(DIR, 'custom.json'); // danh sách chặn thủ công (tách khỏi nguồn tải về)

const MAX_CUSTOM = 200000;       // trần chống lạm dụng qua API
const DEFAULT_BLOCK_DAYS = 14;   // mặc định cấm 14 ngày (0/permanent = vĩnh viễn)
const MAX_LABELS = 65536;        // id nhãn lưu bằng Uint16 -> trần 65536 nhãn khác nhau

// ----- State trong RAM (sau khi load) -----
let v4 = new Uint32Array(0); // [lo,hi, lo,hi, ...] đã sắp xếp theo lo
let v4lab = new Uint16Array(0); // id nhãn của dải thứ i (song song v4)
let v6lo = [];               // BigInt[]
let v6hi = [];               // BigInt[]
let v6lab = [];              // id nhãn của dải v6 thứ i
let labels = [''];           // từ điển nhãn; id 0 = không nhãn
let meta = null;
let loaded = false;
let building = false;

// ----- Custom block (thủ công / qua API) -----
// customList = nguồn sự thật để lưu + liệt kê. Các index bên dưới để tra cứu nhanh.
let customList = [];             // [{ input, v, lo?, hi?, loHex?, hiHex?, reason, addedAt, addedBy, expiresAt(ms|null) }]
let cExactV4 = new Map();        // int -> expiresAt
let cExactV6 = new Map();        // hex -> expiresAt
let cRanges = [];                // { v, lo, hi, expiresAt } (lo/hi: number cho v4, BigInt cho v6)

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
 * Đọc 1 file text nguồn -> ghi nhị phân đã gộp dải vào DIR. Trả meta.
 * (Bọc buildFromFiles để giữ tương thích nơi gọi cũ.)
 */
export function buildFromFile(srcPath) {
  return buildFromFiles([srcPath]);
}

/**
 * Đọc NHIỀU file text nguồn -> GỘP tất cả -> ghi nhị phân đã sắp xếp + gộp dải vào DIR. Trả meta.
 * Nhiều list VPN/abuse chồng lấn nhau rất nhiều; bước sort+merge khử trùng nên gộp N nguồn vẫn
 * cho ra tập dải tối giản, tra cứu y hệt tốc độ 1 nguồn.
 * @param {string[]} srcPaths
 * @param {object} [extraMeta] thông tin nguồn để ghi kèm meta (sources, sourcesFailed).
 */
export async function buildFromFiles(srcPaths, extraMeta = {}) {
  const t0 = Date.now();
  fs.mkdirSync(DIR, { recursive: true });

  // Từ điển nhãn: chuỗi -> id (Uint16). id 0 = không nhãn.
  const dict = [''];
  const dictIds = new Map([['', 0]]);
  const labelId = (s) => {
    if (!s) return 0;
    let id = dictIds.get(s);
    if (id === undefined) {
      if (dict.length >= MAX_LABELS) return 0; // vượt trần -> coi như không nhãn
      id = dict.length;
      dict.push(s);
      dictIds.set(s, id);
    }
    return id;
  };

  // v4: sort nhanh bằng BigUint64Array (lo<<32)|idx — idx trỏ sang hiArr/labArr để nhãn đi kèm.
  // (Không pack hi vào u64 nữa vì cần chỗ cho idx; sort theo lo là đủ cho bước merge.)
  let packed = new BigUint64Array(1 << 22);
  let hiArr = new Uint32Array(1 << 22);
  let labArr = new Uint16Array(1 << 22);
  let plen = 0;
  const v6 = [];
  let invalid = 0;
  let total = 0;
  let sourceSize = 0;

  for (const srcPath of srcPaths) {
    try { sourceSize += fs.statSync(srcPath).size; } catch { /* ignore */ }
    const rl = readline.createInterface({
      input: fs.createReadStream(srcPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      total += 1;
      const e = parseEntry(line);
      if (!e) { invalid += 1; continue; }
      if (e.v === 4) {
        if (plen === packed.length) {
          const cap = packed.length * 2;
          const bigger = new BigUint64Array(cap); bigger.set(packed); packed = bigger;
          const bh = new Uint32Array(cap); bh.set(hiArr); hiArr = bh;
          const bl2 = new Uint16Array(cap); bl2.set(labArr); labArr = bl2;
        }
        hiArr[plen] = e.hi;
        labArr[plen] = labelId(e.label);
        packed[plen] = (BigInt(e.lo) << 32n) | BigInt(plen);
        plen += 1;
      } else {
        v6.push({ lo: e.lo, hi: e.hi, lab: labelId(e.label) });
      }
    }
  }

  // v4: sort + merge. Dải PHẢI rời nhau (lookup binary-search giả định vậy) nên:
  //   - chồng nhau  -> BẮT BUỘC gộp (giữ nhãn đầu tiên khác rỗng)
  //   - kề nhau     -> chỉ gộp khi CÙNG nhãn, để không đánh mất lý do khác nhau
  const view = packed.subarray(0, plen);
  view.sort();
  const mLo = [];
  const mHi = [];
  const mLab = [];
  let covered = 0n;
  if (plen > 0) {
    const at = (i) => { const v = view[i]; const idx = Number(v & 0xffffffffn); return { lo: Number(v >> 32n), hi: hiArr[idx], lab: labArr[idx] }; };
    let cur = at(0);
    const flush = () => { mLo.push(cur.lo); mHi.push(cur.hi); mLab.push(cur.lab); covered += BigInt(cur.hi - cur.lo + 1); };
    for (let i = 1; i < plen; i++) {
      const r = at(i);
      const overlap = r.lo <= cur.hi;
      const adjacent = r.lo === cur.hi + 1;
      if (overlap || (adjacent && r.lab === cur.lab)) {
        if (r.hi > cur.hi) cur.hi = r.hi;
        if (!cur.lab && r.lab) cur.lab = r.lab;
      } else { flush(); cur = r; }
    }
    flush();
  }

  // v6: sort + merge (làm TRƯỚC khi ghi để guard xét cả v4 lẫn v6). Cùng quy tắc nhãn như v4.
  v6.sort((a, b) => (a.lo < b.lo ? -1 : a.lo > b.lo ? 1 : 0));
  const v6m = [];
  for (const iv of v6) {
    const last = v6m[v6m.length - 1];
    const overlap = last && iv.lo <= last.hi;
    const adjacent = last && iv.lo === last.hi + 1n;
    if (overlap || (adjacent && iv.lab === last.lab)) {
      if (iv.hi > last.hi) last.hi = iv.hi;
      if (!last.lab && iv.lab) last.lab = iv.lab;
    } else v6m.push({ lo: iv.lo, hi: iv.hi, lab: iv.lab });
  }
  let v6covered = 0n;
  for (const iv of v6m) v6covered += iv.hi - iv.lo + 1n;

  // AN TOÀN: nguồn lỗi (rỗng / trả HTML / rate-limit) -> 0 dải hợp lệ.
  // KHÔNG ghi đè file blacklist tốt đang có bằng file rỗng (tránh bypass firewall sau restart).
  if (mLo.length === 0 && v6m.length === 0) {
    const e = new Error(`Nguồn blacklist: ${total} dòng, ${invalid} không hợp lệ, 0 dải hợp lệ — BỎ QUA để giữ data cũ.`);
    e.status = 502;
    throw e;
  }

  const out = new Uint32Array(mLo.length * 2);
  for (let i = 0; i < mLo.length; i++) { out[i * 2] = mLo[i]; out[i * 2 + 1] = mHi[i]; }
  let buf = Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  if (!isLittleEndian()) { buf = Buffer.from(buf); buf.swap32(); }
  writeAtomic(V4_BIN, buf);

  // Nhãn v4 ghi thành file SONG SONG (không đụng format ipv4-ranges.bin -> bản cũ vẫn đọc được).
  const labOut = Uint16Array.from(mLab);
  let labBuf = Buffer.from(labOut.buffer, labOut.byteOffset, labOut.byteLength);
  if (!isLittleEndian()) { labBuf = Buffer.from(labBuf); labBuf.swap16(); }
  writeAtomic(V4_LAB, labBuf);
  writeAtomic(LABELS_JSON, JSON.stringify(dict));

  const toHex = (b) => b.toString(16).padStart(32, '0');
  writeAtomic(V6_JSON, JSON.stringify(v6m.map((iv) => [toHex(iv.lo), toHex(iv.hi), iv.lab])));

  const result = {
    ipv4Ranges: mLo.length,
    ipv6Ranges: v6m.length,
    ipv4AddressesCovered: covered.toString(),
    ipv6AddressesCovered: v6covered.toString(),
    rawEntries: total,
    invalidLines: invalid,
    labelCount: dict.length - 1, // trừ id 0 (không nhãn)
    sourceSize,
    sourceCount: srcPaths.length,
    sources: extraMeta.sources || null,
    sourcesFailed: extraMeta.sourcesFailed || [],
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

/**
 * Tải MỘT hoặc NHIỀU nguồn -> gộp -> build -> nạp lại vào RAM. Trả meta. Chống chạy song song.
 * Chịu lỗi từng nguồn: nguồn nào tải lỗi thì bỏ qua (ghi vào sourcesFailed) và vẫn build từ
 * các nguồn còn lại — chỉ ném lỗi khi KHÔNG nguồn nào tải được (giữ nguyên data cũ).
 * @param {string|string[]} urls
 */
export async function downloadAndBuild(urls = DEFAULT_SOURCE_URL) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u).trim()).filter(Boolean);
  if (!list.length) list.push(DEFAULT_SOURCE_URL);
  if (building) throw new Error('Đang build blacklist, thử lại sau.');
  building = true;
  const tmps = [];
  const failed = [];
  try {
    fs.mkdirSync(DIR, { recursive: true });
    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      const tmp = path.join(DIR, `source-${Date.now()}-${i}.tmp`);
      try {
        console.log(`[FRPControl] Firewall: tải nguồn (${i + 1}/${list.length}) ${url} …`);
        await downloadToFile(url, tmp);
        tmps.push(tmp);
      } catch (err) {
        failed.push({ url, error: err.message });
        console.error(`[FRPControl] Firewall: tải nguồn LỖI ${url} — ${err.message}`);
        try { await fsp.unlink(tmp); } catch { /* ignore */ }
      }
    }
    if (!tmps.length) throw new Error(`Không tải được nguồn blacklist nào (${failed.length}/${list.length} lỗi).`);
    const totalMB = (tmps.reduce((n, t) => n + fs.statSync(t).size, 0) / 1048576).toFixed(1);
    console.log(`[FRPControl] Firewall: tải xong ${tmps.length}/${list.length} nguồn (${totalMB} MB), đang build nhị phân…`);
    const m = await buildFromFiles(tmps, { sources: list, sourcesFailed: failed });
    load();
    const failNote = failed.length ? ` (bỏ qua ${failed.length} nguồn lỗi)` : '';
    console.log(`[FRPControl] Firewall: build xong ${m.ipv4Ranges.toLocaleString()} dải IPv4 (${m.buildMs}ms) từ ${tmps.length} nguồn${failNote} — đã ghi ra đĩa + nạp RAM.`);
    return m;
  } finally {
    building = false;
    for (const t of tmps) { try { await fsp.unlink(t); } catch { /* ignore */ } }
  }
}

// ============================ LOAD ============================
/** Nạp file nhị phân CỤC BỘ vào RAM (zero-copy cho v4). Trả true nếu có dữ liệu. KHÔNG tải mạng. */
export function load() {
  try {
    if (!fs.existsSync(V4_BIN)) {
      loaded = false;
      console.warn(`[FRPControl] Firewall: KHÔNG thấy file blacklist "${V4_BIN}" — chưa build/tải. Data dir: ${config.dataDir}. Bấm "Cập nhật blacklist ngay" hoặc chờ 00:00.`);
      return false;
    }
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
    v6lab = v6raw.map((r) => r[2] || 0); // build cũ chỉ có 2 phần tử -> không nhãn
    // Nhãn (file mới). Build cũ chưa có -> mảng rỗng, reason trả về '' (vẫn chặn đúng).
    labels = fs.existsSync(LABELS_JSON) ? JSON.parse(fs.readFileSync(LABELS_JSON, 'utf8')) : [''];
    if (!Array.isArray(labels) || !labels.length) labels = [''];
    if (fs.existsSync(V4_LAB)) {
      const lb = fs.readFileSync(V4_LAB);
      const src = lb.byteOffset % 2 === 0 ? lb : Buffer.from(lb);
      v4lab = new Uint16Array(src.buffer, src.byteOffset, src.byteLength >>> 1);
    } else {
      v4lab = new Uint16Array(0);
    }
    meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : null;
    const ranges = v4.length >>> 1;
    loaded = ranges > 0;
    if (!loaded) {
      console.warn(`[FRPControl] Firewall: file blacklist "${V4_BIN}" RỖNG (0 dải) — coi như chưa có data.`);
    } else {
      console.log(`[FRPControl] Firewall: nạp ${ranges.toLocaleString()} dải IPv4 + ${v6lo.length} dải IPv6 từ file cục bộ (${(buf.length / 1048576).toFixed(1)} MB).`);
    }
    return loaded;
  } catch (err) {
    loaded = false;
    console.error(`[FRPControl] Firewall: LỖI nạp blacklist từ "${V4_BIN}": ${err.message}`);
    return false;
  }
}

// ============================ LOOKUP ============================
/** Chỉ số dải v4 chứa n, -1 nếu không có. (Trả index để lấy được nhãn kèm theo.) */
function findV4(n) {
  let lo = 0;
  let hi = (v4.length >>> 1) - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (v4[mid * 2] <= n) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && n <= v4[ans * 2 + 1] ? ans : -1;
}
/** Chỉ số dải v6 chứa big, -1 nếu không có. */
function findV6(big) {
  let lo = 0;
  let hi = v6lo.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (v6lo[mid] <= big) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && big <= v6hi[ans] ? ans : -1;
}
/** Nhãn của dải theo id (an toàn với build cũ chưa có file nhãn). */
const labelAt = (id) => (id > 0 && id < labels.length ? labels[id] : '');

const nowMs = () => Date.now();
const stillActive = (exp) => exp === null || exp > nowMs();

/** Custom block chứa IP đã parse -> trả BẢN GHI khớp (để lấy reason), null nếu không (tôn trọng hết hạn). */
function inCustom(p) {
  if (p.v === 4) {
    const hit = cExactV4.get(p.n);
    if (hit && stillActive(hit.expiresAt)) return hit;
  } else {
    const hit = cExactV6.get(p.hex);
    if (hit && stillActive(hit.expiresAt)) return hit;
  }
  if (cRanges.length) {
    const big = p.v === 6 ? hexToBig(p.hex) : 0;
    for (const r of cRanges) {
      if (!stillActive(r.expiresAt)) continue;
      if (r.v === 4 && p.v === 4) { if (p.n >= r.lo && p.n <= r.hi) return r.rec; }
      else if (r.v === 6 && p.v === 6) { if (big >= r.lo && big <= r.hi) return r.rec; }
    }
  }
  return null;
}

/**
 * Tra cứu đầy đủ 1 IP -> { blacklisted, reason, source }.
 *   source: 'custom' (chặn thủ công/API) | 'list' (blacklist tải về) | '' (sạch)
 *   reason: lý do đã nhập (custom) HOẶC nhãn cuối dòng trong list nguồn; '' nếu không có.
 */
export function lookup(ipStr) {
  const miss = { blacklisted: false, reason: '', source: '' };
  const p = parseIp(ipStr);
  if (!p) return miss;
  const c = inCustom(p);
  if (c) return { blacklisted: true, reason: c.reason || '', source: 'custom' };
  if (!loaded) return miss;
  if (p.v === 4) {
    const i = findV4(p.n);
    if (i >= 0) return { blacklisted: true, reason: labelAt(v4lab[i] || 0), source: 'list' };
  } else {
    const i = findV6(hexToBig(p.hex));
    if (i >= 0) return { blacklisted: true, reason: labelAt(v6lab[i] || 0), source: 'list' };
  }
  return miss;
}

/** IP (chuỗi) có bị chặn không: custom block (thủ công/API) HOẶC blacklist tải về. */
export function isBlacklisted(ipStr) {
  return lookup(ipStr).blacklisted;
}

export function isLoaded() { return loaded; }
export function getMeta() { return meta; }

// ============================ CUSTOM BLOCK (thủ công / API) ============================
function persistCustom() {
  fs.mkdirSync(DIR, { recursive: true });
  writeAtomic(CUSTOM_FILE, JSON.stringify(customList));
}
function rebuildCustomIndex() {
  // Index trỏ thẳng tới BẢN GHI để lookup lấy được `reason` kèm theo.
  cExactV4 = new Map();
  cExactV6 = new Map();
  cRanges = [];
  for (const e of customList) {
    if (e.v === 4) {
      if (e.lo === e.hi) cExactV4.set(e.lo, e);
      else cRanges.push({ v: 4, lo: e.lo, hi: e.hi, expiresAt: e.expiresAt, rec: e });
    } else {
      const lo = BigInt('0x' + e.loHex);
      const hi = BigInt('0x' + e.hiHex);
      if (lo === hi) cExactV6.set(e.loHex, e);
      else cRanges.push({ v: 6, lo, hi, expiresAt: e.expiresAt, rec: e });
    }
  }
}
export function loadCustom() {
  try { customList = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8')); }
  catch { customList = []; }
  if (!Array.isArray(customList)) customList = [];
  rebuildCustomIndex();
}

/**
 * Thêm IP/CIDR vào danh sách chặn thủ công.
 * opts: { days=14, permanent=false, reason='', by='' }. permanent hoặc days<=0 -> vĩnh viễn.
 * Trả bản ghi (public). Ném lỗi nếu IP không hợp lệ / vượt trần.
 */
export function addCustom(input, opts = {}) {
  const e = parseEntry(input);
  if (!e) { const err = new Error('IP/CIDR không hợp lệ.'); err.status = 400; throw err; }
  const permanent = Boolean(opts.permanent);
  let days = Number(opts.days);
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_BLOCK_DAYS; // bỏ trống -> mặc định 14 ngày
  const expiresAt = permanent ? null : nowMs() + Math.min(days, 36500) * 86400000;
  const rec = {
    input: String(input).trim(),
    v: e.v,
    reason: String(opts.reason || '').slice(0, 200),
    addedAt: new Date().toISOString(),
    addedBy: String(opts.by || '').slice(0, 80),
    expiresAt,
  };
  if (e.v === 4) { rec.lo = e.lo; rec.hi = e.hi; }
  else { rec.loHex = e.lo.toString(16).padStart(32, '0'); rec.hiHex = e.hi.toString(16).padStart(32, '0'); }

  const existed = customList.some((x) => x.input === rec.input);
  customList = customList.filter((x) => x.input !== rec.input); // thay thế nếu trùng
  if (!existed && customList.length >= MAX_CUSTOM) {
    const err = new Error(`Danh sách chặn thủ công đã đạt trần ${MAX_CUSTOM.toLocaleString()}.`); err.status = 429; throw err;
  }
  customList.push(rec);
  rebuildCustomIndex();
  persistCustom();
  return publicCustom(rec);
}

/** Xóa 1 mục theo input gốc. Trả true nếu có xóa. */
export function removeCustom(input) {
  const key = String(input).trim();
  const before = customList.length;
  customList = customList.filter((x) => x.input !== key);
  if (customList.length === before) return false;
  rebuildCustomIndex();
  persistCustom();
  return true;
}

function publicCustom(e) {
  const now = nowMs();
  return {
    input: e.input, v: e.v, reason: e.reason || '', addedAt: e.addedAt, addedBy: e.addedBy || '',
    expiresAt: e.expiresAt, permanent: e.expiresAt === null,
    expired: e.expiresAt !== null && e.expiresAt <= now,
  };
}
export function listCustom() { return customList.map(publicCustom); }

/** Dọn các mục đã hết hạn (giải phóng bộ nhớ + gọn danh sách). */
export function cleanupCustom() {
  const now = nowMs();
  const before = customList.length;
  customList = customList.filter((e) => e.expiresAt === null || e.expiresAt > now);
  if (customList.length !== before) { rebuildCustomIndex(); persistCustom(); }
  return before - customList.length;
}
export function customActiveCount() {
  const now = nowMs();
  return customList.reduce((n, e) => n + (e.expiresAt === null || e.expiresAt > now ? 1 : 0), 0);
}

// Đếm số lần IP bị chặn/đánh dấu (từ lúc panel khởi động) — hiển thị ở UI.
let hits = 0;
export function recordHit() { hits += 1; }
export function getHits() { return hits; }

// ============================ SCHEDULER ============================
let dailyTimer = null;
let lastError = null;

/** Tải + build (nền) và ghi log; nuốt lỗi để không làm sập panel. */
export function refresh(reason = 'manual') {
  const urls = firewallSourceList();
  console.log(`[FRPControl] Firewall: đang cập nhật blacklist từ ${urls.length} nguồn (${reason})…`);
  return downloadAndBuild(urls)
    .then((m) => { lastError = null; console.log(`[FRPControl] Firewall: xong — ${m.ipv4Ranges.toLocaleString()} dải IPv4, phủ ${Number(m.ipv4AddressesCovered).toLocaleString()} IP.`); return m; })
    .catch((err) => { lastError = err.message; console.error(`[FRPControl] Firewall: cập nhật lỗi — ${err.message}`); throw err; });
}

/** Subsystem "đang cần blacklist": khi CHẶN panel HOẶC API công khai được bật. */
function subsystemActive() {
  const s = getSettings();
  return s.firewallEnabled || s.firewallApiEnabled;
}

/** Nạp dữ liệu sẵn có lúc khởi động + lên lịch build mỗi ngày 00:00. Tải ngay nếu cần mà chưa có data. */
export function startScheduler() {
  const ok = load();          // CHỈ nạp file cục bộ (tự log kết quả) — KHÔNG tải mạng lúc start.
  loadCustom();
  cleanupCustom();
  scheduleNextDaily();        // tự tải lại vào giờ đã cấu hình hàng ngày
  // Dọn custom hết hạn mỗi giờ.
  const t = setInterval(() => cleanupCustom(), 3600 * 1000);
  t.unref?.();

  const s = getSettings();
  console.log(`[FRPControl] Firewall: chặn panel ${s.firewallEnabled ? 'BẬT' : 'tắt'} · API ${s.firewallApiEnabled ? 'bật' : 'tắt'} · tự cập nhật ${s.firewallAutoUpdate ? `${updateTime()} hàng ngày` : 'tắt'} · custom ${customList.length} mục.`);
  if (s.firewallEnabled && !ok) {
    console.warn(`[FRPControl] ⚠ Firewall ĐANG BẬT nhưng chưa có blacklist -> mọi IP được cho qua. Bấm "Cập nhật blacklist ngay" hoặc chờ ${updateTime()}.`);
  }
}

/** Gọi sau khi đổi settings: nếu vừa bật firewall/API mà chưa có data thì tải nền ngay. */
export function ensureData() {
  if (subsystemActive() && getSettings().firewallAutoUpdate && !loaded && !building) {
    refresh('vừa bật firewall/API').catch(() => {});
  }
}

/** Đặt lại lịch tự cập nhật (gọi sau khi đổi settings để giờ mới có hiệu lực ngay). */
export function rescheduleAutoUpdate() {
  scheduleNextDaily();
}

/** Giờ tự cập nhật (HH:MM) đã cấu hình, mặc định 00:00 nếu sai định dạng. */
function updateTime() {
  const t = String(getSettings().firewallUpdateTime || '00:00');
  return /^\d{2}:\d{2}$/.test(t) ? t : '00:00';
}

function scheduleNextDaily() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const [hh, mm] = updateTime().split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1); // đã qua giờ hôm nay -> ngày mai
  const ms = next.getTime() - now.getTime();
  dailyTimer = setTimeout(() => {
    if (subsystemActive() && getSettings().firewallAutoUpdate) refresh(`lịch ${updateTime()} hàng ngày`).catch(() => {});
    scheduleNextDaily(); // tự đặt lại cho ngày kế (tránh trôi giờ/DST)
  }, ms);
  dailyTimer.unref?.();
}
export function stats() {
  // ipv4Ranges/ipv6Ranges lấy từ MẢNG THỰC trong RAM (đúng cái lookup dùng) — không phụ thuộc meta.json.
  const ipv4Ranges = v4.length >>> 1;
  const ipv6Ranges = v6lo.length;
  return {
    loaded: loaded && ipv4Ranges > 0, // có data thực mới coi là loaded (tránh báo nhầm khi file rỗng)
    building,
    ipv4Ranges,
    ipv6Ranges,
    ipv4AddressesCovered: meta?.ipv4AddressesCovered ?? '0',
    ipv6AddressesCovered: meta?.ipv6AddressesCovered ?? '0',
    builtAt: meta?.builtAt ?? null,
    rawEntries: meta?.rawEntries ?? 0,
    memoryBytes: v4.byteLength + v6lo.length * 32,
    hits,
    customCount: customActiveCount(),
    lastError,
    sourceUrl: firewallSourceList()[0] || '',   // (cũ) nguồn đầu — giữ tương thích UI cũ
    labelCount: meta?.labelCount ?? 0,           // số nhãn (reason) khác nhau lấy từ list nguồn
    updateTime: updateTime(),                    // giờ tự cập nhật hàng ngày (HH:MM)
    sources: firewallSourceList(),               // TẤT CẢ nguồn đang cấu hình
    builtSources: meta?.sources || null,         // nguồn của lần build gần nhất (đã ghi ra data)
    sourcesFailed: meta?.sourcesFailed || [],    // nguồn tải lỗi ở lần build gần nhất
    sourceCount: meta?.sourceCount ?? null,
  };
}
