# aiusage

追踪和分析 AI 编程助手（Claude Code、Codex、OpenClaw）的使用情况。从本地会话日志中聚合 token 消耗、费用和工具调用统计。

[English](./README.md) | 中文

## 功能

- 解析 Claude Code / Codex / OpenClaw 的本地 JSONL 会话日志
- 按工具、模型、日期聚合 token 用量和费用
- 工具调用频率统计
- 多设备数据同步（GitHub / S3 / R2）
- Web 仪表盘可视化

## 快速开始

**前置条件：** Node.js >= 18，pnpm

```bash
# 克隆并构建
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build

# 将 CLI 添加到全局 PATH
cd packages/cli
npm link
cd ../..

# 解析本地会话日志
aiusage parse

# 查看用量摘要
aiusage summary

# 启动 Web 仪表盘
aiusage serve
# 打开 http://localhost:3847
```

日常使用只需两条命令：

```bash
aiusage parse   # 导入新数据
aiusage serve   # 打开仪表盘
```

**自动化解析（可选）：**

```bash
# Linux/macOS — 每 30 分钟
crontab -e
# 添加：
*/30 * * * * /usr/local/bin/aiusage parse >> ~/.aiusage/cron.log 2>&1

# Windows
schtasks /create /tn "AiusageParse" /tr "aiusage parse" /sc minute /mo 30
```

---

## CLI 命令

| 命令 | 说明 |
|------|------|
| `aiusage parse` | 解析本地 AI 会话日志到数据库 |
| `aiusage summary` | 显示用量摘要（支持 `--week` `--month`） |
| `aiusage status` | 显示当前状态 |
| `aiusage serve` | 启动 Web 仪表盘（支持 `--port`） |
| `aiusage sync` | 与远程后端同步数据 |
| `aiusage export` | 导出数据（`--format csv/json/ndjson`） |
| `aiusage clean` | 清理旧数据（`--before 30d`） |
| `aiusage recalc` | 重新计算费用（`--pricing`） |
| `aiusage init` | 配置同步后端（`--backend github/s3`） |

## Web 仪表盘

```bash
aiusage serve
# 打开 http://localhost:3847
```

- **概览** — 总 token 数、费用、活跃天数、按工具分类
- **Token** — 每日 token 用量图表（输入/输出/思考）
- **费用** — 每日费用图表，按工具和模型分类
- **模型** — 模型分布及使用占比
- **工具调用** — 工具调用频率排行
- **会话** — 会话列表，支持筛选和分页

---

## 部署

需要多机汇总或云端访问？根据场景选择：

