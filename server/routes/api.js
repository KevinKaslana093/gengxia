/* JSON API 路由 */
'use strict';

const db = require('../db.js');
const Schema = require('../../shared/schema.js');
const SceneDefs = require('../../shared/scenes.js');
const { config } = require('../config.js');
const { generateForStory, GenerateError, USER_MESSAGES } = require('../llm/generate.js');
const util = require('../util.js');

/* 进程内：同故事去重（进行中 + 2 分钟内完成复用），失败即释放 */
const inflight = new Map();   // storyHash -> Promise<{id, editToken, config, createdAt, reused}>
const recentDone = new Map(); // storyHash -> { id, at }

function storyHash(ip, story) {
  return require('crypto').createHash('sha256').update(ip + '\u0000' + story).digest('hex');
}

/* 读取存储的配置，必要时把 v1 平滑迁移到 v2（旧分享链接仍可玩）。
 * 迁移在读取时进行，不写回数据库 —— 保持数据库只读语义清晰。 */
function readConfig(row) {
  let cfg = null;
  try { cfg = JSON.parse(row.config_json); } catch (e) { return null; }
  if (cfg && cfg.schemaVersion === Schema.SCHEMA_VERSION) return cfg;
  const migrated = Schema.migrateV1(cfg);
  return migrated || cfg;
}

/* 公开给前端的配置：附带场景元数据（调色板 + 背景 id），供渲染使用。
 * 注意不返回 edit_token、原始故事或任何服务端信息。 */
function publicConfig(gid, row) {
  const cfg = readConfig(row);
  if (!cfg) return { id: gid, config: null, createdAt: row.created_at, source: row.source };
  const sc = cfg.sceneId ? SceneDefs.SCENES[cfg.sceneId] : null;
  return {
    id: gid,
    config: cfg,
    scene: sc ? { id: cfg.sceneId, label: sc.label, palette: sc.palette, artId: sc.artId } : null,
    mode: cfg.mode || 'dodge',
    createdAt: row.created_at,
    source: row.source,
    editable: !!row.edit_token_hash,
  };
}

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(body);
}

function sendError(res, status, code, message, extra) {
  sendJson(res, status, Object.assign({ error: { code: code, message: message } }, extra || {}));
}

