/* 服务端配置：环境变量优先，其次项目 .env。
 * 密钥解析顺序：LLM_API_KEY → OLLAMA_API_KEY → .env 中的 LLM_API_KEY_FILE 指定的文件里读 OLLAMA_API_KEY。
 * 密钥从不写入日志、响应或前端产物。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseDotEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

let dotenv = {};
try {
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) dotenv = parseDotEnv(fs.readFileSync(p, 'utf8'));
} catch (e) { dotenv = {}; }

function env(name, fallback) {
  if (process.env[name] !== undefined && process.env[name] !== '') return process.env[name];
  if (dotenv[name] !== undefined && dotenv[name] !== '') return dotenv[name];
  return fallback;
}
function envInt(name, fallback) {
  const v = env(name, undefined);
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function envBool(name, fallback) {
  const v = env(name, undefined);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].indexOf(String(v).toLowerCase()) !== -1;
}

/* 密钥：优先直接环境变量，其次通过 LLM_API_KEY_FILE 指向的文件（开发期复用本机 Hermes 配置）。
 * 注意：进程环境变量优先于项目 .env 文件，便于部署时覆盖本地配置。 */
function resolveApiKey() {
  if (process.env.LLM_API_KEY) return { key: process.env.LLM_API_KEY, origin: 'env:LLM_API_KEY' };
  if (process.env.OLLAMA_API_KEY) return { key: process.env.OLLAMA_API_KEY, origin: 'env:OLLAMA_API_KEY' };
  if (dotenv.LLM_API_KEY) return { key: dotenv.LLM_API_KEY, origin: '.env:LLM_API_KEY' };
  const keyFile = process.env.LLM_API_KEY_FILE || dotenv.LLM_API_KEY_FILE;
  if (keyFile) {
    try {
      const vars = parseDotEnv(fs.readFileSync(keyFile, 'utf8'));
      const name = process.env.LLM_API_KEY_FILE_VAR || dotenv.LLM_API_KEY_FILE_VAR || 'OLLAMA_API_KEY';
      if (vars[name]) return { key: vars[name], origin: 'file:' + path.basename(keyFile) + ':' + name };
    } catch (e) { /* 文件不可读时退化为未配置 */ }
  }
  return { key: '', origin: 'none' };
}

const keyInfo = resolveApiKey();

const config = {
  ROOT: ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PORT: envInt('PORT', 8765),
  HOST: env('HOST', '127.0.0.1'),

  LLM_PROVIDER: env('LLM_PROVIDER', 'openai-compat'),      // openai-compat | ollama | mock
  LLM_BASE_URL: env('LLM_BASE_URL', 'https://ollama.com/v1'),
  LLM_MODEL: env('LLM_MODEL', 'deepseek-v4.1-flash'),
  LLM_API_KEY: keyInfo.key,
  LLM_API_KEY_ORIGIN: keyInfo.origin,
  LLM_TIMEOUT_MS: envInt('LLM_TIMEOUT_MS', 120000),
  LLM_MAX_TOKENS: envInt('LLM_MAX_TOKENS', 4000),
  LLM_TEMPERATURE: Number(env('LLM_TEMPERATURE', '0.85')),
  LLM_JSON_MODE: env('LLM_JSON_MODE', 'auto'),             // auto | on | off
  LLM_MAX_CONCURRENCY: envInt('LLM_MAX_CONCURRENCY', 3),
  LLM_RETRY_ON_ERROR: envInt('LLM_RETRY_ON_ERROR', 1),

  GEN_ENABLED: envBool('GEN_ENABLED', true),
  GEN_DAILY_LIMIT: envInt('GEN_DAILY_LIMIT', 200),
  GEN_PER_IP_LIMIT: envInt('GEN_PER_IP_LIMIT', 6),
  GEN_PER_IP_WINDOW_MS: envInt('GEN_PER_IP_WINDOW_MS', 10 * 60 * 1000),
  GEN_DEDUPE_WINDOW_MS: envInt('GEN_DEDUPE_WINDOW_MS', 120000),

  DB_PATH: env('DB_PATH', path.join(ROOT, 'data', 'gengxia.db')),
  BODY_LIMIT_BYTES: envInt('BODY_LIMIT_BYTES', 64 * 1024),
  VERSION: '1.0.0',
};

function safeSummary() {
  return {
    port: config.PORT,
    provider: config.LLM_PROVIDER,
    baseUrl: config.LLM_BASE_URL,
    model: config.LLM_MODEL,
    apiKeyConfigured: !!config.LLM_API_KEY,
    apiKeyOrigin: config.LLM_API_KEY_ORIGIN,
    generationEnabled: config.GEN_ENABLED,
    dailyLimit: config.GEN_DAILY_LIMIT,
    perIpLimit: config.GEN_PER_IP_LIMIT,
    maxConcurrency: config.LLM_MAX_CONCURRENCY,
    dbPath: config.DB_PATH,
  };
}

module.exports = { config, env, safeSummary };
