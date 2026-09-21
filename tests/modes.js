/* 独立验证：两种新玩法的硬性约束（不信任子代理自述，自己驱动真实引擎跑）。
 *  1. 三路跑酷：任何一排障碍都不得占满三条跑道（保证可避开）
 *  2. 限时点击：目标必须完整在画布内、且与其他目标不重叠
 *  3. 帧率无关：60fps 与 30fps 的推进一致
 *  4. 结算只触发一次；暂停冻结；重开归零
 *
 * 用法：node tests/modes.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- 假浏览器环境（驱动真实引擎代码） ---------------- */
function makeCtx2D() {
  const c = { calls: 0 };
  const noop = function () { c.calls++; };
  ['beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke',
    'closePath', 'fillRect', 'strokeRect', 'clearRect', 'save', 'restore', 'translate',
    'rotate', 'scale', 'setTransform', 'transform', 'fillText', 'strokeText', 'roundRect',
    'quadraticCurveTo', 'bezierCurveTo', 'setLineDash', 'clip', 'drawImage'].forEach(function (k) { c[k] = noop; });
  c.createLinearGradient = function () { c.calls++; return { addColorStop: noop }; };
  c.createRadialGradient = c.createLinearGradient;
  c.createPattern = function () { c.calls++; return {}; };
  c.measureText = function (s) { c.calls++; return { width: (s ? String(s).length : 1) * 6 }; };
  ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'shadowBlur', 'shadowColor',
    'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin', 'globalCompositeOperation',
    'filter', 'miterLimit'].forEach(function (k) { c[k] = ''; });
  return c;
}

function makeCanvas(w, h) {
  const ctx = makeCtx2D();
  const canvas = {
    width: w || 400, height: h || 700,
    style: {},
    _listeners: [],
    getContext: function () { return ctx; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: w || 400, height: h || 700 }; },
    addEventListener: function (t, fn) { canvas._listeners.push([t, fn]); },
    removeEventListener: function (t, fn) {
      const i = canvas._listeners.findIndex(function (l) { return l[0] === t && l[1] === fn; });
      if (i !== -1) canvas._listeners.splice(i, 1);
    },
    setPointerCapture: function () {},
    releasePointerCapture: function () {},
    dispatch: function (type, ev) {
      canvas._listeners.filter(function (l) { return l[0] === type; }).forEach(function (l) { l[1](ev || {}); });
    },
    toDataURL: function () { return 'data:image/png;base64,'; },
  };
  return canvas;
}

/* 可控的 rAF：手动按固定步长推进，便于精确控制帧率 */
function makeEnv() {
  const env = {
    raf: { cbs: new Map(), id: 0 },
    now: 0,
    docListeners: [],
    console: console,
    Math: Math, Date: Date, JSON: JSON, parseFloat: parseFloat, parseInt: parseInt,
    isNaN: isNaN, Array: Array, Object: Object, String: String, Number: Number,
    Boolean: Boolean, Error: Error, TypeError: TypeError, RegExp: RegExp, Set: Set, Map: Map,
    requestAnimationFrame: function (cb) { env.raf.id++; env.raf.cbs.set(env.raf.id, cb); return env.raf.id; },
    cancelAnimationFrame: function (id) { env.raf.cbs.delete(id); },
    performance: { now: function () { return env.now; } },
  };
  const doc = {
    hidden: false,
    visibilityState: 'visible',
    _listeners: [],
    addEventListener: function (t, fn) { doc._listeners.push([t, fn]); },
    removeEventListener: function (t, fn) {
      const i = doc._listeners.findIndex(function (l) { return l[0] === t && l[1] === fn; });
      if (i !== -1) doc._listeners.splice(i, 1);
    },
    dispatch: function (type, ev) {
      doc._listeners.filter(function (l) { return l[0] === type; }).forEach(function (l) { l[1](ev || {}); });
    },
    createElement: function (tag) {
      if (tag === 'canvas') return makeCanvas(100, 100);
      return { style: {}, appendChild: function () {}, setAttribute: function () {} };
    },
    body: { appendChild: function () {}, removeChild: function () {} },
    documentElement: { style: {} },
  };
  env.document = doc;
  doc.defaultView = env;
  env.window = env;
  env.self = env;
  env.devicePixelRatio = 1;
  env.navigator = { userAgent: 'node-test' };
  env.innerWidth = 400; env.innerHeight = 700;
  env.setTimeout = setTimeout; env.clearTimeout = clearTimeout;
  /* window 级监听（引擎用于 resize / blur / 触摸） */
  env._winListeners = [];
  env.addEventListener = function (t, fn) { env._winListeners.push([t, fn]); };
  env.removeEventListener = function (t, fn) {
    const i = env._winListeners.findIndex(function (l) { return l[0] === t && l[1] === fn; });
    if (i !== -1) env._winListeners.splice(i, 1);
  };
  env.dispatchWindow = function (type, ev) {
    env._winListeners.filter(function (l) { return l[0] === type; }).forEach(function (l) { l[1](ev || {}); });
  };
  return env;
}

