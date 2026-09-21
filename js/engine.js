/* 固定游戏引擎：竖屏躲避收集。
 *
 * 架构约定（与任务书第 5 节一致）：
 *  - 玩法规则、速度、密度、物体大小全部由本引擎决定，模型只能提供文案与素材 ID；
 *  - 配置只影响：标题、称呼、敌人/奖励名称、主题配色、图案、台词、结算文案。
 *
 * 技术要点：
 *  - 时间增量更新（dt），速度不随帧率变化；低帧率时自动分步（substep）保证碰撞不漏判；
 *  - 碰撞检测使用与绘制完全一致的坐标与半径；
 *  - 失焦/切后台自动暂停，返回后需用户点击继续，暂停期间计时与实体全部冻结；
 *  - 重开时完整重置：计时、生命、实体、输入、连击、音效状态、结算标记。
 */
'use strict';

const GengGame = (function () {

  const DURATION_MS = 45000;          // 一局 45 秒
  const START_LIVES = 3;
  const INVINCIBLE_MS = 1500;         // 受击后无敌
  const COMBO_WINDOW_MS = 2500;       // 连击窗口
  const COUNTDOWN_MS = 1800;          // 开局 3-2-1
  const MAX_ENTITIES = 44;            // 实体上限（引擎硬限制）
  const BOTTOM_MARGIN_RATIO = 0.105;  // 玩家离底部距离占场高比例

  /* 难度曲线：全部由引擎给定并在上下限内收敛，模型无法干预 */
  const DIFF = {
    spawnInterval: [0.86, 0.33],      // 秒：出怪间隔 由松到密
    fallSpeed: [118, 305],            // px/s（基于 640 参考高度，其他尺寸按比例缩放）
    obstacleRatio: [0.40, 0.58],      // 障碍占比
    obstacleR: [19, 25],
    collectibleR: [15, 13.5],
    refHeight: 640,
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  class Game {
    constructor(canvas, cfg, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cfg = cfg;
      this.hooks = hooks || {};
      /* v2：主题换成「场景」。优先用 getScenePalette(sceneId)，缺失时回退到
       * v1 的 getTheme(themeId)，保证旧分享链接的配色不变。 */
      this.theme = (function (cfg) {
        const G = (typeof window !== 'undefined' && window.GengTheme) ? window.GengTheme : null;
        if (!G) return {};
        const id = cfg.sceneId || cfg.themeId;
        if (cfg.sceneId && typeof G.getScenePalette === 'function') {
          try { const p = G.getScenePalette(cfg.sceneId); if (p) return p; } catch (e) {}
        }
        return typeof G.getTheme === 'function' ? G.getTheme(id) : {};
      })(cfg);

      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.w = 0; this.h = 0;

      this.raf = 0;
      this.lastTs = 0;
      this.running = false;      // 主循环是否在跑
      this.state = 'idle';       // idle | countdown | playing | paused | ended
      this.pauseReason = '';
      this.ended = false;        // 保证一局只结算一次
      this.result = null;

      this.reset();
      this.resize();
      this._bind();
    }

    /* ---------------- 状态重置（完全重开） ---------------- */
    reset() {
      this.elapsed = 0;
      this.lives = START_LIVES;
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.lastCollectAt = -99999;
      this.collectCount = 0;
      this.obstacleCount = 0;
      this.invincibleUntil = 0;
      this.hitFlash = 0;
      this.shake = 0;
      this.timeLeftMs = DURATION_MS;
      this.countdownLeftMs = COUNTDOWN_MS;
      this.entities = [];
      this.particles = [];
      this.floaters = [];
      this.lineIndex = 0;
      this.lineTimer = 2600;
      this.speech = null;
      this.spawnTimer = 350;
      this.input = { left: false, right: false, pointerActive: false, pointerX: 0, keyboardVx: 0 };
      this.ended = false;
      this.result = null;
      this.audioDone = { lastBeep: -1, started: false };
      if (this.player) { this.player.x = this.w / 2; this.player.vx = 0; this.player.flash = 0; }
    }

    /* ---------------- 尺寸 ---------------- */
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(240, Math.round(rect.width));
      const h = Math.max(320, Math.round(rect.height));
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const minDim = Math.min(w, h);
      this.player = this.player || { x: w / 2, y: 0, r: 18, vx: 0, flash: 0 };
      this.player.r = clamp(minDim * 0.048, 15, 27);
      this.player.y = h - Math.max(h * BOTTOM_MARGIN_RATIO, this.player.r + 16);
      this.player.x = clamp(this.player.x, this.player.r, w - this.player.r);
      this.speedScale = h / DIFF.refHeight;
      this.sidePad = Math.max(14, w * 0.06);
    }

    /* ---------------- 输入 ---------------- */
    _bind() {
      const self = this;

      this._onKeyDown = function (e) {
        if (self.state === 'ended') return;
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { self.input.left = true; e.preventDefault(); }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { self.input.right = true; e.preventDefault(); }
        if (k === ' ' || k === 'Escape') { if (self.state === 'paused') { /* 由外部按钮恢复 */ } }
      };
      this._onKeyUp = function (e) {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') self.input.left = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') self.input.right = false;
      };

      /* 指针拖动：手机与鼠标通用；touch-action:none 已由容器样式保证不滚动页面 */
      const toFieldX = function (clientX) {
        const rect = self.canvas.getBoundingClientRect();
        return clamp(clientX - rect.left, 0, self.w);
      };
      this._onPointerDown = function (e) {
        self.input.pointerActive = true;
        self.input.pointerX = toFieldX(e.clientX);
        if (self.canvas.setPointerCapture) { try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {} }
        e.preventDefault();
      };
      this._onPointerMove = function (e) {
        if (!self.input.pointerActive) return;
        self.input.pointerX = toFieldX(e.clientX);
        e.preventDefault();
      };
      this._onPointerUp = function (e) {
        self.input.pointerActive = false;
        e.preventDefault();
      };

      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
      this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
      window.addEventListener('pointerup', this._onPointerUp, { passive: false });
      this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      this._onResize = function () { self.resize(); };
      window.addEventListener('resize', this._onResize);

      /* 失焦 / 切后台 → 自动暂停 */
      this._onVisibility = function () {
        if (document.hidden) self.pause('hidden');
      };
      this._onBlur = function () { self.pause('blur'); };
      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('blur', this._onBlur);
    }

    destroy() {
      this.stop();
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('pointerup', this._onPointerUp);
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      window.removeEventListener('blur', this._onBlur);
      if (this.canvas) {
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
      }
    }

    /* ---------------- 生命周期 ---------------- */
    start() {
      this.reset();
      this.resize();
      /* 若在页面不可见/失焦时开始，直接进入暂停态：rAF 不会运行，
         不能让用户看到一个"已经开始但不走"的假游戏。 */
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
      this.input.left = false; this.input.right = false; this.input.pointerActive = false;
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
      /* 低帧率必须保持真实时间速度（验收：速度不随帧率变化）。
       * 帧内步进（见实体更新的 substeps）已经防止高速穿模，所以这里不需要
       * 用小的 dt 上限来"保护碰撞"，只需要防住极端停顿（如系统休眠、进程挂起）
       * 造成的超大跳变。上限取 1 秒：低到 1fps 仍按真实时间推进。 */
      if (dtMs > 1000) dtMs = 1000;
      if (dtMs < 0) dtMs = 0;

      if (this.state !== 'paused') this._update(dtMs);
      this._render();
    }

    _update(dtMs) {
      const dt = dtMs / 1000;
      const self = this;

      if (this.state === 'countdown') {
        this.countdownLeftMs -= dtMs;
        const secLeft = Math.ceil(this.countdownLeftMs / 600);
        if (this.audioDone.lastBeep !== secLeft) {
          this.audioDone.lastBeep = secLeft;
          if (secLeft >= 1 && secLeft <= 3 && window.GengAudio) window.GengAudio.countdownBeep(secLeft === 1);
        }
        if (this.countdownLeftMs <= 0) {
          this.state = 'playing';
          this._emit('state', 'playing');
          if (window.GengAudio && !this.audioDone.started) { this.audioDone.started = true; window.GengAudio.start(); }
        }
        return;
      }
      if (this.state !== 'playing') return;

      this.elapsed += dtMs;
      this.timeLeftMs = Math.max(0, DURATION_MS - this.elapsed);
      const p = clamp(this.elapsed / DURATION_MS, 0, 1);

      /* 倒计时提示音 */
      const secLeft = Math.ceil(this.timeLeftMs / 1000);
      if (secLeft <= 3 && secLeft >= 1 && this.audioDone.lastBeep !== secLeft + 100) {
        this.audioDone.lastBeep = secLeft + 100;
        if (window.GengAudio) window.GengAudio.countdownBeep(secLeft === 1);
      }

      /* --- 玩家横向移动 --- */
      const spd = clamp(this.w * 0.95, 300, 620);   // px/s
      if (this.input.left && !this.input.right) {
        this.player.x -= spd * dt; this.player.vx = -spd; this.input.pointerActive = false;
      } else if (this.input.right && !this.input.left) {
        this.player.x += spd * dt; this.player.vx = spd; this.input.pointerActive = false;
      } else {
        this.player.vx *= Math.pow(0.001, dt);
      }
      if (this.input.pointerActive) {
        /* 指针跟随：指数平滑，随帧率无关 */
        const k = 1 - Math.pow(0.0009, dt);
        const target = clamp(this.input.pointerX, this.player.r, this.w - this.player.r);
        const prev = this.player.x;
        this.player.x += (target - this.player.x) * k;
        this.player.vx = (this.player.x - prev) / Math.max(0.0001, dt);
      }
      this.player.x = clamp(this.player.x, this.player.r, this.w - this.player.r);
      this.player.flash = Math.max(0, this.player.flash - dtMs);
      if (this.invincibleUntil > this.elapsed) this.player.flash = 1;

      /* 尾迹粒子（移动时） */
      if (Math.abs(this.player.vx) > 60 && Math.random() < 0.5) {
        this._spawnParticle(this.player.x - Math.sign(this.player.vx) * this.player.r * 0.7,
          this.player.y + rand(-4, 10), rand(-20, 20), rand(-30, -10), this.theme.glow, rand(1.5, 3.4), 380);
      }

      /* --- 生成 ---
       * 用"补账"循环而不是单次触发：低帧率下（一帧 > 一个生成间隔）也能补上应生成的实体，
       * 否则物体会随帧率变稀疏。每帧最多补 3 个，防止极端停顿后瞬间刷屏。 */
      this.spawnTimer -= dtMs;
      const interval = lerp(DIFF.spawnInterval[0], DIFF.spawnInterval[1], p) * 1000;
      let spawnBurst = 0;
      while (this.spawnTimer <= 0 && this.entities.length < MAX_ENTITIES && spawnBurst < 3) {
        this.spawnTimer += interval * rand(0.82, 1.22);
        this._spawn(p);
        spawnBurst++;
      }
      if (this.spawnTimer <= 0) this.spawnTimer = interval;   // 达到上限时归位，避免持续欠账
      void spawnBurst;

      /* --- 实体更新（分步避免高速漏判） --- */
      const maxStep = 6;   // px
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        const steps = Math.max(1, Math.ceil((Math.abs(e.vy) * dt) / maxStep));
        const subDt = dt / steps;
        let dead = false;
        for (let s = 0; s < steps && !dead; s++) {
          e.y += e.vy * subDt;
          e.rot += e.spin * subDt;
          e.wobble += subDt * 4;
          /* 与玩家碰撞（半径与绘制一致，含轻微宽容） */
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const rr = (e.r * e.hitScale) + this.player.r * 0.86;
          if (dx * dx + dy * dy <= rr * rr) {
            if (e.kind === 'collectible') { this._onCollect(e); dead = true; }
            else { this._onHit(e); dead = true; }
          }
        }
        if (!dead && e.y - e.r > this.h + 30) {
          dead = true;
          if (e.kind === 'collectible') this._breakCombo();
        }
        if (dead) this.entities.splice(i, 1);
      }

      /* --- 粒子与浮字 --- */
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dtMs;
        if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.vy += pt.grav * dt;
        pt.vx *= Math.pow(0.35, dt);
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life -= dtMs;
        if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
        f.y -= 42 * dt;
      }

      /* --- 连击窗口 --- */
      if (this.combo > 0 && this.elapsed - this.lastCollectAt > COMBO_WINDOW_MS) this.combo = 0;

      /* --- 台词 --- */
      this.lineTimer -= dtMs;
      if (this.lineTimer <= 0 && this.cfg.lines && this.cfg.lines.length) {
        this.speech = { text: this.cfg.lines[this.lineIndex % this.cfg.lines.length], life: 2600 };
        this.lineIndex++;
        this.lineTimer = rand(6200, 9200);
      }
      if (this.speech) { this.speech.life -= dtMs; if (this.speech.life <= 0) this.speech = null; }

      this.hitFlash = Math.max(0, this.hitFlash - dtMs);
      this.shake = Math.max(0, this.shake - dtMs * 0.004);

      /* --- 结束判定（只触发一次） --- */
      if (!this.ended && (this.timeLeftMs <= 0 || this.lives <= 0)) {
        this._finish(this.lives <= 0 ? 'dead' : 'time');
      }
    }

    _spawn(p) {
      const obstacleRatio = lerp(DIFF.obstacleRatio[0], DIFF.obstacleRatio[1], p);
      const kind = Math.random() < obstacleRatio ? 'obstacle' : 'collectible';
      const rBase = kind === 'obstacle'
        ? lerp(DIFF.obstacleR[0], DIFF.obstacleR[1], p)
        : lerp(DIFF.collectibleR[0], DIFF.collectibleR[1], p);
      const r = rBase * clamp(Math.min(this.w, this.h) / 400, 0.85, 1.35);
      const x = rand(this.sidePad + r, this.w - this.sidePad - r);
      const speed = lerp(DIFF.fallSpeed[0], DIFF.fallSpeed[1], p) * this.speedScale * rand(0.9, 1.12);
      this.entities.push({
        kind: kind,
        x: x,
        y: -r - 12,
        r: r,
        vy: speed,
        rot: rand(-0.4, 0.4),
        spin: rand(-1.1, 1.1) * (kind === 'obstacle' ? 1 : 0.55),
        wobble: rand(0, Math.PI * 2),
        sprite: kind === 'obstacle' ? this.cfg.obstacle.spriteId : this.cfg.collectible.spriteId,
        hitScale: kind === 'obstacle' ? 0.78 : 0.86,
        born: this.elapsed,
      });
      if (kind === 'obstacle') this.obstacleCount++;
    }

    _onCollect(e) {
      this.collectCount++;
      const withinCombo = (this.elapsed - this.lastCollectAt) <= COMBO_WINDOW_MS;
      this.combo = withinCombo ? this.combo + 1 : 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastCollectAt = this.elapsed;

      const gain = 10 + Math.min(this.combo - 1, 5) * 4;
      this.score += gain;
      this._emit('score', this.score);

      /* 收集动画 + 粒子 */
      this._burst(e.x, e.y, this.theme.particle, 10, 120);
      this.floaters.push({ x: e.x, y: e.y - e.r, text: '+' + gain, life: 780, max: 780, color: this.theme.accent });
      if (this.combo >= 3) {
        this.floaters.push({ x: e.x, y: e.y - e.r - 20, text: this.combo + ' 连击!', life: 900, max: 900, color: this.theme.accent2, big: true });
      }
      if (window.GengAudio) window.GengAudio.collect(this.combo);
      this._emit('combo', this.combo);
    }

    _onHit(e) {
      if (this.elapsed < this.invincibleUntil) return;
      this.lives--;
      this.invincibleUntil = this.elapsed + INVINCIBLE_MS;
      this.combo = 0;
      this.hitFlash = 260;
      this.shake = 1;
      this._burst(e.x, e.y, [this.theme.danger, '#ffffff'], 16, 170);
      this._breakCombo();
      this._emit('lives', this.lives);
      if (window.GengAudio) window.GengAudio.hit();
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch (err) {} }
    }

    _breakCombo() {
      if (this.combo > 0) { this.combo = 0; this._emit('combo', 0); }
    }

    _burst(x, y, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(speed * 0.3, speed);
        this._spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
          colors[Math.floor(Math.random() * colors.length)], rand(2, 5.2), rand(280, 620), 240);
      }
    }

    _spawnParticle(x, y, vx, vy, color, size, life, grav) {
      if (this.particles.length > 260) return;
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, color: color, size: size, life: life, max: life, grav: grav || 0 });
    }

    _finish(reason) {
      if (this.ended) return;
      this.ended = true;
      this.state = 'ended';
      const secondsSurvived = Math.round(this.elapsed / 1000);
      this.result = {
        score: this.score,
        reason: reason,
        survivedSec: Math.min(45, secondsSurvived),
        lives: this.lives,
        collects: this.collectCount,
        obstacles: this.obstacleCount,
        bestCombo: this.bestCombo,
      };
      if (window.GengAudio) {
        if (reason === 'dead') window.GengAudio.gameOver();
        else window.GengAudio.finish(this.score, 900);
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

    /* ---------------- 渲染 ---------------- */
    _render() {
      const ctx = this.ctx;
      const th = this.theme;
      const w = this.w, h = this.h;

      ctx.save();
      if (this.shake > 0.01) {
        const m = this.shake * 7;
        ctx.translate(rand(-m, m), rand(-m, m));
      }

      /* 背景 */
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.bg[0]);
      g.addColorStop(0.55, th.bg[1]);
      g.addColorStop(1, th.bg[2]);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, w + 40, h + 40);

      /* v2 场景背景：12 套有辨识度的场景装饰（由 art-scenes.js 提供）。
       * 绘制在底色之上、网格之下，保持克制不干扰玩法。 */
      if (this.cfg && this.cfg.sceneId && window.GengTheme && window.GengTheme.drawSceneBackground) {
        try { window.GengTheme.drawSceneBackground(ctx, this.cfg.sceneId, w, h, th, this.elapsed / 1000); } catch (e) {}
      }

      /* 网格 */
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 1;
      const cell = Math.max(34, w / 9);
      ctx.beginPath();
      for (let x = 0; x < w + cell; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y < h + cell; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      /* 地面线 */
      ctx.strokeStyle = th.floor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h - 3); ctx.lineTo(w, h - 3);
      ctx.stroke();

      /* 实体 */
      for (const e of this.entities) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const wob = 1 + Math.sin(e.wobble) * 0.06;
        ctx.rotate(e.rot * 0.25);
        ctx.scale(wob, wob);
        /* 阴影 */
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, e.r * 0.9, e.r * 0.8, e.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (e.kind === 'obstacle') {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = e.r * 0.9; ctx.shadowOffsetY = e.r * 0.25;
          window.GengTheme.drawObstacle(ctx, e.sprite, e.r * 0.95, th);
          ctx.restore();
        } else {
          ctx.save();
          ctx.shadowColor = th.collectibleGlow; ctx.shadowBlur = e.r * 1.6;
          window.GengTheme.drawCollectible(ctx, e.sprite, e.r * 0.95, th);
          ctx.restore();
        }
        ctx.restore();
      }

      /* 粒子 */
      for (const pt of this.particles) {
        const a = clamp(pt.life / pt.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 玩家 */
      const invincible = this.elapsed < this.invincibleUntil;
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      if (invincible && Math.floor(this.elapsed / 90) % 2 === 0) ctx.globalAlpha = 0.42;
      /* 光环 */
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = th.playerRing;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, this.player.r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      /* 阴影 */
      ctx.save();
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(0, this.player.r * 0.95, this.player.r * 0.9, this.player.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      /* 主角画得比碰撞半径略大：视觉上更像主角，手感也更宽容 */
      window.GengTheme.drawAvatar(ctx, this.cfg.player.avatarId, this.player.r * 0.78, this.elapsed / 1000);
      ctx.restore();

      /* 浮字 */
      ctx.textAlign = 'center';
      for (const f of this.floaters) {
        const a = clamp(f.life / f.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = (f.big ? '700 ' : '600 ') + Math.round(Math.max(15, w * 0.045) * (f.big ? 1.15 : 1)) + 'px system-ui, sans-serif';
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      /* 受击闪白 */
      if (this.hitFlash > 0) {
        ctx.globalAlpha = clamp(this.hitFlash / 260, 0, 1) * 0.42;
        ctx.fillStyle = th.danger;
        ctx.fillRect(-20, -20, w + 40, h + 40);
        ctx.globalAlpha = 1;
      }

      /* 台词气泡 */
      if (this.speech && (this.state === 'playing' || this.state === 'countdown')) {
        const a = clamp(Math.min(this.speech.life, 400) / 400, 0, 1);
        ctx.globalAlpha = a * 0.96;
        const fs = Math.round(clamp(w * 0.042, 13, 19));
        ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
        const tw = ctx.measureText(this.speech.text).width;
        const padX = 16, bh = fs + 18;
        const bw = Math.min(w - 24, tw + padX * 2);
        const bx = (w - bw) / 2, by = Math.max(12, h * 0.075);
        ctx.fillStyle = th.hud;
        window.GengTheme.roundRect(ctx, bx, by, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = th.text;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.speech.text, w / 2, by + bh / 2 + 1);
        ctx.globalAlpha = 1;
      }

      /* 倒计时开局数字 */
      if (this.state === 'countdown') {
        const n = Math.ceil(this.countdownLeftMs / 600);
        const label = n >= 3 ? '3' : (n === 2 ? '2' : '1');
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = th.text;
        ctx.font = '800 ' + Math.round(Math.min(w, h) * 0.26) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, w / 2, h * 0.42);
        ctx.font = '600 ' + Math.round(clamp(w * 0.05, 14, 22)) + 'px system-ui, sans-serif';
        ctx.fillStyle = th.textDim;
        ctx.fillText('准备', w / 2, h * 0.42 + Math.min(w, h) * 0.19);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  }

  return { Game: Game, DURATION_MS: DURATION_MS, START_LIVES: START_LIVES, INVINCIBLE_MS: INVINCIBLE_MS };
})();

if (typeof window !== 'undefined') window.GengGame = GengGame;
