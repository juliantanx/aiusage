import { basename } from 'node:path'
import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider, resolvePrice } from '@aiusage/core'

export interface AntigravityImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  fallbackTs: number
  startIndex: number
  exchangeRate?: number
}

export interface AntigravityImportResult {
  records: StatsRecord[]
  nextIndex: number
  errors: string[]
}

interface ProtoField {
  number: number
  wireType: number
  value: number | Buffer
}

interface ModelUsage {
  modelId?: number
  inputTokens: number
  totalOutputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  thinkingTokens: number
  outputTokens: number
  identities: string[]
}

interface UsageEvent {
  usage: ModelUsage
  model?: string
  ts?: number
  sourceKey: string
  lineOffset: number
}

interface GenerationMetadata {
  index: number
  model?: string
  stepIndices: number[]
  events: UsageEvent[]
}

interface StepMetadata {
  ts?: number
  events: UsageEvent[]
}

// A protobuf varint carries at most 64 bits, which is 10 base-128 bytes.
// Negative int64/int32 values (for example -1 sentinels) always use all 10.
const MAX_VARINT_BYTES = 10

function readVarint(data: Buffer, start: number): { value: number; offset: number } {
  let value = 0
  let shift = 0
  let offset = start
  while (offset < data.length && offset - start < MAX_VARINT_BYTES) {
    const byte = data[offset++]
    value += (byte & 0x7f) * (2 ** shift)
    if ((byte & 0x80) === 0) return { value, offset }
    shift += 7
  }
  throw new Error('invalid protobuf varint')
}

