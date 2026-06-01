import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, Tool } from '../types.js'
import { generateRecordId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

/**
 * Parser for GitHub Copilot OpenTelemetry JSONL files.
 *
 * Copilot CLI and the VS Code Copilot Chat extension can export OTEL spans
 * to JSONL when the user sets:
 *   COPILOT_OTEL_ENABLED=true
 *   COPILOT_OTEL_EXPORTER_TYPE=file
 *   COPILOT_OTEL_FILE_EXPORTER_PATH=~/.copilot/otel/copilot-otel-$(date +%Y%m%d).jsonl
 *
 * Each line is a JSON object representing a span or log record with
 * gen_ai.usage.* attributes for token counts.
 */
export class CopilotParser implements Parser {
  readonly tool: Tool = 'copilot'

  /** In-memory dedup set for traceId+spanId / response.id within a parse run */
  private seenIds = new Set<string>()

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let record: any
    try {
      record = JSON.parse(line)
    } catch {
      return null
    }

    if (!isChatSpan(record)) return null

    const attrs = record.attributes || {}

    // Dedup: CLI uses traceId/spanId; Chat extension uses gen_ai.response.id
    const dedupKey = getDedupKey(record, attrs)
    if (dedupKey) {
      if (this.seenIds.has(dedupKey)) return null
      this.seenIds.add(dedupKey)
    }

    // Extract token counts
    const inputRaw = toNonNegativeInt(attrs['gen_ai.usage.input_tokens'])
    const output = toNonNegativeInt(attrs['gen_ai.usage.output_tokens'])
    const cacheRead = toNonNegativeInt(attrs['gen_ai.usage.cache_read.input_tokens'])
    // CLI: cache_write.input_tokens; Chat extension: cache_creation.input_tokens
    const cacheWrite = toNonNegativeInt(
      attrs['gen_ai.usage.cache_write.input_tokens'] ??
      attrs['gen_ai.usage.cache_creation.input_tokens'],
    )
    // CLI: reasoning.output_tokens; Chat extension: reasoning_tokens
    const reasoning = toNonNegativeInt(
      attrs['gen_ai.usage.reasoning.output_tokens'] ??
      attrs['gen_ai.usage.reasoning_tokens'],
    )

    // OTEL input_tokens INCLUDES cache_read — subtract per convention
    const cacheReadClamped = Math.min(cacheRead, inputRaw)
    const input = Math.max(0, inputRaw - cacheReadClamped)

    const totalTokens = input + output + cacheReadClamped + cacheWrite + reasoning
    if (totalTokens === 0) return null

    // Timestamp: CLI Span uses endTime/startTime; Chat extension uses hrTime/hrTimeObserved
    const tsMs =
      otelTimeToMs(record.endTime) ||
      otelTimeToMs(record.startTime) ||
      otelTimeToMs(record.hrTime) ||
      otelTimeToMs(record.hrTimeObserved)
    if (!tsMs) return null

    // Model
    const model = pickModel(attrs) || 'github-copilot'
    const provider = inferProvider(model)

    // Cost
    const cost = calculateCost(model, {
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheReadClamped,
      cacheWriteTokens: cacheWrite,
      thinkingTokens: reasoning,
    }, context.exchangeRate)

    const statsRecord: StatsRecord = {
      id: generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset),
      ts: tsMs,
      ingestedAt: context.now,
      updatedAt: context.now,
      lineOffset: context.lineOffset,
      tool: this.tool,
      model,
      provider,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheReadClamped,
      cacheWriteTokens: cacheWrite,
      thinkingTokens: reasoning,
      cost,
      costSource: 'pricing',
      sessionId: context.sessionId,
      sourceFile: context.sourceFile,
      device: context.device,
      deviceInstanceId: context.deviceInstanceId,
      platform: context.platform,
    }

    return { record: statsRecord, toolCalls: [] }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isChatSpan(record: any): boolean {
  if (!record || typeof record !== 'object') return false
  // Skip metric records (resource + scopeMetrics)
  if (record.scopeMetrics) return false
  const opName = record?.attributes?.['gen_ai.operation.name']
  if (opName === 'chat') return true
  if (record.type === 'span' && typeof record.name === 'string' && record.name.startsWith('chat ')) {
    return true
  }
  return false
}

function otelTimeToMs(value: unknown): number | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const seconds = Number(value[0])
  const nanos = Number(value[1])
  if (!Number.isFinite(seconds)) return null
  const ns = Number.isFinite(nanos) ? nanos : 0
  return Math.round(seconds * 1000 + ns / 1_000_000)
}

function pickModel(attrs: Record<string, unknown>): string | null {
  const candidates = [attrs['gen_ai.response.model'], attrs['gen_ai.request.model']]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

function getDedupKey(record: any, attrs: Record<string, unknown>): string | null {
  const traceId = record?.traceId || record?.spanContext?.traceId || ''
  const spanId = record?.spanId || record?.spanContext?.spanId || ''
  const responseId =
    typeof attrs['gen_ai.response.id'] === 'string' ? attrs['gen_ai.response.id'] : ''
  if (traceId && spanId) return `${traceId}:${spanId}`
  if (responseId) return `resp:${responseId}`
  return null
}

function toNonNegativeInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0
}
