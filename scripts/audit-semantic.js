/* 对批量评测结果做独立语义审核（验收 #6：语义一致性审核通过率，与结构合法率分开统计）
 *
 * 审核维度（每项独立判定，任一不过则该条不通过）：
 *   1. 文案一致性：collectSemanticConflicts 无冲突（简介/标题/台词/结算不得把奖励写成要躲开的）
 *   2. 场景与玩法匹配：cfg.sceneId 必须在 shared/scenes.js 里声明支持该 mode
 *   3. 素材合法：obstacle/collectible 的 spriteId 必须在 schema 允许的素材表内
 *   4. 素材属于该场景：spriteId 应在该场景的 obstacle/collectible 列表里
 *   5. 图案可辨识：排除「名字与图案明显不相干」的组合（spriteId 存在且有绘制实现）
 *   6. 规则句与配置同源：ruleText 必须等于服务端模板从配置生成的结果（防止模型另写一套规则）
 *
 * 用法：node scripts/audit-semantic.js eval/results-100.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'shared/schema.js'));
const SCENES = require(path.join(ROOT, 'shared/scenes.js'));

const FILE = process.argv[2] || path.join(ROOT, 'eval/results-100.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const results = data.results.filter(function (r) { return r.ok && (r.config || r.output); });

const scenes = SCENES.SCENES || SCENES;
const sceneMap = {};
Object.keys(scenes).forEach(function (k) { sceneMap[k] = scenes[k]; });

const obstacleTable = S.OBSTACLE_SPRITES || {};
const collectibleTable = S.COLLECTIBLE_SPRITES || {};
const obstacleIds = Object.keys(obstacleTable);
const collectibleIds = Object.keys(collectibleTable);
/* 自检：素材表必须非空，否则下面的合法性检查会静默变成空转 */
if (!obstacleIds.length || !collectibleIds.length) {
  console.error('✗ 素材表为空（OBSTACLE_SPRITES/COLLECTIBLE_SPRITES 未正确导出）——审核会失去意义，中止。');
  process.exit(2);
}

/* 加载前端绘制实现，确认每个素材 ID 真的画得出来（而不是占位方块）。
 * 做法：用 vm 在无 DOM 环境下加载 theme.js / art-scenes.js，
 * 逐个 spriteId 调用绘制函数并统计绘图 API 调用次数。 */
const vm = require('vm');
const hasArt = (function () {
  const root = path.join(ROOT, 'public/js');
  const sandbox = { console: console, Math: Math, Date: Date, JSON: JSON };
  sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['theme.js', 'art-scenes.js'].forEach(function (f) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
      try { vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f }); }
      catch (e) { console.error('加载 ' + f + ' 失败: ' + e.message); }
    }
  });
  /* 假 canvas context：记录调用次数 */
  function fakeCtx() {
    const rec = { n: 0 };
    const handler = {
      get: function (t, k) {
        if (k === '__n') return rec.n;
        if (k === 'canvas') return { width: 400, height: 700 };
        if (k === 'measureText') return function () { return { width: 10 }; };
        if (k === 'createLinearGradient' || k === 'createRadialGradient') {
          return function () { return { addColorStop: function () {} }; };
        }
        return function () { rec.n++; };
      },
      set: function () { return true; },
    };
    return { ctx: new Proxy({}, handler), rec: rec };
  }
  const T = sandbox.GengTheme || {};
  const A = sandbox.GengArt || {};
  const PALETTE = {
    bg: ['#101018', '#181826', '#202034'], grid: '#2a2a3e', accent: '#7cc7ff', accent2: '#ff9de2',
    danger: '#ff6b7a', text: '#f2f4ff', textDim: '#9aa3c7', glow: '#7cc7ff', floor: '#14141f',
  };
  function draws(fn, args) {
    const t = fakeCtx();
    try { fn.apply(null, [t.ctx].concat(args)); return t.rec.n; }
    catch (e) { return -1; }
  }
  /* 旧素材由 theme.js 的绘制表负责。
   * 注意：theme.js 对未知 id 会回退到占位图（document / star），所以"画得出来"
   * 不能证明有专属实现——必须直接检查绘制表里是否真的登记了这个 id。
   * 这里的做法：从源码里取出 OBSTACLE_DRAW / COLLECTIBLE_DRAW 两个对象字面量的键名。
   * （表格未导出，但键名是顶层缩进的 'id': function 形式，解析可靠。） */
  const themeSrc = (function () {
    const p = path.join(root, 'theme.js');
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
  })();
  function tableKeys(src, startMarker, endMarker) {
    const i = src.indexOf(startMarker);
    if (i === -1) return [];
    const j = src.indexOf(endMarker, i);
    const seg = src.slice(i, j === -1 ? i + 20000 : j);
    const keys = [];
    const re = /^\s{4}'([a-z0-9-]+)':\s*function/gm;
    let m;
    while ((m = re.exec(seg)) !== null) keys.push(m[1]);
    return keys;
  }
  const themeObstacleKeys = tableKeys(themeSrc, 'const OBSTACLE_DRAW = {', '\n  const COLLECTIBLE_DRAW');
  const themeCollectibleKeys = tableKeys(themeSrc, 'const COLLECTIBLE_DRAW = {', '\n  /* 生成一个缩略图');
  const themeKeys = themeObstacleKeys.concat(themeCollectibleKeys);

  return function (id) {
    /* 1) art-scenes.js 有该 id 的绘制函数 */
    if (A.OBSTACLE_ART && typeof A.OBSTACLE_ART[id] === 'function') {
      const n = Math.max(0, draws(A.drawObstacleArt, [id, 20, PALETTE]));
      if (n >= 4) return true;
    }
    if (A.COLLECTIBLE_ART && typeof A.COLLECTIBLE_ART[id] === 'function') {
      const n = Math.max(0, draws(A.drawCollectibleArt, [id, 20, PALETTE]));
      if (n >= 4) return true;
    }
    /* 2) theme.js 的绘制表里登记了该 id（不依赖绘制调用次数，避免占位图误判） */
    if (themeKeys.indexOf(id) !== -1) {
      const n = Math.max(0, draws(T.drawObstacle, [id, 20, PALETTE])) +
                Math.max(0, draws(T.drawCollectible, [id, 20, PALETTE]));
      return n >= 4;
    }
    return false;
  };
})();
function expectedRuleText(mode, cName, oName) {
  const c = String(cName || '奖励').trim();
  const o = String(oName || '障碍').trim();
  if (mode === 'runner') return '切换跑道，冲过 ' + c + '，撞上 ' + o + ' 会掉血。';
  if (mode === 'click') return '点掉 ' + o + ' 得分，点到 ' + c + ' 会扣血。';
  return '接住 ' + c + ' 得分，碰到 ' + o + ' 会扣血。';
}

