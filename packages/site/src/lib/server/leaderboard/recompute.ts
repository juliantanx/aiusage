import { calculateRegistryCost, resolvePriceFromRegistry, type PricingRegistry } from '../pricing/registry.js'

export type CostScopeType = 'all' | 'tool' | 'model' | 'tool_model'

export interface CostMetricRow {
  id: string
  scope_type: CostScopeType | string
  tool: string | null
  model: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
  total_tokens: number
  total_cost_usd: string | number
  has_unknown_cost: boolean | null
}

export interface CostChildRow {
  total_cost_usd: string | number
  has_unknown_cost: boolean | null
}

export interface CostUpdate {
  totalCostUsd: number
  hasUnknownCost: boolean
  unresolvedModel?: string
  preserved: boolean
}

export function recomputeToolModelCost(row: CostMetricRow, pricing: PricingRegistry): CostUpdate | null {
  if (row.scope_type !== 'tool_model') return null

  if (!row.model) {
    return {
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      hasUnknownCost: row.total_tokens > 0,
      preserved: row.total_tokens > 0,
    }
  }

  const price = resolvePriceFromRegistry(row.model, pricing)
  if (!price) {
    return {
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      hasUnknownCost: row.total_tokens > 0,
      unresolvedModel: row.total_tokens > 0 ? row.model : undefined,
      preserved: row.total_tokens > 0,
    }
  }

  return {
    totalCostUsd: calculateRegistryCost(price, row),
    hasUnknownCost: false,
    preserved: false,
  }
}

export function recomputeAggregateCost(row: CostMetricRow, children: CostChildRow[], pricing: PricingRegistry): CostUpdate | null {
  if (children.length > 0) {
    return {
      totalCostUsd: children.reduce((sum, child) => sum + Number(child.total_cost_usd ?? 0), 0),
      hasUnknownCost: children.some(child => Boolean(child.has_unknown_cost)),
      preserved: false,
    }
  }

  if (row.scope_type !== 'model' || !row.model) return null

  const price = resolvePriceFromRegistry(row.model, pricing)
  if (!price) {
    return {
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      hasUnknownCost: row.total_tokens > 0,
      unresolvedModel: row.total_tokens > 0 ? row.model : undefined,
      preserved: row.total_tokens > 0,
    }
  }

  return {
    totalCostUsd: calculateRegistryCost(price, row),
    hasUnknownCost: false,
    preserved: false,
  }
}

