/* Các hàm format & helper HTML dùng chung. Gắn vào window.Fmt. */
window.Fmt = (() => {
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // Unix seconds -> "x phút trước"
  function timeAgo(unixSec) {
    if (!unixSec) return '—';
    const diff = Math.floor(Date.now() / 1000) - Number(unixSec);
    if (diff < 0) return 'vừa xong';
    const units = [
      [31536000, 'năm'],
      [2592000, 'tháng'],
      [86400, 'ngày'],
      [3600, 'giờ'],
      [60, 'phút'],
    ];
    for (const [sec, label] of units) {
      const v = Math.floor(diff / sec);
      if (v >= 1) return `${v} ${label} trước`;
    }
    return `${diff} giây trước`;
  }

  function roleBadge(role) {
    const map = {
      frps: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      frpc: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    };
    const label = role === 'frps' ? 'PROVIDER' : 'NODE';
    return `<span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${map[role] || ''}">${label}</span>`;
  }

  function typeTag(type) {
    return `<span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">${escapeHtml(type)}</span>`;
  }

  // Pill trạng thái: online/running = xanh, error/closed = đỏ, khác = vàng/xám
  function statusPill(status) {
    const s = String(status || '').toLowerCase();
    let cls = 'bg-zinc-600/20 text-zinc-400 border-zinc-600/40';
    let dot = 'bg-zinc-400';
    if (['online', 'running'].includes(s)) { cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'; dot = 'bg-emerald-400'; }
    else if (['error', 'closed', 'offline', 'start error'].includes(s)) { cls = 'bg-red-500/15 text-red-400 border-red-500/30'; dot = 'bg-red-400'; }
    else if (['wait start', 'new', 'check config', 'waiting'].includes(s)) { cls = 'bg-amber-500/15 text-amber-400 border-amber-500/30'; dot = 'bg-amber-400'; }
    return `<span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${cls}"><span class="status-dot ${dot}"></span>${escapeHtml(status || '—')}</span>`;
  }

  function reachDot(reachable) {
    return `<span class="status-dot ${reachable ? 'bg-emerald-500' : 'bg-red-500'} inline-block"></span>`;
  }

  return { escapeHtml, formatBytes, timeAgo, roleBadge, typeTag, statusPill, reachDot };
})();
