# OpenCode 支持设计

## 背景

当前 `aiusage` 支持三类来源：`claude-code`、`codex`、`openclaw`。用户现在需要：

1. 新增 **OpenCode** 作为独立工具类型接入
2. 保持现有按设备统计/筛选能力
3. 在所有已有按设备查看的入口，新增按 **工具类型**（`claude-code` / `codex` / `openclaw` / `opencode`）统计与筛选能力

本次设计聚焦于：
- 接入 OpenCode 本地数据源
- 将 OpenCode 导入现有统一记录模型
- 为 CLI / API / Web 全链路增加 `tool` 过滤维度

不包含新的专属页面或 OpenCode 特有扩展字段展示。

## 现状

现有系统的来源接入方式分为：
- `claude-code` / `codex` / `openclaw`：从本地 JSONL 日志发现并增量解析
- 统一写入 `records` 和 `tool_calls`
- 聚合层以 `tool`、`provider`、`model`、`device` 等维度统计

现有 `tool` 枚举只包含：
- `claude-code`
- `codex`
- `openclaw`

现有本地解析流程默认建立在“按文件发现 + 按字节 offset watermark 增量读取”的模型上。

## OpenCode 数据源调研结论

本机 OpenCode 实际数据源不是 JSONL 会话日志，而是 SQLite 数据库：

- 数据库路径：`~/.local/share/opencode/opencode.db`
- 关键表：`session`、`message`、`part`

调研发现：
- `session` 表包含会话级总 tokens / cost / model 等摘要信息
- `message.data` 是 JSON 文本，包含 assistant 消息级的 `tokens`、`cost`、`modelID`、`providerID`、`time`
- `part.data` 是 JSON 文本，包含 step 内部结构，其中 `type=tool` 的 part 可用于提取工具调用明细

因此 OpenCode 最合适的接入方式不是复用现有 JSONL parser，而是新增 **SQLite 导入分支**。

## 设计目标

1. 新增独立工具类型 `opencode`
2. 从 OpenCode SQLite 数据库稳定导入 usage 记录
3. 导入粒度与现有记录模型保持一致，尽量按 assistant message 生成明细记录
4. 从 `part.data` 中提取工具调用并写入 `tool_calls`
5. 在 CLI / API / Web 中增加 `tool` 过滤维度
6. 支持 `device` 与 `tool` 组合过滤

## 非目标

以下内容不在本次范围：
- OpenCode 专属 dashboard 页面
- OpenCode 富文本消息内容展示
- 解析 OpenCode 普通文本运行日志 `~/.local/share/opencode/log/*.log`
- 引入新的跨工具统一 provider 映射规则以外的报表体系

## 方案对比

### 方案 A：OpenCode 作为独立工具类型，直接读取 SQLite（推荐）

做法：
- 新增 `tool = 'opencode'`
- 新增 OpenCode 专用导入器，读取 `opencode.db`
- 从 `message.data` 生成 usage records
- 从 `part.data` 提取 tool calls
- 在所有查询接口加入 `tool` 过滤

优点：
- 与 OpenCode 实际存储结构一致
- 字段稳定，tokens / cost / provider / model 信息完整
- tool call 数据可从结构化 part 中提取
- 后续维护最直接

缺点：
- 需要在现有“文件型增量解析”之外引入“数据库型增量导入”分支

### 方案 B：解析 OpenCode 文本日志

做法：从 `~/.local/share/opencode/log/*.log` 提取 usage 与 tool calls。

问题：
- 该日志主要是运行日志，不是稳定的统计主数据源
- tokens / cost / tool calls 分布不稳定
- 容易因为版本升级失效

不采用。

### 方案 C：先将 SQLite 转换为类 JSONL，再复用 OpenClaw parser

做法：增加转换层，把 OpenCode DB 中的数据重写为内部兼容 JSONL，再交给现有 parser。

问题：
- 增加不必要转换层
- 可读性差，维护成本更高
- 不能真正减少复杂度

不采用。

## 推荐方案

采用 **方案 A**：将 OpenCode 作为独立 `tool` 类型接入，直接读取 SQLite 数据库，并在查询层统一增加 `tool` 过滤维度。

## 数据模型变更

### Tool 枚举

将现有 `Tool` 类型从：
- `claude-code | codex | openclaw`

扩展为：
- `claude-code | codex | openclaw | opencode`

该变更影响：
- core 类型定义
- parser / aggregator 映射
- CLI 参数提示
- watermark/state 结构
- 所有依赖 `tool` 枚举的测试

### records 记录口径

OpenCode 的 `records` 导入粒度采用：
- **每条 assistant usage message 生成一条 record**

