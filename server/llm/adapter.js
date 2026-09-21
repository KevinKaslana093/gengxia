/* 模型调用适配层：支持 openai-compat / ollama 原生 / mock 三种 provider，环境变量切换。
 * 统一错误码：timeout | rate_limited | auth_error | server_error | network | bad_response */
'use strict';

const { config } = require('../config.js');

class LlmError extends Error {
  constructor(code, message, meta) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.meta = meta || {};
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 全局并发闸门，避免瞬间打爆接口 */
let active = 0;
const waiters = [];
function acquire() {
  if (active < config.LLM_MAX_CONCURRENCY) { active++; return Promise.resolve(); }
  return new Promise(res => waiters.push(res));
}
function release() {
  const next = waiters.shift();
  if (next) next(); else active--;
}

function buildRequest(messages) {
  const provider = config.LLM_PROVIDER;
  const useJsonMode = config.LLM_JSON_MODE === 'on' ||
    (config.LLM_JSON_MODE === 'auto' && provider === 'openai-compat');

  if (provider === 'openai-compat') {
    const body = {
      model: config.LLM_MODEL,
      messages: messages,
      max_tokens: config.LLM_MAX_TOKENS,
      temperature: config.LLM_TEMPERATURE,
      stream: false,
    };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    return { url: config.LLM_BASE_URL.replace(/\/+$/, '') + '/chat/completions', body: body, style: 'openai' };
  }
  if (provider === 'ollama') {
    const base = config.LLM_BASE_URL.replace(/\/+$/, '').replace(/\/v1$/, '');
    const body = {
      model: config.LLM_MODEL,
      messages: messages,
      stream: false,
      options: { num_predict: config.LLM_MAX_TOKENS, temperature: config.LLM_TEMPERATURE },
    };
    if (useJsonMode) body.format = 'json';
    return { url: base + '/api/chat', body: body, style: 'ollama' };
  }
  if (provider === 'mock') {
    return { url: '', body: null, style: 'mock' };
  }
  throw new LlmError('config_error', '未知的 LLM_PROVIDER：' + provider);
}

function mockResponse() {
  return JSON.stringify({
    schemaVersion: 2,
    title: '测试小游戏',
    intro: '今晚加班到很晚，我抱着电脑一路小跑去赶末班车。',
    mode: 'dodge',
    sceneId: 'office-night',
    player: { name: '测试员', avatarId: 'hero' },
    themeId: 'office-neon',
    obstacle: { name: '测试障碍', spriteId: 'document' },
    collectible: { name: '测试星星', spriteId: 'star' },
    lines: ['这是 mock 模式', '测试通过', '不要用于正式生成'],
    ending: { low: 'mock 低分结算文案。', mid: 'mock 中分结算文案。', high: 'mock 高分结算文案。' },
  });
}

/* 单次调用。返回 { content, raw }，失败抛 LlmError */
async function callOnce(messages) {
  const req = buildRequest(messages);
  if (req.style === 'mock') {
    await sleep(150);
    return { content: mockResponse(), raw: null };
  }
  if (!config.LLM_API_KEY) throw new LlmError('auth_error', '服务端未配置模型 API 密钥');

  const headers = { 'Content-Type': 'application/json' };
  if (config.LLM_PROVIDER === 'openai-compat') headers['Authorization'] = 'Bearer ' + config.LLM_API_KEY;
  else headers['Authorization'] = 'Bearer ' + config.LLM_API_KEY;

  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new LlmError('timeout', '模型响应超时（>' + Math.round(config.LLM_TIMEOUT_MS / 1000) + ' 秒）');
    }
    throw new LlmError('network', '无法连接模型服务：' + (e && e.message ? e.message : '网络错误'));
  }

  const text = await res.text();
  if (res.status === 429) throw new LlmError('rate_limited', '模型接口限流（429）', { retryAfter: res.headers.get('retry-after') });
  if (res.status === 401 || res.status === 403) throw new LlmError('auth_error', '模型接口鉴权失败（' + res.status + '）');
  if (res.status >= 500) throw new LlmError('server_error', '模型服务错误（' + res.status + '）');
  if (res.status >= 400) throw new LlmError('bad_response', '模型接口返回错误（' + res.status + '）');

  let json = null;
  try { json = JSON.parse(text); } catch (e) { throw new LlmError('bad_response', '模型接口返回了非 JSON 响应'); }

  let content = '';
  let finish = '';
  if (req.style === 'openai') {
    const ch = (json.choices && json.choices[0]) || {};
    content = (ch.message && ch.message.content) || '';
    finish = ch.finish_reason || '';
  } else {
    // ollama 原生 /api/chat
    content = (json.message && json.message.content) || json.response || '';
    finish = json.done_reason || '';
  }
  if (!content) throw new LlmError('bad_response', '模型返回了空内容（finish=' + finish + '）', { emptyContent: true });
  return { content: content, raw: json, finishReason: finish, usage: json.usage || null };
}

/* 有限重试。
 * - 网络错误 / 5xx / 限流：重试。
 * - 「空内容」：模型把 token 预算全花在推理上（reasoning 模型常见），属于**瞬时**故障，
 *   换一次调用通常就好了 —— 不重试会让用户看到莫名失败。实测约 1/3 的调用会这样。
 * - 超时：不重试（避免请求堆积）。 */
async function callModel(messages) {
  await acquire();
  try {
    const retries = Math.max(0, Math.min(2, config.LLM_RETRY_ON_ERROR));
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await callOnce(messages);
      } catch (e) {
        lastErr = e;
        const empty = e instanceof LlmError && e.meta && e.meta.emptyContent;
        const retriable = e instanceof LlmError &&
          (['network', 'server_error', 'rate_limited'].indexOf(e.code) !== -1 || empty);
        if (!retriable || attempt === retries) throw e;
        await sleep(e.code === 'rate_limited' ? 1500 : 900);
      }
    }
    throw lastErr;
  } finally {
    release();
  }
}

module.exports = { callModel, LlmError };
