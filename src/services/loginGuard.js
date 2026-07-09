/**
 * Chống brute-force đăng nhập: đếm số lần sai theo (IP + username), khóa tạm sau ngưỡng.
 * Lưu trong bộ nhớ (đủ cho 1 tiến trình; deploy nhiều tiến trình nên dùng store chung).
 */

const WINDOW_MS = 15 * 60 * 1000; // cửa sổ đếm
const MAX_FAILS = 5;              // số lần sai tối đa
const BLOCK_MS = 15 * 60 * 1000;  // thời gian khóa

const map = new Map(); // key -> { count, resetAt, blockedUntil }

/** Trả về số phút còn bị khóa (0 = không bị khóa). */
export function blockedMinutes(key) {
  const r = map.get(key);
  if (r && r.blockedUntil && Date.now() < r.blockedUntil) {
    return Math.ceil((r.blockedUntil - Date.now()) / 60000);
  }
  return 0;
}

export function recordFail(key) {
  const now = Date.now();
  let r = map.get(key);
  if (!r || now > r.resetAt) r = { count: 0, resetAt: now + WINDOW_MS, blockedUntil: 0 };
  r.count += 1;
  if (r.count >= MAX_FAILS) r.blockedUntil = now + BLOCK_MS;
  map.set(key, r);
}

export function recordSuccess(key) { map.delete(key); }

// Dọn định kỳ
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of map) if (now > r.resetAt && (!r.blockedUntil || now > r.blockedUntil)) map.delete(k);
}, 10 * 60 * 1000).unref?.();
