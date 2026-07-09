/* Trang Dashboard — để trống theo yêu cầu (sẽ bổ sung sau). */
window.Pages = window.Pages || {};
Pages['dashboard'] = {
  title: 'Dashboard',
  subtitle: 'Tổng quan hệ thống',
  async render(root) {
    const providers = Store.providers().length;
    const nodes = Store.nodes().length;
    root.innerHTML = `
      <div class="p-6">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          ${UI.statCard({ label: 'Providers (frps)', value: providers })}
          ${UI.statCard({ label: 'Nodes (frpc)', value: nodes })}
          ${UI.statCard({ label: 'Tổng instance', value: providers + nodes })}
        </div>
        <div class="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <div class="text-4xl mb-3 opacity-40"><i class="fa-solid fa-gauge-high"></i></div>
          <p class="text-zinc-300 font-medium">Dashboard đang để trống</p>
          <p class="text-sm text-zinc-500 mt-1">Phần này sẽ được thiết kế theo yêu cầu sau. Dùng menu bên trái để quản lý Providers và Nodes.</p>
        </div>
      </div>`;
  },
};
