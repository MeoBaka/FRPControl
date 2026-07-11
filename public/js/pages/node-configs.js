/* Node Configs — xem/sửa file cấu hình toml của FRPC + reload/stop. */
window.Pages = window.Pages || {};
Pages['nodes/configs'] = {
  title: 'Node Configs',
  subtitle: 'Xem & chỉnh sửa cấu hình frpc',
  async render(root) {
    const canControl = Store.can('configs.control');
    const canUpdate = Store.can('configs.update');
    App.setToolbar(
      (canControl ? UI.btn('<i class="fa-solid fa-arrows-rotate"></i> Reload', { size: 'sm', attrs: 'id="reload"' }) +
      UI.btn('<i class="fa-solid fa-stop"></i> Stop', { size: 'sm', variant: 'danger', attrs: 'id="stop"' }) : ''),
      (el) => {
        el.querySelector('#reload')?.addEventListener('click', async () => {
          const node = Store.selectedNode(); if (!node) return;
          try { await API.reload(node.id); UI.toast('Đã gửi reload.', 'success'); }
          catch (err) { UI.toast('Reload lỗi: ' + err.message, 'error'); }
        });
        el.querySelector('#stop')?.addEventListener('click', async () => {
          const node = Store.selectedNode(); if (!node) return;
          if (!confirm(`Dừng frpc "${node.name}"? Bạn sẽ mất kết nối tới nó.`)) return;
          try { await API.stop(node.id); UI.toast('Đã gửi stop.', 'success'); }
          catch (err) { UI.toast('Stop lỗi: ' + err.message, 'error'); }
        });
      }
    );
    const nodes = Store.activeNodes();
    if (!nodes.length) { root.innerHTML = `<div class="p-6">${UI.errorBox('Chưa có node nào đang bật.', 'Tất cả node đã tắt — bật lại ở trang Nodes.')}</div>`; return; }
    const node = Store.selectedNode();

    root.innerHTML = `<div class="p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">${UI.selectorBar('node')}</div>
      ${UI.card('Cấu hình frpc (file tổng)', `
        <div class="p-4">
          <textarea id="config-editor" spellcheck="false" placeholder="Đang tải cấu hình..." class="w-full h-[420px] rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none"></textarea>
          <p class="text-[11px] text-zinc-500 mt-2">"Lưu &amp; áp dụng" gửi PUT /api/config rồi reload để frpc nạp cấu hình mới.</p>
        </div>`,
        UI.btn('Tải lại', { size: 'sm', attrs: 'id="load"' }) + (canUpdate ? UI.btn('Lưu & áp dụng', { size: 'sm', variant: 'primary', attrs: 'id="save"' }) : '')
      )}
    </div>`;
    UI.wireSelector(root);

    const editor = root.querySelector('#config-editor');
    const load = async () => {
      editor.value = 'Đang tải...';
      try { const { content } = await API.getConfig(node.id); editor.value = content || ''; }
      catch (err) { editor.value = ''; UI.toast('Tải config lỗi: ' + err.message, 'error'); }
    };
    await load();

    root.querySelector('#load').addEventListener('click', load);
    root.querySelector('#save')?.addEventListener('click', async () => {
      if (!editor.value.trim()) return UI.toast('Nội dung trống.', 'error');
      if (!confirm('Ghi đè cấu hình frpc và reload?')) return;
      try {
        await API.putConfig(node.id, editor.value);
        await API.reload(node.id);
        UI.toast('Đã lưu và reload.', 'success');
      } catch (err) { UI.toast('Lưu lỗi: ' + err.message, 'error'); }
    });
  },
};
