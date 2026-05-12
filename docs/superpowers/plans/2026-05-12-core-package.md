# Core Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@aiusage/core` package with types, parsers, aggregator, pricing, and provider mapping.

**Architecture:** Pure logic layer with no IO side effects. Each parser is tool-specific, the aggregator normalizes parsed data into StatsRecord and ToolCallRecord. Pricing and provider are shared utilities.

**Tech Stack:** TypeScript, Vitest, tsup

---

## File Structure

```
packages/core/
├── src/
│   ├── types.ts                    # All interfaces and types
│   ├── provider.ts                 # MODEL_PROVIDER_MAP + inferProvider
│   ├── pricing.ts                  # PRICE_TABLE + calculateCost
│   ├── record-id.ts                # generateRecordId + generateSyncRecordId
│   ├── parsers/
│   │   ├── index.ts                # Parser interface + registry
│   │   ├── claude-code.ts          # Claude Code parser
│   │   ├── codex.ts                # Codex parser
│   │   └── openclaw.ts             # OpenClaw parser
│   └── aggregator.ts               # Parse orchestration
├── tests/
│   ├── fixtures/
│   │   ├── claude-code/
│   │   │   └── sample.jsonl
│   │   ├── codex/
│   │   │   └── sample.jsonl
│   │   └── openclaw/
│   │       └── sample.jsonl
│   ├── provider.test.ts
│   ├── pricing.test.ts
│   ├── record-id.test.ts
│   ├── claude-code.test.ts
│   ├── codex.test.ts
│   ├── openclaw.test.ts
│   └── aggregator.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "aiusage",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 5: Create packages/core/package.json**

```json
{
  "name": "@aiusage/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 6: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create packages/core/tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
```

- [ ] **Step 8: Create packages/core/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 9: Create placeholder src/index.ts**

```typescript
export {}
```

- [ ] **Step 10: Run pnpm install and verify**

Run: `pnpm install`
Expected: Dependencies installed successfully

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json .gitignore packages/core/
git commit -m "chore: scaffold monorepo with core package"
```

---

## Task 2: Core Types

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create types.ts with all interfaces**

```typescript
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
```

- [ ] **Step 2: Export types from index.ts**

```typescript
export * from './types.js'
```

- [ ] **Step 3: Run TypeScript compilation to verify types**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): add core types and interfaces"
```

---

## Task 3: Provider Mapping

**Files:**
- Create: `packages/core/src/provider.ts`
- Create: `packages/core/tests/provider.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { inferProvider, MODEL_PROVIDER_MAP } from '../src/provider.js'

describe('MODEL_PROVIDER_MAP', () => {
  it('contains expected prefixes', () => {
    const prefixes = MODEL_PROVIDER_MAP.map(([prefix]) => prefix)
    expect(prefixes).toContain('claude-')
    expect(prefixes).toContain('gpt-')
    expect(prefixes).toContain('o1-')
    expect(prefixes).toContain('o3-')
    expect(prefixes).toContain('o4-')
    expect(prefixes).toContain('deepseek-')
    expect(prefixes).toContain('gemini-')
  })
})

