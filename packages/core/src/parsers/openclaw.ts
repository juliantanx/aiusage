import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId, generateOrphanToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

export class OpenClawParser implements Parser {
  readonly tool: Tool = 'openclaw'

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    if (parsed.message?.role === 'assistant' && Array.isArray(parsed.message.content) && !parsed.message?.usage) {
      const rawTs = parsed.message.timestamp ?? parsed.timestamp ?? context.now
      const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime()
      const toolCalls: ToolCallRecord[] = []
      let callIndex = 0

      for (const block of parsed.message.content) {
        if (block.type === 'tool_use' || block.type === 'toolCall') {
          toolCalls.push({
            id: generateOrphanToolCallId(this.tool, block.name, ts, callIndex),
            recordId: null,
            name: block.name,
            ts,
            callIndex,
          })
          callIndex++
        }
      }

      if (toolCalls.length > 0) {
        return { record: null, toolCalls }
      }
    }

    // Skip lines without message.usage
    if (!parsed.message?.usage) return null

    const usage = parsed.message.usage
    const model = parsed.message.model ?? 'unknown'
    const rawTs = parsed.message.timestamp ?? context.now
    // Normalize timestamp to Unix milliseconds (parsers must always produce integer ts)
    const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime()

    const inputTokens = usage.input ?? 0
    const outputTokens = usage.output ?? 0
    const cacheReadTokens = usage.cacheRead ?? 0
    const cacheWriteTokens = usage.cacheWrite ?? 0
    const thinkingTokens = 0 // OpenClaw doesn't provide thinking tokens

    // Cost handling: usage.cost can be an object {total, input, output, ...} or a number.
    // Only trust the logged cost as authoritative when it is actually positive — custom
    // gateways (e.g. openclaw -> deepseek) report `cost.total: 0` for models they don't
    // price, and a 0 logged cost must not block pricing/recalc (issue #13). This mirrors
    // the Cline (parse.ts) and Hermes parsers, which both require cost > 0 for 'log'.
    const loggedCost = (usage.cost != null && typeof usage.cost === 'object')
      ? Number(usage.cost.total ?? 0)
      : (typeof usage.cost === 'number' ? usage.cost : NaN)

    let cost: number
    let costSource: 'log' | 'pricing' | 'unknown'

    if (Number.isFinite(loggedCost) && loggedCost > 0) {
      cost = loggedCost
      costSource = 'log'
    } else if (model === 'unknown') {
      cost = 0
      costSource = 'unknown'
    } else {
      cost = calculateCost(model, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
      }, context.exchangeRate)
      costSource = cost > 0 ? 'pricing' : 'unknown'
    }

    // Provider: use message.provider if available, otherwise infer
    const provider = parsed.message.provider ?? inferProvider(model)

    const record: StatsRecord = {
      id: generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset),
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
        // openclaw uses 'toolCall' (camelCase); Anthropic API uses 'tool_use'
        if (block.type === 'tool_use' || block.type === 'toolCall') {
          toolCalls.push({
            id: generateToolCallId(record.id, block.name, ts, callIndex),
            recordId: record.id,
            name: block.name,
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