import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { PriceEntry, StatsRecord, Tool } from '@aiusage/core'
import { calculateCostForPrice, generateRecordId, generateSessionKey, generateToolCallId } from '@aiusage/core'
import { createDatabase } from '../src/db/index.js'
import { insertRecord } from '../src/db/records.js'

type DemoDevice = {
  device: string
  deviceInstanceId: string
  platform: 'darwin' | 'linux' | 'win32'
  weight: number
}

type ToolProfile = {
  tool: Tool
  label: string
  provider: string
  models: Array<{ model: string; weight: number; provider?: string }>
  baseWeight: number
  inputBase: number
  outputBase: number
  cacheReadFactor: number
  cacheWriteFactor: number
  thinkingFactor: number
  toolCallCapable: boolean
}

type ProjectProfile = {
  name: string
  cwd: string
  weight: number
  intensity: number
}

const DEFAULT_OUT = join(tmpdir(), 'aiusage-demo', 'cache.db')
const DAYS = 32
const CURRENT_DEVICE: DemoDevice = {
  device: 'demo-mbp-14',
  deviceInstanceId: 'demo-mbp-14-local',
  platform: 'darwin',
  weight: 74,
}

const REMOTE_DEVICES: DemoDevice[] = [
  { device: 'linux-buildbox', deviceInstanceId: 'demo-linux-buildbox', platform: 'linux', weight: 17 },
  { device: 'DESKTOP-AI-LAB', deviceInstanceId: 'demo-windows-lab', platform: 'win32', weight: 9 },
]

const PROJECTS: ProjectProfile[] = [
  { name: 'aiusage', cwd: '/Users/tjh/Code/aiusage', weight: 28, intensity: 1.22 },
  { name: 'acme-billing', cwd: '/Users/tjh/Code/acme-platform/services/billing', weight: 20, intensity: 1.08 },
  { name: 'ops-dashboard', cwd: '/Users/tjh/Code/ops-dashboard', weight: 17, intensity: 0.96 },
  { name: 'vector-search', cwd: '/Users/tjh/Code/vector-search/app', weight: 14, intensity: 1.16 },
  { name: 'mobile-client', cwd: '/Users/tjh/Code/mobile-client', weight: 11, intensity: 0.82 },
  { name: 'docs-site', cwd: '/Users/tjh/Code/docs-site', weight: 10, intensity: 0.7 },
]

