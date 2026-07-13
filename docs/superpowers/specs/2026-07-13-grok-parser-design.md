# Grok Build 日志解析修复设计

## 背景与目标

AIUsage 已能发现 Grok Build 的默认会话目录，但 `Aggregator` 没有注册 Grok 解析器，导致发现到的日志全部返回空结果。Grok Build 当前的 `updates.jsonl` 使用 JSON-RPC 更新格式，并通过累计的 `totalTokens` 暴露 token 使用量，不能直接套用通用 JSONL 解析器。

本次修复应让自动解析和 `aiusage parse --tool grok` 都能导入既有及新增 Grok Build 会话，同时避免累计 token 重复计数，并自动恢复此前被错误水位跳过的历史日志。

## 解析架构

在 `@aiusage/core` 中新增专用的状态化 `GrokParser`，由 `Aggregator` 为 `grok` 注册。解析器只接受 Grok Build `updates.jsonl` 中的 JSON-RPC 更新，跟踪当前文件内的模型、最近累计 token、当前 turn 的基线与最大累计值。

每遇到新的 `user_message_chunk`，解析器结束上一个 turn；文件结束时通过 `finalize()` 输出最后一个 turn。单个 turn 的 token 使用量为其最大累计值减去 turn 开始前的累计基线。重复或回退的累计值不产生负数或重复记录。由于当前日志没有稳定的 input/output/cache 拆分，正向增量统一记录到 `inputTokens`，其他 token 分类记为 0。

解析器在 `finalize()` 后清空文件级状态，避免多个会话互相污染。若日志没有明确 turn 边界但存在有效累计 token，则生成一个会话级回退记录，保证已有数据不会继续静默丢失。

## 字段提取

- session ID：优先使用 `params.sessionId`，否则使用 `updates.jsonl` 的父目录名。
- 模型：优先使用 `params.update._meta.modelId`，并兼容 `params._meta.modelId`；缺失时使用 `grok-unknown`。
- token：兼容 `params._meta.totalTokens` 和 `params.update._meta.totalTokens`，只接受非负有限整数。
- 时间戳：优先读取 `agentTimestampMs`，兼容常见 timestamp 字段，最后回退到解析上下文时间。
- 工作目录：从 `sessions/<encoded-project-path>/<session-id>/updates.jsonl` 的项目目录解码；无法可靠解码时不写入 `cwd`。
- provider 与 cost：provider 由现有模型推断逻辑得到 `xai`；价格存在时复用现有计价逻辑，否则 cost 为 0、来源为 `unknown`。

## 文件发现与水位迁移

Grok 发现逻辑收窄为只返回名为 `updates.jsonl` 的文件，排除 `events.jsonl`、`chat_history.jsonl` 等非用量来源。

水位状态增加 Grok 解析器版本。读取旧水位文件时，如果版本低于当前版本，则仅清空 `files.grok` 并写入当前版本；其他工具水位保持不变。这样修复后的首次解析会自动重扫历史 Grok 日志，之后继续使用正常的字节偏移增量解析。

增量解析时，水位之前的行仍会送入状态化解析器以重建累计基线，但不会重复写入记录；只有水位之后产生的 turn 结果会被导入。

## 错误处理

无效 JSON、缺少用量字段、零增量、重复累计值和回退累计值均被安全忽略，不中断同文件后续行。文件级读取错误沿用现有 `parseLogs` 错误收集机制。迁移只操作 Grok 水位，不删除数据库中的现有记录。

## 测试策略

- Core 单元测试：新版 JSON-RPC 格式、模型/会话/时间戳提取、累计增量、重复与回退值、无 turn 边界回退、多文件状态隔离。
- Aggregator 测试：确认 `grok` 已注册且可解析记录。
- Discovery 测试：Windows 默认目录与 `GROK_HOME`，并确认只发现 `updates.jsonl`。
- Watermark 测试：旧状态仅重置 Grok 水位、保留其他工具水位，并持久化解析器版本。
- CLI 集成测试：已有 Grok 水位会自动重扫，首次导入历史记录；再次运行不重复导入；不同会话保持独立。
- 最终验证：运行 core/cli 相关测试、完整测试、lint 与 build。

## 非目标

本次不从 `signals.json` 或 `summary.json` 补齐压缩前 token，不估算 input/output 比例，也不新增 Grok 专属价格。若后续日志提供稳定的分类 token 或汇总字段，可在专用解析器中独立扩展。
