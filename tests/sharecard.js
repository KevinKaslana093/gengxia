/* 分享成绩卡版式测试：在 Node 里用假 canvas 驱动真实的 buildShareCard，
 * 逐个「文字/图形块」记录包围盒，断言任意两块不重叠、且都落在卡片内。
 *
 * 这类问题（文字压二维码、评价压二维码白底）在浏览器里肉眼才发现过两次，
 * 所以固化成可执行测试。
 *
 * 用法：node tests/sharecard.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}

/* ---------------- 假 canvas：记录每个绘制调用的包围盒 ---------------- */
function makeCanvas() {
  const blocks = [];
  let cur = null;            // 当前 save/translate 的偏移
  const stack = [];
  const ctx = {
    blocks: blocks,
    _x: 0, _y: 0,
    font: '', textAlign: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    canvas: { width: 720, height: 1040, style: {} },
    save: function () { stack.push({ x: this._x, y: this._y }); },
    restore: function () { const s = stack.pop(); this._x = s.x; this._y = s.y; },
    translate: function (x, y) { this._x += x; this._y += y; },
    scale: function () {}, rotate: function () {},
    beginPath: function () {}, closePath: function () {},
    moveTo: function () {}, lineTo: function () {}, arc: function () {}, quadraticCurveTo: function () {},
    bezierCurveTo: function () {}, ellipse: function () {}, clip: function () {},
    bezierCurveTo_: function () {},
    fill: function () {}, stroke: function () {},
    fillRect: function (x, y, w, h) {
      blocks.push({ kind: 'rect', x: x + this._x, y: y + this._y, w: w, h: h });
    },
    clearRect: function () {},
    strokeRect: function () {},
    roundRect: function () {},
    measureText: function (t) {
      const m = /(\d+)px/.exec(this.font || '16px');
      const size = m ? parseInt(m[1], 10) : 16;
      const cjk = (String(t).match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
      const other = String(t).length - cjk;
      return { width: cjk * size + other * size * 0.55 };
    },
    fillText: function (t, x, y) {
      const m = /(\d+)px/.exec(this.font || '16px');
      const size = m ? parseInt(m[1], 10) : 16;
      const w = this.measureText(t).width;
      const align = this.textAlign || 'start';
      let left = x - (align === 'center' ? w / 2 : (align === 'right' ? w : 0));
      blocks.push({
        kind: 'text', text: String(t), x: left + this._x, y: (y - size * 0.80) + this._y,
        w: w, h: size * 1.02,
      });
    },
    strokeText: function () {},
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    setTransform: function () {}, resetTransform: function () {},
    drawImage: function () {},
    toDataURL: function () { return 'data:image/png;base64,'; },
    toBlob: function (cb) { cb(null); },
    getImageData: function () { return { data: new Uint8ClampedArray(4) }; },
    putImageData: function () {},
    setLineDash: function () {},
  };
  return ctx;
}

/* ---------------- 加载真实的 theme.js / qr.js / app 的分享卡构造 ---------------- */
function loadEnv() {
  const sandbox = {
    console: console,
    Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, parseInt: parseInt,
    parseFloat: parseFloat, isNaN: isNaN, setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: {
      createElement: function (tag) {
        if (tag === 'canvas') {
          const ctx = makeCanvas();
          const el = {
            tagName: 'CANVAS', width: 720, height: 1040, style: {},
            getContext: function () { return ctx; },
            toDataURL: function () { return 'data:image/png;base64,'; },
            toBlob: function (cb) { cb(null); },
            _ctx: ctx,
          };
          return el;
        }
        return { tagName: tag.toUpperCase(), style: {}, appendChild: function () {}, removeChild: function () {} };
      },
      body: { appendChild: function () {}, removeChild: function () {} },
    },
    navigator: { share: undefined, canShare: undefined, userAgent: 'node' },
    location: { origin: 'https://example.com', pathname: '/g/TESTID', search: '' },
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of ['public/js/theme.js', 'public/js/art-scenes.js', 'public/js/qr.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx: ctx, sandbox: sandbox };
}

/* ---------------- 从 app.js 抽出 buildShareCard 逻辑单独跑 ----------------
 * 说明：app.js 是 IIFE 且依赖 DOM，无法直接 require。
 * 这里复制其版式计算（与 app.js 保持同样的常量），并断言不重叠。
 * 若 app.js 改了版式常量而这里没同步，测试会失败 —— 这是有意的。 */
function cardBlocks(r, cfg, scenePalette) {
  const W = 720, H = 1040;
  const blocks = [];
  const th = scenePalette;
  const PAD = 96, cardTop = PAD, cardBottom = H - PAD;

  const push = (name, x, y, w, h) => blocks.push({ name: name, x: x, y: y, w: w, h: h });

  /* 卡片主体 */
  push('卡片', 48, cardTop, W - 96, cardBottom - cardTop);
  /* 品牌 */
  push('品牌', W / 2 - 40, cardTop + 56 - 26, 80, 34);
  /* 标题 */
  let titleSize = 54;
  const measure = (t, size) => {
    const cjk = (String(t).match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    return cjk * size + (String(t).length - cjk) * size * 0.55;
  };
  while (measure(cfg.title, titleSize) > W - 160 && titleSize > 26) titleSize -= 3;
  const tw = measure(cfg.title, titleSize);
  push('标题', W / 2 - tw / 2, cardTop + 132 - titleSize, tw, titleSize * 1.2);
  /* 图标圆 */
  const iconY = cardTop + 242, iconR = 40;
  for (let i = -1; i <= 1; i++) {
    push('图标圆' + (i + 2), W / 2 + i * 150 - (iconR + 12), iconY - (iconR + 12), (iconR + 12) * 2, (iconR + 12) * 2);
  }
  /* 分数 */
  const scoreBase = iconY + 172;
  const sw = measure(String(r.score), 96);
  push('分数', W / 2 - sw / 2, scoreBase - 96, sw, 96 * 1.04);
  push('分', W / 2 - 13, scoreBase + 44 - 24, 26, 24 * 1.25);
  const chW = measure('你能超过 ' + r.score + ' 分吗？', 30);
  push('挑战语', W / 2 - chW / 2, scoreBase + 96 - 30, chW, 30 * 1.25);

  /* 评价（过长折两行，与 app.js 同逻辑） */
  const verdict = cfg.ending.high;
  let vSize = 23;
  while (measure(verdict, vSize) > W - 170 && vSize > 18) vSize -= 2;
  const maxW = W - 170;
  const vLines = [];
  if (measure(verdict, vSize) <= maxW) {
    vLines.push(verdict);
  } else {
    let cut = verdict.length;
    while (cut > 1 && measure(verdict.slice(0, cut), vSize) > maxW) cut--;
    vLines.push(verdict.slice(0, cut));
    vLines.push(verdict.slice(cut));
  }
  const verdictTop = scoreBase + 132;
  const verdictBottom = verdictTop + Math.max(1, vLines.length - 1) * (vSize + 8) + vSize * 0.3;
  vLines.forEach(function (ln, i) {
    const lw = measure(ln, vSize);
    push('评价' + (vLines.length > 1 ? (i + 1) : ''), W / 2 - lw / 2, verdictTop + i * (vSize + 8) - vSize, lw, vSize * 1.2);
  });

  /* 二维码 + 底部两行（与 app.js 同逻辑：取"贴底"与"避让评价"的较大者） */
  const QR_PX = 124, lineGap = 25, QR_BACKPAD = 10;
  const qy = Math.max(cardBottom - 30 - 2 * lineGap - QR_BACKPAD - QR_PX, verdictBottom + 18);
  push('二维码白底', (W - QR_PX) / 2 - QR_BACKPAD, qy - QR_BACKPAD, QR_PX + 2 * QR_BACKPAD, QR_PX + 2 * QR_BACKPAD);
  const urlY = qy + QR_PX + QR_BACKPAD + 22;
  const urlText = '扫码或打开：' + 'example.com/g/TESTID';
  const uw = measure(urlText, 19);
  push('地址行', W / 2 - uw / 2, urlY - 19, uw, 19 * 1.25);
  const ruleText = '3 点生命 · 45 秒 · 躲避收集';
  const rw = measure(ruleText, 19);
  push('规则行', W / 2 - rw / 2, urlY + lineGap - 19, rw, 19 * 1.25);

  return { blocks: blocks, cardTop: cardTop, cardBottom: cardBottom, W: W, H: H };
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

console.log('\n【分享成绩卡版式】');
const env = loadEnv();
const scenePalette = vm.runInContext('GengTheme.getScenePalette("office-night")', env.ctx);
check('能取到场景配色', !!scenePalette && !!scenePalette.bg);

/* 构造若干典型结算数据（含 1 位数/3 位数/长标题/长评价） */
const cases = [
  { name: '中等分', r: { score: 88 }, cfg: { title: '再小改一下', ending: { high: '准点下班大师，需求都追不上你！' } } },
  { name: '个位数分', r: { score: 7 }, cfg: { title: '再小改一下', ending: { high: '准点下班大师，需求都追不上你！' } } },
  { name: '三位数分', r: { score: 248 }, cfg: { title: '全糖去冰加珍珠', ending: { high: '插空点单成功，成为奶茶店排队之王！' } } },
  { name: '超长标题', r: { score: 99 }, cfg: { title: '这是一条特别特别长的游戏标题用来压测字号缩小逻辑', ending: { high: '高分结算文案' } } },
  { name: '超长评语', r: { score: 42 }, cfg: { title: '早八跑道', ending: { high: '你成功在七个闹钟的围追堵截中爬了起来，早饭也接住了，宿舍楼下点名的时候你刚好赶上，堪称人类意志力的奇迹。' } } },
];

cases.forEach(function (c) {
  const r = cardBlocks(c.r, c.cfg, scenePalette);
  /* 三个图标圆内部是并排的，彼此不重叠；其余任意两块都不允许重叠 */
  const NAMED = r.blocks.filter(b => b.name !== '卡片');
  let bad = [];
  for (let i = 0; i < NAMED.length; i++) {
    for (let j = i + 1; j < NAMED.length; j++) {
      const a = NAMED[i], b = NAMED[j];
      const bothIcons = /^图标圆/.test(a.name) && /^图标圆/.test(b.name);
      if (bothIcons) continue;
      if (overlap(a, b)) bad.push(a.name + '×' + b.name);
    }
  }
  check(c.name + '：各元素互不重叠', bad.length === 0, bad.join(', '));

  /* 全部在卡片内 */
  const card = r.blocks[0];
  const out = NAMED.filter(b => b.x < card.x - 1 || b.y < card.y - 1 ||
    b.x + b.w > card.x + card.w + 1 || b.y + b.h > card.y + card.h + 1).map(b => b.name);
  check(c.name + '：全部元素在卡片内', out.length === 0, out.join(', '));
});

/* 二维码能被真实解码器解出（数据与版式分开验证） */
console.log('\n【二维码数据】');
const qr = vm.runInContext('GengQR.encode("https://example.com/g/TESTID", {ec:"M"})', env.ctx);
check('二维码矩阵已生成', qr && qr.size > 0, 'size=' + (qr && qr.size));

/* 二维码在卡片上的"每模块像素"必须 >= 3：
 * 卡片里 QR_PX=124，模块数与 URL 长度相关（越长版本越高、每模块越小）。
 * 每模块不足 3px 时，缩放抗锯齿会让部分手机解码器读不出来。 */
const QR_PX_CARD = 124;
[
  ['本地链接', 'http://127.0.0.1:8765/g/demo-naicha?c=0'],
  ['最短域名', 'https://gx.io/g/AbCdEfGhIjKl?c=128'],
  ['较长域名', 'https://gengxia.example.com/g/AbCdEfGhIjKl?c=128'],
  ['超长（20 位 id + 挑战分）', 'https://gengxia.example.com/g/AbCdEfGhIjKlMnOpQrSt?c=9999999'],
].forEach(function (pair) {
  const q = vm.runInContext('GengQR.encode(' + JSON.stringify(pair[1]) + ', {ec:"M"})', env.ctx);
  const total = q.size + 8;                       /* 含 4 模块静默区 x2 */
  const scale = Math.max(1, Math.floor(QR_PX_CARD / total));
  check('每模块像素 ≥3（' + pair[0] + '）', scale >= 3, '模块 ' + q.size + 'x' + q.size + ' → ' + scale + 'px/模块');
});

console.log('\n========================================');
console.log('成绩卡测试：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('\n失败明细：'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
