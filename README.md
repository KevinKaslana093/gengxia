# 梗一下

把你们之间的梗，变成一个朋友点开就能玩的小游戏。

输入一句生活中的吐槽、一段故事或一个祝福 → 生成一个竖屏小游戏（三种玩法 · 十二套场景）→ 把链接发给朋友，点开就能玩。

> **v2 更新**：本轮在 v1 基础上增量开发，新增「三路跑酷」「限时点击」两种玩法与 12 套场景，
> 修复了文案与规则不一致的问题，并加入可扫码分享的成绩卡。详见 [UPDATE-v2.md](UPDATE-v2.md)。

---

## 快速开始

```bash
# Node.js >= 22.5（需要内置 node:sqlite）
node --version

# 1. 配置模型（复制示例并按需修改）
cp .env.example .env
#    最少要设置 LLM_API_KEY（或 LLM_API_KEY_FILE 指向已有 .env）
#    不配置也能启动：预设游戏可玩，生成功能会返回明确错误

# 2. 启动
npm start
#    → http://127.0.0.1:8765

# 3. 测试（无需模型额度，全部离线可跑）
npm test
```

**零 npm 依赖**：只使用 Node 内置模块（`node:http`、`node:sqlite`、原生 `fetch`、`node:crypto`）。
不需要构建步骤，前端是原生 ES5 风格 JS + Canvas 2D，浏览器直接执行源码。

**三种玩法**：躲避收集（45 秒）· 三路跑酷（45 秒）· 限时点击（35 秒），均为 3 点生命。
生成时可「自动匹配」或指定玩法。**十二套场景**：深夜卧室、办公室、宿舍早八、生日派对、奶茶店、
通勤地铁、健身房、考试教室、厨房、宠物客厅、旅行机场、购物快递。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LLM_PROVIDER` | `openai-compat` | `openai-compat` / `ollama`（原生 API）/ `mock`（本地测试，不调用模型） |
| `LLM_BASE_URL` | `https://ollama.com/v1` | OpenAI 兼容接口基址 |
| `LLM_MODEL` | `deepseek-v4.1-flash` | 模型名 |
| `LLM_API_KEY` | — | 服务端密钥，**只存在于服务端环境变量** |
| `LLM_API_KEY_FILE` | — | 或指向一个已存在的 `.env` 文件（读取其中的 `OLLAMA_API_KEY`），适合开发期复用本机配置 |
| `LLM_TIMEOUT_MS` | `120000` | 单次调用超时 |
| `LLM_MAX_TOKENS` | `4000` | 输出上限（推理模型建议 ≥ 3000） |
| `LLM_MAX_CONCURRENCY` | `3` | 全局并发上限 |
| `LLM_RETRY_ON_ERROR` | `1` | 网络/5xx/限流的有限重试次数（0-2） |
| `LLM_JSON_MODE` | `auto` | `auto` / `on` / `off`；openai-compat 下使用 `response_format: json_object` |
| `GEN_ENABLED` | `true` | 生成总开关，`false` 时只读玩法仍可用 |
| `GEN_DAILY_LIMIT` | `200` | 每日生成总量上限（费用保护） |
| `GEN_PER_IP_LIMIT` | `6` | 单 IP 窗口内生成次数上限 |
| `GEN_PER_IP_WINDOW_MS` | `600000` | 上述窗口长度 |
| `GEN_DEDUPE_WINDOW_MS` | `120000` | 同 IP 同故事去重窗口（避免重复烧 token） |
| `PORT` / `HOST` | `8765` / `127.0.0.1` | 监听地址。部署到公网时设 `HOST=0.0.0.0` |
| `DB_PATH` | `./data/gengxia.db` | SQLite 文件位置 |
| `BODY_LIMIT_BYTES` | `65536` | 请求体上限 |

> 密钥优先级：`LLM_API_KEY` > `OLLAMA_API_KEY`（进程环境变量）> `.env` 文件。密钥从不写入日志、HTTP 响应或前端产物。