const report = [];
const failReasons = {};

results.forEach(function (r) {
  const c = r.config || r.output;
  const problems = [];

  /* 1. 文案一致性 */
  const conflicts = S.collectSemanticConflicts ? S.collectSemanticConflicts(c) : [];
  if (conflicts.length) problems.push('文案冲突: ' + conflicts[0]);

  /* 2. 场景支持该玩法 */
  const sc = sceneMap[c.sceneId];
  if (!sc) problems.push('未知场景 ' + c.sceneId);
  else if (sc.modes && sc.modes.indexOf(c.mode) === -1) {
    problems.push('场景 ' + c.sceneId + ' 不支持玩法 ' + c.mode);
  }

  /* 3~4. 素材合法且属于该场景 */
  const oId = c.obstacle && c.obstacle.spriteId;
  const kId = c.collectible && c.collectible.spriteId;
  if (oId && obstacleIds.indexOf(oId) === -1) problems.push('未知障碍图案 ' + oId);
  if (kId && collectibleIds.indexOf(kId) === -1) problems.push('未知奖励图案 ' + kId);
  if (sc && sc.obstacles && oId && sc.obstacles.indexOf(oId) === -1) problems.push('障碍 ' + oId + ' 不属于场景 ' + c.sceneId);
  if (sc && sc.collectibles && kId && sc.collectibles.indexOf(kId) === -1) problems.push('奖励 ' + kId + ' 不属于场景 ' + c.sceneId);

  /* 5. 图案可辨识：绘制实现必须存在（art-scenes.js 覆盖 或 theme.js 内置），
   *    否则用户会看到一个「有明显不相干图案」的占位方块。 */
  if (oId && !hasArt(oId)) problems.push('障碍图案缺少绘制实现 ' + oId);
  if (kId && !hasArt(kId)) problems.push('奖励图案缺少绘制实现 ' + kId);

  /* 6. ruleText 与配置同源 */
  const exp = expectedRuleText(c.mode, c.collectible && c.collectible.name, c.obstacle && c.obstacle.name);
  if (c.ruleText && c.ruleText !== exp) problems.push('ruleText 与配置不同源：' + c.ruleText);

  report.push({ idx: r.idx, kind: r.kind, title: c.title, mode: c.mode, sceneId: c.sceneId, problems: problems });
  if (problems.length) {
    problems.forEach(function (p) {
      const key = p.replace(/[（(].*$/, '').replace(/[^\u4e00-\u9fa5a-zA-Z ]/g, '').trim().slice(0, 24);
      failReasons[key] = (failReasons[key] || 0) + 1;
    });
  }
});

const passed = report.filter(function (x) { return x.problems.length === 0; }).length;
const failed = report.length - passed;

console.log('=== 语义一致性独立审核 ===');
console.log('文件:', FILE);
console.log('参与审核条数:', report.length);
console.log('通过:', passed, '| 未通过:', failed);
console.log('通过率:', ((passed / report.length) * 100).toFixed(1) + '%');
console.log('');
if (failed) {
  console.log('--- 未通过明细 ---');
  report.filter(function (x) { return x.problems.length; }).forEach(function (x) {
    console.log(' #' + x.idx, '[' + x.kind + ']', '《' + x.title + '》', x.mode + '/' + x.sceneId);
    x.problems.forEach(function (p) { console.log('    ✗', p); });
  });
  console.log('');
  console.log('--- 失败分类统计 ---');
  Object.keys(failReasons).sort(function (a, b) { return failReasons[b] - failReasons[a]; })
    .forEach(function (k) { console.log('   ' + failReasons[k] + ' × ' + k); });
}
console.log('');
console.log('--- 分布 ---');
const modeDist = {}, sceneDist = {};
report.forEach(function (x) {
  modeDist[x.mode] = (modeDist[x.mode] || 0) + 1;
  sceneDist[x.sceneId] = (sceneDist[x.sceneId] || 0) + 1;
});
console.log('玩法:', JSON.stringify(modeDist));
console.log('场景:', JSON.stringify(sceneDist));

process.exit(failed ? 1 : 0);
