/* 「梗一下」自动化测试：不需要模型额度，全部离线可跑。
 * 覆盖：Schema 校验、JSON 提取、API 契约、权限、限流、体积限制、XSS、持久化。
 * 运行：node tests/run.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const { extractJson } = require(path.join(ROOT, 'server/llm/generate.js'));

/* ---------------- 迷你测试框架 ---------------- */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; process.stdout.write('  ✓ ' + name + '\n'); }
  catch (e) { failed++; failures.push({ name: name, error: e.message }); process.stdout.write('  ✗ ' + name + '\n      ' + e.message + '\n'); }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; process.stdout.write('  ✓ ' + name + '\n'); }
  catch (e) { failed++; failures.push({ name: name, error: e.message }); process.stdout.write('  ✗ ' + name + '\n      ' + e.message + '\n'); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || '值不相等') + '：实际 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b)); }

/* ---------------- 合法样例配置（v2） ---------------- */
function validConfig(over) {
  return Object.assign({
    schemaVersion: 2,
    title: '逃离改稿地狱',
    intro: '收集下班卡，躲开临时需求，坚持到准点下班！',
    mode: 'dodge',
    sceneId: 'office-night',
    player: { name: '打工人', avatarId: 'office-worker' },
    themeId: 'office-neon',
    obstacle: { name: '临时需求', spriteId: 'document' },
    collectible: { name: '下班卡', spriteId: 'ticket' },
    lines: ['这个改动很小', '最后再来一版'],
    ending: { low: '今天先到这里，明天再和需求周旋。', mid: '你成功守住了一部分下班时间！', high: '准点下班大师，需求都追不上你！' },
  }, over || {});
}

/* ---------------- v1 旧配置（用于验证平滑迁移） ---------------- */
function legacyV1Config(over) {
  const c = validConfig(over);
  delete c.mode;
  delete c.sceneId;
  c.schemaVersion = 1;
  return c;
}

/* ================= 1. Schema 校验 ================= */
console.log('\n【1】配置 Schema 校验');

test('合法配置通过校验，且剥离未知字段', function () {
  const r = Schema.validateConfig(validConfig({ evil: 'field', script: '<script>alert(1)</script>' }));
  assert(r.ok, '应通过：' + JSON.stringify(r.errors));
  assertEq(Object.prototype.hasOwnProperty.call(r.value, 'evil'), false, '未知字段应被剥离');
});

test('schemaVersion 既不是 1 也不是 2 → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ schemaVersion: 3 }));
  assert(!r.ok, '应拒绝');
  assert(r.errors.some(e => e.indexOf('schemaVersion') !== -1), '错误应提到 schemaVersion');
});

test('v1 旧配置经 migrateV1 后可校验通过（兼容旧分享链接）', function () {
  const migrated = Schema.migrateV1(legacyV1Config());
  const r = Schema.validateConfig(migrated);
  assert(r.ok, '迁移后应通过：' + JSON.stringify(r.errors));
  assertEq(migrated.schemaVersion, 2, '迁移后版本应为 2');
  assert(migrated.mode, '迁移后应补上 mode');
  assert(migrated.sceneId, '迁移后应补上 sceneId');
});

test('v1 旧配置直接送校验 → 明确拒绝（强制走迁移，不隐式接受）', function () {
  const r = Schema.validateConfig(legacyV1Config());
  assert(!r.ok, '不应直接接受 v1');
  assert(r.errors.some(e => e.indexOf('schemaVersion') !== -1), '应指出 schemaVersion 需要迁移');
});

test('未知 sceneId → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ sceneId: 'moon-base' }));
  assert(!r.ok, '应拒绝');
  assert(r.errors.some(e => e.indexOf('sceneId') !== -1), '应指出 sceneId');
});

test('未知 mode → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ mode: 'flying' }));
  assert(!r.ok, '应拒绝');
  assert(r.errors.some(e => e.indexOf('mode') !== -1), '应指出 mode');
});

test('未知 themeId（v1 遗留字段）已忽略，不再影响校验', function () {
  const r = Schema.validateConfig(validConfig({ themeId: 'hacker-theme' }));
  assert(r.ok, 'v2 下 themeId 仅作兼容字段，不应导致拒绝');
  assertEq(r.value.themeId, undefined, '输出不应保留未知 themeId');
});

