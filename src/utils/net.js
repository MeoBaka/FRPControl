import net from 'node:net';

/** IP có phải LAN/nội bộ/private không (loopback, private ranges, link-local, ULA). */
export function isPrivateIP(ip) {
  if (!ip) return false;
  const s = String(ip).replace(/^::ffff:/i, '').trim();
  if (net.isIPv4(s)) {
    const [a, b] = s.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254);
  }
  const l = s.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fe80:') || l.startsWith('fc') || l.startsWith('fd');
}
