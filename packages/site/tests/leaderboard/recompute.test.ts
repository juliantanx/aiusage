import { describe, expect, it } from 'vitest'
import { recomputeAggregateCost, recomputeToolModelCost, type CostMetricRow } from '../../src/lib/server/leaderboard/recompute.js'
import type { PricingRegistry } from '../../src/lib/server/pricing/registry.js'

const registry: PricingRegistry = {
  priceTable: {
    'claude-sonnet-4': { input: 3, output: 15 },
  },
  aliases: new Map(),
}

function row(overrides: Partial<CostMetricRow>): CostMetricRow {
  return {
    id: 'metric_1',
    scope_type: 'tool_model',
    tool: 'claude-code',
    model: 'claude-sonnet-4-20250514',
    input_tokens: 1_000_000,
    output_tokens: 500_000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 1_500_000,
    total_cost_usd: '12.34',
    has_unknown_cost: false,
    ...overrides,
  }
}

describe('leaderboard pricing recompute', () => {
  it('recomputes tool-model rows when pricing resolves', () => {
    expect(recomputeToolModelCost(row({}), registry)).toEqual({
      totalCostUsd: 10.5,
      hasUnknownCost: false,
      preserved: false,
    })
  })

  it('preserves existing tool-model cost when pricing no longer resolves', () => {
    expect(recomputeToolModelCost(row({ model: 'unknown-new-model' }), registry)).toEqual({
      totalCostUsd: 12.34,
      hasUnknownCost: true,
      unresolvedModel: 'unknown-new-model',
      preserved: true,
    })
  })

  it('recomputes aggregate rows from tool-model children', () => {
    expect(recomputeAggregateCost(row({ scope_type: 'all', model: null }), [
      { total_cost_usd: '1.25', has_unknown_cost: false },
      { total_cost_usd: 2.5, has_unknown_cost: true },
    ], registry)).toEqual({
      totalCostUsd: 3.75,
      hasUnknownCost: true,
      preserved: false,
    })
  })

  it('does not overwrite all/tool aggregate rows when no children exist', () => {
    expect(recomputeAggregateCost(row({ scope_type: 'all', model: null }), [], registry)).toBeNull()
    expect(recomputeAggregateCost(row({ scope_type: 'tool', model: null }), [], registry)).toBeNull()
  })

  it('falls back to model row tokens when no tool-model children exist', () => {
    expect(recomputeAggregateCost(row({ scope_type: 'model' }), [], registry)).toEqual({
      totalCostUsd: 10.5,
      hasUnknownCost: false,
      preserved: false,
    })
  })

  it('preserves existing model aggregate cost when fallback pricing does not resolve', () => {
    expect(recomputeAggregateCost(row({ scope_type: 'model', model: 'unknown-new-model' }), [], registry)).toEqual({
      totalCostUsd: 12.34,
      hasUnknownCost: true,
      unresolvedModel: 'unknown-new-model',
      preserved: true,
    })
  })
})

