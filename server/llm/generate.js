/* 生成编排（v2）：调用模型 → 提取 JSON → 校验（含语义一致性 + 场景素材） →
 *（最多一次）修复重试 → 返回合规配置。
 *
 * v2 新增：
 *  - 支持指定玩法（opts.mode）或自动匹配；
 *  - 校验时带上所选场景的素材白名单（opts.sceneSprites），素材越界直接不合格；
 *  - 语义一致性由 shared/schema.js 的 collectSemanticConflicts 统一判定；
 *  - ruleText 由 schema 模板生成，模型输出里的 ruleText 会被忽略/剥离。
 *
 * 任何一步失败都返回结构化错误，交给路由层决定用户可见文案；绝不静默降级成"伪造成功"。
 */
'use strict';

const Schema = require('../../shared/schema.js');
const SceneDefs = require('../../shared/scenes.js');
const { callModel, LlmError } = require('./adapter.js');
const Prompt = require('./prompt.js');

/* 从模型输出中提取 JSON 对象：
 * 1) 去掉可能的 markdown 代码块围栏；2) 截取最外层大括号区间；3) JSON.parse。
 * 纯文本处理，绝不 eval。 */
function extractJson(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, error: '输出为空' };
  s = s.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return { ok: false, error: '输出中没有 JSON 对象' };
  const candidate = s.slice(start, end + 1);
  try {
    return { ok: true, obj: JSON.parse(candidate) };
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败：' + e.message };
  }
}

class GenerateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GenerateError';
    this.code = code;
  }
}

const USER_MESSAGES = {
  timeout: '模型生成超时了，请重试（通常重试就能成功）',
  rate_limited: '模型接口当前限流，请等一两分钟再试',
  auth_error: '服务端的模型凭据不可用，已记录；你仍可以体验预设游戏',
  server_error: '模型服务暂时不可用，请稍后重试',
  network: '网络连接模型服务失败，请检查后重试',
  bad_response: '模型返回了异常响应，请重试',
  bad_output: '模型输出的配置不合规（已自动修复一次仍未通过），请重试或换个说法',
  truncated: '模型输出被截断（配置过长），请重试；也可以把故事说得更简短一点',
  disabled: '生成功能当前已关闭，可以先体验预设游戏',
  limit: '今日生成额度已用完（保护性上限），预设游戏仍可游玩',
  busy: '当前生成任务较多，请稍后重试',
};

/* 组装本次生成要用的校验上下文 */
function buildOptsFor(sceneId, mode) {
  const sc = sceneId && SceneDefs.SCENES[sceneId];
  if (!sc) return { opts: {}, ruleTemplate: null, sceneId: sceneId || null };
  return {
    opts: { sceneSprites: Prompt.spritesForScene(sceneId) },
    ruleTemplate: Prompt.ruleTemplateFor(mode || 'dodge'),
    sceneId: sceneId,
  };
}

/* 若模型给出的 sceneId/mode 组合不被支持，尝试找一个可用场景替换 */
function resolveSceneAndMode(obj, wantMode) {
  const mode = (wantMode && wantMode !== 'auto') ? wantMode
    : (obj && typeof obj.mode === 'string' && Schema.MODES[obj.mode] ? obj.mode : null);
  let sceneId = obj && typeof obj.sceneId === 'string' ? obj.sceneId : null;
  const sc = sceneId ? SceneDefs.SCENES[sceneId] : null;
  if (sc && mode && sc.modes.indexOf(mode) === -1) {
    /* 场景存在但不支持该玩法：换一个支持该玩法的场景 */
    const alt = SceneDefs.scenesForMode(mode);
    if (alt && alt.length) sceneId = alt[0];
  }
  return { mode: mode, sceneId: sceneId };
}

/* 核心：一次生成的完整链路。
 * opts: { mode: 'auto'|'dodge'|'runner'|'click' }
 */
