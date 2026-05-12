# aiusage — 设计文档

**日期：** 2026-05-12
**状态：** 已修订

## 概述

一个 CLI 工具，被动读取 AI 编程助手（Claude Code、Codex、OpenClaw）的本地会话日志，聚合 token 消耗、工具调用频率和模型分布，通过终端摘要和本地 Web Dashboard 展示数据。多设备数据通过用户自带的云存储做双向同步与本地合并。

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

## 术语约定

为避免歧义，本文档对"工具"一词作如下区分：

| 术语 | 含义 | 示例 |
|------|------|------|
| **AI 助手** | 被统计的 AI 编程工具 | Claude Code、Codex、OpenClaw |
| **工具调用** | AI 助手在会话中调用的内部工具 | Read、Bash、Edit、Write |

下文中 `tool` 字段指 AI 助手标识，`tool_calls` 表指工具调用记录。

## 支持的 AI 助手（v1）

### Claude Code

- **日志路径：** `~/.claude/projects/**/*.jsonl`
- **格式：** JSONL，每行一个 JSON 对象
- **sessionId 提取：** 文件名去掉扩展名即为 sessionId（如 `abc123.jsonl` → `abc123`）
- **model 提取：** `message.model` 字段（如 `"claude-sonnet-4-6"`）；缺失时记为 `unknown`
- **token 提取：**
  - `message.usage.input_tokens` → inputTokens
  - `message.usage.output_tokens` → outputTokens
  - `message.usage.cache_creation_input_tokens` → cacheWriteTokens
  - `message.usage.cache_read_input_tokens` → cacheReadTokens
  - thinking tokens：从 `message.usage.thinking_tokens` 读取（如存在）；字段不存在时 thinkingTokens 记为 0
- **工具调用提取：** 从 `message.content` 数组中按下标顺序筛选 `type === "tool_use"` 的块，`callIndex` 为该块在筛选结果中的数组下标（从 0 开始），`name` 为工具名，`ts` 优先使用 `message.timestamp`，缺失时使用所在 JSONL 行的 `timestamp` 字段；`message.content` 缺失时跳过工具调用提取，token 记录正常保留
- **识别有效行：** 仅处理包含 `message.usage` 字段的行，其他行（如系统消息、用户输入）跳过
- **costSource 赋值：** 固定为 `'pricing'`（Claude Code 日志不提供 cost 字段，均由价格表计算）；未知模型为 `'unknown'`
- **记录 id：** `sha256(sourceFile + lineOffset)` 前 16 位 hex，其中 `sourceFile` 为绝对路径，`lineOffset` 为该行在文件中的字节起始偏移

### Codex

