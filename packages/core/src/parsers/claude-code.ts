import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateBlockToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

/**
 * The tool call a `tool_use` block of a Claude Code message is stored as, or
 * null when the block has no usable name. `callIndex` is the block's position
 * among the `tool_use` blocks of its line.
 */
export function claudeCodeToolCall(block: any, recordId: string, ts: number, callIndex: number): ToolCallRecord | null {
  let storedName: string
  if (block.name === 'Skill') {
    const raw = block.input?.skill ?? block.input?.skillName ?? block.input?.name ?? ''
    const skillArg = typeof raw === 'string' ? raw.trim() : ''
    storedName = skillArg ? `skill__${skillArg}` : 'skill__unknown'
  } else {
    // Clean malformed names (some logs have args/quotes embedded in name)
    const rawName: string = block.name ?? ''
    const cleanName = rawName.replace(/[=:"'{\[\s].*$/s, '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!cleanName) return null
    storedName = cleanName
  }
  // A message is written as one line per content block and every line
  // restarts callIndex at 0, so the block's own id is the only key that tells
  // two calls of one message apart. A block without one falls back to its
  // name, timestamp and index, under a key no real block id can equal. Either
  // way the id is never the positional hash of generateToolCallId, which only
  // rows written by earlier releases carry.
  const blockId = typeof block.id === 'string' && block.id
    ? block.id
    : `\0no-block-id\0${storedName}\0${ts}\0${callIndex}`
  return {
    id: generateBlockToolCallId(recordId, blockId),
    recordId,
    name: storedName,
    ts,
    callIndex,
  }
}

export class ClaudeCodeParser implements Parser {
  readonly tool: Tool = 'claude-code'

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    // Skip lines without message.usage
    if (!parsed.message?.usage) return null

    const usage = parsed.message.usage
    const model = parsed.message.model ?? 'unknown'

    // Skip synthetic messages (Claude Code internal, zero token usage)
    if (model === '<synthetic>') return null
    const rawTs = parsed.message.timestamp ?? parsed.timestamp ?? context.now
    const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime()

    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0
    const thinkingTokens = usage.thinking_tokens ?? 0

    // Calculate cost
    const cost = model === 'unknown' ? 0 : calculateCost(model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
    }, context.exchangeRate)

    const costSource = model === 'unknown' ? 'unknown' as const : 'pricing' as const
    const provider = inferProvider(model)

    const messageId = parsed.message.id
    const record: StatsRecord = {
      id: messageId
        ? generateRecordId(context.deviceInstanceId, messageId, 0)
        : generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset),
      ts,
      ingestedAt: context.now,
      updatedAt: context.now,
      lineOffset: context.lineOffset,
      tool: this.tool,
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource,
      sessionId: context.sessionId,
      sourceFile: context.sourceFile,
      device: context.device,
      deviceInstanceId: context.deviceInstanceId,
      platform: context.platform,
    }

    // Extract tool calls from message.content
    const toolCalls: ToolCallRecord[] = []
    if (Array.isArray(parsed.message.content)) {
      let callIndex = 0
      for (const block of parsed.message.content) {
        if (block.type === 'tool_use') {
          const toolCall = claudeCodeToolCall(block, record.id, ts, callIndex)
          if (toolCall) toolCalls.push(toolCall)
          callIndex++
        }
      }
    }

    return { record, toolCalls }
  }
}