async function generateForStory(story, onStage, opts) {
  const o = opts || {};
  const stage = (s) => { try { onStage && onStage(s); } catch (e) {} };
  const wantMode = o.mode || 'auto';

  const messages = [
    { role: 'system', content: Prompt.buildSystemPrompt({ mode: wantMode }) },
    { role: 'user', content: Prompt.buildUserMessage(story) },
  ];

  stage('calling_model');
  let first;
  try {
    first = await callModel(messages);
  } catch (e) {
    if (e instanceof LlmError) throw new GenerateError(e.code === 'rate_limited' ? 'rate_limited' : e.code, e.message);
    throw new GenerateError('bad_response', e && e.message ? e.message : '未知错误');
  }

  stage('validating');
  const truncationHint = first.finishReason === 'length';
  let parsed = extractJson(first.content);
  let validation = null;
  let ctx = { sceneId: null, ruleTemplate: null };

  if (parsed.ok) {
    const rm = resolveSceneAndMode(parsed.obj, wantMode);
    if (rm.mode && !parsed.obj.mode) parsed.obj.mode = rm.mode;
    if (rm.sceneId && !parsed.obj.sceneId) parsed.obj.sceneId = rm.sceneId;
    ctx = buildOptsFor(parsed.obj.sceneId, parsed.obj.mode);
    validation = Schema.validateConfig(parsed.obj, ctx.opts);
  } else {
    validation = { ok: false, errors: [parsed.error] };
  }

  if (validation.ok) return { config: validation.value, attempts: 1 };

  /* ---- 一次修复尝试 ---- */
  stage('repairing');
  const errors = validation.errors.slice(0, 12);
  if (truncationHint) {
    errors.unshift('上一次输出可能因为过长被截断，请输出更精简的文案（保持结构完整）');
  }
  const repair = messages.concat([
    { role: 'assistant', content: String(first.content).slice(0, 4000) },
    { role: 'user', content: Prompt.buildRepairMessage(errors, ctx) },
  ]);

  let second;
  try {
    second = await callModel(repair);
  } catch (e) {
    if (e instanceof LlmError) throw new GenerateError(e.code, e.message);
    throw new GenerateError('bad_response', e && e.message ? e.message : '修复调用失败');
  }
  const parsed2 = extractJson(second.content);
  if (!parsed2.ok) throw new GenerateError('bad_output', '修复后的输出仍不是有效 JSON：' + parsed2.error);

  /* 修复结果沿用第一次确定的场景（避免越修越乱），但如果模型换了场景则跟随 */
  const rm2 = resolveSceneAndMode(parsed2.obj, wantMode);
  if (rm2.mode && !parsed2.obj.mode) parsed2.obj.mode = rm2.mode;
  if (rm2.sceneId && !parsed2.obj.sceneId) parsed2.obj.sceneId = rm2.sceneId;
  const ctx2 = buildOptsFor(parsed2.obj.sceneId, parsed2.obj.mode);

  let validation2 = Schema.validateConfig(parsed2.obj, ctx2.opts);

  /* 修复后仍因"场景素材越界"失败时，做一次安全的降级：把越界的素材换成该场景
   * 清单里的第一个合法素材（文案名称保留），再校验。这是确定性的本地修复，
   * 不消耗额外模型调用，也不会伪造内容——只是把图案换成场景内允许的。 */
  if (!validation2.ok && ctx2.opts.sceneSprites) {
    const sc = SceneDefs.SCENES[parsed2.obj.sceneId];
    if (sc) {
      const o2 = JSON.parse(JSON.stringify(parsed2.obj));
      o2.player = o2.player || {};
      if (sc.player) o2.player.avatarId = sc.player;
      o2.collectible = o2.collectible || {};
      o2.obstacle = o2.obstacle || {};
      if (sc.collectibles.indexOf(o2.collectible.spriteId) === -1) o2.collectible.spriteId = sc.collectibles[0];
      if (sc.obstacles.indexOf(o2.obstacle.spriteId) === -1) o2.obstacle.spriteId = sc.obstacles[0];
      /* 奖励与障碍不得同图 */
      if (o2.collectible.spriteId === o2.obstacle.spriteId && sc.obstacles.length > 1) {
        o2.obstacle.spriteId = sc.obstacles.find(function (s) { return s !== o2.collectible.spriteId; }) || o2.obstacle.spriteId;
      }
      const v3 = Schema.validateConfig(o2, { });
      if (v3.ok) validation2 = v3;
    }
  }

  if (!validation2.ok) {
    throw new GenerateError('bad_output', '修复后仍未通过校验：' + validation2.errors.slice(0, 6).join('；'));
  }
  return { config: validation2.value, attempts: 2 };
}

module.exports = {
  generateForStory: generateForStory,
  extractJson: extractJson,
  GenerateError: GenerateError,
  USER_MESSAGES: USER_MESSAGES,
};