test('ruleText 不接受任意注入（服务端模板生成，客户端传入被剥离）', function () {
  const r = Schema.validateConfig(validConfig({ ruleText: '自己乱写的规则，和引擎无关' }));
  assert(r.ok, '应通过校验');
  assert(r.value.ruleText !== '自己乱写的规则，和引擎无关', '传入的 ruleText 不应原样保留');
});

test('未知 spriteId（障碍）→ 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ obstacle: { name: '临时需求', spriteId: 'not-a-sprite' } }));
  assert(!r.ok, '应拒绝');
  assert(r.errors.some(e => e.indexOf('obstacle.spriteId') !== -1), '应指出 obstacle.spriteId');
});

test('未知 avatarId → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ player: { name: '打工人', avatarId: 'goku' } }));
  assert(!r.ok, '应拒绝');
});

test('超长 title → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ title: '这是一个特别特别特别特别特别特别特别长的标题超过十八个字了肯定不行' }));
  assert(!r.ok, '应拒绝');
});

test('title 含 HTML 尖括号 → 拒绝（防注入）', function () {
  const r = Schema.validateConfig(validConfig({ title: '<b>标题</b>' }));
  assert(!r.ok, '应拒绝');
});

test('intro 含 <script> → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ intro: '收集<script>alert(1)</script>吧' }));
  assert(!r.ok, '应拒绝');
});

test('台词数量超出 1–5 → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ lines: [] }));
  assert(!r.ok, '空数组应拒绝');
  const r2 = Schema.validateConfig(validConfig({ lines: ['一', '二', '三', '四', '五', '六'] }));
  assert(!r2.ok, '6 条应拒绝');
});

test('单条台词超长（>24 字）→ 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ lines: ['这是一条被模型写得太长的台词，明显超过了二十四字的限制所以必须拒绝'] }));
  assert(!r.ok, '应拒绝');
});

test('ending 缺 high → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ ending: { low: '低分文案低分文案', mid: '中分文案中分文案' } }));
  assert(!r.ok, '应拒绝');
});

test('配置含手机号 → 拒绝（隐私防护）', function () {
  const r = Schema.validateConfig(validConfig({ lines: ['打给我 13812345678'] }));
  assert(!r.ok, '应拒绝');
  assert(r.errors.some(e => e.indexOf('手机号') !== -1), '应指出手机号');
});

test('配置含邮箱 → 拒绝', function () {
  const r = Schema.validateConfig(validConfig({ intro: '联系 boss@company.com 领取奖励' }));
  assert(!r.ok, '应拒绝');
});

test('非对象输入 → 拒绝', function () {
  ['字符串', 42, null, [], undefined].forEach(function (bad) {
    const r = Schema.validateConfig(bad);
    assert(!r.ok, JSON.stringify(bad) + ' 应被拒绝');
  });
});

test('所有枚举值本身都能通过校验（枚举自洽）', function () {
  const SceneDefs = require('../shared/scenes.js');
  Object.keys(SceneDefs.SCENES).forEach(function (sceneId) {
    Object.keys(Schema.AVATARS).forEach(function (avatarId) {
      Object.keys(Schema.OBSTACLE_SPRITES).forEach(function (obs) {
        Object.keys(Schema.COLLECTIBLE_SPRITES).forEach(function (col) {
          const r = Schema.validateConfig(validConfig({
            sceneId: sceneId,
            player: { name: '主角', avatarId: avatarId },
            obstacle: { name: '障碍', spriteId: obs },
            collectible: { name: '奖励', spriteId: col },
          }));
          assert(r.ok, sceneId + '/' + avatarId + '/' + obs + '/' + col + ' 应通过：' + JSON.stringify(r.errors));
        });
      });
    });
  });
});

/* ================= 2. JSON 提取 ================= */
console.log('\n【2】模型输出 JSON 提取');

test('纯 JSON 正常解析', function () {
  assert(extractJson('{"a":1}').ok, '应解析成功');
});

test('带 markdown 代码块 → 解析出对象', function () {
  const r = extractJson('```json\n{"a":1}\n```');
  assert(r.ok && r.obj.a === 1, '应解析出 a=1');
});

