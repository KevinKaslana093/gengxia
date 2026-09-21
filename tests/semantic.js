/* 语义一致性检查回归：正例（应通过）+ 反例（应拦截），覆盖三种玩法 */
'use strict';
const S = require('../shared/schema.js');

let pass = 0, fail = 0;
function ok(desc, got, want) {
  const good = (got === want) || (want === 'OK' && got === null) || (want === 'BAD' && got !== null);
  if (good) { pass++; console.log('  ✓ ' + desc); }
  else { fail++; console.log('  ✗ ' + desc + '\n      实际: ' + JSON.stringify(got) + ' 期望: ' + want); }
}

console.log('\n=== 正例：语义正确，必须放行 ===');
[
  ['收集测试道具躲开测试障碍直到结束', '测试道具', '测试障碍', 'dodge'],
  ['接住猫条，躲开飞来的拖鞋和桌上的水杯', '猫条', '拖鞋', 'dodge'],
  ['收集下班卡，躲开临时需求', '下班卡', '临时需求', 'dodge'],
  ['拿到咖啡，避开催命的红色批注', '咖啡', '红色批注', 'dodge'],
  ['收集珍珠，躲开排到门口的长队', '珍珠', '长队', 'runner'],
  ['接住星星，避开文件', '星星', '文件', 'dodge'],
  ['点掉临时需求，别碰加班消息', '加班消息', '临时需求', 'click'],
  ['点掉闹钟，别点到猫咪', '猫咪', '闹钟', 'click'],
].forEach(function (c) {
  ok('放行：' + c[0].slice(0, 24), S.findSemanticConflict(c[0], c[1], c[2], c[3]), 'OK');
});

console.log('\n=== 反例：语义矛盾，必须拦截 ===');
[
  ['收集拖鞋，躲开猫条', '猫条', '拖鞋', 'dodge', '收集了障碍'],
  ['躲开下班卡，接住临时需求', '下班卡', '临时需求', 'dodge', '躲避了奖励'],
  ['点掉加班消息，别碰临时需求', '加班消息', '临时需求', 'click', '点击了干扰项'],
  ['接住文件，避开星星', '星星', '文件', 'dodge', '接住了障碍'],
].forEach(function (c) {
  ok('拦截：' + c[0].slice(0, 24) + '（' + c[4] + '）', S.findSemanticConflict(c[0], c[1], c[2], c[3]), 'BAD');
});

console.log('\n=== 子串陷阱：障碍名是奖励名的一部分 ===');
ok('「猫」在「猫条」里不算独立障碍',
  S.findSemanticConflict('拿着猫条追猫，躲开飞来的拖鞋', '猫条', '拖鞋', 'dodge'), 'OK');
ok('障碍「猫」+ 奖励「猫条」：接住猫条躲开猫 → 放行',
  S.findSemanticConflict('接住猫条，躲开猫。', '猫条', '猫', 'dodge'), 'OK');

console.log('\n=== 核心名词匹配：实体名带「的」修饰语，文案只写核心名词 ===');
/* 任务书里猫的示例就是这个形态：障碍叫「三点开唱的猫」，文案写「追猫」。
 * 只匹配完整名称会漏判，必须同时匹配核心名词「猫」。 */
ok('★拦截：追猫 + 障碍「三点开唱的猫」（旧 v1 矛盾）',
  S.findSemanticConflict('拿着猫条追猫，躲开飞来的拖鞋和桌角的水杯，看你能把这场演唱会拖到几点。',
    '猫条', '三点开唱的猫', 'dodge'), 'BAD');
ok('拦截：收集被推下桌的水杯 + 障碍「被推下桌的水杯」',
  S.findSemanticConflict('收集被推下桌的水杯，躲开猫条', '猫条', '被推下桌的水杯', 'dodge'), 'BAD');
ok('放行：躲开被推下桌的水杯，收集猫条',
  S.findSemanticConflict('躲开被推下桌的水杯，收集猫条', '猫条', '被推下桌的水杯', 'dodge'), 'OK');
ok('放行：新生成的猫示例（障碍「飙高音的猫」，只说氛围不写矛盾动作）',
  S.findSemanticConflict('凌晨三点，主子准时开嗓，我举着猫条站在床边，困到眼皮打架。',
    '猫条', '飙高音的猫', 'dodge'), 'OK');

console.log('\n=== collectSemanticConflicts 汇总多个字段 ===');
const v = {
  mode: 'dodge',
  title: '收集拖鞋大冒险',
  intro: '收集拖鞋，躲开猫条',
  lines: ['接住猫条吧'],
  ending: { low: '低分', mid: '中分', high: '高分' },
  collectible: { name: '猫条' },
  obstacle: { name: '拖鞋' },
};
const conf = S.collectSemanticConflicts(v);
console.log('  冲突数:', conf.length);
conf.forEach(function (c) { console.log('    - ' + c); });
if (conf.length >= 2) { pass++; console.log('  ✓ 能汇总多字段冲突'); } else { fail++; console.log('  ✗ 应汇总出多处冲突'); }

console.log('\n' + '='.repeat(40));
console.log('语义检查：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
