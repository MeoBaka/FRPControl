import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns/promises';
import { URL } from 'node:url';
import { config } from '../config.js';
import { getSettings } from './settings.service.js';

/**
 * Client HTTP gọi Admin API của frps/frpc.
 * FRP dùng HTTP Basic Auth (user/password khai báo trong webServer của frps.toml / frpc.toml).
 *
 * Dùng trực tiếp module http/https built-in để kiểm soát được rejectUnauthorized
 * (hỗ trợ chứng chỉ self-signed khi bật HTTPS) — điều mà native fetch không làm được.
 */

function buildAuthHeader(user, password) {
  if (!user && !password) return {};
  const token = Buffer.from(`${user || ''}:${password || ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/**
 * Chặn SSRF tới link-local / cloud metadata (169.254.0.0/16, fe80::/10, IPv6 metadata).
 * Vẫn cho localhost/LAN vì đó là mục đích quản lý frps/frpc hợp lệ.
 */
function isBlockedHost(ip) {
  if (net.isIPv4(ip)) return ip.startsWith('169.254.');
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l.startsWith('fe80:') || l === 'fd00:ec2::254'; }
  return false;
}
async function assertSafeTarget(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let ip = host;
  if (!net.isIP(host)) {
    try { ip = (await dns.lookup(host)).address; } catch { return; } // lỗi DNS để request tự báo
  }
  if (isBlockedHost(ip)) {
    const e = new Error('Địa chỉ đích bị chặn vì lý do bảo mật (link-local / cloud metadata).');
    e.status = 400;
    throw e;
  }
}

/**
 * Gọi một endpoint Admin API.
 * @param {object} instance - instance kèm password đã giải mã ({ baseUrl, user, password, tls })
 * @param {string} apiPath - ví dụ '/api/serverinfo'
 * @param {object} [opts] - { method, body, timeout }
 * @returns {Promise<any>} JSON đã parse (hoặc text thô nếu không phải JSON)
 */
export async function callFrpApi(instance, apiPath, opts = {}) {
  const { method = 'GET', body, timeout = getSettings().frpApiTimeout || config.frpApiTimeout } = opts;

  let url;
  try {
    url = new URL(`${instance.baseUrl}${apiPath}`);
  } catch {
    const err = new Error(`baseUrl không hợp lệ: "${instance.baseUrl}"`);
    err.status = 400;
    throw err;
  }

  await assertSafeTarget(url); // chống SSRF tới link-local/metadata

  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const headers = { Accept: 'application/json', ...buildAuthHeader(instance.user, instance.password) };
  let payload;
  if (body !== undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  const requestOptions = {
    method,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    headers,
    timeout,
  };
  // Cho phép chứng chỉ self-signed khi instance bật cờ tls.
  if (isHttps && instance.tls) requestOptions.rejectUnauthorized = false;

  return new Promise((resolve, reject) => {
    const req = transport.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }

        const status = res.statusCode || 0;
        if (status >= 200 && status < 300) {
          resolve(data);
          return;
        }
        // Trích thông điệp lỗi từ body của FRP (thường là plain text, đôi khi JSON).
        let detail = '';
        if (typeof data === 'string') detail = data.trim();
        else if (data && typeof data === 'object') detail = data.error || data.message || '';
        detail = String(detail).slice(0, 300);

        const err = new Error(
          `FRP API trả về ${status}` +
            (status === 401
              ? ' — sai user/password hoặc chưa bật xác thực trên FRP.'
              : detail
                ? `: ${detail}`
                : '')
        );
        err.status = status === 401 ? 401 : 502;
        err.upstreamStatus = status;
        err.upstreamBody = data;
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const e = new Error(`Hết thời gian chờ (${timeout}ms) khi gọi ${url.href}.`);
      e.status = 504;
      reject(e);
    });

    req.on('error', (err) => {
      if (err.status) return reject(err);
      const e = new Error(`Không kết nối được tới ${url.href}: ${err.message}`);
      e.status = 502;
      e.cause = err;
      reject(e);
    });

    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
