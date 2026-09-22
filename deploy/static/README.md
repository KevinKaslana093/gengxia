# 静态部署（GitHub Pages）

把「梗一下」导出为纯静态站点，托管在 GitHub Pages 上，**点开即玩、零服务器**。

- **线上地址**：https://kevinkaslana093.github.io/gengxia/
- 站点内容来自 `gh-pages` 分支（与 `main` 分开，`main` 仍是完整源码）

## 为什么能静态跑

游戏运行时完全不需要服务端：引擎（`engine.js` / `modes.js`）、12 套场景素材
（`art-scenes.js` / `theme.js`）、音效（`audio.js`，实时合成）、二维码（`qr.js`）
全部在前端，0 网络调用。服务端只负责两件事，静态版没有它们：

| 能力 | 静态版 | 完整版 |
| --- | --- | --- |
| 玩预设游戏、分享链接、挑战分数 `?c=` | ✅ | ✅ |
| 输入自己的梗生成新游戏 | ❌（需模型密钥） | ✅ |
| 生成后的游戏可编辑 | ❌ | ✅ |

## 构建

```bash
# STATIC_BASE 必须是 Pages 站点路径（/<仓库名>/），否则资源全 404
STATIC_BASE=/gengxia/ python3 deploy/static/build-static.py
# 产出：static-build/（38 个文件）
```

构建脚本会做这几件事：

1. 复制 `public/` 全量前端，并补上 `shared/`（前端要 `/shared/schema.js`、`/shared/scenes.js`）；
2. 用 node 调 `server/presets.js` 导出 10 个预设游戏 → `api/games/<id>.json`；
3. 生成 `api/gallery.json`，**结构与服务端 `/api/gallery` 完全一致**
   （键是 `presets` / `recent` / `items`，卡片字段一样；曾误写成 `games` 导致首页卡片空白）；
4. 注入 `js/static-api.js` 垫片：把 `/api/*` 的 fetch 映射到静态 JSON；
5. 为每个预设生成 `/g/<id>.html`；
6. 写 `.nojekyll`（**必须**，否则 Pages 的 Jekyll 构建报 `Page build failed`）；
7. 自检：任何页面出现双重前缀或多个 `<base>` 就构建失败。

## 发布

```bash
python3 deploy/static/publish-pages.py     # 走 REST Git Data API 推 gh-pages
```

> 本机 `git push` 到 GitHub 会被网络阻断（TCP 重置），所以发布脚本走 REST API。
> 细节见技能 `github-push-restricted-network`。

发布后到 Settings → Pages 确认 source 是 `gh-pages` / `/`。首次生效约 1–20 分钟。

## 踩过的坑（改动时别踩回去）

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 子目录页面全白、控制台一片 404 | `<base href="/">` 指向域名根，而站点在 `/gengxia/` 下 | base 写成站点根 `/<repo>/` |
| 首页正常、游戏页空白 | 路由只认恰好 `/g/<id>`，静态托管带 `.html` 或尾斜杠 | 路由清洗后缀 / 尾斜杠 / 仓库名前缀 |
| 点卡片后 URL 缺前缀，分享出去 404 | `pushState` 与 `shareUrl` 用了硬编码 `/g/` | 一律走 `withBase()` |
| 首页标题在、卡片空白 | 垫片返回 `{games:...}`，前端读 `presets` | 对齐服务端返回结构 |
| Pages 报 `Page build failed`、`duration: 0` | 没放 `.nojekyll`，Jekyll 处理失败 | 放空的 `.nojekyll` |
| 本地 `python -m http.server` 测不出问题 | 它会把 `/g/x` 302 到 `/g/x/`，且不做无扩展名路由 | 用 `/gengxia/` 前缀目录模拟 Pages 布局 |