test('前后有解释文字 → 截取大括号区间', function () {
  const r = extractJson('好的，这是配置：{"a":1,"b":{"c":2}} 希望你喜欢！');
  assert(r.ok && r.obj.b.c === 2, '应解析出嵌套对象');
});

test('截断的 JSON → 失败（不猜测、不修复）', function () {
  const r = extractJson('{"a":1,"b":');
  assert(!r.ok, '截断应解析失败');
});

test('输出为空 → 失败', function () {
  assert(!extractJson('').ok, '应失败');
  assert(!extractJson(null).ok, 'null 应失败');
});

test('输出中无大括号 → 失败', function () {
  assert(!extractJson('抱歉我不能这么做').ok, '应失败');
});

test('恶意 output 不会被当作代码执行（纯文本处理）', function () {
  const r = extractJson('{"title":"x"}');
  assert(r.ok, '应正常解析');
  const evil = extractJson('{"__proto__":{"polluted":true}}');
  assert(evil.ok, '应能解析');
  assert(({}).polluted === undefined, '原型不应被污染');
});

/* ================= 3. 用户故事校验 ================= */
console.log('\n【3】用户输入校验');

test('过短故事 → 拒绝并给出字数', function () {
  const r = Schema.validateStory('太短了');
  assert(!r.ok, '应拒绝');
  assert(r.error.indexOf('字') !== -1, '错误应说明字数');
});

test('过长故事 → 拒绝', function () {
  const r = Schema.validateStory('测试'.repeat(600));
  assert(!r.ok, '应拒绝');
});

test('恰好 10 字 → 通过', function () {
  const r = Schema.validateStory('一二三四五六七八九十');
  assert(r.ok, '应通过：' + r.error);
});

test('恰好 1000 字 → 通过，1001 字 → 拒绝', function () {
  assert(Schema.validateStory('字'.repeat(1000)).ok, '1000 字应通过');
  assert(!Schema.validateStory('字'.repeat(1001)).ok, '1001 字应拒绝');
});

test('emoji 按码点计数（不被 UTF-16 长度误导）', function () {
  const r = Schema.validateStory('😀'.repeat(10));
  assert(r.ok, '10 个 emoji 应算 10 字并通过：' + r.error);
});

test('非字符串 → 拒绝', function () {
  assert(!Schema.validateStory(123).ok, '应拒绝');
  assert(!Schema.validateStory(null).ok, '应拒绝');
});

/* ================= 4. 编辑补丁校验 ================= */
console.log('\n【4】编辑补丁校验');

test('合法 title + playerName → 通过', function () {
  const r = Schema.validatePatch({ title: '新标题', playerName: '新主角' });
  assert(r.ok, '应通过：' + JSON.stringify(r.errors));
});

test('修改未授权字段（themeId）→ 拒绝', function () {
  const r = Schema.validatePatch({ themeId: 'birthday-pop' });
  assert(!r.ok, '应拒绝');
});

test('空补丁 → 拒绝', function () {
  assert(!Schema.validatePatch({}).ok, '应拒绝');
});

test('applyPatch 只改受支持字段，不改其他', function () {
  const base = Schema.validateConfig(validConfig()).value;
  const next = Schema.applyPatch(base, { title: '改稿之王', playerName: '李工' });
  assertEq(next.title, '改稿之王', 'title 应更新');
  assertEq(next.player.name, '李工', 'player.name 应更新');
  assertEq(next.themeId, base.themeId, 'themeId 不应变');
  assertEq(next.obstacle.spriteId, base.obstacle.spriteId, 'obstacle 不应变');
});

