import { describe, it, expect } from 'vitest'
import { CodexParser } from '../src/parsers/codex.js'
import { CodeFuseParser } from '../src/parsers/codefuse.js'
import { calculateCost } from '../src/pricing.js'
import type { ParseContext } from '../src/types.js'

// Codex reports reasoning_output_tokens as a part of output_tokens
// (total_tokens = input_tokens + output_tokens). Totals sum the output and
// thinking columns and pricing charges both at the output price, so the two
// columns must be disjoint: output is stored without the reasoning part.

const MODEL = 'gpt-4o'

function context(tool: 'codex' | 'codefuse'): ParseContext {
  return {
    sourceFile: `/home/u/.${tool}/sessions/2026/10/01/rollout-reasoning.jsonl`,
    lineOffset: 0,
    sessionId: 'rollout-reasoning',
    tool,
    now: 1790000000000,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }
}

function tokenCount(usage: Record<string, number>, shape: 'info' | 'flat' = 'info'): string {
  return JSON.stringify({
    timestamp: '2026-10-01T08:00:01.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      model: MODEL,
      ...(shape === 'info' ? { info: { last_token_usage: usage } } : { last_token_usage: usage }),
    },
  })
}

const parsers = [
  { name: 'CodexParser', tool: 'codex' as const, create: () => new CodexParser() },
  { name: 'CodeFuseParser (embedded Codex payload)', tool: 'codefuse' as const, create: () => new CodeFuseParser() },
]

for (const { name, tool, create } of parsers) {
  describe(`${name}: reasoning tokens are part of output tokens`, () => {
    it('stores output tokens exclusive of reasoning tokens', () => {
      const usage = { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 500, reasoning_output_tokens: 200, total_tokens: 1500 }
      const { record } = create().parseLine(tokenCount(usage), context(tool))!

      expect(record.outputTokens).toBe(300)
      expect(record.thinkingTokens).toBe(200)
      // The stored columns add up to what Codex reports as total_tokens.
      expect(
        record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens + record.outputTokens + record.thinkingTokens
      ).toBe(usage.total_tokens)
    })

    it('bills reasoning tokens once, at the output price', () => {
      const usage = { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 500, reasoning_output_tokens: 200 }
      const { record } = create().parseLine(tokenCount(usage), context(tool))!

      // What the provider charges: every output token (reasoning included) once.
      const expected = calculateCost(MODEL, {
        inputTokens: 600,
        outputTokens: 500,
        cacheReadTokens: 400,
        cacheWriteTokens: 0,
        thinkingTokens: 0,
      })
      expect(expected).toBeGreaterThan(0)
      expect(record.cost).toBeCloseTo(expected, 12)
    })

    it('keeps output tokens as reported when there is no reasoning', () => {
      for (const usage of [
        { input_tokens: 10, output_tokens: 7, reasoning_output_tokens: 0 },
        { input_tokens: 10, output_tokens: 7 },
      ]) {
        const { record } = create().parseLine(tokenCount(usage), context(tool))!
        expect(record.outputTokens).toBe(7)
        expect(record.thinkingTokens).toBe(0)
      }
    })

    it('stores an all-reasoning response as zero output tokens', () => {
      const { record } = create().parseLine(
        tokenCount({ input_tokens: 10, output_tokens: 64, reasoning_output_tokens: 64 }),
        context(tool),
      )!
      expect(record.outputTokens).toBe(0)
      expect(record.thinkingTokens).toBe(64)
    })

    it('never stores negative output tokens', () => {
      const { record } = create().parseLine(
        tokenCount({ input_tokens: 10, output_tokens: 5, reasoning_output_tokens: 9 }),
        context(tool),
      )!
      expect(record.outputTokens).toBe(0)
      expect(record.thinkingTokens).toBe(9)
    })

    it('applies to the older payload shape with last_token_usage on the payload', () => {
      const { record } = create().parseLine(
        tokenCount({ input_tokens: 100, output_tokens: 50, reasoning_output_tokens: 20 }, 'flat'),
        context(tool),
      )!
      expect(record.outputTokens).toBe(30)
      expect(record.thinkingTokens).toBe(20)
    })
  })
}
