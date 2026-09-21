/* 「梗一下」第二轮玩法引擎：三路跑酷（RunnerGame）+ 限时点击（ClickGame）。
 *
 * 与第一轮 public/js/engine.js（躲避收集）保持完全一致的架构与生命周期，
 * 前端 app.js 可以用同一套 hooks 驱动三个引擎：
 *  - _tick(ts) 时间增量更新（dtMs，上限 1000ms），速度与帧率无关；
 *  - requestAnimationFrame 主循环 + this.running / this.raf；
 *  - reset() 完整重开；start() / restart() / pause(reason) / resume() / destroy()；
 *  - this.state: 'idle' | 'countdown' | 'playing' | 'paused' | 'ended'；
 *  - _emit('score'|'lives'|'combo'|'state'|'end', value) 经 this.hooks 回调外部；
 *  - _finish(reason) 用 this.ended 保证一局只结算一次；
 *  - resize() 处理画布尺寸与 dpr；失焦/切后台自动暂停；
 *  - _bind() 绑定输入，destroy() 逐个清理监听器。
 *
 * 与第一轮一致的硬性约束：
 *  - 玩法规则、速度、时长、生命、生成密度全部硬编码在本引擎内，绝不从 cfg 读取；
 *    cfg 只提供文案与素材：title / intro / ruleText / mode / sceneId /
 *    player.name / player.avatarId / obstacle.name / obstacle.spriteId /
 *    collectible.name / collectible.spriteId / lines[] / ending{low,mid,high}；
 *  - 零依赖：只用 Canvas 2D 与标准 DOM API。
 *
 * 本文件自己保证的两条安全规则（有配套自测）：
 *  - 跑酷：每一排障碍最多占 2 条跑道，永远留出至少 1 条空道；且相邻两排的
 *    「安全道」最多相差 1 条道（玩家每排最多只需切一次道），生成记录进 this.rows；
 *  - 点击：目标永远完整落在场地内（x±r、y±r 都不越界），与所有同时存在的
 *    目标保持最小间距（圆心距 > r1 + r2），位置由「随机采样 + 网格兜底」求得。
 */
'use strict';