describe('inferProvider', () => {
  it('returns anthropic for claude- models', () => {
    expect(inferProvider('claude-opus-4-6')).toBe('anthropic')
    expect(inferProvider('claude-sonnet-4-6')).toBe('anthropic')
    expect(inferProvider('claude-haiku-4-5')).toBe('anthropic')
  })

  it('returns openai for gpt- models', () => {
    expect(inferProvider('gpt-4o')).toBe('openai')
    expect(inferProvider('gpt-4.1')).toBe('openai')
  })

  it('returns openai for o1-, o3-, o4- models', () => {
    expect(inferProvider('o1-preview')).toBe('openai')
    expect(inferProvider('o3-mini')).toBe('openai')
    expect(inferProvider('o4-mini')).toBe('openai')
  })

  it('returns deepseek for deepseek- models', () => {
    expect(inferProvider('deepseek-v3')).toBe('deepseek')
    expect(inferProvider('deepseek-r1')).toBe('deepseek')
  })

  it('returns google for gemini- models', () => {
    expect(inferProvider('gemini-2.0-flash')).toBe('google')
    expect(inferProvider('gemini-pro')).toBe('google')
  })

  it('returns unknown for unrecognized models', () => {
    expect(inferProvider('unknown-model')).toBe('unknown')
    expect(inferProvider('custom-model-v1')).toBe('unknown')
    expect(inferProvider('')).toBe('unknown')
  })

  it('handles case-sensitive matching', () => {
    expect(inferProvider('Claude-Opus-4-6')).toBe('unknown')
    expect(inferProvider('GPT-4o')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/provider.test.ts`
Expected: FAIL with "Cannot find module '../src/provider.js'"

- [ ] **Step 3: Write implementation**

```typescript
export const MODEL_PROVIDER_MAP: [string, string][] = [
  ['claude-',    'anthropic'],
  ['gpt-',      'openai'],
  ['o1-',       'openai'],
  ['o3-',       'openai'],
  ['o4-',       'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-',   'google'],
]

export function inferProvider(model: string): string {
  for (const [prefix, provider] of MODEL_PROVIDER_MAP) {
    if (model.startsWith(prefix)) return provider
  }
  return 'unknown'
}
```

- [ ] **Step 4: Export from index.ts**

```typescript
export * from './types.js'
export * from './provider.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/provider.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/provider.ts packages/core/tests/provider.test.ts packages/core/src/index.ts
git commit -m "feat(core): add provider mapping with tests"
```

---

## Task 4: Pricing

**Files:**
- Create: `packages/core/src/pricing.ts`
- Create: `packages/core/tests/pricing.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { PRICE_TABLE, calculateCost } from '../src/pricing.js'

describe('PRICE_TABLE', () => {
  it('contains expected models', () => {
    expect(PRICE_TABLE).toHaveProperty('claude-opus-4-6')
    expect(PRICE_TABLE).toHaveProperty('claude-sonnet-4-6')
    expect(PRICE_TABLE).toHaveProperty('claude-haiku-4-5')
    expect(PRICE_TABLE).toHaveProperty('gpt-4.1')
    expect(PRICE_TABLE).toHaveProperty('gpt-4o')
    expect(PRICE_TABLE).toHaveProperty('o4-mini')
  })

  it('has correct price structure', () => {
    const model = PRICE_TABLE['claude-sonnet-4-6']
    expect(model).toHaveProperty('input')
    expect(model).toHaveProperty('output')
    expect(model).toHaveProperty('cacheRead')
    expect(model).toHaveProperty('cacheWrite')
    expect(model).toHaveProperty('thinking')
  })
})

describe('calculateCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    // Input: 1000 tokens, Output: 500 tokens
    // Expected: (1000/1M * 3) + (500/1M * 15) = 0.000003 + 0.0000075 = 0.0000105
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBeCloseTo(0.0000105, 10)
  })

  it('calculates cost with cache read tokens', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    // (1000/1M * 3) + (500/1M * 15) + (2000/1M * 0.3)
    expect(cost).toBeCloseTo(0.0000105 + 0.0000006, 10)
  })

  it('calculates cost with thinking tokens', () => {
    const cost = calculateCost('claude-opus-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 1000,
    })
    // (1000/1M * 15) + (500/1M * 75) + (1000/1M * 75)
    expect(cost).toBeCloseTo(0.000015 + 0.0000375 + 0.000075, 10)
  })

  it('returns 0 for unknown model', () => {
    const cost = calculateCost('unknown-model', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    expect(cost).toBe(0)
  })

  it('handles model without cache/ thinking prices', () => {
    const cost = calculateCost('gpt-4o', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
    // (1000/1M * 2.5) + (500/1M * 10)
    expect(cost).toBeCloseTo(0.0000025 + 0.000005, 10)
  })

  it('uses output price for thinking when thinking price not set', () => {
    // gpt-4o doesn't have thinking price, should use output price
    const cost = calculateCost('gpt-4o', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 1000,
    })
    // (1000/1M * 10) - uses output price for thinking
    expect(cost).toBeCloseTo(0.00001, 10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/pricing.test.ts`
Expected: FAIL with "Cannot find module '../src/pricing.js'"

- [ ] **Step 3: Write implementation**

```typescript
export interface PriceEntry {
  input: number        // USD per 1M tokens
  output: number       // USD per 1M tokens
  cacheRead?: number   // USD per 1M tokens
  cacheWrite?: number  // USD per 1M tokens
  thinking?: number    // USD per 1M tokens
}

export const PRICE_TABLE: Record<string, PriceEntry> = {
  'claude-opus-4-6':    { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 3.75, thinking: 75 },
  'claude-sonnet-4-6':  { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 0.375, thinking: 15 },
  'claude-haiku-4-5':   { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 0.1, thinking: 4 },
  'gpt-4.1':            { input: 2,    output: 8 },
  'gpt-4o':             { input: 2.5,  output: 10 },
  'o4-mini':            { input: 1.1,  output: 4.4 },
}

export function calculateCost(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    thinkingTokens: number
  }
): number {
  const price = PRICE_TABLE[model]
  if (!price) return 0

  const inputCost = (tokens.inputTokens / 1_000_000) * price.input
  const outputCost = (tokens.outputTokens / 1_000_000) * price.output
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * (price.cacheRead ?? 0)
  const cacheWriteCost = (tokens.cacheWriteTokens / 1_000_000) * (price.cacheWrite ?? 0)
  const thinkingPrice = price.thinking ?? price.output  // Fallback to output price
  const thinkingCost = (tokens.thinkingTokens / 1_000_000) * thinkingPrice

  return inputCost + outputCost + cacheReadCost + cacheWriteCost + thinkingCost
}
```

- [ ] **Step 4: Export from index.ts**

```typescript
export * from './types.js'
export * from './provider.js'
export * from './pricing.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/pricing.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pricing.ts packages/core/tests/pricing.test.ts packages/core/src/index.ts
git commit -m "feat(core): add pricing table and cost calculation"
```

---

## Task 5: Record ID Generation

**Files:**
- Create: `packages/core/src/record-id.ts`
- Create: `packages/core/tests/record-id.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { generateRecordId, generateSyncRecordId, generateToolCallId, generateOrphanToolCallId, generateSessionKey } from '../src/record-id.js'

describe('generateRecordId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateRecordId('/path/to/file.jsonl', 12345)
    const id2 = generateRecordId('/path/to/file.jsonl', 12345)
    expect(id1).toBe(id2)
  })

  it('generates different id for different file paths', () => {
    const id1 = generateRecordId('/path/to/file1.jsonl', 12345)
    const id2 = generateRecordId('/path/to/file2.jsonl', 12345)
    expect(id1).not.toBe(id2)
  })

  it('generates different id for different offsets', () => {
    const id1 = generateRecordId('/path/to/file.jsonl', 12345)
    const id2 = generateRecordId('/path/to/file.jsonl', 67890)
    expect(id1).not.toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateRecordId('/path/to/file.jsonl', 12345)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateSyncRecordId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(id1).toBe(id2)
  })

  it('generates different id for different device instances', () => {
    const id1 = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateSyncRecordId('device-456', '/path/to/file.jsonl', 12345)
    expect(id1).not.toBe(id2)
  })

  it('generates different id from record id', () => {
    const recordId = generateRecordId('/path/to/file.jsonl', 12345)
    const syncId = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(recordId).not.toBe(syncId)
  })

  it('returns 16 hex characters', () => {
    const id = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateToolCallId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    expect(id1).toBe(id2)
  })

  it('generates different id for different records', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-456', 'Read', 1234567890, 0)
    expect(id1).not.toBe(id2)
  })

  it('generates different id for different tool names', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-123', 'Bash', 1234567890, 0)
    expect(id1).not.toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateToolCallId('record-123', 'Read', 1234567890, 0)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateOrphanToolCallId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    const id2 = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    expect(id1).toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateSessionKey', () => {
  it('generates consistent key for same input', () => {
    const key1 = generateSessionKey('device-123', 'session-abc')
    const key2 = generateSessionKey('device-123', 'session-abc')
    expect(key1).toBe(key2)
  })

  it('generates different key for different devices', () => {
    const key1 = generateSessionKey('device-123', 'session-abc')
    const key2 = generateSessionKey('device-456', 'session-abc')
    expect(key1).not.toBe(key2)
  })

  it('returns 24 hex characters', () => {
    const key = generateSessionKey('device-123', 'session-abc')
    expect(key).toHaveLength(24)
    expect(key).toMatch(/^[0-9a-f]{24}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/record-id.test.ts`
Expected: FAIL with "Cannot find module '../src/record-id.js'"

- [ ] **Step 3: Write implementation**

```typescript
import { createHash } from 'node:crypto'
import type { Tool } from './types.js'

export function generateRecordId(sourceFile: string, lineOffset: number): string {
  const hash = createHash('sha256')
    .update(sourceFile + lineOffset)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateSyncRecordId(
  deviceInstanceId: string,
  sourceFile: string,
  lineOffset: number
): string {
  const hash = createHash('sha256')
    .update(deviceInstanceId + sourceFile + lineOffset)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateToolCallId(
  recordId: string,
  name: string,
  ts: number,
  callIndex: number
): string {
  const hash = createHash('sha256')
    .update(recordId + name + ts + callIndex)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateOrphanToolCallId(
  tool: Tool,
  name: string,
  ts: number,
  callIndex: number
): string {
  const hash = createHash('sha256')
    .update(tool + ':' + name + ':' + ts + ':' + callIndex)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateSessionKey(device: string, sessionId: string): string {
  const hash = createHash('sha256')
    .update(device + sessionId)
    .digest('hex')
  return hash.slice(0, 24)
}
```

- [ ] **Step 4: Export from index.ts**

```typescript
export * from './types.js'
export * from './provider.js'
export * from './pricing.js'
export * from './record-id.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/record-id.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/record-id.ts packages/core/tests/record-id.test.ts packages/core/src/index.ts
git commit -m "feat(core): add record ID generation functions"
```

---

## Task 6: Parser Interface

**Files:**
- Create: `packages/core/src/parsers/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create parser interface**

```typescript
import type { Tool, StatsRecord, ToolCallRecord, ParsedLine, ParseContext } from '../types.js'

export interface ParseResult {
  record: StatsRecord
  toolCalls: ToolCallRecord[]
}

export interface Parser {
  tool: Tool
  parseLine(line: string, context: ParseContext): ParseResult | null
  finalize?(): ParseResult[]           // For orphan tool calls (Codex)
}

export { ParsedLine, ParseContext }
```

- [ ] **Step 2: Export from index.ts**

```typescript
export * from './types.js'
export * from './provider.js'
export * from './pricing.js'
export * from './record-id.js'
export * from './parsers/index.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/parsers/index.ts packages/core/src/index.ts
git commit -m "feat(core): add parser interface"
```

---

## Task 7: Claude Code Parser

**Files:**
- Create: `packages/core/src/parsers/claude-code.ts`
- Create: `packages/core/tests/fixtures/claude-code/sample.jsonl`
- Create: `packages/core/tests/claude-code.test.ts`

- [ ] **Step 1: Create fixture file**

```jsonl
{"type":"user","message":{"role":"user","content":"hello"},"timestamp":1776738085346}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello!"},{"type":"tool_use","id":"tu_1","name":"Read","input":{"file_path":"/test/file.ts"}}],"model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":200,"cache_read_input_tokens":0}},"timestamp":1776738085400}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done"}],"model":"claude-sonnet-4-6","usage":{"input_tokens":150,"output_tokens":30,"cache_creation_input_tokens":0,"cache_read_input_tokens":100}},"timestamp":1776738085500}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_2","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","id":"tu_3","name":"Edit","input":{"file_path":"/test/file.ts"}}],"model":"unknown","usage":{"input_tokens":50,"output_tokens":20}},"timestamp":1776738085600}
```

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeCodeParser } from '../src/parsers/claude-code.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/claude-code/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('ClaudeCodeParser', () => {
  const parser = new ClaudeCodeParser()
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'abc123',
    tool: 'claude-code',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('skips lines without message.usage', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).toBeNull()
  })

  it('parses assistant message with tool_use', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.inputTokens).toBe(100)
    expect(result!.record.outputTokens).toBe(50)
    expect(result!.record.cacheWriteTokens).toBe(200)
    expect(result!.record.cacheReadTokens).toBe(0)
    expect(result!.record.thinkingTokens).toBe(0)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
  })

  it('parses assistant message without tool_use', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.cacheWriteTokens).toBe(0)
    expect(result!.record.cacheReadTokens).toBe(100)
    expect(result!.toolCalls).toHaveLength(0)
  })

  it('parses message with unknown model', () => {
    const result = parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + 3 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('unknown')
    expect(result!.record.costSource).toBe('unknown')
  })

  it('parses multiple tool calls in correct order', () => {
    const result = parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + 3 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Bash')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Edit')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('uses message.timestamp as tool call timestamp', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result!.toolCalls[0].ts).toBe(1776738085400)
  })

  it('generates consistent record IDs', () => {
    const result1 = parser.parseLine(lines[1], { ...baseContext, lineOffset: 100 })
    const result2 = parser.parseLine(lines[1], { ...baseContext, lineOffset: 100 })
    expect(result1!.record.id).toBe(result2!.record.id)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/claude-code.test.ts`
Expected: FAIL with "Cannot find module '../src/parsers/claude-code.js'"

- [ ] **Step 4: Write implementation**

```typescript
import type { Parser, ParseResult, ParseContext } from './index.js'
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
    }

    // Extract tool calls from message.content
    const toolCalls: ToolCallRecord[] = []
    if (Array.isArray(parsed.message.content)) {
      let callIndex = 0
      for (const block of parsed.message.content) {
        if (block.type === 'tool_use') {
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/claude-code.test.ts`
Expected: PASS

- [ ] **Step 6: Export parser from parsers/index.ts**

```typescript
export type { ParseResult, Parser, ParsedLine, ParseContext } from '../types.js'
export { ClaudeCodeParser } from './claude-code.js'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parsers/claude-code.ts packages/core/tests/fixtures/claude-code/ packages/core/tests/claude-code.test.ts packages/core/src/parsers/index.ts
git commit -m "feat(core): add Claude Code parser with tests"
```

---

## Task 8: Codex Parser

**Files:**
- Create: `packages/core/src/parsers/codex.ts`
- Create: `packages/core/tests/fixtures/codex/sample.jsonl`
- Create: `packages/core/tests/codex.test.ts`

- [ ] **Step 1: Create fixture file**

```jsonl
{"event_msg":{"type":"session","session":{"model":"gpt-4o"},"timestamp":1776738085300}}
{"event_msg":{"type":"event","payload":{"type":"function_call","function":{"name":"Read"},"timestamp":1776738085350},"timestamp":1776738085350}}
{"event_msg":{"type":"event","payload":{"type":"token_count","last_token_usage":{"input_tokens":100,"output_tokens":50,"cached_input_tokens":0,"reasoning_output_tokens":20},"model":"gpt-4o"},"timestamp":1776738085400}}
{"event_msg":{"type":"event","payload":{"type":"function_call","function":{"name":"Bash"},"timestamp":1776738085450},"timestamp":1776738085450}}
{"event_msg":{"type":"event","payload":{"type":"token_count","last_token_usage":{"input_tokens":200,"output_tokens":80,"cached_input_tokens":50,"reasoning_output_tokens":0},"model":"gpt-4o"},"timestamp":1776738085500}}
{"event_msg":{"type":"event","payload":{"type":"function_call","function":{"name":"Edit"},"timestamp":1776738085550},"timestamp":1776738085550}}
```

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CodexParser } from '../src/parsers/codex.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/codex/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('CodexParser', () => {
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'rollout-abc123',
    tool: 'codex',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('skips session init line', () => {
    const parser = new CodexParser()
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).toBeNull()
  })

  it('skips function_call lines (stored as pending)', () => {
    const parser = new CodexParser()
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).toBeNull()
  })

  it('parses token_count line and associates pending tool calls', () => {
    const parser = new CodexParser()
    // Parse function_call first
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    // Parse token_count
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('gpt-4o')
    expect(result!.record.inputTokens).toBe(100)
    expect(result!.record.outputTokens).toBe(50)
    expect(result!.record.cacheReadTokens).toBe(0)
    expect(result!.record.thinkingTokens).toBe(20)
    expect(result!.record.cacheWriteTokens).toBe(0)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].recordId).toBe(result!.record.id)
  })

  it('associates multiple tool calls with one token_count', () => {
    const parser = new CodexParser()
    // Parse two function_calls
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    // Parse token_count
    const result = parser.parseLine(lines[4], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + lines[3].length + 4 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Bash')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('handles orphan tool calls on finalize', () => {
    const parser = new CodexParser()
    // Parse function_call that won't be associated
    parser.parseLine(lines[5], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + lines[3].length + lines[4].length + 5 })
    const results = parser.finalize()
    expect(results).toHaveLength(1)
    expect(results[0].record).toBeNull()
    expect(results[0].toolCalls).toHaveLength(1)
    expect(results[0].toolCalls[0].name).toBe('Edit')
    expect(results[0].toolCalls[0].recordId).toBeNull()
  })

  it('uses event_msg.timestamp for tool calls', () => {
    const parser = new CodexParser()
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result!.toolCalls[0].ts).toBe(1776738085350)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/codex.test.ts`
Expected: FAIL with "Cannot find module '../src/parsers/codex.js'"

- [ ] **Step 4: Write implementation**

```typescript
import type { Parser, ParseResult, ParseContext } from './index.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId, generateOrphanToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

interface PendingToolCall {
  name: string
  ts: number
}

export class CodexParser implements Parser {
  readonly tool: Tool = 'codex'
  private pendingToolCalls: PendingToolCall[] = []

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    const payload = parsed.event_msg?.payload
    if (!payload) return null

    // Skip non-token_count/function_call lines
    if (payload.type !== 'token_count' && payload.type !== 'function_call') return null

    // Store function_call as pending
    if (payload.type === 'function_call') {
      this.pendingToolCalls.push({
        name: payload.function?.name ?? 'unknown',
        ts: parsed.event_msg.timestamp ?? context.now,
      })
      return null
    }

    // Process token_count
    if (!payload.last_token_usage) {
      // Write warning - but we can't do IO here, so just return null
      return null
    }

    const usage = payload.last_token_usage
    const model = payload.model ?? 'unknown'
    const ts = parsed.event_msg.timestamp ?? context.now

    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheReadTokens = usage.cached_input_tokens ?? 0
    const thinkingTokens = usage.reasoning_output_tokens ?? 0
    const cacheWriteTokens = 0 // Codex doesn't provide this

    const cost = model === 'unknown' ? 0 : calculateCost(model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
    })

    const costSource = model === 'unknown' ? 'unknown' as const : 'pricing' as const
    const provider = inferProvider(model)

    const recordId = generateRecordId(context.sourceFile, context.lineOffset)

    const record: StatsRecord = {
      id: recordId,
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
    }

    // Associate pending tool calls
    const toolCalls: ToolCallRecord[] = this.pendingToolCalls.map((tc, callIndex) => ({
      id: generateToolCallId(recordId, tc.name, tc.ts, callIndex),
      recordId,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))

    // Clear pending queue
    this.pendingToolCalls = []

    return { record, toolCalls }
  }

  finalize(): ParseResult[] {
    // Handle orphan tool calls (no subsequent token_count)
    if (this.pendingToolCalls.length === 0) return []

    const now = Date.now()
    const toolCalls: ToolCallRecord[] = this.pendingToolCalls.map((tc, callIndex) => ({
      id: generateOrphanToolCallId(this.tool, tc.name, tc.ts, callIndex),
      recordId: null,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))

    this.pendingToolCalls = []

    return [{ record: null as any, toolCalls }]
  }
}
```

- [ ] **Step 5: Export parser from parsers/index.ts**

```typescript
export type { ParseResult, Parser, ParsedLine, ParseContext } from '../types.js'
export { ClaudeCodeParser } from './claude-code.js'
export { CodexParser } from './codex.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/codex.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parsers/codex.ts packages/core/tests/fixtures/codex/ packages/core/tests/codex.test.ts packages/core/src/parsers/index.ts
git commit -m "feat(core): add Codex parser with orphan tool call handling"
```

---

## Task 9: OpenClaw Parser

**Files:**
- Create: `packages/core/src/parsers/openclaw.ts`
- Create: `packages/core/tests/fixtures/openclaw/sample.jsonl`
- Create: `packages/core/tests/openclaw.test.ts`

- [ ] **Step 1: Create fixture file**

```jsonl
{"message":{"role":"assistant","content":[{"type":"text","text":"Hi"},{"type":"tool_use","id":"tu_1","name":"Bash","input":{}}],"model":"claude-sonnet-4-6","usage":{"input":100,"output":50,"cacheRead":0,"cacheWrite":200},"provider":"anthropic","timestamp":1776738085400}}
{"message":{"role":"assistant","content":[{"type":"text","text":"Done"}],"model":"gpt-4o","usage":{"input":150,"output":30,"cacheRead":100,"cacheWrite":0,"cost":0.05},"timestamp":1776738085500}}
{"message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_2","name":"Read","input":{}},{"type":"tool_use","id":"tu_3","name":"Edit","input":{}}],"model":"unknown","usage":{"input":50,"output":20},"timestamp":1776738085600}}
```

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OpenClawParser } from '../src/parsers/openclaw.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/openclaw/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('OpenClawParser', () => {
  const parser = new OpenClawParser()
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'session-abc',
    tool: 'openclaw',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('parses message with cost field (costSource = log)', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('gpt-4o')
    expect(result!.record.cost).toBe(0.05)
    expect(result!.record.costSource).toBe('log')
    expect(result!.record.provider).toBe('openai')
  })

  it('parses message without cost field (costSource = pricing)', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
  })

  it('uses message.provider when available', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result!.record.provider).toBe('anthropic')
  })

  it('infers provider from model when message.provider missing', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result!.record.provider).toBe('openai')
  })

  it('parses message with unknown model', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('unknown')
    expect(result!.record.costSource).toBe('unknown')
    expect(result!.record.cost).toBe(0)
  })

  it('parses tool calls in correct order', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Bash')
    expect(result!.toolCalls[0].callIndex).toBe(0)
  })

  it('parses multiple tool calls', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Edit')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('handles cost = 0 as valid (costSource = log)', () => {
    // This tests that cost=0 with cost field present is treated as 'log', not 'pricing'
    const line = '{"message":{"role":"assistant","model":"test","usage":{"input":10,"output":10,"cost":0}}}'
    const result = parser.parseLine(line, { ...baseContext, lineOffset: 0 })
    expect(result!.record.cost).toBe(0)
    expect(result!.record.costSource).toBe('log')
  })

  it('sets thinkingTokens to 0 (OpenClaw doesn\'t provide)', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result!.record.thinkingTokens).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/openclaw.test.ts`
Expected: FAIL with "Cannot find module '../src/parsers/openclaw.js'"

- [ ] **Step 4: Write implementation**

```typescript
import type { Parser, ParseResult, ParseContext } from './index.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId } from '../record-id.js'
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

    // Skip lines without message.usage
    if (!parsed.message?.usage) return null

    const usage = parsed.message.usage
    const model = parsed.message.model ?? 'unknown'
    const ts = parsed.message.timestamp ?? context.now

    const inputTokens = usage.input ?? 0
    const outputTokens = usage.output ?? 0
    const cacheReadTokens = usage.cacheRead ?? 0
    const cacheWriteTokens = usage.cacheWrite ?? 0
    const thinkingTokens = 0 // OpenClaw doesn't provide thinking tokens

    // Cost handling: use log value if present, otherwise calculate
    let cost: number
    let costSource: 'log' | 'pricing' | 'unknown'

    if ('cost' in usage) {
      // cost field exists (including cost=0)
      cost = usage.cost ?? 0
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
      })
      costSource = 'pricing'
    }

    // Provider: use message.provider if available, otherwise infer
    const provider = parsed.message.provider ?? inferProvider(model)

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
    }

    // Extract tool calls from message.content
    const toolCalls: ToolCallRecord[] = []
    if (Array.isArray(parsed.message.content)) {
      let callIndex = 0
      for (const block of parsed.message.content) {
        if (block.type === 'tool_use') {
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
```

- [ ] **Step 5: Export parser from parsers/index.ts**

```typescript
export type { ParseResult, Parser, ParsedLine, ParseContext } from '../types.js'
export { ClaudeCodeParser } from './claude-code.js'
export { CodexParser } from './codex.js'
export { OpenClawParser } from './openclaw.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/openclaw.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parsers/openclaw.ts packages/core/tests/fixtures/openclaw/ packages/core/tests/openclaw.test.ts packages/core/src/parsers/index.ts
git commit -m "feat(core): add OpenClaw parser with cost field handling"
```

---

## Task 10: Aggregator

**Files:**
- Create: `packages/core/src/aggregator.ts`
- Create: `packages/core/tests/aggregator.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { Aggregator } from '../src/aggregator.js'
import type { ParseContext } from '../src/types.js'

describe('Aggregator', () => {
  const aggregator = new Aggregator()

  it('creates correct context for Claude Code', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/path/to/file.jsonl',
      lineOffset: 100,
      sessionId: 'abc123',
      device: 'test-device',
      deviceInstanceId: 'device-123',
    })
    expect(context.tool).toBe('claude-code')
    expect(context.sourceFile).toBe('/path/to/file.jsonl')
    expect(context.lineOffset).toBe(100)
    expect(context.sessionId).toBe('abc123')
    expect(context.device).toBe('test-device')
    expect(context.deviceInstanceId).toBe('device-123')
    expect(context.now).toBeGreaterThan(0)
  })

  it('processes a line through the correct parser', () => {
    const line = '{"message":{"role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50},"timestamp":1234567890}}'
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    const result = aggregator.parseLine(line, context)
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
  })

  it('returns null for invalid JSON', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    const result = aggregator.parseLine('not json', context)
    expect(result).toBeNull()
  })

  it('finalizes Codex parser and returns orphan tool calls', () => {
    // Simulate Codex function_call without subsequent token_count
    const functionCallLine = '{"event_msg":{"type":"event","payload":{"type":"function_call","function":{"name":"Read"}},"timestamp":1234567890}}'
    const context = aggregator.createContext({
      tool: 'codex',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'rollout-abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    aggregator.parseLine(functionCallLine, context)
    const orphanResults = aggregator.finalize()
    expect(orphanResults).toHaveLength(1)
    expect(orphanResults[0].toolCalls[0].name).toBe('Read')
    expect(orphanResults[0].toolCalls[0].recordId).toBeNull()
  })

  it('returns empty array on finalize for non-Codex parsers', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    // No lines parsed, finalize should return empty
    const results = aggregator.finalize()
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- tests/aggregator.test.ts`
Expected: FAIL with "Cannot find module '../src/aggregator.js'"

- [ ] **Step 3: Write implementation**

```typescript
import type { Tool, ParseContext, ParseResult } from './types.js'
import type { Parser } from './parsers/index.js'
import { ClaudeCodeParser } from './parsers/claude-code.js'
import { CodexParser } from './parsers/codex.js'
import { OpenClawParser } from './parsers/openclaw.js'

export interface CreateContextOptions {
  tool: Tool
  sourceFile: string
  lineOffset: number
  sessionId: string
  device: string
  deviceInstanceId: string
}

export class Aggregator {
  private parsers: Map<Tool, Parser>
  private activeParser: Parser | null = null

  constructor() {
    this.parsers = new Map([
      ['claude-code', new ClaudeCodeParser()],
      ['codex', new CodexParser()],
      ['openclaw', new OpenClawParser()],
    ])
  }

  createContext(options: CreateContextOptions): ParseContext {
    return {
      ...options,
      now: Date.now(),
    }
  }

  parseLine(line: string, context: ParseContext): ParseResult | null {
    // Get or create parser for this tool
    if (!this.activeParser || this.activeParser.tool !== context.tool) {
      this.activeParser = this.parsers.get(context.tool) ?? null
    }

    if (!this.activeParser) {
      return null
    }

    return this.activeParser.parseLine(line, context)
  }

  finalize(): ParseResult[] {
    if (!this.activeParser?.finalize) return []
    return this.activeParser.finalize()
  }
}
```

- [ ] **Step 4: Export from index.ts**

```typescript
export * from './types.js'
export * from './provider.js'
export * from './pricing.js'
export * from './record-id.js'
export * from './parsers/index.js'
export * from './aggregator.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- tests/aggregator.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests to verify nothing is broken**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Build to verify types are correct**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/aggregator.ts packages/core/tests/aggregator.test.ts packages/core/src/index.ts
git commit -m "feat(core): add aggregator with parser orchestration"
```

---

## Task 11: Final Integration

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update index.ts with complete exports**

```typescript
// Types
export * from './types.js'

// Utilities
export * from './provider.js'
export * from './pricing.js'
export * from './record-id.js'

// Parsers
export * from './parsers/index.js'

// Aggregator
export * from './aggregator.js'
```

- [ ] **Step 2: Run all tests one final time**

Run: `cd packages/core && pnpm test`
Expected: All tests pass (provider, pricing, record-id, claude-code, codex, openclaw, aggregator)

- [ ] **Step 3: Build the package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds, dist/ directory created

- [ ] **Step 4: Verify test coverage**

Run: `cd packages/core && pnpm test -- --coverage`
Expected: Coverage ≥ 80% for core package

- [ ] **Step 5: Final commit**

```bash
git add packages/core/src/index.ts
git commit -m "chore(core): finalize exports and verify build"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] All three parsers (Claude Code, Codex, OpenClaw)
   - [x] Provider mapping with MODEL_PROVIDER_MAP
   - [x] Pricing table with calculateCost
   - [x] Record ID generation (StatsRecord.id, SyncRecord.id, ToolCallRecord.id)
   - [x] Session key generation
   - [x] Aggregator with parser orchestration
   - [x] Codex orphan tool call handling via finalize()

2. **Placeholder scan:**
   - [x] No TBD/TODO in plan
   - [x] All code blocks are complete
   - [x] No "implement later" references

3. **Type consistency:**
   - [x] StatsRecord interface matches spec
   - [x] ToolCallRecord interface matches spec
   - [x] SyncRecord interface matches spec
   - [x] Parser interface is consistent across all tasks
   - [x] Function signatures match between tests and implementations

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-core-package.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