| 场景 | 方式 | 说明 |
|------|------|------|
| 多台机器，汇总数据 | [多机同步](#多机同步) | 通过 GitHub/S3 同步 |
| 多台机器 + 统一看板 | [Docker 部署](#docker-部署) | 拉镜像即用，24/7 仪表盘 |

单机使用只需按上方"快速开始"操作即可，无需额外部署。

### 多机同步

适合有多台机器使用 Claude Code / Codex / OpenClaw，需要汇总所有机器的 token 用量。

**架构：**

```
机器 A ──┐
机器 B ──┼──▶ GitHub / S3（共享存储）──▶ 任意机器：aiusage summary / serve
机器 C ──┘
```

**第一步 — 选择同步后端：**

**方案 A：GitHub（推荐）**

1. 在 GitHub 上创建一个**私有**仓库（如 `aiusage-data`）
2. 生成 [Personal Access Token](https://github.com/settings/tokens)，勾选 `repo` 权限

**方案 B：AWS S3 / Cloudflare R2**

1. 创建一个 S3 或 R2 存储桶
2. 创建具有读写权限的 IAM 用户/角色
3. 记下 Access Key ID、Secret Access Key 和 Endpoint

**第二步 — 在每台机器上安装并配置：**

在**每一台**使用 AI 编程助手的机器上执行：

```bash
# 安装 aiusage CLI
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
cd packages/cli
npm link
cd ../..

# 配置同步后端 — GitHub
aiusage init --backend github \
  --repo <user>/aiusage-data \
  --token ghp_xxxxxxxxxxxxxxxxxxxx

# 或配置同步后端 — S3 / R2
aiusage init --backend s3 \
  --bucket my-aiusage-bucket \
  --prefix aiusage/ \
  --endpoint https://<account-id>.r2.cloudflarestorage.com \
  --region auto \
  --access-key-id AKIAxxxxxxxxxxxx \
  --secret-access-key xxxxxxxxxxxxxxxxxxxxxxxxxx
```

**第三步 — 解析并同步（每台机器）：**

```bash
aiusage parse
aiusage sync
```

**第四步 — 查看汇总数据（任意机器）：**

```bash
aiusage sync      # 拉取其他机器的最新数据
aiusage summary   # 查看汇总
aiusage serve     # 或启动仪表盘
```

**自动化（推荐）：**

```bash
# Linux/macOS
crontab -e
# 添加：
*/30 * * * * /usr/local/bin/aiusage parse && /usr/local/bin/aiusage sync >> ~/.aiusage/cron.log 2>&1

# Windows
schtasks /create /tn "AiusageSync" /tr "aiusage parse && aiusage sync" /sc minute /mo 30
```

**同步原理：**

- 每台机器有唯一的 `deviceInstanceId`（首次运行时生成）
- 数据按月存储为 NDJSON 文件（`YYYY/MM.ndjson`）在远端后端
- Pull 将远端记录合并到本地 `synced_records` 表，Upload 将本地记录合并到远端（永远不覆盖）
- 使用乐观锁（S3 的 ETag、GitHub 的 SHA）防止多设备冲突
- Session ID 通过 `sha256(device + sessionId)` 匿名化

---

### Docker 部署

在云端服务器拉取镜像运行，24/7 提供统一仪表盘。各机器的数据通过同步后端自动汇总。

**架构：**

```
机器 A ──┐                             ┌── 浏览器：https://aiusage.your-domain.com
机器 B ──┼──▶ GitHub / S3 ──▶ 云端服务器（Docker）
机器 C ──┘                             └── 端口 3847
```

**第一步 — 拉取镜像并运行：**

```bash
# 拉取镜像
docker pull juliantanx/aiusage

# 运行容器
docker run -d \
  --name aiusage \
  -p 3847:3847 \
  -v aiusage-data:/root/.aiusage \
  juliantanx/aiusage

# 配置同步后端
docker exec -it aiusage node packages/cli/dist/index.js init \
  --backend github \
  --repo <user>/aiusage-data \
  --token ghp_xxxxxxxxxxxxxxxxxxxx

# 首次拉取数据
docker exec -it aiusage node packages/cli/dist/index.js sync
```

**第二步 — 定时同步：**

```bash
# 在容器内安装 cron 并创建定时任务
docker exec -it aiusage bash -c "apt-get update && apt-get install -y cron"
docker exec -it aiusage bash -c \
  'echo "*/30 * * * * node /app/packages/cli/dist/index.js parse && node /app/packages/cli/dist/index.js sync >> /root/.aiusage/cron.log 2>&1" | crontab -'
docker restart aiusage
```

**第三步 — 访问：**

打开 `http://<服务器IP>:3847`。

如需 HTTPS + 自定义域名：

```bash
# Caddy（自动 HTTPS，推荐）
caddy reverse-proxy --from aiusage.your-domain.com --to localhost:3847

# 或 Nginx
server {
    listen 80;
    server_name aiusage.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**自行构建镜像（可选）：**

如果需要自行构建，项目根目录已包含 `Dockerfile`：

```bash
docker build -t aiusage .
```

---

## 数据存储

| 项目 | 路径 |
|------|------|
| 本地数据库 | `~/.aiusage/cache.db` |
| 配置文件 | `~/.aiusage/config.json` |
| 状态文件（水位线、同步状态） | `~/.aiusage/state.json` |

## 技术栈

- **运行时：** Node.js、TypeScript
- **数据库：** better-sqlite3（本地，WAL 模式）
- **CLI：** Commander.js
- **Web：** SvelteKit + adapter-static
- **构建：** tsup（core/cli）、Vite（web）
- **同步：** GitHub API、AWS S3 / Cloudflare R2

## 项目结构

```
packages/
  core/     - 共享类型、数据库 schema、定价数据
  cli/      - CLI 工具，用于解析日志、查询数据、云端同步
  web/      - SvelteKit Web 仪表盘（SPA）
```

## 许可证

MIT