- **日志路径：** `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- **格式：** JSONL，`event_msg` 结构
- **sessionId 提取：** 文件名去掉扩展名（如 `rollout-abc123.jsonl` → `rollout-abc123`）
- **model 提取：** 优先 `event_msg.payload.model`；缺失时 fallback 到会话首行的 `session.model`；仍缺失则记为 `unknown`
- **token 提取：** 仅处理 `event_msg.payload.type === "token_count"` 的行，使用 `event_msg.payload.last_token_usage`（单次增量）而非 `total_token_usage`（累计值，会重复计数）；`last_token_usage` 缺失时跳过该行并写入 `warnings.log`：
  - `event_msg.payload.last_token_usage.input_tokens` → inputTokens
  - `event_msg.payload.last_token_usage.cached_input_tokens` → cacheReadTokens
  - `event_msg.payload.last_token_usage.output_tokens` → outputTokens
  - `event_msg.payload.last_token_usage.reasoning_output_tokens` → thinkingTokens
  - cacheWriteTokens → 0（Codex 日志不提供此字段）
- **工具调用提取：** Codex 的工具调用与 token 计数是独立的 JSONL 行，需两步关联：
  1. **收集暂存：** 解析时按顺序遍历，遇到 `event_msg.payload.type === "function_call"` 的行，暂存到该会话的待关联队列（`name` = `event_msg.payload.function.name`，`ts` = `event_msg.timestamp`）
  2. **关联写入：** 遇到 `token_count` 行生成 StatsRecord 后，将队列中所有待关联的工具调用与该 StatsRecord 关联（recordId = 该记录的 id），按队列顺序赋 `callIndex`（从 0 开始），然后清空队列
  3. **孤儿兜底：** 若会话结束时（文件末尾）队列仍有未关联的工具调用（无后续 token_count），则为这些孤儿工具调用生成一条 `record_id = NULL` 的 `ToolCallRecord`，写入 `warnings.log`，确保工具调用频率统计不丢失
- **识别有效行：** 仅处理 `event_msg.payload.type` 为 `token_count` 或 `function_call` 的行
- **costSource 赋值：** 固定为 `'pricing'`（Codex 日志不提供 cost 字段，均由价格表计算）；未知模型为 `'unknown'`
- **记录 id：** `sha256(sourceFile + lineOffset)` 前 16 位 hex

### OpenClaw

- **日志路径：** `~/.openclaw/agents/*/sessions/*.jsonl`
- **格式：** JSONL，统计所有 agent（`*` 通配），包括 main 和用户自定义 agent
- **sessionId 提取：** 文件名去掉扩展名
- **model 提取：** `message.model` 字段；缺失时记为 `unknown`
- **token 提取：**
  - `message.usage.input` → inputTokens
  - `message.usage.output` → outputTokens
  - `message.usage.cacheRead` → cacheReadTokens
  - `message.usage.cacheWrite` → cacheWriteTokens
  - thinkingTokens → 0（OpenClaw 日志不单独提供 thinking token 计数）
  - cost：`message.usage.cost` 字段**存在**时直接使用（含值为 0 的合法情况）；字段**不存在**时 fallback 到价格表计算
- **provider 提取：** 优先使用 `message.provider` 字段（如存在），否则由模型名推断
- **工具调用提取：** 从 `message.content` 数组中按下标顺序筛选 `type === "tool_use"` 的块，`callIndex` 为该块在筛选结果中的数组下标，`name` 为工具名，`ts` 为 `message.timestamp`；`message.content` 缺失时跳过工具调用提取
- **识别有效行：** 仅处理包含 `message.usage` 字段的行
- **costSource 赋值：** `message.usage.cost` 字段**存在**时为 `'log'`（含值为 0 的合法情况）；字段**不存在**时，若模型在价格表中为 `'pricing'`，否则为 `'unknown'`
- **记录 id：** `sha256(sourceFile + lineOffset)` 前 16 位 hex

## 架构

### Monorepo 目录结构

```
aiusage/                             # pnpm workspaces
├── packages/
│   ├── core/                        # 纯逻辑层：解析、聚合、定价计算（无 IO 副作用）
│   │   ├── parsers/
│   │   │   ├── claude-code.ts
│   │   │   ├── codex.ts
│   │   │   └── openclaw.ts
│   │   ├── aggregator.ts
│   │   ├── pricing.ts               # 内置价格表（Claude / OpenAI 模型单价）
│   │   ├── provider.ts              # 模型名 → provider 映射
│   │   └── types.ts
│   ├── cli/                         # Commander.js 入口 + IO 层
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── serve.ts
│   │   │   ├── summary.ts
│   │   │   ├── sync.ts
│   │   │   ├── status.ts
│   │   │   ├── export.ts
│   │   │   ├── clean.ts
│   │   │   └── recalc.ts
│   │   ├── db/
│   │   │   ├── schema.ts            # SQLite 建表 + PRAGMA
│   │   │   └── migrations/          # v1.ts, v2.ts, ...
│   │   ├── sync/                    # 云同步（IO 操作）
│   │   │   ├── github.ts
│   │   │   └── s3.ts
│   │   ├── watermark.ts             # 水位线管理
│   │   ├── lock.ts                  # PID 文件锁
│   │   └── index.ts
│   └── web/                         # SvelteKit + adapter-static（纯 SPA）
│       ├── src/
│       │   ├── routes/
│       │   └── lib/
│       └── build/                   # 构建产物，发布时打包进 CLI 包
└── package.json
```

### 数据流

```
本地日志文件
    → 解析器（每 AI 助手独立，逐行流式读取 JSONL）
    → 水位线过滤（跳过已解析记录，仅处理新增内容）
    → 聚合器（归一化为 StatsRecord + ToolCallRecord，计算成本）
    → 本地 SQLite（~/.aiusage/cache.db，WAL 模式）
    → 云端同步（GitHub 私有仓库 或 S3/R2，仅同步脱敏后的 SyncRecord，工具调用仅本地保留）
    → CLI 终端摘要 / Web Dashboard HTTP API
```

### 目录初始化

**`~/.aiusage/` 目录及运行时文件**（`cache.db`、`watermark.json`、`errors.log`、`warnings.log`、`audit.log`、`state.json`）由任意命令首次运行时自动创建。**`config.json`** 仅由 `aiusage init` 向导创建，不自动生成。创建时应设置最小文件权限：Unix/macOS 下 `config.json`、`state.json`、`audit.log`、`errors.log`、`warnings.log`、`watermark.json`、`cache.db`、`cache.db-wal`、`cache.db-shm` 均以 `0600` 创建，`~/.aiusage/` 目录以 `0700` 创建；Windows 下使用当前用户专属 ACL，拒绝其他本地用户读取。

**`deviceInstanceId` 生成与语义：** 首次创建 `~/.aiusage/` 目录时，生成 UUIDv4 作为 `deviceInstanceId`，写入 `state.json`。该 ID 在当前安装实例生命周期内保持不变，不可由用户编辑。若用户删除 `~/.aiusage/` 后重新安装，将生成新的 `deviceInstanceId`，语义上视为"新设备实例"——远端旧数据保留（tombstone 与旧 `deviceInstanceId` 关联），新实例从空状态开始。

```
~/.aiusage/
├── cache.db          # SQLite 数据库（首次运行时建表）
├── config.json       # 配置文件（仅 aiusage init 创建，可手动编辑；仅存非敏感配置与凭证引用）
├── watermark.json    # 水位线（解析时自动维护）
├── state.json        # 运行时状态（同步时间、审批确认等，不由用户编辑）
├── errors.log        # 解析错误日志（最大 10MB，超出时轮转）
├── warnings.log      # 非致命警告日志（最大 10MB，超出时轮转）
├── audit.log         # 同步/远端清理审计日志（最大 10MB，超出时轮转）
└── parse.lock        # 解析互斥锁（仅解析期间存在，完成后自动删除）
```

**`state.json` 结构：**

```json
{
  "deviceInstanceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "lastSyncAt": 1776738085346,
  "lastSyncStatus": "ok",
  "syncConsentAt": 1776738085000,
  "syncConsentTarget": "sha256(github|username/aiusage-data|api.github.com|global|ts,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,thinkingTokens,cost,costSource,tool,model,provider,sessionKey,device,deviceInstanceId,updatedAt|read,write|schema:v1)[0:16]",
  "lastSyncTarget": "github:username/aiusage-data",
  "lastSyncUploaded": 124,
  "lastSyncPulled": 842,
  "lastRemoteCleanAt": 1776738086000,
  "lastRemoteCleanSummary": "device=macbook-pro before=90d deleted=218"
}
```

`lastSyncStatus` 取值：`"ok"` / `"failed"` / `"conflict_resolved"` / `"blocked_pending_consent"`。

`syncConsentAt` 表示用户最近一次明确确认“允许访问指定远端目标并上传脱敏统计数据”的时间。未确认时该字段缺失，`sync` 与 `serve` 的自动同步均不得访问远端（既不拉取，也不上传）。

`syncConsentTarget` 为审批绑定指纹，计算输入至少包含 `backend + 规范化目标地址 + endpoint + region + 上传字段清单 + 允许的远端操作集合(read/write/delete) + schema 版本`。其中：
- `schema 版本` 为硬编码字符串 `v1`，随 SyncRecord 数据模型变更而递增（如增加字段、改变字段语义时升为 `v2`），不随价格表或解析器修复变化
- GitHub 的“规范化目标地址”至少包含 `owner/repo`
- S3/R2 的“规范化目标地址”至少包含 `bucket + prefix`
- `endpoint` 对 GitHub 固定为官方 API 基址；对 S3/R2 必须纳入指纹，避免同 `bucket/prefix` 指向不同账号或服务端点时误复用旧审批
- `region` 对实际路由有影响时必须纳入指纹

只有当当前配置生成的指纹与 `syncConsentTarget` 完全一致时，才允许执行已审批的远端操作；用户更换仓库、bucket、prefix、endpoint、region、backend、上传字段清单、远端操作集合或 schema 版本后，必须重新确认。

`lastSyncTarget` 记录最近一次成功写入的远端目标（如 `github:username/aiusage-data`、`s3:my-bucket/aiusage`），用于审计与状态展示。

**日志轮转：** `errors.log`、`warnings.log` 和 `audit.log` 各自达到 10MB 时，将当前文件重命名为 `*.log.1`（保留最多 3 个备份：`.log.1`、`.log.2`、`.log.3`），新建空文件继续写入；轮转后新文件需保持原有最小权限。

### 解析触发时机

解析集成在其他命令的启动阶段，不作为独立命令暴露：

| 命令 | 解析行为 | 同步行为 |
|------|----------|----------|
| `aiusage` / `aiusage summary` | 启动时同步解析一次（阻塞） | 不触发（设计有意如此，summary 强调即时性） |
| `aiusage serve` | 启动时同步解析一次；之后每 **60 秒**（可通过 `config.json` 中 `parseInterval` 配置，最小 10 秒）后台增量解析（若上次未完成则跳过） | 启动时先同步执行一次本地过期清理；清理完成后再启动 HTTP 服务，并在服务就绪后后台异步同步一次 |
| `aiusage sync` | 先触发一次解析；随后执行一次基于 `retentionDays` 的本地过期清理 | 触发同步 |
| `aiusage export` | 先触发一次解析 | 不触发 |
| `aiusage status` | 不触发解析，直接读取数据库和 state.json | 不触发 |
| `aiusage clean` | 不触发解析，直接操作数据库和水位线 | 不触发 |
| `aiusage recalc` | 不触发解析，直接操作数据库中已有记录 | 批量上传刷新后的记录（每批 500 条） |

> `aiusage summary` 不触发同步是有意设计：summary 是最高频命令，每次都同步会引入网络延迟。需要多设备数据时，先运行 `aiusage sync` 再查看摘要。

**解析互斥锁（PID 锁）：** 解析开始时在 `~/.aiusage/parse.lock` 写入当前进程 PID。获取锁前检查文件是否存在：若 PID 对应进程仍在运行则等待最多 5 秒；若进程已不存在（崩溃残留），直接清除旧锁并继续。超时仍无法获取锁则跳过解析、使用已有数据并输出提示。解析完成后删除锁文件。进程存在性检测使用 Node.js 内置的 `process.kill(pid, 0)`（跨平台，仅检测信号权限，不实际发送信号；Windows 上 Node.js 内部使用 `OpenProcess` 实现），避免依赖 `tasklist`/`kill` 等外部命令及其 locale 相关的输出解析问题。

### `aiusage init` 向导流程

```
? 选择云同步后端  ›  GitHub 私有仓库 / S3 · Cloudflare R2 / 暂不配置

[选择 GitHub]
? GitHub 仓库（格式：username/repo-name）›  username/aiusage-data
? Personal Access Token ›  ****（推荐 fine-grained token，需 Contents: Read and write 权限）
  正在验证连接… ✓ 连接成功
  正在检查仓库属性… ✓ Private 仓库 / owner 匹配 / 权限满足最小要求
  正在检查仓库内容… ✓ 可用（为空时将于首次同步写入初始 `README.md`）

[选择 S3/R2]
? Bucket 名称 ›  my-aiusage-bucket
? Access Key ID ›  ****
? Secret Access Key ›  ****
? Endpoint URL（留空则使用 AWS S3）›  https://<account>.r2.cloudflarestorage.com
? Region ›  auto
? Object Prefix（默认：aiusage/）›  aiusage/
  正在验证连接… ✓ 连接成功
  正在检查目标前缀权限… ✓ 可读写且不在 bucket 根目录

[公共步骤]
? 设备别名（默认：macbook-pro）›  macbook-pro
! 将访问远端目标：读取已有脱敏统计数据；上传经审批后的本机脱敏统计数据
! 将上传脱敏统计数据：时间、token、cost、costSource、模型名、AI 助手类型、sessionKey、device、deviceInstanceId
! 不上传：对话内容、代码、提示词、文件内容、绝对路径、工具调用详情
! 本次审批绑定目标：<resolved-target>（schema v1）
! 本次审批绑定字段清单：ts,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,thinkingTokens,cost,costSource,tool,model,provider,sessionKey,device,deviceInstanceId,updatedAt
! 本次审批允许的远端操作：read, write
? 确认允许 aiusage 对以上目标执行已声明的远端操作，并上传以上脱敏统计数据？ › Yes
✓ 配置已写入 ~/.aiusage/config.json
```

- 验证失败时给出具体错误原因（权限不足 / 仓库不存在 / 非 Private 仓库 / 目标前缀非法 / 网络超时）并允许重试
- 选择"暂不配置"时写入不含 `sync` 字段的 config.json，后续可重新运行 `aiusage init` 修改
- **重新运行时：** 读取现有 config.json。`repo`、`bucket`、`prefix`、`endpoint`、`region`、`device` 等**非敏感字段**作为默认答案预填；敏感凭证不回显明文，界面仅显示“已配置，回车保留，输入新值则覆盖”
- **凭证存储：** 默认写入系统凭证库（macOS Keychain / Windows Credential Manager / Linux Secret Service），`config.json` 仅保存引用键。只有显式启用 `allowPlaintextCredentialFallback` 时，才允许将凭证明文写入本地配置；该模式在 `status` 中标记为“不安全模式”
- **首次同步审批：** 用户只有在向导中显式确认“目标 + 远端操作集合 + 上传字段清单”后，才写入 `state.json.syncConsentAt` 和 `syncConsentTarget`；v1 默认仅审批 `read + write`。若跳过确认，则保留配置但禁止后续任何远端访问
- **目标变更失效：** 若重新运行 `init` 后 `repo`、`bucket`、`prefix`、`endpoint`、`region`、`backend`、上传字段清单、远端操作集合或 schema 版本发生变化，必须清除旧的 `syncConsentAt/syncConsentTarget`，要求用户重新确认

### 统一数据模型

#### 记录粒度

一条 `StatsRecord` 对应日志中的 **一次 API 调用**（即一次模型请求-响应）。解析器处理每行 JSONL 时，遇到包含 `usage` 字段的有效行即生成一条记录。一个会话（session）包含多条记录。

#### 记录 ID 设计

**StatsRecord.id**（本地记录）使用 **绝对路径 + 行字节起始偏移** 作为哈希输入，在本机范围内全局唯一且与解析运行次数无关：

```
StatsRecord.id = sha256(sourceFile + lineOffset)[0:16]  // 前 16 位 hex
```

- `sourceFile` 为绝对路径——解决不同目录下同名文件产生相同 sessionId 的碰撞问题
- `lineOffset` 为该行在文件中的字节起始偏移——同一文件内全局唯一
- 同一行无论被解析多少次，id 始终相同（幂等性）

**SyncRecord.id**（云端同步记录）在 StatsRecord.id 的基础上编入 `deviceInstanceId`，保证跨设备唯一性：

```
SyncRecord.id = sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]  // 前 16 位 hex
```

- 不同设备上相同 `sourceFile + lineOffset` 的记录产生不同 `SyncRecord.id`，避免 `synced_records` 表 upsert 时静默覆盖
- 同一设备内 `SyncRecord.id` 与 `StatsRecord.id` 不同，上传映射时需重新计算
- `SyncRecord.id` 不包含 token、cost、model 等可能变化的业务值，保证稳定身份语义

```typescript
interface StatsRecord {
  id: string                           // sha256(sourceFile + lineOffset) 前 16 位 hex；仅在本机范围内唯一
  ts: number                           // Unix 时间戳（毫秒）
  ingestedAt: number                   // 首次写入本地数据库时间（毫秒）；审计用途，不作为同步游标
  syncedAt?: number                    // 最近一次成功上传到云端的时间（毫秒）；未同步时为空
  updatedAt: number                    // 最近一次解析/重算该记录业务字段的时间（毫秒）；远端增量上传游标
  lineOffset: number                   // 来源行在文件中的字节起始偏移（参与 id 计算）
  tool: 'claude-code' | 'codex' | 'openclaw'
  model: string                        // 如 "claude-sonnet-4-6"，未知时为 "unknown"
  provider: string                     // 如 "anthropic"、"openai"（由模型名映射规则推断）
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number               // reasoning/thinking token；不可用时为 0
  cost: number                         // USD，由价格表计算；OpenClaw 字段存在时直接使用
  costSource: 'log' | 'pricing' | 'unknown'  // cost 来源：log=日志原值，pricing=价格表计算，unknown=未知模型记为 0
  sessionId: string
  sourceFile: string                   // 来源日志文件的绝对路径
  device: string                       // 设备别名（默认主机名，可在 config.json 中自定义）
  deviceInstanceId: string             // 当前安装实例生成的稳定设备实例 ID；不可由用户编辑
}

interface ToolCallRecord {
  id: string                           // 关联 record 存在时：sha256(recordId + name + ts + callIndex) 前 16 位 hex；孤儿记录：sha256(tool + ":" + name + ":" + ts + ":" + callIndex) 前 16 位 hex
  recordId: string | null              // 关联的 StatsRecord.id；null 表示孤儿工具调用（仅 Codex 会产生）
  name: string                         // 工具名称，如 "Read"、"Bash"、"Edit"
  ts: number                           // 调用时间戳（毫秒）
  callIndex: number                    // 同一 record 内的工具调用序号（message.content 数组下标，从 0 开始）
}

interface SyncRecord {
  id: string                           // sha256(deviceInstanceId + sourceFile + lineOffset) 前 16 位 hex；跨设备唯一
  ts: number
  tool: 'claude-code' | 'codex' | 'openclaw'
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
  cost: number
  costSource: 'log' | 'pricing' | 'unknown'  // 与 StatsRecord.costSource 一致
  sessionKey: string                   // sha256(device + sessionId)[0:24]，用于同设备内会话聚合，避免上传原始 sessionId；24 位 hex（96 bit）在多设备汇总规模下碰撞概率可忽略
  device: string                       // 展示用途的设备别名，不作为”当前设备副本”判定依据
  deviceInstanceId: string             // 稳定设备实例 ID，用于识别当前设备副本和设备作用域
  updatedAt: number                    // 最近一次生成该 SyncRecord 的时间（毫秒）；远端合并时按 id + updatedAt 取最新
}

interface SyncTombstone {
  id: string                           // 被删除的 SyncRecord.id
  deviceScope: string                  // 默认 currentDeviceInstanceId；跨设备删除时为 "*"
  deletedAt: number
  reason: 'retention' | 'manual_clean'
}
```

> **注意：**
> 1. `StatsRecord` 是本地解析产物，包含 `sourceFile` 和 `lineOffset`，用于增量解析、幂等写入和本地问题排查；它**不会**原样上传到云端。
> 2. 云端同步使用脱敏后的 `SyncRecord`，不包含 `sourceFile`、`lineOffset` 或工具调用详情，避免泄露用户名、目录结构和项目路径；`sessionId` 在上传前映射为 `sessionKey`，不直接上云。
> 3. `SyncRecord.id` 的设计原理和跨设备唯一性保证详见"记录 ID 设计"章节。
> 4. `SyncTombstone.deviceScope` 的语义必须严格区分：`”*”` 表示对所有设备生效；具体设备实例 ID 仅对同 `SyncRecord.deviceInstanceId` 生效。实现中禁止将”同 `id` 即命中 tombstone”简化为全局删除。
> 5. Claude Code 和 OpenClaw 的 `ToolCallRecord.ts` 与所属 `StatsRecord.ts` 相同，因为工具调用嵌在同一条响应消息中；Codex 的 `ToolCallRecord.ts` 使用 `function_call` 行自己的 `event_msg.timestamp`，而不是所属 `StatsRecord.ts`。
> 6. “当前设备副本”判断必须基于 `deviceInstanceId`，不得基于可配置的 `device` 别名；`device` 仅用于显示。
> 7. `costSource` 字段用于区分 `cost=0` 的语义：`'log'` 表示日志原值（含 OpenClaw `message.usage.cost` 存在且为 0 的合法情况）；`'pricing'` 表示由内置价格表计算；`'unknown'` 表示模型不在价格表中，cost 记为 0。Dashboard 和 `status` 以此区分”确实免费”和”价格未知”。

#### Provider 映射规则

`provider` 字段通过模型名前缀自动推断，不依赖日志中的字段：

```typescript
const MODEL_PROVIDER_MAP: [string, string][] = [
  ['claude-',    'anthropic'],
  ['gpt-',      'openai'],
  ['o1-',       'openai'],
  ['o3-',       'openai'],
  ['o4-',       'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-',   'google'],
  // ...可扩展
]

function inferProvider(model: string): string {
  for (const [prefix, provider] of MODEL_PROVIDER_MAP) {
    if (model.startsWith(prefix)) return provider
  }
  return 'unknown'
}
```

OpenClaw 日志若包含 `message.provider` 字段则直接使用，优先级高于推断。

### 增量解析：水位线机制

每次解析完成后，将已处理进度写入 `~/.aiusage/watermark.json`，使用 **字节偏移** 而非行号。路径存储为绝对路径。完整结构如下：

```json
{
  "claude-code": {
    "/Users/alice/.claude/projects/xxx/abc123.jsonl": {
      "offset": 28456,
      "size": 28456,
      "mtime": 1776738085346,
      "fileIdentity": { "dev": 16777221, "ino": 12345678 },
      "headFingerprint": "a1b2c3..."
    }
  },
  "codex": {
    "/Users/alice/.codex/sessions/2026/05/12/rollout-abc123.jsonl": {
      "offset": 15320,
      "size": 15320,
      "mtime": 1776738085000,
      "fileIdentity": { "volumeSerial": "A1B2C3D4", "fileIndex": "12345678" },
      "headFingerprint": "d4e5f6..."
    }
  },
  "openclaw": {
    "/Users/alice/.openclaw/agents/main/sessions/xxx.jsonl": {
      "offset": 9840,
      "size": 9840,
      "mtime": 1776738085000,
      "fileIdentity": { "dev": 16777221, "ino": 87654321 },
      "headFingerprint": "g7h8i9..."
    }
  }
}
```

增量解析逻辑：
- `mtime` 未变 **且** `size` 未变 → 跳过
- `mtime` 变了 **且** `size >= offset` → 先校验文件身份是否仍为同一物理文件；只有文件身份未变时，才从 `offset` 位置继续读取
- `size < offset`（文件被截断） → 从头重新解析，按 `source_file` 删除该文件的旧记录，写入 `warnings.log`
- 若路径相同但文件身份已变化（如日志轮转后原路径被新文件复用、文件被整体替换、原文件被删除后新建） → 视为“新文件替换旧文件”，从头重新解析，按 `source_file` 删除该文件的旧记录，写入 `warnings.log`
- 新文件 → 从 offset=0 开始

**文件身份识别：** watermark 除 `offset/size/mtime` 外，还必须保存平台可用的稳定文件身份信息（`fileIdentity`）和内容指纹（`headFingerprint`），如上方示例所示。Unix/macOS 优先使用 `fileIdentity`（`dev + ino`），忽略 `headFingerprint`；Windows 优先使用 `fileIdentity`（`volumeSerial + fileIndex`），不可靠时（如 ReFS）回退到 `headFingerprint + size`。若平台无法稳定获取文件身份，则回退保存文件前 512 字节的 sha256 指纹（`headFingerprint`），连同文件大小一起作为身份校验输入；身份校验失败时必须保守地按”文件已替换”处理，禁止直接从旧 `offset` 续读。`headFingerprint`：文件前 512 字节的 sha256 前 16 位 hex；文件不足 512 字节时对全部内容计算。

**水位线清理：** 每次解析时，删除 watermark 中指向已不存在文件的条目，防止长期膨胀。

**clean 命令与水位线联动：** `aiusage clean --before Nd` 仅删除本地数据库中 `ts < N` 的记录，**不重置 watermark**。因为日志文件仍在磁盘上，重置 watermark 会导致下次解析时被删除的记录被原样重建，使 clean 操作完全无效。增量解析的 offset 机制已保证已解析区域不会被重复写入，因此 clean 后不会产生数据缺口。该操作仅影响本地数据库，不直接删除云端数据；传 `--remote` 时另走远端清理流程。

### 数据保留：`retentionDays` 生效时机

`retentionDays`（默认 180）控制本地数据保留天数，通过以下三种方式生效：

1. **自动清理：** `aiusage serve` 启动时，删除所有 `ts < now - retentionDays × 86400000` 的记录。HTTP 服务可先启动，但首次自动同步任务必须等待该清理完成；无过期记录时跳过
2. **同步前清理：** `aiusage sync` 在开始拉取/上传前，先同步删除所有 `ts < now - retentionDays × 86400000` 的本地 `records`、`synced_records` 和孤儿 `tool_calls`
3. **手动清理：** `aiusage clean --before Nd`，`Nd` 为具体天数；不传 `--before` 时默认使用 `retentionDays` 的值

`aiusage summary` 和 `export` 不自动清理，避免影响启动速度。

### 本地存储：SQLite

本地缓存使用 SQLite（`~/.aiusage/cache.db`），启用 WAL 模式以支持读写并发，设置 busy_timeout 应对并发写入。

#### Schema 版本迁移

使用 `schema_version` 表跟踪当前版本，启动时自动执行待运行的迁移脚本：

```sql
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT DEFAULT (datetime('now'))
);
```

迁移脚本按版本号顺序执行，每个版本对应 `packages/cli/db/migrations/v{N}.ts`。

#### 主表结构（v1）

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE records (
  id                TEXT PRIMARY KEY,   -- sha256(sourceFile + lineOffset) 前 16 位 hex；仅本机范围唯一
  ts                INTEGER NOT NULL,
  ingested_at       INTEGER NOT NULL,   -- 首次写入本地数据库时间（审计用途）
  synced_at         INTEGER,            -- 最近一次成功上传到云端时间；NULL 表示未同步
  updated_at        INTEGER NOT NULL,   -- 最近一次解析/重算该记录业务字段的时间（远端增量上传游标）
  line_offset       INTEGER NOT NULL,   -- 来源行的字节起始偏移（参与 id 计算）
  tool              TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider          TEXT NOT NULL,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  thinking_tokens   INTEGER DEFAULT 0,
  cost              REAL DEFAULT 0,
  cost_source       TEXT NOT NULL DEFAULT 'pricing',  -- 'log' | 'pricing' | 'unknown'
  session_id        TEXT NOT NULL,
  source_file       TEXT NOT NULL,      -- 来源日志文件的绝对路径（参与 id 计算）
  device            TEXT NOT NULL,
  device_instance_id TEXT NOT NULL
);

CREATE TABLE synced_records (
  id                TEXT PRIMARY KEY,   -- SyncRecord.id（= sha256(deviceInstanceId + sourceFile + lineOffset) 前 16 位 hex，跨设备唯一）
  ts                INTEGER NOT NULL,
  tool              TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider          TEXT NOT NULL,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  thinking_tokens   INTEGER DEFAULT 0,
  cost              REAL DEFAULT 0,
  cost_source       TEXT NOT NULL DEFAULT 'pricing',  -- 'log' | 'pricing' | 'unknown'
  session_key       TEXT NOT NULL,
  device            TEXT NOT NULL,
  device_instance_id TEXT NOT NULL,     -- 保留独立列用于查询过滤（按设备筛选远端数据），虽与 id 中编入的值冗余，但避免解析 id 的开销
  updated_at        INTEGER NOT NULL    -- 远端合并时按 id + updatedAt 取最新；拉取或本地映射时更新
);

CREATE TABLE sync_tombstones (
  id                TEXT NOT NULL,      -- 被删除的 SyncRecord.id
  device_scope      TEXT NOT NULL,      -- 当前设备名或 "*"
  deleted_at        INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  PRIMARY KEY (id, device_scope)
);

CREATE TABLE tool_calls (
  id          TEXT PRIMARY KEY,         -- 关联 record 存在时：sha256(record_id + name + ts + call_index) 前 16 位 hex；孤儿记录：sha256(tool + ':' + name + ':' + ts + ':' + call_index) 前 16 位 hex
  record_id   TEXT REFERENCES records(id) ON DELETE CASCADE,  -- NULL 表示孤儿工具调用（无关联 token_count，仅 Codex 会产生）
  tool        TEXT,                     -- AI 助手标识（仅孤儿记录需要，用于 id 计算；非孤儿记录可通过 record_id 关联 records.tool 获取）
  name        TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  call_index  INTEGER DEFAULT 0         -- 同一 record 内的工具调用序号（message.content 数组下标）
);

CREATE INDEX idx_records_ts         ON records(ts DESC);
CREATE INDEX idx_records_ingested   ON records(ingested_at DESC);
CREATE INDEX idx_records_updated    ON records(updated_at DESC);
CREATE INDEX idx_records_tool       ON records(tool);
CREATE INDEX idx_records_model      ON records(model);
CREATE INDEX idx_records_session    ON records(session_id);
CREATE INDEX idx_records_source     ON records(source_file);
CREATE INDEX idx_records_cost_source ON records(cost_source);
CREATE INDEX idx_synced_records_ts      ON synced_records(ts DESC);
CREATE INDEX idx_synced_records_tool    ON synced_records(tool);
CREATE INDEX idx_synced_records_model   ON synced_records(model);
CREATE INDEX idx_synced_records_session ON synced_records(session_key);
CREATE INDEX idx_synced_records_device  ON synced_records(device);
CREATE INDEX idx_synced_records_updated ON synced_records(updated_at DESC);
CREATE INDEX idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at DESC);
CREATE INDEX idx_tombstones_device_scope ON sync_tombstones(device_scope);
CREATE INDEX idx_tc_record_id       ON tool_calls(record_id);
CREATE INDEX idx_tc_name            ON tool_calls(name);
CREATE INDEX idx_tc_ts              ON tool_calls(ts DESC);
```

查询约定：
- token、成本、模型分布、活跃天数等可汇总视图，查询 `records UNION ALL synced_records`，但 `synced_records` 中过滤 `device_instance_id != currentDeviceInstanceId`
- 工具调用页和会话页仅查询本地 `records` + `tool_calls`，不读取 `synced_records`
- `status` 的记录总数默认显示本地 `records` 条数；若已同步，可额外显示远端合并记录数

### 成本计算：内置价格表

`packages/core/pricing.ts` 维护各模型单价（USD/1M tokens），工具日志无 cost 字段时由此计算：

```typescript
const PRICE_TABLE: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number; thinking?: number }> = {
  'claude-opus-4-6':    { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 3.75, thinking: 75 },
  'claude-sonnet-4-6':  { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 0.375, thinking: 15 },
  'claude-haiku-4-5':   { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 0.1, thinking: 4 },
  'gpt-4.1':            { input: 2,    output: 8 },
  'gpt-4o':             { input: 2.5,  output: 10 },
  'o4-mini':            { input: 1.1,  output: 4.4 },
  // 价格表随版本更新维护；未收录的模型 cost 记为 0 且 costSource='unknown'，
  // 用户可通过 status 中"未知定价模型"提示提交 issue 补充
}
```

- 价格表随工具版本更新维护，不支持用户自定义（v1）
- **价格表更新是向前兼容的**：新版本的价格表仅影响**新解析**的记录，不自动刷新已有记录的 `cost`、`costSource` 或 `updatedAt`。这避免升级后触发全量重上传（所有 `costSource === 'pricing'` 的记录 `updatedAt` 被刷新 → 满足 `updated_at > synced_at` → 全量上传）。如需回算历史记录的 cost，提供显式命令 `aiusage recalc --pricing`，该命令批量刷新受影响记录的 `cost`/`costSource`/`updatedAt` 并按每批 500 条分批上传
- `thinking` 字段为 thinking/reasoning token 的单价；未配置时按 `output` 价格计算
- OpenClaw：`message.usage.cost` 字段**存在**时直接使用（含值为 0 的合法情况）；字段**不存在**时 fallback 到价格表
- 未知模型的 cost 记为 0，Dashboard 中标注"价格未知"，`status` 列出所有未知定价模型并引导用户提交 issue 补充价格

### Web Dashboard

#### 技术选型

使用 **SvelteKit + adapter-static** 构建为纯 SPA（静态 HTML/JS/CSS），构建产物打包进 CLI 包。`aiusage serve` 启动时，由 Node.js HTTP 服务器同时提供：
- 静态文件服务（`/` → `packages/web/build/`）
- REST API（`/api/*` → SQLite 查询，大结果集流式返回）

#### HTTP API

默认端口 3847，可通过 `--port` 覆盖。所有端点仅监听 `127.0.0.1`，不对外网暴露。

| 端点 | 说明 |
|------|------|
| `GET /api/summary?range=day\|week\|month&from=...&to=...` | 总览摘要数据 |
| `GET /api/tokens?range=...&from=...&to=...&tool=...` | Token 趋势（按天聚合） |
| `GET /api/cost?range=...&from=...&to=...` | 成本趋势 + AI 助手/模型分布 |
| `GET /api/models?range=...&from=...&to=...` | 模型调用分布 |
| `GET /api/tool-calls?range=...&from=...&to=...` | 工具调用频率排行 |
| `GET /api/sessions?range=...&from=...&to=...&tool=...&page=1&pageSize=50` | 会话列表（分页，默认每页 50 条） |

- `range` 和 `from/to` 二选一；两者同时传时 `from/to` 优先
- `from/to` 格式：`YYYY-MM-DD`，闭区间

**错误响应格式：** 所有 API 错误返回统一 JSON 结构：

```json
{ "error": { "code": "INVALID_RANGE", "message": "from must be before to" } }
```

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 400 | `INVALID_RANGE` | 日期范围参数无效（from > to、格式错误等） |
| 400 | `INVALID_PARAM` | 其他参数错误（pageSize 超限、tool 值非法等） |
| 404 | `NO_DATA` | 请求的时间范围内无数据（空结果，非错误，返回空数组/零值） |
| 500 | `INTERNAL` | 服务端内部错误（数据库异常等） |

Dashboard 前端通过 **轮询**（默认 30 秒间隔，可通过 `config.json` 中 `dashboardPollInterval` 配置，最小 5 秒）刷新数据。

**优雅关机：** `aiusage serve` 收到 SIGINT/SIGTERM 后，停止接受新 HTTP 请求，等待当前正在执行的解析或同步操作完成（最多 5 秒），写入 watermark.json 和 state.json 后退出。超时则强制退出，并在下次启动时通过 PID 锁检测和 watermark 校验自动恢复一致性。

## CLI 命令

```bash
aiusage --version             # 显示版本号
aiusage --help                # 显示帮助信息
aiusage <command> --help      # 显示子命令帮助
aiusage                       # 等同于 aiusage summary（终端快速摘要，默认今日）
aiusage summary               # 终端快速摘要（默认今日）
aiusage summary --week        # 本周摘要
aiusage summary --month       # 本月摘要
aiusage summary --from 2026-04-01 --to 2026-05-12  # 自定义日期范围
aiusage serve                 # 启动 Web Dashboard（默认 http://localhost:3847）
aiusage serve --port 4000     # 指定端口（3847 被占用时使用）
aiusage init                  # 首次配置向导：选择云存储类型，输入凭证并确认上传范围
aiusage sync                  # 手动触发云端同步
aiusage status                # 显示当前配置、已检测到的 AI 助手、数据库大小、上次同步时间
aiusage export --format csv|json|ndjson --range month    # 导出数据到 stdout（流式）
aiusage export --format csv --from 2026-04-01 --to 2026-05-12 -o report.csv
aiusage clean                 # 清理超过 retentionDays 天的本地数据（使用配置默认值）
aiusage clean --before 30d    # 清理 30 天前的本地数据（单位：d=天）
aiusage clean --before 90d --remote  # 同时清理云端对应时间段的数据
aiusage recalc --pricing      # 使用最新价格表回算历史记录的 cost（每批 500 条）
```

**`export` 输出格式：**
- `--format csv`：CSV，首行为字段名，适合 Excel / 数据分析工具
- `--format json`：JSON 数组，适合小数据量脚本处理
- `--format ndjson`：每行一个 `SyncRecord` JSON 对象，适合大数据量流式处理（仅对应云端主数据文件，不包含 tombstone）

**`export` 数据模型约定：**
- `csv` 和 `json` 默认导出面向本地分析的 `StatsRecord` 视图，不导出 `sourceFile`、`lineOffset`；字段与列名映射如下：

| 字段 | CSV 列名 | JSON 键 | 说明 |
|------|----------|---------|------|
| ts | timestamp | timestamp | ISO 8601 格式（如 `2026-05-12T14:30:22.000Z`） |
| tool | tool | tool | AI 助手标识 |
| model | model | model | 模型名 |
| provider | provider | provider | 提供商 |
| inputTokens | input_tokens | inputTokens | 输入 token |
| outputTokens | output_tokens | outputTokens | 输出 token |
| cacheReadTokens | cache_read_tokens | cacheReadTokens | 缓存读取 token |
| cacheWriteTokens | cache_write_tokens | cacheWriteTokens | 缓存写入 token |
| thinkingTokens | thinking_tokens | thinkingTokens | 思考 token |
| cost | cost | cost | 成本（USD） |
| costSource | cost_source | costSource | 成本来源 |
| sessionId | session_id | sessionId | 会话 ID |
| device | device | device | 设备别名 |
| deviceInstanceId | device_instance_id | deviceInstanceId | 设备实例 ID |

- `ndjson` 明确导出 `SyncRecord`，字段为：`id`、`ts`、`tool`、`model`、`provider`、`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`thinkingTokens`、`cost`、`costSource`、`sessionKey`、`device`、`deviceInstanceId`、`updatedAt`；用于备份、校验或与云端主数据文件做比对；它**不**包含 `SyncTombstone`，因此不等同于完整云端同步状态
- `tool_calls` 不在 `export` v1 范围内；如需导出，后续单独设计 `--include-tool-calls`

**未运行 `aiusage init` 时的行为：** 所有命令均可在未配置云同步的情况下正常工作（纯本地模式）。`aiusage sync` 提示先运行 `init`；`aiusage serve` 跳过同步步骤，不报错。

**已运行 `aiusage init` 但未完成远端审批时的行为：** `aiusage sync` 与 `aiusage serve` 的自动同步均不得访问远端（既不拉取，也不上传，也不执行远端删除）；命令输出提示用户重新运行 `aiusage init` 完成确认。

### `aiusage summary` 输出格式

**正常情况：**
```
aiusage — 今日摘要 (2026-05-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI 助手       Token 消耗      成本
Claude Code   12,450 (↑23%)  $0.18
Codex          8,320          $0.09
OpenClaw       3,100          $0.01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
合计          23,870          $0.28

最常用工具调用（今日）：Read(42)  Bash(31)  Edit(18)
最常用模型（今日）：claude-sonnet-4-6 (68%)
```

**空数据状态（首次运行或当日无使用记录）：**
```
aiusage — 今日摘要 (2026-05-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
今日暂无使用记录。

已检测 AI 助手：Claude Code、Codex
未检测到：OpenClaw

运行 aiusage serve 启动 Web Dashboard 查看历史数据。
```

**完全空数据（从未检测到任何 AI 助手）：**
```
aiusage — 今日摘要 (2026-05-12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
未检测到任何 AI 助手日志。
支持：Claude Code (~/.claude/)、Codex (~/.codex/)、OpenClaw (~/.openclaw/)

运行 aiusage --help 查看帮助。
```

**趋势百分比（↑/↓）说明：** 与 **前一个等长时间段** 比较（今日对比昨日，本周对比上周，本月对比上月）。自定义日期范围不显示趋势。对比时段无数据时不显示百分比。

### `aiusage status` 输出格式

```
aiusage — 状态
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
版本：1.0.0
设备名称：macbook-pro
数据库大小：2.4 MB（1,247 条记录）
数据范围：2026-03-15 ~ 2026-05-12

已检测 AI 助手：
  ✓ Claude Code  (~/.claude/projects/ — 23 个日志文件)
  ✓ Codex        (~/.codex/sessions/ — 8 个日志文件)
  ✗ OpenClaw     (未检测到)

  云同步：
  后端：GitHub (username/aiusage-data)
  上次同步：2026-05-12 14:30:22
  状态：正常
  上次写入目标：github:username/aiusage-data
  上次上传 / 拉取：124 / 842
  凭证存储：系统凭证库
  远端审批：已确认（2026-05-12 14:28:01，目标/字段/read+write 绑定）

已知模型定价：6 个模型
未知定价模型：deepseek-v3（出现 12 次，cost 记为 0，来源：unknown）
日志原值定价：2 个模型（OpenClaw cost 字段，来源：log）

版本：1.0.0（最新：1.2.0，运行 npm i -g aiusage 更新）

Tombstone 累积：本地 14 条（其中全局 2 条），远端 3 个文件共 0.2 MB
```

说明：
- `status` 中“记录数”默认指本地 `records` 表记录数
- 若已完成云同步，可额外显示“已合并远端记录：N 条（不含当前设备副本）”
- 若启用了 `allowPlaintextCredentialFallback`，`status` 明确显示“凭证明文存储：是（不安全模式）”

## Web Dashboard 页面

| 页面 | 内容 |
|------|------|
| 概览 | 总 token 消耗、总成本、活跃天数、最常用工具调用；支持日期范围筛选 |
| Token | 按天/周/月的输入+输出+thinking token 趋势折线图 |
| 成本 | 成本趋势 + 按 AI 助手/模型成本占比（饼图 + 柱状图）；未知价格模型标注提示 |
| 模型 | 模型调用分布：调用次数和 token 占比 |
| 工具调用 | 工具调用频率排行（Top N） |
| 会话 | 会话列表，可按 AI 助手和日期筛选，分页加载（每页 50 条） |

所有页面均支持日期范围选择（今日 / 本周 / 本月 / 自定义区间）。

**活跃天数定义：** 汇总视图中，对 `records UNION ALL synced_records(deviceInstanceId != currentDeviceInstanceId)` 的 `ts` 字段按日期去重后的计数（即有任意 token 消耗记录的自然日数量），按所选时间范围过滤。

**多设备数据说明：** 云端同步仅包含 `SyncRecord`（token、成本、模型、`sessionKey`、device、`deviceInstanceId`），不含工具调用详情、绝对路径和原始日志位置信息。"工具调用"页和会话页展示的是当前设备本地数据；token、成本、模型分布和活跃天数类页面在云同步后可汇总多设备数据。

## 云端同步

通过 `aiusage init` 配置，支持两种后端：

| 后端 | 适合人群 | 配置方式 |
|------|----------|---------|
| GitHub 私有仓库 | 开发者（几乎都有账号） | Personal Access Token |
| S3 / Cloudflare R2 | 有云账号的用户 | Access Key + Bucket + Prefix + Endpoint |

**隐私声明：同步到云端的数据仅为脱敏后的统计记录（时间、token 数、成本、成本来源、模型名、AI 助手类型、`sessionKey`、device、`deviceInstanceId`），不含工具调用名称、对话内容、代码、提示词、文件内容、绝对路径、原始 `sessionId` 或日志字节偏移。设备名称默认使用主机名，可在 `config.json` 中通过 `device` 字段自定义别名。`deviceInstanceId` 为本地生成的稳定随机标识，用于避免将不同设备的同名别名误判为同一设备。尽管不包含正文内容，设备别名、设备实例标识、时间分布和模型分布仍可能构成敏感元数据，因此首次远端访问前必须进行显式确认。**

**同步策略：**
- 双向同步：先拉取远端，再上传本地新增记录
- 同步语义以“设备统计汇总”为准，不尝试跨设备识别同一日志副本
- 本地 SQLite 为主查询数据源，云端为跨设备合并层
- 本地记录与远端记录分别以 `StatsRecord.id` / `SyncRecord.id` 去重
- 触发时机：`aiusage sync`（手动）或 `aiusage serve`（启动时自动同步一次）
- 同步完成后更新 `state.json` 中的 `lastSyncAt` 和 `lastSyncStatus`
- 本地上传游标基于 `records.synced_at IS NULL OR records.updated_at > records.synced_at`，**不**基于业务时间 `ts`
- 未完成远端审批时，不允许执行拉取、上传或远端删除
- 发起任意远端操作前必须校验 `syncConsentTarget === currentTargetFingerprint`
- `currentTargetFingerprint` 必须由规范化后的 `backend + 目标地址 + endpoint + region + 上传字段清单 + 允许的远端操作集合 + schema 版本` 计算得出；不得仅依赖手写的 `fields:v1` 版本号
- 每次成功上传、拉取、远端清理后写入 `audit.log`

**同步流程：**
1. **审批校验阶段：** 若 `state.json.syncConsentAt` 缺失，或 `syncConsentTarget` 与当前目标指纹不一致，则整次远端同步直接阻断；不得访问远端对象列表、主数据文件或 tombstone 文件
2. **拉取阶段：** 审批校验通过后，枚举目标时间范围内的远端 NDJSON 文件与 tombstone 文件，先读取 tombstone 到本地 `sync_tombstones`，再读取 `SyncRecord`。对每条远端记录，只有命中 `deviceScope="*"` 或 `deviceScope === SyncRecord.deviceInstanceId` 的 tombstone 时才视为删除；其余设备作用域的 tombstone 不得影响该记录。随后按 `SyncRecord.id` 去重并 upsert 到本地 `synced_records`
3. **上传阶段：** 从本地 `records` 中筛选 `synced_at IS NULL OR updated_at > synced_at` 的记录，映射为 `SyncRecord`（注意 `SyncRecord.id = sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]`，与 `StatsRecord.id` 不同）后，只有当其命中 `deviceScope="*"` 或 `deviceScope === SyncRecord.deviceInstanceId` 的 tombstone 时才禁止上传；其他设备作用域的 tombstone 不得阻止该记录上传。上传成功后将这些本地记录的 `synced_at` 更新为当前同步时间
4. **完成阶段：** 成功后写入 `state.json.lastSyncAt`、`lastSyncTarget`、`lastSyncUploaded`、`lastSyncPulled`；若发生冲突并成功自愈，则 `lastSyncStatus = "conflict_resolved"`

**更新语义：**
- 云端文件物理格式仍为 append-only NDJSON，但逻辑主键为 `SyncRecord.id`
- 当同一 `SyncRecord.id` 出现多次时，以 `updatedAt` 更大的那条为准；拉取阶段先按 `id` 分组，再保留最新版本写入本地 `synced_records`
- 本地记录如因解析器修复或补算逻辑变化（如显式执行 `aiusage recalc`）而发生字段更新，应保持 `SyncRecord.id` 不变，仅刷新 `updatedAt` 和业务字段。**价格表版本更新不自动触发已有记录的字段更新**（详见"成本计算"章节）
- tombstone 的优先级高于 `SyncRecord`：若同一 `id` 命中对该记录 `deviceInstanceId` 生效的 tombstone（`deviceScope="*"` 或 `deviceScope === record.deviceInstanceId`），则该记录不得再次上传，且本地 `synced_records` 中对应项应被删除

**拉取范围规则：**
- `aiusage sync`：拉取最近 `retentionDays` 天覆盖到的所有月/日文件，保证新设备首次同步即可拿到完整保留窗口数据
- `aiusage serve` 启动自动同步：同样拉取最近 `retentionDays` 天；HTTP 服务就绪后先完成本地保留窗口清理，再启动首次后台同步与后续上传
- `aiusage sync` 与 `aiusage serve` 在同步前都必须先执行本地保留窗口清理，确保窗口外旧 `records` 不会再次参与上传
- 本地 `synced_records` 只保留 `retentionDays` 窗口内数据，超出窗口的数据在自动清理或 `clean` 时一并删除
- `sync_tombstones` 默认**不**随 `retentionDays` 自动清理；v1 视为安全优先的长期保护状态，避免离线设备在 tombstone 过早清除后重新上传已删除记录
- **Tombstone 安全清理机制（v1 实现）：** 每次 `aiusage sync` 成功完成后，检查本地 `sync_tombstones` 中 `deviceScope !== “*”` 的条目：若该 `deviceScope` 对应的 `deviceInstanceId` 在 `synced_records` 中存在且其最近 `updated_at` 晚于 tombstone 的 `deleted_at`，则说明该设备已拉取了 tombstone 之后的更新，该 tombstone 可安全删除。`deviceScope=”*”` 的 tombstone 需所有已知设备均已拉取后方可清理（v1 不自动清理 `”*”` 作用域的 tombstone，在 `status` 中提示累积数量）。远端 `.tombstones.ndjson` 文件不做自动清理，但 `status` 中显示远端 tombstone 文件数量和总大小供用户判断
- 若审批未完成或审批绑定目标已失效，则上述”拉取范围”规则不生效，因为不得发生任何远端读取

**GitHub 同步数据格式（append-only NDJSON + 乐观锁）：**
- 按月存储：`data/YYYY/MM.ndjson`（每行一个 `SyncRecord` JSON 对象，不含工具调用详情）
- 删除记录单独写入：`data/YYYY/MM.tombstones.ndjson`（每行一个 `SyncTombstone` JSON 对象）
- 月文件超过 5MB 时，后续记录按日存储：`data/YYYY/MM/DD.ndjson`；月文件变为**只读**（不再追加），所有后续写入走日文件
- tombstone 文件超过 5MB 时，后续记录按日存储：`data/YYYY/MM/DD.tombstones.ndjson`；同理月级 tombstone 文件变为只读
- 读取路由：**同时**读取 `data/YYYY/MM.ndjson` 和 `data/YYYY/MM/*.ndjson`（若存在）；合并后按 `SyncRecord.id` 去重，避免月文件与日文件并存时漏数
- tombstone 路由同理：同时读取月级与日级 tombstone 文件
- **乐观锁：** 提交时携带上次读取的 `sha`，冲突（409）时重新拉取、合并去重后重试，最多 3 次
- 所需 PAT 权限：默认仅接受 fine-grained token，需 `Contents: Read and write`；classic token 的 `repo` scope 仅兼容旧环境，不作为推荐或默认路径
- **权限校验方式：** `init` 通过实际 API 操作验证权限——先尝试读取仓库根目录（GET /repos/{owner}/{repo}/contents/），再尝试写入临时文件（PUT `.aiusage-perm-test-{random}`）后立即删除（DELETE），任一步骤失败则明确报告权限不足的具体原因
- **仓库需用户提前手动创建为 Private**；`aiusage init` 必须校验 `private=true`、owner 与用户输入一致、token 权限满足最小要求，任一不满足则拒绝配置。仓库为空时写入初始 `README.md` 占位
- 不允许写入 Public 仓库、Internal 仓库或 owner 不匹配的目标
- 远端删除使用 tombstone 传播，避免其他设备在后续同步中把已删除记录重新上传
- 远端写入按设备逻辑分区：`clean --remote` 默认仅删除当前 `deviceInstanceId` 的记录并写入 `deviceScope=currentDeviceInstanceId` 的 tombstone；跨设备删除需显式传 `--all-devices`，并写入 `deviceScope="*"` 的 tombstone

**S3/R2 同步数据格式：**
- 对象键：`<prefix>/YYYY/MM.ndjson`，默认前缀为 `aiusage/`，格式与 GitHub 一致，拆分规则相同
- tombstone 对象键：`<prefix>/YYYY/MM.tombstones.ndjson`，拆分规则与主数据文件一致
- 使用 `If-Match` (ETag) 做乐观锁，冲突时重新拉取合并后重试（最多 3 次）
- `init` 必须校验 prefix 非空、不是 bucket 根目录、当前凭证仅对该 prefix 具备预期读写权限；校验失败则拒绝配置

**`aiusage clean --remote` 保护策略：**
- `init` 默认只授予 `read + write`；首次执行 `clean --remote` 前，必须显式升级审批为包含 `delete` 的操作集合
- **审批升级流程：** `clean --remote` 检测到当前审批不包含 `delete` 时，交互式引导用户确认升级：
  1. 展示本次升级将追加的操作（`delete`）及影响范围
  2. 用户确认后，更新 `syncConsentAt` 为当前时间，重新计算 `syncConsentTarget`（操作集合从 `read,write` 变为 `read,write,delete`）
  3. 写回 `state.json`，后续 `clean --remote` 无需再次确认
  4. 非交互环境需显式传 `--approve-delete` 完成升级，否则拒绝访问远端
- 执行前必须先通过当前目标的审批校验；未审批、审批失效，或当前审批不包含 `delete` 时，连 dry-run 也不得访问远端
- 默认先执行 dry-run，展示受影响的月份、设备范围、预计删除记录数和目标后端
- 真正执行删除时必须二次确认；非交互环境需显式传 `--yes`
- 默认仅为当前 `deviceInstanceId` 产生 tombstone；若要删除所有设备数据，必须同时传 `--all-devices`
- 删除完成后写入 `state.json.lastRemoteCleanAt`、`lastRemoteCleanSummary` 和 `audit.log`
- 远端清理默认通过追加 tombstone 完成，不要求立即物理重写历史 NDJSON；如后续实现离线压实(compaction)，需在不破坏 tombstone 语义的前提下另行设计

## 数据保留策略

- 默认保留本地数据 **180 天**，可在 `config.json` 中配置 `retentionDays`
- `aiusage serve` 启动时先同步清理超过 `retentionDays` 天的 `records`、`synced_records` 和孤儿 `tool_calls`，清理完成后再启动 HTTP 服务与首次后台同步
- `aiusage sync` 在同步前同步清理超过 `retentionDays` 天的 `records`、`synced_records` 和孤儿 `tool_calls`
- `aiusage clean` 手动清理（默认使用 `retentionDays` 值，`--before Nd` 可指定天数）
- `aiusage clean --before 90d --remote` 同时清理云端对应时间段的数据；执行前必须持有包含 `delete` 的远端审批。默认仅为当前设备实例记录写 tombstone，除非显式指定 `--all-devices`
- 云端数据默认不自动清理，由用户自行管理
- `sync_tombstones` 与远端 tombstone 文件在 v1 采用渐进清理策略：本地 `sync_tombstones` 中 `deviceScope` 为具体设备 ID 的条目在确认该设备已拉取后可安全清理（详见"拉取范围规则"中的 Tombstone 安全清理机制）；`deviceScope="*"` 的条目和远端 tombstone 文件 v1 不自动清理，`status` 中提示累积情况

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| JSONL 行解析失败 | 跳过该行，写入 `errors.log`（含文件路径和字节偏移） |
| AI 助手未安装（路径不存在） | 静默跳过，summary 中显示空数据状态 |
| 当日无使用记录 | summary 输出空数据状态提示，不报错 |
| 云同步失败（离线/凭证失效） | 明确提示错误原因，更新 state.json，本地数据不受影响 |
| 云同步冲突（乐观锁冲突） | 重新拉取远端文件，合并去重后重试（最多 3 次） |
| `serve` 启动时首次自动同步与清理顺序冲突 | 先同步完成本地过期清理，再启动 HTTP 服务；首次自动同步仅能发生在服务就绪之后 |
| 同步目标变更但未重新审批 | 清除旧审批状态，阻止一切远端访问（拉取/上传/删除），并提示重新运行 `aiusage init` 确认 |
| GitHub 仓库不是 Private / owner 不匹配 | `init` 直接拒绝配置，并提示用户更换目标仓库 |
| S3/R2 prefix 为空或指向 bucket 根目录 | `init` 直接拒绝配置，并提示用户设置专用前缀 |
| 未完成远端审批却执行 sync / serve 自动同步 / clean --remote | 不访问远端，直接阻断，并将 `lastSyncStatus` 记为 `blocked_pending_consent` |
| 已有 read+write 审批但执行 `clean --remote` | 拒绝访问远端并提示先升级审批到包含 `delete` |
| 记录命中远端 tombstone | 仅当 tombstone 对该记录 `deviceInstanceId` 生效时，本地保留 `records`，但禁止再次上传，并从 `synced_records` 移除该项 |
| 日志格式变更（AI 助手升级） | 报错信息含文件路径和字节偏移，提示用户更新 aiusage |
| Web 端口被占用 | 提示使用 `--port` 指定其他端口 |
| 未知模型定价 | cost 记为 0，Dashboard 标注"价格未知"，`status` 列出所有未知定价模型 |
| 日志文件被截断（size < offset） | 从头重新解析，按 source_file 删除旧记录，写入 `warnings.log` |
| config.json 格式错误 | 启动时校验，报错并提示具体的 JSON 语法错误位置 |
| 解析锁：持锁进程仍在运行 | 等待最多 5 秒；超时后跳过解析，输出提示 |
| 解析锁：持锁进程已死（僵尸锁） | 清除旧锁文件，立即开始解析 |
| 未运行 init 时执行 sync | 提示先运行 `aiusage init` 配置云同步 |
| `clean --remote` 未确认 | 保持 dry-run，不执行远端删除 |
| `last_token_usage` 字段缺失（Codex） | 跳过该行，写入 `warnings.log` |
| OpenClaw `cost` 字段不存在 | fallback 到价格表计算（值为 0 是合法值，不触发 fallback） |
| `message.content` 缺失 | 跳过工具调用提取，token 记录正常保留 |
| Codex 会话结束时有未关联的工具调用 | 生成 `record_id = NULL` 的孤儿 ToolCallRecord，写入 `warnings.log` |
| `aiusage init` 连接验证失败 | 提示具体原因（权限不足/仓库不存在/非 Private 仓库/目标前缀非法/网络超时），允许重试 |

## 跨平台路径处理

```typescript
const TOOL_PATHS = {
  'claude-code': path.join(os.homedir(), '.claude', 'projects'),
  'codex':       path.join(os.homedir(), '.codex', 'sessions'),
  'openclaw':    path.join(os.homedir(), '.openclaw', 'agents'),
}
```

所有路径使用 `path.join` 和 `os.homedir()`，不硬编码 Unix 路径。水位线、数据库中存储的路径均为绝对路径。

## 版本与升级

- `aiusage status` 非阻塞式检查 npm registry 最新版本：发起 HTTPS 请求获取 `https://registry.npmjs.org/aiusage/latest`，与当前版本比较；网络失败或超时（3 秒）时静默跳过
- 检测到新版本时在 `status` 输出末尾提示：`新版本可用：1.2.0（当前 1.0.0），运行 npm i -g aiusage 更新`
- 价格表和解析器随版本更新迭代，不提供运行时自动更新（避免破坏幂等性）

## 测试策略

- **单元测试**：每个解析器用真实 JSONL fixture 文件做快照测试（三个 AI 助手各有真实日志样本）；provider 推断、价格计算、id 生成（sourceFile + lineOffset 哈希）、`SyncRecord.id` 生成（含 deviceInstanceId）、callIndex 赋值、`costSource` 各分支（log/pricing/unknown）、OpenClaw cost=0 与字段缺失的分支、Codex 孤儿工具调用兜底均需覆盖
- **集成测试**：聚合器使用多 AI 助手混合 fixture 数据，验证归一化正确性；水位线机制验证增量解析正确性（含文件截断、文件删除、并发锁、僵尸锁场景）；空数据状态输出格式验证
- **Schema 迁移测试**：验证从 v1 到 vN 的逐版本迁移正确性
- **云同步测试**：用 mock GitHub API / S3 验证乐观锁冲突重试、月文件超限拆分、多设备合并去重逻辑、目标变更后二次审批、tombstone 阻止被删记录重新上传
- **E2E 测试**：用 fixture 日志目录跑完整 `aiusage summary`（含空数据状态）和 `aiusage export`，验证输出格式
- **覆盖率目标**：`core` 包 ≥ 80%，`cli` 命令层 ≥ 60%

## 本地配置文件

存储路径：`~/.aiusage/config.json`（仅由 `aiusage init` 创建）

**GitHub 后端：**
```json
{
  "sync": {
    "backend": "github",
    "repo": "username/aiusage-data",
    "credentialRef": "keychain://aiusage/github/username/aiusage-data"
  },
  "device": "macbook-pro",
  "retentionDays": 180,
  "parseInterval": 60,
  "dashboardPollInterval": 30
}
```

**S3 / Cloudflare R2 后端：**
```json
{
  "sync": {
    "backend": "s3",
    "bucket": "my-aiusage-bucket",
    "prefix": "aiusage/",
    "credentialRef": "keychain://aiusage/s3/my-aiusage-bucket",
    "endpoint": "https://<account>.r2.cloudflarestorage.com",
    "region": "auto"
  },
  "device": "macbook-pro",
  "retentionDays": 180,
  "parseInterval": 60,
  "dashboardPollInterval": 30
}
```

- 启动时使用 JSON Schema 校验配置文件，格式错误时报告具体位置
- `sync` 字段可选——不配置时所有命令以纯本地模式运行
- `device` 字段可选——不配置时默认使用 `os.hostname()`
- `parseInterval` 字段可选——`serve` 命令后台增量解析间隔（秒），默认 60，最小 10
- `dashboardPollInterval` 字段可选——Dashboard 前端轮询间隔（秒），默认 30，最小 5
- 默认使用系统凭证库存储敏感凭证，`config.json` 不保存明文 token/secret
- 仅当 `allowPlaintextCredentialFallback: true` 时，才允许在 `config.json` 中写入明文凭证；该模式仅作为兼容兜底，不推荐启用
- 凭证仅存本地，不会提交到统计数据仓库

## 发布方式

- 单个 npm 包：`aiusage`
- Web 构建产物（`packages/web/build/`）在发布时打包进 CLI 包
- `bin` 入口指向 `packages/cli/dist/index.js`
- 最低 Node.js 版本：18（LTS）
