import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

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
    const ts = parsed.message.timestamp ?? parsed.timestamp ?? context.now

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
    })

    const costSource = model === 'unknown' ? 'unknown' as const : 'pricing' as const
    const provider = inferProvider(model)

    const record: StatsRecord = {
      id: generateRecordId(context.sourceFile, context.lineOffset),
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
          // Clean malformed names (some logs have args/quotes embedded in name)
          const rawName: string = block.name ?? ''
          const cleanName = rawName.replace(/[=:"'{\[\s].*$/s, '').replace(/[^a-zA-Z0-9_-]/g, '')
          if (!cleanName) { callIndex++; continue }
          toolCalls.push({
            id: generateToolCallId(record.id, cleanName, ts, callIndex),
            recordId: record.id,
            name: cleanName,
            ts,
            callIndex,
          })
          callIndex++
        }
      }
    }

    return { record, toolCalls }
  }
}
