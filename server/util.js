/* 小工具：随机 ID、编辑凭据哈希、IP 速率限制、请求体读取 */
'use strict';

const crypto = require('crypto');
const { config } = require('./config.js');

/* 不可猜测的公开 ID：72 bit 随机，base64url 12 字符 */
function newGameId() {
  return crypto.randomBytes(9).toString('base64url');
}

/* 编辑凭据：192 bit 随机，仅创建时返回一次；服务端只存 sha256 哈希 */
function newEditToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

/* 滑动窗口 IP 限速（进程内） */
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= limit) {
    const retryMs = windowMs - (now - arr[0]);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  arr.push(now);
  return { ok: true };
}

/* 定期清理限速桶，避免长跑内存增长 */
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    while (arr.length && now - arr[0] > config.GEN_PER_IP_WINDOW_MS) arr.shift();
    if (!arr.length) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

/* 读请求体，超过上限直接拒绝（413）。
 * 策略：暂停接收（不继续读入内存），让调用方先回响应，再由 Node 关闭连接丢弃剩余数据。 */
function readBody(req, limitBytes) {
  const limit = limitBytes || config.BODY_LIMIT_BYTES;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        try { req.pause(); } catch (e) {}
        const err = new Error('请求体过大');
        err.code = 'too_large';
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

function todayKey(d) {
  const t = d || new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

module.exports = { newGameId, newEditToken, hashToken, timingSafeEqualHex, clientIp, rateLimit, readBody, todayKey };