原因：
- `message.data` 已包含结构化 tokens / cost / model / provider / created time
- 与现有 Claude Code / OpenClaw 的“按 assistant message 记账”模型更一致
- 比仅按 `session` 聚合更适合明细统计、时间序列和 tool call 关联

### tool_calls 口径

从 `part.data` 提取 `type = tool` 的 part，生成 `tool_calls`。

关联方式：
- 通过 `message_id` / `session_id` 将 tool call 归属到对应 assistant message 生成的 record
- 保留 `callIndex` 以维持顺序

## OpenCode 导入流程设计

### 数据发现

新增 OpenCode 数据源发现：
- 检查 `~/.local/share/opencode/opencode.db` 是否存在
- 若不存在，跳过，不报致命错误

不将 OpenCode 纳入 `findJsonlFiles()` 体系。

### 数据读取

新增 OpenCode 专用导入路径：
1. 打开 SQLite 数据库
2. 读取增量范围内的 `message`
3. 仅处理 `message.data.role = assistant` 且包含 usage/tokens 信息的消息
4. 解析字段并映射为统一 `StatsRecord`
5. 查询该 message 关联的 `part`
6. 提取 `type = tool` 的 part，写入 `tool_calls`

### 字段映射

从 `message.data` 提取：
- `time.created` → `ts`
- `modelID` → `model`
- `providerID` → `provider`
- `tokens.input` → `inputTokens`
- `tokens.output` → `outputTokens`
- `tokens.reasoning` → `thinkingTokens`
- `tokens.cache.read` → `cacheReadTokens`
- `tokens.cache.write` → `cacheWriteTokens`
- `cost` → `cost`
- `costSource` → 固定为 `log`（存在 cost 字段时）
- `session_id` → `sessionId`

回退策略：
- 缺 `modelID`：`model = 'unknown'`
- 缺 `providerID`：优先由 model 推断，否则 `unknown`
- 缺 tokens 字段：按 0 处理
- 缺 cost 字段：若 model 可识别，可走 pricing；否则 `cost = 0, costSource = 'unknown'`

### 工具调用提取

从 `part.data` 中提取：
- `type = tool`
- `tool` 字段作为工具名
- `time_created` 作为工具调用时间

生成 `ToolCallRecord`：
- `name` = tool 名称
- `ts` = `part.time_created`
- `callIndex` = 该 message 下按时间/读取顺序编号

若某条 assistant message 没有关联 tool parts，则允许生成没有 `tool_calls` 的 record。

## 增量同步设计

### 为什么不能复用现有文件 watermark

现有 watermark 依赖：
- `tool + filePath + byteOffset`

而 OpenCode 数据源是数据库，不存在文件行偏移语义，因此不能复用同一机制。

### 推荐增量策略

为 OpenCode 新增独立 watermark/state：
- 记录最近已导入的 `(message.time_created, message.id)` 游标

查询下一批时：
- 导入 `time_created > lastTime`
- 若 `time_created == lastTime`，再比较 `message.id > lastId`

这样可以：
- 避免重复导入
- 在同毫秒多条 message 时保持稳定顺序
- 适配同一 session 持续追加消息

### 状态存储

OpenCode watermark 建议仍存放在现有本地状态目录中，与普通 watermark 并存。

可以是：
- 扩展现有 watermark 文件结构，增加 `opencodeDb` 节点
- 或新增独立状态文件

推荐原则：
- 对文件型来源和数据库型来源分开建模
- 避免将数据库游标硬塞进“文件路径 → offset”的旧结构

## Aggregator / Parser 架构调整

### 现状问题

当前 `Aggregator` 假设所有来源都通过 `parseLine(line, context)` 工作，这更适合 JSONL。

OpenCode 是数据库来源，若强行套进 `parseLine()`：
- 需要先把 DB 记录序列化成人工 JSON 字符串
- 会增加无意义的中间层

### 推荐调整

保留现有 JSONL parser 体系不动，同时新增：
- OpenCode importer / extractor（数据库型导入器）

职责划分：
- `ClaudeCodeParser` / `CodexParser` / `OpenClawParser`：继续负责单行日志解析
- `OpenCodeImporter`：负责 DB 查询、字段映射、tool call 提取、结果生成

这样做的好处：
- 不破坏现有 parser 心智模型
- 避免将 `Aggregator` 泛化得过重
- 未来如果还要支持其他数据库型来源，可复用 importer 模式

## CLI 变更

### parse 命令

更新：
- `--tool <tool>` 选项增加 `opencode`

行为：
- `aiusage parse --tool opencode` 仅导入 OpenCode
- 不传 `--tool` 时，继续导入全部已发现来源

### summary 命令

新增 `tool` 过滤参数。