const TOOL_PROFILES: ToolProfile[] = [
  {
    tool: 'claude-code',
    label: 'Claude Code',
    provider: 'anthropic',
    models: [
      { model: 'claude-sonnet-4-6', weight: 72 },
      { model: 'claude-opus-4-1', weight: 16 },
      { model: 'claude-haiku-4-5', weight: 12 },
    ],
    baseWeight: 27,
    inputBase: 48_000,
    outputBase: 8_200,
    cacheReadFactor: 2.6,
    cacheWriteFactor: 0.48,
    thinkingFactor: 0.12,
    toolCallCapable: true,
  },
  {
    tool: 'codex',
    label: 'Codex',
    provider: 'openai',
    models: [
      { model: 'gpt-5', weight: 68 },
      { model: 'gpt-5-mini', weight: 22 },
      { model: 'gpt-4.1', weight: 10 },
    ],
    baseWeight: 21,
    inputBase: 42_000,
    outputBase: 7_600,
    cacheReadFactor: 1.9,
    cacheWriteFactor: 0.36,
    thinkingFactor: 0.32,
    toolCallCapable: true,
  },
  {
    tool: 'cursor',
    label: 'Cursor',
    provider: 'anthropic',
    models: [
      { model: 'claude-sonnet-4-5', weight: 62 },
      { model: 'gpt-4.1', weight: 28, provider: 'openai' },
      { model: 'gpt-4o', weight: 10, provider: 'openai' },
    ],
    baseWeight: 15,
    inputBase: 34_000,
    outputBase: 5_900,
    cacheReadFactor: 1.1,
    cacheWriteFactor: 0.22,
    thinkingFactor: 0.1,
    toolCallCapable: false,
  },
  {
    tool: 'opencode',
    label: 'OpenCode',
    provider: 'qwen',
    models: [
      { model: 'qwen3-coder', weight: 64 },
      { model: 'glm-4.6', weight: 24 },
      { model: 'kimi-k2', weight: 12 },
    ],
    baseWeight: 13,
    inputBase: 31_000,
    outputBase: 5_400,
    cacheReadFactor: 1.35,
    cacheWriteFactor: 0.24,
    thinkingFactor: 0.16,
    toolCallCapable: true,
  },
  {
    tool: 'qoder',
    label: 'Qoder',
    provider: 'qoder',
    models: [
      { model: 'qoder-ultimate', weight: 58 },
      { model: 'qoder-auto', weight: 42 },
    ],
    baseWeight: 10,
    inputBase: 38_000,
    outputBase: 4_700,
    cacheReadFactor: 1.45,
    cacheWriteFactor: 0.2,
    thinkingFactor: 0,
    toolCallCapable: false,
  },
  {
    tool: 'copilot',
    label: 'Copilot',
    provider: 'openai',
    models: [
      { model: 'gpt-4.1', weight: 70 },
      { model: 'gpt-4o', weight: 30 },
    ],
    baseWeight: 8,
    inputBase: 22_000,
    outputBase: 3_600,
    cacheReadFactor: 0.35,
    cacheWriteFactor: 0.1,
    thinkingFactor: 0,
    toolCallCapable: false,
  },
  {
    tool: 'kiro',
    label: 'Kiro',
    provider: 'anthropic',
    models: [
      { model: 'claude-sonnet-4-5', weight: 78 },
      { model: 'kiro-auto', weight: 22 },
    ],
    baseWeight: 6,
    inputBase: 26_000,
    outputBase: 4_200,
    cacheReadFactor: 0.8,
    cacheWriteFactor: 0.18,
    thinkingFactor: 0.08,
    toolCallCapable: false,
  },
]

const PRICE_TABLE: Record<string, PriceEntry> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-1': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0.25 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
  'qwen3-coder': { input: 0.4, output: 1.6, cacheRead: 0.08, cacheWrite: 0.4 },
  'glm-4.6': { input: 0.6, output: 2.2, cacheRead: 0.12, cacheWrite: 0.6 },
  'kimi-k2': { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0.6 },
  'qoder-ultimate': { input: 2, output: 8, cacheRead: 0.4, cacheWrite: 2 },
  'qoder-auto': { input: 1.1, output: 4.4, cacheRead: 0.22, cacheWrite: 1.1 },
  'kiro-auto': { input: 1.5, output: 6, cacheRead: 0.3, cacheWrite: 1.5 },
}

const BUILTIN_TOOL_CALLS = [
  'Read',
  'Edit',
  'MultiEdit',
  'Write',
  'Bash',
  'Grep',
  'Glob',
  'LS',
  'TodoWrite',
  'WebFetch',
]

const MCP_TOOL_CALLS = [
  'mcp__github__search_issues',
  'mcp__github__get_pull_request',
  'mcp__linear__list_issues',
  'mcp__sentry__find_errors',
  'mcp__postgres__query',
  'mcp__figma__inspect_frame',
]

const SKILL_TOOL_CALLS = [
  'skill__repo_audit',
  'skill__frontend_polish',
  'skill__release_notes',
  'Skill',
]

function parseArgs() {
  const args = process.argv.slice(2)
  let out = DEFAULT_OUT
  let anchor = todayYmd()
  let seed = 'public-demo'

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--out') out = args[++i] ?? out
    else if (arg === '--anchor') anchor = args[++i] ?? anchor
    else if (arg === '--seed') seed = args[++i] ?? seed
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx packages/cli/scripts/generate-demo-db.ts [--out path] [--anchor YYYY-MM-DD] [--seed text]')
      process.exit(0)
    }
  }

  return { out: resolve(out), anchor, seed }
}