const GengModes = (function () {

  /* ================= 通用常量 ================= */
  const START_LIVES = 3;
  const COUNTDOWN_MS = 1800;          // 开局 3-2-1
  const COMBO_WINDOW_MS = 2500;       // 连击窗口（与躲避收集同一套手感语言）
  const MAX_PARTICLES = 260;          // 粒子硬上限
  const REF_HEIGHT = 640;             // 速度参考高度（其他尺寸按比例缩放）

  /* ================= 三路跑酷参数（引擎硬编码，含上限） ================= */
  const RUNNER_DURATION_MS = 45000;
  const RUNNER_INVINCIBLE_MS = 1500;
  const RUNNER_MAX_SCORE = 950;
  const RUNNER = {
    lanes: 3,
    playerRRatio: 0.050,              // 玩家半径 = min(w,h) * 该比例
    obstacleRRatio: 0.086,
    collectibleRRatio: 0.070,
    switchMs: 140,                    // 切一道的动画时长（固定时长 → 帧率无关）
    speed: [190, 460],                // px/s（640 参考高度）
    speedMax: 520,                    // 速度硬上限（参考高度）
    rowIntervalMs: [1180, 640],       // 两排出怪的时间间隔 由松到密
    rowGapPxRatio: 0.30,              // 两排之间的最小像素间距（相对场高）
    twoBlockRatio: [0.16, 0.42],      // 一排堵两条道的比例（上限 0.42 → 绝不堵三条）
    collectibleChance: [0.62, 0.50],  // 空道上出现奖励的概率
    maxEntities: 30,                  // 实体硬上限
    maxRows: 240,                     // 生成记录上限（供自测/调试读取）
    hintMs: 6200,                     // 初次操作提示停留时间
    trailParticles: 0.4,
    minReachRatio: 0.52,              // 反应时间下限：一排从生成到抵达玩家 >= 参考周期的该比例
    minReachMs: 700,                  // 反应时间下限的绝对下限（ms）
    /* 两排之间的时间间隔还必须容纳：上一排「完全离开玩家」+ 一次切道 + 缓冲。
       否则玩家刚躲过一排就立刻要为下一排切道，切道途中会蹭到刚过去的那一排。 */
    comfortMs: 240,
  };

  /* ================= 限时点击参数（引擎硬编码，含上限） ================= */
  const CLICK_DURATION_MS = 35000;
  const CLICK_INVINCIBLE_MS = 1200;   // 点错后的受击无敌，避免一次误点连续扣血
  const CLICK_MAX_SCORE = 1200;
  const CLICK = {
    rRatio: 0.072,                    // 目标半径 = min(w,h) * 该比例
    minR: 26,                         // 目标半径下限（点击面积硬保证）
    maxR: 46,                         // 目标半径上限
    hitScale: 1.06,                   // 命中判定略大于绘制半径（更宽容）
    lifetimeMs: [2200, 1250],         // 目标存活时间 由松到紧
    minLifetimeMs: 1100,              // 存活时间硬下限
    spawnIntervalMs: [880, 520],      // 生成间隔 由疏到密
    decoyRatio: [0.22, 0.46],         // 干扰项占比（上限 0.46）
    maxDecoyRatio: 0.46,
    maxTargets: 14,                   // 同屏活动目标硬上限
    minGapPx: 6,                      // 目标之间的额外最小间距（保证不重叠遮挡）
    spawnTries: 80,                   // 随机采样次数，失败后走网格兜底
    padX: 0.030,                      // 场地左右留白（相对画布宽）
    padTop: 0.13,                     // 场地顶部留白（给 HUD 与规则提示让位）
    padBottom: 0.075,
    hintMs: 6000,                     // 规则图例停留时间
  };

  /* ================= 小工具 ================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* 兜底配色：与 theme.js 的 office-neon 一致。任何取色失败都能画出东西。 */
  const FALLBACK_PALETTE = {
    bg: ['#0b1026', '#141a3d', '#1d2350'],
    grid: 'rgba(120,150,255,0.07)',
    accent: '#5ce1e6',
    accent2: '#ff6b9d',
    danger: '#ff5a6e',
    text: '#eef2ff',
    textDim: 'rgba(238,242,255,0.66)',
    glow: 'rgba(92,225,230,0.35)',
    playerRing: '#5ce1e6',
    collectibleGlow: '#5ce1e6',
    obstacleTint: '#ff6b9d',
    hud: 'rgba(20,26,61,0.72)',
    particle: ['#5ce1e6', '#8affc1', '#ffd166'],
    floor: 'rgba(92,225,230,0.12)',
  };

  function themeApi() {
    return (typeof window !== 'undefined' && window.GengTheme) ? window.GengTheme : null;
  }
  function audioApi() {
    return (typeof window !== 'undefined' && window.GengAudio) ? window.GengAudio : null;
  }

  /* 场景取色：v2 里主题换成「场景」，取色接口是 getScenePalette(sceneId)；
     老版本是 getTheme(themeId)。两者都做兼容，缺字段一律补兜底值。 */
  function resolvePalette(cfg) {
    const G = themeApi();
    const id = (cfg && (cfg.sceneId || cfg.themeId)) || '';
    let th = null;
    if (G) {
      try {
        if (typeof G.getScenePalette === 'function') th = G.getScenePalette(id);
        if (!th && typeof G.getTheme === 'function') th = G.getTheme(id);
      } catch (e) { th = null; }
    }
    /* 只有在用 Node 的 require 直接加载本文件时才走这条路（浏览器/沙箱里 require 不存在，
       会跳过）；从 shared/scenes.js 取该场景的 palette 兜底。 */
    if (!th && typeof require === 'function') {
      try {
        const Scenes = require('../../../shared/scenes.js');
        const sc = Scenes.getScene(id);
        if (sc && sc.palette) th = sc.palette;
      } catch (e) { th = null; }
    }
    const out = {};
    const keys = Object.keys(FALLBACK_PALETTE);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = (th && th[k] != null) ? th[k] : FALLBACK_PALETTE[k];
    }
    return out;
  }

  function drawSprite(kind, ctx, id, size, th) {
    const G = themeApi();
    if (!G) return;
    try {
      if (kind === 'player' && typeof G.drawAvatar === 'function') G.drawAvatar(ctx, id, size, 0);
      else if (kind === 'obstacle' && typeof G.drawObstacle === 'function') G.drawObstacle(ctx, id, size, th);
      else if (kind === 'collectible' && typeof G.drawCollectible === 'function') G.drawCollectible(ctx, id, size, th);
    } catch (e) { /* 素材失败不能影响玩法 */ }
  }

  /* ======================================================================
   * 基类：把「生命周期 / 计时 / 暂停恢复 / 结算 / 粒子浮字 / 台词」这些
   * 与玩法无关的部分集中在这里，两个玩法只实现自己的 update / render / 输入。
   * ==================================================================== */
  class BaseGame {
    constructor(canvas, cfg, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cfg = cfg || {};
      this.hooks = hooks || {};
      this.theme = resolvePalette(this.cfg);

      this.dpr = Math.min(2.5, ((typeof window !== 'undefined' && window.devicePixelRatio) || 1));
      this.w = 0;
      this.h = 0;
      this.minDim = 0;
      this.speedScale = 1;

      this.raf = 0;
      this.lastTs = 0;
      this.running = false;           // 主循环是否在跑
      this.state = 'idle';            // idle | countdown | playing | paused | ended
      this.pauseReason = '';
      this.pausedFromState = 'countdown';
      this.ended = false;             // 保证一局只结算一次
      this.result = null;

      this.durationMs = 0;            // 子类在构造函数里给
      this.startLives = START_LIVES;
    }

    /* ---------------- 状态重置（子类先调 super.reset()，再重置自己的状态） ---------------- */
    reset() {
      this.elapsed = 0;
      this.lives = this.startLives || START_LIVES;
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.lastCollectAt = -99999;
      this.collectCount = 0;
      this.obstacleCount = 0;
      this.invincibleUntil = 0;
      this.hitFlash = 0;
      this.shake = 0;
      this.timeLeftMs = this.durationMs;
      this.countdownLeftMs = COUNTDOWN_MS;
      this.particles = [];
      this.floaters = [];
      this.lineIndex = 0;
      this.lineTimer = 2600;
      this.speech = null;
      this.ended = false;
      this.result = null;
      this.audioDone = { lastBeep: -1, started: false };
      this._resetInput();
    }

    /* ---------------- 尺寸 ---------------- */
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(240, Math.round(rect.width));
      const h = Math.max(320, Math.round(rect.height));
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.minDim = Math.min(w, h);
      this.speedScale = h / REF_HEIGHT;
      this._layout();
    }

    /* ---------------- 输入（公共部分：失焦、缩放、右键菜单；玩法输入在 _bindInput） ---------------- */
    _bind() {
      const self = this;

      this._onResize = function () { self.resize(); };
      window.addEventListener('resize', this._onResize);

      this._onContextMenu = function (e) { e.preventDefault(); };
      this.canvas.addEventListener('contextmenu', this._onContextMenu);

      /* 失焦 / 切后台 → 自动暂停 */
      this._onVisibility = function () { if (document.hidden) self.pause('hidden'); };
      this._onBlur = function () { self.pause('blur'); };
      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('blur', this._onBlur);

      this._bindInput();
    }

    destroy() {
      this.stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      window.removeEventListener('blur', this._onBlur);
      if (this.canvas && this._onContextMenu) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
      this._unbindInput();
    }

    /* 子类实现 */
    _layout() {}
    _bindInput() {}
    _unbindInput() {}
    _resetInput() { this.input = {}; }
    _clearInput() { this.input = {}; }
    _updatePlay() {}
    _buildResult() { return { score: this.score, lives: this.lives, bestCombo: this.bestCombo }; }

    /* ---------------- 生命周期 ---------------- */
    start() {
      this.reset();
      this.resize();
      /* 若在页面不可见/失焦时开始，直接进入暂停态：rAF 不会运行，
         不能让用户看到一个「已经开始但不走」的假游戏。 */
      if (typeof document !== 'undefined' && (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()))) {
        this.state = 'paused';
        this.pausedFromState = 'countdown';
        this.pauseReason = 'not-visible';
        this._emit('state', 'paused', { reason: 'not-visible' });
        this._render();
        return;
      }
      this.state = 'countdown';
      this.pausedFromState = 'countdown';
      this._loopStart();
      this._emit('state', 'countdown');
    }

    restart() { this.start(); }

    _loopStart() {
      if (this.running) return;
      this.running = true;
      this.lastTs = 0;
      const self = this;
      this.raf = requestAnimationFrame(function step(ts) {
        if (!self.running) return;
        self._tick(ts);
        self.raf = requestAnimationFrame(step);
      });
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    pause(reason) {
      if (this.state !== 'playing' && this.state !== 'countdown') return;
      if (this.state === 'paused') return;
      this.pausedFromState = this.state;
      this.state = 'paused';
      this.pauseReason = reason || 'manual';
      this._clearInput();
      this._emit('state', 'paused', { reason: this.pauseReason });
      this._render();
    }

    resume() {
      if (this.state !== 'paused') return;
      /* 恢复前再确认页面可见：不可见时 rAF 不跑，保持暂停态更诚实 */
      if (typeof document !== 'undefined' && document.hidden) return;
      this.state = this.pausedFromState || 'playing';
      this.lastTs = 0;
      this._loopStart();
      this._emit('state', this.state);
    }

    /* ---------------- 主循环 ---------------- */
    _tick(ts) {
      if (!this.lastTs) this.lastTs = ts;
      let dtMs = ts - this.lastTs;
      this.lastTs = ts;
      /* 时间增量更新：低帧率也必须按真实时间推进（验收：速度不随帧率变化）。
         上限 1 秒只用于挡住系统休眠/进程挂起造成的超大跳变。 */
      if (dtMs > 1000) dtMs = 1000;
      if (dtMs < 0) dtMs = 0;

      if (this.state !== 'paused') this._update(dtMs);
      this._render();
    }

    _update(dtMs) {
      const dt = dtMs / 1000;

      if (this.state === 'countdown') {
        this.countdownLeftMs -= dtMs;
        const secLeft = Math.ceil(this.countdownLeftMs / 600);
        if (this.audioDone.lastBeep !== secLeft) {
          this.audioDone.lastBeep = secLeft;
          const A = audioApi();
          if (A && secLeft >= 1 && secLeft <= 3) A.countdownBeep(secLeft === 1);
        }
        if (this.countdownLeftMs <= 0) {
          this.state = 'playing';
          this._emit('state', 'playing');
          const A = audioApi();
          if (A && !this.audioDone.started) { this.audioDone.started = true; A.start(); }
        }
        return;
      }
      if (this.state !== 'playing') return;

      this.elapsed += dtMs;
      this.timeLeftMs = Math.max(0, this.durationMs - this.elapsed);
      const p = clamp(this.elapsed / this.durationMs, 0, 1);

      /* 最后 3 秒提示音 */
      const secLeft = Math.ceil(this.timeLeftMs / 1000);
      if (secLeft <= 3 && secLeft >= 1 && this.audioDone.lastBeep !== secLeft + 100) {
        this.audioDone.lastBeep = secLeft + 100;
        const A = audioApi();
        if (A) A.countdownBeep(secLeft === 1);
      }

      this._updatePlay(dt, dtMs, p);     // 玩法特有
      this._updateShared(dtMs, dt);      // 粒子 / 浮字 / 连击窗口 / 台词 / 闪光

      /* --- 结束判定（只触发一次） --- */
      if (!this.ended && (this.timeLeftMs <= 0 || this.lives <= 0)) {
        this._finish(this.lives <= 0 ? 'dead' : 'time');
      }
    }

    _updateShared(dtMs, dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dtMs;
        if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += pt.grav * dt;
        pt.vx *= Math.pow(0.35, dt);
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life -= dtMs;
        if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
        f.y -= 42 * dt;
      }
      if (this.combo > 0 && this.elapsed - this.lastCollectAt > COMBO_WINDOW_MS) this.combo = 0;

      this.lineTimer -= dtMs;
      if (this.lineTimer <= 0 && this.cfg.lines && this.cfg.lines.length) {
        this.speech = { text: this.cfg.lines[this.lineIndex % this.cfg.lines.length], life: 2600 };
        this.lineIndex++;
        this.lineTimer = rand(6200, 9200);
      }
      if (this.speech) { this.speech.life -= dtMs; if (this.speech.life <= 0) this.speech = null; }

      this.hitFlash = Math.max(0, this.hitFlash - dtMs);
      this.shake = Math.max(0, this.shake - dtMs * 0.004);
    }

    /* ---------------- 计分 / 反馈（与躲避收集同一套语言） ---------------- */
    _gainForCombo() { return 10 + Math.min(this.combo - 1, 5) * 4; }

    _breakCombo() {
      if (this.combo > 0) { this.combo = 0; this._emit('combo', 0); }
    }

    _burst(x, y, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(speed * 0.3, speed);
        this._spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
          pickOne(colors), rand(2, 5.2), rand(280, 620), 240);
      }
    }

    _spawnParticle(x, y, vx, vy, color, size, life, grav) {
      if (this.particles.length > MAX_PARTICLES) return;
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, color: color, size: size, life: life, max: life, grav: grav || 0 });
    }

    _finish(reason) {
      if (this.ended) return;
      this.ended = true;
      this.state = 'ended';
      const secondsSurvived = Math.round(this.elapsed / 1000);
      this.result = this._buildResult(reason, secondsSurvived);
      const A = audioApi();
      if (A) {
        if (reason === 'dead') A.gameOver();
        else A.finish(this.score, this.estimateMaxScore());
      }
      this._emit('state', 'ended');
      this._emit('end', this.result);
    }

    estimateMaxScore() { return 900; }

    _emit(name, value, extra) {
      if (this.hooks['on' + name.charAt(0).toUpperCase() + name.slice(1)]) {
        try { this.hooks['on' + name.charAt(0).toUpperCase() + name.slice(1)](value, extra); } catch (e) {}
      }
    }

    /* ---------------- 公共渲染块 ---------------- */
    _renderBackdrop(ctx) {
      const th = this.theme;
      const w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.bg[0]);
      g.addColorStop(0.55, th.bg[1]);
      g.addColorStop(1, th.bg[2]);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      /* v2 场景背景（art-scenes.js）可用时叠加；不可用时保持纯渐变，不留破绽 */
      const sceneId = this.cfg && this.cfg.sceneId;
      const G = themeApi();
      if (G && sceneId && typeof G.drawSceneBackground === 'function') {
        try { G.drawSceneBackground(ctx, sceneId, w, h, th, this.elapsed / 1000); } catch (e) {}
      }
    }

    _renderGrid(ctx, cell) {
      const th = this.theme;
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 1;
      const c = Math.max(34, cell || this.w / 9);
      ctx.beginPath();
      for (let x = 0; x < this.w + c; x += c) { ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
      for (let y = 0; y < this.h + c; y += c) { ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
      ctx.stroke();
    }

    _renderParticles(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        const a = clamp(pt.life / pt.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    _renderFloaters(ctx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < this.floaters.length; i++) {
        const f = this.floaters[i];
        const a = clamp(f.life / f.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = (f.big ? '700 ' : '600 ') + Math.round(Math.max(15, this.w * 0.045) * (f.big ? 1.15 : 1)) + 'px system-ui, sans-serif';
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    _renderHitFlash(ctx) {
      if (this.hitFlash <= 0) return;
      ctx.globalAlpha = clamp(this.hitFlash / 260, 0, 1) * 0.42;
      ctx.fillStyle = this.theme.danger;
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
      ctx.globalAlpha = 1;
    }

    _renderSpeech(ctx) {
      if (!this.speech || (this.state !== 'playing' && this.state !== 'countdown')) return;
      const th = this.theme;
      const w = this.w, h = this.h;
      const a = clamp(Math.min(this.speech.life, 400) / 400, 0, 1);
      ctx.globalAlpha = a * 0.96;
      const fs = Math.round(clamp(w * 0.042, 13, 19));
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      const tw = ctx.measureText(this.speech.text).width;
      const padX = 16, bh = fs + 18;
      const bw = Math.min(w - 24, tw + padX * 2);
      const bx = (w - bw) / 2, by = Math.max(12, h * 0.075);
      ctx.fillStyle = th.hud;
      const G = themeApi();
      if (G && G.roundRect) { G.roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill(); }
      else { ctx.fillRect(bx, by, bw, bh); }
      ctx.fillStyle = th.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.speech.text, w / 2, by + bh / 2 + 1);
      ctx.globalAlpha = 1;
    }

    _renderCountdown(ctx) {
      if (this.state !== 'countdown') return;
      const th = this.theme;
      const w = this.w, h = this.h;
      const n = Math.ceil(this.countdownLeftMs / 600);
      const label = n >= 3 ? '3' : (n === 2 ? '2' : '1');
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = th.text;
      ctx.font = '800 ' + Math.round(Math.min(w, h) * 0.26) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h * 0.46);
      ctx.font = '600 ' + Math.round(clamp(w * 0.05, 14, 22)) + 'px system-ui, sans-serif';
      ctx.fillStyle = th.textDim;
      ctx.fillText('准备', w / 2, h * 0.46 + Math.min(w, h) * 0.19);
      ctx.globalAlpha = 1;
    }

    /* 画一条带底色的说明条（玩法提示 / 规则图例共用） */
    _renderBanner(ctx, text, cx, cy, opts) {
      const o = opts || {};
      const th = this.theme;
      const fs = Math.round(clamp(this.w * (o.scale || 0.040), 13, 20));
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      const padX = 14, bh = fs + 16;
      const bw = Math.min(this.w - 20, tw + padX * 2);
      ctx.globalAlpha = o.alpha == null ? 0.94 : o.alpha;
      ctx.fillStyle = th.hud;
      const G = themeApi();
      if (G && G.roundRect) { G.roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2); ctx.fill(); }
      else { ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh); }
      ctx.fillStyle = o.color || th.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy + 1);
      ctx.globalAlpha = 1;
    }

    _shakeOffsetX() { return this.shake > 0.01 ? rand(-this.shake * 7, this.shake * 7) : 0; }
    _shakeOffsetY() { return this.shake > 0.01 ? rand(-this.shake * 7, this.shake * 7) : 0; }
  }

  /* ======================================================================
   * 玩法 A：三路跑酷 RunnerGame
   *  - 三条纵向跑道，玩家在最下方，障碍与奖励从上方向下接近；
   *  - ←/→ 键、A/D 键或左右滑动切道（固定时长补间 → 任何帧率下位移一致）；
   *  - 每一排最多堵 2 条道（硬性规则），相邻两排的安全道最多相差 1 条道；
   *  - 速度 / 密度随时间渐进，但有速度上限与最小反应间隔两道硬闸。
   * ==================================================================== */
  class RunnerGame extends BaseGame {
    constructor(canvas, cfg, hooks) {
      super(canvas, cfg, hooks);
      this.durationMs = RUNNER_DURATION_MS;
      this.startLives = START_LIVES;
      this.reset();
      this.resize();
      this._bind();
    }

    reset() {
      super.reset();
      this.entities = [];
      this.rows = [];                 // 每一排的生成记录（供自测/调试检查可避开性）
      this.rowSeq = 0;
      this.lastSafeLane = null;       // 上一排指定的安全道
      this.distance = 0;              // 累计前进距离（px）
      this.sinceRowMs = 0;
      this.speedNow = 0;
      this.lane = 1;
      this.switchCount = 0;
      this.hintLeftMs = RUNNER.hintMs;
      this.player = { x: 0, y: 0, r: 18, sw: null };
    }

    _resetInput() {
      this.input = { left: false, right: false, swiping: false, swipeStartX: 0, swipeStartY: 0, swipeId: null };
    }

    _clearInput() {
      this.input.left = false;
      this.input.right = false;
      this.input.swiping = false;
    }

    _layout() {
      this.laneW = this.w / RUNNER.lanes;
      this.laneCenters = [this.laneW * 0.5, this.laneW * 1.5, this.laneW * 2.5];
      this.obstacleR = clamp(this.minDim * RUNNER.obstacleRRatio, 16, 38);
      this.collectibleR = clamp(this.minDim * RUNNER.collectibleRRatio, 13, 32);
      if (!this.player) this.player = { x: 0, y: 0, r: 18, sw: null };
      const pr = clamp(this.minDim * RUNNER.playerRRatio, 14, 26);
      this.player.r = pr;
      this.player.y = this.h - Math.max(this.h * 0.115, pr + 18);
      /* 不在切道补间中时，玩家吸附在跑道中心 */
      this.player.x = clamp(this.player.sw ? this.player.x : this.laneCenters[this.lane || 1], pr, this.w - pr);
    }

    /* ---------------- 输入：键盘 + 滑动 ---------------- */
    _bindInput() {
      const self = this;

      this._onKeyDown = function (e) {
        if (self.state === 'ended') return;
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { self._switchLane(-1); e.preventDefault(); }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { self._switchLane(1); e.preventDefault(); }
      };

      const SWIPE_PX = 26;
      this._onPointerDown = function (e) {
        self.input.swiping = true;
        self.input.swipeStartX = e.clientX;
        self.input.swipeStartY = e.clientY;
        self.input.swipeId = e.pointerId;
        if (self.canvas.setPointerCapture) { try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {} }
        e.preventDefault();
      };
      this._onPointerMove = function (e) {
        if (!self.input.swiping) return;
        const dx = e.clientX - self.input.swipeStartX;
        if (Math.abs(dx) >= SWIPE_PX) { self._switchLane(dx > 0 ? 1 : -1); self.input.swipeStartX = e.clientX; }
        e.preventDefault();
      };
      this._onPointerUp = function (e) {
        if (!self.input.swiping) return;
        /* 位移没经过 move 事件时（快速滑动）在抬手时补判一次 */
        const dx = e.clientX - self.input.swipeStartX;
        if (Math.abs(dx) >= SWIPE_PX) self._switchLane(dx > 0 ? 1 : -1);
        self.input.swiping = false;
        e.preventDefault();
      };

      window.addEventListener('keydown', this._onKeyDown);
      this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
      this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
      window.addEventListener('pointerup', this._onPointerUp, { passive: false });
    }

    _unbindInput() {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('pointerup', this._onPointerUp);
      if (this.canvas) {
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
      }
    }

    /* 切道：固定时长补间，任何帧率下位移一致 */
    _switchLane(dir) {
      if (this.state !== 'playing' && this.state !== 'countdown') return;
      const next = clamp(this.lane + dir, 0, 2);
      if (next === this.lane) return;
      const from = this.player.x;
      this.lane = next;
      this.switchCount++;
      this.hintLeftMs = Math.min(this.hintLeftMs, 900);   // 玩家已会操作，提示快速淡出
      const to = this.laneCenters[next];
      this.player.sw = {
        from: from,
        to: to,
        t: 0,
        dur: RUNNER.switchMs * clamp(Math.abs(to - from) / this.laneW, 0.35, 1.6),
      };
      const A = audioApi();
      if (A && A.click) A.click();
    }

    /* 速度（含两道硬闸，帧率无关）：
     *  1) RUNNER.speedMax —— 难度渐进的速度上限；
     *  2) 反应时间下限 —— 速度不允许快到「一排从生成到抵达玩家少于 _minReachMs()」，
     *     即使画布很矮或实体顶到上限也不会失效。
     * 所有实体统一使用这个速度，自测记录的 reachMs 就是真实到达时间。 */
    _speedNow(p) {
      const s = lerp(RUNNER.speed[0], RUNNER.speed[1], p) * this.speedScale;
      let v = Math.min(s, RUNNER.speedMax * Math.max(this.speedScale, 0.5));
      v = Math.min(v, this._reachDist() / (this._minReachMs() / 1000));
      return Math.max(1, v);
    }

    _minRowGapPx() { return clamp(this.h * RUNNER.rowGapPxRatio, 120, 420); }

    /* 一排要走的距离：从出屏位置到玩家所在行 */
    _reachDist() { return Math.max(1, this.player.y); }

    /* 反应时间下限（ms）：每一排从生成到抵达玩家都必须不小于这个值。
       它同时被算进两排的时间间隔里 —— 帧率、画布尺寸、实体上限都不会让它失效。 */
    _minReachMs() {
      const refInterval = (RUNNER.rowIntervalMs[0] + RUNNER.rowIntervalMs[1]) / 2;
      return Math.max(refInterval * RUNNER.minReachRatio, RUNNER.minReachMs);
    }

    /* ---------------- 每一排的生成（可避开性的唯一入口） ----------------
     * 返回这一排的记录：{ index, at, y, blocked[], free[], safeLane, speed, reachMs }
     * 规则（硬性）：
     *  1) 最多堵 2 条道 —— 三条全堵的组合在这里不可能被生成；
     *  2) 相邻两排的「安全道」最多相差 1 条道，玩家每排最多只需切一次道；
     *  3) 记录里带上从生成到抵达玩家的时间（reachMs），必须不小于引擎给的反应时间下限。
     */
    _spawnRow(p) {
      if (p == null) p = clamp(this.elapsed / this.durationMs, 0, 1);
      const lanesAll = [0, 1, 2];
      const prevSafe = (this.lastSafeLane == null) ? 1 : this.lastSafeLane;
      const twoBlockRatio = lerp(RUNNER.twoBlockRatio[0], RUNNER.twoBlockRatio[1], p);
      let blockCount = Math.random() < twoBlockRatio ? 2 : 1;
      if (blockCount > RUNNER.lanes - 1) blockCount = RUNNER.lanes - 1;   // 二次保险：绝不满三条

      let blocked = [];
      let free = [];
      let safe = prevSafe;

      if (blockCount === 2) {
        /* 安全道只能从「与上一排安全道相邻」的空道里挑，保证最多一次切道 */
        const cands = [];
        for (let i = 0; i < lanesAll.length; i++) {
          if (Math.abs(lanesAll[i] - prevSafe) <= 1) cands.push(lanesAll[i]);
        }
        safe = cands.length ? pickOne(cands) : prevSafe;
        free = [safe];
        for (let i = 0; i < lanesAll.length; i++) { if (lanesAll[i] !== safe) blocked.push(lanesAll[i]); }
      } else {
        const b = Math.floor(Math.random() * RUNNER.lanes);
        blocked = [b];
        for (let i = 0; i < lanesAll.length; i++) { if (lanesAll[i] !== b) free.push(lanesAll[i]); }
        /* 安全道取与上一排相邻的空道（3 条道时必定存在） */
        const adj = [];
        for (let i = 0; i < free.length; i++) { if (Math.abs(free[i] - prevSafe) <= 1) adj.push(free[i]); }
        safe = adj.length ? adj[0] : free[0];
      }
      this.lastSafeLane = safe;

      /* --- 生成实体（同一排：同样的 y、同样的速度） --- */
      const speed = this._speedNow(p);           // 已内含速度上限与反应时间下限两道闸
      const rObs = this.obstacleR;
      const rCol = this.collectibleR;
      const y = -(rObs + 12);
      /* 出屏位置到玩家的距离：同一排的实体 y 相同，记录真实到达时间 */
      const dist = Math.max(1, this.player.y - y);
      const reachMs = Math.round((dist / Math.max(1, speed)) * 1000);
      /* 生成时刻按「到达时间」倒推，记录在案（供自测核对反应时间） */
      const record = {
        index: this.rowSeq++,
        at: Math.round(this.elapsed),
        y: y,
        blocked: blocked.slice(),
        free: free.slice(),
        safeLane: safe,
        speed: Math.round(speed * 100) / 100,
        reachMs: reachMs,
        entities: 0,
      };

      for (let i = 0; i < blocked.length; i++) {
        const lane = blocked[i];
        this.entities.push({
          kind: 'obstacle',
          lane: lane,
          x: this.laneCenters[lane],
          y: y,
          r: rObs,
          rot: rand(-0.4, 0.4),
          spin: rand(-1.1, 1.1),
          wobble: rand(0, Math.PI * 2),
          sprite: this.cfg.obstacle && this.cfg.obstacle.spriteId,
          hitScale: 0.78,
          born: this.elapsed,
          rowIndex: record.index,
        });
        record.entities++;
      }

      /* 奖励只出现在空道上（安全道优先），永远不会把人往障碍上引 */
      const chance = lerp(RUNNER.collectibleChance[0], RUNNER.collectibleChance[1], p);
      if (free.length && Math.random() < chance) {
        const lane = (free.indexOf(safe) !== -1) ? safe : pickOne(free);
        this.entities.push({
          kind: 'collectible',
          lane: lane,
          x: this.laneCenters[lane],
          y: y,
          r: rCol,
          rot: rand(-0.4, 0.4),
          spin: rand(-0.6, 0.6),
          wobble: rand(0, Math.PI * 2),
          sprite: this.cfg.collectible && this.cfg.collectible.spriteId,
          hitScale: 0.88,
          born: this.elapsed,
          rowIndex: record.index,
        });
        record.entities++;
      }

      this.rows.push(record);
      if (this.rows.length > RUNNER.maxRows) this.rows.shift();
      return record;
    }

    /* ---------------- 玩法更新 ---------------- */
    _updatePlay(dt, dtMs, p) {
      const self = this;
      const speed = this._speedNow(p);
      this.speedNow = speed;
      this.distance += speed * dt;

      /* 切道补间（固定时长 → 帧率无关） */
      const sw = this.player.sw;
      if (sw) {
        sw.t += dtMs;
        const k = clamp(sw.t / sw.dur, 0, 1);
        const smooth = k * k * (3 - 2 * k);
        this.player.x = lerp(sw.from, sw.to, smooth);
        if (k >= 1) { this.player.sw = null; this.player.x = sw.to; }
      }
      this.player.flash = Math.max(0, this.player.flash - dtMs);
      if (this.invincibleUntil > this.elapsed) this.player.flash = 1;
      if (this.hintLeftMs > 0) this.hintLeftMs -= dtMs;

      /* 尾迹粒子（切道时） */
      if (sw && Math.random() < RUNNER.trailParticles) {
        this._spawnParticle(this.player.x - Math.sign(sw.to - sw.from) * this.player.r * 0.7,
          this.player.y + rand(-4, 10), rand(-20, 20), rand(-30, -10), this.theme.glow, rand(1.5, 3.4), 380);
      }

      /* --- 出排节奏：三个下限取最大（都随 dt 推进，帧率无关） ---
       *  1) 难度给出的时间间隔；
       *  2) 与上一排的环境最小间距（像素换算成时间）；
       *  3) 上一排完全离开玩家所需时间 + 一次切道 + 缓冲 —— 保证玩家有时间
       *     「躲过这一排 → 再切到下一排的安全道」，中途不会蹭到刚过去的那排。 */
      this.sinceRowMs += dtMs;
      const passMs = ((this.player.r * 2 + this.obstacleR * 2) / Math.max(60, speed)) * 1000;
      const intervalMs = Math.max(
        lerp(RUNNER.rowIntervalMs[0], RUNNER.rowIntervalMs[1], p),
        (this._minRowGapPx() / Math.max(60, speed)) * 1000,
        passMs + RUNNER.switchMs + RUNNER.comfortMs
      );
      if (this.sinceRowMs >= intervalMs) {
        if (this.entities.length < RUNNER.maxEntities) {
          this.sinceRowMs -= intervalMs;
          if (this.sinceRowMs > intervalMs) this.sinceRowMs = intervalMs;
          this._spawnRow(p);
        } else {
          this.sinceRowMs = intervalMs;   // 顶到实体上限时不再累积欠账
        }
      }
      /* --- 实体前进（分步避免高速穿模；速度取引擎当前值 → 与帧率无关） --- */
      const maxStep = 8;
      const steps = clamp(Math.ceil((speed * dt) / maxStep), 1, 64);
      const subDt = dt / steps;
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        let dead = false;
        for (let s = 0; s < steps && !dead; s++) {
          e.y += speed * subDt;
          e.rot += e.spin * subDt;
          e.wobble += subDt * 4;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const rr = e.r * e.hitScale + this.player.r * 0.86;
          if (dx * dx + dy * dy <= rr * rr) {
            if (e.kind === 'collectible') { self._onCollect(e); dead = true; }
            else { self._onHit(e); dead = true; }
          }
        }
        if (!dead && e.y - e.r > this.h + 30) {
          dead = true;
          if (e.kind === 'collectible') this._breakCombo();
        }
        if (dead) this.entities.splice(i, 1);
      }
    }

    _onCollect(e) {
      this.collectCount++;
      const withinCombo = (this.elapsed - this.lastCollectAt) <= COMBO_WINDOW_MS;
      this.combo = withinCombo ? this.combo + 1 : 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastCollectAt = this.elapsed;

      const gain = this._gainForCombo();
      this.score += gain;
      this._emit('score', this.score);

      this._burst(e.x, e.y, this.theme.particle, 10, 120);
      this.floaters.push({ x: e.x, y: e.y - e.r, text: '+' + gain, life: 780, max: 780, color: this.theme.accent });
      if (this.combo >= 3) {
        this.floaters.push({ x: e.x, y: e.y - e.r - 20, text: this.combo + ' 连击!', life: 900, max: 900, color: this.theme.accent2, big: true });
      }
      const A = audioApi();
      if (A) A.collect(this.combo);
      this._emit('combo', this.combo);
    }

    _onHit(e) {
      this.obstacleCount++;
      if (this.elapsed < this.invincibleUntil) return;   // 无敌期内不重复扣血（实体同样被吃掉）
      this.lives--;
      this.invincibleUntil = this.elapsed + RUNNER_INVINCIBLE_MS;
      this.combo = 0;
      this.hitFlash = 260;
      this.shake = 1;
      this._burst(e.x, e.y, [this.theme.danger, '#ffffff'], 16, 170);
      this._breakCombo();
      this._emit('lives', this.lives);
      const A = audioApi();
      if (A) A.hit();
      if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(60); } catch (err) {} }
    }

    _buildResult(reason, secondsSurvived) {
      return {
        score: this.score,
        reason: reason,
        survivedSec: Math.min(Math.round(RUNNER_DURATION_MS / 1000), secondsSurvived),
        lives: this.lives,
        collects: this.collectCount,
        obstacles: this.obstacleCount,
        bestCombo: this.bestCombo,
        rows: this.rows.length,
        switches: this.switchCount,
      };
    }

    estimateMaxScore() { return RUNNER_MAX_SCORE; }

    /* ---------------- 渲染 ---------------- */
    _render() {
      const ctx = this.ctx;
      const th = this.theme;
      const w = this.w, h = this.h;

      ctx.save();
      const mk = this._shakeOffsetX(), my = this._shakeOffsetY();
      if (mk || my) ctx.translate(mk, my);

      this._renderBackdrop(ctx);
      this._renderGrid(ctx, Math.max(34, w / 9));

      /* 跑道分隔线 + 向下滚动的虚线（速度感） */
      const dashGap = 46;
      const phase = this.distance % dashGap;
      ctx.strokeStyle = th.floor;
      ctx.lineWidth = 2;
      for (let l = 1; l < RUNNER.lanes; l++) {
        ctx.beginPath();
        ctx.moveTo(this.laneW * l, 0);
        ctx.lineTo(this.laneW * l, h);
        ctx.stroke();
      }
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 2;
      for (let l = 0; l < RUNNER.lanes; l++) {
        const cx = this.laneCenters[l];
        ctx.beginPath();
        for (let y = -dashGap + phase; y < h + dashGap; y += dashGap) {
          ctx.moveTo(cx - this.laneW * 0.14, y);
          ctx.lineTo(cx + this.laneW * 0.14, y);
        }
        ctx.stroke();
      }
      /* 安全道提示：极淡的底色，暗示「这里能过」 */
      if (this.state === 'playing' || this.state === 'countdown') {
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = th.accent;
        ctx.fillRect(this.laneCenters[this.lane] - this.laneW * 0.5, 0, this.laneW, h);
        ctx.globalAlpha = 1;
      }

      /* 实体 */
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        ctx.save();
        ctx.translate(e.x, e.y);
        const wob = 1 + Math.sin(e.wobble) * 0.06;
        ctx.rotate(e.rot * 0.25);
        ctx.scale(wob, wob);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, e.r * 0.9, e.r * 0.8, e.r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (e.kind === 'obstacle') {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.35)';
          ctx.shadowBlur = e.r * 0.9;
          ctx.shadowOffsetY = e.r * 0.25;
          drawSprite('obstacle', ctx, e.sprite, e.r * 0.95, th);
          ctx.restore();
        } else {
          ctx.save();
          ctx.shadowColor = th.collectibleGlow;
          ctx.shadowBlur = e.r * 1.6;
          drawSprite('collectible', ctx, e.sprite, e.r * 0.95, th);
          ctx.restore();
        }
        ctx.restore();
      }

      this._renderParticles(ctx);

      /* 玩家 */
      const invincible = this.elapsed < this.invincibleUntil;
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      if (invincible && Math.floor(this.elapsed / 90) % 2 === 0) ctx.globalAlpha = 0.42;
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = th.playerRing;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.player.r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, this.player.r * 0.95, this.player.r * 0.9, this.player.r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawSprite('player', ctx, this.cfg.player && this.cfg.player.avatarId, this.player.r * 0.78, th);
      ctx.restore();

      this._renderFloaters(ctx);

      /* 初次操作提示（玩家第一次切道后自动淡出） */
      if (this.hintLeftMs > 0 && (this.state === 'playing' || this.state === 'countdown')) {
        const a = clamp(Math.min(this.hintLeftMs, 500) / 500, 0, 1);
        this._renderBanner(ctx, '← → 或左右滑动：切换跑道', w / 2, h * 0.70, { alpha: a * 0.95, scale: 0.038 });
        this._renderBanner(ctx, '躲开 ' + ((this.cfg.obstacle && this.cfg.obstacle.name) || '障碍') +
          '，接住 ' + ((this.cfg.collectible && this.cfg.collectible.name) || '奖励'), w / 2, h * 0.70 + Math.min(46, h * 0.07), { alpha: a * 0.85, scale: 0.034, color: th.textDim });
      }

      this._renderHitFlash(ctx);
      this._renderSpeech(ctx);
      this._renderCountdown(ctx);

      ctx.restore();
    }
  }

  /* ======================================================================
   * 玩法 B：限时点击 ClickGame
   *  - 屏幕上出现目标（obstacle 图案）与干扰项（collectible 图案）；
   *  - 点中目标得分并连击，点到干扰项扣 1 点生命（受击无敌 1200ms）；
   *  - 目标超时消失算未命中：不扣血，只断连击；
   *  - 目标生成有两条硬保证：完整在场地内 + 与其它活动目标保持最小间距；
   *  - 鼠标与触摸都走 pointerdown，同一套输入。
   * ==================================================================== */
  class ClickGame extends BaseGame {
    constructor(canvas, cfg, hooks) {
      super(canvas, cfg, hooks);
      this.durationMs = CLICK_DURATION_MS;
      this.startLives = START_LIVES;
      this.reset();
      this.resize();
      this._bind();
    }

    reset() {
      super.reset();
      this.targets = [];
      this.targetR = CLICK.minR;
      this.field = { x: 0, y: 0, w: 0, h: 0 };
      this.hitCount = 0;
      this.missCount = 0;
      this.wrongCount = 0;
      this.emptyTaps = 0;
      this.hintLeftMs = CLICK.hintMs;
      this.spawnTimer = 700;
      this.lastHitAt = -99999;
    }

    _resetInput() { this.input = { pointerActive: false }; }
    _clearInput() { this.input.pointerActive = false; }

    _layout() {
      this.targetR = clamp(this.minDim * CLICK.rRatio, CLICK.minR, CLICK.maxR);
      const padX = Math.max(10, this.w * CLICK.padX);
      /* 顶部留白至少能放下规则图例条（保证图例永远有位置且不压目标） */
      const minTop = this.targetR * 2.1 + 8;
      const topY = Math.max(this.h * CLICK.padTop, minTop, this.targetR + 6);
      const botY = Math.max(this.h * CLICK.padBottom, this.targetR + 6);
      this.field = {
        x: padX,
        y: topY,
        w: Math.max(0, this.w - padX * 2),
        h: Math.max(0, this.h - topY - botY),
      };
      /* 尺寸变化后，放不下的目标直接移除（宁可少一个，也不越界/重叠） */
      if (this.targets && this.targets.length) {
        const self = this;
        this.targets = this.targets.filter(function (t) {
          t.r = self.targetR;
          return self._insideField(t.x, t.y, t.r);
        });
      }
    }

    _insideField(x, y, r) {
      const f = this.field;
      return x - r >= f.x - 0.001 && x + r <= f.x + f.w + 0.001 &&
        y - r >= f.y - 0.001 && y + r <= f.y + f.h + 0.001;
    }

    /* 目标之间的最小间距检查（保证不重叠遮挡） */
    _fitsAt(x, y, r) {
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        const dx = x - t.x, dy = y - t.y;
        const rr = r + t.r + CLICK.minGapPx;
        if (dx * dx + dy * dy < rr * rr) return false;
      }
      return true;
    }

    /* 随机采样失败后的网格兜底：把整个场地扫一遍，收集所有合法位置随机取一个 */
    _gridFind(r) {
      const f = this.field;
      const xMin = f.x + r, xMax = f.x + f.w - r;
      const yMin = f.y + r, yMax = f.y + f.h - r;
      if (xMax < xMin || yMax < yMin) return null;
      const cols = 16, rows = 24;
      const okList = [];
      for (let ix = 0; ix < cols; ix++) {
        for (let iy = 0; iy < rows; iy++) {
          const x = xMin + (xMax - xMin) * (cols === 1 ? 0.5 : ix / (cols - 1));
          const y = yMin + (yMax - yMin) * (rows === 1 ? 0.5 : iy / (rows - 1));
          if (this._fitsAt(x, y, r)) okList.push({ x: x, y: y });
        }
      }
      if (!okList.length) return null;
      return pickOne(okList);
    }

    /* 生成一个目标（可指定种类与坐标，便于自测与调试）
     * kind: 'target'（要点的目标）| 'decoy'（干扰项）| null → 按难度随机
     * 返回目标对象；场地放不下时返回 null（宁可不生成，也不越界或重叠）。 */
    _spawnTarget(kind, forcedX, forcedY, p) {
      if (this.targets.length >= CLICK.maxTargets) return null;
      if (p == null) p = clamp(this.elapsed / this.durationMs, 0, 1);
      const r = this.targetR;
      const f = this.field;
      const xMin = f.x + r, xMax = f.x + f.w - r;
      const yMin = f.y + r, yMax = f.y + f.h - r;
      if (xMax < xMin || yMax < yMin) return null;

      if (kind == null) {
        const decoyRatio = Math.min(lerp(CLICK.decoyRatio[0], CLICK.decoyRatio[1], p), CLICK.maxDecoyRatio);
        kind = Math.random() < decoyRatio ? 'decoy' : 'target';
      }

      let x = 0, y = 0, placed = false;
      if (typeof forcedX === 'number' && typeof forcedY === 'number') {
        const fx = clamp(forcedX, xMin, xMax), fy = clamp(forcedY, yMin, yMax);
        if (this._fitsAt(fx, fy, r)) { x = fx; y = fy; placed = true; }
      }
      if (!placed) {
        for (let i = 0; i < CLICK.spawnTries; i++) {
          const cx = rand(xMin, xMax), cy = rand(yMin, yMax);
          if (this._fitsAt(cx, cy, r)) { x = cx; y = cy; placed = true; break; }
        }
      }
      if (!placed) {
        const found = this._gridFind(r);
        if (found) { x = found.x; y = found.y; placed = true; }
      }
      if (!placed) return null;

      const lifeMs = Math.max(CLICK.minLifetimeMs, lerp(CLICK.lifetimeMs[0], CLICK.lifetimeMs[1], p) * rand(0.92, 1.08));
      const t = {
        kind: kind,
        x: x,
        y: y,
        r: r,
        born: this.elapsed,
        lifeMs: lifeMs,
        maxLife: lifeMs,
        rot: rand(-0.3, 0.3),
        spin: rand(-0.5, 0.5),
        wobble: rand(0, Math.PI * 2),
        sprite: kind === 'decoy'
          ? (this.cfg.collectible && this.cfg.collectible.spriteId)
          : (this.cfg.obstacle && this.cfg.obstacle.spriteId),
      };
      this.targets.push(t);
      return t;
    }

    /* ---------------- 输入：鼠标 / 触摸统一走 pointerdown ---------------- */
    _bindInput() {
      const self = this;
      this._onPointerDown = function (e) {
        if (self.state !== 'playing') { e.preventDefault(); return; }
        const rect = self.canvas.getBoundingClientRect();
        self._tap(e.clientX - rect.left, e.clientY - rect.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    }

    _unbindInput() {
      if (this.canvas) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    }

    /* ---------------- 规则图例的摆放 ----------------
     * 图例条本身会盖住一小片区域，所以先挑一条不压住任何活动目标的横带，
     * 让「不遮挡目标」这条规则在图例上也成立。*/
    _bannerBand(maxBandH) {
      const f = this.field;
      const bandH = Math.min(maxBandH, Math.max(24, f.h / 5));
      const half = bandH / 2 + 6;
      const cands = [];
      const above = f.y * 0.5 + 4;                 // 场地之上（HUD 区）
      if (above - half >= 2) cands.push(above);
      cands.push(f.y + half);                      // 场地顶部横带
      for (let i = 0; i < cands.length; i++) {
        if (this._bandClear(cands[i], half)) return cands[i];
      }
      return null;   // 两条候选都被占：宁可不画，也不遮挡目标
    }

    _bandClear(cy, half) {
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (Math.abs(t.y - cy) < half + t.r) return false;
      }
      return true;
    }

    /* 一次点击：命中判定用与绘制一致的坐标与半径（判定半径略大更宽容） */
    _tap(x, y) {
      if (this.state !== 'playing') return null;
      let hit = null, bestD = Infinity;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        const dx = x - t.x, dy = y - t.y;
        const d2 = dx * dx + dy * dy;
        const rr = t.r * CLICK.hitScale;
        if (d2 <= rr * rr && d2 < bestD) { bestD = d2; hit = t; }
      }
      if (!hit) { this.emptyTaps++; return null; }

      if (hit.kind === 'decoy') { this._onWrongTap(hit); return hit; }
      this._onTargetTap(hit);
      return hit;
    }

    _removeTarget(t) {
      const i = this.targets.indexOf(t);
      if (i !== -1) this.targets.splice(i, 1);
    }

    _onTargetTap(t) {
      this._removeTarget(t);
      this.hitCount++;
      const withinCombo = (this.elapsed - this.lastCollectAt) <= COMBO_WINDOW_MS;
      this.combo = withinCombo ? this.combo + 1 : 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastCollectAt = this.elapsed;

      const gain = this._gainForCombo();
      this.score += gain;
      this._emit('score', this.score);

      this._burst(t.x, t.y, this.theme.particle, 10, 120);
      this.floaters.push({ x: t.x, y: t.y - t.r * 0.6, text: '+' + gain, life: 780, max: 780, color: this.theme.accent });
      if (this.combo >= 3) {
        this.floaters.push({ x: t.x, y: t.y - t.r * 0.6 - 20, text: this.combo + ' 连击!', life: 900, max: 900, color: this.theme.accent2, big: true });
      }
      const A = audioApi();
      if (A) A.collect(this.combo);
      this._emit('combo', this.combo);
      this.hintLeftMs = Math.min(this.hintLeftMs, 1200);   // 已经会玩了，图例淡出
    }

    _onWrongTap(t) {
      this._removeTarget(t);
      this.wrongCount++;
      this._burst(t.x, t.y, [this.theme.danger, '#ffffff'], 14, 150);
      if (this.elapsed < this.invincibleUntil) return;   // 无敌期内不重复扣血
      this.lives--;
      this.invincibleUntil = this.elapsed + CLICK_INVINCIBLE_MS;
      this.combo = 0;
      this.hitFlash = 260;
      this.shake = 1;
      this._breakCombo();
      this._emit('lives', this.lives);
      const A = audioApi();
      if (A) A.hit();
      if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(60); } catch (err) {} }
    }

    /* 超时消失：算未命中（不扣血，只断连击） */
    _expireTargets(dtMs) {
      for (let i = this.targets.length - 1; i >= 0; i--) {
        const t = this.targets[i];
        t.lifeMs -= dtMs;
        t.wobble += dtMs * 0.004;
        t.rot += t.spin * (dtMs / 1000);
        if (t.lifeMs <= 0) {
          this.targets.splice(i, 1);
          if (t.kind === 'target') { this.missCount++; this._breakCombo(); }
        }
      }
    }
    _updatePlay(dt, dtMs, p) {
      /* 图例只在正式开打之后开始倒计时：不会在 countdown 里自己溜走 */
      if (this.state === 'playing' && this.hintLeftMs > 0) this.hintLeftMs -= dtMs;
      this._expireTargets(dtMs);

      /* 生成节奏：补账式累减，低帧率下密度不变 */
      this.spawnTimer -= dtMs;
      const interval = lerp(CLICK.spawnIntervalMs[0], CLICK.spawnIntervalMs[1], p);
      let burst = 0;
      while (this.spawnTimer <= 0 && burst < 2) {
        this.spawnTimer += interval * rand(0.85, 1.15);
        if (this.targets.length < CLICK.maxTargets) this._spawnTarget(null, null, null, p);
        burst++;
      }
      if (this.spawnTimer <= 0) this.spawnTimer = interval * rand(0.85, 1.15);
    }

    _buildResult(reason, secondsSurvived) {
      const taps = this.hitCount + this.wrongCount;
      return {
        score: this.score,
        reason: reason,
        survivedSec: Math.min(Math.round(CLICK_DURATION_MS / 1000), secondsSurvived),
        lives: this.lives,
        collects: this.hitCount,          // 与躲避收集的统计字段对齐
        obstacles: this.wrongCount,
        hits: this.hitCount,
        misses: this.missCount,
        wrongClicks: this.wrongCount,
        emptyTaps: this.emptyTaps,
        accuracy: taps > 0 ? Math.round((this.hitCount / taps) * 100) : 100,
        bestCombo: this.bestCombo,
      };
    }

    estimateMaxScore() { return CLICK_MAX_SCORE; }

    /* ---------------- 渲染 ---------------- */
    _render() {
      const ctx = this.ctx;
      const th = this.theme;
      const w = this.w, h = this.h;

      ctx.save();
      const mk = this._shakeOffsetX(), my = this._shakeOffsetY();
      if (mk || my) ctx.translate(mk, my);

      this._renderBackdrop(ctx);
      this._renderGrid(ctx, Math.max(34, w / 9));

      /* 场地边框：让玩家一眼看出目标只会出现在这块区域内 */
      const f = this.field;
      if (f.w > 0 && f.h > 0) {
        ctx.save();
        ctx.strokeStyle = th.grid;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 9]);
        const G = themeApi();
        if (G && G.roundRect) { G.roundRect(ctx, f.x, f.y, f.w, f.h, 14); ctx.stroke(); }
        else { ctx.strokeRect(f.x, f.y, f.w, f.h); }
        ctx.setLineDash([]);
        ctx.restore();
      }

      /* 目标与干扰项 */
      const invincible = this.elapsed < this.invincibleUntil;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        const isDecoy = t.kind === 'decoy';
        const lifeK = clamp(t.lifeMs / Math.max(1, t.maxLife), 0, 1);
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, t.r * 0.9, t.r * 0.8, t.r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* 光圈：目标 = 强调色（可以点）；干扰项 = 危险色（别点） */
        ctx.save();
        ctx.globalAlpha = isDecoy ? 0.75 : 0.9;
        ctx.strokeStyle = isDecoy ? th.danger : th.accent;
        ctx.lineWidth = Math.max(2, t.r * 0.09);
        ctx.beginPath();
        ctx.arc(0, 0, t.r * 1.12 + Math.sin(t.wobble) * (t.r * 0.04), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        /* 存活时间环：从满到空的倒计时，玩家能看到还剩多久 */
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = isDecoy ? th.danger : th.accent2;
        ctx.lineWidth = Math.max(2, t.r * 0.10);
        ctx.beginPath();
        ctx.arc(0, 0, t.r * 1.26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeK);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        const wob = 1 + Math.sin(t.wobble) * 0.05;
        ctx.rotate(t.rot * 0.2);
        ctx.scale(wob, wob);
        ctx.save();
        ctx.shadowColor = isDecoy ? th.obstacleTint : th.collectibleGlow;
        ctx.shadowBlur = t.r * (isDecoy ? 0.8 : 1.5);
        drawSprite(isDecoy ? 'collectible' : 'obstacle', ctx, t.sprite, t.r * 0.95, th);
        ctx.restore();
        ctx.restore();

        /* 干扰项的红色斜杠：一眼看出不能点 */
        if (isDecoy) {
          ctx.save();
          ctx.strokeStyle = th.danger;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = Math.max(2.5, t.r * 0.11);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-t.r * 0.82, t.r * 0.82);
          ctx.lineTo(t.r * 0.82, -t.r * 0.82);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }

      this._renderParticles(ctx);
      this._renderFloaters(ctx);

      /* 规则图例：开局前几秒把「点什么、别点什么」摆在明面上，玩家不用猜。
         位置挑一条不压住任何目标的横带；两条候选都被占时这一帧就不画。 */
      if (this.hintLeftMs > 0 && (this.state === 'playing' || this.state === 'countdown')) {
        const a = clamp(Math.min(this.hintLeftMs, 600) / 600, 0, 1);
        const boxH = this.targetR * 1.5;
        const cy = this._bannerBand(boxH);
        if (cy != null) {
          ctx.globalAlpha = a * 0.96;
          ctx.fillStyle = th.hud;
          const G = themeApi();
          const boxW = Math.min(w - 20, this.targetR * 9.4);
          if (G && G.roundRect) { G.roundRect(ctx, (w - boxW) / 2, cy - boxH / 2, boxW, boxH, boxH / 2); ctx.fill(); }
          else { ctx.fillRect((w - boxW) / 2, cy - boxH / 2, boxW, boxH); }
          ctx.globalAlpha = a * 0.96;

          const iconR = this.targetR * 0.5;
          const leftX = w / 2 - boxW * 0.30;
          const rightX = w / 2 + boxW * 0.30;
          ctx.save();
          ctx.translate(leftX, cy);
          ctx.shadowColor = th.collectibleGlow;
          ctx.shadowBlur = iconR;
          drawSprite('obstacle', ctx, this.cfg.obstacle && this.cfg.obstacle.spriteId, iconR * 0.95, th);
          ctx.restore();
          ctx.fillStyle = th.text;
          ctx.font = '600 ' + Math.round(clamp(w * 0.032, 12, 16)) + 'px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('点掉得分', leftX + iconR * 1.3, cy);

          ctx.save();
          ctx.translate(rightX, cy);
          drawSprite('collectible', ctx, this.cfg.collectible && this.cfg.collectible.spriteId, iconR * 0.95, th);
          ctx.restore();
          ctx.fillStyle = th.danger;
          ctx.textAlign = 'left';
          ctx.fillText('别点扣血', rightX + iconR * 1.3, cy);
          ctx.globalAlpha = 1;
        }
      }

      this._renderHitFlash(ctx);
      this._renderSpeech(ctx);
      this._renderCountdown(ctx);

      /* 受击无敌剩余时间（很淡的一圈提示） */
      if (invincible && this.state === 'playing') {
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = th.danger;
        ctx.fillRect(-20, -20, w + 40, h + 40);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  }

  return {
    BaseGame: BaseGame,
    RunnerGame: RunnerGame,
    ClickGame: ClickGame,
    /* 便捷工厂：dodge 仍由第一轮 engine.js 提供，这里只是顺手转发 */
    create: function (mode, canvas, cfg, hooks) {
      if (mode === 'runner') return new RunnerGame(canvas, cfg, hooks);
      if (mode === 'click') return new ClickGame(canvas, cfg, hooks);
      if (mode === 'dodge' && typeof window !== 'undefined' && window.GengGame && window.GengGame.Game) {
        return new window.GengGame.Game(canvas, cfg, hooks);
      }
      return null;
    },
    START_LIVES: START_LIVES,
    COUNTDOWN_MS: COUNTDOWN_MS,
    COMBO_WINDOW_MS: COMBO_WINDOW_MS,
    RUNNER_DURATION_MS: RUNNER_DURATION_MS,
    RUNNER_INVINCIBLE_MS: RUNNER_INVINCIBLE_MS,
    CLICK_DURATION_MS: CLICK_DURATION_MS,
    CLICK_INVINCIBLE_MS: CLICK_INVINCIBLE_MS,
    DURATION_MS: { runner: RUNNER_DURATION_MS, click: CLICK_DURATION_MS },
    RUNNER: RUNNER,
    CLICK: CLICK,
  };
})();

if (typeof window !== 'undefined') window.GengModes = GengModes;
if (typeof module !== 'undefined' && module.exports) module.exports = GengModes;