目标：
- 凡是当前支持按设备筛选查看的 CLI 入口，都应支持按 `tool` 筛选

表现：
- 支持仅查看某类工具来源，如 `opencode`
- 支持与设备过滤叠加

## API 变更

### 查询接口统一增加 tool filter

所有已有按设备过滤的统计接口，应同步增加：
- `tool` 查询参数

包括但不限于：
- summary / overview 统计
- by-day 时间序列统计
- by-model / by-provider / by-tool 聚合
- sessions 列表或其他现有过滤接口

### 过滤组合

接口层应支持组合过滤：
- 仅 device
- 仅 tool
- device + tool
- 无过滤

### 统计维度语义

明确区分：
- `tool`：来源工具类型（`claude-code` / `codex` / `openclaw` / `opencode`）
- `provider`：模型提供商（`anthropic` / `openai` / `qianfan` 等）
- `model`：具体模型名（如 `claude-sonnet-4-6`、`glm-5.1`）

这样既能看“我是用哪种 coding tool 消耗的”，也能看“底层调用了哪家模型”。

## Web Dashboard 变更

### 统一增加工具类型筛选器

凡是当前支持按设备看的页面或视图，都要新增 `tool` 维度筛选。

目标行为：
- 用户可筛选 `claude-code`
- 用户可筛选 `codex`
- 用户可筛选 `openclaw`
- 用户可筛选 `opencode`
- 用户可查看全部工具

### 筛选交互

建议与现有设备筛选保持同级：
- device filter
- tool filter

并且二者可同时生效。

### 图表与统计

所有当前受设备筛选影响的图表/卡片/列表，都应同步受 `tool` 筛选影响。

特别是：
- 总 tokens / cost 概览
- byTool 统计
- byModel / byProvider 分布
- 日维度 tokens / cost 曲线
- sessions 列表
- tool calls 排行

## 错误处理

### 数据源不存在

- `opencode.db` 不存在：直接跳过
- 不中断整个 parse 流程

### 单条记录异常

- `message.data` JSON 解析失败：跳过该条并记入 `errors`
- `part.data` JSON 解析失败：跳过该 part 并记入 `errors`
- 某条 message 缺少必要 usage 字段：按回退规则处理，无法形成 record 时跳过

### 容错原则

- 单条坏数据不影响整个来源导入
- OpenCode 导入失败不影响其他工具来源导入
- 查询层过滤参数非法时，维持现有参数校验风格

## 测试设计

### core

新增 OpenCode 相关测试，覆盖：
- assistant message → record 映射
- model / provider / tokens / cost 提取
- 缺字段回退
- part tool 提取与顺序
- 空 tool calls 情况

### cli

覆盖：
- 发现 `opencode.db`
- `aiusage parse --tool opencode`
- OpenCode watermark 增量行为
- OpenCode 导入错误容错
- `summary` 的 `tool` 过滤

### api / web

覆盖：
- 接口接受并正确应用 `tool` 过滤
- device + tool 叠加过滤
- dashboard 显示与筛选器联动
- byTool 中包含 `opencode`

## 实施顺序建议

1. 扩展 `Tool` 枚举与基础类型
2. 新增 OpenCode importer 与测试 fixture
3. 在 `parse` 命令中接入 OpenCode 数据源发现与增量导入
4. 扩展 watermark/state
5. 为 CLI 查询增加 `tool` 过滤
6. 为 API 查询增加 `tool` 过滤
7. 为 Web dashboard 增加 `tool` 筛选器与联动
8. 补充测试并回归现有三类工具来源

## 风险与注意事项

1. **粒度差异**：OpenCode 有 session 级和 message 级两层 usage 数据，必须统一以 message 级为主，避免与其他来源口径不一致
2. **重复导入风险**：如果没有稳定的 DB watermark，容易重复写入 assistant messages
3. **tool call 归属**：需要确保 `part` 正确归属到 message，否则会出现 orphan tool calls 或重复关联
4. **UI 过滤一致性**：必须保证所有已有按设备生效的页面都同步受 `tool` 影响，不能只改部分接口

## 最终结论

本次实现采用以下明确方案：

1. 将 `opencode` 新增为独立来源工具类型
2. 从 `~/.local/share/opencode/opencode.db` 读取 OpenCode 数据，不解析普通文本 log
3. 以 assistant message 为 record 粒度导入 usage
4. 从 `part.data` 中 `type=tool` 的结构提取 tool calls
5. 为 OpenCode 建立独立数据库游标 watermark
6. 在 CLI / API / Web 所有现有设备筛选入口同步新增 `tool` 筛选
7. 支持 `device` 与 `tool` 组合过滤

该方案与现有架构最一致，同时能稳定支持 OpenCode 接入与跨工具统计分析。