# aiusage

追踪和分析 AI 编程助手（Claude Code、Codex、OpenClaw）的使用情况。从本地会话日志中聚合 token 消耗、费用和工具调用统计。

[English](./README.md) | 中文

## 项目结构

```
packages/
  core/     - 共享类型、数据库 schema、定价数据
  cli/      - CLI 工具，用于解析日志、查询数据、云端同步
  web/      - SvelteKit Web 仪表盘（SPA）
```

## 技术栈

- **运行时：** Node.js、TypeScript
- **数据库：** better-sqlite3（本地，WAL 模式）
- **CLI：** Commander.js
- **Web：** SvelteKit + adapter-static
- **构建：** tsup（core/cli）、Vite（web）
- **测试：** Vitest
- **同步：** GitHub API、AWS S3 / Cloudflare R2

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test
```

## CLI 命令

```bash
# 显示使用摘要
aiusage summary [--week|--month] [--from YYYY-MM-DD] [--to YYYY-MM-DD]

# 显示当前状态
aiusage status

# 导出数据
aiusage export --format csv|json|ndjson [--range day|week|month] [-o file]

# 启动 Web 仪表盘
aiusage serve [--port 3847]

# 清理旧数据
aiusage clean [--before 30d] [--remote] [--all-devices]

# 重新计算费用
aiusage recalc [--pricing]

# 配置云端同步
aiusage init --backend github --repo user/repo --token ghp_...
aiusage init --backend s3 --bucket my-bucket --access-key-id ... --secret-access-key ...

# 执行同步
aiusage sync
```

## Web 仪表盘

通过浏览器查看使用数据：

- **概览** — 总 token 数、费用、活跃天数、按工具分类
- **Token** — 每日 token 用量图表（输入/输出/思考）
- **费用** — 每日费用图表，按工具和模型分类
- **模型** — 模型分布及使用占比
- **工具调用** — 工具调用频率排行
- **会话** — 会话列表，支持筛选和分页

启动仪表盘：

```bash
aiusage serve
# 打开 http://localhost:3847
```

## 云端同步

通过 GitHub 或 S3 兼容存储在多设备间同步使用数据。

### GitHub

```bash
aiusage init --backend github --repo user/aiusage-data --token ghp_xxxx
aiusage sync
```

### S3 / Cloudflare R2

```bash
aiusage init --backend s3 \
  --bucket my-bucket \
  --prefix aiusage/ \
  --endpoint https://xxx.r2.cloudflarestorage.com \
  --region auto \
  --access-key-id AKIA... \
  --secret-access-key ...

aiusage sync
```

同步使用乐观锁（S3 的 ETag、GitHub 的 SHA）防止多设备冲突。每次同步前通过 SHA256 指纹验证用户同意。

## 数据存储

- 本地数据库：`~/.aiusage/cache.db`
- 配置文件：`~/.aiusage/config.json`
- 状态文件：`~/.aiusage/state.json`

## 许可证

MIT
