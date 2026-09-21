/* 「梗一下」v2 美术资源：12 套场景背景 + 30 个新图案（13 障碍 + 17 奖励）。
 * 障碍：phone, water-glass, red-pen, queue-rope, dirty-dish, price-tag, traffic-jam,
 *       weight-plate, exam-question, scorched-pan, cardboard-box, turbulence, fried-chicken
 * 奖励：blanket, phone-charger, candle, boba, coupon, seat, dumbbell, protein-shake,
 *       answer-sheet, a-grade, fried-egg, noodle-bowl, cat-treat, boarding-pass,
 *       window-seat, souvenir, parcel
 * 纯 Canvas 2D 程序化绘制，不引用任何外部图片 / 字体 / URL。
 * 场景函数只画背景（调用方已铺好 bg 渐变、网格与地面线），不做清屏。
 * 配色一律取自传入的 palette，元素整体保持低透明度，避免和下落中的实体抢戏。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GengArt = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ================= 小工具 ================= */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(Math.abs(r), Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.closePath();
  }

  function ellipsePath(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  /* 折线多边形：pts = [x0,y0, x1,y1, ...] */
  function poly(ctx, pts) {
    var i;
    ctx.beginPath();
    for (i = 0; i + 1 < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]);
      else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.closePath();
  }

  function seg(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* 手绘的小写 z（避免依赖字体） */
  function zGlyph(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.stroke();
  }

  /* 四角星 / 闪光 */
  function sparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    ctx.closePath();
  }

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.78);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.32, x - s * 0.55, y - s * 1.25, x, y - s * 0.34);
    ctx.bezierCurveTo(x + s * 0.55, y - s * 1.25, x + s * 1.5, y - s * 0.32, x, y + s * 0.78);
    ctx.closePath();
  }

  /* palette 取值（缺字段时退回默认色，保证任何 palette 都不会崩） */
  function col(palette, key, fallback) {
    var v = palette ? palette[key] : null;
    return typeof v === 'string' ? v : fallback;
  }

  function shade(a) { return 'rgba(0,0,0,' + a + ')'; }
  function hi(a) { return 'rgba(255,255,255,' + a + ')'; }

  function lgrad(ctx, x0, y0, x1, y1, c0, c1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  }

  function rgrad(ctx, x, y, r0, r1, c0, c1) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  }

  /* ============ 12 套场景背景 ============
   * 每套函数签名：function(ctx, w, h, palette, t)
   *   ctx: CanvasRenderingContext2D（已按 CSS 像素设置好变换）
   *   w,h: 画布尺寸（CSS 像素）
   *   palette: 配色对象，含 bg:[c0,c1,c2], grid, accent, accent2, danger, text, textDim, glow, floor 等
   *   t: 时间（秒），用于轻微动画
   * 要求：只画背景（不含玩家/实体/HUD），不要清屏（调用方已画底色渐变）。
   * 必须"有辨识度"，不能只是换色网格。
   */
  var SCENE_ART = {
    /* ---------- 1. 深夜卧室：窗 + 月光 + 床 + 台灯 + 飘着的 zzz ---------- */
    'bedroom-night': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#8b7cf6');
      var accent2 = col(p, 'accent2', '#f472b6');
      var glow = col(p, 'glow', 'rgba(139,124,246,0.35)');
      var dim = col(p, 'textDim', 'rgba(240,238,255,0.66)');
      var tt = t || 0;
      var i, x, y, s;
      ctx.save();

      /* 窗户 + 月光光晕 */
      var wx = w * 0.10, wy = h * 0.12, ww = w * 0.30, wh = h * 0.42;
      var mm = Math.min(ww, wh);
      ctx.fillStyle = rgrad(ctx, wx + ww * 0.62, wy + wh * 0.30, 2, wh * 0.95, glow, 'rgba(0,0,0,0)');
      ctx.fillRect(wx - ww * 0.8, wy - wh * 0.6, ww * 2.6, wh * 2.4);

      /* 窗框 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, wx, wy, ww, wh, mm * 0.06); ctx.fill();
      ctx.globalAlpha = 1;
      /* 夜空玻璃 */
      ctx.fillStyle = shade(0.42);
      roundRect(ctx, wx + mm * 0.04, wy + mm * 0.04, ww - mm * 0.08, wh - mm * 0.08, mm * 0.05); ctx.fill();
      /* 月亮 */
      ctx.fillStyle = hi(0.26);
      circle(ctx, wx + ww * 0.64, wy + wh * 0.30, mm * 0.17); ctx.fill();
      ctx.fillStyle = hi(0.08);
      circle(ctx, wx + ww * 0.64, wy + wh * 0.30, mm * 0.28); ctx.fill();
      /* 星星（轻微闪烁） */
      ctx.fillStyle = hi(0.5);
      for (i = 0; i < 7; i++) {
        x = wx + ww * (0.08 + ((i * 37) % 80) / 100);
        y = wy + wh * (0.08 + ((i * 53) % 40) / 100);
        ctx.globalAlpha = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(tt * 1.7 + i * 1.3));
        circle(ctx, x, y, Math.max(0.7, w * 0.0022)); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 窗外城市剪影 */
      ctx.fillStyle = shade(0.5);
      for (i = 0; i < 5; i++) {
        s = ww / 6;
        ctx.fillRect(wx + s * 0.5 + i * s, wy + wh - wh * (0.12 + ((i * 29) % 26) / 100) - mm * 0.05, s * 0.86, wh);
      }
      /* 窗棂 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1.1, w * 0.0028);
      seg(ctx, wx + ww * 0.5, wy, wx + ww * 0.5, wy + wh);
      seg(ctx, wx, wy + wh * 0.52, wx + ww, wy + wh * 0.52);
      ctx.globalAlpha = 1;
      /* 窗帘 */
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(wx - ww * 0.12, wy - wh * 0.08);
      ctx.quadraticCurveTo(wx - ww * 0.22, wy + wh * 0.5, wx - ww * 0.03, wy + wh * 1.08);
      ctx.lineTo(wx + ww * 0.18, wy + wh * 1.08);
      ctx.quadraticCurveTo(wx + ww * 0.04, wy + wh * 0.5, wx + ww * 0.18, wy - wh * 0.08);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      /* 床（右下） */
      var bx = w * 0.50;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.24;
      roundRect(ctx, bx - w * 0.05, h * 0.60, w * 0.05, h * 0.28, w * 0.012); ctx.fill();
      ctx.globalAlpha = 0.18;
      roundRect(ctx, bx, h * 0.765, w * 0.44, h * 0.115, w * 0.012); ctx.fill();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, bx - w * 0.04, h * 0.795, w * 0.10, h * 0.06, w * 0.01); ctx.fill();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.16;
      roundRect(ctx, bx + w * 0.06, h * 0.750, w * 0.34, h * 0.05, w * 0.01); ctx.fill();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, bx + w * 0.08, h * 0.815, w * 0.30, h * 0.04, w * 0.008); ctx.fill();
      ctx.globalAlpha = 1;

      /* 床头柜 + 台灯 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.16;
      roundRect(ctx, w * 0.06, h * 0.740, w * 0.11, h * 0.10, w * 0.008); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgrad(ctx, w * 0.115, h * 0.64, 1, h * 0.15, glow, 'rgba(0,0,0,0)');
      ctx.fillRect(w * 0.01, h * 0.50, w * 0.23, h * 0.28);
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.30;
      poly(ctx, [w * 0.085, h * 0.655, w * 0.145, h * 0.655, w * 0.165, h * 0.735, w * 0.065, h * 0.735]); ctx.fill();
      ctx.globalAlpha = 0.24;
      seg(ctx, w * 0.115, h * 0.735, w * 0.115, h * 0.795);
      ctx.globalAlpha = 1;
      /* 床头柜上还亮着的手机屏 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(tt * 2.2);
      roundRect(ctx, w * 0.075, h * 0.755, w * 0.035, h * 0.05, w * 0.004); ctx.fill();
      ctx.globalAlpha = 1;

      /* 飘着的 zzz */
      ctx.strokeStyle = dim;
      ctx.lineWidth = Math.max(1, w * 0.0022);
      ctx.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        var prog = (tt * 0.16 + i * 0.34) % 1;
        x = w * 0.44 + prog * w * 0.035 + i * w * 0.022;
        y = h * 0.42 - prog * h * 0.16 - i * h * 0.05;
        s = Math.max(3, w * (0.007 + i * 0.003));
        ctx.globalAlpha = 0.06 + 0.26 * (1 - prog);
        zGlyph(ctx, x, y, s);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 2. 办公室：吊灯 + 格子隔断 + 显示器 + 窗外高楼 ---------- */
    'office-night': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#5ce1e6');
      var accent2 = col(p, 'accent2', '#ff6b9d');
      var glow = col(p, 'glow', 'rgba(92,225,230,0.35)');
      var tt = t || 0;
      var i, r, c;
      ctx.save();

      /* 吊灯（三盏，带光锥） */
      for (i = 0; i < 3; i++) {
        var lx = w * (0.22 + i * 0.28);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.20;
        ctx.lineWidth = Math.max(1, w * 0.0022);
        seg(ctx, lx, 0, lx, h * 0.11);
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = accent;
        poly(ctx, [lx - w * 0.045, h * 0.155, lx + w * 0.045, h * 0.155, lx + w * 0.020, h * 0.11, lx - w * 0.020, h * 0.11]);
        ctx.fill();
        ctx.globalAlpha = 0.14 + 0.04 * Math.sin(tt * 1.4 + i);
        ctx.fillStyle = lgrad(ctx, 0, h * 0.155, 0, h * 0.42, glow, 'rgba(0,0,0,0)');
        poly(ctx, [lx - w * 0.045, h * 0.155, lx + w * 0.045, h * 0.155, lx + w * 0.16, h * 0.42, lx - w * 0.16, h * 0.42]);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 右侧窗外夜景高楼 */
      var wx = w * 0.62, wy = h * 0.10, ww = w * 0.34, wh = h * 0.42;
      ctx.fillStyle = shade(0.42);
      roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.06); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.1, w * 0.0028);
      roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.06); ctx.stroke();
      ctx.globalAlpha = 1;
      for (i = 0; i < 6; i++) {
        var bw = ww / 8;
        var bh = wh * (0.30 + ((i * 31) % 45) / 100);
        var hx = wx + bw * 0.6 + i * bw * 1.16;
        ctx.fillStyle = shade(0.45);
        ctx.fillRect(hx, wy + wh - bh, bw, bh);
        for (r = 0; r < 3; r++) {
          for (c = 0; c < 2; c++) {
            ctx.fillStyle = (i % 3 === 0) ? accent2 : accent;
            ctx.globalAlpha = 0.08 + 0.10 * (0.5 + 0.5 * Math.sin(tt * 1.1 + i * 2.1 + r * 0.7 + c * 1.3));
            ctx.fillRect(hx + bw * 0.18 + c * bw * 0.36, wy + wh - bh + wh * 0.06 + r * wh * 0.10, bw * 0.22, wh * 0.045);
          }
        }
      }
      ctx.globalAlpha = 1;

      /* 格子隔断 */
      var pty = h * 0.60;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.14;
      roundRect(ctx, w * 0.04, pty, w * 0.92, h * 0.24, w * 0.01); ctx.fill();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, w * 0.04, pty - h * 0.008, w * 0.92, h * 0.012, w * 0.006); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = shade(0.25);
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (i = 1; i < 4; i++) seg(ctx, w * (0.04 + i * 0.23), pty + h * 0.012, w * (0.04 + i * 0.23), pty + h * 0.23);
      /* 隔断上的显示器 */
      for (i = 0; i < 3; i++) {
        var mx = w * (0.11 + i * 0.29);
        ctx.fillStyle = shade(0.35);
        roundRect(ctx, mx, pty - h * 0.105, w * 0.15, h * 0.085, w * 0.006); ctx.fill();
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.16 + 0.06 * Math.sin(tt * 3.1 + i * 1.7);
        roundRect(ctx, mx + w * 0.008, pty - h * 0.098, w * 0.134, h * 0.070, w * 0.004); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = shade(0.40);
        ctx.fillRect(mx + w * 0.07, pty - h * 0.02, w * 0.012, h * 0.02);
      }
      /* 桌面线 + 桌上的小物件 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = Math.max(1.4, w * 0.003);
      seg(ctx, w * 0.04, pty + h * 0.235, w * 0.96, pty + h * 0.235);
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.16;
      for (i = 0; i < 3; i++) {
        roundRect(ctx, w * (0.16 + i * 0.29), pty + h * 0.20, w * 0.05, h * 0.03, w * 0.004);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 3. 宿舍早八：上下铺 + 晨光 + 挂着的外套 ---------- */
    'dorm-morning': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#7bf1a8');
      var accent2 = col(p, 'accent2', '#ffd166');
      var tt = t || 0;
      var i;
      ctx.save();

      /* 右侧窗户 + 晨光 */
      var wx = w * 0.62, wy = h * 0.14, ww = w * 0.30, wh = h * 0.36;
      var mm = Math.min(ww, wh);
      ctx.fillStyle = shade(0.30);
      roundRect(ctx, wx, wy, ww, wh, mm * 0.06); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1.2, w * 0.003);
      roundRect(ctx, wx, wy, ww, wh, mm * 0.06); ctx.stroke();
      ctx.globalAlpha = 1;
      /* 刚升起来的太阳 */
      ctx.fillStyle = rgrad(ctx, wx + ww * 0.5, wy + wh * 0.55, 1, mm * 0.62, accent2, 'rgba(0,0,0,0)');
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = hi(0.30);
      circle(ctx, wx + ww * 0.5, wy + wh * 0.55, mm * 0.13); ctx.fill();
      /* 斜射进来的晨光光束 */
      for (i = 0; i < 3; i++) {
        ctx.fillStyle = accent2;
        ctx.globalAlpha = 0.070 + 0.030 * Math.sin(tt * 0.8 + i * 1.1);
        poly(ctx, [
          wx + ww * (0.14 + i * 0.30), wy + wh * 0.30,
          wx + ww * (0.30 + i * 0.30), wy + wh * 0.30,
          wx + ww * (-0.20 + i * 0.30), h,
          wx + ww * (-0.55 + i * 0.30), h
        ]);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 窗棂 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, w * 0.0024);
      seg(ctx, wx + ww * 0.5, wy, wx + ww * 0.5, wy + wh);
      ctx.globalAlpha = 1;

      /* 上下铺床架 */
      var lx = w * 0.08, rx = w * 0.46;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.8, w * 0.005);
      ctx.globalAlpha = 0.22;
      seg(ctx, lx, h * 0.20, lx, h * 0.90);
      seg(ctx, rx, h * 0.20, rx, h * 0.90);
      seg(ctx, lx, h * 0.20, rx, h * 0.20);
      ctx.globalAlpha = 1;
      /* 上铺 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, lx - w * 0.02, h * 0.34, (rx - lx) + w * 0.04, h * 0.045, w * 0.008); ctx.fill();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, lx + w * 0.01, h * 0.315, w * 0.10, h * 0.03, w * 0.008); ctx.fill();
      /* 下铺 */
      ctx.globalAlpha = 0.20;
      roundRect(ctx, lx - w * 0.03, h * 0.66, (rx - lx) + w * 0.06, h * 0.05, w * 0.008); ctx.fill();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.14;
      roundRect(ctx, lx - w * 0.02, h * 0.635, w * 0.14, h * 0.032, w * 0.008); ctx.fill();
      ctx.globalAlpha = 1;
      /* 梯子 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = Math.max(1.2, w * 0.003);
      seg(ctx, rx - w * 0.06, h * 0.36, rx - w * 0.06, h * 0.90);
      for (i = 0; i < 4; i++) seg(ctx, rx - w * 0.078, h * (0.46 + i * 0.12), rx - w * 0.042, h * (0.46 + i * 0.12));
      ctx.globalAlpha = 1;

      /* 挂在墙上的外套 */
      var hx = w * 0.52, hy = h * 0.26;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      circle(ctx, hx, hy, Math.max(2, w * 0.006)); ctx.fill();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - w * 0.045, hy + h * 0.06);
      ctx.lineTo(hx - w * 0.075, hy + h * 0.20);
      ctx.lineTo(hx - w * 0.040, hy + h * 0.20);
      ctx.lineTo(hx - w * 0.020, hy + h * 0.10);
      ctx.lineTo(hx + w * 0.020, hy + h * 0.10);
      ctx.lineTo(hx + w * 0.040, hy + h * 0.20);
      ctx.lineTo(hx + w * 0.075, hy + h * 0.20);
      ctx.lineTo(hx + w * 0.045, hy + h * 0.06);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      /* 地上的拖鞋 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.16;
      ellipsePath(ctx, w * 0.56, h * 0.915, w * 0.032, h * 0.016, -0.12); ctx.fill();
      ellipsePath(ctx, w * 0.62, h * 0.925, w * 0.032, h * 0.016, 0.10); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 4. 生日派对：挂旗 + 气球 + 蛋糕桌 + 彩纸 ---------- */
    'birthday-party': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#ffb703');
      var accent2 = col(p, 'accent2', '#ff5d8f');
      var dim = col(p, 'textDim', 'rgba(255,245,251,0.68)');
      var tt = t || 0;
      var i, j, q, fx, fy;
      ctx.save();

      /* 挂旗 bunting */
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (i = 0; i < 3; i++) {
        var x0 = w * (0.04 + i * 0.32), x1 = w * (0.36 + i * 0.32);
        var sag = h * 0.06;
        var cxm = (x0 + x1) / 2;
        ctx.beginPath();
        ctx.moveTo(x0, h * 0.06);
        ctx.quadraticCurveTo(cxm, h * 0.06 + sag, x1, h * 0.06);
        ctx.stroke();
        for (j = 0; j < 5; j++) {
          q = (j + 0.5) / 5;
          fx = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * cxm + q * q * x1;
          fy = (1 - q) * (1 - q) * h * 0.06 + 2 * (1 - q) * q * (h * 0.06 + sag) + q * q * h * 0.06;
          ctx.fillStyle = ((i + j) % 2 === 0) ? accent : accent2;
          ctx.globalAlpha = 0.22;
          poly(ctx, [fx - w * 0.016, fy, fx + w * 0.016, fy, fx, fy + h * 0.05]);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      /* 气球（轻微上下飘） */
      for (i = 0; i < 5; i++) {
        var bxx = w * (0.13 + i * 0.19);
        var byy = h * (0.30 + ((i * 41) % 14) / 100) + Math.sin(tt * 1.1 + i) * h * 0.012;
        var brx = w * 0.028, bry = brx * 1.22;
        ctx.fillStyle = (i % 2 === 0) ? accent : accent2;
        ctx.globalAlpha = 0.20;
        ellipsePath(ctx, bxx, byy, brx, bry, 0); ctx.fill();
        ctx.fillStyle = hi(0.5);
        ctx.globalAlpha = 0.16;
        ellipsePath(ctx, bxx - brx * 0.30, byy - bry * 0.35, brx * 0.22, bry * 0.26, -0.4); ctx.fill();
        ctx.strokeStyle = dim;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = Math.max(1, w * 0.0018);
        ctx.beginPath();
        ctx.moveTo(bxx, byy + bry);
        ctx.quadraticCurveTo(bxx + w * 0.012, byy + bry + h * 0.045, bxx - w * 0.004, byy + bry + h * 0.09);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* 桌子 + 蛋糕 + 礼物 */
      var tby = h * 0.80;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.16;
      roundRect(ctx, w * 0.24, tby, w * 0.52, h * 0.05, w * 0.008); ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.fillRect(w * 0.30, tby + h * 0.05, w * 0.02, h * 0.12);
      ctx.fillRect(w * 0.68, tby + h * 0.05, w * 0.02, h * 0.12);
      /* 蛋糕 */
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, w * 0.42, tby - h * 0.09, w * 0.16, h * 0.09, w * 0.01); ctx.fill();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, w * 0.42, tby - h * 0.115, w * 0.16, h * 0.032, w * 0.01); ctx.fill();
      /* 蜡烛 + 火苗 */
      for (i = 0; i < 3; i++) {
        var cx = w * (0.465 + i * 0.035);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.26;
        roundRect(ctx, cx, tby - h * 0.155, w * 0.008, h * 0.045, w * 0.003); ctx.fill();
        ctx.fillStyle = '#fff2c0';
        ctx.globalAlpha = 0.26 + 0.10 * Math.sin(tt * 4 + i * 2);
        ellipsePath(ctx, cx + w * 0.004, tby - h * 0.168, w * 0.007, h * 0.014, 0); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 礼物盒 */
      for (i = 0; i < 2; i++) {
        var gx = w * (i === 0 ? 0.27 : 0.70), gw = w * (i === 0 ? 0.05 : 0.055), gh = gw * 0.85;
        ctx.fillStyle = (i === 0) ? accent2 : accent;
        ctx.globalAlpha = 0.22;
        roundRect(ctx, gx, tby - gh, gw, gh, w * 0.006); ctx.fill();
        ctx.fillStyle = hi(0.55);
        ctx.globalAlpha = 0.28;
        ctx.fillRect(gx + gw * 0.44, tby - gh, gw * 0.12, gh);
        ctx.fillRect(gx, tby - gh * 0.62, gw, gh * 0.10);
        circle(ctx, gx + gw * 0.36, tby - gh - w * 0.008, w * 0.012); ctx.fill();
        circle(ctx, gx + gw * 0.64, tby - gh - w * 0.008, w * 0.012); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 飘落的彩纸 */
      for (i = 0; i < 14; i++) {
        var prog = (tt * 0.02 + i * 0.071) % 1;
        var px = w * (((i * 47) % 97) / 100);
        var py = prog * h * 0.92 + h * 0.03;
        ctx.globalAlpha = 0.10 + 0.14 * (1 - prog);
        ctx.fillStyle = (i % 3 === 0) ? accent : ((i % 3 === 1) ? accent2 : hi(0.6));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(tt * 0.5 + i);
        ctx.fillRect(-w * 0.006, -w * 0.003, w * 0.012, w * 0.006);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /*__PART2__*/
    /* ---------- 5. 奶茶店：吧台 + 菜单板 + 杯堆 + 吊灯 ---------- */
    'milk-tea-shop': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#f2b880');
      var accent2 = col(p, 'accent2', '#e2725b');
      var dim = col(p, 'textDim', 'rgba(255,247,240,0.68)');
      var tt = t || 0;
      var i, j;
      ctx.save();

      /* 吊灯（两只暖光小圆灯 + 光锥） */
      for (i = 0; i < 2; i++) {
        var lx = w * (0.26 + i * 0.46);
        ctx.strokeStyle = dim;
        ctx.globalAlpha = 0.20;
        ctx.lineWidth = Math.max(1, w * 0.002);
        seg(ctx, lx, 0, lx, h * 0.13);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.28;
        poly(ctx, [lx - w * 0.030, h * 0.165, lx + w * 0.030, h * 0.165, lx + w * 0.014, h * 0.13, lx - w * 0.014, h * 0.13]);
        ctx.fill();
        ctx.globalAlpha = 0.10 + 0.03 * Math.sin(tt * 1.6 + i);
        ctx.fillStyle = lgrad(ctx, 0, h * 0.165, 0, h * 0.46, col(p, 'glow', 'rgba(242,184,128,0.35)'), 'rgba(0,0,0,0)');
        poly(ctx, [lx - w * 0.030, h * 0.165, lx + w * 0.030, h * 0.165, lx + w * 0.13, h * 0.46, lx - w * 0.13, h * 0.46]);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 菜单板（右侧墙上） */
      var mx = w * 0.66, my = h * 0.12, mw = w * 0.28, mh = h * 0.30;
      ctx.fillStyle = shade(0.32);
      roundRect(ctx, mx, my, mw, mh, w * 0.012); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.2, w * 0.003);
      roundRect(ctx, mx, my, mw, mh, w * 0.012); ctx.stroke();
      ctx.globalAlpha = 1;
      for (i = 0; i < 5; i++) {
        ctx.fillStyle = (i === 0) ? accent : dim;
        ctx.globalAlpha = (i === 0) ? 0.26 : 0.16;
        roundRect(ctx, mx + mw * 0.10, my + mh * (0.13 + i * 0.16), mw * (i === 0 ? 0.52 : 0.62 - (i % 3) * 0.10), mh * 0.055, mw * 0.02);
        ctx.fill();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = accent2;
        roundRect(ctx, mx + mw * 0.76, my + mh * (0.13 + i * 0.16), mw * 0.14, mh * 0.055, mw * 0.02);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 吧台 */
      var by = h * 0.62;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, w * 0.04, by, w * 0.62, h * 0.045, w * 0.008); ctx.fill();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, w * 0.06, by + h * 0.045, w * 0.58, h * 0.26, w * 0.006); ctx.fill();
      /* 吧台上的竖条纹 */
      ctx.strokeStyle = shade(0.22);
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (i = 0; i < 6; i++) seg(ctx, w * (0.10 + i * 0.09), by + h * 0.06, w * (0.10 + i * 0.09), by + h * 0.29);
      /* 台面上的杯堆（三角形叠杯） */
      for (i = 0; i < 4; i++) {
        var sx = w * (0.11 + i * 0.085);
        var sy = by - h * 0.012;
        for (j = 0; j <= i % 2; j++) {
          ctx.fillStyle = hi(0.45);
          ctx.globalAlpha = 0.20;
          poly(ctx, [sx - w * 0.020, sy - j * h * 0.040 - h * 0.036, sx + w * 0.020, sy - j * h * 0.040 - h * 0.036,
            sx + w * 0.014, sy - j * h * 0.040 - h * 0.008, sx - w * 0.014, sy - j * h * 0.040 - h * 0.008]);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      /* 吸管筒 */
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, w * 0.44, by - h * 0.075, w * 0.035, h * 0.07, w * 0.006); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.2, w * 0.0026);
      seg(ctx, w * 0.452, by - h * 0.075, w * 0.450, by - h * 0.115);
      seg(ctx, w * 0.462, by - h * 0.075, w * 0.466, by - h * 0.112);
      seg(ctx, w * 0.470, by - h * 0.075, w * 0.478, by - h * 0.108);
      ctx.globalAlpha = 1;
      /* 取餐铃（小圆） */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(w * 0.56, by - h * 0.006, w * 0.022, Math.PI, 0);
      ctx.closePath(); ctx.fill();
      circle(ctx, w * 0.56, by - h * 0.030, w * 0.007);
      ctx.globalAlpha = 0.26;
      ctx.fill();
      ctx.globalAlpha = 1;

      /* 台面前方的小圆凳 */
      for (i = 0; i < 2; i++) {
        var stx = w * (0.16 + i * 0.28);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = Math.max(1.2, w * 0.0026);
        seg(ctx, stx, h * 0.86, stx, h * 0.95);
        ctx.globalAlpha = 0.20;
        circle(ctx, stx, h * 0.845, w * 0.032); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 6. 地铁：扶手杆 + 吊环 + 车窗外隧道灯 ---------- */
    'subway-commute': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#5eb3f0');
      var accent2 = col(p, 'accent2', '#ffd166');
      var dim = col(p, 'textDim', 'rgba(238,247,255,0.66)');
      var tt = t || 0;
      var i, j;
      ctx.save();

      /* 车窗（左右各一，圆角矩形） */
      var wy = h * 0.26, wh = h * 0.40, ww = w * 0.26;
      for (i = 0; i < 2; i++) {
        var wx = w * (i === 0 ? 0.05 : 0.69);
        ctx.fillStyle = shade(0.40);
        roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.14); ctx.fill();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = Math.max(1.2, w * 0.003);
        roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.14); ctx.stroke();
        ctx.globalAlpha = 1;
        /* 隧道灯：横向掠过的光带 */
        ctx.save();
        roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.14);
        ctx.clip();
        for (j = 0; j < 4; j++) {
          var band = ((tt * 0.10 + j * 0.27) % 1);
          ctx.fillStyle = j % 2 === 0 ? accent : accent2;
          ctx.globalAlpha = 0.10 + 0.10 * Math.sin(band * Math.PI);
          ctx.fillRect(wx + band * ww - w * 0.05, wy, w * 0.05, wh);
        }
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = shade(0.5);
        ctx.fillRect(wx, wy + wh * 0.86, ww, wh * 0.14);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      /* 扶手横杆 + 立柱 */
      var railY = h * 0.10;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(2, w * 0.006);
      seg(ctx, w * 0.02, railY, w * 0.98, railY);
      ctx.lineWidth = Math.max(2.2, w * 0.007);
      ctx.globalAlpha = 0.20;
      seg(ctx, w * 0.31, h * 0.035, w * 0.31, h * 0.95);
      seg(ctx, w * 0.69, h * 0.035, w * 0.69, h * 0.95);
      ctx.globalAlpha = 1;

      /* 吊环（随车轻微摆动） */
      for (i = 0; i < 6; i++) {
        var hx = w * (0.075 + i * 0.17);
        var sw = Math.sin(tt * 1.6 + i * 0.8) * 0.06;
        ctx.save();
        ctx.translate(hx, railY);
        ctx.rotate(sw);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = Math.max(1.2, w * 0.0028);
        seg(ctx, 0, 0, 0, h * 0.085);
        ctx.globalAlpha = 0.28;
        roundRect(ctx, -w * 0.020, h * 0.085, w * 0.040, h * 0.055, w * 0.012);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      /* 车厢地板踢脚线 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(w * 0.03, h * 0.88, w * 0.94, h * 0.055);
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = Math.max(1, w * 0.002);
      seg(ctx, w * 0.03, h * 0.88, w * 0.97, h * 0.88);
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 7. 健身房：镜子墙 + 杠铃架 + 瑜伽垫 + 地面刻度 ---------- */
    'gym': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#7dd35f');
      var accent2 = col(p, 'accent2', '#ffd166');
      var dim = col(p, 'textDim', 'rgba(244,247,242,0.66)');
      var floorC = col(p, 'floor', 'rgba(125,211,95,0.13)');
      var tt = t || 0;
      var i;
      ctx.save();

      /* 镜子墙（左侧大面板 + 斜角高光） */
      var mx = w * 0.06, my = h * 0.16, mw = w * 0.40, mh = h * 0.50;
      ctx.fillStyle = shade(0.28);
      roundRect(ctx, mx, my, mw, mh, w * 0.012); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1.4, w * 0.0034);
      roundRect(ctx, mx, my, mw, mh, w * 0.012); ctx.stroke();
      ctx.globalAlpha = 0.10;
      ctx.lineWidth = Math.max(8, w * 0.022);
      seg(ctx, mx + mw * 0.20, my + mh * 0.92, mx + mw * 0.86, my + mh * 0.08);
      ctx.globalAlpha = 1;

      /* 杠铃架（右侧） */
      var sx = w * 0.68, sy = h * 0.20, sh = h * 0.48;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(2, w * 0.005);
      seg(ctx, sx, sy, sx, sy + sh);
      seg(ctx, sx + w * 0.24, sy, sx + w * 0.24, sy + sh);
      ctx.globalAlpha = 1;
      /* 架上的杠铃杆（带两端杠铃片） */
      for (i = 0; i < 2; i++) {
        var ry0 = sy + sh * (i === 0 ? 0.30 : 0.68);
        ctx.strokeStyle = accent2;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = Math.max(2, w * 0.0044);
        seg(ctx, sx - w * 0.015, ry0, sx + w * 0.255, ry0);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.26;
        circle(ctx, sx - w * 0.015, ry0, w * 0.020); ctx.fill();
        circle(ctx, sx + w * 0.255, ry0, w * 0.020); ctx.fill();
        ctx.fillStyle = shade(0.30);
        circle(ctx, sx - w * 0.015, ry0, w * 0.009); ctx.fill();
        circle(ctx, sx + w * 0.255, ry0, w * 0.009); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 墙面计分板 / 数字提示板 */
      ctx.fillStyle = shade(0.30);
      roundRect(ctx, w * 0.53, h * 0.20, w * 0.10, h * 0.07, w * 0.008); ctx.fill();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.20 + 0.08 * Math.sin(tt * 2.4);
      roundRect(ctx, w * 0.545, h * 0.222, w * 0.07, h * 0.046, w * 0.005); ctx.fill();
      ctx.globalAlpha = 1;

      /* 地面的瑜伽垫 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, w * 0.10, h * 0.80, w * 0.30, h * 0.09, w * 0.014); ctx.fill();
      ctx.fillStyle = dim;
      ctx.globalAlpha = 0.10;
      roundRect(ctx, w * 0.135, h * 0.80, w * 0.02, h * 0.09, w * 0.010); ctx.fill();
      /* 哑铃（地上小的一对） */
      for (i = 0; i < 2; i++) {
        var dx = w * (0.55 + i * 0.22);
        ctx.fillStyle = accent2;
        ctx.globalAlpha = 0.24;
        roundRect(ctx, dx - w * 0.045, h * 0.885, w * 0.09, h * 0.022, w * 0.010); ctx.fill();
        roundRect(ctx, dx - w * 0.065, h * 0.870, w * 0.026, h * 0.052, w * 0.010); ctx.fill();
        roundRect(ctx, dx + w * 0.039, h * 0.870, w * 0.026, h * 0.052, w * 0.010); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 地面刻度线（刻度尺） */
      ctx.strokeStyle = floorC;
      ctx.globalAlpha = 0.30;
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (i = 0; i < 9; i++) {
        var tx = w * (0.06 + i * 0.11);
        var th2 = (i % 2 === 0) ? h * 0.045 : h * 0.028;
        seg(ctx, tx, h * 0.965, tx, h * 0.965 - th2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 8. 考试教室：黑板 + 板书 + 时钟 + 课桌排列 ---------- */
    'exam-classroom': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#a3d977');
      var accent2 = col(p, 'accent2', '#ffd166');
      var dim = col(p, 'textDim', 'rgba(246,250,238,0.66)');
      var danger = col(p, 'danger', '#e85d5d');
      var tt = t || 0;
      var i;
      ctx.save();

      /* 黑板 */
      var bx = w * 0.10, by = h * 0.08, bw = w * 0.62, bh = h * 0.32;
      ctx.fillStyle = shade(0.42);
      roundRect(ctx, bx, by, bw, bh, w * 0.008); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.4, w * 0.0034);
      roundRect(ctx, bx, by, bw, bh, w * 0.008); ctx.stroke();
      ctx.globalAlpha = 1;
      /* 板书：粉笔线条 */
      ctx.strokeStyle = hi(0.5);
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = Math.max(1, w * 0.0022);
      for (i = 0; i < 3; i++) {
        seg(ctx, bx + bw * 0.08, by + bh * (0.28 + i * 0.20), bx + bw * (0.40 + ((i * 23) % 30) / 100), by + bh * (0.28 + i * 0.20));
      }
      /* 板书：公式框 + 勾勾/叉叉 */
      ctx.globalAlpha = 0.20;
      roundRect(ctx, bx + bw * 0.62, by + bh * 0.22, bw * 0.26, bh * 0.24, w * 0.006);
      ctx.stroke();
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.22;
      seg(ctx, bx + bw * 0.66, by + bh * 0.34, bx + bw * 0.70, by + bh * 0.40);
      seg(ctx, bx + bw * 0.70, by + bh * 0.40, bx + bw * 0.78, by + bh * 0.26);
      ctx.strokeStyle = danger;
      ctx.globalAlpha = 0.20;
      seg(ctx, bx + bw * 0.80, by + bh * 0.30, bx + bw * 0.86, by + bh * 0.40);
      seg(ctx, bx + bw * 0.86, by + bh * 0.30, bx + bw * 0.80, by + bh * 0.40);
      ctx.globalAlpha = 1;
      /* 倒计时小牌子 */
      ctx.fillStyle = danger;
      ctx.globalAlpha = 0.16;
      roundRect(ctx, bx + bw * 0.86, by + bh * 0.10, w * 0.09, h * 0.075, w * 0.008); ctx.fill();
      ctx.fillStyle = danger;
      ctx.globalAlpha = 0.26 + 0.10 * Math.sin(tt * 2.0);
      roundRect(ctx, bx + bw * 0.875, by + bh * 0.125, w * 0.06, h * 0.046, w * 0.005); ctx.fill();
      ctx.globalAlpha = 1;

      /* 时钟（右上，指针缓慢走动） */
      var cx = w * 0.86, cy = h * 0.16, cr = Math.min(w, h) * 0.075;
      ctx.fillStyle = hi(0.10);
      circle(ctx, cx, cy, cr); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = Math.max(1.4, w * 0.0032);
      circle(ctx, cx, cy, cr); ctx.stroke();
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1.2, w * 0.0026);
      seg(ctx, cx, cy, cx, cy - cr * 0.62);
      seg(ctx, cx, cy, cx + cr * 0.42, cy + cr * 0.20);
      ctx.globalAlpha = 1;

      /* 课桌排列（两排三列，简笔） */
      var rows = 2, cols = 3;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var dx = w * (0.14 + c * 0.26);
          var dy = h * (0.62 + r * 0.16);
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.16;
          roundRect(ctx, dx, dy, w * 0.16, h * 0.03, w * 0.004); ctx.fill();
          ctx.globalAlpha = 0.12;
          seg(ctx, dx + w * 0.01, dy + h * 0.03, dx + w * 0.01, dy + h * 0.10);
          seg(ctx, dx + w * 0.15, dy + h * 0.03, dx + w * 0.15, dy + h * 0.10);
          ctx.globalAlpha = 0.18;
          roundRect(ctx, dx + w * 0.045, dy - h * 0.028, w * 0.07, h * 0.024, w * 0.004); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      /* 讲台 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.14;
      roundRect(ctx, w * 0.36, h * 0.455, w * 0.28, h * 0.045, w * 0.006); ctx.fill();
      ctx.globalAlpha = 0.10;
      roundRect(ctx, w * 0.38, h * 0.50, w * 0.24, h * 0.09, w * 0.006); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /*__PART3__*/
    /* ---------- 9. 厨房：灶台 + 挂着的锅 + 瓷砖墙 + 调料瓶 ---------- */
    'kitchen': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#ff9f6b');
      var accent2 = col(p, 'accent2', '#ffd166');
      var dim = col(p, 'textDim', 'rgba(255,244,236,0.68)');
      var tt = t || 0;
      var i, j;
      ctx.save();

      /* 瓷砖墙 */
      ctx.strokeStyle = hi(0.5);
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 1;
      var tx = w / 9, ty = h / 11;
      ctx.beginPath();
      for (i = 1; i < 9; i++) { ctx.moveTo(i * tx, 0); ctx.lineTo(i * tx, h * 0.58); }
      for (j = 1; j < 6; j++) { ctx.moveTo(0, j * ty); ctx.lineTo(w, j * ty); }
      ctx.stroke();
      /* 几块随机深一点的瓷砖 */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.05;
      ctx.fillRect(tx * 2, ty * 2, tx, ty);
      ctx.fillRect(tx * 6, ty * 1, tx, ty);
      ctx.fillRect(tx * 4, ty * 4, tx, ty);
      ctx.globalAlpha = 1;

      /* 抽油烟机（右上梯形） */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      poly(ctx, [w * 0.60, h * 0.10, w * 0.90, h * 0.10, w * 0.86, h * 0.175, w * 0.64, h * 0.175]);
      ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.fillRect(w * 0.64, h * 0.175, w * 0.22, h * 0.035);
      ctx.globalAlpha = 1;

      /* 挂锅横杆 + 挂钩 + 锅 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(2, w * 0.005);
      seg(ctx, w * 0.06, h * 0.16, w * 0.52, h * 0.16);
      ctx.globalAlpha = 1;
      /* 平底锅 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1.2, w * 0.0028);
      seg(ctx, w * 0.14, h * 0.16, w * 0.14, h * 0.21);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = accent2;
      roundRect(ctx, w * 0.085, h * 0.21, w * 0.11, h * 0.055, w * 0.010); ctx.fill();
      ctx.globalAlpha = 0.20;
      seg(ctx, w * 0.195, h * 0.228, w * 0.30, h * 0.228);
      /* 汤锅 */
      ctx.globalAlpha = 0.22;
      seg(ctx, w * 0.30, h * 0.16, w * 0.30, h * 0.205);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = accent;
      poly(ctx, [w * 0.255, h * 0.205, w * 0.345, h * 0.205, w * 0.335, h * 0.285, w * 0.265, h * 0.285]);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      roundRect(ctx, w * 0.245, h * 0.198, w * 0.11, h * 0.012, w * 0.005); ctx.fill();
      /* 铲子/勺 */
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = accent2;
      roundRect(ctx, w * 0.42, h * 0.205, w * 0.022, h * 0.075, w * 0.008); ctx.fill();
      ctx.globalAlpha = 0.20;
      seg(ctx, w * 0.431, h * 0.16, w * 0.431, h * 0.205);
      ctx.globalAlpha = 1;

      /* 灶台（下方台面 + 两个灶眼 + 旋钮） */
      var cy = h * 0.68;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, w * 0.04, cy - h * 0.055, w * 0.62, h * 0.055, w * 0.006); ctx.fill();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, w * 0.06, cy, w * 0.58, h * 0.24, w * 0.006); ctx.fill();
      ctx.globalAlpha = 1;
      for (i = 0; i < 2; i++) {
        var bx = w * (0.17 + i * 0.27);
        ctx.strokeStyle = accent2;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = Math.max(1.6, w * 0.0036);
        circle(ctx, bx, cy - h * 0.022, w * 0.048); ctx.stroke();
        ctx.globalAlpha = 0.20;
        ctx.lineWidth = Math.max(1.2, w * 0.0026);
        circle(ctx, bx, cy - h * 0.022, w * 0.020); ctx.stroke();
        /* 架在上面的小锅 */
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.16;
        roundRect(ctx, bx - w * 0.036, cy - h * 0.075, w * 0.072, h * 0.040, w * 0.008); ctx.fill();
        ctx.globalAlpha = 0.14;
        seg(ctx, bx + w * 0.036, cy - h * 0.058, bx + w * 0.095, cy - h * 0.058);
        /* 一缕热气 */
        ctx.strokeStyle = dim;
        ctx.globalAlpha = 0.10 + 0.05 * Math.sin(tt * 0.9 + i * 1.4);
        ctx.lineWidth = Math.max(1, w * 0.002);
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.006, cy - h * 0.085);
        ctx.quadraticCurveTo(bx + w * 0.020, cy - h * 0.115, bx - w * 0.008, cy - h * 0.150);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < 3; i++) {
        ctx.fillStyle = accent2;
        ctx.globalAlpha = 0.20;
        circle(ctx, w * (0.36 + i * 0.055), cy + h * 0.16, w * 0.011); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 调料瓶（台上小瓶一排） */
      for (i = 0; i < 3; i++) {
        var px = w * (0.70 + i * 0.055);
        var ph = h * (0.075 + i * 0.012);
        ctx.fillStyle = (i === 1) ? accent2 : accent;
        ctx.globalAlpha = 0.22;
        roundRect(ctx, px, cy - h * 0.075 - ph, w * 0.030, ph, w * 0.008); ctx.fill();
        ctx.globalAlpha = 0.26;
        roundRect(ctx, px + w * 0.007, cy - h * 0.075 - ph - h * 0.018, w * 0.016, h * 0.020, w * 0.005); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 台面线 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1.4, w * 0.0032);
      seg(ctx, w * 0.04, cy, w * 0.96, cy);
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 10. 宠物客厅：沙发 + 猫爬架 + 地毯 + 玩具球 ---------- */
    'pet-living-room': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#c79bf0');
      var accent2 = col(p, 'accent2', '#ffb3c6');
      var dim = col(p, 'textDim', 'rgba(249,244,255,0.68)');
      var tt = t || 0;
      var i;
      ctx.save();

      /* 地毯（椭圆，带内圈） */
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.12;
      ellipsePath(ctx, w * 0.50, h * 0.86, w * 0.44, h * 0.10, 0); ctx.fill();
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = Math.max(1.2, w * 0.0026);
      ellipsePath(ctx, w * 0.50, h * 0.86, w * 0.36, h * 0.072, 0); ctx.stroke();
      ctx.globalAlpha = 1;

      /* 沙发（左下） */
      var sx = w * 0.06, sy = h * 0.56, sw = w * 0.40, sh = h * 0.20;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, sx, sy, sw, sh * 0.62, w * 0.016); ctx.fill();
      ctx.globalAlpha = 0.24;
      roundRect(ctx, sx, sy - sh * 0.42, sw, sh * 0.50, w * 0.016); ctx.fill();
      ctx.globalAlpha = 0.22;
      roundRect(ctx, sx - w * 0.015, sy - sh * 0.30, w * 0.055, sh * 0.92, w * 0.016); ctx.fill();
      roundRect(ctx, sx + sw - w * 0.040, sy - sh * 0.30, w * 0.055, sh * 0.92, w * 0.016); ctx.fill();
      /* 坐垫分割线 + 靠枕 */
      ctx.strokeStyle = shade(0.28);
      ctx.lineWidth = Math.max(1, w * 0.0022);
      seg(ctx, sx + sw * 0.5, sy, sx + sw * 0.5, sy + sh * 0.62);
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, sx + sw * 0.08, sy - sh * 0.30, w * 0.075, h * 0.055, w * 0.012); ctx.fill();
      roundRect(ctx, sx + sw * 0.62, sy - sh * 0.26, w * 0.075, h * 0.055, w * 0.012); ctx.fill();
      /* 沙发腿 */
      ctx.globalAlpha = 0.18;
      ctx.fillRect(sx + w * 0.02, sy + sh * 0.62, w * 0.018, h * 0.04);
      ctx.fillRect(sx + sw - w * 0.038, sy + sh * 0.62, w * 0.018, h * 0.04);
      ctx.globalAlpha = 1;

      /* 猫爬架（右侧） */
      var tx = w * 0.72, base = h * 0.90;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, tx - w * 0.075, base - h * 0.022, w * 0.15, h * 0.022, w * 0.006); ctx.fill();
      ctx.globalAlpha = 0.16;
      ctx.fillRect(tx - w * 0.012, base - h * 0.32, w * 0.024, h * 0.30);
      ctx.globalAlpha = 0.22;
      roundRect(ctx, tx - w * 0.070, base - h * 0.335, w * 0.14, h * 0.024, w * 0.006); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.fillRect(tx - w * 0.010, base - h * 0.50, w * 0.020, h * 0.17);
      /* 顶层猫窝（圆 + 洞口） */
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = accent2;
      circle(ctx, tx, base - h * 0.535, w * 0.052); ctx.fill();
      ctx.fillStyle = shade(0.40);
      circle(ctx, tx, base - h * 0.525, w * 0.024); ctx.fill();
      ctx.globalAlpha = 1;

      /* 墙上的相框（三只爪印） */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = Math.max(1.2, w * 0.0028);
      roundRect(ctx, w * 0.46, h * 0.12, w * 0.16, h * 0.16, w * 0.008); ctx.stroke();
      ctx.fillStyle = accent2;
      ctx.globalAlpha = 0.18;
      for (i = 0; i < 3; i++) {
        var fx = w * (0.505 + i * 0.045), fy = h * 0.215;
        circle(ctx, fx, fy, w * 0.011); ctx.fill();
        circle(ctx, fx - w * 0.010, fy - h * 0.024, w * 0.005); ctx.fill();
        circle(ctx, fx, fy - h * 0.030, w * 0.005); ctx.fill();
        circle(ctx, fx + w * 0.010, fy - h * 0.024, w * 0.005); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 散落的玩具球（轻微滚动） */
      for (i = 0; i < 3; i++) {
        var bxx = w * (0.20 + i * 0.22) + Math.sin(tt * 0.6 + i * 2.1) * w * 0.006;
        var byy = h * (0.905 - (i % 2) * 0.02);
        ctx.fillStyle = (i % 2 === 0) ? accent2 : accent;
        ctx.globalAlpha = 0.26;
        circle(ctx, bxx, byy, w * 0.017); ctx.fill();
        ctx.fillStyle = hi(0.6);
        ctx.globalAlpha = 0.25;
        circle(ctx, bxx - w * 0.005, byy - w * 0.005, w * 0.005); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 毛线球 + 拖出来的线 */
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = Math.max(1, w * 0.002);
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.92);
      ctx.quadraticCurveTo(w * 0.66, h * 0.86, w * 0.70, h * 0.915);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 11. 机场：落地窗 + 飞机 + 候机座椅 + 指示牌 ---------- */
    'travel-airport': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#4fd1e0');
      var accent2 = col(p, 'accent2', '#ffd166');
      var dim = col(p, 'textDim', 'rgba(238,252,255,0.66)');
      var tt = t || 0;
      var i;
      ctx.save();

      /* 大落地窗（横贯上部） */
      var wy = h * 0.10, wh = h * 0.46;
      ctx.fillStyle = shade(0.38);
      roundRect(ctx, w * 0.03, wy, w * 0.94, wh, w * 0.010); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1.4, w * 0.0032);
      roundRect(ctx, w * 0.03, wy, w * 0.94, wh, w * 0.010); ctx.stroke();
      ctx.globalAlpha = 1;
      /* 窗外的飞机剪影（机身 + 机翼 + 尾翼 + 舷窗） */
      var px0 = w * 0.44, py0 = wy + wh * 0.46;
      ctx.fillStyle = hi(0.30);
      ctx.globalAlpha = 0.22;
      ellipsePath(ctx, px0, py0, w * 0.20, h * 0.030, 0); ctx.fill();
      poly(ctx, [px0 + w * 0.02, py0 + h * 0.006, px0 - w * 0.10, py0 + h * 0.075, px0 - w * 0.05, py0 + h * 0.075, px0 + w * 0.06, py0 + h * 0.010]);
      ctx.fill();
      poly(ctx, [px0 - w * 0.16, py0 - h * 0.014, px0 - w * 0.20, py0 - h * 0.055, px0 - w * 0.14, py0 - h * 0.050, px0 - w * 0.10, py0 - h * 0.012]);
      ctx.fill();
      poly(ctx, [px0 - w * 0.13, py0 + h * 0.010, px0 - w * 0.06, py0 + h * 0.042, px0 - w * 0.01, py0 + h * 0.038, px0 - w * 0.07, py0 + h * 0.004]);
      ctx.fill();
      ctx.fillStyle = shade(0.35);
      for (i = 0; i < 6; i++) {
        circle(ctx, px0 - w * 0.14 + i * w * 0.045, py0 - h * 0.008, w * 0.005); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 跑道灯（闪烁小点） */
      for (i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 === 0 ? accent : accent2;
        ctx.globalAlpha = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(tt * 2.0 + i * 0.9));
        circle(ctx, w * (0.08 + i * 0.13), wy + wh * 0.86, w * 0.005); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 窗框竖档 */
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = Math.max(1.2, w * 0.0028);
      for (i = 1; i < 4; i++) seg(ctx, w * (0.03 + i * 0.235), wy, w * (0.03 + i * 0.235), wy + wh);
      ctx.globalAlpha = 1;

      /* 悬挂指示牌 */
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = Math.max(1, w * 0.002);
      seg(ctx, w * 0.30, wy, w * 0.30, h * 0.60);
      seg(ctx, w * 0.62, wy, w * 0.62, h * 0.60);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, w * 0.20, h * 0.60, w * 0.52, h * 0.075, w * 0.010); ctx.fill();
      /* 指示箭头 */
      ctx.fillStyle = hi(0.5);
      ctx.globalAlpha = 0.26;
      poly(ctx, [w * 0.36, h * 0.617, w * 0.36, h * 0.655, w * 0.30, h * 0.636]); ctx.fill();
      ctx.globalAlpha = 0.20;
      ctx.fillRect(w * 0.60, h * 0.622, w * 0.08, h * 0.028);
      ctx.fillRect(w * 0.44, h * 0.622, w * 0.08, h * 0.028);
      ctx.globalAlpha = 1;

      /* 候机座椅（一排四座，连排 + 扶手） */
      var sy = h * 0.78, sh = h * 0.13;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, w * 0.14, sy + sh * 0.55, w * 0.72, h * 0.030, w * 0.010); ctx.fill();
      ctx.globalAlpha = 1;
      for (i = 0; i < 4; i++) {
        var stx = w * (0.17 + i * 0.178);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.20;
        roundRect(ctx, stx, sy + sh * 0.30, w * 0.135, sh * 0.28, w * 0.010); ctx.fill();
        roundRect(ctx, stx, sy, w * 0.135, sh * 0.36, w * 0.012); ctx.fill();
        ctx.fillStyle = shade(0.25);
        ctx.globalAlpha = 0.18;
        ctx.fillRect(stx + w * 0.145, sy + sh * 0.20, w * 0.010, sh * 0.42);
      }
      ctx.globalAlpha = 1;
      /* 行李推车小剪影 */
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = Math.max(1.2, w * 0.0028);
      seg(ctx, w * 0.885, h * 0.72, w * 0.885, h * 0.90);
      seg(ctx, w * 0.885, h * 0.72, w * 0.94, h * 0.70);
      roundRect(ctx, w * 0.845, h * 0.80, w * 0.08, h * 0.05, w * 0.006);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---------- 12. 快递站：货架 + 纸箱堆 + 传送带 + 取件码牌 ---------- */
    'parcel-delivery': function (ctx, w, h, p, t) {
      var accent = col(p, 'accent', '#e8a45c');
      var accent2 = col(p, 'accent2', '#7dd3fc');
      var dim = col(p, 'textDim', 'rgba(255,246,236,0.68)');
      var tt = t || 0;
      var i, j, k;
      ctx.save();

      /* 货架（右侧三层） */
      var rx = w * 0.62, ry = h * 0.16, rw = w * 0.34, rh = h * 0.50;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1.6, w * 0.0034);
      seg(ctx, rx, ry, rx, ry + rh);
      seg(ctx, rx + rw, ry, rx + rw, ry + rh);
      for (j = 0; j <= 3; j++) {
        var ly = ry + rh * (j / 3);
        seg(ctx, rx, ly, rx + rw, ly);
        ctx.globalAlpha = 0.16;
        for (i = 0; i < 3; i++) {
          var bw2 = rw * (0.22 + ((i * 17 + j * 11) % 20) / 100);
          var bh2 = rh * 0.20;
          ctx.fillStyle = (i + j) % 2 === 0 ? accent : accent2;
          roundRect(ctx, rx + rw * (0.06 + i * 0.31), ly - bh2 - h * 0.004, bw2, bh2, w * 0.006);
          ctx.fill();
          ctx.strokeStyle = shade(0.30);
          ctx.lineWidth = Math.max(1, w * 0.0018);
          seg(ctx, rx + rw * (0.06 + i * 0.31) + bw2 * 0.5, ly - bh2 - h * 0.004, rx + rw * (0.06 + i * 0.31) + bw2 * 0.5, ly - h * 0.004);
        }
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.6, w * 0.0034);
      }
      ctx.globalAlpha = 1;

      /* 墙上的取件码牌子 */
      ctx.fillStyle = shade(0.30);
      roundRect(ctx, w * 0.06, h * 0.12, w * 0.24, h * 0.16, w * 0.010); ctx.fill();
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.2, w * 0.003);
      roundRect(ctx, w * 0.06, h * 0.12, w * 0.24, h * 0.16, w * 0.010); ctx.stroke();
      ctx.globalAlpha = 1;
      /* 牌子上的“数字”方块（三格） */
      for (i = 0; i < 3; i++) {
        ctx.fillStyle = (i === 1) ? accent2 : accent;
        ctx.globalAlpha = 0.20 + 0.10 * Math.sin(tt * 1.8 + i * 1.5);
        roundRect(ctx, w * (0.085 + i * 0.070), h * 0.155, w * 0.052, h * 0.075, w * 0.006); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 纸箱堆（左侧地上） */
      var stacks = [[0.08, 0.070, 0.062], [0.165, 0.062, 0.055], [0.24, 0.078, 0.068]];
      for (i = 0; i < stacks.length; i++) {
        var gx = w * stacks[i][0], gw = w * stacks[i][1], gh = h * stacks[i][2];
        var gy = h * 0.90;
        for (j = 0; j < (i === 1 ? 3 : 2); j++) {
          ctx.fillStyle = (j % 2 === 0) ? accent : accent2;
          ctx.globalAlpha = 0.16 + (j === 0 ? 0.04 : 0);
          roundRect(ctx, gx - gw / 2, gy - gh * (j + 1) - h * 0.006 * j, gw, gh, w * 0.006); ctx.fill();
          ctx.strokeStyle = shade(0.28);
          ctx.globalAlpha = 0.22;
          ctx.lineWidth = Math.max(1, w * 0.0018);
          seg(ctx, gx - gw / 2, gy - gh * (j + 0.5) - h * 0.006 * j, gx, gy - gh * (j + 0.5) - h * 0.006 * j);
          seg(ctx, gx, gy - gh * (j + 1) - h * 0.006 * j, gx, gy - gh * j - h * 0.006 * j);
        }
      }
      ctx.globalAlpha = 1;

      /* 传送带（下方横贯） */
      var cyB = h * 0.90;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.16;
      roundRect(ctx, w * 0.30, cyB, w * 0.68, h * 0.055, w * 0.008); ctx.fill();
      /* 滚筒 */
      ctx.fillStyle = accent2;
      for (i = 0; i < 9; i++) {
        ctx.globalAlpha = 0.20;
        circle(ctx, w * (0.325 + i * 0.078), cyB + h * 0.0275, w * 0.010); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 传送带上移动的箱子 */
      for (i = 0; i < 3; i++) {
        var progB = (tt * 0.06 + i / 3) % 1;
        var mbx = w * (0.31 + progB * 0.63);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.26;
        roundRect(ctx, mbx, cyB - h * 0.062, w * 0.062, h * 0.062, w * 0.006); ctx.fill();
        ctx.strokeStyle = shade(0.30);
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = Math.max(1, w * 0.0018);
        seg(ctx, mbx, cyB - h * 0.030, mbx + w * 0.062, cyB - h * 0.030);
        seg(ctx, mbx + w * 0.031, cyB - h * 0.062, mbx + w * 0.031, cyB);
      }
      ctx.globalAlpha = 1;

      /* 吊牌小灯 */
      for (k = 0; k < 2; k++) {
        var lx2 = w * (0.40 + k * 0.26);
        ctx.fillStyle = accent2;
        ctx.globalAlpha = 0.20 + 0.08 * Math.sin(tt * 1.5 + k);
        circle(ctx, lx2, h * 0.05, w * 0.014); ctx.fill();
        ctx.strokeStyle = dim;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = Math.max(1, w * 0.0018);
        seg(ctx, lx2, 0, lx2, h * 0.045);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };

  /*__PART4__*/
  /* ============ 新图案绘制 ============
   * 签名：function(ctx, size, palette)
   *   size: 半径（图案应以 (0,0) 为中心，尺寸约在 ±size*1.2 内）
   * 调用方已做 translate/scale/shadow，这里只画形状。
   * 图案用鲜艳实色，保证与低对比度的背景区分开、一眼能认出。
   */
  var OBSTACLE_ART = {
    /* 手机：亮着的屏幕 + 停不下来的消息 */
    'phone': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(-0.12);
      /* 机身 */
      ctx.fillStyle = '#2b3049';
      roundRect(ctx, -s * 0.62, -s * 1.05, s * 1.24, s * 2.10, s * 0.22); ctx.fill();
      ctx.strokeStyle = '#454c6e';
      ctx.lineWidth = s * 0.06;
      roundRect(ctx, -s * 0.62, -s * 1.05, s * 1.24, s * 2.10, s * 0.22); ctx.stroke();
      /* 屏幕 */
      var gl = lgrad(ctx, 0, -s * 0.95, 0, s * 0.95, '#cfe0ff', '#8fa4ff');
      ctx.fillStyle = gl;
      roundRect(ctx, -s * 0.50, -s * 0.93, s * 1.00, s * 1.86, s * 0.12); ctx.fill();
      /* 刘海 */
      ctx.fillStyle = '#2b3049';
      roundRect(ctx, -s * 0.20, -s * 0.93, s * 0.40, s * 0.14, s * 0.06); ctx.fill();
      /* 消息气泡 */
      ctx.fillStyle = '#5f78e0';
      roundRect(ctx, -s * 0.36, -s * 0.62, s * 0.58, s * 0.26, s * 0.13); ctx.fill();
      ctx.fillStyle = '#7d93f0';
      roundRect(ctx, -s * 0.24, -s * 0.26, s * 0.60, s * 0.26, s * 0.13); ctx.fill();
      ctx.fillStyle = '#ff8a7a';
      roundRect(ctx, -s * 0.36, s * 0.10, s * 0.68, s * 0.26, s * 0.13); ctx.fill();
      ctx.fillStyle = '#9db0ff';
      roundRect(ctx, -s * 0.36, s * 0.46, s * 0.44, s * 0.24, s * 0.12); ctx.fill();
      /* 消息红点 */
      ctx.fillStyle = '#ff5a6e';
      circle(ctx, s * 0.40, -s * 0.66, s * 0.22); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, s * 0.40, -s * 0.66, s * 0.09); ctx.fill();
      /* 底部横条 */
      ctx.fillStyle = 'rgba(43,48,73,0.55)';
      roundRect(ctx, -s * 0.22, s * 0.78, s * 0.44, s * 0.08, s * 0.04); ctx.fill();
      ctx.restore();
    },

    /* 水杯：倾斜、水面晃出来 */
    'water-glass': function (ctx, size, p) {
      var s = size;
      ctx.save();
      /* 桌面边缘 */
      ctx.strokeStyle = '#8b93a7';
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      seg(ctx, -s * 1.05, s * 0.92, s * 1.05, s * 0.98);
      ctx.rotate(-0.30);
      /* 杯体 */
      ctx.fillStyle = 'rgba(226,242,255,0.42)';
      poly(ctx, [-s * 0.52, -s * 0.78, s * 0.52, -s * 0.78, s * 0.36, s * 0.86, -s * 0.36, s * 0.86]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.07;
      poly(ctx, [-s * 0.52, -s * 0.78, s * 0.52, -s * 0.78, s * 0.36, s * 0.86, -s * 0.36, s * 0.86]);
      ctx.stroke();
      /* 水 */
      ctx.fillStyle = 'rgba(127,209,255,0.92)';
      poly(ctx, [-s * 0.46, -s * 0.30, s * 0.46, -s * 0.30, s * 0.33, s * 0.80, -s * 0.33, s * 0.80]);
      ctx.fill();
      /* 玻璃高光 */
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = s * 0.08;
      seg(ctx, -s * 0.34, -s * 0.60, -s * 0.26, s * 0.34);
      ctx.restore();
      /* 洒出来的水 */
      ctx.fillStyle = 'rgba(127,209,255,0.80)';
      ellipsePath(ctx, s * 0.72, s * 0.95, s * 0.38, s * 0.16, 0.08); ctx.fill();
      ctx.fillStyle = 'rgba(127,209,255,0.65)';
      ellipsePath(ctx, -s * 0.70, s * 0.86, s * 0.24, s * 0.11, -0.10); ctx.fill();
      /* 溅起的小水珠 */
      ctx.fillStyle = 'rgba(180,230,255,0.9)';
      circle(ctx, s * 0.30, s * 0.52, s * 0.07); ctx.fill();
      circle(ctx, s * 0.46, s * 0.40, s * 0.05); ctx.fill();
      circle(ctx, -s * 0.30, s * 0.56, s * 0.06); ctx.fill();
      ctx.restore();
    },

    /* 红笔：批改 / 打回 */
    'red-pen': function (ctx, size, p) {
      var s = size;
      ctx.save();
      /* 打回的叉与圈 */
      ctx.strokeStyle = '#ff5a6e';
      ctx.lineWidth = s * 0.13;
      ctx.lineCap = 'round';
      seg(ctx, -s * 1.00, -s * 0.86, -s * 0.52, -s * 0.34);
      seg(ctx, -s * 0.52, -s * 0.86, -s * 1.00, -s * 0.34);
      ctx.beginPath();
      ctx.arc(-s * 0.62, s * 0.34, s * 0.38, -0.3, 4.2);
      ctx.stroke();
      /* 笔身 */
      ctx.save();
      ctx.rotate(0.55);
      ctx.translate(s * 0.30, -s * 0.05);
      ctx.fillStyle = '#e63946';
      roundRect(ctx, -s * 0.15, -s * 1.02, s * 0.30, s * 1.46, s * 0.10); ctx.fill();
      /* 笔帽环 + 笔夹 */
      ctx.fillStyle = '#b8202f';
      roundRect(ctx, -s * 0.15, -s * 0.40, s * 0.30, s * 0.14, s * 0.05); ctx.fill();
      ctx.fillStyle = '#f26b76';
      roundRect(ctx, -s * 0.22, -s * 1.02, s * 0.10, s * 0.52, s * 0.05); ctx.fill();
      /* 握胶 */
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      roundRect(ctx, -s * 0.15, s * 0.10, s * 0.30, s * 0.34, s * 0.08); ctx.fill();
      /* 笔尖 */
      ctx.fillStyle = '#7d1622';
      poly(ctx, [-s * 0.15, s * 0.44, s * 0.15, s * 0.44, s * 0.05, s * 0.96, -s * 0.05, s * 0.96]);
      ctx.fill();
      ctx.fillStyle = '#3c0a10';
      poly(ctx, [-s * 0.05, s * 0.74, s * 0.05, s * 0.74, s * 0.02, s * 0.96, -s * 0.02, s * 0.96]);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    },

    /* 排队围栏：两根柱子 + 垂下来的隔离带 */
    'queue-rope': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 隔离带（下垂弧线） */
      ctx.strokeStyle = '#e0533f';
      ctx.lineWidth = s * 0.20;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.78, -s * 0.52);
      ctx.quadraticCurveTo(0, s * 0.10, s * 0.78, -s * 0.52);
      ctx.stroke();
      /* 带上的白条纹（沿弧线分布） */
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.07;
      for (i = 0; i < 5; i++) {
        var q = (i + 0.5) / 5;
        var bx = (1 - q) * (1 - q) * (-s * 0.78) + q * q * (s * 0.78);
        var by = (1 - q) * (1 - q) * (-s * 0.52) + 2 * (1 - q) * q * (s * 0.10) + q * q * (-s * 0.52);
        seg(ctx, bx - s * 0.02, by - s * 0.13, bx + s * 0.02, by + s * 0.13);
      }
      ctx.restore();
      ctx.save();
      for (i = 0; i < 2; i++) {
        var sx = (i === 0 ? -1 : 1) * s * 0.78;
        /* 柱身 */
        ctx.fillStyle = '#c9ced9';
        roundRect(ctx, sx - s * 0.075, -s * 0.60, s * 0.15, s * 1.42, s * 0.07); ctx.fill();
        /* 高光 */
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        roundRect(ctx, sx - s * 0.055, -s * 0.54, s * 0.05, s * 1.24, s * 0.025); ctx.fill();
        /* 顶盖 */
        ctx.fillStyle = '#98a0b3';
        circle(ctx, sx, -s * 0.62, s * 0.15); ctx.fill();
        /* 底座 */
        ctx.fillStyle = '#98a0b3';
        ellipsePath(ctx, sx, s * 0.84, s * 0.28, s * 0.13, 0); ctx.fill();
        ctx.fillStyle = '#6f7789';
        ellipsePath(ctx, sx, s * 0.80, s * 0.24, s * 0.10, 0); ctx.fill();
      }
      ctx.restore();
    },

    /* 没洗的碗碟：一摞脏盘子 + 碗 + 泡泡 */
    'dirty-dish': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 最下面的盘子 */
      ctx.fillStyle = '#dfe6f2';
      ellipsePath(ctx, 0, s * 0.62, s * 1.00, s * 0.26, 0); ctx.fill();
      ctx.fillStyle = '#b9c3d6';
      ellipsePath(ctx, 0, s * 0.68, s * 0.72, s * 0.17, 0); ctx.fill();
      /* 中间两只盘子（斜一点） */
      ctx.fillStyle = '#e9eefa';
      ctx.save(); ctx.rotate(-0.10);
      ellipsePath(ctx, -s * 0.05, s * 0.28, s * 0.94, s * 0.24, 0); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#cfd8ea';
      ctx.save(); ctx.rotate(0.08);
      ellipsePath(ctx, s * 0.04, -s * 0.02, s * 0.86, s * 0.22, 0); ctx.fill();
      ctx.restore();
      /* 碗 */
      ctx.fillStyle = '#f2f6ff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, -s * 0.28);
      ctx.quadraticCurveTo(-s * 0.58, s * 0.36, 0, s * 0.36);
      ctx.quadraticCurveTo(s * 0.58, s * 0.36, s * 0.62, -s * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8d2e6';
      ellipsePath(ctx, 0, -s * 0.28, s * 0.62, s * 0.17, 0); ctx.fill();
      ctx.fillStyle = '#9aa5bd';
      ellipsePath(ctx, 0, -s * 0.28, s * 0.50, s * 0.12, 0); ctx.fill();
      /* 油污 / 残渣 */
      ctx.fillStyle = 'rgba(150,110,60,0.65)';
      ellipsePath(ctx, -s * 0.34, s * 0.52, s * 0.24, s * 0.09, 0.2); ctx.fill();
      ellipsePath(ctx, s * 0.30, s * 0.18, s * 0.20, s * 0.08, -0.3); ctx.fill();
      ctx.fillStyle = 'rgba(120,140,90,0.55)';
      ellipsePath(ctx, s * 0.12, -s * 0.06, s * 0.16, s * 0.07, 0.4); ctx.fill();
      /* 泡泡 */
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = s * 0.05;
      for (i = 0; i < 3; i++) {
        circle(ctx, -s * 0.42 + i * s * 0.42, -s * 0.86 - (i % 2) * s * 0.20, s * (0.15 + (i % 2) * 0.06));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      circle(ctx, -s * 0.44, -s * 0.90, s * 0.06); ctx.fill();
      ctx.restore();
    },

    /* 价签：吊牌 + 涨价箭头 */
    'price-tag': function (ctx, size, p) {
      var s = size;
      ctx.save();
      /* 吊绳 */
      ctx.strokeStyle = '#cfd6e6';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(-s * 0.86, -s * 0.92);
      ctx.quadraticCurveTo(-s * 0.72, -s * 0.60, -s * 0.56, -s * 0.52);
      ctx.stroke();
      /* 吊牌本体 */
      ctx.save();
      ctx.rotate(-0.18);
      ctx.fillStyle = '#ff5a6e';
      poly(ctx, [-s * 0.66, -s * 0.72, s * 0.60, -s * 0.72, s * 0.82, s * 0.06, s * 0.60, s * 0.78, -s * 0.66, s * 0.78, -s * 0.86, s * 0.04]);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      poly(ctx, [-s * 0.66, s * 0.40, s * 0.60, s * 0.42, s * 0.60, s * 0.78, -s * 0.66, s * 0.78, -s * 0.86, s * 0.04]);
      ctx.fill();
      /* 穿绳孔 */
      ctx.fillStyle = '#ffe3e7';
      circle(ctx, -s * 0.60, -s * 0.46, s * 0.12); ctx.fill();
      ctx.fillStyle = '#c93f52';
      circle(ctx, -s * 0.60, -s * 0.46, s * 0.06); ctx.fill();
      /* 涨价箭头 */
      ctx.strokeStyle = '#fff2f4';
      ctx.lineWidth = s * 0.13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, s * 0.30);
      ctx.lineTo(-s * 0.30, -s * 0.16);
      ctx.lineTo(s * 0.14, s * 0.26);
      ctx.lineTo(s * 0.14, -s * 0.30);
      ctx.stroke();
      ctx.fillStyle = '#fff2f4';
      poly(ctx, [s * 0.14, -s * 0.52, s * 0.44, -s * 0.22, s * 0.14, -s * 0.10]);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    },

    /* 堵车车流：三辆车排成长龙 + 刹车灯 */
    'traffic-jam': function (ctx, size, p) {
      var s = size;
      var i;
      var car = function (cx, cy, sc, body, win) {
        ctx.fillStyle = body;
        roundRect(ctx, cx - s * 0.74 * sc, cy - s * 0.20 * sc, s * 1.48 * sc, s * 0.40 * sc, s * 0.12 * sc); ctx.fill();
        roundRect(ctx, cx - s * 0.42 * sc, cy - s * 0.46 * sc, s * 0.84 * sc, s * 0.30 * sc, s * 0.10 * sc); ctx.fill();
        ctx.fillStyle = win;
        roundRect(ctx, cx - s * 0.34 * sc, cy - s * 0.41 * sc, s * 0.30 * sc, s * 0.20 * sc, s * 0.05 * sc); ctx.fill();
        roundRect(ctx, cx + s * 0.04 * sc, cy - s * 0.41 * sc, s * 0.30 * sc, s * 0.20 * sc, s * 0.05 * sc); ctx.fill();
        /* 轮子 */
        ctx.fillStyle = '#22263a';
        circle(ctx, cx - s * 0.44 * sc, cy + s * 0.20 * sc, s * 0.14 * sc); ctx.fill();
        circle(ctx, cx + s * 0.44 * sc, cy + s * 0.20 * sc, s * 0.14 * sc); ctx.fill();
        /* 刹车灯 */
        ctx.fillStyle = '#ff4d4d';
        circle(ctx, cx - s * 0.62 * sc, cy - s * 0.02 * sc, s * 0.08 * sc); ctx.fill();
        circle(ctx, cx + s * 0.62 * sc, cy - s * 0.02 * sc, s * 0.08 * sc); ctx.fill();
      };
      ctx.save();
      /* 路面 */
      ctx.fillStyle = 'rgba(26,28,44,0.92)';
      roundRect(ctx, -s * 1.15, s * 0.42, s * 2.30, s * 0.62, s * 0.10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s * 0.06;
      ctx.setLineDash([s * 0.20, s * 0.16]);
      seg(ctx, -s * 1.05, s * 0.74, s * 1.05, s * 0.74);
      ctx.setLineDash([]);
      /* 远处两辆小车 */
      car(-s * 0.52, -s * 0.54, 0.55, '#5eb3f0', '#dff0ff');
      car(s * 0.50, -s * 0.46, 0.50, '#ffd166', '#fff6de');
      /* 近处一辆 */
      car(0, s * 0.16, 0.95, '#e63946', '#ffe2e5');
      /* 尾气 / 催促 */
      ctx.strokeStyle = 'rgba(200,210,230,0.75)';
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        circle(ctx, -s * 0.90 + i * s * 0.06, s * 0.30 - i * s * 0.14, s * 0.10); ctx.stroke();
      }
      ctx.restore();
    },

    /* 杠铃片：压垮 */
    'weight-plate': function (ctx, size, p) {
      var s = size;
      var plate = function (cx, cy, r, rot) {
        var k, a;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot || 0);
        /* 外圈金属 */
        ctx.fillStyle = '#7a8399';
        circle(ctx, 0, 0, r); ctx.fill();
        /* 橡胶盘面 */
        ctx.fillStyle = '#2f3646';
        circle(ctx, 0, 0, r * 0.90); ctx.fill();
        /* 抓孔纹理（一圈短刻线） */
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth = Math.max(1, r * 0.07);
        for (k = 0; k < 10; k++) {
          a = (k / 10) * Math.PI * 2;
          seg(ctx, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
        }
        /* 铬环 */
        ctx.strokeStyle = '#cfd7e6';
        ctx.lineWidth = r * 0.13;
        circle(ctx, 0, 0, r * 0.62); ctx.stroke();
        /* 内盘 */
        ctx.fillStyle = '#8f98ad';
        circle(ctx, 0, 0, r * 0.40); ctx.fill();
        /* 中心孔 */
        ctx.fillStyle = '#14171f';
        circle(ctx, 0, 0, r * 0.24); ctx.fill();
        /* 高光 */
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = r * 0.09;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.50, Math.PI * 1.02, Math.PI * 1.58);
        ctx.stroke();
        ctx.restore();
      };
      ctx.save();
      /* 地上的裂缝 */
      ctx.strokeStyle = 'rgba(255,90,110,0.85)';
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      seg(ctx, -s * 0.95, s * 0.96, -s * 0.55, s * 0.88);
      seg(ctx, -s * 0.55, s * 0.88, -s * 0.30, s * 1.02);
      seg(ctx, s * 0.28, s * 1.00, s * 0.58, s * 0.90);
      seg(ctx, s * 0.58, s * 0.90, s * 0.95, s * 0.98);
      /* 主片 */
      plate(0, s * 0.22, s * 0.74, 0);
      /* 斜靠的第二片 */
      plate(s * 0.76, -s * 0.34, s * 0.44, 0.45);
      /* 撞击线 */
      ctx.strokeStyle = 'rgba(207,215,230,0.95)';
      ctx.lineWidth = s * 0.10;
      seg(ctx, -s * 0.86, -s * 0.62, -s * 1.04, -s * 0.86);
      seg(ctx, -s * 0.60, -s * 0.84, -s * 0.64, -s * 1.10);
      seg(ctx, -s * 0.24, -s * 0.78, -s * 0.16, -s * 1.02);
      ctx.restore();
    },

    /* 考卷难题：卷面上的问号 */
    'exam-question': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(0.10);
      /* 卷面 */
      ctx.fillStyle = '#fbf7ee';
      roundRect(ctx, -s * 0.78, -s * 1.02, s * 1.56, s * 2.04, s * 0.10); ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,150,0.35)';
      ctx.lineWidth = s * 0.04;
      roundRect(ctx, -s * 0.78, -s * 1.02, s * 1.56, s * 2.04, s * 0.10); ctx.stroke();
      /* 折角 */
      ctx.fillStyle = '#d8d2c4';
      poly(ctx, [s * 0.30, -s * 1.02, s * 0.78, -s * 1.02, s * 0.78, -s * 0.54]);
      ctx.fill();
      /* 题干行 */
      ctx.strokeStyle = '#9aa4bb';
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        seg(ctx, -s * 0.58, -s * 0.74 + i * s * 0.22, s * (0.06 + ((i * 13) % 30) / 100), -s * 0.74 + i * s * 0.22);
      }
      /* 大大的问号 */
      ctx.strokeStyle = '#ff5a6e';
      ctx.lineWidth = s * 0.19;
      ctx.beginPath();
      ctx.arc(-s * 0.04, s * 0.16, s * 0.33, Math.PI * 0.95, Math.PI * 2.30);
      ctx.stroke();
      seg(ctx, s * 0.24, s * 0.30, s * 0.10, s * 0.56);
      ctx.fillStyle = '#ff5a6e';
      circle(ctx, 0.02 * s, s * 0.84, s * 0.14); ctx.fill();
      /* 红圈 + 叉（批注） */
      ctx.strokeStyle = '#ff5a6e';
      ctx.lineWidth = s * 0.07;
      circle(ctx, -s * 0.46, s * 0.64, s * 0.18); ctx.stroke();
      seg(ctx, s * 0.42, s * 0.60, s * 0.68, s * 0.84);
      seg(ctx, s * 0.68, s * 0.60, s * 0.42, s * 0.84);
      ctx.restore();
    },

    /* 烧糊的锅：黑锅底 + 冒黑烟 */
    'scorched-pan': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 冒烟 */
      ctx.strokeStyle = 'rgba(180,186,200,0.75)';
      ctx.lineWidth = s * 0.11;
      ctx.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.30 + i * s * 0.30, -s * 0.80);
        ctx.quadraticCurveTo(-s * 0.14 + i * s * 0.30, -s * 1.06, -s * 0.30 + i * s * 0.30, -s * 1.30);
        ctx.stroke();
      }
      /* 手柄 */
      ctx.strokeStyle = '#8b5e3c';
      ctx.lineWidth = s * 0.24;
      seg(ctx, s * 0.60, s * 0.06, s * 1.12, -s * 0.30);
      ctx.fillStyle = '#5c3d26';
      roundRect(ctx, s * 0.92, -s * 0.50, s * 0.24, s * 0.26, s * 0.08); ctx.fill();
      /* 锅身 */
      ctx.fillStyle = '#4a4f60';
      circle(ctx, 0, s * 0.10, s * 0.86); ctx.fill();
      ctx.strokeStyle = '#6d7488';
      ctx.lineWidth = s * 0.10;
      circle(ctx, 0, s * 0.10, s * 0.80); ctx.stroke();
      /* 焦黑内胆 */
      ctx.fillStyle = '#1d2029';
      circle(ctx, 0, s * 0.10, s * 0.62); ctx.fill();
      /* 糊掉的残渣 */
      ctx.fillStyle = '#4a3220';
      circle(ctx, -s * 0.20, s * 0.02, s * 0.17); ctx.fill();
      circle(ctx, s * 0.16, s * 0.22, s * 0.14); ctx.fill();
      circle(ctx, -s * 0.02, s * 0.36, s * 0.12); ctx.fill();
      ctx.fillStyle = '#6b4a2c';
      circle(ctx, s * 0.28, -s * 0.10, s * 0.10); ctx.fill();
      circle(ctx, -s * 0.34, s * 0.28, s * 0.09); ctx.fill();
      /* 焦痕反光 */
      ctx.strokeStyle = 'rgba(255,120,60,0.65)';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.arc(0, s * 0.10, s * 0.52, Math.PI * 1.05, Math.PI * 1.55);
      ctx.stroke();
      ctx.restore();
    },

    /* 纸箱堆：堆起来的快递箱 */
    'cardboard-box': function (ctx, size, p) {
      var s = size;
      var box = function (cx, cy, w, h, colr, dark) {
        /* 顶面 */
        ctx.fillStyle = dark;
        poly(ctx, [cx - w / 2, cy - h / 2, cx - w / 2 + w * 0.16, cy - h / 2 - h * 0.24,
          cx + w / 2 + w * 0.16, cy - h / 2 - h * 0.24, cx + w / 2, cy - h / 2]);
        ctx.fill();
        /* 正面 */
        ctx.fillStyle = colr;
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.06); ctx.fill();
        /* 侧面 */
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        poly(ctx, [cx + w / 2, cy - h / 2, cx + w / 2 + w * 0.16, cy - h / 2 - h * 0.24,
          cx + w / 2 + w * 0.16, cy + h / 2 - h * 0.24, cx + w / 2, cy + h / 2]);
        ctx.fill();
        /* 胶带 */
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(cx - w * 0.06, cy - h / 2, w * 0.12, h);
        /* 封口线 */
        ctx.strokeStyle = 'rgba(90,60,30,0.5)';
        ctx.lineWidth = Math.max(1, w * 0.03);
        seg(ctx, cx - w / 2, cy - h * 0.1, cx + w / 2, cy - h * 0.1);
      };
      ctx.save();
      box(-s * 0.30, s * 0.52, s * 1.50, s * 0.86, '#c98d4e', '#a9743c');
      box(s * 0.36, s * 0.12, s * 1.14, s * 0.66, '#d9a05f', '#b8863f');
      box(-s * 0.14, -s * 0.52, s * 0.94, s * 0.56, '#e3b171', '#c08f45');
      /* 贴着的小标签 */
      ctx.fillStyle = '#fdf7ec';
      roundRect(ctx, -s * 0.72, s * 0.30, s * 0.42, s * 0.30, s * 0.05); ctx.fill();
      ctx.fillStyle = '#8a94ad';
      for (var i = 0; i < 3; i++) ctx.fillRect(-s * 0.66 + i * s * 0.12, s * 0.38, s * 0.06, s * 0.14);
      ctx.restore();
    },

    /* 气流颠簸：飞机 + 抖动气流线 */
    'turbulence': function (ctx, size, p) {
      var s = size;
      var i, j;
      ctx.save();
      /* 气流波浪线 */
      ctx.strokeStyle = 'rgba(255,209,102,0.95)';
      ctx.lineWidth = s * 0.10;
      ctx.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        var yy = -s * 0.86 + i * s * 0.86;
        ctx.beginPath();
        for (j = 0; j <= 6; j++) {
          var xx = -s * 1.06 + j * (s * 2.12 / 6);
          var wvy = yy + Math.sin(j * 1.1 + i) * s * 0.14;
          if (j === 0) ctx.moveTo(xx, wvy); else ctx.lineTo(xx, wvy);
        }
        ctx.stroke();
      }
      /* 机身 */
      ctx.save();
      ctx.rotate(-0.16);
      ctx.fillStyle = '#e8f1ff';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.86, s * 0.24, 0, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      /* 机头 */
      ctx.fillStyle = '#c8d9f5';
      poly(ctx, [s * 0.62, -s * 0.18, s * 0.98, 0, s * 0.62, s * 0.18]);
      ctx.fill();
      /* 尾翼 */
      ctx.fillStyle = '#7fb2ff';
      poly(ctx, [-s * 0.86, -s * 0.06, -s * 1.02, -s * 0.56, -s * 0.52, -s * 0.10]);
      ctx.fill();
      /* 机翼 */
      ctx.fillStyle = '#9fc4ff';
      poly(ctx, [-s * 0.10, s * 0.10, s * 0.16, s * 0.62, s * 0.44, s * 0.56, s * 0.28, s * 0.08]);
      ctx.fill();
      poly(ctx, [-s * 0.10, -s * 0.10, -s * 0.34, -s * 0.52, -s * 0.62, -s * 0.44, -s * 0.34, -s * 0.08]);
      ctx.fill();
      /* 舷窗 */
      ctx.fillStyle = 'rgba(60,90,150,0.7)';
      for (i = 0; i < 5; i++) circle(ctx, -s * 0.50 + i * s * 0.24, -s * 0.02, s * 0.06), ctx.fill();
      ctx.restore();
      /* 抖动弧线 */
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath(); ctx.arc(-s * 0.10, 0, s * 0.94, -0.55, -0.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.10, 0, s * 0.94, 0.15, 0.55); ctx.stroke();
      /* 警示小三角 */
      ctx.fillStyle = '#ff5a6e';
      poly(ctx, [s * 0.86, -s * 0.98, s * 1.06, -s * 0.62, s * 0.66, -s * 0.62]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      roundRect(ctx, s * 0.83, -s * 0.90, s * 0.06, s * 0.16, s * 0.02); ctx.fill();
      circle(ctx, s * 0.86, -s * 0.69, s * 0.035); ctx.fill();
      ctx.restore();
    },

    /* 炸鸡：金黄脆皮鸡腿 */
    'fried-chicken': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(-0.30);
      /* 骨头 */
      ctx.fillStyle = '#f7f2e4';
      roundRect(ctx, -s * 0.92, -s * 0.94, s * 0.86, s * 0.24, s * 0.12); ctx.fill();
      circle(ctx, -s * 0.94, -s * 0.94, s * 0.14); ctx.fill();
      circle(ctx, -s * 0.92, -s * 0.70, s * 0.13); ctx.fill();
      ctx.fillStyle = 'rgba(120,110,90,0.35)';
      circle(ctx, -s * 0.62, -s * 0.82, s * 0.13); ctx.fill();
      /* 鸡腿肉 */
      ctx.fillStyle = '#c98433';
      ctx.beginPath();
      ctx.ellipse(s * 0.18, s * 0.16, s * 0.80, s * 0.70, -0.15, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0a03c';
      ctx.beginPath();
      ctx.ellipse(s * 0.14, s * 0.10, s * 0.72, s * 0.62, -0.15, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.ellipse(s * 0.08, s * 0.02, s * 0.52, s * 0.44, -0.15, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      /* 脆皮颗粒 */
      ctx.fillStyle = 'rgba(255,236,180,0.95)';
      var dots = [[-0.18, -0.16], [0.10, -0.30], [0.34, -0.04], [0.50, 0.24], [0.16, 0.36],
        [-0.24, 0.22], [-0.34, -0.02], [0.02, 0.50], [0.30, 0.44]];
      for (i = 0; i < dots.length; i++) {
        circle(ctx, s * dots[i][0], s * dots[i][1], s * (0.05 + (i % 3) * 0.02));
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(160,105,40,0.65)';
      var dark = [[-0.30, 0.06], [0.22, 0.24], [0.44, -0.20], [-0.06, -0.30], [0.06, 0.44]];
      for (i = 0; i < dark.length; i++) {
        circle(ctx, s * dark[i][0], s * dark[i][1], s * (0.04 + (i % 2) * 0.02));
        ctx.fill();
      }
      /* 油光 */
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(s * 0.06, 0, s * 0.46, Math.PI * 1.05, Math.PI * 1.45);
      ctx.stroke();
      ctx.restore();
    },
  };

  /*__PART5__*/
  var COLLECTIBLE_ART = {
    /* 被子：赖床续命 */
    'blanket': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 被体（更厚的鼓包形状） */
      ctx.fillStyle = '#6aa8eb';
      ctx.beginPath();
      ctx.moveTo(-s * 0.98, -s * 0.26);
      ctx.quadraticCurveTo(-s * 0.40, -s * 0.72, s * 0.20, -s * 0.62);
      ctx.quadraticCurveTo(s * 0.78, -s * 0.54, s * 0.98, -s * 0.16);
      ctx.lineTo(s * 0.98, s * 0.62);
      ctx.quadraticCurveTo(s * 0.20, s * 0.92, -s * 0.98, s * 0.82);
      ctx.closePath(); ctx.fill();
      /* 上缘翻边（亮色厚边） */
      ctx.fillStyle = '#dbeaff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.98, -s * 0.26);
      ctx.quadraticCurveTo(-s * 0.40, -s * 0.72, s * 0.20, -s * 0.62);
      ctx.quadraticCurveTo(s * 0.78, -s * 0.54, s * 0.98, -s * 0.16);
      ctx.lineTo(s * 0.96, s * 0.08);
      ctx.quadraticCurveTo(s * 0.20, -s * 0.22, -s * 0.96, s * 0.08);
      ctx.closePath(); ctx.fill();
      /* 侧边厚度（暗面） */
      ctx.fillStyle = 'rgba(30,60,120,0.35)';
      poly(ctx, [s * 0.62, s * 0.62, s * 0.98, s * 0.62, s * 0.98, s * 0.06, s * 0.80, s * 0.10]);
      ctx.fill();
      /* 格纹 */
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s * 0.075;
      for (i = 0; i < 3; i++) {
        seg(ctx, -s * 0.70 + i * s * 0.58, s * 0.14, -s * 0.56 + i * s * 0.58, s * 0.78);
      }
      for (i = 0; i < 2; i++) {
        seg(ctx, -s * 0.92, s * (0.34 + i * 0.30), s * 0.94, s * (0.20 + i * 0.30));
      }
      /* 褶皱 */
      ctx.strokeStyle = 'rgba(30,60,120,0.5)';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(-s * 0.86, s * 0.70);
      ctx.quadraticCurveTo(-s * 0.10, s * 0.46, s * 0.88, s * 0.54);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.60, -s * 0.06);
      ctx.quadraticCurveTo(-s * 0.30, s * 0.10, -s * 0.02, -s * 0.02);
      ctx.stroke();
      /* zzz（赖床） */
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = s * 0.08;
      zGlyph(ctx, s * 0.34, -s * 1.14, s * 0.20);
      zGlyph(ctx, s * 0.62, -s * 1.34, s * 0.15);
      ctx.restore();
    },

    /* 充电线：给手机续命 */
    'phone-charger': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 线（绕两圈） */
      ctx.strokeStyle = '#f2f4fa';
      ctx.lineWidth = s * 0.20;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 1.00, -s * 0.34);
      ctx.bezierCurveTo(s * 0.20, -s * 1.00, -s * 0.90, -s * 0.86, -s * 0.86, -s * 0.08);
      ctx.bezierCurveTo(-s * 0.82, s * 0.66, s * 0.24, s * 0.62, s * 0.44, s * 0.20);
      ctx.bezierCurveTo(s * 0.62, -s * 0.18, s * 0.10, -s * 0.36, -s * 0.16, -s * 0.12);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,130,160,0.45)';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(s * 0.98, -s * 0.40);
      ctx.bezierCurveTo(s * 0.20, -s * 1.06, -s * 0.96, -s * 0.90, -s * 0.92, -s * 0.06);
      ctx.stroke();
      /* 插头（金属 USB 头） */
      ctx.save();
      ctx.rotate(-0.32);
      ctx.fillStyle = '#c9cfdd';
      roundRect(ctx, s * 0.74, -s * 0.60, s * 0.44, s * 0.30, s * 0.06); ctx.fill();
      ctx.fillStyle = '#8b93a7';
      roundRect(ctx, s * 1.06, -s * 0.54, s * 0.16, s * 0.18, s * 0.04); ctx.fill();
      ctx.fillStyle = '#eef1f7';
      roundRect(ctx, s * 0.66, -s * 0.66, s * 0.24, s * 0.42, s * 0.08); ctx.fill();
      ctx.restore();
      /* 闪电（正在充电） */
      ctx.fillStyle = '#ffd166';
      poly(ctx, [-s * 0.10, -s * 0.62, s * 0.34, -s * 0.62, s * 0.06, -s * 0.08, s * 0.32, -s * 0.08, -s * 0.16, s * 0.66, s * 0.02, s * 0.06, -s * 0.26, s * 0.06]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,10,0.35)';
      ctx.lineWidth = s * 0.05;
      poly(ctx, [-s * 0.10, -s * 0.62, s * 0.34, -s * 0.62, s * 0.06, -s * 0.08, s * 0.32, -s * 0.08, -s * 0.16, s * 0.66, s * 0.02, s * 0.06, -s * 0.26, s * 0.06]);
      ctx.stroke();
      ctx.restore();
    },

    /* 生日蜡烛：点着的蜡烛 */
    'candle': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 烛体 */
      var gl = lgrad(ctx, -s * 0.45, 0, s * 0.45, 0, '#fdf3ff', '#e6c9f5');
      ctx.fillStyle = gl;
      roundRect(ctx, -s * 0.36, -s * 0.55, s * 0.72, s * 1.55, s * 0.14); ctx.fill();
      /* 螺旋条纹 */
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = s * 0.13;
      for (i = 0; i < 4; i++) {
        seg(ctx, -s * 0.36, -s * 0.36 + i * s * 0.40, s * 0.36, -s * 0.52 + i * s * 0.40);
      }
      /* 顶端融化的蜡 */
      ctx.fillStyle = '#fff8fd';
      ellipsePath(ctx, 0, -s * 0.52, s * 0.38, s * 0.14, 0); ctx.fill();
      /* 烛芯 */
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = s * 0.09;
      seg(ctx, 0, -s * 0.58, 0, -s * 0.80);
      /* 火焰 */
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.46);
      ctx.bezierCurveTo(s * 0.34, -s * 1.10, s * 0.24, -s * 0.78, 0, -s * 0.78);
      ctx.bezierCurveTo(-s * 0.24, -s * 0.78, -s * 0.34, -s * 1.10, 0, -s * 1.46);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.24);
      ctx.bezierCurveTo(s * 0.18, -s * 1.04, s * 0.12, -s * 0.86, 0, -s * 0.86);
      ctx.bezierCurveTo(-s * 0.12, -s * 0.86, -s * 0.18, -s * 1.04, 0, -s * 1.24);
      ctx.closePath(); ctx.fill();
      /* 光晕 */
      ctx.fillStyle = 'rgba(255,200,90,0.30)';
      circle(ctx, 0, -s * 1.06, s * 0.56); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,190,0.55)';
      circle(ctx, 0, -s * 1.06, s * 0.26); ctx.fill();
      /* 烛台 */
      ctx.fillStyle = '#c9a24a';
      ellipsePath(ctx, 0, s * 1.00, s * 0.62, s * 0.20, 0); ctx.fill();
      ctx.fillStyle = '#a5822f';
      roundRect(ctx, -s * 0.52, s * 0.86, s * 1.04, s * 0.22, s * 0.08); ctx.fill();
      ctx.restore();
    },

    /* 珍珠加料：奶茶加珍珠 */
    'boba': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 杯子 */
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      poly(ctx, [-s * 0.66, -s * 0.78, s * 0.66, -s * 0.78, s * 0.48, s * 0.92, -s * 0.48, s * 0.92]);
      ctx.fill();
      /* 奶茶液体 */
      var gl = lgrad(ctx, 0, -s * 0.40, 0, s * 0.92, '#e8c8a0', '#c69a68');
      ctx.fillStyle = gl;
      poly(ctx, [-s * 0.60, -s * 0.34, s * 0.60, -s * 0.34, s * 0.46, s * 0.84, -s * 0.46, s * 0.84]);
      ctx.fill();
      /* 杯壁高光 */
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = s * 0.10;
      seg(ctx, -s * 0.50, -s * 0.44, -s * 0.38, s * 0.62);
      /* 珍珠 */
      var pearls = [[-0.28, 0.44], [0.02, 0.58], [0.30, 0.44], [-0.14, 0.74], [0.18, 0.76], [-0.34, 0.66], [0.36, 0.68]];
      ctx.fillStyle = '#3a2418';
      for (i = 0; i < pearls.length; i++) {
        circle(ctx, s * pearls[i][0], s * pearls[i][1], s * 0.15); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (i = 0; i < pearls.length; i++) {
        circle(ctx, s * (pearls[i][0] - 0.05), s * (pearls[i][1] - 0.05), s * 0.045); ctx.fill();
      }
      /* 杯口封膜 + 吸管 */
      ctx.fillStyle = '#ffd166';
      roundRect(ctx, -s * 0.72, -s * 0.90, s * 1.44, s * 0.20, s * 0.08); ctx.fill();
      ctx.strokeStyle = '#ff5d8f';
      ctx.lineWidth = s * 0.15;
      ctx.lineCap = 'round';
      seg(ctx, s * 0.10, -s * 1.28, s * 0.24, -s * 0.80);
      /* 加料小标 */
      ctx.fillStyle = '#4a2b1f';
      roundRect(ctx, -s * 0.42, -s * 0.28, s * 0.84, s * 0.26, s * 0.06); ctx.fill();
      ctx.fillStyle = '#fff3e0';
      ctx.fillRect(-s * 0.30, -s * 0.20, s * 0.22, s * 0.10);
      ctx.fillRect(s * 0.02, -s * 0.20, s * 0.26, s * 0.10);
      ctx.restore();
    },

    /* 优惠券：满减券 */
    'coupon': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(-0.07);
      /* 券体 */
      ctx.fillStyle = '#ff7a59';
      roundRect(ctx, -s * 1.00, -s * 0.62, s * 2.00, s * 1.24, s * 0.12); ctx.fill();
      /* 底边浅色带 */
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      roundRect(ctx, -s * 1.00, s * 0.16, s * 2.00, s * 0.46, s * 0.12); ctx.fill();
      /* 左侧金额块 */
      ctx.fillStyle = '#fff2ec';
      roundRect(ctx, -s * 0.86, -s * 0.46, s * 0.78, s * 0.92, s * 0.08); ctx.fill();
      /* 金额符号 */
      ctx.fillStyle = '#e0533f';
      ctx.fillRect(-s * 0.76, -s * 0.26, s * 0.10, s * 0.10);
      ctx.fillRect(-s * 0.66, -s * 0.26, s * 0.10, s * 0.10);
      ctx.fillRect(-s * 0.76, -s * 0.12, s * 0.10, s * 0.10);
      ctx.fillRect(-s * 0.66, -s * 0.12, s * 0.10, s * 0.10);
      ctx.fillRect(-s * 0.71, -s * 0.30, s * 0.10, s * 0.10);
      ctx.fillRect(-s * 0.71, -s * 0.06, s * 0.10, s * 0.10);
      ctx.fillStyle = '#e0533f';
      roundRect(ctx, -s * 0.50, -s * 0.24, s * 0.30, s * 0.52, s * 0.06); ctx.fill();
      /* 虚线撕口 */
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.08;
      ctx.setLineDash([s * 0.14, s * 0.12]);
      seg(ctx, s * 0.10, -s * 0.62, s * 0.10, s * 0.62);
      ctx.setLineDash([]);
      /* 两侧缺口 */
      ctx.fillStyle = '#ff7a59';
      circle(ctx, s * 0.10, -s * 0.62, s * 0.12); ctx.fill();
      circle(ctx, s * 0.10, s * 0.62, s * 0.12); ctx.fill();
      /* 右侧说明行 */
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (i = 0; i < 3; i++) {
        roundRect(ctx, s * 0.26, -s * 0.40 + i * s * 0.28, s * (0.62 - i * 0.14), s * 0.13, s * 0.06);
        ctx.fill();
      }
      /* 右上角折扣标 */
      ctx.fillStyle = '#ffd166';
      circle(ctx, s * 0.72, -s * 0.48, s * 0.22); ctx.fill();
      ctx.fillStyle = '#7a4a00';
      ctx.fillRect(s * 0.66, -s * 0.54, s * 0.10, s * 0.10);
      ctx.fillRect(s * 0.66, -s * 0.40, s * 0.10, s * 0.10);
      ctx.restore();
    },

    /* 空座位：地铁空座 */
    'seat': function (ctx, size, p) {
      var s = size;
      ctx.save();
      /* 靠背 */
      ctx.fillStyle = '#4a90d9';
      roundRect(ctx, -s * 0.86, -s * 0.92, s * 1.72, s * 1.06, s * 0.16); ctx.fill();
      /* 靠背上的凹槽（两个座位的分隔） */
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(ctx, -s * 0.92, -s * 1.00, s * 1.84, s * 0.16, s * 0.06); ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,80,0.35)';
      ctx.lineWidth = s * 0.07;
      seg(ctx, 0, -s * 0.82, 0, -s * 0.06);
      /* 坐垫 */
      ctx.fillStyle = '#8fc0ee';
      roundRect(ctx, -s * 0.94, -s * 0.02, s * 1.88, s * 0.34, s * 0.12); ctx.fill();
      /* 坐垫厚度 */
      ctx.fillStyle = '#6da4dc';
      roundRect(ctx, -s * 0.94, s * 0.22, s * 1.88, s * 0.14, s * 0.07); ctx.fill();
      /* 底座 */
      ctx.fillStyle = '#3b6ea8';
      roundRect(ctx, -s * 0.78, s * 0.34, s * 1.56, s * 0.16, s * 0.06); ctx.fill();
      /* 椅腿 */
      ctx.fillStyle = '#2f567f';
      roundRect(ctx, -s * 0.62, s * 0.48, s * 0.16, s * 0.52, s * 0.05); ctx.fill();
      roundRect(ctx, s * 0.46, s * 0.48, s * 0.16, s * 0.52, s * 0.05); ctx.fill();
      /* 空座提示：虚线圈 */
      ctx.strokeStyle = 'rgba(255,209,102,0.95)';
      ctx.lineWidth = s * 0.09;
      ctx.setLineDash([s * 0.18, s * 0.14]);
      roundRect(ctx, -s * 0.86, -s * 0.80, s * 1.44, s * 0.66, s * 0.14);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 可入座的小箭头 */
      ctx.fillStyle = '#ffd166';
      poly(ctx, [s * 0.30, s * 0.78, s * 0.52, s * 0.46, s * 0.08, s * 0.46]);
      ctx.fill();
      ctx.restore();
    },

    /* 哑铃 */
    'dumbbell': function (ctx, size, p) {
      var s = size;
      ctx.save();
      ctx.rotate(-0.26);
      /* 握杆 */
      ctx.fillStyle = '#b9c2d4';
      roundRect(ctx, -s * 0.52, -s * 0.13, s * 1.04, s * 0.26, s * 0.08); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRect(ctx, -s * 0.50, -s * 0.09, s * 0.98, s * 0.08, s * 0.04); ctx.fill();
      /* 握把纹路 */
      ctx.strokeStyle = 'rgba(90,100,125,0.7)';
      ctx.lineWidth = s * 0.05;
      var i;
      for (i = 0; i < 5; i++) seg(ctx, -s * 0.34 + i * s * 0.17, -s * 0.11, -s * 0.34 + i * s * 0.17, s * 0.11);
      /* 两侧配重 */
      var side = function (dir) {
        ctx.save();
        ctx.translate(dir * s * 0.62, 0);
        ctx.fillStyle = '#3b4256';
        roundRect(ctx, -s * 0.24, -s * 0.72, s * 0.48, s * 1.44, s * 0.12); ctx.fill();
        ctx.fillStyle = '#565f78';
        roundRect(ctx, -s * 0.24, -s * 0.72, s * 0.20, s * 1.44, s * 0.10); ctx.fill();
        ctx.fillStyle = '#2b3040';
        roundRect(ctx, -s * 0.10, -s * 0.52, s * 0.20, s * 1.04, s * 0.06); ctx.fill();
        ctx.restore();
      };
      side(-1);
      side(1);
      ctx.restore();
    },

    /* 蛋白粉奶昔：摇摇杯 */
    'protein-shake': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 杯体 */
      var gl = lgrad(ctx, -s * 0.6, 0, s * 0.6, 0, '#f2f5ff', '#c8d3ea');
      ctx.fillStyle = gl;
      poly(ctx, [-s * 0.60, -s * 0.62, s * 0.60, -s * 0.62, s * 0.46, s * 1.00, -s * 0.46, s * 1.00]);
      ctx.fill();
      /* 液面 */
      ctx.fillStyle = '#8b5e3c';
      poly(ctx, [-s * 0.56, -s * 0.10, s * 0.56, -s * 0.10, s * 0.44, s * 0.94, -s * 0.44, s * 0.94]);
      ctx.fill();
      /* 泡沫 */
      ctx.fillStyle = 'rgba(255,240,220,0.85)';
      ellipsePath(ctx, 0, -s * 0.10, s * 0.56, s * 0.14, 0); ctx.fill();
      /* 刻度 */
      ctx.strokeStyle = 'rgba(90,110,150,0.55)';
      ctx.lineWidth = s * 0.05;
      for (i = 0; i < 2; i++) seg(ctx, s * 0.24, s * (0.20 + i * 0.28), s * 0.38, s * (0.20 + i * 0.28));
      /* 杯盖 */
      ctx.fillStyle = '#4a90d9';
      roundRect(ctx, -s * 0.68, -s * 0.92, s * 1.36, s * 0.34, s * 0.10); ctx.fill();
      ctx.fillStyle = '#2f6fb0';
      roundRect(ctx, -s * 0.68, -s * 0.72, s * 1.36, s * 0.14, s * 0.06); ctx.fill();
      /* 吸嘴 */
      ctx.fillStyle = '#4a90d9';
      roundRect(ctx, -s * 0.16, -s * 1.20, s * 0.32, s * 0.30, s * 0.09); ctx.fill();
      ctx.fillStyle = '#1f4f80';
      roundRect(ctx, -s * 0.10, -s * 1.16, s * 0.20, s * 0.12, s * 0.05); ctx.fill();
      /* 杯身高光 */
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.10;
      seg(ctx, -s * 0.42, -s * 0.46, -s * 0.34, s * 0.80);
      /* 肌肉小标 */
      ctx.fillStyle = '#ffd166';
      circle(ctx, s * 0.30, -s * 0.36, s * 0.20); ctx.fill();
      ctx.fillStyle = '#7a4a00';
      ctx.fillRect(s * 0.22, -s * 0.48, s * 0.16, s * 0.10);
      ctx.fillRect(s * 0.18, -s * 0.40, s * 0.24, s * 0.14);
      ctx.restore();
    },

    /* 答题卡：涂满选项 */
    'answer-sheet': function (ctx, size, p) {
      var s = size;
      var i, j;
      ctx.save();
      ctx.rotate(-0.06);
      /* 卡片 */
      ctx.fillStyle = '#fdfaf2';
      roundRect(ctx, -s * 0.82, -s * 1.14, s * 1.64, s * 2.28, s * 0.10); ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,150,0.4)';
      ctx.lineWidth = s * 0.05;
      roundRect(ctx, -s * 0.82, -s * 1.14, s * 1.64, s * 2.28, s * 0.10); ctx.stroke();
      /* 顶部黑色定位块 */
      ctx.fillStyle = '#2b3040';
      roundRect(ctx, -s * 0.66, -s * 1.00, s * 0.30, s * 0.24, s * 0.04); ctx.fill();
      roundRect(ctx, s * 0.36, -s * 1.00, s * 0.30, s * 0.24, s * 0.04); ctx.fill();
      roundRect(ctx, -s * 0.66, s * 0.76, s * 0.30, s * 0.24, s * 0.04); ctx.fill();
      roundRect(ctx, s * 0.36, s * 0.76, s * 0.30, s * 0.24, s * 0.04); ctx.fill();
      /* 题号 + 选项气泡 */
      for (i = 0; i < 4; i++) {
        var yy = -s * 0.66 + i * s * 0.42;
        ctx.strokeStyle = 'rgba(90,100,125,0.55)';
        ctx.lineWidth = s * 0.07;
        circle(ctx, -s * 0.58, yy, s * 0.11); ctx.stroke();
        for (j = 0; j < 4; j++) {
          var ox = -s * 0.24 + j * s * 0.30;
          var filled = (i + j) % 3 === 0;
          ctx.strokeStyle = filled ? '#2b3040' : 'rgba(90,100,125,0.55)';
          ctx.lineWidth = s * 0.06;
          circle(ctx, ox, yy, s * 0.12); ctx.stroke();
          if (filled) {
            ctx.fillStyle = '#3b4256';
            ellipsePath(ctx, ox, yy, s * 0.09, s * 0.10, 0); ctx.fill();
          }
        }
      }
      /* 红笔勾 */
      ctx.strokeStyle = '#ff5a6e';
      ctx.lineWidth = s * 0.13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.30, s * 0.30);
      ctx.lineTo(s * 0.44, s * 0.50);
      ctx.lineTo(s * 0.74, s * 0.06);
      ctx.stroke();
      ctx.restore();
    },

    /* 满分成绩单：A+ 卷子 */
    'a-grade': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(0.07);
      /* 卷面 */
      ctx.fillStyle = '#fffdf6';
      roundRect(ctx, -s * 0.86, -s * 1.00, s * 1.72, s * 2.00, s * 0.10); ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,150,0.35)';
      ctx.lineWidth = s * 0.05;
      roundRect(ctx, -s * 0.86, -s * 1.00, s * 1.72, s * 2.00, s * 0.10); ctx.stroke();
      /* 标题横条 */
      ctx.fillStyle = '#c9d4e8';
      roundRect(ctx, -s * 0.62, -s * 0.78, s * 1.24, s * 0.16, s * 0.06); ctx.fill();
      /* 作答行 */
      ctx.strokeStyle = 'rgba(120,130,160,0.5)';
      ctx.lineWidth = s * 0.07;
      ctx.lineCap = 'round';
      for (i = 0; i < 2; i++) seg(ctx, -s * 0.62, -s * 0.40 + i * s * 0.26, s * 0.40, -s * 0.40 + i * s * 0.26);
      /* 大红 A+ */
      ctx.strokeStyle = '#ff5a6e';
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(-s * 0.60, s * 0.62);
      ctx.lineTo(-s * 0.36, s * 0.04);
      ctx.lineTo(-s * 0.12, s * 0.62);
      ctx.stroke();
      seg(ctx, -s * 0.50, s * 0.40, -s * 0.22, s * 0.40);
      /* 加号 */
      seg(ctx, s * 0.08, s * 0.24, s * 0.08, s * 0.60);
      seg(ctx, -s * 0.10, s * 0.42, s * 0.26, s * 0.42);
      /* 满分印章 */
      ctx.fillStyle = 'rgba(255,90,110,0.92)';
      circle(ctx, s * 0.52, s * 0.60, s * 0.30); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.07;
      circle(ctx, s * 0.52, s * 0.60, s * 0.22); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(s * 0.40, s * 0.60);
      ctx.lineTo(s * 0.49, s * 0.72);
      ctx.lineTo(s * 0.66, s * 0.46);
      ctx.stroke();
      /* 闪光 */
      ctx.fillStyle = '#ffd166';
      sparkle(ctx, -s * 0.72, -s * 0.98, s * 0.22); ctx.fill();
      sparkle(ctx, s * 0.72, -s * 0.86, s * 0.16); ctx.fill();
      ctx.restore();
    },

    /* 煎蛋：蛋黄蛋白 */
    'fried-egg': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 蛋白（更饱满的不规则边缘） */
      ctx.fillStyle = '#fdfaf3';
      ctx.beginPath();
      for (i = 0; i <= 24; i++) {
        var a = (i / 24) * Math.PI * 2;
        var rr = s * (1.02 + 0.16 * Math.sin(i * 2.7) + 0.09 * Math.cos(i * 1.3));
        var px = Math.cos(a) * rr;
        var py = Math.sin(a) * rr * 0.90;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      /* 蛋白的暗边（让白边更明显） */
      ctx.strokeStyle = 'rgba(170,150,110,0.65)';
      ctx.lineWidth = s * 0.07;
      ctx.stroke();
      /* 煎焦的一小角 */
      ctx.fillStyle = 'rgba(190,140,80,0.85)';
      ellipsePath(ctx, -s * 0.70, s * 0.30, s * 0.30, s * 0.18, 0.5); ctx.fill();
      ctx.fillStyle = 'rgba(150,100,50,0.7)';
      ellipsePath(ctx, s * 0.66, s * 0.40, s * 0.20, s * 0.12, -0.4); ctx.fill();
      /* 蛋黄 */
      var gl = rgrad(ctx, -s * 0.14, -s * 0.18, s * 0.10, s * 0.46, '#ffd166', '#e8961f');
      ctx.fillStyle = gl;
      circle(ctx, s * 0.02, s * 0.02, s * 0.46); ctx.fill();
      ctx.strokeStyle = 'rgba(190,120,15,0.7)';
      ctx.lineWidth = s * 0.06;
      circle(ctx, s * 0.02, s * 0.02, s * 0.46); ctx.stroke();
      /* 蛋黄高光 */
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ellipsePath(ctx, -s * 0.14, -s * 0.16, s * 0.15, s * 0.10, -0.4); ctx.fill();
      /* 蛋白高光 */
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ellipsePath(ctx, -s * 0.60, -s * 0.52, s * 0.20, s * 0.10, 0.4); ctx.fill();
      /* 蛋白边缘的小泡 */
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      circle(ctx, s * 0.72, -s * 0.40, s * 0.09); ctx.fill();
      circle(ctx, -s * 0.20, -s * 0.84, s * 0.07); ctx.fill();
      ctx.restore();
    },

    /* 一碗面：热汤面 */
    'noodle-bowl': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 热气 */
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      for (i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.24 + i * s * 0.48, -s * 0.92);
        ctx.quadraticCurveTo(-s * 0.08 + i * s * 0.48, -s * 1.16, -s * 0.24 + i * s * 0.48, -s * 1.38);
        ctx.stroke();
      }
      /* 面（波浪线） */
      ctx.strokeStyle = '#f0cf87';
      ctx.lineWidth = s * 0.13;
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.62, -s * 0.34 + i * s * 0.14);
        ctx.quadraticCurveTo(-s * 0.20, -s * 0.56 + i * s * 0.14, s * 0.20, -s * 0.34 + i * s * 0.14);
        ctx.quadraticCurveTo(s * 0.48, -s * 0.20 + i * s * 0.14, s * 0.62, -s * 0.34 + i * s * 0.14);
        ctx.stroke();
      }
      /* 汤 */
      ctx.fillStyle = '#d9a24a';
      ellipsePath(ctx, 0, -s * 0.16, s * 0.70, s * 0.22, 0); ctx.fill();
      /* 碗 */
      ctx.fillStyle = '#e8f0ff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.92, -s * 0.16);
      ctx.quadraticCurveTo(-s * 0.86, s * 0.84, 0, s * 0.84);
      ctx.quadraticCurveTo(s * 0.86, s * 0.84, s * 0.92, -s * 0.16);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = s * 0.10;
      ctx.beginPath();
      ctx.moveTo(-s * 0.92, -s * 0.16);
      ctx.quadraticCurveTo(-s * 0.86, s * 0.84, 0, s * 0.84);
      ctx.quadraticCurveTo(s * 0.86, s * 0.84, s * 0.92, -s * 0.16);
      ctx.stroke();
      /* 碗边 */
      ctx.fillStyle = '#f6faff';
      ellipsePath(ctx, 0, -s * 0.16, s * 0.94, s * 0.22, 0); ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ellipsePath(ctx, 0, -s * 0.16, s * 0.86, s * 0.18, 0); ctx.fill();
      /* 配料：半个蛋 + 葱花 */
      ctx.fillStyle = '#fdf6e6';
      ellipsePath(ctx, -s * 0.42, -s * 0.26, s * 0.24, s * 0.16, 0.2); ctx.fill();
      ctx.fillStyle = '#ffb703';
      ellipsePath(ctx, -s * 0.42, -s * 0.26, s * 0.13, s * 0.09, 0.2); ctx.fill();
      ctx.fillStyle = '#5fbf5f';
      circle(ctx, s * 0.28, -s * 0.22, s * 0.07); ctx.fill();
      circle(ctx, s * 0.46, -s * 0.14, s * 0.06); ctx.fill();
      circle(ctx, s * 0.12, -s * 0.10, s * 0.05); ctx.fill();
      /* 底部碗足 */
      ctx.fillStyle = '#c8d4e8';
      roundRect(ctx, -s * 0.24, s * 0.82, s * 0.48, s * 0.14, s * 0.06); ctx.fill();
      ctx.restore();
    },

    /* 猫条：挤出来的那一口 */
    'cat-treat': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(-0.35);
      /* 包装管 */
      ctx.fillStyle = '#ff9ec4';
      roundRect(ctx, -s * 0.92, -s * 0.34, s * 1.72, s * 0.68, s * 0.30); ctx.fill();
      ctx.fillStyle = '#ffd1e3';
      roundRect(ctx, -s * 0.92, -s * 0.30, s * 1.72, s * 0.24, s * 0.22); ctx.fill();
      /* 管身色带 */
      ctx.fillStyle = '#e0537f';
      roundRect(ctx, -s * 0.52, -s * 0.34, s * 0.24, s * 0.68, s * 0.06); ctx.fill();
      /* 尾巴（拧口） */
      ctx.fillStyle = '#e0537f';
      poly(ctx, [-s * 0.92, -s * 0.30, -s * 1.18, 0, -s * 0.92, s * 0.30]);
      ctx.fill();
      /* 挤出的肉泥 */
      ctx.fillStyle = '#c9805a';
      ctx.beginPath();
      ctx.moveTo(s * 0.78, -s * 0.22);
      ctx.quadraticCurveTo(s * 1.24, -s * 0.20, s * 1.22, s * 0.02);
      ctx.quadraticCurveTo(s * 1.20, s * 0.22, s * 0.78, s * 0.20);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0a070';
      ellipsePath(ctx, s * 1.04, -s * 0.02, s * 0.18, s * 0.12, 0); ctx.fill();
      /* 猫爪印 */
      ctx.fillStyle = '#fff1f6';
      circle(ctx, -s * 0.14, s * 0.02, s * 0.11); ctx.fill();
      circle(ctx, -s * 0.26, -s * 0.12, s * 0.05); ctx.fill();
      circle(ctx, -s * 0.12, -s * 0.16, s * 0.05); ctx.fill();
      circle(ctx, s * 0.02, -s * 0.12, s * 0.05); ctx.fill();
      /* 管身小字行 */
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (i = 0; i < 2; i++) {
        roundRect(ctx, s * 0.14, -s * (0.14 - i * 0.22), s * (0.34 - i * 0.10), s * 0.09, s * 0.04);
        ctx.fill();
      }
      ctx.restore();
    },

    /* 登机牌：机票 / 登机牌 */
    'boarding-pass': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(-0.09);
      /* 票体 */
      ctx.fillStyle = '#f4f8ff';
      roundRect(ctx, -s * 0.62, -s * 1.10, s * 1.24, s * 2.20, s * 0.10); ctx.fill();
      /* 顶部航空色带 */
      ctx.fillStyle = '#4fd1e0';
      roundRect(ctx, -s * 0.62, -s * 1.10, s * 1.24, s * 0.34, s * 0.10); ctx.fill();
      ctx.fillStyle = '#4fd1e0';
      ctx.fillRect(-s * 0.62, -s * 0.90, s * 1.24, s * 0.14);
      /* 撕口与虚线 */
      ctx.strokeStyle = 'rgba(90,110,150,0.55)';
      ctx.lineWidth = s * 0.07;
      ctx.setLineDash([s * 0.14, s * 0.12]);
      seg(ctx, -s * 0.62, s * 0.32, s * 0.62, s * 0.32);
      ctx.setLineDash([]);
      ctx.fillStyle = '#f4f8ff';
      circle(ctx, -s * 0.62, s * 0.32, s * 0.12); ctx.fill();
      circle(ctx, s * 0.62, s * 0.32, s * 0.12); ctx.fill();
      /* 航班信息行 */
      ctx.fillStyle = '#8fa0bf';
      roundRect(ctx, -s * 0.44, -s * 0.62, s * 0.52, s * 0.13, s * 0.06); ctx.fill();
      roundRect(ctx, s * 0.10, -s * 0.62, s * 0.34, s * 0.13, s * 0.06); ctx.fill();
      roundRect(ctx, -s * 0.44, -s * 0.34, s * 0.40, s * 0.13, s * 0.06); ctx.fill();
      roundRect(ctx, s * 0.04, -s * 0.34, s * 0.40, s * 0.13, s * 0.06); ctx.fill();
      /* 航线箭头 */
      ctx.strokeStyle = '#2f8fa3';
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      seg(ctx, -s * 0.36, -s * 0.02, s * 0.28, -s * 0.02);
      ctx.fillStyle = '#2f8fa3';
      poly(ctx, [s * 0.42, -s * 0.02, s * 0.22, -s * 0.16, s * 0.22, s * 0.12]); ctx.fill();
      circle(ctx, -s * 0.42, -s * 0.02, s * 0.07); ctx.fill();
      /* 条形码 */
      ctx.fillStyle = '#2b3040';
      var bars = [0.10, 0.05, 0.14, 0.07, 0.11, 0.05, 0.13, 0.08, 0.06, 0.12];
      var bx = -s * 0.46;
      for (i = 0; i < bars.length; i++) {
        ctx.fillRect(bx, s * 0.58, s * bars[i] * 0.7, s * 0.34);
        bx += s * (bars[i] * 0.7 + 0.06);
      }
      /* 小飞机图标 */
      ctx.fillStyle = '#4fd1e0';
      poly(ctx, [s * 0.30, s * 0.62, s * 0.56, s * 0.74, s * 0.30, s * 0.86]);
      ctx.fill();
      ctx.fillRect(s * 0.26, s * 0.72, s * 0.34, s * 0.045);
      ctx.restore();
    },

    /* 靠窗座位：带舷窗的座位 */
    'window-seat': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 舷窗框 */
      ctx.fillStyle = '#e9f2ff';
      roundRect(ctx, -s * 0.94, -s * 1.12, s * 1.88, s * 1.40, s * 0.42); ctx.fill();
      ctx.fillStyle = '#2f6fb0';
      roundRect(ctx, -s * 0.84, -s * 1.02, s * 1.68, s * 1.20, s * 0.36); ctx.fill();
      /* 窗外的云 */
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      circle(ctx, -s * 0.30, -s * 0.30, s * 0.22); ctx.fill();
      circle(ctx, s * 0.04, -s * 0.42, s * 0.26); ctx.fill();
      circle(ctx, s * 0.38, -s * 0.26, s * 0.20); ctx.fill();
      roundRect(ctx, -s * 0.44, -s * 0.32, s * 0.92, s * 0.24, s * 0.12); ctx.fill();
      /* 窗内星空/远处天际线 */
      ctx.fillStyle = 'rgba(255,209,102,0.65)';
      circle(ctx, s * 0.56, -s * 0.74, s * 0.08); ctx.fill();
      /* 座位靠背 */
      ctx.fillStyle = '#4a90d9';
      roundRect(ctx, -s * 0.78, s * 0.16, s * 1.56, s * 0.82, s * 0.14); ctx.fill();
      ctx.fillStyle = '#8fc0ee';
      roundRect(ctx, -s * 0.70, s * 0.54, s * 1.40, s * 0.36, s * 0.10); ctx.fill();
      /* 头枕 */
      ctx.fillStyle = '#f0f6ff';
      roundRect(ctx, -s * 0.44, s * 0.22, s * 0.88, s * 0.20, s * 0.08); ctx.fill();
      /* 安全带 */
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = s * 0.11;
      ctx.lineCap = 'round';
      seg(ctx, -s * 0.24, s * 0.32, s * 0.10, s * 0.62);
      /* 窗框铆钉 */
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      for (i = 0; i < 2; i++) {
        circle(ctx, -s * 0.94, -s * 0.86 + i * s * 0.90, s * 0.06); ctx.fill();
        circle(ctx, s * 0.94, -s * 0.86 + i * s * 0.90, s * 0.06); ctx.fill();
      }
      ctx.restore();
    },

    /* 纪念品：带字的小旗 / 冰箱贴 */
    'souvenir': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      ctx.rotate(0.08);
      /* 旗杆 */
      ctx.fillStyle = '#b98a4e';
      roundRect(ctx, -s * 0.86, -s * 1.06, s * 0.16, s * 2.06, s * 0.06); ctx.fill();
      ctx.fillStyle = '#8a6234';
      circle(ctx, -s * 0.78, -s * 1.10, s * 0.14); ctx.fill();
      /* 小旗 */
      ctx.fillStyle = '#ff7a59';
      ctx.beginPath();
      ctx.moveTo(-s * 0.70, -s * 0.86);
      ctx.lineTo(s * 0.92, -s * 0.60);
      ctx.lineTo(s * 0.62, s * 0.06);
      ctx.lineTo(-s * 0.70, -s * 0.16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      poly(ctx, [-s * 0.70, -s * 0.16, s * 0.62, s * 0.06, s * 0.50, s * 0.36, -s * 0.70, s * 0.14]);
      ctx.fill();
      /* 旗面字母块（“纪念”） */
      ctx.fillStyle = '#fff6ec';
      for (i = 0; i < 2; i++) {
        roundRect(ctx, -s * 0.46 + i * s * 0.52, -s * 0.66, s * 0.36, s * 0.26, s * 0.05);
        ctx.fill();
      }
      ctx.fillStyle = '#e0533f';
      ctx.fillRect(-s * 0.38, -s * 0.58, s * 0.20, s * 0.10);
      ctx.fillRect(s * 0.14, -s * 0.58, s * 0.20, s * 0.10);
      /* 贝壳 / 纪念品挂件 */
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, s * 0.92);
      ctx.bezierCurveTo(-s * 0.70, s * 0.42, s * 0.70, s * 0.42, s * 0.30, s * 0.92);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(150,100,20,0.55)';
      ctx.lineWidth = s * 0.05;
      for (i = 0; i < 3; i++) {
        seg(ctx, 0, s * 0.90, -s * 0.26 + i * s * 0.26, s * 0.50);
      }
      /* 相机小图标 */
      ctx.fillStyle = '#4a90d9';
      roundRect(ctx, s * 0.06, s * 0.42, s * 0.72, s * 0.50, s * 0.08); ctx.fill();
      ctx.fillStyle = '#2f6fb0';
      roundRect(ctx, s * 0.20, s * 0.34, s * 0.30, s * 0.12, s * 0.04); ctx.fill();
      ctx.fillStyle = '#f0f6ff';
      circle(ctx, s * 0.42, s * 0.66, s * 0.16); ctx.fill();
      ctx.fillStyle = '#26456e';
      circle(ctx, s * 0.42, s * 0.66, s * 0.09); ctx.fill();
      ctx.restore();
    },

    /* 快递包裹：贴面单的纸箱 */
    'parcel': function (ctx, size, p) {
      var s = size;
      var i;
      ctx.save();
      /* 箱体正面 */
      ctx.fillStyle = '#c98d4e';
      roundRect(ctx, -s * 0.92, -s * 0.72, s * 1.84, s * 1.62, s * 0.10); ctx.fill();
      /* 顶面 */
      ctx.fillStyle = '#b47f44';
      poly(ctx, [-s * 0.92, -s * 0.72, -s * 0.60, -s * 1.06, s * 1.20, -s * 1.06, s * 0.92, -s * 0.72]);
      ctx.fill();
      /* 右侧面 */
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      poly(ctx, [s * 0.92, -s * 0.72, s * 1.20, -s * 1.06, s * 1.20, s * 0.56, s * 0.92, s * 0.90]);
      ctx.fill();
      /* 胶带（十字） */
      ctx.fillStyle = 'rgba(255,240,210,0.60)';
      ctx.fillRect(-s * 0.11, -s * 1.02, s * 0.22, s * 1.90);
      ctx.fillRect(-s * 0.92, -s * 0.11, s * 1.84, s * 0.22);
      /* 封口缝 */
      ctx.strokeStyle = 'rgba(90,60,30,0.45)';
      ctx.lineWidth = s * 0.06;
      seg(ctx, -s * 0.60, -s * 1.06, s * 1.20, -s * 1.06);
      /* 面单 */
      ctx.fillStyle = '#fdfaf3';
      roundRect(ctx, s * 0.16, -s * 0.50, s * 0.68, s * 1.06, s * 0.06); ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,150,0.55)';
      ctx.lineWidth = s * 0.04;
      roundRect(ctx, s * 0.16, -s * 0.50, s * 0.68, s * 1.06, s * 0.06); ctx.stroke();
      /* 面单上的条码与文字 */
      ctx.fillStyle = '#2b3040';
      var bars = [0.06, 0.03, 0.08, 0.04, 0.07, 0.03, 0.09, 0.05];
      var bx = s * 0.22;
      for (i = 0; i < bars.length; i++) {
        ctx.fillRect(bx, -s * 0.42, s * bars[i] * 0.9, s * 0.30);
        bx += s * (bars[i] * 0.9 + 0.035);
      }
      ctx.fillStyle = '#8fa0bf';
      roundRect(ctx, s * 0.22, -s * 0.04, s * 0.56, s * 0.11, s * 0.05); ctx.fill();
      roundRect(ctx, s * 0.22, s * 0.14, s * 0.40, s * 0.11, s * 0.05); ctx.fill();
      roundRect(ctx, s * 0.22, s * 0.32, s * 0.48, s * 0.11, s * 0.05); ctx.fill();
      /* 拆快递的小爱心 */
      ctx.fillStyle = '#ff7a90';
      heartPath(ctx, -s * 0.44, s * 0.42, s * 0.22); ctx.fill();
      ctx.restore();
    },
  };

  /*__PART6__*/
  function drawScene(ctx, sceneId, w, h, palette, t) {
    var fn = SCENE_ART[sceneId];
    if (fn) fn(ctx, w, h, palette, t || 0);
  }

  function drawObstacleArt(ctx, spriteId, size, palette) {
    var fn = OBSTACLE_ART[spriteId];
    if (fn) { fn(ctx, size, palette); return true; }
    return false;  // 返回 false 表示该 id 由旧文件负责绘制
  }

  function drawCollectibleArt(ctx, spriteId, size, palette) {
    var fn = COLLECTIBLE_ART[spriteId];
    if (fn) { fn(ctx, size, palette); return true; }
    return false;
  }

  return {
    SCENE_ART: SCENE_ART,
    OBSTACLE_ART: OBSTACLE_ART,
    COLLECTIBLE_ART: COLLECTIBLE_ART,
    drawScene: drawScene,
    drawObstacleArt: drawObstacleArt,
    drawCollectibleArt: drawCollectibleArt,
    roundRect: roundRect,
    circle: circle,
  };
});
