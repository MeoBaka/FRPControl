/** Đọc/ghi cookie thủ công (không cần cookie-parser). */

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  s += `; Path=${opts.path || '/'}`;
  if (opts.maxAge != null) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.httpOnly) s += '; HttpOnly';
  if (opts.sameSite) s += `; SameSite=${opts.sameSite}`;
  if (opts.secure) s += '; Secure';
  return s;
}
