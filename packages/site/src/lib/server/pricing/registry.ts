import { calculateCostForPrice, resolvePriceFromTable, type PriceEntry } from '@aiusage/core'
import { sql } from '$lib/server/db/pool.js'

type SqlClient = typeof sql

interface PriceRow {
  model_key: string
  input: string | number
  output: string | number
  cache_read: string | number | null
  cache_write: string | number | null
  currency: 'USD' | 'CNY' | string
}

interface AliasRow {
  alias: string
  model_key: string
  origin: 'builtin' | 'user' | string
}

export interface PricingRegistry {
  priceTable: Record<string, PriceEntry>
  aliases: Map<string, PriceEntry>
}

function rowToPrice(row: Pick<PriceRow, 'input' | 'output' | 'cache_read' | 'cache_write' | 'currency'>): PriceEntry {
  return {
    input: Number(row.input),
    output: Number(row.output),
    cacheRead: row.cache_read == null ? undefined : Number(row.cache_read),
    cacheWrite: row.cache_write == null ? undefined : Number(row.cache_write),
    currency: row.currency === 'CNY' ? 'CNY' : 'USD',
  }
}

export async function loadPricingRegistry(client: SqlClient = sql): Promise<PricingRegistry> {
  const priceRows = await client`
    SELECT model_key, input, output, cache_read, cache_write, currency
    FROM model_prices
    WHERE status = 'active'
  ` as PriceRow[]

  const priceTable: Record<string, PriceEntry> = {}
  for (const row of priceRows) priceTable[row.model_key] = rowToPrice(row)

  const aliasRows = await client`
    SELECT a.alias, a.model_key, a.origin
    FROM model_price_aliases a
    JOIN model_prices p ON p.model_key = a.model_key
    WHERE a.enabled = TRUE AND p.status = 'active'
    ORDER BY a.priority ASC
  ` as AliasRow[]

  const aliases = new Map<string, PriceEntry>()
  for (const row of aliasRows) {
    const price = priceTable[row.model_key]
    if (price) aliases.set(row.alias, price)
  }

  return { priceTable, aliases }
}

export function resolvePriceFromRegistry(model: string, registry: PricingRegistry): PriceEntry | undefined {
  return registry.aliases.get(model) ?? resolvePriceFromTable(model, registry.priceTable)
}

export function calculateRegistryCost(price: PriceEntry, tokens: {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
}): number {
  return calculateCostForPrice(price, {
    inputTokens: tokens.input_tokens,
    outputTokens: tokens.output_tokens,
    cacheReadTokens: tokens.cache_read_tokens,
    cacheWriteTokens: tokens.cache_write_tokens,
    thinkingTokens: tokens.thinking_tokens,
  })
}
