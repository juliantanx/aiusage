# AI CLI Stats — 设计文档

**日期：** 2026-05-12
**状态：** 已确认

## 概述

一个 CLI 工具，被动读取 AI 编程助手（Claude Code、Codex、OpenClaw）的本地会话日志，聚合 token 消耗、工具调用频率和模型分布，通过终端摘要和本地 Web Dashboard 展示数据。多设备数据通过用户自带的云存储进行同步。

## 目标

- 统计每个工具和模型的 token 消耗（输入、输出、缓存）
- 展示按工具、模型、提供商、时间段的成本明细
- 展示工具调用频率和分布
- 支持多设备数据汇总（通过云同步）
- 一条命令安装：`npm i -g ai-cli-stats`
- 支持 Windows、macOS、Linux

## 非目标

- 实时拦截 API 调用（不做代理）
- 托管后端服务
- v1 阶段不支持没有本地日志文件的工具

## 支持的工具（v1）

| 工具 | 日志路径 | 格式说明 |
|------|----------|--------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | JSONL，`message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | JSONL，`event_msg` 中 `payload.type=token_count`；解析器使用 `last_token_usage`（单次调用增量）累加，避免 `total_token_usage` 重复计数 |
| OpenClaw | `~/.openclaw/agents/*/sessions/*.jsonl` | JSONL，`message.usage.{input, output, cacheRead, cacheWrite, totalTokens, cost}` |

## 架构

### Monorepo 目录结构

```
ai-cli-stats/                        # pnpm workspaces
├── packages/
│   ├── core/                        # 纯逻辑层，无 IO 副作用
│   │   ├── parsers/
│   │   │   ├── claude-code.ts
│   │   │   ├── codex.ts
│   │   │   └── openclaw.ts
│   │   ├── aggregator.ts
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
    → 聚合器（归一化为 StatsRecord）
    → 本地缓存（~/.ai-cli-stats/cache.jsonl）
    → 云端同步（GitHub 私有仓库 或 S3/R2）
    → CLI 终端摘要 / Web Dashboard API
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
  cost: number                        // USD，无法获取时为 0
  toolCalls: { name: string }[]
  sessionId: string
  device: string                      // 主机名
}
```

## CLI 命令

```bash
ai-stats init           # 首次配置向导：选择云存储类型，输入凭证
ai-stats                # 启动 Web Dashboard（默认 http://localhost:3847）
ai-stats summary        # 终端快速摘要（默认今日）
ai-stats summary --week # 本周摘要
ai-stats summary --month
ai-stats sync           # 手动触发云端同步
```

## Web Dashboard 页面

| 页面 | 内容 |
|------|------|
| 概览 | 总 token 消耗、总成本、活跃天数、最常用工具 |
| Token | 按天/周/月的输入+输出 token 趋势折线图 |
| 成本 | 成本趋势 + 按工具/模型成本占比（饼图 + 柱状图） |
| 模型 | 模型调用分布：调用次数和 token 占比 |
| 工具调用 | 工具调用频率排行（Top N） |
| 会话 | 会话列表，可按工具和日期筛选 |

## 云端同步

通过 `ai-stats init` 配置，支持两种后端：

| 后端 | 适合人群 | 配置方式 |
|------|----------|---------|
| GitHub 私有仓库 | 开发者（几乎都有账号） | Personal Access Token |
| S3 / Cloudflare R2 | 有云账号的用户 | Access Key + Bucket 名称 |

**同步策略：**
- 增量同步：只上传上次同步后的新增记录
- 本地缓存为数据源，云端为备份/合并层
- 以 `sessionId + ts` 去重
- 冲突解决：同一记录以最后写入为准
- 触发时机：`ai-stats sync`（手动）或 `ai-stats`（启动时自动同步一次）

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| JSONL 行解析失败 | 跳过该行，写入 `~/.ai-cli-stats/errors.log` |
| 工具未安装（路径不存在） | 静默跳过，summary 输出中注明"未检测到 X" |
| 云同步失败（离线/凭证失效） | 明确提示错误原因，本地数据不受影响 |
| 日志格式变更（工具升级） | 报错信息包含文件路径和行号，方便用户反馈 issue |

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
- **集成测试**：聚合器使用多工具混合 fixture 数据，验证归一化正确性
- **E2E 测试**：用 fixture 日志目录跑完整 `ai-stats summary`，验证输出格式
- **覆盖率目标**：`core` 包 ≥ 80%，`cli` 命令层 ≥ 60%

## 本地配置文件

存储路径：`~/.ai-cli-stats/config.json`

```json
{
  "sync": {
    "backend": "github",
    "repo": "username/ai-stats-data",
    "token": "<PAT>"
  },
  "device": "macbook-pro"
}
```

凭证仅存本地，不会提交到统计数据仓库。

## 发布方式

- 单个 npm 包：`ai-cli-stats`
- Web 构建产物（`packages/web/build/`）在发布时打包进 CLI 包
- `bin` 入口指向 `packages/cli/dist/index.js`
- 最低 Node.js 版本：18（LTS）
