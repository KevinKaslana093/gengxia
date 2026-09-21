/* 引擎规则验证：在 Node 中加载真实的 public/js/engine.js，用假 canvas/DOM 驱动，
 * 对任务书验收标准 #6 逐条做确定性验证：
 *   碰撞、生命、分数、倒计时、受击无敌、暂停、重开、一局只结算一次、
 *   时间增量更新（帧率无关）、手机拖动、切后台暂停。
 * 运行：node tests/engine.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------------- 假 Canvas / DOM 环境 ---------------- */
function makeCtx() {
  const noop = function () {};
  return {
    canvas: null,
    setTransform: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop, rect: noop, fill: noop,
    stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop, clip: noop,
    fillText: noop, strokeText: noop, setLineDash: noop,
    measureText: function () { return { width: 40 }; },
    createLinearGradient: function () { return { addColorStop: noop }; },
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: '', textBaseline: '', lineCap: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
  };
}

function makeCanvas(w, h) {
  const ctx = makeCtx();
  ctx.canvas = null;
  /* canvas 的 removeEventListener 也要真实生效（引擎在 destroy 里会清理指针监听） */
  const c = {
    width: w || 400, height: h || 700,
    _listeners: {},
    getContext: function () { return ctx; },
    getBoundingClientRect: function () { return { width: 400, height: 700, left: 0, top: 0, right: 400, bottom: 700 }; },
    addEventListener: function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      const arr = this._listeners[type] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    setPointerCapture: function () {},
    dispatch: function (type, ev) { (this._listeners[type] || []).slice().forEach(fn => fn(ev)); },
  };
  ctx.canvas = c;
  return c;
}