/* ---------------- POST /api/games ---------------- */
async function handleCreate(req, res) {
  /* 先做本地、廉价的请求校验（400/413），再判断生成可用性（503）。
   * 顺序理由：畸形请求无论服务状态如何都应得到明确的 400，且不消耗任何额度或算力。 */
  let body;
  try {
    const raw = await util.readBody(req);
    body = JSON.parse(raw || '{}');
  } catch (e) {
    if (e && e.code === 'too_large') {
      res.setHeader('Connection', 'close');
      return sendError(res, 413, 'too_large', '请求体过大（上限 ' + config.BODY_LIMIT_BYTES + ' 字节）');
    }
    return sendError(res, 400, 'bad_request', '请求体不是合法 JSON');
  }

  const storyCheck = Schema.validateStory(body && body.story);
  if (!storyCheck.ok) return sendError(res, 400, 'bad_story', storyCheck.error);
  const story = storyCheck.value;

  /* 玩法：auto（自动匹配）或指定 dodge / runner / click */
  const wantMode = body && typeof body.mode === 'string' ? body.mode : 'auto';
  if (wantMode !== 'auto' && !Schema.MODES[wantMode]) {
    return sendError(res, 400, 'bad_mode', '不支持的玩法：' + wantMode);
  }

  if (!config.GEN_ENABLED) {
    return sendError(res, 503, 'disabled', USER_MESSAGES.disabled);
  }
  if (!config.LLM_API_KEY && config.LLM_PROVIDER !== 'mock') {
    return sendError(res, 503, 'auth_error', USER_MESSAGES.auth_error);
  }

  const ip = util.clientIp(req);

  /* 每日总额度 */
  const dayK = 'gen:' + util.todayKey();
  if (db.getCounter(dayK) >= config.GEN_DAILY_LIMIT) {
    return sendError(res, 429, 'limit', USER_MESSAGES.limit);
  }
  /* 每 IP 速率 */
  const rl = util.rateLimit('ip:' + ip, config.GEN_PER_IP_LIMIT, config.GEN_PER_IP_WINDOW_MS);
  if (!rl.ok) {
    return sendError(res, 429, 'rate_limited', '请求太频繁了，请等 ' + rl.retryAfterSec + ' 秒再试', { retryAfterSec: rl.retryAfterSec });
  }

  const wantStream = String(req.headers['accept'] || '').indexOf('application/x-ndjson') !== -1;
  const hash = storyHash(ip, story + '\u0000' + wantMode);

  /* 去重复用：同 IP 同故事 2 分钟内已生成 → 直接返回同一个游戏（含新编辑凭据不可复用，返回旧 id 提示可继续玩） */
  const recent = recentDone.get(hash);
  if (recent && Date.now() - recent.at < config.GEN_DEDUPE_WINDOW_MS) {
    const row = db.getGame(recent.id);
    if (row) {
      const payload = { id: recent.id, config: JSON.parse(row.config_json), createdAt: row.created_at, deduplicated: true };
      if (wantStream) return sendNdjsonFinal(res, payload);
      return sendJson(res, 200, payload);
    }
    recentDone.delete(hash);
  }

  let stages = [];
  const onStage = (s) => { stages.push(s); };

  const work = (async () => {
    /* 进行中复用：同 IP 同故事的并发请求共享同一个生成任务，不重复烧 token */
    if (inflight.has(hash)) return inflight.get(hash);
    const task = (async () => {
      const { config: cfg, attempts } = await generateForStory(story, onStage, { mode: wantMode });
      onStage('saving');
      const id = util.newGameId();
      const editToken = util.newEditToken();
      const now = Date.now();
      db.insertGame({
        id: id,
        configJson: JSON.stringify(cfg),
        schemaVersion: cfg.schemaVersion,
        source: config.LLM_PROVIDER === 'mock' ? 'mock' : 'ai',
        themeId: cfg.sceneId,
        mode: cfg.mode,
        sceneId: cfg.sceneId,
        editTokenHash: util.hashToken(editToken),
        createdAt: now,
        updatedAt: now,
      });
      db.incrCounter(dayK, 1);
      recentDone.set(hash, { id: id, at: Date.now() });
      return { id: id, editToken: editToken, config: cfg, createdAt: now, attempts: attempts };
    })();
    inflight.set(hash, task);
    try { return await task; } finally { inflight.delete(hash); }
  })();

  if (wantStream) {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    /* 先把已发生的阶段刷给前端，之后 300ms 轮询跟进；阶段是服务端真实状态 */
    let sent = 0;
    const pump = () => {
      while (sent < stages.length) { res.write(JSON.stringify({ stage: stages[sent++] }) + '\n'); }
    };
    const timer = setInterval(pump, 300);
    try {
      pump();
      const result = await work;
      clearInterval(timer);
      pump();
      res.write(JSON.stringify({ done: true, result: result }) + '\n');
      res.end();
    } catch (e) {
      clearInterval(timer);
      pump();
      const err = normalizeGenError(e);
      res.write(JSON.stringify({ done: true, error: err }) + '\n');
      res.end();
    }
    return;
  }

  try {
    const result = await work;
    return sendJson(res, 201, result, { Location: '/g/' + result.id });
  } catch (e) {
    const err = normalizeGenError(e);
    const status = err.code === 'bad_story' ? 400 : (err.code === 'limit' ? 429 : (err.code === 'bad_output' ? 422 : 502));
    return sendError(res, status, err.code, err.message);
  }
}

function sendNdjsonFinal(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  res.write(JSON.stringify({ stage: 'done' }) + '\n');
  res.write(JSON.stringify({ done: true, result: payload }) + '\n');
  res.end();
}

function normalizeGenError(e) {
  if (e instanceof GenerateError) {
    return { code: e.code, message: USER_MESSAGES[e.code] || '生成失败，请重试' };
  }
  const code = (e && e.code) || 'server_error';
  if (code === 'timeout') return { code: 'timeout', message: USER_MESSAGES.timeout };
  if (code === 'rate_limited') return { code: 'rate_limited', message: USER_MESSAGES.rate_limited };
  if (code === 'auth_error') return { code: 'auth_error', message: USER_MESSAGES.auth_error };
  return { code: 'server_error', message: '服务端出错，请重试' };
}

/* ---------------- GET /api/games/:id ---------------- */
function handleGet(res, id) {
  const row = db.getGame(id);
  if (!row) return sendError(res, 404, 'not_found', '游戏不存在或已删除');
  return sendJson(res, 200, publicConfig(id, row));
}