function readFields(data: Buffer): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0
  while (offset < data.length) {
    const key = readVarint(data, offset)
    const number = Math.floor(key.value / 8)
    const wireType = key.value % 8
    if (number < 1) throw new Error('invalid protobuf field number')
    offset = key.offset

    if (wireType === 0) {
      const parsed = readVarint(data, offset)
      fields.push({ number, wireType, value: parsed.value })
      offset = parsed.offset
    } else if (wireType === 1) {
      if (offset + 8 > data.length) throw new Error('truncated protobuf fixed64')
      fields.push({ number, wireType, value: data.subarray(offset, offset + 8) })
      offset += 8
    } else if (wireType === 2) {
      const size = readVarint(data, offset)
      const end = size.offset + size.value
      if (end > data.length) throw new Error('truncated protobuf bytes')
      fields.push({ number, wireType, value: data.subarray(size.offset, end) })
      offset = end
    } else if (wireType === 5) {
      if (offset + 4 > data.length) throw new Error('truncated protobuf fixed32')
      fields.push({ number, wireType, value: data.subarray(offset, offset + 4) })
      offset += 4
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType}`)
    }
  }
  return fields
}

function messages(fields: ProtoField[], number: number): ProtoField[][] {
  return fields
    .filter((field) => field.number === number && field.wireType === 2 && Buffer.isBuffer(field.value))
    .map((field) => readFields(field.value as Buffer))
}

function firstMessage(fields: ProtoField[], number: number): ProtoField[] {
  return messages(fields, number)[0] ?? []
}

function firstVarint(fields: ProtoField[], number: number): number | undefined {
  const field = fields.find((candidate) => candidate.number === number && candidate.wireType === 0)
  return field && typeof field.value === 'number' ? field.value : undefined
}

function firstString(fields: ProtoField[], numbers: number[]): string | undefined {
  for (const number of numbers) {
    const field = fields.find((candidate) => candidate.number === number && candidate.wireType === 2)
    if (!field || !Buffer.isBuffer(field.value)) continue
    const value = field.value.toString('utf8').trim()
    if (value) return value
  }
  return undefined
}

function repeatedVarints(fields: ProtoField[], number: number): number[] {
  const values: number[] = []
  for (const field of fields) {
    if (field.number !== number) continue
    if (field.wireType === 0 && typeof field.value === 'number') {
      values.push(field.value)
    } else if (field.wireType === 2 && Buffer.isBuffer(field.value)) {
      let offset = 0
      while (offset < field.value.length) {
        const parsed = readVarint(field.value, offset)
        values.push(parsed.value)
        offset = parsed.offset
      }
    }
  }
  return values
}

function timestampFromFields(fields: ProtoField[]): number | undefined {
  const seconds = firstVarint(fields, 1)
  if (seconds == null || seconds <= 0) return undefined
  const nanos = Math.min(firstVarint(fields, 2) ?? 0, 999_999_999)
  return seconds * 1000 + Math.floor(nanos / 1_000_000)
}

function generationTimestamp(chatModel: ProtoField[]): number | undefined {
  const generationInfo = firstMessage(chatModel, 9)
  return timestampFromFields(firstMessage(generationInfo, 4))
}

const ANTIGRAVITY_MODEL_ALIASES: Record<string, string> = {
  'gemini 3.8 flash': 'gemini-3.8-flash',
  'gemini 3.7 flash': 'gemini-3.7-flash',
  'gemini 3.7 flash thinking': 'gemini-3.7-flash',
  'gemini 3.7 pro': 'gemini-3.7-pro',
  'gemini 3.7 pro thinking': 'gemini-3.7-pro',
  'gemini 3.6 flash': 'gemini-3.6-flash',
  'gemini 3 flash': 'gemini-3.6-flash',
  'gemini 3.6 pro': 'gemini-3.6-pro',
  'gemini 3 pro': 'gemini-3-pro',
  'gemini 3 pro thinking': 'gemini-3-pro',
  'gemini 2.5 flash': 'gemini-2.5-flash',
  'gemini 2.5 pro': 'gemini-2.5-pro',
  'gemini 2.0 flash': 'gemini-2.0-flash',
  'gemini 2 flash': 'gemini-2.0-flash',
  'gemini 2.0 pro': 'gemini-2.0-pro',
  'gemini 1.5 flash': 'gemini-1.5-flash',
  'gemini 1.5 pro': 'gemini-1.5-pro',
  'claude opus 4.6': 'claude-opus-4-6',
  'claude 4.6 opus': 'claude-opus-4-6',
  'claude sonnet 4.6': 'claude-sonnet-4-6',
  'claude 4.6 sonnet': 'claude-sonnet-4-6',
  'claude sonnet 4.5': 'claude-sonnet-4-5',
  'claude 3.7 sonnet': 'claude-3-7-sonnet',
  'claude 3.7 sonnet thinking': 'claude-3-7-sonnet',
  'claude 3.5 sonnet': 'claude-3-5-sonnet',
  'claude 3.5 haiku': 'claude-3-5-haiku',
  'claude 3 opus': 'claude-3-opus',
  'gpt-oss 120b': 'gpt-oss-120b-medium',
  'model_placeholder_m26': 'claude-opus-4-6',
  'model_placeholder_m35': 'claude-sonnet-4-6',
  'model_placeholder_m16': 'gemini-3.1-pro',
  'model_placeholder_m36': 'gemini-3.1-pro',
  'model_placeholder_m37': 'gemini-3.1-pro',
  'model_placeholder_m18': 'gemini-3-flash-preview',
  'model_placeholder_m47': 'gemini-3-flash-preview',
  'model_placeholder_m84': 'gemini-3-flash-preview',
  'model_placeholder_m20': 'gemini-3.5-flash-medium',
  'model_placeholder_m132': 'gemini-3.5-flash-high',
  'model_placeholder_m133': 'gemini-3.5-flash-high',
  'model_placeholder_m187': 'gemini-3.5-flash-extra-low',
  'model_openai_gpt_oss_120b_medium': 'gpt-oss-120b-medium',
  'gemini-pro-default': 'gemini-3.1-pro',
  'gemini-pro-agent': 'gemini-3.1-pro',
  'gemini-3-flash-agent': 'gemini-3.5-flash-high',
  'gemini-3-flash-agent-a': 'gemini-3.5-flash-high',
  'gemini-3-flash-agent-b': 'gemini-3.5-flash-high',
  'gemini-3-flash-a': 'gemini-3.5-flash-high',
  'gemini-3-flash-b': 'gemini-3.5-flash-high',
  'gemini-3-flash-c': 'gemini-3-flash-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3.5-flash-low': 'gemini-3.5-flash-medium',
  'gemini-3.1-pro-high': 'gemini-3.1-pro',
  'gemini-3.1-pro-low': 'gemini-3.1-pro',
  'gemini-3-pro-high': 'gemini-3-pro',
  'gemini-3-pro-low': 'gemini-3-pro',
}

function normalizeModel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const model = (value.includes('/') ? value.split('/').pop() : value)?.trim()
  if (!model) return undefined
  const key = model.toLowerCase()
  const base = key.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return ANTIGRAVITY_MODEL_ALIASES[key] ?? ANTIGRAVITY_MODEL_ALIASES[base] ?? model
}

function modelNameFromId(modelId: number): string {
  const known: Record<number, string> = {
    246: 'gemini-2.5-pro',
    312: 'gemini-2.5-flash',
    313: 'gemini-2.5-flash-thinking',
    329: 'gemini-2.5-flash-thinking',
    330: 'gemini-2.5-flash-lite',
    281: 'claude-4-sonnet',
    282: 'claude-4-sonnet',
    290: 'claude-4-opus',
    291: 'claude-4-opus',
    333: 'claude-4.5-sonnet',
    334: 'claude-4.5-sonnet',
    340: 'claude-4.5-haiku',
    341: 'claude-4.5-haiku',
    342: 'gpt-oss-120b-medium',
    1016: 'gemini-3.1-pro',
    1018: 'gemini-3-flash-preview',
    1020: 'gemini-3.5-flash-medium',
    1026: 'claude-opus-4-6',
    1035: 'claude-sonnet-4-6',
    1036: 'gemini-3.1-pro',
    1037: 'gemini-3.1-pro',
    1047: 'gemini-3-flash-preview',
    1084: 'gemini-3-flash-preview',
    1132: 'gemini-3.5-flash-high',
    1133: 'gemini-3.5-flash-high',
    1187: 'gemini-3.5-flash-extra-low',
  }
  return known[modelId] ?? `antigravity-model-${modelId}`
}

function parseModelUsage(fields: ProtoField[]): ModelUsage {
  const totalOutputTokens = firstVarint(fields, 3) ?? 0
  const thinkingTokens = firstVarint(fields, 9) ?? 0
  const visibleOutputTokens = firstVarint(fields, 10) ?? 0
  const normalizedTotalOutput = Math.max(totalOutputTokens, visibleOutputTokens + thinkingTokens)
  const responseId = firstString(fields, [11])
  const providerMessageId = firstString(fields, [12])
  const messageId = firstString(fields, [7])
  return {
    modelId: firstVarint(fields, 1) || undefined,
    inputTokens: firstVarint(fields, 2) ?? 0,
    totalOutputTokens: normalizedTotalOutput,
    cacheWriteTokens: firstVarint(fields, 4) ?? 0,
    cacheReadTokens: firstVarint(fields, 5) ?? 0,
    thinkingTokens,
    outputTokens: Math.max(visibleOutputTokens, normalizedTotalOutput - thinkingTokens),
    identities: [
      responseId ? `response:${responseId}` : undefined,
      providerMessageId ? `provider:${providerMessageId}` : undefined,
      messageId ? `message:${messageId}` : undefined,
    ].filter((value): value is string => Boolean(value)),
  }
}

function tokenBearing(usage: ModelUsage): boolean {
  return usage.inputTokens + usage.totalOutputTokens + usage.cacheWriteTokens + usage.cacheReadTokens > 0
}

function usageEvents(fields: ProtoField[], usageField: number, retryField: number, source: string, lineOffset: number, ts?: number): UsageEvent[] {
  const events: UsageEvent[] = []
  const usage = messages(fields, usageField)[0]
  if (usage) events.push({ usage: parseModelUsage(usage), ts, sourceKey: `${source}:usage`, lineOffset })
  for (const [index, retry] of messages(fields, retryField).entries()) {
    const retryUsage = messages(retry, 2)[0]
    if (retryUsage) events.push({ usage: parseModelUsage(retryUsage), ts, sourceKey: `${source}:retry:${index}`, lineOffset })
  }
  return events.filter((event) => tokenBearing(event.usage))
}

function parseGeneration(index: number, data: Buffer): GenerationMetadata {
  const metadata = readFields(data)
  const chatModel = firstMessage(metadata, 1)
  const modelId = firstVarint(chatModel, 3)
  const model = normalizeModel(firstString(chatModel, [19, 21, 22]))
    ?? (modelId ? modelNameFromId(modelId) : undefined)
  const ts = generationTimestamp(chatModel)
  return {
    index,
    model,
    stepIndices: repeatedVarints(metadata, 2),
    events: usageEvents(chatModel, 4, 17, `generation:${index}`, index, ts),
  }
}

function parseStep(index: number, data: Buffer): StepMetadata {
  const metadata = readFields(data)
  const modelInfo = firstMessage(metadata, 24)
  const modelId = firstVarint(modelInfo, 1)
  const model = normalizeModel(firstString(modelInfo, [12, 8]))
    ?? (modelId ? modelNameFromId(modelId) : undefined)
  const ts = timestampFromFields(firstMessage(metadata, 8))
    ?? timestampFromFields(firstMessage(metadata, 1))
  return {
    ts,
    events: usageEvents(metadata, 9, 28, `step:${index}`, index, ts).map((event) => ({ ...event, model })),
  }
}

function modelForEvent(event: UsageEvent, fallback?: string): string {
  return event.usage.modelId ? modelNameFromId(event.usage.modelId) : event.model ?? fallback ?? 'antigravity-unknown'
}

function mergeEvent(target: UsageEvent, duplicate: UsageEvent): void {
  target.usage.modelId ??= duplicate.usage.modelId
  target.usage.inputTokens = Math.max(target.usage.inputTokens, duplicate.usage.inputTokens)
  target.usage.totalOutputTokens = Math.max(target.usage.totalOutputTokens, duplicate.usage.totalOutputTokens)
  target.usage.cacheWriteTokens = Math.max(target.usage.cacheWriteTokens, duplicate.usage.cacheWriteTokens)
  target.usage.cacheReadTokens = Math.max(target.usage.cacheReadTokens, duplicate.usage.cacheReadTokens)
  target.usage.thinkingTokens = Math.max(target.usage.thinkingTokens, duplicate.usage.thinkingTokens)
  target.usage.outputTokens = Math.max(target.usage.outputTokens, duplicate.usage.outputTokens)
  target.usage.identities = [...new Set([...target.usage.identities, ...duplicate.usage.identities])]
  target.model ??= duplicate.model
  target.ts = target.ts == null ? duplicate.ts : duplicate.ts == null ? target.ts : Math.min(target.ts, duplicate.ts)
  if (duplicate.sourceKey < target.sourceKey) target.sourceKey = duplicate.sourceKey
  target.lineOffset = Math.min(target.lineOffset, duplicate.lineOffset)
}

function deduplicateEvents(events: UsageEvent[]): UsageEvent[] {
  const slots: Array<UsageEvent | undefined> = []
  const identitySlots = new Map<string, number>()
  for (const event of events) {
    const matches = [...new Set(event.usage.identities
      .map((identity) => identitySlots.get(identity))
      .filter((value): value is number => value != null))]
    const targetIndex = matches[0] ?? slots.length
    if (matches.length === 0) slots.push(event)
    else mergeEvent(slots[targetIndex]!, event)
    for (const duplicateIndex of matches.slice(1)) {
      if (slots[duplicateIndex]) {
        mergeEvent(slots[targetIndex]!, slots[duplicateIndex]!)
        slots[duplicateIndex] = undefined
      }
    }
    for (const identity of slots[targetIndex]!.usage.identities) identitySlots.set(identity, targetIndex)
  }
  return slots.filter((event): event is UsageEvent => event != null)
}

function hasTable(db: Database.Database, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(table) != null
}

function readTrajectoryTimestamp(db: Database.Database, errors: string[]): number | undefined {
  try {
    if (!hasTable(db, 'trajectory_metadata_blob')) return undefined
    const rows = db.prepare('SELECT data FROM trajectory_metadata_blob ORDER BY rowid').all() as Array<{ data: unknown }>
    let timestamp: number | undefined
    for (const [index, row] of rows.entries()) {
      try {
        if (!Buffer.isBuffer(row.data)) throw new Error('trajectory metadata is not a blob')
        const candidate = timestampFromFields(firstMessage(readFields(row.data), 2))
        timestamp ??= candidate
      } catch (error) {
        errors.push(`trajectory metadata ${index}: ${error instanceof Error ? error.message : error}`)
      }
    }
    return timestamp
  } catch (error) {
    errors.push(`trajectory metadata: ${error instanceof Error ? error.message : error}`)
    return undefined
  }
}

export function runParseAntigravity(db: Database.Database, options: AntigravityImportOptions): AntigravityImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, fallbackTs, startIndex, exchangeRate } = options
  const errors: string[] = []
  const firstIndex = Math.max(0, startIndex)
  let nextIndex = firstIndex

  if (!hasTable(db, 'gen_metadata')) {
    return { records: [], nextIndex, errors: ['conversation database does not contain gen_metadata table'] }
  }

  const trajectoryTs = readTrajectoryTimestamp(db, errors)
  const generations: GenerationMetadata[] = []
  const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx').all() as Array<{ idx: number; data: Buffer }>
  const latestGenerationIndex = Math.max(-1, ...rows.map((row) => Number(row.idx)).filter(Number.isFinite))
  for (const row of rows) {
    const index = Number(row.idx)
    try {
      if (!Buffer.isBuffer(row.data)) throw new Error('generation metadata is not a blob')
      generations.push(parseGeneration(index, row.data))
    } catch (error) {
      if (index >= firstIndex) {
        errors.push(`generation metadata ${index}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  const selected = generations.filter((generation) => generation.index >= firstIndex)
  let previousStep = Math.max(-1, ...generations
    .filter((generation) => generation.index < firstIndex)
    .flatMap((generation) => generation.stepIndices))
  const steps = new Map<number, StepMetadata>()
  if (hasTable(db, 'steps')) {
    const stepRows = db.prepare('SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL ORDER BY idx').all() as Array<{ idx: number; metadata: Buffer }>
    for (const row of stepRows) {
      const index = Number(row.idx)
      if (index <= previousStep || !Buffer.isBuffer(row.metadata)) continue
      try {
        steps.set(index, parseStep(index, row.metadata))
      } catch (error) {
        errors.push(`step metadata ${index}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  const events: UsageEvent[] = []
  let currentModel = generations
    .filter((generation) => generation.index < firstIndex)
    .map((generation) => generation.model)
    .filter((model): model is string => Boolean(model))
    .pop()
  const generationModel = [...generations].reverse().find((generation) => generation.model)?.model

  for (const generation of selected) {
    currentModel = generation.model ?? currentModel
    const lastStep = generation.stepIndices.length > 0 ? Math.max(...generation.stepIndices) : previousStep
    const linkedTs = generation.stepIndices.map((index) => steps.get(index)?.ts).find((ts) => ts != null)
    const rowEvents = [
      ...[...steps.entries()]
        .filter(([index]) => index > previousStep && index <= lastStep)
        .flatMap(([, step]) => step.events),
      ...generation.events.map((event) => ({ ...event, model: event.model ?? currentModel, ts: event.ts ?? linkedTs })),
    ]
    if (rowEvents.length === 0 && generation.index === latestGenerationIndex) break
    nextIndex = generation.index + 1
    previousStep = lastStep
    if (rowEvents.length === 0) continue
    for (const event of rowEvents) event.model ??= currentModel ?? generationModel
    events.push(...rowEvents)
  }

  const sessionId = basename(dbPath).replace(/\.db$/i, '') || 'unknown'
  const records = deduplicateEvents(events).map((event, index): StatsRecord => {
    const model = modelForEvent(event, generationModel)
    const provider = inferProvider(model)
    const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens } = event.usage
    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
    const hasPrice = resolvePrice(model) != null
    const identity = [...event.usage.identities].sort()[0] ?? event.sourceKey
    return {
      id: generateRecordId(deviceInstanceId, `antigravity:${sessionId}:${identity}`, 0),
      ts: event.ts ?? trajectoryTs ?? fallbackTs + index,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: event.lineOffset,
      tool: 'antigravity',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost: hasPrice ? calculateCost(model, tokenArgs, exchangeRate) : 0,
      costSource: hasPrice ? 'pricing' : 'unknown',
      sessionId,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    }
  })

  return { records, nextIndex, errors }
}
