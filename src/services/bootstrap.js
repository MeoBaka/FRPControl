import * as roles from './role.service.js';
import * as users from './user.service.js';
import * as storage from './storage.service.js';

/** Seed role mặc định + tài khoản admin lần đầu chạy. Trả về {username,password} nếu vừa tạo admin. */
export async function bootstrap() {
  const adminRole = await roles.seedDefaultRoles();
  const seeded = await users.seedAdmin(adminRole.id);
  // Nâng cấp dữ liệu cũ (base64/plaintext) sang AES-256-GCM — đảm bảo không còn base64 trên đĩa.
  try { const n = await storage.migrateSecrets(); if (n) console.log(`[FRPControl] Đã nâng cấp ${n} mật khẩu sang AES-256-GCM.`); }
  catch (e) { console.error('[FRPControl] Migrate secrets lỗi:', e.message); }
  return seeded;
}
