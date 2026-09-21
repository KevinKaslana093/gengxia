/* 静态资源服务：MIME、缓存头、ETag、路径穿越防护 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/* 带扩展名但未找到的请求：绝不回退成 HTML（否则 <script> 会拿到 text/html 被浏览器拒绝）。
 * 这些路径必须返回真实的 404，避免"缺失资源伪装成成功"。 */
const ASSET_EXT_RE = /\.[A-Za-z0-9]{1,8}$/;

function looksLikeAsset(pathname) {
  return ASSET_EXT_RE.test(pathname.split('?')[0]);
}

function safeJoin(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^([/\\])+/, '');
  const full = path.join(rootDir, clean);
  const rootResolved = path.resolve(rootDir);
  const fullResolved = path.resolve(full);
  if (fullResolved !== rootResolved && !fullResolved.startsWith(rootResolved + path.sep)) return null;
  return fullResolved;
}

function serveFile(res, filePath, opts) {
  let st;
  try { st = fs.statSync(filePath); } catch (e) { return false; }
  if (!st.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const etag = '"' + crypto.createHash('sha1').update(String(st.size) + '-' + String(st.mtimeMs)).digest('hex').slice(0, 20) + '"';

  const headers = {
    'Content-Type': mime,
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  };
  if (opts && opts.noCache) {
    headers['Cache-Control'] = 'no-cache';
  } else if (/\.(js|css|svg|png|woff2)$/.test(ext)) {
    headers['Cache-Control'] = 'public, max-age=300';
  } else {
    headers['Cache-Control'] = 'no-cache';
  }

  const inm = opts && opts.ifNoneMatch;
  if (inm && inm === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = { serveFile, safeJoin, MIME, looksLikeAsset };
