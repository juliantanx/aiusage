export type Tool = 'claude-code' | 'codex' | 'openclaw'

export interface StatsRecord {
  id: string                           // sha256(sourceFile + lineOffset) 前 16 位 hex
  ts: number                           // Unix 时间戳（毫秒）
  ingestedAt: number                   // 首次写入本地数据库时间（毫秒）
  syncedAt?: number                    // 最近一次成功上传到云端的时间（毫秒）
  updatedAt: number                    // 最近一次解析/重算该记录业务字段的时间（毫秒）
  lineOffset: number                   // 来源行在文件中的字节起始偏移
  tool: Tool
  model: string                        // 如 "claude-sonnet-4-6"，未知时为 "unknown"
  provider: string                     // 如 "anthropic"、"openai"
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number               // reasoning/thinking token；不可用时为 0
  cost: number                         // USD，由价格表计算
  costSource: 'log' | 'pricing' | 'unknown'
  sessionId: string
  sourceFile: string                   // 来源日志文件的绝对路径
  device: string                       // 设备别名
  deviceInstanceId: string             // 当前安装实例生成的稳定设备实例 ID
}

export interface ToolCallRecord {
  id: string                           // 关联 record 存在时：sha256(recordId + name + ts + callIndex) 前 16 位 hex
  recordId: string | null              // 关联的 StatsRecord.id；null 表示孤儿工具调用
  name: string                         // 工具名称，如 "Read"、"Bash"、"Edit"
  ts: number                           // 调用时间戳（毫秒）
  callIndex: number                    // 同一 record 内的工具调用序号
}

export interface SyncRecord {
  id: string                           // sha256(deviceInstanceId + sourceFile + lineOffset) 前 16 位 hex
  ts: number
  tool: Tool
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
  cost: number
  costSource: 'log' | 'pricing' | 'unknown'
  sessionKey: string                   // sha256(device + sessionId)[0:24]
  device: string
  deviceInstanceId: string
  updatedAt: number
}

export interface SyncTombstone {
  id: string                           // 被删除的 SyncRecord.id
  deviceScope: string                  // 默认 currentDeviceInstanceId；跨设备删除时为 "*"
  deletedAt: number
  reason: 'retention' | 'manual_clean'
}

// Intermediate parser output (before cost calculation and ID generation)
export interface ParsedLine {
  ts: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
  cost?: number                        // OpenClaw only
  costSource?: 'log'                   // OpenClaw only, when cost field exists
  provider?: string                    // OpenClaw only, when message.provider exists
  toolCalls?: Array<{ name: string; ts: number; callIndex: number }>
}

export interface ParseContext {
  sourceFile: string
  lineOffset: number
  sessionId: string
  tool: Tool
  now: number                          // Current timestamp for ingestedAt/updatedAt
  device: string
  deviceInstanceId: string
}

export interface ParseResult {
  record: StatsRecord
  toolCalls: ToolCallRecord[]
}

export interface Parser {
  tool: Tool
  parseLine(line: string, context: ParseContext): ParseResult | null
  finalize?(): ParseResult[]           // For orphan tool calls (Codex)
}
