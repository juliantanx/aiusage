# aiusage — 设计文档

**日期：** 2026-05-12
**状态：** 已确认

## 概述

一个 CLI 工具，被动读取 AI 编程助手（Claude Code、Codex、OpenClaw）的本地会话日志，聚合 token 消耗、工具调用频率和模型分布，通过终端摘要和本地 Web Dashboard 展示数据。多设备数据通过用户自带的云存储进行同步。

npm 包名：`aiusage`，CLI 命令：`aiusage`。

## 目标

- 统计每个工具和模型的 token 消耗（输入、输出、缓存、思考）
- 展示按工具、模型、提供商、时间段的成本明细
- 展示工具调用频率和分布
- 支持多设备数据汇总（通过云同步）
- 一条命令安装：`npm i -g aiusage`
- 支持 Windows、macOS、Linux

## 非目标

- 实时拦截 API 调用（不做代理）
- 托管后端服务
- v1 阶段不支持没有本地日志文件的工具

## 支持的工具（v1）

| 工具 | 日志路径 | 格式说明 |
|------|----------|--------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | JSONL，`message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | JSONL，`event_msg` 中 `payload.type=token_count`；解析器使用 `last_token_usage.{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`（单次调用增量）累加，避免 `total_token_usage` 重复计数 |
| OpenClaw | `~/.openclaw/agents/*/sessions/*.jsonl` | JSONL，`message.usage.{input, output, cacheRead, cacheWrite, totalTokens, cost}`；统计所有 agent（`*` 通配），包括 main 和用户自定义 agent |

## 架构

### Monorepo 目录结构

```
aiusage/                             # pnpm workspaces
├── packages/
│   ├── core/                        # 纯逻辑层，无 IO 副作用
│   │   ├── parsers/
│   │   │   ├── claude-code.ts
│   │   │   ├── codex.ts
│   │   │   └── openclaw.ts
│   │   ├── aggregator.ts
│   │   ├── pricing.ts               # 内置价格表（Claude / OpenAI 模型单价）
│   │   ├── sync/
│   │   │   ├── github.ts
│   │   │   └── s3.ts
│   │   └── types.ts
│   ├── cli/                         # Commander.js 入口
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── serve.ts
│   │   │   ├── summary.ts
│   │   │   └── sync.ts
│   │   └── index.ts
│   └── web/                         # SvelteKit + Chart.js
│       ├── src/
│       │   ├── routes/
│       │   └── lib/
│       └── build/                   # 构建产物，发布时打包进 CLI 包
└── package.json
```

### 数据流

```
本地日志文件
    → 解析器（每工具独立，逐行流式读取 JSONL）
    → 水位线过滤（跳过已解析记录，仅处理新增内容）
    → 聚合器（归一化为 StatsRecord，计算成本）
    → 本地 SQLite（~/.aiusage/cache.db）
    → 云端同步（GitHub 私有仓库 或 S3/R2，仅同步 StatsRecord，不含对话内容）
    → CLI 终端摘要 / Web Dashboard HTTP API
```

### 统一数据模型

```typescript
interface StatsRecord {
  ts: number                          // Unix 时间戳（毫秒）
  tool: 'claude-code' | 'codex' | 'openclaw'
  model: string                       // 如 "claude-sonnet-4-6"
  provider: string                    // 如 "anthropic"、"qianfan"
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number              // reasoning/thinking token（Codex reasoning_output_tokens，Claude thinking）
  cost: number                        // USD，由价格表计算；OpenClaw 直接使用日志中的 cost 字段
  toolCalls: { name: string; ts: number }[]  // 包含调用时间戳，支持时序分析
  sessionId: string
  device: string                      // 主机名
}
```

### 增量解析：水位线机制

每次解析完成后，将已处理进度写入 `~/.aiusage/watermark.json`：

```json
{
  "claude-code": {
    "~/.claude/projects/xxx/session.jsonl": { "line": 142, "mtime": 1776738085346 }
  },
  "codex": {
    "~/.codex/sessions/2026/05/12/rollout-xxx.jsonl": { "line": 88, "mtime": 1776738085000 }
  },
  "openclaw": {
    "~/.openclaw/agents/main/sessions/xxx.jsonl": { "line": 57, "mtime": 1776738085000 }
  }
}
```

下次启动时，对未变更文件（`mtime` 未变）直接跳过；对变更文件从上次行数继续读取。新增文件从第 0 行开始。

### 本地存储：SQLite

本地缓存使用 SQLite（`~/.aiusage/cache.db`），主表结构：

```sql
CREATE TABLE records (
  id          TEXT PRIMARY KEY,        -- sessionId + ts 的哈希
  ts          INTEGER NOT NULL,
  tool        TEXT NOT NULL,
  model       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  thinking_tokens   INTEGER DEFAULT 0,
  cost        REAL DEFAULT 0,
  tool_calls  TEXT DEFAULT '[]',       -- JSON 序列化
  session_id  TEXT NOT NULL,
  device      TEXT NOT NULL
);
CREATE INDEX idx_ts   ON records(ts DESC);
CREATE INDEX idx_tool ON records(tool);
```

查询按时间范围、工具、模型过滤均走索引，Dashboard 响应无需全表扫描。

### 成本计算：内置价格表

`packages/core/pricing.ts` 维护各模型单价（USD/1M tokens），工具日志无 cost 字段时由此计算：

```typescript
const PRICE_TABLE: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  'claude-opus-4-6':    { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 3.75 },
  'claude-sonnet-4-6':  { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 0.375 },
  'claude-haiku-4-5':   { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 0.1 },
  'gpt-4.1':            { input: 2,    output: 8 },
  'gpt-4o':             { input: 2.5,  output: 10 },
  'o4-mini':            { input: 1.1,  output: 4.4 },
  // ...可扩展
}
```

- 价格表随工具版本更新维护，不支持用户自定义（v1）
- OpenClaw 日志已含 cost 字段，直接使用，不重复计算
- 未知模型的 cost 记为 0，Dashboard 中标注"价格未知"

### Web Dashboard HTTP API

CLI 启动本地服务（默认端口 3847，可通过 `--port` 覆盖），提供以下 REST 端点供前端调用：

| 端点 | 说明 |
|------|------|
| `GET /api/summary?range=day\|week\|month` | 总览摘要数据 |
| `GET /api/tokens?range=...&tool=...` | Token 趋势（按天聚合） |
| `GET /api/cost?range=...` | 成本趋势 + 工具/模型分布 |
| `GET /api/models?range=...` | 模型调用分布 |
| `GET /api/tool-calls?range=...` | 工具调用频率排行 |
| `GET /api/sessions?range=...&tool=...&page=1` | 会话列表（分页） |

所有端点仅监听 `127.0.0.1`，不对外网暴露。

## CLI 命令

```bash
aiusage init              # 首次配置向导：选择云存储类型，输入凭证
aiusage                   # 启动 Web Dashboard（默认 http://localhost:3847）
aiusage --port 4000       # 指定端口（3847 被占用时使用）
aiusage summary           # 终端快速摘要（默认今日）
aiusage summary --week    # 本周摘要
aiusage summary --month   # 本月摘要
aiusage sync              # 手动触发云端同步
aiusage clean --before 90d  # 清理 90 天前的本地数据
```

### `aiusage summary` 输出格式

```
aiusage — 今日摘要 (2026-05-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
工具          Token 消耗      成本
Claude Code   12,450 (↑23%)  $0.18
Codex          8,320          $0.09
OpenClaw       3,100          $0.01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
合计          23,870          $0.28

最常用工具调用：Read(42)  Bash(31)  Edit(18)
最常用模型：claude-sonnet-4-6 (68%)
```

## Web Dashboard 页面

| 页面 | 内容 |
|------|------|
| 概览 | 总 token 消耗、总成本、活跃天数、最常用工具；支持日期范围筛选 |
| Token | 按天/周/月的输入+输出+thinking token 趋势折线图 |
| 成本 | 成本趋势 + 按工具/模型成本占比（饼图 + 柱状图）；未知价格模型标注提示 |
| 模型 | 模型调用分布：调用次数和 token 占比 |
| 工具调用 | 工具调用频率排行（Top N） |
| 会话 | 会话列表，可按工具和日期筛选，分页加载 |

所有页面均支持日期范围选择（今日 / 本周 / 本月 / 自定义区间）。

## 云端同步

通过 `aiusage init` 配置，支持两种后端：

| 后端 | 适合人群 | 配置方式 |
|------|----------|---------|
| GitHub 私有仓库 | 开发者（几乎都有账号） | Personal Access Token |
| S3 / Cloudflare R2 | 有云账号的用户 | Access Key + Bucket 名称 |

**隐私声明：同步到云端的数据仅为聚合后的 `StatsRecord`（token 数、成本、模型名、工具调用名称），不包含任何对话内容、代码、提示词或文件内容。**

**同步策略：**
- 增量同步：只上传上次同步后的新增记录
- 本地 SQLite 为数据源，云端为备份/合并层
- 以 `id`（sessionId + ts 哈希）去重
- 冲突解决：同一记录以最后写入为准
- 触发时机：`aiusage sync`（手动）或 `aiusage`（启动时自动同步一次）

## 数据保留策略

- 默认保留本地数据 **180 天**，可在 `config.json` 中配置 `retentionDays`
- `aiusage clean --before 90d` 手动清理指定时间前的数据
- 云端数据不自动清理，由用户自行管理存储仓库

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| JSONL 行解析失败 | 跳过该行，写入 `~/.aiusage/errors.log`（含文件路径和行号） |
| 工具未安装（路径不存在） | 静默跳过，summary 输出中注明"未检测到 X" |
| 云同步失败（离线/凭证失效） | 明确提示错误原因，本地数据不受影响 |
| 日志格式变更（工具升级） | 报错信息包含文件路径和行号，提示用户更新 aiusage |
| Web 端口被占用 | 提示使用 `--port` 指定其他端口 |
| 未知模型定价 | cost 记为 0，Dashboard 标注"价格未知" |

## 跨平台路径处理

```typescript
const TOOL_PATHS = {
  'claude-code': path.join(os.homedir(), '.claude', 'projects'),
  'codex':       path.join(os.homedir(), '.codex', 'sessions'),
  'openclaw':    path.join(os.homedir(), '.openclaw', 'agents'),
}
```

所有路径使用 `path.join` 和 `os.homedir()`，不硬编码 Unix 路径。

## 测试策略

- **单元测试**：每个解析器用真实 JSONL fixture 文件做快照测试（已有三个工具的真实日志样本）
- **集成测试**：聚合器使用多工具混合 fixture 数据，验证归一化正确性；水位线机制验证增量解析正确性
- **E2E 测试**：用 fixture 日志目录跑完整 `aiusage summary`，验证输出格式
- **覆盖率目标**：`core` 包 ≥ 80%，`cli` 命令层 ≥ 60%

## 本地配置文件

存储路径：`~/.aiusage/config.json`

```json
{
  "sync": {
    "backend": "github",
    "repo": "username/aiusage-data",
    "token": "<PAT>"
  },
  "device": "macbook-pro",
  "retentionDays": 180
}
```

凭证仅存本地，不会提交到统计数据仓库。

## 发布方式

- 单个 npm 包：`aiusage`
- Web 构建产物（`packages/web/build/`）在发布时打包进 CLI 包
- `bin` 入口指向 `packages/cli/dist/index.js`
- 最低 Node.js 版本：18（LTS）