function todayYmd(): string {
  return formatYmd(new Date())
}

function formatYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseYmd(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (formatYmd(date) !== value) throw new Error(`Invalid date: ${value}.`)
  return date
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function between(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng()
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step)
}

function weightedPick<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let cursor = rng() * total
  for (const item of items) {
    cursor -= item.weight
    if (cursor <= 0) return item
  }
  return items[items.length - 1]
}

function chooseDevice(rng: () => number): DemoDevice {
  return weightedPick([CURRENT_DEVICE, ...REMOTE_DEVICES], rng)
}

function dailyIntensity(dayIndex: number, date: Date): number {
  const day = date.getDay()
  const weekdayFactor = day === 0 ? 0.42 : day === 6 ? 0.58 : 1
  const wave = 0.92 + Math.sin(dayIndex * 0.62) * 0.18 + Math.sin(dayIndex * 0.21 + 1.4) * 0.12
  const adoptionRamp = 0.82 + (dayIndex / (DAYS - 1)) * 0.34
  const releaseSpike = dayIndex === 9 ? 1.58 : dayIndex === 18 ? 1.34 : dayIndex === 26 ? 1.48 : 1
  const todayPartial = dayIndex === DAYS - 1 ? 0.68 : 1
  return weekdayFactor * wave * adoptionRamp * releaseSpike * todayPartial
}

function toolWeights(dayIndex: number): Array<ToolProfile & { weight: number }> {
  return TOOL_PROFILES.map(profile => {
    let weight = profile.baseWeight
    if (dayIndex >= 18 && profile.tool === 'codex') weight *= 1.22
    if ((dayIndex === 9 || dayIndex === 26) && (profile.tool === 'claude-code' || profile.tool === 'codex')) weight *= 1.3
    if (dayIndex % 7 === 3 && profile.tool === 'opencode') weight *= 1.25
    return { ...profile, weight }
  })
}