---

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/games` | 校验输入 → 调用模型 → 校验配置 + 语义一致性 → 持久化。返回 `{ id, config, editToken, createdAt }`。请求体可带 `mode`（`auto` 或指定玩法）。支持 `Accept: application/x-ndjson` 流式返回真实阶段 |
| `GET` | `/api/games/:id` | 返回可公开游玩的配置（**不含**原始故事、凭据、服务端信息）。v1 旧配置在此处平滑迁移到 v2（**不写回数据库**） |
| `PATCH` | `/api/games/:id` | 仅限 `title` / `playerName`，需 `editToken`（创建时返回，服务端只存哈希） |
| `GET` | `/api/gallery` | 预设游戏与近期作品列表 |
| `GET` | `/api/scenes` | 12 套场景的定义（配色、素材白名单、支持的玩法、示例文案） |
| `GET` | `/api/health` | 健康检查（不含密钥；含场景数、玩法列表、今日已生成数） |
| `GET` | `/shared/*` | 前后端共用的 `schema.js` / `scenes.js`（正确 `text/javascript`，缺失返回真实 404） |

错误统一为 `{ error: { code, message } }`：

| code | HTTP | 含义 |
|---|---|---|
| `bad_story` | 400 | 故事长度不合规（10–1000 字） |
| `bad_patch` | 400 | 编辑字段不合规或试图改未授权字段 |
| `too_large` | 413 | 请求体超过 `BODY_LIMIT_BYTES` |
| `forbidden` | 403 | 编辑凭据缺失或错误 |
| `not_found` | 404 | 游戏不存在 |
| `rate_limited` | 429 | 单 IP 频率超限（或模型自身 429） |
| `limit` | 429 | 当日生成总量已达上限 |
| `bad_output` | 422 | 模型输出经修复重试后仍不合规（**不会静默降级**） |
| `bad_response` | 502 | 模型返回空内容或畸形响应（空内容会自动重试一次） |
| `timeout` / `auth_error` / `server_error` / `network` | 502/503 | 模型侧问题，已如实透传 |
| `disabled` | 503 | `GEN_ENABLED=false` |

---

## 生成架构（为什么模型不能乱来）

```
用户故事 ──► 提示词 ──► 模型 ──► JSON 提取 ──► 运行时校验 ──►(失败)→ 修复一次 ──► 入库
                                    │                              │
                              纯文本处理，绝不 eval          仍失败 → 明确报错，绝不伪装成功
```

- 模型**只输出结构化配置**（`shared/schema.js` 定义），从不生成可执行代码，不使用 `eval`。
- 玩法规则、时长（45 秒）、生命（3 点）、难度曲线、速度上限、实体数量上限、音频全部由固定引擎决定，**配置里没有这些字段**，模型无法干预。
- 所有枚举（主题 / 主角 / 障碍图案 / 奖励图案）在服务端与浏览器共用同一份定义；未知 ID 直接拒绝。
- 校验覆盖：字段类型、必填项、文本长度（按 Unicode 码点）、台词条数、HTML 尖括号、手机号 / 邮箱 / 链接 / 长数字等隐私特征、严重侮辱与威胁。
- 用户原始故事仅作为素材传入模型，**不写入数据库**；公开响应只含生成后的配置。

配置结构：

```json
{
  "schemaVersion": 1,
  "title": "逃离改稿地狱",
  "intro": "收集下班卡，躲开临时需求，坚持到准点下班！",
  "player": { "name": "打工人", "avatarId": "office-worker" },
  "themeId": "office-neon",
  "obstacle": { "name": "临时需求", "spriteId": "document" },
  "collectible": { "name": "下班卡", "spriteId": "ticket" },
  "lines": ["这个改动很小", "最后再来一版"],
  "ending": { "low": "...", "mid": "...", "high": "..." }
}
```

---

## 项目结构

```
gengxia/
├── server/
│   ├── index.js              # HTTP 入口：路由、静态资源、SPA 回退、优雅退出
│   ├── config.js             # 环境变量与密钥解析（不写入日志）
│   ├── db.js                 # node:sqlite 持久化（无 story 列）
│   ├── util.js               # 随机 ID、凭据哈希、限速、请求体读取
│   ├── static.js             # 静态文件服务（含路径穿越防护）
│   ├── presets.js            # 3 个官方预设（同样走 Schema 校验）
│   ├── seed.js               # 启动时幂等写入预设
│   ├── routes/api.js         # JSON API
│   └── llm/
│       ├── adapter.js        # 模型适配层（provider 可切换、并发闸门、错误码归一）
│       ├── prompt.js         # 提示词（枚举与 schema 同源）
│       └── generate.js       # 编排：调用 → 提取 → 校验 → 修复一次
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js            # 路由与页面（首页 / 生成 / 游戏 / 结算 / 分享卡 / 404）
│       ├── engine.js         # 躲避收集引擎（Canvas 2D、时间增量、状态机）
│       ├── modes.js          # 三路跑酷 + 限时点击 两种新玩法引擎
│       ├── theme.js          # 场景配色 + 旧素材绘制 + 绘制路由
│       ├── art-scenes.js     # 12 套场景背景 + 30 个新素材图案
│       ├── qr.js             # 零依赖二维码编码器（分享卡用，非模型绘制）
│       ├── audio.js          # WebAudio 合成音效（无音频文件）
│       └── api.js            # API 客户端与流式读取
├── shared/                   # 前后端共用（服务端静态映射，不复制）
│   ├── schema.js             # v2 字段/枚举/校验/语义一致性检查
│   └── scenes.js             # 12 套场景定义（配色/素材/示例，单一事实来源）
├── scripts/                  # 需联网的辅助脚本（消耗模型额度）
│   ├── eval-100.js           # 100 条故事批量评测
│   ├── audit-semantic.js     # 评测结果的 6 维度语义审核
│   └── check-cat-example.js  # 验收 #5：猫的示例复检与重新生成
├── tests/                    # 248 项，全部离线可跑
│   ├── all.js                # 汇总入口（npm test）
│   ├── run.js                # Schema / API 契约 / 权限 / 限流 / 静态资源类型（61 项）
│   ├── engine.js             # 躲避收集引擎：碰撞、无敌、暂停、重开、帧率无关（82 项）
│   ├── modes.js              # 跑酷可避开性 + 点击边界 + 帧率一致性（37 项）
│   ├── llm-errors.js         # 模型输出异常与安全拦截（33 项）
│   ├── semantic.js           # 文案与规则一致性（19 项）
│   └── sharecard.js          # 分享卡版式 + 二维码尺寸（16 项）
├── eval/                     # 100 条评测的输入与脱敏输出（交付物 #6）
└── data/                     # SQLite（已 gitignore）
```

---

## 部署

### 需要持久磁盘

SQLite 需要可写持久磁盘。**无持久磁盘的平台（如部分无状态容器）必须换成持久数据库**，否则分享链接会在重启后失效。

### 方式一：直接跑（推荐先验证）

```bash
HOST=0.0.0.0 PORT=8765 node server/index.js
```

前面挂一层 HTTPS 反向代理（Caddy / Nginx），并把 `GEN_*` 上限设成符合预算的值。

### 方式二：systemd

```ini
[Unit]
Description=Geng Xia
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/gengxia
EnvironmentFile=/srv/gengxia/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
User=gengxia

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gengxia
sudo systemctl status gengxia
journalctl -u gengxia -f          # 日志（不含密钥）
```

### 方式三：Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=8765 DB_PATH=/data/gengxia.db
VOLUME /data
EXPOSE 8765
USER node
CMD ["node", "server/index.js"]
```

```bash
docker build -t gengxia .
docker run -d --name gengxia -p 8765:8765 \
  -v gengxia-data:/data \
  -e LLM_API_KEY=... \
  gengxia
```

> 挂载卷是必须的：容器重建后 `/data` 里的数据库决定分享链接是否还有效。

### 上线前检查清单

- [ ] `HOST=0.0.0.0`，前面有 HTTPS 反向代理
- [ ] `LLM_API_KEY` 用**独立的上线凭据**，不是开发期的大额临时凭据
- [ ] `GEN_DAILY_LIMIT` 按预算设置；必要时 `GEN_ENABLED=false`（已有游戏与预设照常可玩）
- [ ] `DB_PATH` 指向持久卷，并确认重启后 `/api/health` 的 `games` 计数不回退
- [ ] 用真实域名验证首页、`/g/:id` 分享页、静态资源与 HTTPS
- [ ] 确认响应与静态产物里没有密钥（`grep -ri "sk-\|OLLAMA_API_KEY" public/`）

---

## 停止服务

```bash
# 前台运行：Ctrl+C（服务会优雅关闭）
# systemd：
sudo systemctl stop gengxia
# Docker：
docker stop gengxia
```

---

## 运维

- **健康检查**：`GET /api/health` 返回 `{ ok, db, games, generationEnabled, modelConfigured, todayGenerated, dailyLimit }`。
- **数据备份**：直接复制 `data/` 目录即可（SQLite WAL 模式；停止服务后复制最稳妥）。
- **想关掉生成但保留可玩**：`GEN_ENABLED=false` 后重启，已有游戏与预设照常服务。
- **模型额度到期**：已经保存的游戏不受影响；生成会返回明确错误并引导用户玩预设游戏。

---

## 已知限制

- 生成依赖模型接口；超时/限流/凭据不足时**如实报错**，不会伪造成功结果。
- 三种玩法：躲避收集（45 秒）/ 三路跑酷（45 秒）/ 限时点击（35 秒），均为 3 点生命。
- 编辑功能仅支持标题与主角称呼；其余文案重新生成才能改动。
- 分享链接是"持有即访问"，没有账号系统；请不要把含隐私的故事拿去公开分享。
- **挑战模式不承诺相同关卡**：分享链接带 `?c=<分数>` 只表示发起人的分数，
  当前没有固定随机种子，因此不保证相同种子对应相同障碍序列，也不是防作弊排名。
- 无排行榜、无多人联机、无图片上传。
- 无真机验证：手机布局用浏览器视口与触摸媒体特性验证，**未在真实手机上测试**；
  iOS Safari / 微信内置浏览器未验证（代码未用实验性 API）。
- 未做公网部署：本机 `127.0.0.1` 链接**不能**供远程访问，部署步骤见上节。
- `node:sqlite` 在 Node 22 会打印实验性警告（功能正常）。

---

## 费用与后续投入

- 每次生成 = 1～2 次模型调用（正常 1 次；输出不合规或**返回空内容**时额外重试/修复）。
- 实测单次生成约 **7–116 秒**（100 条评测：平均 33.7 秒，中位 29.7 秒，p90 52.3 秒）。
  注意本项目所用 `deepseek-v4.1-flash` 是**推理模型**，思考 token 计入输出预算，
  因此 `LLM_MAX_TOKENS` 需给足（当前 8000）；这只是上限，不增加实际消耗。
- 保护措施：全局并发上限（3）、单 IP 频率限制、同故事去重、每日总量上限（200）、生成总开关。
- 若要长期公开运营，建议：使用独立部署凭据 + 按预算设定 `GEN_DAILY_LIMIT` + 监控 `/api/health` 的 `todayGenerated`。