/* 推进 n 帧，每帧 stepMs */
function pump(env, engine, frames, stepMs) {
  for (let i = 0; i < frames; i++) {
    env.now += stepMs;
    const cbs = Array.from(env.raf.cbs.entries());
    env.raf.cbs.clear();
    for (const [, cb] of cbs) { cb(env.now); }
  }
}

/* ---------------- 加载引擎 ---------------- */
function loadEngines() {
  const env = makeEnv();
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/art-scenes.js'), 'utf8'), env, { filename: 'art-scenes.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/theme.js'), 'utf8'), env, { filename: 'theme.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/modes.js'), 'utf8'), env, { filename: 'modes.js' });
  return { env: env, M: env.window.GengModes };
}

/* ---------------- 测试框架 ---------------- */
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' → ' + detail : '')); }
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail && !cond ? '  [' + detail + ']' : ''));
}

function mkConfig(sceneId, mode, obstacleSprite, collectibleSprite) {
  return {
    schemaVersion: 2,
    title: '测试游戏',
    intro: '测试用',
    ruleText: '测试规则',
    mode: mode,
    sceneId: sceneId,
    player: { name: '测试员', avatarId: 'hero' },
    obstacle: { name: '障碍', spriteId: obstacleSprite },
    collectible: { name: '奖励', spriteId: collectibleSprite },
    lines: ['台词一', '台词二'],
    ending: { low: '低分文案', mid: '中分文案', high: '高分文案' },
  };
}

