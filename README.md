# FRPControl

Dashboard quản lý **nhiều FRP** (frps/frpc) từ một chỗ. FRPControl kết nối tới **Admin/Dashboard API** (`webServer`) của từng frps/frpc bằng `url + user + password`, đọc thông tin trạng thái, proxy, traffic và điều khiển frpc (reload/stop/sửa cấu hình).

> Built with **Node.js + Express** (không cần build tool), lưu mỗi instance thành **1 file JSON**, giao diện dùng **TailwindCSS CDN**.

---

## Giao diện (admin panel, điều hướng theo menu)

Sidebar chia 2 nhóm — **Providers (FRPS)** và **Nodes (FRPC)** — thay vì liệt kê từng FRP. Mỗi trang có bộ chọn provider/node ở thanh trên (ghi nhớ lựa chọn qua `localStorage`).

| Menu | Trang | Chức năng |
|------|-------|-----------|
| **Dashboard** | Tổng quan | (đang để trống, sẽ bổ sung) |
| **Providers · FRPS** → Providers | Danh sách frps | Thêm/sửa/xóa provider |
| → Status | Thông tin server | serverinfo, traffic, proxy types, cấu hình |
| → Clients | Client kết nối | Danh sách + chi tiết client (kèm proxy của client) |
| → Proxies | Proxy phía server | Lọc theo type/client/**kết nối** (có/không có kết nối), search, Clear Offline. Bấm "Current connections" ở Status để lọc nhanh proxy đang có kết nối |
| **Nodes · FRPC** → Nodes | Danh sách frpc | Thêm/sửa/xóa node |
| → Proxies | Trạng thái + Store | Tab Status (lọc) + tab Store (CRUD proxy, form đầy đủ) |
| → Visitors | Visitor | CRUD visitor trong store |
| → Configs | Cấu hình toml | Xem/sửa file config + Reload/Stop |
| **System** → User Manager | Tài khoản | Thêm/sửa/xóa user, gán role |
| → Role Manager | Phân quyền | RBAC theo resource × action (Xem/Thêm/Sửa/Xóa/Điều khiển) |
| → Audit Logs | Nhật ký | Ghi lại thao tác của user, có lọc |
| → Configs | Cấu hình web | siteName, timeout phiên, bật audit GET... |

## Tính năng chính

- 🔑 **Đăng nhập + phân quyền (RBAC)** kiểu Laravel: user, role, quyền chi tiết, audit log.
- ➕ Thêm/sửa/xóa **provider (frps)** và **node (frpc)**, gom nhóm theo `group`, có nút **Test kết nối**.
- 🗄️ **Quản lý Store** (khi frpc bật `[store]`): thêm/sửa/xóa **proxy** & **visitor** động qua form trực quan theo từng loại (+ Health Check, Advanced JSON).
- 🔐 Mật khẩu FRP **mã hóa AES-256-GCM**; mật khẩu user băm **scrypt**.
- ⚙️ **Configs runtime** (System → Configs): đổi Port/SSL **an toàn** (kiểm tra trước, live rebind), **Panel SSL** tự tạo self-signed hoặc **Let's Encrypt (ACME + AutoRenew)**, bắt buộc 2FA, mật khẩu mạnh, **Domain** & **Security Entrance** (ẩn panel), phân quyền **theo từng instance** (Assign Item).
- 🧭 SPA: sidebar thu gọn được, hệ thống **tab** đa trang, định tuyến bằng hash — không cần build tool.

---

## 🔐 Bảo mật & phân quyền

### Đăng nhập lần đầu
Lần đầu chạy, hệ thống tự tạo tài khoản **admin** với mật khẩu ngẫu nhiên và **in ra console**:
```
┌────────────────── TÀI KHOẢN ADMIN ──────────────────┐
│  Username: admin
│  Password: <ngẫu nhiên>
│  ⚠ Đăng nhập rồi ĐỔI MẬT KHẨU ngay trong System → Users
└─────────────────────────────────────────────────────┘
```
Đăng nhập → vào **System → User Manager** đổi mật khẩu ngay.

### RBAC (Role-Based Access Control)
- **Quyền** dạng `resource.action`. Resource: `providers, nodes, monitoring, proxies, visitors, configs, users, roles, audit, settings`. Action: `view (Xem), create (Thêm), update (Sửa), delete (Xóa)`, `control (Điều khiển — reload/stop frpc)`, `users.disable2fa (Tắt 2FA của user)` và `users.revoke (Thu hồi phiên của user)`.
- **Role** = tập quyền. 3 role mặc định:
  - **Administrator** (`*` toàn quyền, không sửa/xóa được).
  - **Operator** — quản lý FRP, không đụng System.
  - **Viewer** — chỉ xem.
- Quyền được **enforce ở backend** (mọi endpoint) và **ẩn/hiện nút + trang ở frontend**.

### Xác thực 2 lớp (2FA / TOTP)
- Mỗi user tự bật 2FA trong **Cài đặt tài khoản** (menu user ở góc sidebar): xác nhận mật khẩu → quét **QR code** bằng Google Authenticator/Authy (hoặc nhập khóa thủ công) → nhập mã 6 số để bật.
- Khi đã bật, đăng nhập cần thêm **mã 2FA**. Secret được **mã hóa** khi lưu.
- **Cài đặt tài khoản** còn cho **đổi tên hiển thị** và **đổi mật khẩu** (đổi mật khẩu sẽ đăng xuất các phiên khác).
- Admin có quyền `users.disable2fa` có thể **tắt 2FA** cho user bị mất thiết bị (nút "Tắt 2FA" trong User Manager).

### Audit Logs
Ghi lại mọi thao tác: đăng nhập (thành/bại/sai 2FA), thêm/sửa/xóa, reload/stop, bật-tắt 2FA... kèm **user, action, method, path, status, IP, thời gian**. Bật thêm ghi cả thao tác **Xem (GET)** trong **System → Configs** (mặc định tắt để đỡ nhiễu).

### Phiên: JWT access + refresh token
- Đăng nhập cấp **2 cookie HttpOnly**: `frpc_at` (access token — **JWT HS256**, ngắn hạn 15 phút) và `frpc_rt` (refresh token — id phiên lưu server ở `data/sessions.json`).
- Access token hết hạn → frontend **tự động gọi `/api/auth/refresh`** (silent refresh) lấy token mới, người dùng không bị gián đoạn.
- **Ghi nhớ đăng nhập** (checkbox ở màn hình login): cookie thành *persistent*, giữ phiên `rememberDays` ngày (mặc định 30); không chọn → *session cookie*, mất khi đóng trình duyệt (TTL `sessionTimeoutMinutes`). Cấu hình cả 2 trong **System → Configs**.
- **Thu hồi được ngay**: mỗi request kiểm tra refresh token còn tồn tại → admin bấm **"Thu hồi phiên"** trong User Manager (quyền `users.revoke`) là user bị đăng xuất mọi thiết bị lập tức. Đổi mật khẩu / vô hiệu hóa / xóa user cũng hủy phiên.
- Khóa ký JWT lấy từ `SECRET_KEY`; nếu không đặt sẽ tự sinh & lưu `data/.jwt-secret` (ổn định qua restart). Có thể chỉnh access TTL qua env `ACCESS_TOKEN_MINUTES`.
- Phiên hết hạn được **dọn tự động** mỗi 10 phút.

> ⚠️ Khi deploy public: chạy sau **HTTPS** (reverse proxy) để cookie an toàn, và đặt `SECRET_KEY` trong `.env`. Thư mục `data/` (users/roles/sessions/audit) đã được `.gitignore`.

---

## Kiến trúc thư mục

```
FRPControl/
├── server.js                     # Entry point
├── src/
│   ├── config.js                 # Nạp .env + cấu hình
│   ├── app.js                    # Khởi tạo Express, route, error handler
│   ├── routes/                   # Định nghĩa route
│   │   ├── index.js
│   │   ├── instances.routes.js   # CRUD instance
│   │   └── monitor.routes.js     # Giám sát & điều khiển
│   ├── controllers/              # Xử lý request → gọi service
│   │   ├── instances.controller.js
│   │   └── monitor.controller.js
│   ├── services/                 # Nghiệp vụ, tổ chức theo file
│   │   ├── storage.service.js    # Lưu/đọc instance dạng file JSON
│   │   ├── frpApi.service.js     # HTTP client (Basic Auth) gọi FRP API
│   │   ├── frps.service.js       # API frps (serverinfo, proxy, clients, traffic)
│   │   └── frpc.service.js       # API frpc (status, config, reload, stop, store)
│   └── utils/
│       └── crypto.js             # Mã hóa/giải mã mật khẩu
├── data/
│   └── instances/                # ⬅ Mỗi FRP instance = 1 file <uuid>.json
├── public/                       # Frontend tĩnh (TailwindCSS CDN)
│   ├── index.html                # Shell: sidebar + content + modal
│   └── js/
│       ├── format.js             # Helper format (bytes, timeAgo, badges)
│       ├── api.js                # Gọi backend FRPControl
│       ├── state.js              # State toàn cục + chọn provider/node
│       ├── components.js         # Modal, toast, selector, form instance
│       ├── app.js                # Router (hash) + sidebar + init
│       └── pages/                # Mỗi trang 1 file
│           ├── dashboard.js
│           ├── providers.js  provider-status.js  provider-clients.js  provider-proxies.js
│           └── nodes.js  node-proxies.js  node-visitors.js  node-configs.js
├── .env.example
└── package.json
```

**Luồng dữ liệu:** `Frontend` → `routes` → `controllers` → `services` → **Admin API của frps/frpc**. Thông tin instance được `storage.service` đọc/ghi từ các file JSON trong `data/instances/`.

---

## Cài đặt & chạy

Yêu cầu **Node.js >= 18** (khuyến nghị 20+).

```bash
npm install
cp .env.example .env          # rồi mở .env đặt SECRET_KEY (xem bên dưới)
npm start                     # hoặc: npm run dev  (tự reload khi sửa code)
```

Mở trình duyệt: <http://localhost:3000>

### Biến môi trường (`.env`)

| Biến              | Mặc định | Ý nghĩa |
|-------------------|----------|---------|
| `PORT`            | `3000`   | Cổng chạy dashboard |
| `DATA_DIR`        | `./data` | Nơi lưu file instance |
| `SECRET_KEY`      | *(trống)*| Khóa mã hóa mật khẩu. **Nên đặt** để bật AES-256-GCM |
| `FRP_API_TIMEOUT` | `8000`   | Timeout (ms) khi gọi API frps/frpc |
| `TRUST_PROXY`     | `0`      | Đặt `1` **chỉ khi** đứng sau reverse-proxy tin cậy → mới tin `X-Forwarded-For`. Mặc định tắt để chống giả mạo IP (vượt rate-limit). |

Tạo `SECRET_KEY` ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 🔐 Mật khẩu FRP **luôn** được mã hóa **AES-256-GCM** (đã bỏ fallback base64). Nếu để trống `SECRET_KEY`, hệ thống **tự sinh & lưu** khóa ngẫu nhiên ở `data/.enc-secret` và vẫn dùng AES — nhưng **nên đặt `SECRET_KEY`** để bạn tự quản lý/di chuyển khóa (backup, đổi máy). Nếu đổi `SECRET_KEY` (hoặc mất `data/.enc-secret`) sau khi đã lưu instance, mật khẩu cũ **không giải mã được** — cần nhập lại.

> `PORT` và `FRP_API_TIMEOUT` có thể **ghi đè trong giao diện** ở **System → Configs** (lưu tại `data/settings.json`, ưu tiên hơn `.env`).

---

## Cấu hình hệ thống — System → Configs

Trang **System → Configs** (cần quyền `settings.update`) chỉnh cấu hình runtime, lưu ở `data/settings.json` (ưu tiên hơn `.env`). Gồm 3 nhóm: **Máy chủ Panel**, **Bảo mật**, **Giao diện & phiên**.

### Máy chủ Panel — Server / SSL / ACME

| Cấu hình | Ý nghĩa |
|---|---|
| **Server IP** | IP **quảng bá**: dùng làm SAN của chứng chỉ + kiểm tra ACME + dựng URL. Panel **luôn lắng nghe mọi interface** nên đặt IP KHÔNG giới hạn truy cập (localhost luôn vào được — chống tự khóa). |
| **Server Port** | Cổng panel. Đặt ở đây thì có thể bỏ `PORT` khỏi `.env`. |
| **Panel SSL** | Bật HTTPS cho panel. **Bắt buộc có Server IP + Server Port.** |
| **Chế độ cert** | `self-signed` (tự tạo, chạy mọi nơi kể cả LAN, trình duyệt cảnh báo "not trusted") hoặc `Let's Encrypt (ACME)` (cert thật). |
| **SSL Cert/Key file** | Tùy chọn — điền để dùng cert của bạn; để trống thì **tự tạo** theo chế độ. |
| **Email (ACME)** | Email đăng ký Let's Encrypt. |
| **AutoRenew** | Tự gia hạn cert ACME khi còn ≤ 30 ngày (scheduler chạy mỗi 12 giờ). |
| **Staging** | Dùng Let's Encrypt *staging* để thử (cert KHÔNG tin cậy, tránh rate-limit của production). |

**Đổi Port/SSL an toàn — kiểm tra TRƯỚC khi chuyển:** khi lưu, hệ thống **kiểm tra port còn trống + chứng chỉ parse được TRƯỚC**; sai thì báo lỗi và **không lưu**. Hợp lệ mới chuyển listener (live rebind, đã trả response xong mới đổi) rồi trình duyệt tự sang URL mới. Cert tự tạo lưu tại `data/ssl/`. Trang hiển thị **số ngày còn lại** của cert (xanh > 30 ngày, vàng ≤ 30, đỏ ≤ 7).

**ACME (Let's Encrypt) — xác minh HTTP-01:**
- Route công khai `GET /.well-known/acme-challenge/:token` mở **trước** lớp Domain / Security Entrance để CA verify được.
- Yêu cầu: **Domain public** trỏ về máy này + **port 80 mở ra internet**. **IP LAN/nội bộ bị chặn** khi chọn ACME (Let's Encrypt không verify được IP private).
- Bật ACME mà chưa có cert → HTTPS lên ngay bằng **self-signed tạm**, đồng thời xin cert thật ở **nền**, xong **hot-reload** sang cert thật (log `[FRPControl] ACME: …`).
- Thư viện: [`acme-client`](https://www.npmjs.com/package/acme-client) (Let's Encrypt) + [`selfsigned`](https://www.npmjs.com/package/selfsigned).

### Bảo mật

| Cấu hình | Ý nghĩa |
|---|---|
| **FRP API Timeout (ms)** | Timeout khi gọi Admin API frps/frpc (ghi đè `FRP_API_TIMEOUT`). |
| **Google Authenticator — bắt buộc 2FA** | Bật toàn cục → mọi user chưa bật 2FA bị **chặn mọi thao tác trừ nhóm `/auth`** cho tới khi bật (System → Profile) — frontend cũng ép về Profile kèm banner. Có thể bắt **riêng theo role** bằng quyền `security.req2fa`. *Lưu ý:* quyền này **không** được `*` cấp (là cờ chính sách, không phải năng lực) nên admin role `*` **không** bị ép ngoài ý muốn — chỉ ép khi bật công tắc toàn cục hoặc role ghi tường minh. |
| **Strong password** | Bắt buộc mật khẩu **≥ 8 ký tự, gồm chữ hoa + chữ thường + số + ký tự đặc biệt** (áp dụng khi đặt/đổi mật khẩu). |
| **Domain** | Chỉ cho truy cập panel qua đúng domain (so khớp `Host` header); sai → `404`. |
| **Security Entrance** | Đường dẫn bí mật (vd `/f5bce1a2`). Chưa vào đúng path → **`404` ẩn toàn bộ panel**; vào đúng path → cấp cookie rồi mới hiện panel. |

**Chống tự khóa:** truy cập từ **localhost / 127.0.0.1** luôn **bỏ qua** Domain + Security Entrance. Nếu vẫn kẹt: sửa `data/settings.json` (xóa `panelDomain` / `securityEntrance` / `serverPort`) rồi chạy lại server.

### Giao diện & phiên
Tên site (sidebar + tiêu đề login), mô tả trang đăng nhập, thời gian hết phiên (khi KHÔNG "Ghi nhớ"), số ngày "Ghi nhớ đăng nhập", số ngày giữ audit log, và bật ghi audit cho cả thao tác đọc (GET).

### Phân quyền theo instance — Assign Item
Trong **System → Users**, nút **Phân quyền** (cần quyền `users.assign`) gán quyền **theo từng provider/node** cho user (cộng thêm ngoài role): **Xem / Giám sát / Sửa / Xóa**. Danh sách instance và các API `/monitor`, `/instances` được **lọc theo quyền hiệu lực** = quyền toàn cục của role **HOẶC** assignment trên instance đó.

---

## Cấu hình FRP để FRPControl kết nối được

FRPControl **không** thay thế frps/frpc — nó gọi **Admin API** của chúng, nên bạn phải bật `webServer` trong cấu hình FRP.

### frps (server) — `frps.toml`

```toml
bindPort = 7000

# Bật dashboard/API
webServer.addr = "0.0.0.0"     # hoặc IP nội bộ
webServer.port = 7500
webServer.user = "admin"
webServer.password = "your-strong-password"
```

→ Trong FRPControl thêm instance: role **frps**, URL `http://<ip-frps>:7500`.

### frpc (client) — `frpc.toml`

```toml
serverAddr = "x.x.x.x"
serverPort = 7000

# Bật admin API (bắt buộc để reload/stop/status)
webServer.addr = "0.0.0.0"
webServer.port = 7400
webServer.user = "admin"
webServer.password = "your-strong-password"

[[proxies]]
name = "ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6000
```

→ Trong FRPControl thêm instance: role **frpc**, URL `http://<ip-frpc>:7400`.

> FRP dùng **HTTP Basic Auth** cho các API này. `user`/`password` trong FRPControl chính là `webServer.user`/`webServer.password`.

---

## FRP Admin API mà FRPControl sử dụng

**frps** (server):
| Method | Path | Dùng cho |
|--------|------|----------|
| GET | `/api/serverinfo` | Thông tin server, traffic tổng, số client |
| GET | `/api/proxy/{type}` | Danh sách proxy theo loại (tcp/udp/http/https/…) |
| GET | `/api/traffic/{name}` | Lịch sử traffic của 1 proxy |
| GET | `/api/clients` · `/api/clients/{key}` | Danh sách / chi tiết client kết nối |
| DELETE | `/api/proxies` | Xóa các proxy offline |

**frpc** (client):
| Method | Path | Dùng cho |
|--------|------|----------|
| GET  | `/api/status` | Trạng thái tất cả proxy |
| GET  | `/api/config` | Đọc file cấu hình |
| PUT  | `/api/config` | Ghi file cấu hình |
| GET  | `/api/reload` | Nạp lại cấu hình |
| POST | `/api/stop`   | Dừng frpc |
| GET  | `/api/proxy/{name}/config`   | ProxyDefinition của 1 proxy |
| GET  | `/api/visitor/{name}/config` | VisitorDefinition của 1 visitor |

**frpc — Store API** *(chỉ khả dụng khi frpc bật `[store]`)*: cho phép thêm/sửa/xóa proxy & visitor **động** qua API mà không cần sửa file cấu hình tay.
| Method | Path | Dùng cho |
|--------|------|----------|
| GET/POST | `/api/store/proxies` | Liệt kê / tạo proxy |
| GET/PUT/DELETE | `/api/store/proxies/{name}` | Xem / sửa / xóa proxy |
| GET/POST | `/api/store/visitors` | Liệt kê / tạo visitor |
| GET/PUT/DELETE | `/api/store/visitors/{name}` | Xem / sửa / xóa visitor |

> **ProxyDefinition** có dạng `{ "name", "type", "<type>": { …config… } }` với `type` ∈ tcp/udp/http/https/tcpmux/stcp/sudp/xtcp. **VisitorDefinition** tương tự với `type` ∈ stcp/sudp/xtcp. Ví dụ tạo proxy tcp:
> ```json
> { "name": "ssh", "type": "tcp", "tcp": { "localIP": "127.0.0.1", "localPort": 22, "remotePort": 6000 } }
> ```
>
> Bật store trong `frpc.toml`:
> ```toml
> [store]
> path = "./frpc_store.json"
> ```

---

## REST API của FRPControl (backend nội bộ)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/health` | Trạng thái service + kiểu mã hóa |
| GET | `/api/instances` | Danh sách instance |
| POST | `/api/instances` | Thêm instance |
| GET | `/api/instances/:id` | Chi tiết instance |
| PUT | `/api/instances/:id` | Cập nhật instance |
| DELETE | `/api/instances/:id` | Xóa instance |
| POST | `/api/instances/test` | Test kết nối (thông tin chưa lưu) |
| POST | `/api/instances/:id/test` | Test kết nối (đã lưu) |
| GET | `/api/monitor/overview` | Tổng quan tất cả instance |
| GET | `/api/monitor/:id/overview` | Chi tiết 1 instance (frps/frpc) |
| GET | `/api/monitor/:id/clients` · `/clients/:key` | [frps] Danh sách / chi tiết client |
| DELETE | `/api/monitor/:id/proxies/offline` | [frps] Xóa proxy offline |
| GET/PUT | `/api/monitor/:id/config` | Đọc/ghi cấu hình frpc |
| POST | `/api/monitor/:id/reload` | Reload frpc |
| POST | `/api/monitor/:id/stop` | Stop frpc |
| GET | `/api/monitor/:id/traffic/:name` | Traffic 1 proxy (frps) |
| GET | `/api/monitor/:id/proxy/:name/config` | ProxyDefinition 1 proxy (frpc) |
| GET | `/api/monitor/:id/visitor/:name/config` | VisitorDefinition 1 visitor (frpc) |
| GET | `/api/monitor/:id/store` | Store tổng hợp: `{enabled, proxies, visitors}` |
| GET/POST | `/api/monitor/:id/store/proxies` | Liệt kê / tạo store proxy |
| GET/PUT/DELETE | `/api/monitor/:id/store/proxies/:name` | Xem / sửa / xóa store proxy |
| GET/POST | `/api/monitor/:id/store/visitors` | Liệt kê / tạo store visitor |
| GET/PUT/DELETE | `/api/monitor/:id/store/visitors/:name` | Xem / sửa / xóa store visitor |

---

## Bảo mật (nên đọc)

- FRPControl lưu **credentials của frps/frpc** + **hash mật khẩu user** + **2FA secret**. Hãy đặt `SECRET_KEY` và **không** để lộ thư mục `data/`.
- Toàn bộ `data/` (instances/users/roles/sessions/audit/settings) đã `.gitignore` — không commit.
- Có sẵn **đăng nhập + RBAC + JWT + 2FA**. Khi deploy public: chạy sau **HTTPS** (reverse proxy) và đặt `SECRET_KEY`.

---

## 🛡️ Kiểm thử bảo mật (Security Audit)

> **Ngày:** 2026-07-04 · **Phạm vi:** toàn bộ FRPControl (backend Node/Express + frontend SPA) · **Loại:** review nội bộ, có sự đồng ý (dự án của chính chủ).
>
> **Bối cảnh:** yêu cầu chạy [usestrix/strix](https://github.com/usestrix/strix) (AI pentest agent). Strix cần Docker + API key LLM và gửi mã nguồn ra dịch vụ ngoài, nên **thay bằng audit thủ công** theo đúng các hạng mục strix/OWASP Top 10: phân tích tĩnh (đọc code, quét pattern nguy hiểm) + **test động có PoC** trên server đang chạy.

### Tổng hợp phát hiện

| # | Mức độ | Lỗ hổng | Trạng thái |
|---|--------|---------|-----------|
| 1 | 🔴 **CRITICAL** | Path Traversal → đọc/ghi/xóa file tùy ý → **chiếm tài khoản admin** | ✅ **Đã vá** |
| 2 | 🟠 **HIGH** | SSRF qua `baseUrl` (test kết nối) — quét mạng nội bộ / cloud metadata | ✅ **Đã vá** |
| 3 | 🟡 **MEDIUM** | Không giới hạn số lần đăng nhập → brute-force | ✅ **Đã vá** |
| 4 | 🟡 **MEDIUM** | Secret at-rest dạng base64 nếu thiếu `SECRET_KEY` | ✅ **Đã vá** (luôn AES-256-GCM) |
| 5 | 🔵 **LOW** | Lộ tồn tại tài khoản ("đã bị vô hiệu hóa") | ✅ **Đã vá** |
| 6 | 🔵 **LOW** | Cookie `Secure` chỉ khi HTTPS; ~~ai có `users.update` tự gán role admin~~ | ✅ Tự đổi role bị chặn (L5); Secure cookie khi bật Panel SSL |
| 7 | 🟠 **HIGH** | Host-header `localhost` vượt qua **Domain + Security Entrance** (ẩn panel) | ✅ **Đã vá** |
| 8 | 🟡 **MEDIUM** | Giả mạo `X-Forwarded-For` vượt rate-limit brute-force | ✅ **Đã vá** |

> **Vòng 2 (2026-07-04) — theo phương pháp `StrixMirror/scan_modes/deep.md`** (emulated white-box: static triage + PoC động), tập trung code mới: Configs/SSL/ACME, Security Entrance, Domain guard, force-2FA, phân quyền per-instance, live port rebind. Phát hiện & vá **#7, #8**.

> **✅ Đã khắc phục (2026-07-04)** — re-test xác nhận đóng lỗ hổng, chức năng hợp lệ không bị ảnh hưởng:
> - **#1:** validate `id` = UUID trước mọi thao tác file ở `storage`/`user`/`role` service ([utils/id.js](src/utils/id.js)). Re-test: `../settings`, `../users/<id>`, `../sessions` đều trả **404**; instance thật (UUID) vẫn **200**.
> - **#2:** `POST /instances/test` yêu cầu quyền `providers.create`/`nodes.create` (Viewer → **403**); client HTTP chặn dải **link-local/metadata** `169.254/16`, `fe80::/10` ([frpApi.service.js](src/services/frpApi.service.js)). Re-test: metadata `169.254.169.254` → **bị chặn**; FRP thật (IP public) vẫn `reachable`.
> - **#3:** rate-limit đăng nhập theo (IP + username), khóa 15 phút sau 5 lần sai ([loginGuard.js](src/services/loginGuard.js)). Re-test: lần thứ 6 → **429**.
> - **#5:** mọi trường hợp sai (user không tồn tại / sai mật khẩu / bị vô hiệu hóa) trả **cùng một thông báo**.

### 🔴 #1 — Path Traversal → Arbitrary File Access → Account Takeover (CRITICAL)

`filePathFor(id)` ở [storage.service.js](src/services/storage.service.js#L21) (và `user.service`, `role.service`) nối thẳng `req.params.id` vào đường dẫn **không kiểm tra**:
```js
function filePathFor(id) { return path.join(config.instancesDir, `${id}.json`); }
```
Express `:id` sau `decodeURIComponent` cho phép `../`. **Bất kỳ user đã đăng nhập (kể cả Viewer)** đọc được mọi file `.json` trên máy chủ.

**PoC (đã chạy thật):**
```bash
# 1) Đọc file bất kỳ trong data/ (settings, và cả ngoài data/: ../../package.json)
GET /api/instances/%2e%2e%2fsettings          → nội dung data/settings.json
GET /api/instances/%2e%2e%2f%2e%2e%2fpackage  → package.json (ngoài data/)

# 2) Đọc file user -> LỘ passwordHash + twoFactorSecret
GET /api/instances/%2e%2e%2fusers%2f<userId>
   → { ..., passwordHash, twoFactorSecret, twoFactorPendingSecret, ... }

# 3) CHUỖI CHIẾM TÀI KHOẢN: đọc sessions.json -> lấy refresh token -> mint access token
GET  /api/instances/%2e%2e%2fsessions          → [{ sid: "<refresh token>", userId, ... }]
POST /api/auth/refresh  (Cookie: frpc_rt=<sid đánh cắp>)
   → 🔴 đăng nhập với tư cách admin / Administrator — KHÔNG cần mật khẩu
```
Cùng gốc lỗi còn cho **ghi đè** (`PUT /:id`) và **xóa** (`DELETE /:id`) file `.json` tùy ý.

**Khắc phục:** validate `id` khớp UUID (`^[0-9a-f]{8}-...$`) trước mọi thao tác file ở cả 3 service; thêm kiểm tra đường dẫn resolve phải nằm trong thư mục đích (defense-in-depth).

### 🟠 #2 — SSRF qua FRP baseUrl (HIGH)

`POST /api/instances/test` (chỉ cần đăng nhập) khiến **server gửi HTTP request tới host tùy ý** do user nhập.

**PoC:** `baseUrl` = `http://127.0.0.1:3000` (chính app, trả 404), `http://169.254.169.254` (cloud metadata), `http://127.0.0.1:9` (ECONNREFUSED). Thông báo lỗi **phân biệt cổng mở/đóng/lọc** → quét cổng nội bộ; trên cloud có thể chạm **metadata endpoint** đánh cắp credential.

**Khắc phục:** chặn dải IP nội bộ/loopback/link-local (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1) hoặc dùng allowlist; không trả lỗi kết nối thô; cân nhắc gate sau quyền `providers.create`/`nodes.create`.

### 🟡 #3 — Brute-force đăng nhập (MEDIUM)

6 lần login sai liên tiếp đều trả `401`, **không có rate-limit / lockout / delay**.

**Khắc phục:** giới hạn theo IP + theo tài khoản (vd 5 lần/15 phút), tăng delay lũy tiến, khóa tạm sau nhiều lần sai; ghi audit (đã có).

### 🟡 #4 — Secret at-rest yếu khi thiếu SECRET_KEY (MEDIUM) — ✅ đã vá

Trước: không đặt `SECRET_KEY` → mật khẩu FRP & 2FA secret lưu **base64 (đảo ngược được)**; kết hợp #1 là lộ hoàn toàn.

**Khắc phục (2026-07-04):** **bỏ hẳn fallback base64** — at-rest **luôn AES-256-GCM**. Khóa lấy từ `SECRET_KEY`, hoặc **tự sinh & lưu bền vững** ở `data/.enc-secret` nếu chưa đặt ([config.js](src/config.js), [utils/crypto.js](src/utils/crypto.js)). Startup có **migration** tự nâng cấp mọi mật khẩu cũ (base64/plaintext) sang `enc:` ([storage.migrateSecrets](src/services/storage.service.js) gọi từ [bootstrap.js](src/services/bootstrap.js)). Re-test: round-trip luôn ra `enc:`; 3/3 instance lưu ở dạng `enc:`; đọc dữ liệu cũ `b64:` vẫn được (để nâng cấp).

### 🔵 #5, #6 — LOW

- Login trả "Tài khoản đã bị vô hiệu hóa" (khác thông báo chung) → lộ sự tồn tại tài khoản. Nên trả thông báo đồng nhất.
- Cookie `Secure` chỉ bật khi HTTPS (chạy HTTP nội bộ thì không) → deploy phải sau HTTPS. Ai có `users.update` có thể gán role Administrator cho bất kỳ ai (kể cả chính mình) — đúng thiết kế, cần cấp quyền cẩn thận.

### 🟠 #7 — Host-header vượt Domain / Security Entrance (HIGH)

Cổng vào panel (`panelGuard` trong [app.js](src/app.js)) bỏ qua kiểm tra cho **localhost** để chống tự khóa, nhưng lại nhận diện localhost qua **`Host` header** — mà attacker kiểm soát được:
```js
// LỖI: host lấy từ header do client gửi
return /^(::1$|::ffff:127\.|127\.)/.test(ip) || host === 'localhost' || host === '127.0.0.1';
```
**PoC (đã chạy thật)** — từ IP LAN, đã bật `securityEntrance=/secret123` + `panelDomain=example.com`:
```bash
curl -H 'Host: localhost' http://<LAN-IP>:3000/            → 200  (đáng lẽ 404 — panel bị ẩn)
curl -H 'Host: 127.0.0.1' http://<LAN-IP>:3000/api/health  → 200
# Không có mẹo:                                             → 404 (đúng)
```
Bất kỳ attacker từ xa chỉ cần thêm `Host: localhost` là **vô hiệu hóa hoàn toàn** cả 2 lớp ẩn panel (Domain + Security Entrance).

**Khắc phục:** chỉ tin **địa chỉ TCP thật của kết nối** (`req.socket.remoteAddress` loopback), **bỏ** mọi kiểm tra dựa trên `Host` header. Re-test: LAN + `Host: localhost` → **404**; localhost thật → **200** (chống tự khóa còn nguyên). Deploy sau reverse-proxy cùng máy nên đặt guard ở tầng proxy hoặc bật `TRUST_PROXY` đúng.

### 🟡 #8 — Giả mạo X-Forwarded-For vượt rate-limit brute-force (MEDIUM)

App đặt `trust proxy: true` và `clientIp()` đọc `X-Forwarded-For` **vô điều kiện**. `loginGuard` khóa theo khóa `IP|username`, nên đổi XFF mỗi lần request tạo **bucket mới** → thử mật khẩu **không giới hạn**.
```bash
# Xoay XFF -> không bao giờ bị khóa
for i in 1..7: curl -H "X-Forwarded-For: 9.9.9.$i" -d '{"username":"admin","password":"wrong"}' /api/auth/login   → 401 401 401 401 401 401 401
# Không XFF (IP thật cố định) -> lần 6 bị khóa                                                                     → ... 401 429 429
```
**Khắc phục:** chỉ tin `X-Forwarded-For` khi đặt biến môi trường `TRUST_PROXY=1` (đứng sau proxy tin cậy); mặc định dùng **địa chỉ TCP thật** ([config.js](src/config.js), [auth.controller.js](src/controllers/auth.controller.js)). Re-test sau vá: xoay XFF → **429** xuất hiện (đã được bảo vệ). *(Audit log vốn đã dùng địa chỉ socket thật — không bị ảnh hưởng.)*

### ✅ Đã kiểm tra & AN TOÀN

- **Command injection:** không dùng `child_process`/`exec`/`eval`/`Function`.
- **JWT:** `verify()` luôn tính lại HMAC-SHA256 (không đọc `alg` từ token) → miễn nhiễm **alg:none / alg confusion**; kiểm `exp`; so sánh chữ ký **timing-safe**.
- **2FA bypass:** đăng nhập thiếu mã 2FA → trả `twoFactorRequired`, **không cấp phiên**; không có đường vòng.
- **CSRF:** cookie `SameSite=Lax` + API JSON + mọi thao tác là POST/PUT/DELETE → không gửi cookie cross-site.
- **XSS:** output encoding nhất quán (`Fmt.escapeHtml` + `textContent`); nội dung config nạp qua `textarea.value` (không phải `innerHTML`).
- **Mật khẩu:** băm **scrypt** + salt riêng, verify timing-safe.
- **Thu hồi phiên:** kiểm tra refresh token tồn tại mỗi request → thu hồi có hiệu lực ngay.
- **Error handling:** chỉ trả `message`, không lộ stack trace.
- **SQLi:** không dùng SQL (lưu file JSON).

> ✅ **Kết luận:** tất cả finding **#1–#8 và L1–L5 đã được vá và re-test đóng**. #4 nay luôn AES-256-GCM; #6 tự-đổi-role đã chặn, cookie `Secure` khi bật Panel SSL. Full sweep 23 lớp không còn HIGH/CRITICAL tồn đọng. Có thể chạy lại strix/pentest bất kỳ lúc nào để đối chiếu.

---

### Vòng 3 — Full deep sweep 23 lớp (theo `StrixMirror/scan_modes/deep.md`)

Quét **toàn bộ 23 lớp lỗ hổng** của StrixMirror trên toàn app (không chỉ code mới). Không phát hiện lỗ hổng HIGH/CRITICAL mới (2 lỗi thật #7/#8 đã bắt & vá ở vòng 2). Còn lại một số mục **LOW/thông tin** — **ghi nhận trước, sẽ vá sau**.

**Ma trận coverage:**

| Lớp | Kết quả |
|---|---|
| Injection (SQL/NoSQL/Command/SSTI/XXE) | ✅ N/A — không SQL/NoSQL/template engine/XML; không `exec`/`eval`/`Function` |
| XSS (reflected/stored/DOM) | ✅ An toàn — `Fmt.escapeHtml` nhất quán; `typeTag`/`statusPill` escape nội bộ; data nhạy chỉ vào `confirm()` (plain-text) / `input value` (escaped) |
| Path Traversal / LFI/RFI | ✅ An toàn — `:id` validate UUID (#1); `:name` (proxy/visitor) đều `encodeURIComponent`; không nối path vào FS local |
| BFLA / IDOR / BOLA | ✅ An toàn — mọi route có `requireAuth` + `instanceRoleCap`/`instanceCap`/`requirePermission`; list `/instances` & `/monitor/overview` **lọc theo quyền hiệu lực** |
| Mass Assignment | ✅ An toàn — instance qua `validate()` whitelist (name/role/baseUrl/user/tls/group/note, **không** id/password); user/settings đọc field tường minh |
| Auth/JWT/Session | ✅ An toàn — HMAC recompute (miễn alg-confusion), kiểm `exp`, timing-safe; kiểm phiên mỗi request (thu hồi tức thì) |
| 2FA / force-2FA | ✅ An toàn — thiếu mã không cấp phiên; guard chặn mọi thứ trừ `/auth`; `security.req2fa` không bị `*` cấp |
| CSRF | ✅ An toàn — `SameSite=Lax` + **không CORS** (same-origin) + API JSON |
| SSRF | ✅ An toàn — chặn link-local/metadata; không có outbound nào ngoài frpApi + acme-client (CA URL cố định) |
| Open Redirect | 🔵 LOW — redirect entrance cố định `/`; `panel.url` từ Host header (self, admin) |
| Header Injection / Host confusion | ✅ Đã vá #7; cookie value là HMAC/JWT/UUID (không CRLF) |
| Insecure Deserialization | ✅ An toàn — chỉ `JSON.parse`; spread object dùng define-semantics (không proto-pollution) |
| Prototype Pollution | 🔵 LOW — `Object.assign(inner, JSON.parse(advanced))` phía **client** có thể set `inner.__proto__`; không ảnh hưởng server |
| Race Conditions (TOCTOU) | 🔵 LOW — khoảng hở `checkListen`→`applyServer` khi đổi port (admin, tự gây, khôi phục được) |
| Information Disclosure | 🔵 LOW — lỗi 5xx trả `err.message` có thể lộ đường dẫn nội bộ |
| File Upload / Req Smuggling / Subdomain Takeover / SSTI / XXE | ✅ N/A — không có bề mặt tương ứng |

**Findings LOW — ✅ đã vá & re-test (2026-07-04):**

| ID | Mức | Mô tả | Vị trí | Khắc phục + re-test |
|---|---|---|---|---|
| L1 | 🔵 LOW | Lỗi 5xx trả `err.message` → lộ đường dẫn/thông tin nội bộ | [app.js](src/app.js) error handler | ✅ status ≥ 500 trả **message chung** ("Lỗi máy chủ nội bộ."); chi tiết chỉ log ở server |
| L2 | 🔵 LOW/INFO | Proto-pollution phía client qua Advanced JSON | [node-proxies.js](public/js/pages/node-proxies.js) + [node-visitors.js](public/js/pages/node-visitors.js) | ✅ merge **bỏ qua** `__proto__`/`constructor`/`prototype`. Test: `{"__proto__":{...}}` → không pollute, chỉ key an toàn được nhận |
| L3 | 🔵 LOW | Non-atomic write `sessions.json` (crash → mất phiên) | [session.service.js](src/services/session.service.js) `persist()` | ✅ ghi **tmp rồi `rename`** (nguyên tử). Test: `sessions.json` vẫn valid sau nhiều write |
| L4 | 🔵 LOW | `panel.url` dựng từ `Host` header | [system.controller.js](src/controllers/system.controller.js) | ✅ ưu tiên `serverIP`; host từ header phải khớp `^[a-zA-Z0-9.-]+$`, sai → `localhost`. Test: `Host: bad_evil.host` → `url=http://localhost:...` |
| L5 | 🔵 LOW (thiết kế) | Người có `users.update` tự đổi role mình thành admin (= #6) | [system.controller.js](src/controllers/system.controller.js) `updateUser` | ✅ chặn tự đổi `roleId` của chính mình → **400**. Test: self-role → 400, self-displayName → 200 |

## License

MIT