/* ---------------- PATCH /api/games/:id ---------------- */
async function handlePatch(req, res, id) {
  const row = db.getGame(id);
  if (!row) return sendError(res, 404, 'not_found', '游戏不存在或已删除');

  let body;
  try {
    const raw = await util.readBody(req, 8 * 1024);
    body = JSON.parse(raw || '{}');
  } catch (e) {
    if (e && e.code === 'too_large') return sendError(res, 413, 'too_large', '请求体过大');
    return sendError(res, 400, 'bad_request', '请求体不是合法 JSON');
  }

  if (!row.edit_token_hash) return sendError(res, 403, 'forbidden', '这是一款预设游戏，不支持编辑');
  const token = body && body.editToken ? String(body.editToken) : '';
  if (!token || !util.timingSafeEqualHex(util.hashToken(token), row.edit_token_hash)) {
    return sendError(res, 403, 'forbidden', '编辑凭据无效：只有创建者可以修改这款游戏');
  }

  const patchCheck = Schema.validatePatch({ title: body.title, playerName: body.playerName });
  if (!patchCheck.ok) return sendError(res, 400, 'bad_patch', patchCheck.errors.join('；'));

  const current = JSON.parse(row.config_json);
  const next = Schema.applyPatch(current, patchCheck.value);
  const full = Schema.validateConfig(next);
  if (!full.ok) return sendError(res, 400, 'bad_patch', '修改后配置未通过校验：' + full.errors.slice(0, 5).join('；'));

  db.updateGameConfig(id, JSON.stringify(full.value), Date.now());
  const updated = db.getGame(id);
  return sendJson(res, 200, publicConfig(id, updated));
}

/* ---------------- GET /api/gallery ----------------
 * 首页用：预设游戏列表（每个都无需模型即可玩）。
 * 返回玩法、场景标题与场景标签，供首页卡片展示。 */
function handleGallery(res) {
  const items = [];
  const seen = new Set();
  /* 先列预设（稳定顺序），再补充用户生成过的公开游戏（最多 3 个） */
  const rows = db.listGames(60);
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    let cfg; try { cfg = readConfig(row); } catch (e) { continue; }
    if (!cfg) continue;
    const sc = SceneDefs.SCENES[cfg.sceneId];
    items.push({
      id: row.id,
      title: cfg.title,
      intro: cfg.intro,
      ruleText: cfg.ruleText,
      mode: cfg.mode,
      modeLabel: (Schema.MODES[cfg.mode] || {}).label || '',
      sceneId: cfg.sceneId,
      sceneLabel: sc ? sc.label : '',
      avatarId: cfg.player && cfg.player.avatarId,
      collectibleSpriteId: cfg.collectible && cfg.collectible.spriteId,
      obstacleSpriteId: cfg.obstacle && cfg.obstacle.spriteId,
      source: row.source,
      editable: !!row.edit_token_hash,
    });
    seen.add(row.id);
  }
  const presets = items.filter(function (i) { return i.source === 'preset'; });
  const generated = items.filter(function (i) { return i.source !== 'preset'; }).slice(0, 3);
  return sendJson(res, 200, { presets: presets, recent: generated, items: presets.concat(generated) });
}

/* ---------------- GET /api/scenes ----------------
 * 首页用：12 套场景的公开元数据（标签、示例故事、支持玩法）。
 * 不含任何服务端信息。 */
function handleScenes(res) {
  const out = SceneDefs.sceneIds().map(function (id) {
    const sc = SceneDefs.SCENES[id];
    return {
      id: id,
      label: sc.label,
      blurb: sc.blurb,
      modes: sc.modes.slice(),
      player: { id: sc.player, label: (Schema.AVATARS[sc.player] || {}).label || sc.player },
      collectibles: sc.collectibles.slice(),
      obstacles: sc.obstacles.slice(),
      sample: sc.sample ? { story: sc.sample.story, title: sc.sample.title } : null,
    };
  });
  return sendJson(res, 200, { scenes: out, modes: Object.keys(Schema.MODES).map(function (m) {
    return { id: m, label: Schema.MODES[m].label, desc: Schema.MODES[m].desc };
  }) });
}

/* ---------------- GET /api/health ---------------- */
function handleHealth(res) {
  const presets = [];
  for (const id of ['demo-genggao', 'demo-zaoba', 'demo-naicha']) {
    if (db.getGame(id)) presets.push(id);
  }
  return sendJson(res, 200, {
    ok: true,
    version: config.VERSION,
    schemaVersion: Schema.SCHEMA_VERSION,
    db: db.ping(),
    games: db.countGames(),
    scenes: SceneDefs.sceneIds().length,
    modes: Object.keys(Schema.MODES),
    presets: presets,
    generationEnabled: config.GEN_ENABLED,
    modelConfigured: !!config.LLM_API_KEY,
    provider: config.LLM_PROVIDER,
    model: config.LLM_MODEL,
    todayGenerated: db.getCounter('gen:' + util.todayKey()),
    dailyLimit: config.GEN_DAILY_LIMIT,
    uptimeSec: Math.round(process.uptime()),
  });
}

module.exports = { handleCreate, handleGet, handlePatch, handleGallery, handleScenes, handleHealth, sendError, sendJson, publicConfig, readConfig };
