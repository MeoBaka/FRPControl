import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import tls from 'node:tls';
import { getListenConfig, getSettings } from './services/settings.service.js';
import * as ssl from './services/ssl.service.js';

/**
 * Vòng đời HTTP server + đổi Port/IP/SSL lúc chạy.
 * An toàn: luôn KIỂM TRA (port trống + cert hợp lệ) trước; chỉ chuyển khi chắc chắn mở được.
 */

let server = null;
let handler = null;     // express app
let curCfg = null;      // cfg đầy đủ của listener hiện tại (kèm cert/key file)

function buildCreds(cfg) {
  let cert, key;
  try { cert = fs.readFileSync(cfg.certFile); key = fs.readFileSync(cfg.keyFile); }
  catch (e) { const err = new Error('Không đọc được file chứng chỉ/khóa SSL: ' + e.message); err.status = 400; throw err; }
  try { tls.createSecureContext({ cert, key }); }
  catch (e) { const err = new Error('Chứng chỉ/khóa SSL không hợp lệ: ' + e.message); err.status = 400; throw err; }
  return { cert, key };
}

function listen(cfg, creds) {
  const srv = creds ? https.createServer(creds, handler) : http.createServer(handler);
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      srv.removeListener('listening', onOk);
      const err = new Error(e.code === 'EADDRINUSE' ? `Cổng ${cfg.port} đang bị chiếm.` : `Không mở được cổng ${cfg.port}: ${e.message}`);
      err.status = 400; reject(err);
    };
    const onOk = () => { srv.removeListener('error', onErr); resolve(srv); };
    srv.once('error', onErr);
    srv.once('listening', onOk);
    srv.listen(cfg.port, cfg.host || undefined);
  });
}

function closeServer(srv) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try { srv.close(finish); srv.closeIdleConnections?.(); } catch { finish(); }
    setTimeout(() => { try { srv.closeAllConnections?.(); } catch { /* ignore */ } finish(); }, 1500);
  });
}

function listenerEqual(a, b) {
  return a && b && a.port === b.port && (a.host || '') === (b.host || '') && Boolean(a.ssl) === Boolean(b.ssl);
}

// ---------------- ACME (Let's Encrypt) nền ----------------
let acmeBusy = false;
function triggerAcme(reason) {
  if (acmeBusy) return;
  const s = getSettings();
  if (!s.panelSSL || s.sslMode !== 'acme' || (s.sslCertFile && s.sslKeyFile)) return;
  if (!ssl.acmeNeedsIssue(s)) return;
  acmeBusy = true;
  console.log(`[FRPControl] ACME: xin/gia hạn cert cho ${s.panelDomain} (${reason})...`);
  ssl.obtainAcmeCert(s)
    .then(async () => {
      console.log('[FRPControl] ACME: thành công — nạp lại cert.');
      try { await applyServer(getListenConfig()); } catch (e) { console.error('[FRPControl] ACME reload lỗi:', e.message); }
    })
    .catch((e) => console.error('[FRPControl] ACME thất bại:', e.message))
    .finally(() => { acmeBusy = false; });
}

let renewTimer = null;
export function startRenewScheduler() {
  if (renewTimer) return;
  renewTimer = setInterval(() => {
    const s = getSettings();
    if (s.panelSSL && s.sslMode === 'acme' && s.acmeAutoRenew) triggerAcme('auto-renew');
  }, 12 * 3600 * 1000);
  renewTimer.unref?.();
}

/** Khởi động lần đầu. */
export async function startServer(app) {
  handler = app;
  await ssl.ensureCertReady(getSettings());
  const cfg = getListenConfig();
  const creds = cfg.ssl ? buildCreds(cfg) : null;
  server = await listen(cfg, creds);
  curCfg = cfg;
  if (cfg.ssl && cfg.needsAcme) triggerAcme('startup');
  return getListenInfo();
}

/**
 * KIỂM TRA cfg mong muốn có mở được không (không chuyển): cert parse được + port trống.
 * Ném lỗi (status 400) nếu không hợp lệ. Dùng trước khi lưu settings.
 */
export async function checkListen(cfg) {
  if (cfg.ssl) buildCreds(cfg);                 // cert/key phải đọc & parse được
  if (curCfg && cfg.port === curCfg.port) return; // cùng port đang dùng -> coi như trống
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', (e) => reject(Object.assign(new Error(e.code === 'EADDRINUSE' ? `Cổng ${cfg.port} đang bị chiếm.` : `Không mở được cổng ${cfg.port}: ${e.message}`), { status: 400 })));
    probe.once('listening', resolve);
    probe.listen(cfg.port, cfg.host || undefined);
  });
  await new Promise((r) => probe.close(r));
}

/** Chuyển listener sang cfg mới (đã checkListen trước đó). Nên gọi SAU khi đã trả response. */
export async function applyServer(cfg) {
  await ssl.ensureCertReady(getSettings());
  if (listenerEqual(cfg, curCfg) && !cfg.ssl) return getListenInfo();
  const creds = cfg.ssl ? buildCreds(cfg) : null;

  if (curCfg && cfg.port === curCfg.port) {
    // Cùng port -> phải đóng listener cũ trước; lỗi thì mở lại cũ (rollback).
    const old = server;
    const oldCfg = curCfg;
    await closeServer(old);
    try { server = await listen(cfg, creds); }
    catch (e) { server = await listen(oldCfg, oldCfg.ssl ? buildCreds(oldCfg) : null); throw e; }
  } else {
    // Khác port -> mở mới trước rồi đóng cũ.
    const next = await listen(cfg, creds);
    const old = server;
    server = next;
    if (old) closeServer(old);
  }
  curCfg = cfg;
  if (cfg.ssl && cfg.needsAcme) triggerAcme('apply');
  return getListenInfo();
}

export function getListenInfo() {
  if (!curCfg) return null;
  return { port: curCfg.port, host: curCfg.host || '', ssl: Boolean(curCfg.ssl) };
}
