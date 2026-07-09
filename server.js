import { createApp } from './src/app.js';
import { config } from './src/config.js';
import { bootstrap } from './src/services/bootstrap.js';
import { startServer, getListenInfo, startRenewScheduler } from './src/runtime.js';

const seeded = await bootstrap();
const app = createApp();

await startServer(app);
startRenewScheduler();
const info = getListenInfo();
const scheme = info.ssl ? 'https' : 'http';
const hostShown = info.host || 'localhost';

console.log('');
console.log('  ╔══════════════════════════════════════════════╗');
console.log('  ║             FRPControl Dashboard             ║');
console.log('  ╚══════════════════════════════════════════════╝');
console.log('');
console.log(`  ▸ Dashboard:  ${scheme}://${hostShown}:${info.port}`);
console.log(`  ▸ Data dir:   ${config.dataDir}`);
console.log(
  `  ▸ Mã hóa MK:  AES-256-GCM${config.encKeySource === 'secret' ? ' (khóa từ SECRET_KEY)' : ' (khóa tự sinh data/.enc-secret — đặt SECRET_KEY để tự quản lý/di chuyển)'}`
);
if (seeded) {
  console.log('');
  console.log('  ┌────────────────── TÀI KHOẢN ADMIN ──────────────────┐');
  console.log(`  │  Username: ${seeded.username}`);
  console.log(`  │  Password: ${seeded.password}`);
  console.log('  │  ⚠ Đăng nhập rồi ĐỔI MẬT KHẨU ngay trong System → Users');
  console.log('  └─────────────────────────────────────────────────────┘');
}
console.log('');
