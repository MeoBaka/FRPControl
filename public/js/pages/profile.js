/* Cài đặt tài khoản của chính user: đổi tên, đổi mật khẩu, 2FA. */
window.Pages = window.Pages || {};
Pages['profile'] = {
  title: 'Cài đặt tài khoản',
  subtitle: 'Hồ sơ, mật khẩu và bảo mật 2 lớp',
  async render(root) {
    App.setToolbar('');
    const F = Fmt;
    const u = Store.state.user;
    const has2fa = u.twoFactorEnabled;

    root.innerHTML = `<div class="p-6 max-w-2xl mx-auto space-y-4">
      ${UI.card('Thông tin', `
        <form id="profile-form" class="p-5 space-y-4">
          <div><label class="block text-xs text-zinc-400 mb-1">Username</label>
            <input value="${F.escapeHtml(u.username)}" disabled class="w-full rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm text-zinc-500" /></div>
          <div><label class="block text-xs text-zinc-400 mb-1">Tên hiển thị</label>
            <input name="displayName" value="${F.escapeHtml(u.displayName || '')}" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
          <div id="profile-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
          <div>${UI.btn('Lưu', { variant: 'primary', attrs: 'id="profile-save"' })}</div>
        </form>`)}

      ${UI.card('Đổi mật khẩu', `
        <form id="pw-form" class="p-5 space-y-4">
          <div><label class="block text-xs text-zinc-400 mb-1">Mật khẩu hiện tại</label>
            <input name="currentPassword" type="password" autocomplete="current-password" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs text-zinc-400 mb-1">Mật khẩu mới</label>
              <input name="newPassword" type="password" autocomplete="new-password" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
            <div><label class="block text-xs text-zinc-400 mb-1">Nhập lại mật khẩu mới</label>
              <input name="confirmPassword" type="password" autocomplete="new-password" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
          </div>
          <div id="pw-error" class="hidden rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
          <div>${UI.btn('Đổi mật khẩu', { variant: 'primary', attrs: 'id="pw-save"' })}</div>
        </form>`)}

      ${UI.card('Xác thực 2 lớp (2FA)', `
        <div class="p-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm">Trạng thái:</span>
                ${has2fa
                  ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><i class="fa-solid fa-shield-halved"></i> Đang bật</span>'
                  : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/40">Đang tắt</span>'}
              </div>
              <p class="text-xs text-zinc-500 mt-1">Bảo vệ tài khoản bằng mã một lần từ ứng dụng Authenticator (Google Authenticator, Authy...).</p>
            </div>
            ${has2fa
              ? UI.btn('<i class="fa-solid fa-shield-halved"></i> Tắt 2FA', { variant: 'danger', attrs: 'id="disable-2fa"' })
              : UI.btn('<i class="fa-solid fa-shield-halved"></i> Bật 2FA', { variant: 'primary', attrs: 'id="enable-2fa"' })}
          </div>
        </div>`)}
    </div>`;

    // Đổi tên hiển thị
    root.querySelector('#profile-save').addEventListener('click', async () => {
      const f = root.querySelector('#profile-form').elements;
      const errBox = root.querySelector('#profile-error'); errBox.classList.add('hidden');
      try {
        await API.updateProfile(f.displayName.value.trim());
        await refreshMe();
        UI.toast('Đã lưu hồ sơ.', 'success');
        App.rerender();
      } catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
    });

    // Đổi mật khẩu
    root.querySelector('#pw-save').addEventListener('click', async () => {
      const f = root.querySelector('#pw-form').elements;
      const errBox = root.querySelector('#pw-error'); errBox.classList.add('hidden');
      if (f.newPassword.value !== f.confirmPassword.value) { errBox.textContent = '✗ Mật khẩu nhập lại không khớp.'; errBox.classList.remove('hidden'); return; }
      try {
        await API.changePassword(f.currentPassword.value, f.newPassword.value);
        UI.toast('Đã đổi mật khẩu. Các phiên khác đã bị đăng xuất.', 'success');
        f.currentPassword.value = f.newPassword.value = f.confirmPassword.value = '';
      } catch (err) { errBox.textContent = '✗ ' + err.message; errBox.classList.remove('hidden'); }
    });

    // 2FA
    root.querySelector('#enable-2fa')?.addEventListener('click', openEnable2faModal);
    root.querySelector('#disable-2fa')?.addEventListener('click', openDisable2faModal);
  },
};

async function refreshMe() {
  try { const me = await API.me(); Store.setAuth(me); } catch { /* ignore */ }
}

function loadQrLib() {
  return new Promise((resolve) => {
    if (window.QRCode) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function openEnable2faModal() {
  const step1 = `
    <div id="twofa-step">
      <p class="text-sm text-zinc-400 mb-3">Xác nhận mật khẩu để bắt đầu bật 2FA.</p>
      <input id="twofa-pass" type="password" autocomplete="current-password" placeholder="Mật khẩu hiện tại" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none" />
      <div id="twofa-error" class="hidden mt-3 rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
      <div class="flex justify-end gap-2 mt-4">
        ${UI.btn('Hủy', { attrs: 'data-modal-close' })}
        ${UI.btn('Tiếp tục', { variant: 'primary', attrs: 'id="twofa-continue"' })}
      </div>
    </div>`;

  UI.openModal({
    title: 'Bật xác thực 2 lớp', body: step1, size: 'md',
    onMount(rootEl) {
      const err = () => rootEl.querySelector('#twofa-error');
      const showErr = (m) => { const e = err(); e.textContent = '✗ ' + m; e.classList.remove('hidden'); };

      rootEl.querySelector('#twofa-continue').addEventListener('click', async () => {
        const pass = rootEl.querySelector('#twofa-pass').value;
        if (!pass) return showErr('Nhập mật khẩu.');
        try {
          const { secret, otpauthUrl } = await API.setup2fa(pass);
          renderStep2(rootEl, secret, otpauthUrl);
        } catch (e) { showErr(e.message); }
      });
    },
  });
}

async function renderStep2(rootEl, secret, otpauthUrl) {
  const container = rootEl.querySelector('#twofa-step');
  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  container.innerHTML = `
    <p class="text-sm text-zinc-400 mb-3">1. Quét mã QR bằng ứng dụng Authenticator, hoặc nhập thủ công khóa bên dưới.</p>
    <div class="flex flex-col items-center gap-3">
      <div id="qr-box" class="bg-white p-3 rounded-lg" style="min-width:186px;min-height:186px;display:flex;align-items:center;justify-content:center;"><span class="text-xs text-zinc-500">Đang tạo QR...</span></div>
      <div class="text-center">
        <div class="text-[11px] text-zinc-500">Khóa thủ công</div>
        <code class="text-sm text-zinc-200 tracking-wider select-all">${Fmt.escapeHtml(grouped)}</code>
      </div>
    </div>
    <p class="text-sm text-zinc-400 mt-4 mb-2">2. Nhập mã 6 số hiển thị trong app để xác nhận.</p>
    <input id="twofa-token" inputmode="numeric" maxlength="6" placeholder="123456" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-center tracking-widest focus:border-brand-500 focus:outline-none" />
    <div id="twofa-error" class="hidden mt-3 rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>
    <div class="flex justify-end gap-2 mt-4">
      ${UI.btn('Hủy', { attrs: 'data-modal-close' })}
      ${UI.btn('Xác nhận & Bật', { variant: 'primary', attrs: 'id="twofa-enable"' })}
    </div>`;

  // render QR
  const box = container.querySelector('#qr-box');
  const ok = await loadQrLib();
  box.innerHTML = '';
  if (ok && window.QRCode) {
    try { new window.QRCode(box, { text: otpauthUrl, width: 160, height: 160, correctLevel: window.QRCode.CorrectLevel.M }); }
    catch { box.innerHTML = '<span class="text-xs text-zinc-600">Không tạo được QR, dùng khóa thủ công.</span>'; }
  } else {
    box.innerHTML = '<span class="text-xs text-zinc-600 text-center px-2">Không tải được thư viện QR (offline). Nhập khóa thủ công phía dưới.</span>';
  }

  const showErr = (m) => { const e = container.querySelector('#twofa-error'); e.textContent = '✗ ' + m; e.classList.remove('hidden'); };
  container.querySelector('#twofa-enable').addEventListener('click', async () => {
    const token = container.querySelector('#twofa-token').value.trim();
    if (!/^\d{6}$/.test(token)) return showErr('Nhập mã 6 số.');
    try {
      await API.enable2fa(token);
      await refreshMe();
      UI.closeModal();
      UI.toast('Đã bật 2FA.', 'success');
      App.rerender();
    } catch (e) { showErr(e.message); }
  });
  // re-wire nút Hủy mới
  container.querySelector('[data-modal-close]').addEventListener('click', UI.closeModal);
}

function openDisable2faModal() {
  const body = `
    <p class="text-sm text-zinc-400 mb-3">Xác nhận mật khẩu để tắt xác thực 2 lớp.</p>
    <input id="dis-pass" type="password" autocomplete="current-password" placeholder="Mật khẩu hiện tại" class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none" />
    <div id="dis-error" class="hidden mt-3 rounded-lg px-3 py-2 text-sm bg-red-900/40 border border-red-700 text-red-200"></div>`;
  const footer = UI.btn('Hủy', { attrs: 'data-modal-close' }) + UI.btn('Tắt 2FA', { variant: 'danger', attrs: 'id="dis-confirm"' });
  UI.openModal({
    title: 'Tắt xác thực 2 lớp', body, footer, size: 'md',
    onMount(rootEl) {
      rootEl.querySelector('#dis-confirm').addEventListener('click', async () => {
        const pass = rootEl.querySelector('#dis-pass').value;
        const err = rootEl.querySelector('#dis-error'); err.classList.add('hidden');
        if (!pass) { err.textContent = '✗ Nhập mật khẩu.'; err.classList.remove('hidden'); return; }
        try {
          await API.disable2fa(pass);
          await refreshMe();
          UI.closeModal();
          UI.toast('Đã tắt 2FA.', 'success');
          App.rerender();
        } catch (e) { err.textContent = '✗ ' + e.message; err.classList.remove('hidden'); }
      });
    },
  });
}