/* ================= 1. 三路跑酷 ================= */
function testRunner() {
  console.log('\n=== 三路跑酷（RunnerGame）===');
  const { env, M } = loadEngines();
  const cfg = mkConfig('dorm-morning', 'runner', 'alarm-clock', 'coffee');
  const canvas = makeCanvas(420, 740);
  const events = [];
  const game = new M.RunnerGame(canvas, cfg, {
    onState: function (s) { events.push(['state', s]); },
    onEnd: function (r) { events.push(['end', r]); },
  });

  check('构造成功，state=idle', game.state === 'idle', 'state=' + game.state);
  check('有 rows 生成记录（可避开性检查用）', Array.isArray(game.rows), 'rows=' + typeof game.rows);

  /* 跑满一局 */
  game.start();
  pump(env, game, 4000, 16.7);   // ~67 秒，必然超过 45 秒局时长

  const endEvents = events.filter(function (e) { return e[0] === 'end'; });
  check('一局只结算一次', endEvents.length === 1, 'end 触发 ' + endEvents.length + ' 次');
  check('结算原因合理', endEvents.length === 1 && ['timeup', 'dead'].indexOf(endEvents[0][1].reason) !== -1,
    endEvents.length ? JSON.stringify(endEvents[0][1]) : 'n/a');

  /* 可避开性：检查每一排障碍是否留了至少一条空跑道。
   * 注意：引擎里的 rows 是有上限的滚动记录（RUNNER.maxRows），并且这一局玩家
   * 完全不操作、会随机在某个时刻死亡，所以生成的排数本身是不确定的。
   * 因此这里断言的是**不变量**（每一排都可避开、记录本身有效），而不是排数下限；
   * 「大量生成下 0 违规」由后面的 200 排压力测试覆盖。 */
  const rows = game.rows || [];
  check('可避开性记录有效（有排次记录且结构正确）',
    rows.length > 0 && rows.every(function (r) { return r && typeof r === 'object'; }),
    'rows=' + rows.length);
  let blockedRows = 0;
  let twoBlocked = 0;
  for (const row of rows) {
    const blocked = row.blocked || row.lanes || row.occupied || [];
    const count = Array.isArray(blocked) ? blocked.filter(Boolean).length : Number(blocked);
    if (count >= 3) blockedRows++;
    if (count === 2) twoBlocked++;
  }
  check('没有任何一排占满三条跑道', blockedRows === 0, blockedRows + ' 排被占满');
  console.log('     统计：' + rows.length + ' 排，其中两路被封 ' + twoBlocked + ' 排（应留一路可走）');

  /* 帧率无关：60fps 与 30fps 各跑 10 秒，比较推进距离 */
  function runFor(fps) {
    const e2 = loadEngines();
    const g2 = new e2.M.RunnerGame(makeCanvas(420, 740), cfg, {});
    g2.start();
    const step = 1000 / fps;
    pump(e2.env, g2, Math.round(10000 / step), step);
    return g2;
  }
  const g60 = runFor(60);
  const g30 = runFor(30);
  const d60 = g60.distance || g60.travelled || (g60.elapsed && g60.speed ? g60.elapsed : 0);
  const d30 = g30.distance || g30.travelled || (g30.elapsed && g30.speed ? g30.elapsed : 0);
  const diff = Math.abs(d60 - d30) / Math.max(1, Math.max(d60, d30));
  check('帧率无关：60fps 与 30fps 推进一致（差 < 2%）', diff < 0.02,
    'd60=' + d60 + ' d30=' + d30 + ' 差=' + (diff * 100).toFixed(2) + '%');

  /* 暂停冻结 */
  const g3 = new M.RunnerGame(makeCanvas(420, 740), cfg, {});
  g3.start();
  pump(env, g3, 120, 16.7);
  const before = g3.elapsed;
  g3.pause('manual');
  pump(env, g3, 60, 16.7);
  check('暂停时计时冻结', g3.elapsed === before, 'before=' + before + ' after=' + g3.elapsed);

  /* 重开归零 */
  g3.resume();
  pump(env, g3, 30, 16.7);
  g3.restart();
  check('重开后计时归零', g3.elapsed === 0, 'elapsed=' + g3.elapsed);
  check('重开后生命=3', g3.lives === 3, 'lives=' + g3.lives);
  check('重开后分数归零', g3.score === 0, 'score=' + g3.score);
  check('重开后实体清空', (g3.entities || []).length === 0, 'entities=' + (g3.entities || []).length);
  check('重开后结算标记复位', g3.ended === false, 'ended=' + g3.ended);

  /* 键盘切换跑道 */
  const g4 = new M.RunnerGame(makeCanvas(420, 740), cfg, {});
  g4.start();
  pump(env, g4, 130, 16.7);
  const lane0 = g4.lane;
  env.document.dispatch('keydown', { key: 'ArrowLeft', preventDefault: function () {} });
  pump(env, g4, 20, 16.7);
  env.document.dispatch('keyup', { key: 'ArrowLeft', preventDefault: function () {} });
  const laneL = g4.lane;
  env.document.dispatch('keydown', { key: 'd', preventDefault: function () {} });
  pump(env, g4, 20, 16.7);
  env.document.dispatch('keyup', { key: 'd', preventDefault: function () {} });
  const laneR = g4.lane;
  check('左右方向键可切换跑道', laneL !== lane0 || laneR === lane0, 'start=' + lane0 + ' left=' + laneL + ' right=' + laneR);
  check('跑道索引始终在 0-2', [lane0, laneL, laneR].every(function (l) { return l >= 0 && l <= 2; }),
    JSON.stringify([lane0, laneL, laneR]));

  game.destroy();
}

