# 「梗一下」容器镜像
#
# 零 npm 依赖，因此不需要 npm install 步骤 —— 直接复制源码运行。
# 需要 Node.js >= 22.5（内置 node:sqlite）。

FROM node:22-alpine

# 时区（生成记录的"今日"统计按本地时区计算）
ENV TZ=Asia/Shanghai

WORKDIR /app

# 复制源码（顺序：先代码后可能变化的配置）
COPY package.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY public/ ./public/
COPY scripts/ ./scripts/

# 数据目录。生产环境请把它挂载到持久卷（SQLite 需要可写持久磁盘），
# 否则容器重建后分享链接会失效。挂载示例：-v gengxia-data:/app/data
RUN mkdir -p /app/data

# 容器内必须监听 0.0.0.0，否则平台健康检查与外部流量都进不来
ENV HOST=0.0.0.0
ENV PORT=8765
ENV DB_PATH=/app/data/gengxia.db

EXPOSE 8765

# 健康检查：/api/health 返回 {"ok":true}
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8765)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 以非 root 运行（node 镜像自带 node 用户）
RUN chown -R node:node /app
USER node

CMD ["node", "server/index.js"]
