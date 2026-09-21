# 部署说明

本项目的分享链接依赖 **SQLite 持久化**（存游戏配置与编辑凭据哈希）。
数据库存在 `/data/gengxia.db`（可用 `DB_PATH` 覆盖），**必须挂载持久卷**，
否则平台重启/重新部署后旧分享链接会 404。

> 平台选择的首要条件不是"免费"，而是"**有没有持久磁盘**"。
> Vercel / Netlify 这类无状态 Serverless 平台**不适用**（文件系统随冷启动清空），
> Render 的**免费**实例同样没有持久磁盘（付费 $7/月档才有）。

---

## 一、本机 / 自有 VPS（最简单，已验证）

```bash
node --version          # 需 >= 22.5（内置 node:sqlite）
cp .env.example .env    # 填 LLM_API_KEY 等
npm start               # → http://127.0.0.1:8765
```

对外提供服务时建议用 HTTPS 反向代理（Caddy 会自动申请证书）：

```caddyfile
gengxia.example.com {
    reverse_proxy 127.0.0.1:8765
}
```

`.env` 需相应调整：

```bash
HOST=127.0.0.1        # 只让反代访问，不直接暴露
PORT=8765
DB_PATH=/var/lib/gengxia/gengxia.db   # 指向持久目录
GEN_DAILY_LIMIT=200   # 按预算设置
```

上线检查清单（README「部署」一节有完整版）：
- [ ] HTTPS 已生效，分享链接用 `https://` 打开
- [ ] `LLM_API_KEY` 通过环境变量或 `LLM_API_KEY_FILE` 注入，**未写入任何文件**
- [ ] 数据库位于持久磁盘，重启后旧链接仍可玩
- [ ] `GEN_DAILY_LIMIT` 按实际预算收紧（防止密钥被刷）

---

## 二、Docker（任意支持容器的平台）

```bash
docker build -t gengxia .
docker run -d --name gengxia \
  -p 8765:8765 \
  -v gengxia-data:/app/data \
  -e LLM_API_KEY=... \
  -e LLM_BASE_URL=https://ollama.com/v1 \
  -e LLM_MODEL=deepseek-v4.1-flash \
  -e LLM_MAX_TOKENS=8000 \
  gengxia
```

`-v gengxia-data:/app/data` 是**必须的**，否则容器重建即丢数据。
镜像内已设置 `HOST=0.0.0.0`、`DB_PATH=/app/data/gengxia.db`，并带 `HEALTHCHECK`。

本机已验证容器化所需的三项行为（在宿主机上模拟）：
`HOST=0.0.0.0` 正常监听、`DB_PATH` 指向任意可写路径可建库、容器内地址返回 200。
**未在本机实际跑过 `docker build`**（本机无 Docker），首次部署请留意构建日志。

---

## 三、Northflank（免费额度含持久卷）

免费 Developer 档给 2 个服务 + 持久卷，且无冷启动。配置见 [`northflank.yaml`](northflank.yaml)。

要点：
- 实例数必须为 **1**（SQLite 不能多实例并行写）
- 卷挂到 `/app/data`
- 密钥在控制台的环境变量里设置，**不要写进仓库**

---

## 四、Fly.io（付费，低流量很便宜）

新账号**没有免费额度**（老账号的免费额度仍保留）。按运行秒计费，
shared-cpu-1x 256MB 常开约 $2.02/月 + 卷 $0.15/GB/月。
配置见 [`fly.toml`](fly.toml)，已开启 `auto_stop_machines`（无请求时停机省钱）。

```bash
fly launch --no-deploy       # 读 fly.toml
fly volumes create gengxia_data --size 1
fly secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=... LLM_MAX_TOKENS=8000
fly deploy
```

---

## 不适用说明

| 平台 | 为什么不行 |
|---|---|
| Vercel / Netlify | 无状态 Serverless，文件系统随冷启动清空 → 分享链接随机失效 |
| Render 免费档 | 官方文档明确：免费 Web Service 为 ephemeral 文件系统，**不能挂持久盘**；且 15 分钟无请求即休眠 |
| Cloudflare Workers | 无 Node 运行时（本项目依赖 `node:sqlite`、`node:http`） |
| 任何多实例/自动扩缩容配置 | SQLite 单文件写入，多实例会各自持有独立数据库 |
