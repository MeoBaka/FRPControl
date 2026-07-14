#!/usr/bin/env node
/**
 * CLI build blacklist từ 1 FILE text có sẵn (dùng để test/offline).
 * Dùng thực tế trong panel là scheduler tự tải URL — xem blacklist.service.js.
 *
 * Dùng:  node scripts/build-blacklist.js <inbound.txt>
 * (Ghi vào data/blacklist/ theo config.dataDir.)
 */
import { pathToFileURL } from 'node:url';
import { buildFromFile } from '../src/services/blacklist.service.js';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src) { console.error('Dùng: node scripts/build-blacklist.js <inbound.txt>'); process.exit(1); }
  const m = await buildFromFile(src);
  console.log(`✓ Build xong trong ${(m.buildMs / 1000).toFixed(1)}s`);
  console.log(`  IPv4 : ${m.ipv4Ranges.toLocaleString()} dải · phủ ${Number(m.ipv4AddressesCovered).toLocaleString()} IP`);
  console.log(`  IPv6 : ${m.ipv6Ranges.toLocaleString()} dải`);
  console.log(`  Dòng nguồn: ${m.rawEntries.toLocaleString()} · Không hợp lệ: ${m.invalidLines.toLocaleString()}`);
}
