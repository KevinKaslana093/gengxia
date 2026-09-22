# -*- coding: utf-8 -*-
"""静态化构建：把「梗一下」导出为可托管在 GitHub Pages 的纯静态站点。

思路：
  - 复制 public/ 下的全部前端文件
  - 导出 10 个预设游戏为 /g/<id>.json（静态数据）
  - 注入一个 API 垫片（static-api.js），把原本的 /api/* 请求
    重定向到静态 JSON 文件（game.json / gallery.json）
  - 生成 /g/<id>/index.html（分享链接仍是 /g/<id> 形式）

限制（必须在上线说明里讲清楚）：
  - 无法「生成」新游戏（那需要密钥调用模型）
  - 只有预先导出的预设游戏可玩
"""
import os, sys, json, shutil, io, re

SRC = r'C:/Users/34228/Documents/Codex/2026-09-20/w/work/gengxia'
OUT = r'C:/Users/34228/AppData/Local/hermes/cache/scratch/geng1/static-build'

# 站点根路径。GitHub Pages 把站点放在 https://<user>.github.io/<repo>/，
# 因此构建时用 STATIC_BASE=/gengxia/ 生成带前缀的页面。
BASE = os.environ.get('STATIC_BASE', '/')

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)

# ---------- 1) 复制前端 ----------
# public/ 是站点根，shared/ 也要放进来（前端靠 /shared/schema.js 与 /shared/scenes.js）
shutil.copytree(os.path.join(SRC, 'public'), OUT, dirs_exist_ok=True)
shared_dst = os.path.join(OUT, 'shared')
os.makedirs(shared_dst, exist_ok=True)
for name in ('schema.js', 'scenes.js'):
    shutil.copy2(os.path.join(SRC, 'shared', name), os.path.join(shared_dst, name))
print('[1] 前端已复制:', sum(len(f) for _, _, f in os.walk(OUT)), '个文件')

# ---------- 2) 导出预设游戏数据 ----------
sys.path.insert(0, SRC)
presets_js = os.path.join(SRC, 'server', 'presets.js')
# 用 node 导出为 JSON
import subprocess
node_script = """
const m = require(%s);
const list = m.getValidatedPresets();
const out = {games: {}, scenes: {}, modeLabels: {}};
list.forEach(function (p) {
  out.games[p.id] = {
    id: p.id,
    config: p.config,
    scene: null,
    mode: (p.config && p.config.mode) || 'dodge',
    createdAt: 0,
    source: 'preset',
    editable: false
  };
});
try { out.scenes = require(%s).SCENES || {}; } catch (e) {}
try {
  const S = require(%s);
  Object.keys(S.MODES || {}).forEach(function (k) { out.modeLabels[k] = S.MODES[k].label || ''; });
} catch (e) {}
console.log(JSON.stringify(out));
""" % (json.dumps(presets_js),
       json.dumps(os.path.join(SRC, 'shared', 'scenes.js')),
       json.dumps(os.path.join(SRC, 'shared', 'schema.js')))

r = subprocess.run(['node', '-e', node_script], capture_output=True, text=True)
if r.returncode != 0:
    print('导出失败:', r.stderr[:400])
    sys.exit(1)
_bundle = json.loads(r.stdout)
games = _bundle['games']
SCENES = _bundle['scenes']
MODE_LABELS = _bundle['modeLabels']
print('[2] 预设游戏导出:', len(games), '个（场景 %d，玩法标签 %d）'
      % (len(SCENES), len(MODE_LABELS)))

