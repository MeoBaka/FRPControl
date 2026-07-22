/**
 * Parse/chuẩn hóa IP — DÙNG CHUNG cho cả script build và runtime tra cứu.
 * Bắt buộc dùng chung để chuẩn hóa lúc build và lúc tra cứu KHÔNG BAO GIỜ lệch nhau
 * (lệch = tra cứu miss dù IP có trong danh sách).
 */

/** "1.2.3.4" -> 16909060 (uint32). Trả null nếu không hợp lệ. */
export function ipv4ToInt(s) {
  const parts = String(s).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** 16909060 -> "1.2.3.4" (dùng để hiển thị lại). */
export function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * IPv6 -> chuỗi hex 32 ký tự (dạng chuẩn hóa duy nhất, so sánh bằng ===).
 * Xử lý "::" nén, IPv4 nhúng ("::ffff:1.2.3.4"), zone id ("%eth0"), ngoặc "[...]".
 * Trả null nếu không hợp lệ.
 */
export function ipv6ToHex(s) {
  let str = String(s).trim().toLowerCase();
  if (str.startsWith('[') && str.endsWith(']')) str = str.slice(1, -1);
  const z = str.indexOf('%'); // bỏ zone id
  if (z !== -1) str = str.slice(0, z);
  if (!str.includes(':')) return null;

  const dbl = str.indexOf('::');
  if (dbl !== str.lastIndexOf('::')) return null; // "::" chỉ được xuất hiện 1 lần

  // Mỗi nhóm -> 1 số 16-bit; nhóm chứa "." là IPv4 nhúng -> 2 số 16-bit.
  const expand = (groups) => {
    const out = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.includes('.')) {
        if (i !== groups.length - 1) return null; // IPv4 nhúng chỉ được ở cuối
        const v4 = ipv4ToInt(g);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };

  let head;
  let tail;
  if (dbl === -1) {
    head = expand(str.split(':'));
    tail = [];
    if (head === null || head.length !== 8) return null;
  } else {
    const l = str.slice(0, dbl);
    const r = str.slice(dbl + 2);
    head = expand(l ? l.split(':') : []);
    tail = expand(r ? r.split(':') : []);
    if (head === null || tail === null) return null;
    const missing = 8 - (head.length + tail.length);
    if (missing < 1) return null; // "::" phải thay ÍT NHẤT 1 nhóm
    head = [...head, ...new Array(missing).fill(0), ...tail];
    tail = [];
    if (head.length !== 8) return null;
  }

  return head.map((x) => x.toString(16).padStart(4, '0')).join('');
}

/** hex 32 ký tự -> BigInt (u128). */
export function hexToBig(hex) {
  return BigInt('0x' + hex);
}

/**
 * Parse 1 DÒNG blocklist -> DẢI địa chỉ (interval, bao gồm 2 đầu) + NHÃN (lý do).
 * Chấp nhận: IP đơn ("1.2.3.4", "2a14::1") HOẶC CIDR ("1.19.0.0/16", "2a03::/32").
 *
 * Phần sau địa chỉ là NHÃN/lý do, có hoặc không có ký tự comment:
 *   "2.56.189.17 # nordvpn"   -> label "nordvpn"
 *   "45.8.146.0/24 botnet c2" -> label "botnet c2"
 *   "10.0.0.1#x"              -> label "x"
 *   "1.2.3.4"                 -> label ""
 * Dòng bắt đầu bằng '#' hoặc ';' là comment thuần -> null.
 *
 * Trả:
 *   { v: 4, lo, hi, label }     (lo/hi là uint32)
 *   { v: 6, lo, hi, label }     (lo/hi là BigInt u128)
 *   null nếu không hợp lệ.
 */
export function parseEntry(line) {
  const raw = String(line).trim();
  if (!raw || raw.startsWith('#') || raw.startsWith(';')) return null;
  // Token đầu = IP/CIDR (dừng ở khoảng trắng hoặc '#'/';'), phần còn lại = nhãn.
  const m = /^([^\s#;]+)\s*[#;]?\s*(.*)$/.exec(raw);
  if (!m) return null;
  const s = m[1];
  const label = m[2].trim();
  const slash = s.indexOf('/');
  const addr = slash === -1 ? s : s.slice(0, slash);
  const prefix = slash === -1 ? null : s.slice(slash + 1);

  if (addr.includes(':')) {
    const hex = ipv6ToHex(addr);
    if (!hex) return null;
    const base = hexToBig(hex);
    if (prefix === null) return { v: 6, lo: base, hi: base, label };
    if (!/^\d{1,3}$/.test(prefix)) return null;
    const p = Number(prefix);
    if (p > 128) return null;
    const hostBits = 128n - BigInt(p);
    const lo = hostBits === 128n ? 0n : (base >> hostBits) << hostBits;
    const hi = lo | ((1n << hostBits) - 1n);
    return { v: 6, lo, hi, label };
  }

  const n = ipv4ToInt(addr);
  if (n === null) return null;
  if (prefix === null) return { v: 4, lo: n, hi: n, label };
  if (!/^\d{1,2}$/.test(prefix)) return null;
  const p = Number(prefix);
  if (p > 32) return null;
  if (p === 0) return { v: 4, lo: 0, hi: 0xffffffff, label };
  const mask = (0xffffffff << (32 - p)) >>> 0; // p in 1..32
  const lo = (n & mask) >>> 0;
  const hi = (lo | (~mask >>> 0)) >>> 0;
  return { v: 4, lo, hi, label };
}

/**
 * Parse IP bất kỳ -> { v: 4, n } | { v: 6, hex } | null.
 * IPv4-mapped IPv6 ("::ffff:1.2.3.4") được quy về IPv4 để tra cứu đúng bảng v4.
 */
export function parseIp(s) {
  const str = String(s || '').trim();
  if (!str) return null;
  if (str.includes(':')) {
    const hex = ipv6ToHex(str);
    if (!hex) return null;
    // ::ffff:x.x.x.x -> IPv4-mapped: 80 bit 0 + 16 bit ffff + 32 bit IPv4
    if (hex.startsWith('00000000000000000000ffff')) {
      return { v: 4, n: parseInt(hex.slice(24), 16) >>> 0 };
    }
    return { v: 6, hex };
  }
  const n = ipv4ToInt(str);
  return n === null ? null : { v: 4, n };
}