/* ================= 5. HTTP API 契约（真实起服务） ================= */
(async function apiTests() {
  console.log('\n【5】HTTP API 契约（真实请求）');

  const { spawn } = require('child_process');
  const dbFile = path.join(os.tmpdir(), 'gengxia-test-' + Date.now() + '.db');
  const PORT = 8899;
  const B = 'http://127.0.0.1:' + PORT;

  /* 独立子进程启动服务：走真实启动路径，且不受本测试进程已缓存的配置影响 */
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), DB_PATH: dbFile, HOST: '127.0.0.1',
      LLM_PROVIDER: 'openai-compat', GEN_ENABLED: 'true', GEN_PER_IP_LIMIT: '5', GEN_PER_IP_WINDOW_MS: '60000',
      /* 指向不存在的密钥文件：模拟"服务端未配置凭据"的真实场景 */
      OLLAMA_API_KEY: '', LLM_API_KEY: '', LLM_API_KEY_FILE: path.join(os.tmpdir(), 'gengxia-no-such-key-' + Date.now() + '.env'),
    }),
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { const h = await fetch(B + '/api/health'); if (h.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }

  async function j(method, p, body, headers) {
    const res = await fetch(B + p, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data: data, headers: res.headers };
  }

  await testAsync('GET /api/health → 200 且 ok=true', async function () {
    const r = await j('GET', '/api/health');
    assertEq(r.status, 200, '状态码');
    assertEq(r.data.ok, true, 'ok 字段');
    assert(r.data.games >= 10, '应有 10 个预设游戏，实际 ' + r.data.games);
    assertEq(r.data.schemaVersion, 2, 'schemaVersion');
    assertEq(r.data.scenes, 12, '场景数');
  });

  await testAsync('GET /api/gallery → 返回预设游戏（≥10，覆盖三种玩法）', async function () {
    const r = await j('GET', '/api/gallery');
    assertEq(r.status, 200, '状态码');
    assert(r.data.items.length >= 10, '预设数量应 ≥10，实际 ' + r.data.items.length);
    const modes = {};
    r.data.items.forEach(function (it) { modes[it.mode] = (modes[it.mode] || 0) + 1; });
    ['dodge', 'runner', 'click'].forEach(function (m) {
      assert(modes[m] > 0, '画廊应包含 ' + m + ' 玩法，实际分布 ' + JSON.stringify(modes));
    });
    /* 画廊项不得泄露凭据 */
    const raw = JSON.stringify(r.data);
    assert(raw.indexOf('editToken') === -1 && raw.indexOf('edit_token_hash') === -1, '画廊不应含凭据');
  });

  await testAsync('GET /api/scenes → 12 套场景及支持的玩法矩阵', async function () {
    const r = await j('GET', '/api/scenes');
    assertEq(r.status, 200, '状态码');
    assertEq(r.data.scenes.length, 12, '场景数');
    r.data.scenes.forEach(function (s) {
      assert(s.id && s.label, '场景需有 id 与 label');
      assert(Array.isArray(s.modes) && s.modes.length > 0, s.id + ' 需声明支持的玩法');
      assert(s.collectibles.length >= 2, s.id + ' 至少 2 种奖励');
      assert(s.obstacles.length >= 2, s.id + ' 至少 2 种障碍');
    });
  });

  await testAsync('GET /api/games/:id（预设）→ 返回可玩配置', async function () {
    const r = await j('GET', '/api/games/demo-genggao');
    assertEq(r.status, 200, '状态码');
    const v = Schema.validateConfig(r.data.config);
    assert(v.ok, '预设配置应通过校验：' + JSON.stringify(v.errors));
    assert(r.data.config.title.length > 0, '标题');
    assert(r.data.config.mode, '应带玩法字段');
    assert(r.data.config.sceneId, '应带场景字段');
    assert(r.data.config.ruleText, '应带规则说明（由服务端模板生成）');
  });

  await testAsync('GET /api/games/:id 响应不包含原始故事或凭据', async function () {
    const r = await j('GET', '/api/games/demo-genggao');
    const raw = JSON.stringify(r.data);
    assert(raw.indexOf('editToken') === -1, '响应不应含 editToken');
    assert(raw.indexOf('edit_token_hash') === -1, '响应不应含凭据哈希');
    assert(raw.indexOf('老板') === -1, '响应不应含原始故事');
  });

  await testAsync('GET 不存在的 id → 404', async function () {
    const r = await j('GET', '/api/games/zzzzzzzzzzzz');
    assertEq(r.status, 404, '状态码');
    assertEq(r.data.error.code, 'not_found', '错误码');
  });

  await testAsync('PATCH 无凭据 → 403，配置未被修改', async function () {
    const before = (await j('GET', '/api/games/demo-genggao')).data.config.title;
    const r = await j('PATCH', '/api/games/demo-genggao', { title: '被篡改的标题' });
    assertEq(r.status, 403, '状态码');
    const after = (await j('GET', '/api/games/demo-genggao')).data.config.title;
    assertEq(after, before, '标题不应被改');
  });

  await testAsync('PATCH 错误凭据 → 403', async function () {
    const r = await j('PATCH', '/api/games/demo-genggao', { title: '黑客标题', editToken: 'wrong-token-xxxx' });
    assertEq(r.status, 403, '状态码');
  });

  await testAsync('PATCH 预设游戏（无凭据记录）→ 403', async function () {
    const r = await j('PATCH', '/api/games/demo-birthday', { title: '篡改预设', editToken: 'anything' });
    assertEq(r.status, 403, '状态码');
  });

  await testAsync('POST /api/games 故事过短 → 400 bad_story', async function () {
    const r = await j('POST', '/api/games', { story: '太短' });
    assertEq(r.status, 400, '状态码');
    assertEq(r.data.error.code, 'bad_story', '错误码');
  });

  await testAsync('POST /api/games 无 story 字段 → 400', async function () {
    const r = await j('POST', '/api/games', {});
    assertEq(r.status, 400, '状态码');
  });

  await testAsync('POST 超大请求体 → 413', async function () {
    const r = await j('POST', '/api/games', { story: '字'.repeat(90000) });
    assertEq(r.status, 413, '状态码');
    assertEq(r.data.error.code, 'too_large', '错误码');
  });

  await testAsync('POST 非法 JSON → 400', async function () {
    const r = await j('POST', '/api/games', '{not json');
    assertEq(r.status, 400, '状态码');
    assertEq(r.data.error.code, 'bad_request', '错误码');
  });

  await testAsync('POST 未配置密钥 → 503 auth_error（不伪装成功）', async function () {
    const r = await j('POST', '/api/games', { story: '老板一天改五遍需求我们改到凌晨两点才下班' });
    assertEq(r.status, 503, '状态码');
    assertEq(r.data.error.code, 'auth_error', '错误码');
  });

  await testAsync('未知 API 路径 → 404 JSON', async function () {
    const r = await j('GET', '/api/nope');
    assertEq(r.status, 404, '状态码');
    assertEq(r.data.error.code, 'not_found', '错误码');
  });

  await testAsync('api/games 不支持的方法 → 405', async function () {
    const r = await j('DELETE', '/api/games/demo-genggao');
    assertEq(r.status, 405, '状态码');
  });

  await testAsync('GET / → 200 HTML（首页）', async function () {
    const res = await fetch(B + '/');
    assertEq(res.status, 200, '状态码');
    const html = await res.text();
    assert(html.indexOf('梗一下') !== -1, '应包含产品名');
    assert(html.indexOf('id="app"') !== -1, '应有挂载点');
  });

  await testAsync('GET /g/:id → 200（SPA 回退，分享链接直接可打开）', async function () {
    const res = await fetch(B + '/g/demo-genggao');
    assertEq(res.status, 200, '状态码');
    const html = await res.text();
    assert(html.indexOf('id="app"') !== -1, '应返回应用外壳');
  });

  await testAsync('静态资源可访问且类型正确', async function () {
    const res = await fetch(B + '/js/engine.js');
    assertEq(res.status, 200, '状态码');
    assert(res.headers.get('content-type').indexOf('javascript') !== -1, '内容类型');
    const css = await fetch(B + '/css/style.css');
    assertEq(css.status, 200, 'CSS 状态码');
    const schema = await fetch(B + '/shared/schema.js');
    assertEq(schema.status, 200, '共享 schema 状态码');
  });

  await testAsync('路径穿越攻击被阻止', async function () {
    const res = await fetch(B + '/../../../etc/passwd');
    assert(res.status === 200 || res.status === 404, '不应返回服务器文件，实际 ' + res.status);
    const txt = await res.text();
    assert(txt.indexOf('root:') === -1, '不应泄露系统文件');
  });

  await testAsync('前端产物不包含 API 密钥或编辑凭据', async function () {
    const files = ['/js/app.js', '/js/api.js', '/js/engine.js', '/js/theme.js', '/shared/schema.js', '/css/style.css', '/index.html'];
    for (const f of files) {
      const res = await fetch(B + f);
      const txt = await res.text();
      assert(txt.indexOf('OLLAMA_API_KEY') === -1, f + ' 不应含密钥变量名');
      assert(txt.indexOf('sk-') === -1, f + ' 不应含密钥片段');
      assert(txt.indexOf('edit_token_hash') === -1, f + ' 不应含凭据哈希字段');
      assert(txt.indexOf('Bearer ') === -1, f + ' 不应含认证头');
    }
  });

  /* ---- 生成限流：需要真实生成路径，用 mock provider 的独立服务测 ---- */
  await testAsync('生成限流：超过每 IP 上限 → 429', async function () {
    const dbFile2 = path.join(os.tmpdir(), 'gengxia-test-rl-' + Date.now() + '.db');
    const PORT2 = 8898;
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
      env: Object.assign({}, process.env, {
        PORT: String(PORT2), DB_PATH: dbFile2, HOST: '127.0.0.1',
        LLM_PROVIDER: 'mock', GEN_PER_IP_LIMIT: '2', GEN_PER_IP_WINDOW_MS: '60000', GEN_ENABLED: 'true',
      }),
      stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 30; i++) {
        try { const h = await fetch('http://127.0.0.1:' + PORT2 + '/api/health'); if (h.ok) break; } catch (e) {}
        await new Promise(r => setTimeout(r, 200));
      }
      const r1 = await j('POST', '/api/games', { story: '测试限流用的故事内容足够长度一' });
      const r2 = await j('POST', '/api/games', { story: '测试限流用的故事内容足够长度二' });
      const r3 = await j('POST', '/api/games', { story: '测试限流用的故事内容足够长度三' });
      // 注意：这三个请求打在 8898 端口上，需重新指向
      const r1b = await fetch('http://127.0.0.1:' + PORT2 + '/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: '测试限流用的故事内容足够长度一' }) });
      const r2b = await fetch('http://127.0.0.1:' + PORT2 + '/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: '测试限流用的故事内容足够长度二' }) });
      const r3b = await fetch('http://127.0.0.1:' + PORT2 + '/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: '测试限流用的故事内容足够长度三' }) });
      assertEq(r1b.status, 201, '第一个请求应成功，实际 ' + r1b.status + ' ' + (await r1b.text()).slice(0, 120));
      assertEq(r2b.status, 201, '第二个请求应成功，实际 ' + r2b.status);
      assertEq(r3b.status, 429, '第三个请求应被限流，实际 ' + r3b.status);
      const body3 = await r3b.json();
      assertEq(body3.error.code, 'rate_limited', '错误码');
      void r1; void r2; void r3;
    } finally {
      child.kill();
    }
  });

  await testAsync('mock 生成全链路：创建 → 读取 → 编辑（凭据）→ 持久化验证', async function () {
    const dbFile3 = path.join(os.tmpdir(), 'gengxia-test-full-' + Date.now() + '.db');
    const PORT3 = 8897;
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
      env: Object.assign({}, process.env, {
        PORT: String(PORT3), DB_PATH: dbFile3, HOST: '127.0.0.1',
        LLM_PROVIDER: 'mock', GEN_PER_IP_LIMIT: '20', GEN_ENABLED: 'true',
      }),
      stdio: 'ignore',
    });
    const B3 = 'http://127.0.0.1:' + PORT3;
    try {
      for (let i = 0; i < 30; i++) {
        try { const h = await fetch(B3 + '/api/health'); if (h.ok) break; } catch (e) {}
        await new Promise(r => setTimeout(r, 200));
      }
      const created = await (await fetch(B3 + '/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: '这是一个用于端到端测试的故事内容，长度足够触发生成流程。' }),
      })).json();
      assert(created.id, '应返回游戏 ID');
      assert(created.editToken, '应返回编辑凭据');
      assert(created.config && created.config.title, '应返回配置');

      // 凭据有效 → 编辑成功
      const patched = await fetch(B3 + '/api/games/' + created.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '改过的标题', playerName: '新主角', editToken: created.editToken }),
      });
      assertEq(patched.status, 200, '有凭据应能编辑');
      const pj = await patched.json();
      assertEq(pj.config.title, '改过的标题', '标题应更新');
      assertEq(pj.config.player.name, '新主角', '主角应更新');

      // 编辑后持久化：重新读取
      const reread = await (await fetch(B3 + '/api/games/' + created.id)).json();
      assertEq(reread.config.title, '改过的标题', '重新读取应看到修改');

      // 错误凭据 → 403
      const bad = await fetch(B3 + '/api/games/' + created.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '坏人标题', editToken: 'definitely-wrong-token' }),
      });
      assertEq(bad.status, 403, '错误凭据应 403');

      // 编辑校验：超长标题 → 400
      const tooLong = await fetch(B3 + '/api/games/' + created.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '这是一个超长的标题超过十八个字限制肯定通不过校验', editToken: created.editToken }),
      });
      assertEq(tooLong.status, 400, '超长标题应 400');

      // 编辑校验：含 HTML → 400
      const xss = await fetch(B3 + '/api/games/' + created.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '<img src=x onerror=alert(1)>', editToken: created.editToken }),
      });
      assertEq(xss.status, 400, 'HTML 注入应 400');

      // 模拟应用重启：杀掉进程后用同一 DB 再起一个，数据仍在（分享链接重启后可用）
      child.kill();
      await new Promise(r => setTimeout(r, 700));
      const child2 = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
        env: Object.assign({}, process.env, {
          PORT: String(PORT3), DB_PATH: dbFile3, HOST: '127.0.0.1', LLM_PROVIDER: 'mock',
        }),
        stdio: 'ignore',
      });
      try {
        for (let i = 0; i < 40; i++) {
          try { const h = await fetch(B3 + '/api/health'); if (h.ok) break; } catch (e) {}
          await new Promise(r => setTimeout(r, 250));
        }
        const afterRestart = await (await fetch(B3 + '/api/games/' + created.id)).json();
        assertEq(afterRestart.config.title, '改过的标题', '重启后分享页数据应仍可访问');
      } finally { child2.kill(); }
    } finally {
      try { child.kill(); } catch (e) {}
    }
  });

  await testAsync('关闭模型接入后，已有游戏仍可游玩（验收 #8）', async function () {
    const dbFile4 = path.join(os.tmpdir(), 'gengxia-test-off-' + Date.now() + '.db');
    const PORT4 = 8896;
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
      env: Object.assign({}, process.env, {
        PORT: String(PORT4), DB_PATH: dbFile4, HOST: '127.0.0.1',
        GEN_ENABLED: 'false', LLM_PROVIDER: 'openai-compat', OLLAMA_API_KEY: '', LLM_API_KEY: '',
      }),
      stdio: 'ignore',
    });
    const B4 = 'http://127.0.0.1:' + PORT4;
    try {
      for (let i = 0; i < 30; i++) {
        try { const h = await fetch(B4 + '/api/health'); if (h.ok) break; } catch (e) {}
        await new Promise(r => setTimeout(r, 200));
      }
      const preset = await fetch(B4 + '/api/games/demo-zaoba');
      assertEq(preset.status, 200, '预设游戏应仍可读取');
      const cfg = (await preset.json()).config;
      assert(Schema.validateConfig(cfg).ok, '预设配置应仍合规');
      const gen = await fetch(B4 + '/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: '关闭生成后应该被拒绝的故事内容测试' }),
      });
      assertEq(gen.status, 503, '生成应被拒绝，实际 ' + gen.status);
      const gj = await gen.json();
      assertEq(gj.error.code, 'disabled', '错误码应为 disabled');
    } finally { child.kill(); }
  });

  /* ---------------- 收尾 ---------------- */
  try { server.kill(); } catch (e) {}
  await new Promise(r => setTimeout(r, 300));

  console.log('\n========================================');
  console.log('通过 ' + passed + ' / 失败 ' + failed);
  if (failures.length) {
    console.log('\n失败明细：');
    failures.forEach(function (f) { console.log('  - ' + f.name + '：' + f.error); });
  }
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
})();