function sourceFileFor(tool: Tool, project: ProjectProfile, sessionId: string, date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const encodedProject = project.cwd.replace(/^\/Users\/tjh\/Code\//, '').replaceAll('/', '-')
  if (tool === 'claude-code') return `/Users/tjh/.claude/projects/${encodedProject}/${sessionId}.jsonl`
  if (tool === 'codex') return `/Users/tjh/.codex/sessions/${y}/${m}/${d}/${sessionId}.jsonl`
  if (tool === 'cursor') return `/Users/tjh/Library/Application Support/Cursor/User/workspaceStorage/${project.name}/${sessionId}.jsonl`
  if (tool === 'qoder') return `/Users/tjh/.qoder/projects/${project.name}/${sessionId}.jsonl`
  return `/Users/tjh/.${tool}/sessions/${project.name}/${y}-${m}-${d}-${sessionId}.jsonl`
}

function insertSyncedRecord(db: Database.Database, record: StatsRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO synced_records (
      id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source,
      session_key, device, device_instance_id, platform, updated_at, source_file, cwd
    ) VALUES (
      @id, @ts, @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens, @cost, @costSource,
      @sessionKey, @device, @deviceInstanceId, @platform, @updatedAt, @sourceFile, @cwd
    )
  `).run({
    id: record.id,
    ts: record.ts,
    tool: record.tool,
    model: record.model,
    provider: record.provider,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    thinkingTokens: record.thinkingTokens,
    cost: record.cost,
    costSource: record.costSource,
    sessionKey: generateSessionKey(record.device, record.sessionId),
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    platform: record.platform ?? '',
    updatedAt: record.updatedAt,
    sourceFile: record.sourceFile,
    cwd: record.cwd ?? '',
  })
}

function insertToolCalls(
  db: Database.Database,
  recordId: string,
  recordTs: number,
  profile: ToolProfile,
  project: ProjectProfile,
  rng: () => number,
): number {
  if (!profile.toolCallCapable) return 0

  const count = Math.max(0, Math.round(between(rng, 1, 5.7)))
  const insert = db.prepare(`
    INSERT OR REPLACE INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES (@id, @recordId, @tool, @name, @ts, @callIndex)
  `)

  for (let i = 0; i < count; i += 1) {
    let pool = BUILTIN_TOOL_CALLS
    if (rng() < 0.24 && ['aiusage', 'ops-dashboard', 'acme-billing'].includes(project.name)) pool = MCP_TOOL_CALLS
    if (rng() < 0.08) pool = SKILL_TOOL_CALLS
    const name = pool[Math.floor(rng() * pool.length)]
    const ts = recordTs + i * Math.round(between(rng, 280, 1800))
    insert.run({
      id: generateToolCallId(recordId, name, ts, i),
      recordId,
      tool: profile.label,
      name,
      ts,
      callIndex: i,
    })
  }

  return count
}

function insertPriceRegistry(db: Database.Database, now: number): void {
  const insertPrice = db.prepare(`
    INSERT OR REPLACE INTO model_prices (
      model_key, provider, input, output, cache_read, cache_write, currency,
      source, source_model_id, source_url, origin, status, last_synced_at, created_at, updated_at
    ) VALUES (
      @modelKey, @provider, @input, @output, @cacheRead, @cacheWrite, 'USD',
      'demo', @modelKey, 'https://aiusage.jtanx.com/demo-pricing',
      'builtin', 'active', @now, @now, @now
    )
  `)
  const insertBaseline = db.prepare(`
    INSERT OR REPLACE INTO model_price_sync_baselines (
      model_key, provider, input, output, cache_read, cache_write, currency,
      source, source_model_id, source_url, last_synced_at, updated_at
    ) VALUES (
      @modelKey, @provider, @input, @output, @cacheRead, @cacheWrite, 'USD',
      'demo', @modelKey, 'https://aiusage.jtanx.com/demo-pricing', @now, @now
    )
  `)

  for (const profile of TOOL_PROFILES) {
    for (const model of profile.models) {
      const price = PRICE_TABLE[model.model]
      if (!price) continue
      const row = {
        modelKey: model.model,
        provider: model.provider ?? profile.provider,
        input: price.input,
        output: price.output,
        cacheRead: price.cacheRead ?? null,
        cacheWrite: price.cacheWrite ?? null,
        now,
      }
      insertPrice.run(row)
      insertBaseline.run(row)
    }
  }
}

function generate(out: string, anchorYmd: string, seed: string) {
  const anchor = parseYmd(anchorYmd)
  mkdirSync(dirname(out), { recursive: true })
  rmSync(out, { force: true })
  rmSync(`${out}-wal`, { force: true })
  rmSync(`${out}-shm`, { force: true })

  const db = createDatabase(out)
  const rng = mulberry32(hashSeed(`${seed}:${anchorYmd}`))
  const now = Date.now()
  let recordCount = 0
  let sessionCount = 0
  let toolCallCount = 0

  const tx = db.transaction(() => {
    insertPriceRegistry(db, now)

    for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
      const date = new Date(anchor)
      date.setDate(anchor.getDate() - (DAYS - 1 - dayIndex))
      const ymd = formatYmd(date)
      const intensity = dailyIntensity(dayIndex, date)
      const sessionsToday = Math.max(5, Math.round(between(rng, 9, 18) * intensity + between(rng, 2, 6)))

      for (let sessionIndex = 0; sessionIndex < sessionsToday; sessionIndex += 1) {
        sessionCount += 1
        const profile = weightedPick(toolWeights(dayIndex), rng)
        const modelChoice = weightedPick(profile.models, rng)
        const model = modelChoice.model
        const provider = modelChoice.provider ?? profile.provider
        const project = weightedPick(PROJECTS, rng)
        const device = chooseDevice(rng)
        const hour = 8 + Math.floor(rng() * 12)
        const minute = Math.floor(rng() * 55)
        const startTs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, Math.floor(rng() * 50)).getTime()
        const sessionId = `${profile.tool}-${ymd.replaceAll('-', '')}-${String(sessionIndex + 1).padStart(2, '0')}-${Math.floor(rng() * 0xffff).toString(16).padStart(4, '0')}`
        const sourceFile = sourceFileFor(profile.tool, project, sessionId, date)
        const recordTotal = Math.max(2, Math.round(between(rng, 2.2, 7.8) * (intensity > 1.2 ? 1.15 : 1)))
        const sessionScale = project.intensity * intensity * between(rng, 0.72, 1.38)

        for (let recordIndex = 0; recordIndex < recordTotal; recordIndex += 1) {
          const ts = startTs + recordIndex * Math.round(between(rng, 32_000, 310_000))
          const promptScale = recordIndex === 0 ? between(rng, 1.0, 1.5) : between(rng, 0.72, 1.18)
          const inputTokens = roundTo(profile.inputBase * sessionScale * promptScale * between(rng, 0.78, 1.28), 100)
          const outputTokens = roundTo(profile.outputBase * sessionScale * between(rng, 0.58, 1.55), 100)
          const cacheReadTokens = recordIndex === 0
            ? roundTo(inputTokens * between(rng, 0.04, 0.24), 100)
            : roundTo(inputTokens * profile.cacheReadFactor * between(rng, 0.72, 1.52), 100)
          const cacheWriteTokens = recordIndex === 0 || rng() < 0.18
            ? roundTo(inputTokens * profile.cacheWriteFactor * between(rng, 0.4, 1.22), 100)
            : 0
          const thinkingTokens = profile.thinkingFactor > 0
            ? roundTo(outputTokens * profile.thinkingFactor * between(rng, 0.65, 1.45), 100)
            : 0
          const price = PRICE_TABLE[model] ?? { input: 0, output: 0 }
          const cost = calculateCostForPrice(price, {
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            thinkingTokens,
          })
          const lineOffset = sessionIndex * 100_000 + recordIndex * 1200
          const id = generateRecordId(device.deviceInstanceId, sourceFile, lineOffset)
          const record: StatsRecord = {
            id,
            ts,
            ingestedAt: now,
            updatedAt: now,
            lineOffset,
            tool: profile.tool,
            model,
            provider,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            thinkingTokens,
            cost,
            costSource: 'pricing',
            sessionId,
            sourceFile,
            cwd: project.cwd,
            device: device.device,
            deviceInstanceId: device.deviceInstanceId,
            platform: device.platform,
          }

          if (device.deviceInstanceId === CURRENT_DEVICE.deviceInstanceId) {
            insertRecord(db, record)
            toolCallCount += insertToolCalls(db, id, ts, profile, project, rng)
          } else {
            insertSyncedRecord(db, record)
          }
          recordCount += 1
        }
      }
    }
  })

  tx()

  const totals = db.prepare(`
    SELECT
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
      SUM(cost) AS cost
    FROM (
      SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM records
      UNION ALL
      SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM synced_records
    )
  `).get() as { tokens: number; cost: number }

  db.close()
  console.log(JSON.stringify({
    out,
    anchor: anchorYmd,
    days: DAYS,
    sessions: sessionCount,
    records: recordCount,
    toolCalls: toolCallCount,
    totalTokens: totals.tokens,
    totalCost: Number(totals.cost.toFixed(4)),
    currentDeviceInstanceId: CURRENT_DEVICE.deviceInstanceId,
  }, null, 2))
}

const options = parseArgs()
generate(options.out, options.anchor, options.seed)
