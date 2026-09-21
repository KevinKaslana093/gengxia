/* HTTP 服务入口：静态资源 + JSON API + SPA 路由回退 + 优雅退出 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const { config, safeSummary } = require('./config.js');
const db = require('./db.js');
const { ensurePresets } = require('./seed.js');
const api = require('./routes/api.js');
const { serveFile, safeJoin, looksLikeAsset } = require('./static.js');

/* ---------------- 启动 ---------------- */
db.open(config.DB_PATH);
const seedResult = ensurePresets();

function securityHeaders(extra) {
  return Object.assign({
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }, extra || {});
}

function sendPlain(res, status, text) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    /* ---- API ---- */
    if (pathname === '/api/health' && method === 'GET') return api.handleHealth(res);
    if (pathname === '/api/gallery' && method === 'GET') return api.handleGallery(res);
    if (pathname === '/api/scenes' && method === 'GET') return api.handleScenes(res);

    if (pathname === '/api/games' && method === 'POST') return await api.handleCreate(req, res);

    const gm = /^\/api\/games\/([A-Za-z0-9_-]{4,32})$/.exec(pathname);
    if (gm) {
      const id = gm[1];
      if (method === 'GET') return api.handleGet(res, id);
      if (method === 'PATCH') return await api.handlePatch(req, res, id);
      if (method === 'OPTIONS') {
        res.writeHead(204, securityHeaders({ 'Allow': 'GET, PATCH, OPTIONS' }));
        return res.end();
      }
      return api.sendError(res, 405, 'method_not_allowed', '不支持的请求方法');
    }

    if (pathname.startsWith('/api/')) {
      return api.sendError(res, 404, 'not_found', '接口不存在');
    }

    /* ---- 静态资源 ---- */
    if (method !== 'GET' && method !== 'HEAD') return sendPlain(res, 405, 'Method Not Allowed');

    /* /shared/* 映射到项目根目录的 shared/（前后端共用的 Schema，单一事实来源，
     * 不做文件复制）。这条必须放在 SPA 回退之前，否则 <script src="/shared/schema.js">
     * 会拿到 index.html，被浏览器以 MIME 不符拒绝执行。 */
    if (pathname.startsWith('/shared/')) {
      const sharedPath = safeJoin(path.join(config.ROOT, 'shared'), pathname.slice('/shared'.length));
      if (sharedPath && serveFile(res, sharedPath, { ifNoneMatch: req.headers['if-none-match'] })) return;
      return sendPlain(res, 404, 'Not Found');
    }

    let filePath = null;
    if (pathname !== '/' && pathname.indexOf('.') !== -1) {
      filePath = safeJoin(config.PUBLIC_DIR, pathname);
      if (filePath && fs.existsSync(filePath)) {
        const ok = serveFile(res, filePath, { ifNoneMatch: req.headers['if-none-match'] });
        if (ok) return;
      }
      /* 看起来像静态资源但没有对应文件：返回真实 404。
       * 绝不回退成 index.html —— 那会让缺失的脚本/样式以 text/html 形式"成功"返回，
       * 既掩盖问题又让浏览器报错。 */
      if (looksLikeAsset(pathname)) {
        return sendPlain(res, 404, 'Not Found');
      }
    }

    /* ---- SPA 回退：/、/g/:id 等无扩展名的前端路由返回 index.html ---- */
    const indexPath = path.join(config.PUBLIC_DIR, 'index.html');
    if (serveFile(res, indexPath, { noCache: true, ifNoneMatch: req.headers['if-none-match'] })) return;
    return sendPlain(res, 500, '缺少 public/index.html');
  } catch (e) {
    console.error('[http] 未捕获错误：', e && e.stack ? e.stack : e);
    if (!res.headersSent) {
      try { api.sendError(res, 500, 'server_error', '服务端内部错误'); }
      catch (_) { try { res.end(); } catch (__) {} }
    } else {
      try { res.end(); } catch (__) {}
    }
  }
});

server.headersTimeout = 65000;
server.requestTimeout = 10 * 60 * 1000;   // 生成请求可能跑挺久(流式)，给足时间

/* 客户端提前断开（如超大请求体被拒后）：只记日志，不崩溃 */
server.on('clientError', (err, socket) => {
  if (err && err.code === 'ECONNRESET') { try { socket.destroy(); } catch (e) {} return; }
  try {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  } catch (e) { try { socket.destroy(); } catch (_) {} }
});

server.listen(config.PORT, config.HOST, () => {
  const s = safeSummary();
  console.log('梗一下 服务已启动');
  console.log('  地址      : http://' + (config.HOST === '0.0.0.0' ? 'localhost' : config.HOST) + ':' + config.PORT);
  console.log('  模型      : ' + s.provider + ' / ' + s.model + ' @ ' + s.baseUrl);
  console.log('  密钥      : ' + (s.apiKeyConfigured ? '已配置 (' + s.apiKeyOrigin + ')' : '未配置 — 生成将返回错误，预设游戏仍可玩'));
  console.log('  生成开关  : ' + (s.generationEnabled ? '开' : '关') + ' | 每日上限 ' + s.dailyLimit + ' | 并发 ' + s.maxConcurrency);
  console.log('  数据库    : ' + s.dbPath + '（共 ' + seedResult.total + ' 个游戏；预设新增 ' + seedResult.created + '，升级 ' + seedResult.upgraded + '）');
  console.log('  场景/玩法 : ' + require('../shared/scenes.js').sceneIds().length + ' 套场景 · ' + Object.keys(require('../shared/schema.js').MODES).join(' / '));
});

let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n收到 ' + sig + '，正在关闭…');
  server.close(() => { console.log('已关闭'); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e); });