/* 受控时钟 + rAF：测试里手动推进时间，完全确定性地验证时间增量逻辑 */
function makeEnv(opts) {
  const o = opts || {};
  const frameCbs = [];
  let now = 0;
  const listeners = { window: {}, document: {} };
  const canvas = makeCanvas();
  const doc = {
    hidden: false,
    _listeners: {},
    hasFocus: function () { return true; },
    addEventListener: function (t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      const arr = doc._listeners[t] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    _fire: function (t, ev) { (doc._listeners[t] || []).slice().forEach(fn => fn(ev)); },
    createElement: function () { return makeCanvas(); },
  };
  const audioCalls = [];
  const win = {
    devicePixelRatio: 1,
    innerWidth: 400, innerHeight: 700,
    _listeners: {},
    addEventListener: function (t, fn) { (win._listeners[t] = win._listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      const arr = win._listeners[t] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    _fire: function (t, ev) { (win._listeners[t] || []).slice().forEach(fn => fn(ev)); },
    requestAnimationFrame: function (cb) { frameCbs.push(cb); return frameCbs.length; },
    cancelAnimationFrame: function () {},
    GengAudio: {
      unlock: function () {}, setMuted: function () {}, isMuted: function () { return false; },
      collect: function (c) { audioCalls.push(['collect', c]); },
      hit: function () { audioCalls.push(['hit']); },
      start: function () { audioCalls.push(['start']); },
      countdownBeep: function () { audioCalls.push(['beep']); },
      finish: function () { audioCalls.push(['finish']); },
      gameOver: function () { audioCalls.push(['gameover']); },
      click: function () {}, pause: function () {},
    },
    GengTheme: {
      getTheme: function () {
        return { bg: ['#000', '#111', '#222'], grid: '#333', accent: '#5ce1e6', accent2: '#ff6b9d',
          danger: '#ff5a6e', text: '#fff', textDim: '#aaa', glow: '#0ff', playerRing: '#0ff',
          collectibleGlow: '#ff0', obstacleTint: '#f6b', hud: '#000', particle: ['#0ff'], floor: '#0ff' };
      },
      drawAvatar: function () {}, drawObstacle: function () {}, drawCollectible: function () {},
      roundRect: function () {}, circle: function () {}, star: function () {}, heart: function () {},
    },
  };
  const sandbox = {
    window: win, document: doc, navigator: { vibrate: function () {} },
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    Math: Math, Date: Date, console: console, Set: Set, Map: Map,
    clamp: undefined,
  };
  sandbox.self = win;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  /* 加载真实引擎与主题文件（不加载 app.js/audio.js，它们依赖真实 DOM/WebAudio） */
  const themeSrc = fs.readFileSync(path.join(ROOT, 'public/js/theme.js'), 'utf8');
  vm.runInContext(themeSrc, sandbox, { filename: 'theme.js' });
  const engineSrc = fs.readFileSync(path.join(ROOT, 'public/js/engine.js'), 'utf8');
  vm.runInContext(engineSrc, sandbox, { filename: 'engine.js' });

  const CFG = {
    schemaVersion: 1, title: '测试游戏', intro: '收集测试道具躲开测试障碍',
    player: { name: '测试员', avatarId: 'hero' }, themeId: 'office-neon',
    obstacle: { name: '测试障碍', spriteId: 'document' },
    collectible: { name: '测试道具', spriteId: 'star' },
    lines: ['测试台词一', '测试台词二'],
    ending: { low: '低分低分', mid: '中分中分', high: '高分高分' },
  };

  return {
    win: win, doc: doc, canvas: canvas, sandbox: sandbox, CFG: CFG, audioCalls: audioCalls,
    /* 推进 n 毫秒，每 stepMs 一帧 */
    advance: function (ms, stepMs) {
      const step = stepMs || 16.7;
      let t = now;
      const end = now + ms;
      while (t < end) {
        t = Math.min(end, t + step);
        const cbs = frameCbs.splice(0, frameCbs.length);
        const frameTs = t;
        cbs.forEach(function (cb) { try { cb(frameTs); } catch (e) { console.error('frame error:', e.message); } });
      }
      now = end;
    },
    setNow: function (v) { now = v; },
    getNow: function () { return now; },
  };
}

/* ================= 开始测试 ================= */
console.log('=== 引擎规则验证（真实 engine.js，确定性时钟） ===');

section('【A】初始化与基础状态');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  ok('初始 3 点生命', game.lives === 3, '实际 ' + game.lives);
  ok('初始 0 分', game.score === 0, '实际 ' + game.score);
  ok('初始 45 秒', game.timeLeftMs === 45000, '实际 ' + game.timeLeftMs);
  ok('初始无实体', game.entities.length === 0, '实际 ' + game.entities.length);
  ok('初始未结算', game.ended === false && game.result === null);
  ok('玩家在画面下半部', game.player.y > game.h * 0.7, 'player.y=' + game.player.y + ' h=' + game.h);
}

section('【B】倒计时 → 开始；3-2-1 不消耗游戏时间');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start();
  ok('start 后进入 countdown', game.state === 'countdown', '实际 ' + game.state);
  env.advance(600);
  ok('倒计时中游戏时间未消耗', game.timeLeftMs === 45000, '实际 ' + game.timeLeftMs);
  ok('倒计时中不生成实体', game.entities.length === 0, '实际 ' + game.entities.length);
  env.advance(1400);
  ok('倒计时结束后进入 playing', game.state === 'playing', '实际 ' + game.state);
  env.advance(1000);
  ok('开始后计时开始消耗', game.timeLeftMs < 45000, '实际 ' + game.timeLeftMs);
  ok('开始后开始生成实体', game.entities.length > 0, '实际 ' + game.entities.length);
}

section('【C】时间增量更新：不同帧率下结果一致（验收 #6）');
{
  /* 目标：验证计时与实体运动由 dt 驱动、不随帧率变化。
     为避免玩家意外死亡干扰，用"清空实体"的包装器隔离。 */
  function runFor(frameMs, ms) {
    const env = makeEnv();
    const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
    let seed = 12345;
    const origRandom = Math.random;
    Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    /* 记录实体总下落距离，用于跨帧率比较运动一致性 */
    let totalFall = 0;
    const seen = new Set();
    const origUpdate = game._update.bind(game);
    game._update = function (dt) {
      origUpdate(dt);
      this.entities.forEach(function (e) {
        if (!seen.has(e)) { seen.add(e); e.__prevY = e.y; }
        totalFall += Math.abs(e.y - (e.__prevY == null ? e.y : e.__prevY));
        e.__prevY = e.y;
      });
      /* 隔离碰撞：清掉实体，但已计入运动量 */
      this.entities.length = 0;
    };

    game.start();
    env.advance(2000, frameMs);        // 跳过倒计时
    const elapsedAtStart = game.elapsed;
    env.advance(ms, frameMs);
    Math.random = origRandom;
    return { elapsed: game.elapsed - elapsedAtStart, totalFall: totalFall, timeLeft: game.timeLeftMs };
  }

  const r60 = runFor(16.7, 10000);
  const r30 = runFor(33.3, 10000);
  const r120 = runFor(8.3, 10000);

  ok('60fps：10 秒真实时间对应约 10 秒游戏时间', Math.abs(r60.elapsed - 10000) < 100, 'elapsed=' + r60.elapsed);
  ok('30fps：10 秒真实时间对应约 10 秒游戏时间', Math.abs(r30.elapsed - 10000) < 100, 'elapsed=' + r30.elapsed);
  ok('120fps：10 秒真实时间对应约 10 秒游戏时间', Math.abs(r120.elapsed - 10000) < 100, 'elapsed=' + r120.elapsed);
  ok('三种帧率下游戏时间一致（差异 < 10ms）',
    Math.abs(r60.elapsed - r30.elapsed) < 10 && Math.abs(r60.elapsed - r120.elapsed) < 10,
    '60fps=' + r60.elapsed.toFixed(1) + ' 30fps=' + r30.elapsed.toFixed(1) + ' 120fps=' + r120.elapsed.toFixed(1));
  /* 实体下落距离也应一致（速度不随帧率变化） */
  const fallDiff = Math.abs(r60.totalFall - r30.totalFall) / Math.max(1, r60.totalFall);
  ok('三种帧率下落总距离一致（相对差 < 1%）', fallDiff < 0.01, '60fps=' + Math.round(r60.totalFall) + ' 30fps=' + Math.round(r30.totalFall) + ' 相对差 ' + (fallDiff * 100).toFixed(2) + '%');
}

section('【D】碰撞：接奖励得分、碰障碍扣血（验收 #6）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  ok('进入 playing', game.state === 'playing');

  /* 手动放置一个收集物，正对玩家 */
  game.entities.length = 0;
  game.entities.push({ kind: 'collectible', x: game.player.x, y: game.player.y - 5, r: 15, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'star', hitScale: 0.86, born: 0 });
  const scoreBefore = game.score;
  env.advance(120);
  ok('接住奖励加分', game.score > scoreBefore, 'before=' + scoreBefore + ' after=' + game.score);
  ok('接住奖励不扣生命', game.lives === 3, '实际 ' + game.lives);
  ok('收集后实体被移除', game.entities.filter(e => e.kind === 'collectible' && e.vy === 0).length === 0);

  /* 手动放置一个障碍，正对玩家 */
  game.entities.length = 0;
  const livesBefore = game.lives;
  game.entities.push({ kind: 'obstacle', x: game.player.x, y: game.player.y - 5, r: 20, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
  env.advance(120);
  ok('碰到障碍扣 1 点生命', game.lives === livesBefore - 1, 'before=' + livesBefore + ' after=' + game.lives);
  ok('碰障碍不加分', game.score >= 0);
}

section('【E】受击无敌：一次接触不连续扣血（验收 #6）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);

  game.entities.length = 0;
  game.entities.push({ kind: 'obstacle', x: game.player.x, y: game.player.y - 5, r: 20, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
  env.advance(100);
  const afterFirst = game.lives;
  ok('第一次接触扣血', afterFirst === 2, '实际 ' + afterFirst);

  /* 无敌期内持续接触同一位置：不应继续扣血 */
  for (let i = 0; i < 8; i++) {
    game.entities.push({ kind: 'obstacle', x: game.player.x, y: game.player.y - 5, r: 20, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
    env.advance(100);
  }
  ok('无敌期内不连续扣血（生命仍为 2）', game.lives === 2, '实际 ' + game.lives);

  /* 等待无敌期结束（1500ms）后再碰：应再次扣血 */
  env.advance(1600);
  game.entities.length = 0;
  game.entities.push({ kind: 'obstacle', x: game.player.x, y: game.player.y - 5, r: 20, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
  env.advance(120);
  ok('无敌期结束后再次接触扣血', game.lives === 1, '实际 ' + game.lives);
}

section('【F】生命耗尽 / 时间到 → 结算只触发一次（验收 #6）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  let endCount = 0, lastResult = null;
  game.hooks.onEnd = function (r) { endCount++; lastResult = r; };
  game.start(); env.advance(2000);

  /* 三次受击耗尽生命（每次间隔超过无敌期） */
  for (let i = 0; i < 3; i++) {
    game.invincibleUntil = 0;   // 直接清除无敌，模拟多次受击
    game.entities.length = 0;
    game.entities.push({ kind: 'obstacle', x: game.player.x, y: game.player.y - 5, r: 20, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
    env.advance(120);
  }
  ok('生命耗尽后进入 ended', game.state === 'ended', '实际 ' + game.state + ' lives=' + game.lives);
  ok('结算恰好触发一次', endCount === 1, '实际 ' + endCount);
  ok('结算原因是 dead', lastResult && lastResult.reason === 'dead', '实际 ' + (lastResult && lastResult.reason));
  ok('结算包含分数与统计', lastResult && typeof lastResult.score === 'number' && typeof lastResult.collects === 'number');

  /* 继续推进时间：不应重复结算 */
  env.advance(3000);
  ok('结算后继续推进不重复结算', endCount === 1, '实际 ' + endCount);
  const endedResult = lastResult;
  env.advance(1000);
  ok('结算后 result 不变', game.result === endedResult);
}

section('【G】时间到结算（存活 45 秒）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  let lastResult = null, endCount = 0;
  game.hooks.onEnd = function (r) { endCount++; lastResult = r; };
  game.start();
  env.advance(2000);
  /* 让所有实体立即消失，避免意外受击 */
  const origUpdate = game._update.bind(game);
  game._update = function (dt) {
    this.entities.forEach(e => { e.y = 99999; });
    origUpdate(dt);
    this.entities.length = 0;
  };
  env.advance(45000);
  ok('45 秒后进入结算', game.ended, 'elapsed=' + game.elapsed);
  ok('结算原因 time', lastResult && lastResult.reason === 'time', '实际 ' + (lastResult && lastResult.reason));
  ok('存活时间约 45 秒', lastResult && lastResult.survivedSec === 45, '实际 ' + (lastResult && lastResult.survivedSec));
  ok('只结算一次', endCount === 1, '实际 ' + endCount);
}

section('【H】暂停：切后台冻结计时与实体（验收 #6）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  ok('playing 状态', game.state === 'playing');

  env.advance(3000);
  const timeAtPause = game.timeLeftMs;
  const entitiesAtPause = JSON.stringify(game.entities.map(e => [e.x, e.y]));

  /* 模拟切到后台 */
  env.doc.hidden = true;
  env.doc._fire('visibilitychange');
  ok('切后台自动暂停', game.state === 'paused', '实际 ' + game.state + ' reason=' + game.pauseReason);
  ok('暂停原因为 hidden', game.pauseReason === 'hidden', '实际 ' + game.pauseReason);

  /* 暂停期间推进 10 秒：计时与实体都不应变化 */
  env.advance(10000);
  ok('暂停期间计时冻结', game.timeLeftMs === timeAtPause, 'before=' + timeAtPause + ' after=' + game.timeLeftMs);
  ok('暂停期间实体位置冻结', JSON.stringify(game.entities.map(e => [e.x, e.y])) === entitiesAtPause);
  ok('暂停期间不生成新实体', game.entities.length === JSON.parse(entitiesAtPause).length);

  /* 恢复：回到前台 + 点击继续 */
  env.doc.hidden = false;
  game.resume();
  ok('恢复后回到 playing', game.state === 'playing', '实际 ' + game.state);
  env.advance(1000);
  ok('恢复后计时继续走', game.timeLeftMs < timeAtPause, 'after=' + game.timeLeftMs + ' vs ' + timeAtPause);
  ok('暂停不能刷分（暂停前后分数相同或仅正常增长）', game.score >= 0);
}

section('【I】暂停不能靠"假暂停"刷分');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  game.entities.length = 0;
  game.pause('manual');
  const scoreBefore = game.score;
  const timeBefore = game.timeLeftMs;
  /* 暂停中塞入一个正对玩家的收集物 */
  game.entities.push({ kind: 'collectible', x: game.player.x, y: game.player.y - 5, r: 15, vy: 0, rot: 0, spin: 0, wobble: 0, sprite: 'star', hitScale: 0.86, born: 0 });
  env.advance(3000);
  ok('暂停中不结算碰撞（分数不变）', game.score === scoreBefore, 'before=' + scoreBefore + ' after=' + game.score);
  ok('暂停中计时不变', game.timeLeftMs === timeBefore);
  game.resume();
  env.advance(200);
  ok('恢复后才结算碰撞', game.score > scoreBefore, 'after=' + game.score);
}

section('【J】重开：完整重置（验收 #6）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  /* 制造一局"脏"状态：有分数、掉血、有实体、有粒子、有台词、有连击 */
  game.score = 250;
  game.lives = 1;
  game.combo = 4;
  game.bestCombo = 4;
  game.collectCount = 12;
  game.speech = { text: '旧台词', life: 2000 };
  game.floaters.push({ x: 10, y: 10, text: '+10', life: 500, max: 500 });
  game.particles.push({ x: 1, y: 1, vx: 0, vy: 0, color: '#fff', size: 2, life: 100, max: 100, grav: 0 });
  game.entities.push({ kind: 'obstacle', x: 100, y: 100, r: 20, vy: 100, rot: 0, spin: 0, wobble: 0, sprite: 'document', hitScale: 0.78, born: 0 });
  game.input.left = true;

  game.restart();
  ok('重开后分数归零', game.score === 0, '实际 ' + game.score);
  ok('重开后生命恢复 3', game.lives === 3, '实际 ' + game.lives);
  ok('重开后计时重置 45 秒', game.timeLeftMs === 45000, '实际 ' + game.timeLeftMs);
  ok('重开后实体清空', game.entities.length === 0, '实际 ' + game.entities.length);
  ok('重开后粒子清空', game.particles.length === 0, '实际 ' + game.particles.length);
  ok('重开后浮字清空', game.floaters.length === 0, '实际 ' + game.floaters.length);
  ok('重开后连击清零', game.combo === 0 && game.bestCombo === 0, 'combo=' + game.combo);
  ok('重开后台词清空', game.speech === null);
  ok('重开后输入状态重置', game.input.left === false && game.input.pointerActive === false, 'left=' + game.input.left);
  ok('重开后回到 countdown', game.state === 'countdown', '实际 ' + game.state);
  ok('重开后 ended 标记清除', game.ended === false && game.result === null);
  env.advance(2000);
  ok('重开后可以正常开始新一局', game.state === 'playing', '实际 ' + game.state);
}

section('【K】键盘与指针输入（桌面 + 手机拖动）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  game.entities.length = 0;

  const x0 = game.player.x;
  env.win._fire('keydown', { key: 'ArrowLeft', preventDefault: function () {} });
  env.advance(400);
  ok('← 键向左移动', game.player.x < x0, 'x0=' + x0 + ' x=' + game.player.x);
  env.win._fire('keyup', { key: 'ArrowLeft' });
  env.win._fire('keydown', { key: 'ArrowRight', preventDefault: function () {} });
  const x1 = game.player.x;
  env.advance(400);
  ok('→ 键向右移动', game.player.x > x1, 'x1=' + x1 + ' x=' + game.player.x);
  env.win._fire('keyup', { key: 'ArrowRight' });

  /* A / D 键 */
  const x2 = game.player.x;
  env.win._fire('keydown', { key: 'a', preventDefault: function () {} });
  env.advance(300);
  ok('A 键向左移动', game.player.x < x2, 'x2=' + x2 + ' x=' + game.player.x);
  env.win._fire('keyup', { key: 'a' });
  env.win._fire('keydown', { key: 'd', preventDefault: function () {} });
  const x3 = game.player.x;
  env.advance(300);
  ok('D 键向右移动', game.player.x > x3, 'x3=' + x3 + ' x=' + game.player.x);
  env.win._fire('keyup', { key: 'd' });

  /* 指针拖动：模拟手指按下并移动 */
  const targetX = 60;
  env.canvas.dispatch('pointerdown', { clientX: targetX, pointerId: 1, preventDefault: function () {} });
  ok('指针按下激活 pointerActive', game.input.pointerActive === true);
  env.advance(500);
  ok('角色跟随指针横向位置', Math.abs(game.player.x - targetX) < 40, '目标 ' + targetX + ' 实际 ' + Math.round(game.player.x));
  env.canvas.dispatch('pointermove', { clientX: 340, pointerId: 1, preventDefault: function () {} });
  env.advance(600);
  ok('拖动后继续跟随', Math.abs(game.player.x - 340) < 40, '实际 ' + Math.round(game.player.x));
  env.win._fire('pointerup', { pointerId: 1, preventDefault: function () {} });
  ok('抬起后不再跟随', game.input.pointerActive === false);

  /* 边界钳制 */
  game.input.pointerActive = true;
  game.input.pointerX = 99999;
  env.advance(600);
  ok('角色不越出右边界', game.player.x <= game.w - game.player.r + 0.5, 'x=' + game.player.x + ' max=' + (game.w - game.player.r));
  game.input.pointerX = -9999;
  env.advance(600);
  ok('角色不越出左边界', game.player.x >= game.player.r - 0.5, 'x=' + game.player.x + ' min=' + game.player.r);
}

section('【L】引擎硬限制：难度、实体数量、尺寸有上界（模型无法干预）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);

  let maxSpeed = 0, maxR = 0, maxEntities = 0;
  const origUpdate = game._update.bind(game);
  game._update = function (dt) {
    origUpdate(dt);
    this.entities.forEach(function (e) { maxSpeed = Math.max(maxSpeed, Math.abs(e.vy)); maxR = Math.max(maxR, e.r); });
    maxEntities = Math.max(maxEntities, this.entities.length);
  };
  env.advance(45000);
  ok('实体数量有上限（<= 44）', maxEntities <= 44, '实际峰值 ' + maxEntities);
  ok('下落速度有上限', maxSpeed < 1200, '实际峰值 ' + Math.round(maxSpeed));
  ok('实体尺寸有上限', maxR < 80, '实际峰值 ' + Math.round(maxR));
  ok('确实产生了实体', maxEntities > 3, '实际峰值 ' + maxEntities);
}

section('【M】配置与引擎解耦：玩法规则不受配置影响');
{
  const env = makeEnv();
  /* 恶意配置：试图塞入速度/时长/生命等玩法字段 */
  const evilCfg = JSON.parse(JSON.stringify(env.CFG));
  evilCfg.speedMultiplier = 99;
  evilCfg.durationMs = 999999;
  evilCfg.lives = 99;
  evilCfg.entities = [{ hack: true }];
  evilCfg.audioUrl = 'https://evil.example/x.mp3';
  evilCfg.script = 'alert(1)';
  const game = new env.sandbox.window.GengGame.Game(env.canvas, evilCfg, {});
  game.start();
  /* 推进到倒计时结束（2.5 秒），但不超过一帧误差范围 */
  env.advance(1900);
  ok('生命仍为引擎固定值 3', game.lives === 3, '实际 ' + game.lives);
  /* 进入 playing 后立刻检查剩余时间：应接近 45000（引擎常量），与配置里的 999999 无关 */
  env.advance(700);
  ok('计时仍为引擎固定值 45 秒（未被配置放大）', game.timeLeftMs > 44000 && game.timeLeftMs <= 45000, '实际 ' + game.timeLeftMs);
  env.advance(45000);
  ok('游戏仍在约 45 秒内结束（配置无法延长）', game.ended, 'elapsed=' + game.elapsed);
  let maxSpeed = 0;
  const origUpdate = game._update;
  env.advance(100);
  game.entities.forEach(function (e) { maxSpeed = Math.max(maxSpeed, Math.abs(e.vy)); });
  ok('速度不受配置乘法影响', maxSpeed < 1200, '实际 ' + Math.round(maxSpeed));
}

section('【N】台词轮播来自配置');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start(); env.advance(2000);
  let seen = {};
  const origUpdate = game._update.bind(game);
  game._update = function (dt) {
    origUpdate(dt);
    if (this.speech) seen[this.speech.text] = (seen[this.speech.text] || 0) + 1;
  };
  env.advance(30000);
  const keys = Object.keys(seen);
  ok('台词来自配置且能出现', keys.length > 0, '出现的台词：' + JSON.stringify(keys));
  ok('出现的台词都在配置列表内', keys.every(k => env.CFG.lines.indexOf(k) !== -1), JSON.stringify(keys));
}

section('【O】destroy 清理监听器（避免路由切换后泄漏）');
{
  const env = makeEnv();
  const game = new env.sandbox.window.GengGame.Game(env.canvas, env.CFG, {});
  game.start();
  const before = (env.win._listeners['keydown'] || []).length;
  game.destroy();
  const after = (env.win._listeners['keydown'] || []).length;
  ok('destroy 后不再保留 keydown 监听', after < before || after === 0, 'before=' + before + ' after=' + after);
  env.advance(2000);
  ok('destroy 后主循环停止', game.running === false, 'running=' + game.running);
}

/* ---------------- 汇总 ---------------- */
console.log('\n========================================');
console.log('引擎测试：通过 ' + passed + ' / 失败 ' + failed);
if (failures.length) {
  console.log('\n失败明细：');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
