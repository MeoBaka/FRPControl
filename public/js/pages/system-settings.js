/* System · Configs (web settings). */
window.Pages = window.Pages || {};
Pages['system/settings'] = {
  title: 'Configs',
  subtitle: 'Cấu hình chung của FRPControl',
  async render(root) {
    const F = Fmt;
    const canUpdate = Store.can('settings.update');
    const { settings, listen, sslStatus } = await API.getSettings();
    const sslStatusLine = (() => {
      if (!sslStatus || !sslStatus.expiresAt) return '';
      const exp = new Date(sslStatus.expiresAt);
      const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
      const color = days <= 0 ? 'text-red-400' : days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-emerald-400';
      const left = days <= 0 ? 'đã hết hạn' : `còn <b>${days}</b> ngày`;
      const acmePending = sslStatus.mode === 'acme' && !sslStatus.acmeReady ? ' · <span class="text-amber-400">ACME chưa cấp xong — đang dùng self-signed tạm</span>' : '';
      return `<p class="text-[11px] text-zinc-500 mt-1">Cert hiện tại: <b>${F.escapeHtml(sslStatus.mode)}</b> · hết hạn ${F.escapeHtml(exp.toLocaleDateString('vi-VN'))} · <span class="${color}">${left}</span>${acmePending}</p>`;
    })();

    const field = (label, name, value, opts = {}) => `
      <div class="${opts.full ? 'sm:col-span-2' : ''}">
        <label class="block text-xs text-zinc-400 mb-1">${label}</label>
        <input name="${name}" type="${opts.type || 'text'}" value="${F.escapeHtml(String(value ?? ''))}" placeholder="${F.escapeHtml(opts.ph || '')}" ${canUpdate ? '' : 'disabled'} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        ${opts.hint ? `<p class="text-[11px] text-zinc-500 mt-1">${opts.hint}</p>` : ''}
      </div>`;
    const checkbox = (label, name, checked, hint = '') => `
      <label class="flex items-start gap-2 text-sm text-zinc-300 cursor-pointer">
        <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} class="mt-0.5 rounded bg-zinc-800 border-zinc-700" />
        <span>${label}${hint ? `<span class="block text-[11px] text-zinc-500">${hint}</span>` : ''}</span>
      </label>`;

    const listenNow = listen ? `${listen.ssl ? 'https' : 'http'}://${listen.host || 'localhost'}:${listen.port}` : '';

    root.innerHTML = `<div class="p-6 max-w-2xl mx-auto space-y-5">
      <form id="settings-form" class="space-y-5">

        ${UI.card('Giao diện & phiên', `<div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Tên site', 'siteName', settings.siteName, { full: true, hint: 'Hiển thị ở sidebar & tiêu đề trang đăng nhập.' })}
          ${field('Mô tả trang đăng nhập', 'loginSubtitle', settings.loginSubtitle, { full: true, hint: 'Dòng phụ đề ở trang đăng nhập.' })}
          ${field('Hết phiên (phút)', 'sessionTimeoutMinutes', settings.sessionTimeoutMinutes, { type: 'number', hint: 'Khi KHÔNG "Ghi nhớ".' })}
          ${field('Ghi nhớ đăng nhập (ngày)', 'rememberDays', settings.rememberDays, { type: 'number' })}
          ${field('Giữ audit log (ngày)', 'auditRetentionDays', settings.auditRetentionDays, { type: 'number' })}
          <div class="sm:col-span-2">${checkbox('Ghi audit cho cả thao tác Xem (GET)', 'auditLogReads', settings.auditLogReads, 'Nhiều log hơn.')}</div>
        </div>`)}

        ${UI.card('Máy chủ Panel', `<div class="p-5 space-y-4">
          <div class="rounded-lg bg-amber-900/20 border border-amber-800/50 p-3 text-[11px] text-amber-200/90 leading-relaxed">
            <b>Đổi Port / SSL</b> sẽ chuyển địa chỉ truy cập panel. Hệ thống <b>kiểm tra port trống & chứng chỉ hợp lệ TRƯỚC</b> khi áp dụng — sai thì không lưu; xong trình duyệt tự chuyển sang địa chỉ mới.
            <span class="block mt-1 text-zinc-400">Đang chạy tại: <span class="font-mono text-zinc-300">${F.escapeHtml(listenNow)}</span> · Panel luôn nghe trên <b>mọi interface</b> nên <b>localhost</b> luôn vào được (chống tự khóa).</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${field('Server IP', 'serverIP', settings.serverIP, { ph: 'vd 203.0.113.10', hint: 'IP quảng bá: dùng làm SAN của cert & kiểm tra cho ACME (không giới hạn interface lắng nghe).' })}
            ${field('Server Port', 'serverPort', settings.serverPort || '', { type: 'number', ph: `${(listen && listen.port) || 3000}`, hint: 'Để trống/0 = dùng PORT trong .env.' })}
          </div>
          <div>${checkbox('Panel SSL — bật HTTPS cho trang', 'panelSSL', settings.panelSSL, '<b>Bắt buộc có Server IP và Server Port.</b> Để trống Cert/Key file bên dưới thì hệ thống tự tạo chứng chỉ.')}</div>
          <div id="ssl-opts" class="${settings.panelSSL ? '' : 'hidden'} space-y-4 pl-1 border-l-2 border-zinc-800">
            <div class="pl-3 space-y-4">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Chế độ chứng chỉ (khi để trống Cert/Key file)</label>
                <select name="sslMode" ${canUpdate ? '' : 'disabled'} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                  <option value="selfsigned" ${settings.sslMode !== 'acme' ? 'selected' : ''}>Self-signed — tự tạo (mọi nơi, kể cả LAN; trình duyệt cảnh báo)</option>
                  <option value="acme" ${settings.sslMode === 'acme' ? 'selected' : ''}>Let's Encrypt (ACME) — cert thật (cần domain public + port 80)</option>
                </select>
                ${sslStatusLine}
              </div>
              <div id="acme-opts" class="${settings.sslMode === 'acme' ? '' : 'hidden'} space-y-4">
                <div class="rounded-lg bg-sky-900/20 border border-sky-800/50 p-3 text-[11px] text-sky-200/90 leading-relaxed">
                  Let's Encrypt xác minh qua <span class="font-mono">http://&lt;domain&gt;/.well-known/acme-challenge/…</span> — cần <b>Domain</b> (mục Bảo mật) trỏ về máy này và <b>port 80 mở ra internet</b>. IP LAN/nội bộ không dùng được.
                </div>
                ${field('Email đăng ký (ACME)', 'acmeEmail', settings.acmeEmail, { full: true, ph: 'you@example.com' })}
                ${checkbox('Tự gia hạn (AutoRenew) khi cert gần hết hạn', 'acmeAutoRenew', settings.acmeAutoRenew)}
                ${checkbox('Dùng Let’s Encrypt staging (thử nghiệm — cert KHÔNG tin cậy)', 'acmeStaging', settings.acmeStaging)}
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${field('SSL Cert file (tùy chọn)', 'sslCertFile', settings.sslCertFile, { ph: 'để trống = tự tạo' })}
                ${field('SSL Key file (tùy chọn)', 'sslKeyFile', settings.sslKeyFile, { ph: 'để trống = tự tạo' })}
              </div>
            </div>
          </div>
        </div>`)}

        ${UI.card('Bảo mật', `<div class="p-5 space-y-4">
          ${field('FRP API Timeout (ms)', 'frpApiTimeout', settings.frpApiTimeout, { type: 'number', hint: 'Thời gian chờ tối đa khi gọi Admin API của frps/frpc (1000–120000).' })}
          <div class="border-t border-zinc-800 pt-4 space-y-3">
            ${checkbox('Tin X-Forwarded-For (đứng sau reverse-proxy / frp tunnel)', 'trustProxy', settings.trustProxy, 'BẬT khi truy cập panel qua reverse-proxy hoặc frp tunnel → audit / API Error Logs / User Manager lấy đúng IP client thật (từ X-Forwarded-For). TẮT khi vào trực tiếp (chống giả mạo IP).')}
            ${checkbox('Google Authenticator — bắt buộc bật 2FA', 'require2fa', settings.require2fa, 'Mọi user chưa bật 2FA sẽ bị chặn cho tới khi bật (System → Profile). Có thể bắt riêng theo role bằng quyền “security.req2fa”.')}
            ${checkbox('Strong password — bắt buộc mật khẩu mạnh', 'strongPassword', settings.strongPassword, 'Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Áp dụng cho mật khẩu đặt mới.')}
          </div>
          <div class="border-t border-zinc-800 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${field('Domain', 'panelDomain', settings.panelDomain, { full: true, ph: 'panel.example.com', hint: 'Chỉ cho truy cập panel qua đúng domain này. Để trống = mọi host.' })}
            ${field('Security Entrance', 'securityEntrance', settings.securityEntrance, { full: true, ph: '/f5bce1a2', hint: 'Đường dẫn bí mật để vào panel. Truy cập đúng path mới hiện panel, sai → 404. Để trống = tắt.' })}
          </div>
          <div class="rounded-lg bg-amber-900/20 border border-amber-800/50 p-3 text-[11px] text-amber-200/90">
            <b>Domain / Security Entrance</b> nhập sai có thể khóa bạn khỏi panel. Yên tâm: truy cập từ <b>localhost/127.0.0.1</b> luôn bỏ qua 2 lớp này để bạn vào sửa lại.
          </div>
        </div>`)}

        ${UI.card('Firewall (IP blacklist)', `<div class="p-5 space-y-4">
          ${checkbox('Bật Firewall — chặn IP nằm trong blacklist', 'firewallEnabled', settings.firewallEnabled, 'Chặn request tới panel từ IP xấu. Localhost luôn được bỏ qua (chống tự khóa). Quản lý & tra cứu ở <b>System → Firewall</b>.')}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Chế độ</label>
              <select name="firewallMode" ${canUpdate ? '' : 'disabled'} class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                <option value="block" ${settings.firewallMode !== 'monitor' ? 'selected' : ''}>Chặn (trả 403)</option>
                <option value="monitor" ${settings.firewallMode === 'monitor' ? 'selected' : ''}>Giám sát (không chặn, chỉ đếm)</option>
              </select>
              <p class="text-[11px] text-zinc-500 mt-1">Dùng <b>Giám sát</b> để thử trước khi bật chặn thật.</p>
            </div>
            <div class="flex items-start pt-6">${checkbox('Tự cập nhật mỗi ngày 00:00', 'firewallAutoUpdate', settings.firewallAutoUpdate, 'Tự tải lại nguồn + build lại nhị phân hàng ngày.')}</div>
          </div>
          ${field('Nguồn blacklist (URL)', 'firewallSourceUrl', settings.firewallSourceUrl, { full: true, ph: 'https://…/inbound.txt', hint: 'File text mỗi dòng 1 IP hoặc CIDR. Mặc định: bitwire-it/ipblocklist.' })}
        </div>`)}

        <div id="settings-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
        ${canUpdate ? `<div>${UI.btn('Lưu cấu hình', { variant: 'primary', attrs: 'id="settings-save"' })}</div>` : '<p class="text-xs text-zinc-500">Bạn không có quyền sửa cấu hình.</p>'}
      </form>
    </div>`;

    // Hiện/ẩn tùy chọn SSL & ACME theo lựa chọn
    const formEl = root.querySelector('#settings-form');
    formEl.querySelector('[name=panelSSL]')?.addEventListener('change', (e) => {
      root.querySelector('#ssl-opts').classList.toggle('hidden', !e.target.checked);
    });
    formEl.querySelector('[name=sslMode]')?.addEventListener('change', (e) => {
      root.querySelector('#acme-opts').classList.toggle('hidden', e.target.value !== 'acme');
    });

    if (!canUpdate) return;
    root.querySelector('#settings-save').addEventListener('click', async () => {
      const f = root.querySelector('#settings-form').elements;
      const errBox = root.querySelector('#settings-error');
      errBox.classList.add('hidden');
      const payload = {
        siteName: f.siteName.value.trim(),
        loginSubtitle: f.loginSubtitle.value.trim(),
        sessionTimeoutMinutes: Number(f.sessionTimeoutMinutes.value),
        rememberDays: Number(f.rememberDays.value),
        auditRetentionDays: Number(f.auditRetentionDays.value),
        auditLogReads: f.auditLogReads.checked,
        serverIP: f.serverIP.value.trim(),
        serverPort: Number(f.serverPort.value) || 0,
        panelSSL: f.panelSSL.checked,
        sslMode: f.sslMode.value,
        sslCertFile: f.sslCertFile.value.trim(),
        sslKeyFile: f.sslKeyFile.value.trim(),
        acmeEmail: f.acmeEmail.value.trim(),
        acmeAutoRenew: f.acmeAutoRenew.checked,
        acmeStaging: f.acmeStaging.checked,
        trustProxy: f.trustProxy.checked,
        frpApiTimeout: Number(f.frpApiTimeout.value),
        require2fa: f.require2fa.checked,
        strongPassword: f.strongPassword.checked,
        panelDomain: f.panelDomain.value.trim(),
        securityEntrance: f.securityEntrance.value.trim(),
        firewallEnabled: f.firewallEnabled.checked,
        firewallMode: f.firewallMode.value,
        firewallAutoUpdate: f.firewallAutoUpdate.checked,
        firewallSourceUrl: f.firewallSourceUrl.value.trim(),
      };
      try {
        const res = await API.updateSettings(payload);
        Store.state.settings.siteName = res.settings.siteName;
        Store.state.settings.loginSubtitle = res.settings.loginSubtitle;
        if (res.panel && res.panel.changed) {
          UI.toast(`Địa chỉ panel đổi sang ${res.panel.url} — đang chuyển...`, 'info');
          setTimeout(() => { window.location.href = res.panel.url; }, 2500);
        } else {
          UI.toast('Đã lưu cấu hình.', 'success');
          App.rerender();
        }
      } catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
    });
  },
};