os.makedirs(os.path.join(OUT, 'api', 'games'), exist_ok=True)
for gid, data in games.items():
    with io.open(os.path.join(OUT, 'api', 'games', gid + '.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

# 画廊列表：必须与服务端 /api/gallery 的返回结构一致
# （前端读的是 presets / recent / items；曾误写成 games 导致首页卡片空白）
def gal_item(gid, d):
    cfg = d['config']
    sid = cfg.get('sceneId')
    sc = SCENES.get(sid) or {}
    return {
        'id': gid,
        'title': cfg.get('title', ''),
        'intro': cfg.get('intro', ''),
        'ruleText': cfg.get('ruleText', ''),
        'mode': d['mode'],
        'modeLabel': MODE_LABELS.get(d['mode'], ''),
        'sceneId': sid,
        'sceneLabel': sc.get('label', ''),
        'avatarId': (cfg.get('player') or {}).get('avatarId'),
        'collectibleSpriteId': (cfg.get('collectible') or {}).get('spriteId'),
        'obstacleSpriteId': (cfg.get('obstacle') or {}).get('spriteId'),
        'source': 'preset',
        'editable': False,
    }

presets = [gal_item(gid, d) for gid, d in games.items()]
gallery = {'presets': presets, 'recent': [], 'items': presets}
with io.open(os.path.join(OUT, 'api', 'gallery.json'), 'w', encoding='utf-8') as f:
    json.dump(gallery, f, ensure_ascii=False, indent=1)
print('[3] 画廊索引已生成（%d 个预设，结构同服务端）' % len(presets))

# ---------- 3) 注入 API 垫片 ----------
# 注意：fetch('/api/...') 里的前导斜杠会解析到**站点根**，
# 而 GitHub Pages 把站点放在 /<repo>/ 下，所以垫片必须自己带上 base 前缀。
shim = """/* 静态部署垫片：把 /api/* 请求映射到静态 JSON 文件。
 * 仅用于 GitHub Pages 等纯静态托管：只能读预设游戏，无法生成新游戏。
 *
 * 路径处理：站点可能挂在子路径下（如 /gengxia/），
 * 因此这里从 <base href> 推导前缀，再用绝对路径请求静态 JSON。 */
(function () {
  'use strict';
  var real = window.fetch;
  var baseEl = document.querySelector('base');
  var base = (baseEl && baseEl.getAttribute('href')) || '/';
  if (base.charAt(base.length - 1) !== '/') base += '/';

  function json(obj) {
    return new Response(JSON.stringify(obj),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  function err(code, message, status) {
    return new Response(JSON.stringify({ error: { code: code, message: message } }),
      { status: status || 404, headers: { 'Content-Type': 'application/json' } });
  }
  function staticUrl(rel) { return base + rel; }

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : ((input && input.url) || '');
    var m = url.match(/^\\/api\\/games\\/([^\\/?]+)/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (init && (init.method === 'PATCH' || init.method === 'POST')) {
        return Promise.resolve(err('static_mode',
          '这是静态演示站点：可以玩预设游戏，但不能生成或编辑。', 403));
      }
      /* 已经带后缀的（如 demo-naicha.json）直接放行，避免重复加后缀 */
      var file = /\\.json$/.test(id) ? id : (id + '.json');
      return real(staticUrl('api/games/' + file), init).then(function (r) {
        if (r.ok) return r;
        return err('not_found', '这个游戏不在静态包里。', 404);
      });
    }
    if (url.indexOf('/api/gallery') === 0) {
      return real(staticUrl('api/gallery.json'), init);
    }
    if (url.indexOf('/api/games') === 0 && init && (init.method === 'POST')) {
      return Promise.resolve(err('static_mode',
        '这是静态演示站点：生成功能需要服务端与模型密钥，未包含在静态版里。', 403));
    }
    return real(input, init);
  };
})();
"""
with io.open(os.path.join(OUT, 'js', 'static-api.js'), 'w', encoding='utf-8') as f:
    f.write(shim)

# 在 index.html 里、其他脚本之前插入垫片
idx = os.path.join(OUT, 'index.html')
raw = io.open(idx, encoding='utf-8').read()
if '/js/static-api.js' not in raw:
    raw = raw.replace('<script src="/js/api.js"></script>',
                      '<script src="/js/static-api.js"></script>\n  <script src="/js/api.js"></script>')

def apply_base(doc):
    """把站点根路径写进页面：绝对资源加前缀 + 插入 <base>。
    只对**原始** HTML 调用一次，避免重复加前缀（曾出现 /gengxia/gengxia/）。"""
    if BASE != '/':
        doc = doc.replace('src="/', 'src="' + BASE).replace('href="/', 'href="' + BASE)
    if '<base' not in doc:
        doc = doc.replace('<head>', '<head>\n  <base href="%s">' % BASE, 1)
    return doc

html = apply_base(raw)          # 根页（已带前缀，供下面的游戏页复用）
io.open(idx, 'w', encoding='utf-8').write(html)
print('[4] 垫片已注入 index.html（BASE=%s）' % BASE)

# ---------- 4) 为每个预设生成 /g/<id>.html ----------
# 说明：不用 /g/<id>/index.html —— 静态服务器会 302 到带斜杠的地址，
# 而 app.js 的路由要求恰好是 /g/<id>，斜杠会导致"页面不存在"。
#
# <base href> 必须指向**站点根**，否则子目录页面里的 /js、/css、/shared 会 404。
# 注意：这里复用已经处理过的 html（含 base 与前缀），所以直接写盘，不再二次加前缀。
os.makedirs(os.path.join(OUT, 'g'), exist_ok=True)
for gid in games:
    io.open(os.path.join(OUT, 'g', gid + '.html'), 'w', encoding='utf-8').write(html)
print('[5] 已生成', len(games), '个游戏页（/g/<id>.html，BASE=%s）' % BASE)

# 另出一份 404.html（GitHub Pages 用它兜底 /g/<id> 无扩展名的请求）
io.open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(
    html + '\n<!-- GitHub Pages 404 兜底：app.js 按 location.pathname 自行路由 -->\n')

# ---------- 5) 禁止搜索引擎索引（演示站）----------
io.open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf-8').write(
    'User-agent: *\nDisallow: /\n')
print('[6] robots.txt（演示站，不索引）')

print()
print('静态站点已生成:', OUT)
print('文件总数:', sum(len(f) for _, _, f in os.walk(OUT)))

# ---------- 6) 构建自检：禁止双重前缀 ----------
problems = []
for root, dirs, names in os.walk(OUT):
    for n in names:
        if not n.endswith('.html'):
            continue
        fp = os.path.join(root, n)
        doc = io.open(fp, encoding='utf-8').read()
        bases = re.findall(r'<base href="([^"]*)"', doc)
        if len(bases) > 1:
            problems.append('%s 有多个 base: %s' % (n, bases))
        if BASE != '/':
            bad = BASE.rstrip('/') + BASE          # 形如 /gengxia/gengxia/
            if bad in doc:
                problems.append('%s 出现双重前缀 %s' % (n, bad))
if problems:
    print('[自检失败]')
    for x in problems[:10]:
        print('  -', x)
    sys.exit(1)
print('[自检通过] 无双重前缀、每页至多一个 base')

# ---------- 7) .nojekyll ----------
# GitHub Pages 默认走 Jekyll 构建，对本项目这种纯静态站点会失败
# （表现为 build status = errored、duration 0）。放一个空 .nojekyll
# 让它跳过 Jekyll，直接按原样发布文件。
io.open(os.path.join(OUT, '.nojekyll'), 'w', encoding='utf-8').write('')
print('[7] .nojekyll 已写入')
