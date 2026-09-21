/* 全量测试入口：依次跑六套测试并汇总。
 * 用法：npm test  或  node tests/all.js
 * 任一测试失败则整体退出码非 0。
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  { file: 'run.js', label: '接口与安全（Schema / API / 限流 / 静态资源类型）' },
  { file: 'engine.js', label: '躲避收集引擎（时间增量、暂停、碰撞）' },
  { file: 'modes.js', label: '两种新玩法（可避开性、点击边界、帧率一致性）' },
  { file: 'llm-errors.js', label: '模型异常路径（坏 JSON / 超时 / 429 / 401 / 截断）' },
  { file: 'semantic.js', label: '文案与规则一致性' },
  { file: 'sharecard.js', label: '分享成绩卡版式' },
];

const ROOT = path.resolve(__dirname, '..');
let failed = 0;
const rows = [];

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  「梗一下」全量测试（无需模型额度，全部离线可跑）         ║');
console.log('╚══════════════════════════════════════════════════════════╝');

for (const s of SUITES) {
  console.log('\n▶ ' + s.label + '  (' + s.file + ')');
  console.log('─'.repeat(60));
  const r = spawnSync(process.execPath, [path.join(__dirname, s.file)], {
    cwd: ROOT, stdio: 'inherit', env: process.env,
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  rows.push({ label: s.label, ok: ok, code: r.status });
}

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  汇总                                                     ║');
console.log('╚══════════════════════════════════════════════════════════╝');
rows.forEach(function (r) {
  console.log('  ' + (r.ok ? '✓' : '✗') + '  ' + r.label + (r.ok ? '' : '   (exit ' + r.code + ')'));
});
console.log('');
if (failed === 0) {
  console.log('全部 ' + SUITES.length + ' 套测试通过。');
} else {
  console.log(failed + ' / ' + SUITES.length + ' 套测试失败。');
}
process.exit(failed ? 1 : 0);
