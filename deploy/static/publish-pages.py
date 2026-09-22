# -*- coding: utf-8 -*-
"""把静态构建发布到 gh-pages 分支（用于 GitHub Pages）。

同样走 REST API（本机 git push 被网络阻断）。
内容来自 static-build/ 目录，逐文件上传为 blob → tree → commit → ref。
"""
import os, sys, json, zlib, time, base64, hashlib, urllib.request, urllib.error

OWNER, REPO = 'KevinKaslana093', 'gengxia'
SCRATCH = r'C:/Users/34228/AppData/Local/hermes/cache/scratch/geng1'
BUILD = os.path.join(SCRATCH, 'static-build')

TOKEN = open(os.path.join(SCRATCH, '.ghtoken'), encoding='utf-8').read().strip()


def api(method, path, body=None, retries=8):
    url = 'https://api.github.com' + path
    last = None
    for i in range(retries):
        try:
            payload = json.dumps(body).encode('utf-8') if body is not None else None
            req = urllib.request.Request(url, data=payload, method=method)
            req.add_header('Authorization', 'Bearer ' + TOKEN)
            req.add_header('Accept', 'application/vnd.github+json')
            req.add_header('Content-Type', 'application/json')
            req.add_header('User-Agent', 'gengxia-pages')
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read().decode('utf-8')
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:200]
            if e.code in (401, 403, 422):
                raise SystemExit('HTTP %s on %s %s: %s' % (e.code, method, path, detail))
            if e.code == 404:
                return None
            last = 'HTTP %s: %s' % (e.code, detail)
        except Exception as e:
            last = str(e)[:100]
        time.sleep(2 + i)
    raise SystemExit('API 失败 %s %s (%s)' % (method, path, last))


# ---------- 收集文件 ----------
files = []
for root, dirs, names in os.walk(BUILD):
    for n in names:
        full = os.path.join(root, n)
        rel = os.path.relpath(full, BUILD).replace(os.sep, '/')
        with open(full, 'rb') as f:
            files.append((rel, f.read()))
files.sort()
print('静态文件数: %d' % len(files))

# ---------- 上传 blobs ----------
tree_entries = []
total = 0
for n, (path, data) in enumerate(files, 1):
    total += len(data)
    r = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO),
            {'content': base64.b64encode(data).decode('ascii'), 'encoding': 'base64'})
    tree_entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': r['sha']})
    if n % 10 == 0 or n == len(files):
        print('  已上传 %d/%d (%.0f KB)' % (n, len(files), total / 1024))

# ---------- tree ----------
tree = api('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': tree_entries})
print('tree:', tree['sha'][:10], '(%d 项)' % len(tree_entries))

# ---------- commit ----------
msg = """static: 发布静态演示站到 GitHub Pages

把 10 个预设游戏导出为静态数据，并注入 API 垫片，
使「梗一下」可以在纯静态环境（GitHub Pages）下游玩。

限制：静态版只能玩预设游戏，无法生成新游戏
（生成需要服务端调用模型，密钥不能进前端）。"""

# 幂等：若分支已存在则带上父提交
existing = api('GET', '/repos/%s/%s/git/ref/heads/gh-pages' % (OWNER, REPO))
parents = [existing['object']['sha']] if existing else []
commit = api('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO),
             {'message': msg, 'tree': tree['sha'], 'parents': parents})
print('commit:', commit['sha'][:10], '父提交:', parents[0][:10] if parents else '(首个)')

# ---------- ref ----------
if existing:
    api('PATCH', '/repos/%s/%s/git/refs/heads/gh-pages' % (OWNER, REPO),
        {'sha': commit['sha'], 'force': True})
    print('已更新 gh-pages')
else:
    api('POST', '/repos/%s/%s/git/refs' % (OWNER, REPO),
        {'ref': 'refs/heads/gh-pages', 'sha': commit['sha']})
    print('已创建 gh-pages')

# ---------- 校验 ----------
ref = api('GET', '/repos/%s/%s/git/ref/heads/gh-pages' % (OWNER, REPO))
rsha = ref['object']['sha']
rtree = api('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, rsha))
remote = {e['path']: e['sha'] for e in rtree['tree'] if e['type'] == 'blob'}
mismatch = 0
for path, data in files:
    want = hashlib.sha1(b'blob %d\x00' % len(data) + data).hexdigest()
    if remote.get(path) != want:
        mismatch += 1
        print('  不符:', path)
print()
print('远端文件数: %d | 本地: %d | 不符: %d' % (len(remote), len(files), mismatch))
print('[PASS] gh-pages 已就绪' if not mismatch else '[FAIL]')
