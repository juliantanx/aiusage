import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tokenComposition } from '../src/lib/token-composition.js'

const pageSource = readFileSync(
  fileURLToPath(new URL('../src/routes/+page.svelte', import.meta.url)),
  'utf8',
)

describe('home page token composition', () => {
  it('shows thinking tokens in the output segment', () => {
    // A Codex turn that only reasoned: output_tokens 64, all of them reasoning,
    // is stored as output 0 and thinking 64.
    const shares = tokenComposition({
      inputTokens: 100, outputTokens: 0, thinkingTokens: 64, cacheReadTokens: 0, cacheWriteTokens: 0,
    })

    expect(shares.inputPct).toBeCloseTo((100 / 164) * 100, 10)
    expect(shares.outputPct).toBeCloseTo((64 / 164) * 100, 10)
  })

  it('adds up to the whole total, thinking included', () => {
    const shares = tokenComposition({
      inputTokens: 100, outputTokens: 300, thinkingTokens: 200, cacheReadTokens: 900, cacheWriteTokens: 500,
    })

    expect(shares).toEqual({ inputPct: 5, outputPct: 25, cacheReadPct: 45, cacheWritePct: 25 })
    expect(shares.inputPct + shares.outputPct + shares.cacheReadPct + shares.cacheWritePct).toBeCloseTo(100, 10)
  })

  it('is unchanged for data without thinking tokens', () => {
    for (const thinkingTokens of [0, undefined, null]) {
      expect(tokenComposition({
        inputTokens: 100, outputTokens: 100, thinkingTokens, cacheReadTokens: 200, cacheWriteTokens: 0,
      })).toEqual({ inputPct: 25, outputPct: 25, cacheReadPct: 50, cacheWritePct: 0 })
    }
  })

  it('is all zero when there are no tokens or no data yet', () => {
    const zero = { inputPct: 0, outputPct: 0, cacheReadPct: 0, cacheWritePct: 0 }
    expect(tokenComposition(null)).toEqual(zero)
    expect(tokenComposition({ inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toEqual(zero)
  })

  it('is what the home page builds its bar from', () => {
    expect(pageSource).toContain("import { tokenComposition } from '$lib/token-composition.js'")
    expect(pageSource).toMatch(/\$: \(\{ inputPct, outputPct, cacheReadPct, cacheWritePct \} = tokenComposition\(data\)\)/)
    // No share is computed from the raw columns beside it.
    expect(pageSource).not.toMatch(/data\.(input|output|cacheRead|cacheWrite)Tokens\s*\/\s*tokenParts/)
  })
})