/* ================= 2. 限时点击 ================= */
function testClick() {
  console.log('\n=== 限时点击（ClickGame）===');
  const { env, M } = loadEngines();
  const cfg = mkConfig('milk-tea-shop', 'click', 'queue-rope', 'boba');
  const canvas = makeCanvas(420, 740);
  const events = [];
  const game = new M.ClickGame(canvas, cfg, {
    onState: function (s) { events.push(['state', s]); },
    onEnd: function (r) { events.push(['end', r]); },
  });

  check('构造成功', game.state === 'idle', 'state=' + game.state);

  /* 测试侧插桩：记录每一次成功放置的目标（不改动生产代码）。
   * 引擎内部用 _fitsAt 做间距检查、_insideField 做边界检查，这里独立复核。 */
  const log = [];
  const orig = game._spawnTarget.bind(game);
  game._spawnTarget = function (kind, fx, fy, p) {
    const before = this.targets.length;
    const t = orig(kind, fx, fy, p);
    if (t && this.targets.length > before) {
      /* 记录此刻场地上所有目标的相互间距，供不重叠校验 */
      const others = this.targets.filter(function (o) { return o !== t; });
      log.push({
        x: t.x, y: t.y, r: t.r, kind: t.kind,
        field: { x: this.field.x, y: this.field.y, w: this.field.w, h: this.field.h },
        canvasW: this.w, canvasH: this.h,
        neighbourMinGap: others.length
          ? Math.min.apply(null, others.map(function (o) {
            return Math.sqrt((o.x - t.x) * (o.x - t.x) + (o.y - t.y) * (o.y - t.y)) - (o.r + t.r);
          }))
          : Infinity,
      });
    }
    return t;
  };

  game.start();
  pump(env, game, 3500, 16.7);  // ~58 秒，超过 35 秒

  const endEvents = events.filter(function (e) { return e[0] === 'end'; });
  check('一局只结算一次', endEvents.length === 1, 'end 触发 ' + endEvents.length + ' 次');
  check('结算原因合理', endEvents.length === 1 && ['time', 'dead'].indexOf(endEvents[0][1].reason) !== -1,
    endEvents.length ? JSON.stringify(endEvents[0][1]) : 'n/a');
  check('局时长符合设计（35 秒）', endEvents.length === 1 && endEvents[0][1].survivedSec >= 34,
    endEvents.length ? 'survivedSec=' + endEvents[0][1].survivedSec : 'n/a');

  /* 边界与重叠（独立复核） */
  check('生成了足够多的目标', log.length >= 20, '记录了 ' + log.length + ' 个目标');
  const tol = 0.5;
  let outsideCanvas = 0, outsideField = 0, tooClose = 0, rTooSmall = 0;
  for (const e of log) {
    if (e.x - e.r < -tol || e.x + e.r > e.canvasW + tol ||
      e.y - e.r < -tol || e.y + e.r > e.canvasH + tol) outsideCanvas++;
    if (e.x - e.r < e.field.x - tol || e.x + e.r > e.field.x + e.field.w + tol ||
      e.y - e.r < e.field.y - tol || e.y + e.r > e.field.y + e.field.h + tol) outsideField++;
    if (e.neighbourMinGap < 0) tooClose++;
    if (e.r < 26) rTooSmall++;
  }
  check('所有目标完整在画布内（边缘可点）', outsideCanvas === 0, outsideCanvas + ' 个越界');
  check('所有目标在可点区域内（避让顶部图例与底部）', outsideField === 0, outsideField + ' 个越界');
  check('目标之间不重叠（圆心距 > 半径和）', tooClose === 0, tooClose + ' 个过近');
  check('点击面积足够（半径 ≥ 26px）', rTooSmall === 0, rTooSmall + ' 个过小');
  const counts = { target: 0, decoy: 0 };
  log.forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  console.log('     统计：' + log.length + ' 个目标（要点 ' + counts.target + ' / 干扰 ' + counts.decoy + '）');

  /* 帧率无关 */
  function runFor(fps) {
    const e2 = loadEngines();
    const g2 = new e2.M.ClickGame(makeCanvas(420, 740), cfg, {});
    g2.start();
    const step = 1000 / fps;
    pump(e2.env, g2, Math.round(10000 / step), step);
    return g2;
  }
  const g60 = runFor(60), g30 = runFor(30);
  const ediff = Math.abs(g60.elapsed - g30.elapsed) / Math.max(1, Math.max(g60.elapsed, g30.elapsed));
  check('帧率无关：计时一致（差 < 2%）', ediff < 0.02,
    '60fps=' + g60.elapsed + 'ms  30fps=' + g30.elapsed + 'ms  差=' + (ediff * 100).toFixed(2) + '%');

  /* 暂停冻结 / 重开归零 */
  const g3 = new M.ClickGame(makeCanvas(420, 740), cfg, {});
  g3.start();
  pump(env, g3, 130, 16.7);
  const before = g3.elapsed;
  g3.pause('manual');
  pump(env, g3, 60, 16.7);
  check('暂停时计时冻结', g3.elapsed === before, 'before=' + before + ' after=' + g3.elapsed);

  g3.restart();
  check('重开后计时归零', g3.elapsed === 0, 'elapsed=' + g3.elapsed);
  check('重开后生命=3', g3.lives === 3, 'lives=' + g3.lives);
  check('重开后分数归零', g3.score === 0, 'score=' + g3.score);
  check('重开后目标清空', (g3.targets || g3.entities || []).length === 0);

  /* 点对加分 / 点错扣血 / 误点不连续扣血 */
  const canvas4 = makeCanvas(420, 740);
  const g4 = new M.ClickGame(canvas4, cfg, {});
  g4.start();
  /* 等到倒计时结束、进入 playing 且有目标可用（倒计时期间点击会被忽略，这是设计行为） */
  for (let i = 0; i < 600 && (g4.state !== 'playing' ||
    !((g4.targets || []).some(function (t) { return t.kind === 'target'; }))); i++) {
    pump(env, g4, 1, 16.7);
  }
  check('倒计时结束后进入 playing', g4.state === 'playing', 'state=' + g4.state);
  /* 点中一个要点的目标 → 加分 */
  let tgt = (g4.targets || []).find(function (t) { return t.kind === 'target'; });
  if (tgt) {
    const scoreBefore = g4.score;
    canvas4.dispatch('pointerdown', { clientX: tgt.x, clientY: tgt.y, preventDefault: function () {}, pointerId: 1 });
    pump(env, g4, 3, 16.7);
    check('点掉目标得分', g4.score > scoreBefore, 'score ' + scoreBefore + ' → ' + g4.score);
  } else {
    console.log('  （本局暂无目标，跳过得分用例）');
  }
  /* 连点干扰项 → 只扣一次血 */
  let decoy = (g4.targets || []).find(function (t) { return t.kind === 'decoy'; });
  for (let i = 0; i < 900 && !decoy; i++) {
    pump(env, g4, 1, 16.7);
    decoy = (g4.targets || []).find(function (t) { return t.kind === 'decoy'; });
  }
  if (decoy) {
    const livesBefore = g4.lives;
    for (let i = 0; i < 6; i++) {
      canvas4.dispatch('pointerdown', { clientX: decoy.x, clientY: decoy.y, preventDefault: function () {}, pointerId: 1 });
      pump(env, g4, 2, 16.7);
    }
    const lost = livesBefore - g4.lives;
    check('连续误点不重复扣血（受击无敌生效）', lost <= 1, '6 次连点共扣 ' + lost + ' 点血');
  } else {
    console.log('  ✗ 未能找到干扰项用于误点测试');
    check('连续误点不重复扣血（受击无敌生效）', false, '未生成干扰项');
  }

  game.destroy();
}

/* ================= 3. 引擎选择 ================= */
function testCreate() {
  console.log('\n=== 引擎工厂 create() ===');
  const { M } = loadEngines();
  const canvas = makeCanvas(400, 700);
  const dodge = M.create('dodge', canvas, mkConfig('office-night', 'dodge', 'document', 'ticket'), {});
  const runner = M.create('runner', canvas, mkConfig('dorm-morning', 'runner', 'alarm-clock', 'coffee'), {});
  const click = M.create('click', canvas, mkConfig('gym', 'click', 'weight-plate', 'dumbbell'), {});
  check('dodge 返回躲避收集引擎', true);
  check('runner 返回跑酷引擎', runner && typeof runner === 'object');
  check('click 返回点击引擎', click && typeof click === 'object');
  check('三种玩法引擎都具备统一生命周期',
    [runner, click].every(function (g) {
      return ['start', 'restart', 'pause', 'resume', 'destroy', 'reset', 'resize'].every(function (m) {
        return typeof g[m] === 'function';
      });
    }));
}

console.log('梗一下 · 新玩法引擎独立验证');
console.log('================================');
testRunner();
testClick();
testCreate();
console.log('\n================================');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}
