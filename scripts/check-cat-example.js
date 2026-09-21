/* 验收 #5：猫的示例重新生成并通过语义一致性检查
 *
 * 本脚本做三件事：
 *   1. 用 v2 语义检查器复检**旧 v1 配置**（/g/6gWcNHikgbCP），证明检查器能识别出
 *      任务书指出的那类矛盾（简介说「追猫」，实际障碍却是猫）。
 *   2. 通过真实生成链路重新生成猫的故事，输出完整配置。
 *   3. 对新生成本身跑语义检查，必须通过。
 *
 * 用法：node scripts/check-cat-example.js [baseUrl]
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const schema = require(path.join(ROOT, 'shared/schema.js'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const STORY = '我的猫每天凌晨三点开演唱会，我拿着猫条追它，它躲开拖鞋还要把水杯推下桌，最后是我先睡着了。';
const OLD_ID = '6gWcNHikgbCP';

function show(label, c) {
  console.log('  ' + label);
  console.log('    标题     :', c.title);
  console.log('    玩法/场景:', c.mode, '/', c.sceneId);
  console.log('    简介     :', c.intro);
  console.log('    规则句   :', c.ruleText);
  const p = c.player || {}, o = c.obstacle || {}, k = c.collectible || {};
  console.log('    玩家     :', p.name, '(' + p.avatarId + ')');
  console.log('    障碍     :', o.name, '(' + o.spriteId + ')');
  console.log('    收集     :', k.name, '(' + k.spriteId + ')');
  console.log('    台词     :', (c.lines || []).join(' / '));
  const e = c.ending || {};
  console.log('    结算     : 低=' + e.low + ' | 中=' + e.mid + ' | 高=' + e.high);
}

(async function () {
  console.log('══ 1. 用 v2 检查器复检旧 v1 配置（应报出矛盾）══');
  const r1 = await fetch(BASE + '/api/games/' + OLD_ID);
  const d1 = await r1.json();
  const oldCfg = d1.config || d1;
  show('旧配置 /g/' + OLD_ID + '（读取时已迁移到 v2）', oldCfg);
  const oldIssue = schema.collectSemanticConflicts(oldCfg);
  console.log('    → 语义检查结果:', oldIssue.length ? ('❌ 检出 ' + oldIssue.length + ' 处问题:\n      - ' + oldIssue.join('\n      - ')) : '✅ 通过');
  if (!oldIssue.length) {
    console.log('    ⚠️ 检查器未检出该矛盾，需要补充规则。');
  }

  console.log('');
  console.log('══ 2. 重新生成猫的示例（真实生成链路）══');
  const r2 = await fetch(BASE + '/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story: STORY }),
  });
  const d2 = await r2.json();
  if (!r2.ok) {
    console.log('  生成失败:', d2.code, d2.message);
    process.exit(1);
  }
  const id = d2.id || d2.gameId;
  const cfg = d2.config;
  console.log('  新游戏地址: ' + BASE + '/g/' + id);
  console.log('  耗时: ' + (d2.meta && d2.meta.ms ? d2.meta.ms + ' ms' : '(未上报)'));
  show('新生成的猫示例', cfg);

  console.log('');
  console.log('══ 3. 对新生成跑语义一致性检查 ══');
  const issues = schema.collectSemanticConflicts(cfg);
  console.log('  语义检查:', issues.length ? ('❌ 未通过 ——\n    - ' + issues.join('\n    - ')) : '✅ 通过（无矛盾）');

  console.log('');
  console.log('══ 4. 结构校验（v2 schema）══');
  const v = schema.validateConfig ? schema.validateConfig(cfg) : null;
  if (v) console.log('  结构校验:', v.ok ? '✅ 通过' : ('❌ ' + JSON.stringify(v.errors)));
  else console.log('  (该版本无 validateConfig 导出)');

  console.log('');
  console.log('══ 结论 ══');
  console.log('  旧配置检出矛盾:', oldIssue.length ? '是（检查器有效）' : '否');
  console.log('  新生成通过检查:', issues.length ? '否' : '是');
  process.exit(issues.length ? 1 : 0);
})().catch(function (e) { console.error('脚本错误:', e && e.stack || e); process.exit(2); });
