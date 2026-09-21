/* 主题与素材：三套视觉主题 + 全部为程序化绘制的矢量素材（无外部图片依赖）。
 * 素材 ID 与 shared/schema.js 枚举一一对应。 */
'use strict';

const GengTheme = (function () {

  /* ---------------- 三套主题 ---------------- */
  const THEMES = {
    'office-neon': {
      label: '职场 · 加班改稿',
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
    },
    'birthday-pop': {
      label: '生日 · 庆祝聚会',
      bg: ['#2a0b2e', '#451a4d', '#5c2760'],
      grid: 'rgba(255,180,230,0.08)',
      accent: '#ffb703',
      accent2: '#ff5d8f',
      danger: '#ff4d6d',
      text: '#fff5fb',
      textDim: 'rgba(255,245,251,0.68)',
      glow: 'rgba(255,183,3,0.35)',
      playerRing: '#ffb703',
      collectibleGlow: '#ffd166',
      obstacleTint: '#ff5d8f',
      hud: 'rgba(69,26,77,0.72)',
      particle: ['#ffb703', '#ff5d8f', '#9bf6ff'],
      floor: 'rgba(255,183,3,0.14)',
    },
    'morning-escape': {
      label: '早八 · 校园通勤',
      bg: ['#0d2818', '#12402a', '#1b5c3a'],
      grid: 'rgba(160,255,200,0.07)',
      accent: '#7bf1a8',
      accent2: '#ffd166',
      danger: '#ff7b54',
      text: '#f0fff7',
      textDim: 'rgba(240,255,247,0.66)',
      glow: 'rgba(123,241,168,0.32)',
      playerRing: '#7bf1a8',
      collectibleGlow: '#ffd166',
      obstacleTint: '#ff7b54',
      hud: 'rgba(18,64,42,0.72)',
      particle: ['#7bf1a8', '#ffd166', '#a0e7ff'],
      floor: 'rgba(123,241,168,0.12)',
    },
  };

  function getTheme(id) { return THEMES[id] || THEMES['office-neon']; }

  /* ---------------- 绘制辅助 ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }

  function star(ctx, cx, cy, R, r, points, rot) {
    const n = points || 5;
    const start = (rot || 0) - Math.PI / 2;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = start + (i * Math.PI) / n;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function heart(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.75);
    ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.35, cx - s * 0.55, cy - s * 1.25, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.55, cy - s * 1.25, cx + s * 1.5, cy - s * 0.35, cx, cy + s * 0.75);
    ctx.closePath();
  }

  /* ---------------- 玩家形象绘制（半径约 1 单位，调用方已缩放平移） ---------------- */
  const AVATAR_DRAW = {
    'office-worker': function (ctx, t) {
      // 身体：深蓝衬衫
      ctx.fillStyle = '#3d5a99';
      roundRect(ctx, -0.62, -0.25, 1.24, 1.15, 0.28); ctx.fill();
      // 领带
      ctx.fillStyle = '#ff6b9d';
      ctx.beginPath();
      ctx.moveTo(0, -0.2); ctx.lineTo(0.16, 0.1); ctx.lineTo(0, 0.72); ctx.lineTo(-0.16, 0.1);
      ctx.closePath(); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.68, 0.56); ctx.fill();
      // 头发
      ctx.fillStyle = '#2b2b3a';
      ctx.beginPath();
      ctx.arc(0, -0.72, 0.56, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath(); ctx.fill();
      // 眼镜（加班痕迹）
      ctx.strokeStyle = '#1a1a26'; ctx.lineWidth = 0.07;
      circle(ctx, -0.2, -0.66, 0.15); ctx.stroke();
      circle(ctx, 0.2, -0.66, 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.05, -0.66); ctx.lineTo(0.05, -0.66); ctx.stroke();
      // 眼睛
      ctx.fillStyle = '#1a1a26';
      circle(ctx, -0.2, -0.66, 0.05); ctx.fill();
      circle(ctx, 0.2, -0.66, 0.05); ctx.fill();
      // 嘴（疲惫的笑）
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.42, 0.19, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      // 手里的工牌
      ctx.fillStyle = '#5ce1e6';
      roundRect(ctx, 0.5, 0.1, 0.34, 0.46, 0.08); ctx.fill();
      ctx.fillStyle = '#0b1026';
      roundRect(ctx, 0.56, 0.2, 0.22, 0.1, 0.03); ctx.fill();
      roundRect(ctx, 0.56, 0.36, 0.22, 0.1, 0.03); ctx.fill();
    },
    'student': function (ctx, t) {
      ctx.fillStyle = '#5b6ee1';
      roundRect(ctx, -0.6, -0.22, 1.2, 1.1, 0.26); ctx.fill();
      // 书包带
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(-0.34, -0.18); ctx.lineTo(-0.2, 0.8);
      ctx.moveTo(0.34, -0.18); ctx.lineTo(0.2, 0.8); ctx.stroke();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.55); ctx.fill();
      ctx.fillStyle = '#241f1c';
      ctx.beginPath(); ctx.arc(0, -0.72, 0.55, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 眼睛
      ctx.fillStyle = '#241f1c';
      circle(ctx, -0.19, -0.62, 0.06); ctx.fill();
      circle(ctx, 0.19, -0.62, 0.06); ctx.fill();
      // 笑
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.4, 0.17, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // 书
      ctx.fillStyle = '#f2c14e';
      roundRect(ctx, 0.46, 0.15, 0.44, 0.34, 0.06); ctx.fill();
      ctx.strokeStyle = '#c89b2c'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(0.46, 0.32); ctx.lineTo(0.9, 0.32); ctx.stroke();
    },
    'birthday-star': function (ctx, t) {
      // 派对帽
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath(); ctx.moveTo(0, -1.7); ctx.lineTo(0.5, -0.85); ctx.lineTo(-0.5, -0.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb703';
      circle(ctx, 0, -1.72, 0.14); ctx.fill();
      // 身体（蛋糕色）
      ctx.fillStyle = '#fff0f6';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.05, 0.3); ctx.fill();
      ctx.fillStyle = '#ffb703';
      roundRect(ctx, -0.66, 0.3, 1.32, 0.22, 0.1); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.68, 0.55); ctx.fill();
      ctx.fillStyle = '#4a2b1f';
      ctx.beginPath(); ctx.arc(0, -0.74, 0.55, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      // 眼睛（笑成弯月）
      ctx.strokeStyle = '#4a2b1f'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(-0.19, -0.66, 0.13, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.19, -0.66, 0.13, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
      // 嘴
      ctx.fillStyle = '#c9526e';
      ctx.beginPath(); ctx.arc(0, -0.38, 0.16, 0, Math.PI); ctx.closePath(); ctx.fill();
      // 手里的礼物
      ctx.fillStyle = '#9bf6ff';
      roundRect(ctx, 0.5, 0.12, 0.4, 0.4, 0.06); ctx.fill();
      ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.moveTo(0.7, 0.12); ctx.lineTo(0.7, 0.52);
      ctx.moveTo(0.5, 0.32); ctx.lineTo(0.9, 0.32); ctx.stroke();
    },
    'sleepy-head': function (ctx, t) {
      const sway = Math.sin((t || 0) * 3) * 0.04;
      ctx.save(); ctx.translate(sway * 6, 0);
      // 睡衣
      ctx.fillStyle = '#8ecae6';
      roundRect(ctx, -0.62, -0.2, 1.24, 1.1, 0.3); ctx.fill();
      // 枕头
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -0.72, 0.35, 1.44, 0.5, 0.22); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.04;
      roundRect(ctx, -0.72, 0.35, 1.44, 0.5, 0.22); ctx.stroke();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.62, 0.55); ctx.fill();
      ctx.fillStyle = '#3a2f2a';
      ctx.beginPath(); ctx.arc(0, -0.7, 0.55, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 睡眼（半闭）
      ctx.strokeStyle = '#3a2f2a'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(-0.3, -0.6); ctx.lineTo(-0.08, -0.6);
      ctx.moveTo(0.08, -0.6); ctx.lineTo(0.3, -0.6); ctx.stroke();
      // 张开的嘴（打哈欠）
      ctx.fillStyle = '#b5705f';
      ctx.beginPath(); ctx.ellipse(0, -0.36, 0.14, 0.1, 0, 0, Math.PI * 2); ctx.fill();
      // zzz
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 0.42px sans-serif';
      ctx.fillText('z', 0.55, -0.95);
      ctx.fillText('z', 0.78, -1.2);
      ctx.restore();
    },
    'hero': function (ctx, t) {
      ctx.fillStyle = '#5ce1e6';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.1, 0.28); ctx.fill();
      ctx.fillStyle = '#0b1026';
      ctx.beginPath(); ctx.moveTo(0, 0.0); ctx.lineTo(0.2, 0.55); ctx.lineTo(0, 1.0); ctx.lineTo(-0.2, 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.55); ctx.fill();
      ctx.fillStyle = '#2b2b3a';
      ctx.beginPath(); ctx.arc(0, -0.72, 0.55, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b2b3a';
      circle(ctx, -0.19, -0.62, 0.07); ctx.fill();
      circle(ctx, 0.19, -0.62, 0.07); ctx.fill();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.38, 0.18, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // 披风
      ctx.fillStyle = 'rgba(92,225,230,0.5)';
      ctx.beginPath();
      ctx.moveTo(-0.6, -0.1); ctx.lineTo(-1.0, 0.9); ctx.lineTo(-0.4, 0.85); ctx.closePath(); ctx.fill();
    },

    /* ---------- v2：12 场景配套主角 ---------- */
    'commuter': function (ctx, t) {
      // 通勤族：风衣 + 单肩包 + 耳机
      ctx.fillStyle = '#4a5a8a';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.15, 0.26); ctx.fill();
      // 风衣翻领
      ctx.fillStyle = '#39476e';
      ctx.beginPath(); ctx.moveTo(-0.28, -0.2); ctx.lineTo(0, 0.36); ctx.lineTo(0.28, -0.2); ctx.closePath(); ctx.fill();
      // 单肩包带
      ctx.strokeStyle = '#c46a3e'; ctx.lineWidth = 0.13;
      ctx.beginPath(); ctx.moveTo(-0.34, -0.16); ctx.lineTo(0.34, 0.86); ctx.stroke();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.68, 0.54); ctx.fill();
      ctx.fillStyle = '#2b241f';
      ctx.beginPath(); ctx.arc(0, -0.74, 0.54, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 耳机
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, -0.7, 0.56, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.fillStyle = '#4a5a8a';
      roundRect(ctx, -0.66, -0.74, 0.16, 0.26, 0.07); ctx.fill();
      roundRect(ctx, 0.5, -0.74, 0.16, 0.26, 0.07); ctx.fill();
      // 眼睛（没睡醒）
      ctx.fillStyle = '#2b241f';
      circle(ctx, -0.19, -0.64, 0.055); ctx.fill();
      circle(ctx, 0.19, -0.64, 0.055); ctx.fill();
      // 嘴（一条线）
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.1, -0.4); ctx.lineTo(0.1, -0.4); ctx.stroke();
      // 手里的手机
      ctx.fillStyle = '#1f2937';
      roundRect(ctx, 0.44, 0.14, 0.3, 0.46, 0.07); ctx.fill();
      ctx.fillStyle = '#60a5fa';
      roundRect(ctx, 0.48, 0.2, 0.22, 0.32, 0.04); ctx.fill();
    },

    'gym-goer': function (ctx, t) {
      // 健身的人：运动背心 + 护腕 + 毛巾
      ctx.fillStyle = '#7dd35f';
      roundRect(ctx, -0.58, -0.2, 1.16, 1.1, 0.26); ctx.fill();
      // 无袖露肩（肤色）
      ctx.fillStyle = '#e3b58c';
      roundRect(ctx, -0.72, -0.24, 0.24, 0.5, 0.12); ctx.fill();
      roundRect(ctx, 0.48, -0.24, 0.24, 0.5, 0.12); ctx.fill();
      // 头
      ctx.fillStyle = '#e3b58c';
      circle(ctx, 0, -0.68, 0.54); ctx.fill();
      ctx.fillStyle = '#33261d';
      ctx.beginPath(); ctx.arc(0, -0.72, 0.54, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 发带
      ctx.fillStyle = '#ff5c5c';
      roundRect(ctx, -0.54, -0.8, 1.08, 0.16, 0.06); ctx.fill();
      // 坚定眼神
      ctx.fillStyle = '#33261d';
      circle(ctx, -0.19, -0.62, 0.06); ctx.fill();
      circle(ctx, 0.19, -0.62, 0.06); ctx.fill();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.42, 0.15, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      // 哑铃
      ctx.fillStyle = '#5b6577';
      roundRect(ctx, -0.92, 0.5, 0.2, 0.26, 0.06); ctx.fill();
      roundRect(ctx, 0.72, 0.5, 0.2, 0.26, 0.06); ctx.fill();
      ctx.fillStyle = '#8b95a7';
      roundRect(ctx, -0.72, 0.56, 1.44, 0.14, 0.05); ctx.fill();
    },

    'exam-taker': function (ctx, t) {
      // 备考的人：校服 + 卷子 + 眼镜
      ctx.fillStyle = '#5b6ee1';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.1, 0.26); ctx.fill();
      // 白衬衫领
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(-0.26, -0.2); ctx.lineTo(0, 0.24); ctx.lineTo(0.26, -0.2); ctx.closePath(); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.68, 0.54); ctx.fill();
      ctx.fillStyle = '#241f1c';
      ctx.beginPath(); ctx.arc(0, -0.74, 0.54, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 眼镜
      ctx.strokeStyle = '#1a1a26'; ctx.lineWidth = 0.07;
      circle(ctx, -0.2, -0.64, 0.16); ctx.stroke();
      circle(ctx, 0.2, -0.64, 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.04, -0.64); ctx.lineTo(0.04, -0.64); ctx.stroke();
      ctx.fillStyle = '#1a1a26';
      circle(ctx, -0.2, -0.64, 0.05); ctx.fill();
      circle(ctx, 0.2, -0.64, 0.05); ctx.fill();
      // 紧张的笑
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.12, -0.4); ctx.lineTo(0.12, -0.4); ctx.stroke();
      // 手里的卷子
      ctx.fillStyle = '#fdf9f0';
      roundRect(ctx, 0.42, 0.1, 0.5, 0.6, 0.05); ctx.fill();
      ctx.strokeStyle = '#9aa3b2'; ctx.lineWidth = 0.045;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(0.48, 0.24 + i * 0.14); ctx.lineTo(0.86, 0.24 + i * 0.14); ctx.stroke();
      }
      ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(0.52, 0.3); ctx.lineTo(0.7, 0.46); ctx.moveTo(0.7, 0.3); ctx.lineTo(0.52, 0.46); ctx.stroke();
    },

    'chef': function (ctx, t) {
      // 下厨的人：围裙 + 厨师帽 + 锅铲
      ctx.fillStyle = '#e8e4dc';
      roundRect(ctx, -0.58, -0.18, 1.16, 1.1, 0.24); ctx.fill();
      // 围裙
      ctx.fillStyle = '#d97757';
      roundRect(ctx, -0.42, 0.1, 0.84, 0.82, 0.12); ctx.fill();
      // 帽
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -0.46, -1.28, 0.92, 0.4, 0.1); ctx.fill();
      circle(ctx, -0.28, -1.3, 0.22); ctx.fill();
      circle(ctx, 0, -1.34, 0.24); ctx.fill();
      circle(ctx, 0.28, -1.3, 0.22); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.54); ctx.fill();
      ctx.fillStyle = '#3a2f2a';
      ctx.beginPath(); ctx.arc(0, -0.7, 0.54, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
      // 眼睛
      ctx.fillStyle = '#3a2f2a';
      circle(ctx, -0.19, -0.62, 0.06); ctx.fill();
      circle(ctx, 0.19, -0.62, 0.06); ctx.fill();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.4, 0.17, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // 锅铲
      ctx.fillStyle = '#8b95a7';
      roundRect(ctx, 0.56, 0.06, 0.1, 0.66, 0.04); ctx.fill();
      ctx.fillStyle = '#5b6577';
      roundRect(ctx, 0.44, 0.66, 0.34, 0.26, 0.06); ctx.fill();
    },

    'cat-owner': function (ctx, t) {
      // 铲屎官：卫衣 + 怀里的猫 + 粘毛
      ctx.fillStyle = '#8b7cf6';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.12, 0.28); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.54); ctx.fill();
      ctx.fillStyle = '#2b2b3a';
      ctx.beginPath(); ctx.arc(0, -0.72, 0.54, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 眼睛（笑着）
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(-0.19, -0.66, 0.11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.19, -0.66, 0.11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.4, 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // 怀里的猫（灰）
      ctx.fillStyle = '#8b8b9e';
      circle(ctx, 0.05, 0.52, 0.36); ctx.fill();
      // 猫耳
      ctx.beginPath();
      ctx.moveTo(-0.16, 0.3); ctx.lineTo(-0.1, 0.02); ctx.lineTo(0.1, 0.24); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.26, 0.3); ctx.lineTo(0.2, 0.02); ctx.lineTo(0.02, 0.24); ctx.closePath(); ctx.fill();
      // 猫脸
      ctx.fillStyle = '#1a1a26';
      circle(ctx, -0.08, 0.46, 0.04); ctx.fill();
      circle(ctx, 0.18, 0.46, 0.04); ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath(); ctx.moveTo(0.05, 0.56); ctx.lineTo(0.11, 0.56); ctx.lineTo(0.08, 0.62); ctx.closePath(); ctx.fill();
    },

    'traveler': function (ctx, t) {
      // 旅行的人：冲锋衣 + 行李箱 + 相机
      ctx.fillStyle = '#2f9e8f';
      roundRect(ctx, -0.6, -0.2, 1.2, 1.12, 0.28); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.54); ctx.fill();
      // 帽子
      ctx.fillStyle = '#e8a33d';
      roundRect(ctx, -0.62, -0.94, 1.24, 0.14, 0.05); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -0.94, 0.5, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      // 眼睛
      ctx.fillStyle = '#3a2f2a';
      circle(ctx, -0.19, -0.6, 0.06); ctx.fill();
      circle(ctx, 0.19, -0.6, 0.06); ctx.fill();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.38, 0.17, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      // 行李箱
      ctx.fillStyle = '#4a5a8a';
      roundRect(ctx, 0.4, 0.3, 0.56, 0.66, 0.08); ctx.fill();
      ctx.strokeStyle = '#39476e'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0.68, 0.3, 0.2, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c46a3e';
      roundRect(ctx, 0.44, 0.56, 0.48, 0.07, 0.03); ctx.fill();
      roundRect(ctx, 0.44, 0.74, 0.48, 0.07, 0.03); ctx.fill();
      // 相机
      ctx.fillStyle = '#1f2937';
      roundRect(ctx, -0.86, 0.34, 0.44, 0.34, 0.06); ctx.fill();
      ctx.fillStyle = '#60a5fa';
      circle(ctx, -0.64, 0.51, 0.09); ctx.fill();
    },

    'shopper': function (ctx, t) {
      // 网购的人：便服 + 一堆纸箱
      ctx.fillStyle = '#e07a5f';
      roundRect(ctx, -0.58, -0.2, 1.16, 1.1, 0.26); ctx.fill();
      // 头
      ctx.fillStyle = '#f7d9b8';
      circle(ctx, 0, -0.66, 0.54); ctx.fill();
      ctx.fillStyle = '#4a2b1f';
      ctx.beginPath(); ctx.arc(0, -0.7, 0.54, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      // 眼睛（兴奋）
      ctx.fillStyle = '#3a2f2a';
      circle(ctx, -0.19, -0.62, 0.07); ctx.fill();
      circle(ctx, 0.19, -0.62, 0.07); ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, -0.17, -0.64, 0.025); ctx.fill();
      circle(ctx, 0.21, -0.64, 0.025); ctx.fill();
      ctx.strokeStyle = '#b5705f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.4, 0.16, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke();
      // 抱着纸箱
      ctx.fillStyle = '#c9955c';
      roundRect(ctx, -0.5, 0.32, 1.0, 0.62, 0.06); ctx.fill();
      ctx.strokeStyle = '#a67847'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(-0.5, 0.52); ctx.lineTo(0.5, 0.52); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0.32); ctx.lineTo(0, 0.94); ctx.stroke();
      ctx.fillStyle = '#8b5e34';
      roundRect(ctx, -0.14, 0.4, 0.28, 0.14, 0.03); ctx.fill();
    },
  };

  /* ---------------- 障碍素材（size 为半径） ---------------- */
  const OBSTACLE_DRAW = {
    'document': function (ctx, size, theme) {
      const w = size * 1.5, h = size * 1.9;
      ctx.fillStyle = '#fdf9f0';
      roundRect(ctx, -w / 2, -h / 2, w, h, size * 0.16); ctx.fill();
      // 折角
      ctx.fillStyle = '#d8d2c4';
      ctx.beginPath();
      ctx.moveTo(w / 2 - size * 0.5, -h / 2);
      ctx.lineTo(w / 2, -h / 2 + size * 0.5);
      ctx.lineTo(w / 2 - size * 0.5, -h / 2 + size * 0.5);
      ctx.closePath(); ctx.fill();
      // 文本行
      ctx.strokeStyle = theme.danger; ctx.lineWidth = size * 0.13; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const y = -h / 2 + size * 0.5 + i * size * 0.36;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + size * 0.28, y);
        ctx.lineTo(w / 2 - size * (i === 3 ? 0.9 : 0.28), y);
        ctx.stroke();
      }
      // 红章
      ctx.strokeStyle = theme.danger; ctx.lineWidth = size * 0.1;
      circle(ctx, w / 2 - size * 0.42, h / 2 - size * 0.45, size * 0.34); ctx.stroke();
    },
    'message-bubble': function (ctx, size, theme) {
      ctx.fillStyle = theme.obstacleTint;
      roundRect(ctx, -size, -size * 0.85, size * 2, size * 1.5, size * 0.45); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-size * 0.45, size * 0.62); ctx.lineTo(-size * 0.15, size * 0.62); ctx.lineTo(-size * 0.5, size * 1.15);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) circle(ctx, -size * 0.45 + i * size * 0.44, -size * 0.1, size * 0.15), ctx.fill();
      // 感叹号
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, size * 0.62, -size * 0.5, size * 0.16, size * 0.6, size * 0.08); ctx.fill();
      circle(ctx, size * 0.7, size * 0.3, size * 0.1); ctx.fill();
    },
    'alarm-clock': function (ctx, size, theme) {
      // 铃
      ctx.fillStyle = theme.obstacleTint;
      circle(ctx, -size * 0.72, -size * 0.78, size * 0.3); ctx.fill();
      circle(ctx, size * 0.72, -size * 0.78, size * 0.3); ctx.fill();
      // 表壳
      ctx.fillStyle = '#ffd166';
      circle(ctx, 0, 0, size); ctx.fill();
      ctx.fillStyle = '#fff8e7';
      circle(ctx, 0, 0, size * 0.78); ctx.fill();
      // 指针
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = size * 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -size * 0.48); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 0.4, size * 0.16); ctx.stroke();
      circle(ctx, 0, 0, size * 0.1); ctx.fillStyle = '#2b2b3a'; ctx.fill();
    },
    'rain-cloud': function (ctx, size, theme) {
      ctx.fillStyle = theme.obstacleTint;
      circle(ctx, -size * 0.45, 0, size * 0.5); ctx.fill();
      circle(ctx, 0.05 * size, -size * 0.28, size * 0.62); ctx.fill();
      circle(ctx, size * 0.5, 0, size * 0.45); ctx.fill();
      roundRect(ctx, -size * 0.75, -size * 0.1, size * 1.6, size * 0.52, size * 0.26); ctx.fill();
      // 雨滴
      ctx.fillStyle = '#7fd1ff';
      for (let i = 0; i < 3; i++) {
        const x = -size * 0.5 + i * size * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, size * 0.5); ctx.lineTo(x + size * 0.1, size * 0.85); ctx.lineTo(x - size * 0.1, size * 0.85);
        ctx.closePath(); ctx.fill();
      }
    },
    'homework': function (ctx, size, theme) {
      const colors = ['#c8d8ff', '#a9c0f5', '#8fa9e8'];
      for (let i = 2; i >= 0; i--) {
        ctx.fillStyle = colors[i];
        roundRect(ctx, -size * 0.9 + i * size * 0.06, -size * 0.7 + i * size * 0.28, size * 1.8, size * 0.7, size * 0.12); ctx.fill();
        ctx.strokeStyle = 'rgba(20,30,60,0.25)'; ctx.lineWidth = size * 0.05;
        ctx.beginPath();
        ctx.moveTo(-size * 0.6 + i * size * 0.06, -size * 0.5 + i * size * 0.28);
        ctx.lineTo(size * 0.4 + i * size * 0.06, -size * 0.5 + i * size * 0.28);
        ctx.stroke();
      }
    },
    'coffee-cup': function (ctx, size, theme) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.6, -size * 0.55); ctx.lineTo(size * 0.6, -size * 0.55);
      ctx.lineTo(size * 0.42, size * 0.7); ctx.lineTo(-size * 0.42, size * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8b5e3c';
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, -size * 0.3); ctx.lineTo(size * 0.55, -size * 0.3);
      ctx.lineTo(size * 0.4, size * 0.62); ctx.lineTo(-size * 0.4, size * 0.62);
      ctx.closePath(); ctx.fill();
      // 盖子
      ctx.fillStyle = '#e8e8ee';
      roundRect(ctx, -size * 0.72, -size * 0.8, size * 1.44, size * 0.26, size * 0.1); ctx.fill();
      // 洒出的咖啡
      ctx.fillStyle = '#8b5e3c';
      ctx.beginPath(); ctx.ellipse(size * 0.85, size * 0.6, size * 0.4, size * 0.18, 0.3, 0, Math.PI * 2); ctx.fill();
    },
    'cat': function (ctx, size, theme) {
      ctx.fillStyle = '#8b8b9e';
      circle(ctx, 0, size * 0.1, size * 0.8); ctx.fill();
      // 耳朵
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, -size * 0.3); ctx.lineTo(-size * 0.45, -size * 1.0); ctx.lineTo(-size * 0.12, -size * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size * 0.7, -size * 0.3); ctx.lineTo(size * 0.45, -size * 1.0); ctx.lineTo(size * 0.12, -size * 0.45);
      ctx.closePath(); ctx.fill();
      // 眼睛（发亮）
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.ellipse(-size * 0.3, size * 0.05, size * 0.16, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.3, size * 0.05, size * 0.16, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a26';
      ctx.beginPath(); ctx.ellipse(-size * 0.3, size * 0.05, size * 0.06, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.3, size * 0.05, size * 0.06, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      // 胡须
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = size * 0.06;
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, size * 0.45); ctx.lineTo(-size * 1.05, size * 0.3);
      ctx.moveTo(-size * 0.55, size * 0.6); ctx.lineTo(-size * 1.05, size * 0.65);
      ctx.moveTo(size * 0.55, size * 0.45); ctx.lineTo(size * 1.05, size * 0.3);
      ctx.moveTo(size * 0.55, size * 0.6); ctx.lineTo(size * 1.05, size * 0.65);
      ctx.stroke();
    },
    'wrench': function (ctx, size, theme) {
      ctx.save();
      ctx.rotate(-0.55);
      ctx.strokeStyle = '#b8c0d4'; ctx.lineWidth = size * 0.42; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0, size * 0.9); ctx.lineTo(0, -size * 0.35); ctx.stroke();
      // 开口扳手头
      ctx.fillStyle = '#b8c0d4';
      ctx.beginPath();
      ctx.arc(0, -size * 0.5, size * 0.52, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = (theme && theme.bg && theme.bg[1]) || '#141a3d';
      roundRect(ctx, -size * 0.2, -size * 1.05, size * 0.4, size * 0.62, size * 0.08); ctx.fill();
      // 手柄纹理
      ctx.strokeStyle = 'rgba(20,26,60,0.35)'; ctx.lineWidth = size * 0.08;
      for (let i = 0; i < 3; i++) {
        const y = size * 0.2 + i * size * 0.22;
        ctx.beginPath(); ctx.moveTo(-size * 0.16, y); ctx.lineTo(size * 0.16, y); ctx.stroke();
      }
      ctx.restore();
    },
  };

  /* ---------------- 奖励素材 ---------------- */
  const COLLECTIBLE_DRAW = {
    'ticket': function (ctx, size, theme) {
      const w = size * 2, h = size * 1.3;
      ctx.fillStyle = theme.accent;
      roundRect(ctx, -w / 2, -h / 2, w, h, size * 0.22); ctx.fill();
      // 票孔
      ctx.fillStyle = 'rgba(11,16,38,0.35)';
      circle(ctx, -w / 2 + size * 0.28, -h / 2 + size * 0.28, size * 0.15); ctx.fill();
      circle(ctx, -w / 2 + size * 0.28, h / 2 - size * 0.28, size * 0.15); ctx.fill();
      circle(ctx, w / 2 - size * 0.28, -h / 2 + size * 0.28, size * 0.15); ctx.fill();
      circle(ctx, w / 2 - size * 0.28, h / 2 - size * 0.28, size * 0.15); ctx.fill();
      // 虚线
      ctx.strokeStyle = 'rgba(11,16,38,0.4)'; ctx.lineWidth = size * 0.09;
      ctx.setLineDash([size * 0.16, size * 0.14]);
      ctx.beginPath(); ctx.moveTo(size * 0.42, -h / 2); ctx.lineTo(size * 0.42, h / 2); ctx.stroke();
      ctx.setLineDash([]);
      // 对勾（下班）
      ctx.strokeStyle = '#0b1026'; ctx.lineWidth = size * 0.17; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-size * 0.62, 0); ctx.lineTo(-size * 0.25, size * 0.32); ctx.lineTo(size * 0.12, -size * 0.3);
      ctx.stroke();
    },
    'cake': function (ctx, size, theme) {
      // 底层
      ctx.fillStyle = '#ffb703';
      roundRect(ctx, -size, -size * 0.15, size * 2, size * 0.95, size * 0.2); ctx.fill();
      // 奶油
      ctx.fillStyle = '#fff0f6';
      roundRect(ctx, -size, -size * 0.4, size * 2, size * 0.4, size * 0.16); ctx.fill();
      // 草莓
      ctx.fillStyle = '#ff5d8f';
      circle(ctx, -size * 0.4, -size * 0.5, size * 0.2); ctx.fill();
      circle(ctx, size * 0.4, -size * 0.5, size * 0.2); ctx.fill();
      // 蜡烛
      ctx.fillStyle = '#9bf6ff';
      roundRect(ctx, -size * 0.08, -size * 1.25, size * 0.16, size * 0.85, size * 0.06); ctx.fill();
      // 火焰
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.75); ctx.quadraticCurveTo(size * 0.2, -size * 1.4, 0, -size * 1.2);
      ctx.quadraticCurveTo(-size * 0.2, -size * 1.4, 0, -size * 1.75);
      ctx.fill();
    },
    'milk-tea': function (ctx, size, theme) {
      // 杯身
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, -size * 0.85); ctx.lineTo(size * 0.55, -size * 0.85);
      ctx.lineTo(size * 0.4, size * 0.9); ctx.lineTo(-size * 0.4, size * 0.9);
      ctx.closePath(); ctx.fill();
      // 奶茶
      ctx.fillStyle = '#c68b59';
      ctx.beginPath();
      ctx.moveTo(-size * 0.51, -size * 0.4); ctx.lineTo(size * 0.51, -size * 0.4);
      ctx.lineTo(size * 0.4, size * 0.85); ctx.lineTo(-size * 0.4, size * 0.85);
      ctx.closePath(); ctx.fill();
      // 珍珠
      ctx.fillStyle = '#4a2b1f';
      circle(ctx, -size * 0.2, size * 0.55, size * 0.12); ctx.fill();
      circle(ctx, size * 0.15, size * 0.62, size * 0.12); ctx.fill();
      circle(ctx, -0.02 * size, size * 0.36, size * 0.12); ctx.fill();
      circle(ctx, size * 0.28, size * 0.3, size * 0.11); ctx.fill();
      // 吸管
      ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = size * 0.14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(size * 0.12, -size * 1.25); ctx.lineTo(size * 0.24, -size * 0.6); ctx.stroke();
      // 封膜
      ctx.fillStyle = '#ffd166';
      roundRect(ctx, -size * 0.62, -size * 1.0, size * 1.24, size * 0.2, size * 0.08); ctx.fill();
    },
    'pillow': function (ctx, size, theme) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -size, -size * 0.66, size * 2, size * 1.32, size * 0.4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = size * 0.07;
      roundRect(ctx, -size, -size * 0.66, size * 2, size * 1.32, size * 0.4); ctx.stroke();
      // 缝线
      ctx.setLineDash([size * 0.1, size * 0.12]);
      ctx.beginPath();
      ctx.moveTo(-size * 0.82, 0); ctx.lineTo(size * 0.82, 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.stroke();
      ctx.setLineDash([]);
      // 月牙
      ctx.fillStyle = '#c8b6ff';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(size * 0.14, -size * 0.06, size * 0.3, 0, Math.PI * 2); ctx.fill();
    },
    'star': function (ctx, size, theme) {
      ctx.fillStyle = theme.collectibleGlow;
      star(ctx, 0, 0, size * 1.15, size * 0.5, 5, 0); ctx.fill();
      ctx.fillStyle = '#ffffff';
      star(ctx, 0, 0, size * 0.52, size * 0.22, 5, 0); ctx.fill();
    },
    'coin': function (ctx, size, theme) {
      ctx.fillStyle = '#ffd166';
      circle(ctx, 0, 0, size); ctx.fill();
      ctx.fillStyle = '#e2a72e';
      circle(ctx, 0, 0, size * 0.82); ctx.fill();
      ctx.fillStyle = '#ffd166';
      circle(ctx, 0, 0, size * 0.66); ctx.fill();
      ctx.fillStyle = '#b5821d';
      ctx.font = 'bold ' + (size * 1.1) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('¥', 0, size * 0.06);
    },
    'coffee': function (ctx, size, theme) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.6, -size * 0.7); ctx.lineTo(size * 0.6, -size * 0.7);
      ctx.lineTo(size * 0.42, size * 0.9); ctx.lineTo(-size * 0.42, size * 0.9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2f2f7';
      roundRect(ctx, -size * 0.72, -size * 0.95, size * 1.44, size * 0.3, size * 0.12); ctx.fill();
      ctx.fillStyle = '#c68b59';
      roundRect(ctx, -size * 0.52, -size * 0.55, size * 1.04, size * 0.3, size * 0.1); ctx.fill();
      // 热气
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-size * 0.2, -size * 1.25); ctx.quadraticCurveTo(-size * 0.05, -size * 1.45, -size * 0.2, -size * 1.65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size * 0.2, -size * 1.25); ctx.quadraticCurveTo(size * 0.35, -size * 1.45, size * 0.2, -size * 1.65); ctx.stroke();
    },
    'gift': function (ctx, size, theme) {
      ctx.fillStyle = '#9bf6ff';
      roundRect(ctx, -size * 0.85, -size * 0.5, size * 1.7, size * 1.3, size * 0.1); ctx.fill();
      ctx.fillStyle = '#ff5d8f';
      roundRect(ctx, -size * 0.95, -size * 0.75, size * 1.9, size * 0.35, size * 0.1); ctx.fill();
      roundRect(ctx, -size * 0.15, -size * 0.75, size * 0.3, size * 1.55, size * 0.04); ctx.fill();
      // 蝴蝶结
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.ellipse(-size * 0.32, -size * 0.95, size * 0.3, size * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(size * 0.32, -size * 0.95, size * 0.3, size * 0.2, 0.5, 0, Math.PI * 2); ctx.fill();
    },
    'takeout-box': function (ctx, size, theme) {
      // 盒身
      ctx.fillStyle = '#f0c088';
      ctx.beginPath();
      ctx.moveTo(-size * 0.9, -size * 0.3); ctx.lineTo(size * 0.9, -size * 0.3);
      ctx.lineTo(size * 0.7, size * 0.85); ctx.lineTo(-size * 0.7, size * 0.85);
      ctx.closePath(); ctx.fill();
      // 折盖
      ctx.fillStyle = '#f7d9b0';
      roundRect(ctx, -size * 0.96, -size * 0.62, size * 1.92, size * 0.34, size * 0.1); ctx.fill();
      // 提手
      ctx.strokeStyle = '#c99a5e'; ctx.lineWidth = size * 0.14;
      ctx.beginPath(); ctx.arc(0, -size * 0.62, size * 0.34, Math.PI, Math.PI * 2); ctx.stroke();
      // 香气
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-size * 0.3, -size * 1.2); ctx.quadraticCurveTo(-size * 0.15, -size * 1.4, -size * 0.3, -size * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size * 0.3, -size * 1.2); ctx.quadraticCurveTo(size * 0.45, -size * 1.4, size * 0.3, -size * 1.6); ctx.stroke();
      // 盒身标签
      ctx.fillStyle = '#c0392b';
      roundRect(ctx, -size * 0.3, size * 0.05, size * 0.6, size * 0.4, size * 0.08); ctx.fill();
    },
    'fish': function (ctx, size, theme) {
      // 身体
      ctx.fillStyle = '#8ecae6';
      ctx.beginPath();
      ctx.ellipse(-size * 0.1, 0, size * 0.85, size * 0.52, 0, 0, Math.PI * 2); ctx.fill();
      // 尾巴
      ctx.fillStyle = '#6fb0cc';
      ctx.beginPath();
      ctx.moveTo(size * 0.66, 0); ctx.lineTo(size * 1.3, -size * 0.5); ctx.lineTo(size * 1.3, size * 0.5);
      ctx.closePath(); ctx.fill();
      // 眼睛
      ctx.fillStyle = '#ffffff';
      circle(ctx, -size * 0.55, -size * 0.14, size * 0.2); ctx.fill();
      ctx.fillStyle = '#1a1a26';
      circle(ctx, -size * 0.58, -size * 0.14, size * 0.1); ctx.fill();
      // 鳍
      ctx.fillStyle = '#a8d8ea';
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, size * 0.3); ctx.quadraticCurveTo(size * 0.15, size * 0.95, size * 0.45, size * 0.35);
      ctx.closePath(); ctx.fill();
      // 鳞
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = size * 0.06;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-size * 0.15 + i * size * 0.3, 0, size * 0.26, -0.7, 0.7);
        ctx.stroke();
      }
    },
  };

  function drawAvatar(ctx, avatarId, r, t) {
    const fn = AVATAR_DRAW[avatarId] || AVATAR_DRAW['hero'];
    ctx.save();
    ctx.scale(r, r);
    fn(ctx, t || 0);
    ctx.restore();
  }

  function drawObstacle(ctx, spriteId, size, theme) {
    const th = theme || getTheme('office-neon');
    ctx.save();
    /* v2 新素材路由到 art-scenes.js；旧素材仍由本文件绘制。
     * art-scenes 不存在时（例如旧缓存）安全回退到内置绘制。 */
    const art = (typeof window !== 'undefined') ? window.GengArt : null;
    if (art && art.drawObstacleArt && art.drawObstacleArt(ctx, spriteId, size, th)) { ctx.restore(); return; }
    const fn = OBSTACLE_DRAW[spriteId] || OBSTACLE_DRAW['document'];
    fn(ctx, size, th);
    ctx.restore();
  }

  function drawCollectible(ctx, spriteId, size, theme) {
    const th = theme || getTheme('office-neon');
    ctx.save();
    const art = (typeof window !== 'undefined') ? window.GengArt : null;
    if (art && art.drawCollectibleArt && art.drawCollectibleArt(ctx, spriteId, size, th)) { ctx.restore(); return; }
    const fn = COLLECTIBLE_DRAW[spriteId] || COLLECTIBLE_DRAW['star'];
    fn(ctx, size, th);
    ctx.restore();
  }

  /* 生成一个缩略图 dataURL（用于首页预览和结算页装饰） */
  function thumbDataUrl(kind, spriteId, themeId, px) {
    const size = px || 96;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const th = getTheme(themeId);
    ctx.translate(size / 2, size / 2);
    if (kind === 'player') drawAvatar(ctx, spriteId, size * 0.3, 0);
    else if (kind === 'obstacle') drawObstacle(ctx, spriteId, size * 0.22, th);
    else drawCollectible(ctx, spriteId, size * 0.26, th);
    return c.toDataURL('image/png');
  }

  /* ---------------- v2：场景 -> 调色板 ----------------
   * 场景定义在 shared/scenes.js（服务端与浏览器共用）。浏览器端由页面先加载
   * shared/scenes.js（挂到 window.GengScenes），这里从它取调色板与背景 id。
   * 兼容：场景缺失时回退到 v1 主题，保证旧分享链接的颜色不变。 */
  function getScenePalette(sceneId) {
    const defs = (typeof window !== 'undefined') ? window.GengScenes : null;
    if (defs && defs.SCENES && defs.SCENES[sceneId]) return defs.SCENES[sceneId].palette;
    return getTheme(sceneId);
  }

  function getSceneDef(sceneId) {
    const defs = (typeof window !== 'undefined') ? window.GengScenes : null;
    if (defs && defs.SCENES && defs.SCENES[sceneId]) return defs.SCENES[sceneId];
    return null;
  }

  /* 绘制场景背景（v2）：由 art-scenes.js 提供 12 套有辨识度的背景。
   * 调用方负责先画底色渐变；这里只叠加场景元素。 */
  function drawSceneBackground(ctx, sceneId, w, h, palette, t) {
    const art = (typeof window !== 'undefined') ? window.GengArt : null;
    if (art && art.drawScene) { art.drawScene(ctx, sceneId, w, h, palette, t || 0); return true; }
    return false;
  }

  return {
    THEMES: THEMES,
    getTheme: getTheme,
    getScenePalette: getScenePalette,
    getSceneDef: getSceneDef,
    drawSceneBackground: drawSceneBackground,
    drawAvatar: drawAvatar,
    drawObstacle: drawObstacle,
    drawCollectible: drawCollectible,
    thumbDataUrl: thumbDataUrl,
    roundRect: roundRect,
    circle: circle,
    star: star,
    heart: heart,
  };
})();

if (typeof window !== 'undefined') window.GengTheme = GengTheme;
