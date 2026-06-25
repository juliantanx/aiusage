import type Database from 'better-sqlite3'
import {
  setRuntimePriceTable,
  setPriceOverride,
  resolvePriceFromTable,
  type PriceEntry,
} from '@aiusage/core'
import type { Config } from './config.js'

const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

interface ModelPriceRow {
  model_key: string
  provider: string
  input: number
  output: number
  cache_read: number | null
  cache_write: number | null
  currency: 'USD' | 'CNY'
  source: string
  source_model_id: string | null
  source_url: string | null
  origin: 'builtin' | 'user'
  status: string
  last_synced_at: number | null
  updated_at: number
}

interface ModelPriceSyncBaselineRow {
  model_key: string
  provider: string
  input: number
  output: number
  cache_read: number | null
  cache_write: number | null
  currency: 'USD' | 'CNY'
  source: string
  source_model_id: string | null
  source_url: string | null
  last_synced_at: number
  updated_at: number
}

interface AliasRow {
  alias: string
  model_key: string
  match_type: 'exact' | 'prefix'
  provider: string
  priority: number
  source: string
  origin: 'builtin' | 'user'
  enabled: number
}

interface LitellmEntry {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
  input_cost_per_second?: number
  output_cost_per_second?: number
  litellm_provider?: string
  mode?: string
}

export interface PricingSyncSummary {
  source: 'litellm'
  added: number
  updated: number
  unchanged: number
  skipped: number
  aliasesAdded: number
  aliasesUpdated: number
  userPreserved: number
  dryRun: {
    totalModels: number
    matched: number
    unresolved: string[]
  }
}

export interface PricingModelView {
  model: string
  provider: string | null
  price: PriceEntry | null
  currency: 'USD' | 'CNY'
  origin: 'builtin' | 'user' | null
  source: string | null
  sourceModelId: string | null
  lastSyncedAt: number | null
  isBuiltin: boolean
  isOverride: boolean
  isDefault: boolean
  hasSyncedBaseline: boolean
  matchedBy: string | null
}

export interface PricingRegistrySummary {
  totalPrices: number
  builtinPrices: number
  userPrices: number
  activeAliases: number
  lastSyncedAt: number | null
  localModels: number
  matchedLocalModels: number
  unresolvedLocalModels: string[]
}

export interface PricingAliasTarget {
  model: string
  provider: string
  origin: 'builtin' | 'user'
  source: string
  sourceModelId: string | null
  currency: 'USD' | 'CNY'
}

export interface PricingAliasBinding {
  alias: string
  modelKey: string
  origin: 'builtin' | 'user'
  source: string
}

export interface PricingLocalModelBinding {
  model: string
  modelKey: string | null
  origin: 'builtin' | 'user' | null
  priceOrigin: 'builtin' | 'user' | null
  source: string | null
  matchType: 'alias' | 'exact' | 'prefix' | null
  bindingType: 'automatic' | 'manual' | 'custom' | 'none'
  hasManualBinding: boolean
  hasPrice: boolean
}

function rowToPrice(row: Pick<ModelPriceRow, 'input' | 'output' | 'cache_read' | 'cache_write' | 'currency'>): PriceEntry {
  return {
    input: Number(row.input),
    output: Number(row.output),
    cacheRead: row.cache_read == null ? undefined : Number(row.cache_read),
    cacheWrite: row.cache_write == null ? undefined : Number(row.cache_write),
    currency: row.currency,
  }
}

function normalizeProvider(provider: string | undefined): string {
  return (provider ?? '').trim().toLowerCase()
}

function normalizeModelKey(sourceModelId: string): string {
  const trimmed = sourceModelId.trim()
  const slash = trimmed.indexOf('/')
  return slash > 0 ? trimmed.slice(slash + 1) : trimmed
}

function aliasesFor(sourceModelId: string, modelKey: string): string[] {
  const aliases = new Set<string>([modelKey, sourceModelId])
  if (modelKey.startsWith('claude-')) aliases.add(modelKey.replace(/-\d{8}$/, ''))
  return [...aliases].filter(Boolean)
}

function litellmEntryToPrice(sourceModelId: string, entry: LitellmEntry): { modelKey: string; provider: string; price: PriceEntry } | null {
  if (entry.mode && entry.mode !== 'chat' && entry.mode !== 'completion' && entry.mode !== 'responses') return null
  if (entry.input_cost_per_second != null || entry.output_cost_per_second != null) return null
  if (typeof entry.input_cost_per_token !== 'number' || typeof entry.output_cost_per_token !== 'number') return null

  const modelKey = normalizeModelKey(sourceModelId)
  if (!modelKey || modelKey.includes('*')) return null

  return {
    modelKey,
    provider: normalizeProvider(entry.litellm_provider),
    price: {
      input: entry.input_cost_per_token * 1_000_000,
      output: entry.output_cost_per_token * 1_000_000,
      cacheRead: typeof entry.cache_read_input_token_cost === 'number' ? entry.cache_read_input_token_cost * 1_000_000 : undefined,
      cacheWrite: typeof entry.cache_creation_input_token_cost === 'number' ? entry.cache_creation_input_token_cost * 1_000_000 : undefined,
      currency: 'USD',
    },
  }
}

function loadBuiltinRows(db: Database.Database): ModelPriceRow[] {
  return db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, origin, status, last_synced_at, updated_at
    FROM model_prices
    WHERE origin = 'builtin' AND status = 'active'
  `).all() as ModelPriceRow[]
}

function loadUserRows(db: Database.Database): ModelPriceRow[] {
  return db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, origin, status, last_synced_at, updated_at
    FROM model_prices
    WHERE origin = 'user' AND status = 'active'
  `).all() as ModelPriceRow[]
}

function loadSyncedBaselineRows(db: Database.Database): ModelPriceSyncBaselineRow[] {
  return db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, last_synced_at, updated_at
    FROM model_price_sync_baselines
  `).all() as ModelPriceSyncBaselineRow[]
}

function loadAliasRows(db: Database.Database): AliasRow[] {
  return db.prepare(`
    SELECT alias, model_key, match_type, provider, priority, source, origin, enabled
    FROM model_price_aliases
    WHERE enabled = 1
    ORDER BY priority ASC
  `).all() as AliasRow[]
}

export function loadPricingRuntime(db: Database.Database, config?: Config | null): void {
  const builtin: Record<string, PriceEntry> = {}
  for (const row of loadBuiltinRows(db)) builtin[row.model_key] = rowToPrice(row)

  const overrides: Record<string, PriceEntry> = {}
  const userRows = loadUserRows(db)
  const configOverrides = config?.priceOverrides ?? {}

  const activePrices = priceTableFromDb(db)
  for (const alias of loadAliasRows(db)) {
    const price = activePrices[alias.model_key]
    if (!price) continue
    if (alias.origin === 'user') overrides[alias.alias] = price
    else builtin[alias.alias] = price
  }

  for (const row of userRows) overrides[row.model_key] = rowToPrice(row)
  for (const [model, entry] of Object.entries(configOverrides)) overrides[model] = entry
  setRuntimePriceTable(builtin, overrides)
}

export function setUserPrice(db: Database.Database, modelKey: string, entry: PriceEntry): void {
  const now = Date.now()
  const baseline = db.prepare(`
    SELECT provider, source, source_model_id, source_url, last_synced_at
    FROM model_price_sync_baselines
    WHERE model_key = ?
  `).get(modelKey) as (Pick<ModelPriceSyncBaselineRow, 'provider' | 'source' | 'source_model_id' | 'source_url' | 'last_synced_at'> | undefined)
  db.prepare(`
    INSERT INTO model_prices (
      model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
      source_url, origin, status, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 'user', 'active', ?, ?, ?)
    ON CONFLICT(model_key) DO UPDATE SET
      provider = excluded.provider,
      input = excluded.input,
      output = excluded.output,
      cache_read = excluded.cache_read,
      cache_write = excluded.cache_write,
      currency = excluded.currency,
      source = 'manual',
      source_model_id = excluded.source_model_id,
      source_url = excluded.source_url,
      origin = 'user',
      status = 'active',
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(
    modelKey,
    baseline?.provider ?? '',
    entry.input,
    entry.output,
    entry.cacheRead ?? null,
    entry.cacheWrite ?? null,
    entry.currency ?? 'USD',
    baseline?.source_model_id ?? modelKey,
    baseline?.source_url ?? null,
    baseline?.last_synced_at ?? null,
    now,
    now,
  )

  setPriceOverride(modelKey, entry)
}

export function resetUserPriceToSynced(db: Database.Database, modelKey: string): void {
  const baseline = db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, last_synced_at, updated_at
    FROM model_price_sync_baselines
    WHERE model_key = ?
  `).get(modelKey) as (ModelPriceSyncBaselineRow | undefined)

  if (!baseline) {
    removeUserPrice(db, modelKey)
    return
  }

  const now = Date.now()
  db.prepare("DELETE FROM model_price_aliases WHERE alias = ? AND model_key = ? AND origin = 'user'").run(modelKey, modelKey)
  db.prepare(`
    INSERT INTO model_prices (
      model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
      source_url, origin, status, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'builtin', 'active', ?, ?, ?)
    ON CONFLICT(model_key) DO UPDATE SET
      provider = excluded.provider,
      input = excluded.input,
      output = excluded.output,
      cache_read = excluded.cache_read,
      cache_write = excluded.cache_write,
      currency = excluded.currency,
      source = excluded.source,
      source_model_id = excluded.source_model_id,
      source_url = excluded.source_url,
      origin = 'builtin',
      status = 'active',
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(
    baseline.model_key,
    baseline.provider,
    baseline.input,
    baseline.output,
    baseline.cache_read,
    baseline.cache_write,
    baseline.currency,
    baseline.source,
    baseline.source_model_id,
    baseline.source_url,
    baseline.last_synced_at,
    now,
    now,
  )
}

export function setUserPricingAlias(db: Database.Database, alias: string, modelKey: string): void {
  const aliasKey = alias.trim()
  const targetKey = modelKey.trim()
  if (!aliasKey || !targetKey) throw new Error('alias and modelKey required')

  const target = db.prepare(`
    SELECT provider
    FROM model_prices
    WHERE model_key = ? AND status = 'active'
  `).get(targetKey) as ({ provider: string } | undefined)
  if (!target) throw new Error('Pricing model not found')

  const now = Date.now()
  db.prepare(`
    INSERT INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled, created_at, updated_at)
    VALUES (?, ?, 'exact', ?, 200, 'manual', 'user', 1, ?, ?)
    ON CONFLICT(alias) DO UPDATE SET
      model_key = excluded.model_key,
      match_type = 'exact',
      provider = excluded.provider,
      priority = excluded.priority,
      source = 'manual',
      origin = 'user',
      enabled = 1,
      updated_at = excluded.updated_at
  `).run(aliasKey, targetKey, target.provider ?? '', now, now)
}

export function removeUserPricingAlias(db: Database.Database, alias: string): void {
  const aliasKey = alias.trim()
  if (!aliasKey) throw new Error('alias required')
  db.prepare("DELETE FROM model_price_aliases WHERE alias = ? AND origin = 'user'").run(aliasKey)
}

export function removeUserPrice(db: Database.Database, modelKey: string): void {
  db.prepare("DELETE FROM model_price_aliases WHERE alias = ? AND model_key = ? AND origin = 'user'").run(modelKey, modelKey)
  db.prepare("DELETE FROM model_prices WHERE model_key = ? AND origin = 'user'").run(modelKey)
}

function upsertBuiltinPrice(
  db: Database.Database,
  entry: { modelKey: string; provider: string; price: PriceEntry; sourceModelId: string; sourceUrl: string },
  now: number
): 'added' | 'updated' | 'unchanged' | 'user_preserved' {
  db.prepare(`
    INSERT INTO model_price_sync_baselines (
      model_key, provider, input, output, cache_read, cache_write, currency, source,
      source_model_id, source_url, last_synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'litellm', ?, ?, ?, ?)
    ON CONFLICT(model_key) DO UPDATE SET
      provider = excluded.provider,
      input = excluded.input,
      output = excluded.output,
      cache_read = excluded.cache_read,
      cache_write = excluded.cache_write,
      currency = excluded.currency,
      source = excluded.source,
      source_model_id = excluded.source_model_id,
      source_url = excluded.source_url,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(
    entry.modelKey,
    entry.provider,
    entry.price.input,
    entry.price.output,
    entry.price.cacheRead ?? null,
    entry.price.cacheWrite ?? null,
    entry.price.currency ?? 'USD',
    entry.sourceModelId,
    entry.sourceUrl,
    now,
    now,
  )

  const existing = db.prepare('SELECT origin, input, output, cache_read, cache_write, currency FROM model_prices WHERE model_key = ?').get(entry.modelKey) as (ModelPriceRow | undefined)
  if (existing?.origin === 'user') return 'user_preserved'

  const next = [entry.price.input, entry.price.output, entry.price.cacheRead ?? null, entry.price.cacheWrite ?? null, entry.price.currency ?? 'USD'] as const
  if (!existing) {
    db.prepare(`
      INSERT INTO model_prices (
        model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
        source_url, origin, status, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'litellm', ?, ?, 'builtin', 'active', ?, ?, ?)
    `).run(entry.modelKey, entry.provider, ...next, entry.sourceModelId, entry.sourceUrl, now, now, now)
    return 'added'
  }

  const current = [Number(existing.input), Number(existing.output), existing.cache_read == null ? null : Number(existing.cache_read), existing.cache_write == null ? null : Number(existing.cache_write), existing.currency]
  const changed = current.some((value, index) => value !== next[index])
  if (!changed) {
    db.prepare(`
      UPDATE model_prices SET provider = ?, source = 'litellm', source_model_id = ?, source_url = ?, last_synced_at = ?, updated_at = ?
      WHERE model_key = ? AND origin = 'builtin'
    `).run(entry.provider, entry.sourceModelId, entry.sourceUrl, now, now, entry.modelKey)
    return 'unchanged'
  }

  db.prepare(`
    UPDATE model_prices
    SET provider = ?, input = ?, output = ?, cache_read = ?, cache_write = ?, currency = ?, source = 'litellm',
        source_model_id = ?, source_url = ?, status = 'active', last_synced_at = ?, updated_at = ?
    WHERE model_key = ? AND origin = 'builtin'
  `).run(entry.provider, ...next, entry.sourceModelId, entry.sourceUrl, now, now, entry.modelKey)
  return 'updated'
}

function upsertBuiltinAlias(db: Database.Database, alias: string, modelKey: string, provider: string, source: string, now: number): 'added' | 'updated' | 'unchanged' | 'user_preserved' {
  const existing = db.prepare('SELECT origin, model_key, enabled FROM model_price_aliases WHERE alias = ?').get(alias) as (AliasRow | undefined)
  if (existing?.origin === 'user') return 'user_preserved'
  if (!existing) {
    db.prepare(`
      INSERT INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled, created_at, updated_at)
      VALUES (?, ?, 'exact', ?, 100, ?, 'builtin', 1, ?, ?)
    `).run(alias, modelKey, provider, source, now, now)
    return 'added'
  }
  if (existing.model_key === modelKey && existing.enabled === 1) return 'unchanged'
  db.prepare(`
    UPDATE model_price_aliases SET model_key = ?, provider = ?, source = ?, enabled = 1, updated_at = ?
    WHERE alias = ? AND origin = 'builtin'
  `).run(modelKey, provider, source, now, alias)
  return 'updated'
}

export async function syncPricingFromLitellm(db: Database.Database): Promise<PricingSyncSummary> {
  const response = await fetch(LITELLM_PRICING_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`LiteLLM pricing fetch failed: HTTP ${response.status}`)
  const data = await response.json() as Record<string, LitellmEntry>

  const now = Date.now()
  const summary: PricingSyncSummary = {
    source: 'litellm', added: 0, updated: 0, unchanged: 0, skipped: 0, aliasesAdded: 0, aliasesUpdated: 0, userPreserved: 0,
    dryRun: { totalModels: 0, matched: 0, unresolved: [] },
  }

  const tx = db.transaction(() => {
    for (const [sourceModelId, rawEntry] of Object.entries(data)) {
      const parsed = litellmEntryToPrice(sourceModelId, rawEntry)
      if (!parsed) { summary.skipped++; continue }

      const result = upsertBuiltinPrice(db, {
        modelKey: parsed.modelKey,
        provider: parsed.provider,
        price: parsed.price,
        sourceModelId,
        sourceUrl: LITELLM_PRICING_URL,
      }, now)
      if (result === 'user_preserved') summary.userPreserved++
      else summary[result]++

      for (const alias of aliasesFor(sourceModelId, parsed.modelKey)) {
        const aliasResult = upsertBuiltinAlias(db, alias, parsed.modelKey, parsed.provider, 'litellm', now)
        if (aliasResult === 'added') summary.aliasesAdded++
        else if (aliasResult === 'updated') summary.aliasesUpdated++
        else if (aliasResult === 'user_preserved') summary.userPreserved++
      }
    }
  })
  tx()
  summary.dryRun = dryRunLocalModels(db)
  return summary
}

function priceTableFromDb(db: Database.Database): Record<string, PriceEntry> {
  const table: Record<string, PriceEntry> = {}
  const rows = db.prepare(`
    SELECT model_key, input, output, cache_read, cache_write, currency
    FROM model_prices WHERE status = 'active'
  `).all() as ModelPriceRow[]
  for (const row of rows) table[row.model_key] = rowToPrice(row)
  return table
}

/**
 * Whether the user has explicitly configured a manual price for this exact model.
 * Used by recalc to let a user-defined price override a tool's logged cost
 * (e.g. unreliable near-zero costs reported by custom gateways). See issue #13.
 */
export function hasUserPrice(db: Database.Database, model: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM model_prices
    WHERE model_key = ? AND origin = 'user' AND status = 'active'
    LIMIT 1
  `).get(model)
  return Boolean(row)
}

export function resolvePriceFromRegistry(db: Database.Database, model: string): PriceEntry | undefined {
  const directUserPrice = db.prepare(`
    SELECT input, output, cache_read, cache_write, currency
    FROM model_prices
    WHERE model_key = ? AND origin = 'user' AND status = 'active'
  `).get(model) as (Pick<ModelPriceRow, 'input' | 'output' | 'cache_read' | 'cache_write' | 'currency'> | undefined)
  if (directUserPrice) return rowToPrice(directUserPrice)

  const exactAlias = db.prepare(`
    SELECT p.input, p.output, p.cache_read, p.cache_write, p.currency
    FROM model_price_aliases a
    JOIN model_prices p ON p.model_key = a.model_key
    WHERE a.alias = ? AND a.enabled = 1 AND p.status = 'active'
    ORDER BY a.priority DESC LIMIT 1
  `).get(model) as (Pick<ModelPriceRow, 'input' | 'output' | 'cache_read' | 'cache_write' | 'currency'> | undefined)
  if (exactAlias) return rowToPrice(exactAlias)
  return resolvePriceFromTable(model, priceTableFromDb(db))
}

function findMatch(db: Database.Database, model: string): { price: PriceEntry; row: ModelPriceRow; matchedBy: string | null } | null {
  const directUserMatch = db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, origin, status, last_synced_at, updated_at
    FROM model_prices
    WHERE model_key = ? AND origin = 'user' AND status = 'active'
  `).get(model) as (ModelPriceRow | undefined)
  if (directUserMatch) return { price: rowToPrice(directUserMatch), row: directUserMatch, matchedBy: null }

  const aliasMatch = db.prepare(`
    SELECT p.model_key, p.provider, p.input, p.output, p.cache_read, p.cache_write, p.currency, p.source,
           p.source_model_id, p.source_url, p.origin, p.status, p.last_synced_at, p.updated_at, a.alias
    FROM model_price_aliases a
    JOIN model_prices p ON p.model_key = a.model_key
    WHERE a.alias = ? AND a.enabled = 1 AND p.status = 'active'
    ORDER BY a.priority DESC LIMIT 1
  `).get(model) as (ModelPriceRow & { alias: string } | undefined)
  if (aliasMatch) {
    const matchedBy = aliasMatch.alias === model
      ? (aliasMatch.model_key === model ? null : aliasMatch.model_key)
      : aliasMatch.alias
    return { price: rowToPrice(aliasMatch), row: aliasMatch, matchedBy }
  }

  const rows = db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, origin, status, last_synced_at, updated_at
    FROM model_prices WHERE status = 'active'
  `).all() as ModelPriceRow[]
  let best: ModelPriceRow | null = null
  for (const row of rows) {
    if (model === row.model_key) { best = row; break }
    if (model.startsWith(row.model_key) && (!best || row.model_key.length > best.model_key.length)) best = row
  }
  if (!best) return null
  return { price: rowToPrice(best), row: best, matchedBy: best.model_key === model ? null : best.model_key }
}

export function listPricingModels(db: Database.Database): PricingModelView[] {
  const dbModels = db.prepare("SELECT model, COUNT(*) as usage_count FROM records WHERE model != 'unknown' GROUP BY model ORDER BY usage_count DESC, model ASC").all() as Array<{ model: string; usage_count: number }>
  const knownModels = new Set(dbModels.map(row => row.model))
  const userRows = loadUserRows(db)
  for (const row of userRows) knownModels.add(row.model_key)
  const syncedBaselines = new Set(loadSyncedBaselineRows(db).map(row => row.model_key))

  return [...knownModels].map((model) => {
    const match = findMatch(db, model)
    if (!match) {
      return {
        model,
        provider: null,
        price: null,
        currency: 'USD',
        origin: null,
        source: null,
        sourceModelId: null,
        lastSyncedAt: null,
        isBuiltin: false,
        isOverride: false,
        isDefault: false,
        hasSyncedBaseline: syncedBaselines.has(model),
        matchedBy: null,
      }
    }
    return {
      model,
      provider: match.row.provider || null,
      price: match.price,
      currency: match.price.currency ?? 'USD',
      origin: match.row.origin,
      source: match.row.source,
      sourceModelId: match.row.source_model_id,
      lastSyncedAt: match.row.last_synced_at,
      isBuiltin: match.row.origin === 'builtin',
      isOverride: match.row.origin === 'user',
      isDefault: match.row.origin === 'builtin',
      hasSyncedBaseline: syncedBaselines.has(match.row.model_key),
      matchedBy: match.matchedBy,
    }
  })
}

export function getPricingRegistrySummary(db: Database.Database): PricingRegistrySummary {
  const priceCounts = db.prepare(`
    SELECT
      COUNT(*) AS totalPrices,
      SUM(CASE WHEN origin = 'builtin' THEN 1 ELSE 0 END) AS builtinPrices,
      SUM(CASE WHEN origin = 'user' THEN 1 ELSE 0 END) AS userPrices,
      MAX(last_synced_at) AS lastSyncedAt
    FROM model_prices
    WHERE status = 'active'
  `).get() as { totalPrices: number; builtinPrices: number | null; userPrices: number | null; lastSyncedAt: number | null }

  const aliasCounts = db.prepare(`
    SELECT COUNT(*) AS activeAliases
    FROM model_price_aliases
    WHERE enabled = 1
  `).get() as { activeAliases: number }

  const dryRun = dryRunLocalModels(db)
  return {
    totalPrices: Number(priceCounts.totalPrices ?? 0),
    builtinPrices: Number(priceCounts.builtinPrices ?? 0),
    userPrices: Number(priceCounts.userPrices ?? 0),
    activeAliases: Number(aliasCounts.activeAliases ?? 0),
    lastSyncedAt: priceCounts.lastSyncedAt == null ? null : Number(priceCounts.lastSyncedAt),
    localModels: dryRun.totalModels,
    matchedLocalModels: dryRun.matched,
    unresolvedLocalModels: dryRun.unresolved,
  }
}

export function listPricingAliasTargets(db: Database.Database): PricingAliasTarget[] {
  const rows = db.prepare(`
    SELECT model_key, provider, origin, source, source_model_id, currency
    FROM model_prices
    WHERE status = 'active'
    ORDER BY origin DESC, provider ASC, model_key ASC
  `).all() as Array<Pick<ModelPriceRow, 'model_key' | 'provider' | 'origin' | 'source' | 'source_model_id' | 'currency'>>

  return rows.map((row) => ({
    model: row.model_key,
    provider: row.provider,
    origin: row.origin,
    source: row.source,
    sourceModelId: row.source_model_id,
    currency: row.currency,
  }))
}

export function listLocalModelBindings(db: Database.Database): PricingLocalModelBinding[] {
  const rows = db.prepare("SELECT DISTINCT model FROM records WHERE model != 'unknown' ORDER BY model ASC").all() as Array<{ model: string }>
  const priceRows = db.prepare(`
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
           source_url, origin, status, last_synced_at, updated_at
    FROM model_prices WHERE status = 'active'
  `).all() as ModelPriceRow[]

  return rows.map(({ model }) => {
    const directUserPrice = db.prepare(`
      SELECT model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
             source_url, origin, status, last_synced_at, updated_at
      FROM model_prices
      WHERE model_key = ? AND origin = 'user' AND status = 'active'
    `).get(model) as (ModelPriceRow | undefined)
    const aliasMatch = db.prepare(`
      SELECT a.alias, a.model_key AS modelKey, a.origin, a.source, p.origin AS priceOrigin
      FROM model_price_aliases a
      JOIN model_prices p ON p.model_key = a.model_key
      WHERE a.alias = ? AND a.enabled = 1 AND p.status = 'active'
      ORDER BY a.priority DESC LIMIT 1
    `).get(model) as ({ alias: string; modelKey: string; origin: 'builtin' | 'user'; source: string; priceOrigin: 'builtin' | 'user' } | undefined)

    if (directUserPrice) {
      const hasManualBinding = Boolean(aliasMatch && aliasMatch.origin === 'user' && !(aliasMatch.alias === model && aliasMatch.modelKey === model))
      return {
        model,
        modelKey: hasManualBinding ? aliasMatch!.modelKey : directUserPrice.model_key,
        origin: hasManualBinding ? aliasMatch!.origin : directUserPrice.origin,
        priceOrigin: directUserPrice.origin,
        source: directUserPrice.source,
        matchType: 'exact',
        bindingType: 'custom',
        hasManualBinding,
        hasPrice: true,
      }
    }

    if (aliasMatch) {
      const selfAlias = aliasMatch.alias === model && aliasMatch.modelKey === model
      const hasManualBinding = aliasMatch.origin === 'user' && !selfAlias
      return {
        model,
        modelKey: aliasMatch.modelKey,
        origin: aliasMatch.origin,
        priceOrigin: aliasMatch.priceOrigin,
        source: aliasMatch.source,
        matchType: selfAlias ? 'exact' : 'alias',
        bindingType: aliasMatch.priceOrigin === 'user' ? 'custom' : hasManualBinding ? 'manual' : 'automatic',
        hasManualBinding,
        hasPrice: true,
      }
    }

    let best: ModelPriceRow | null = null
    let matchType: 'exact' | 'prefix' | null = null
    for (const row of priceRows) {
      if (model === row.model_key) {
        best = row
        matchType = 'exact'
        break
      }
      if (model.startsWith(row.model_key) && (!best || row.model_key.length > best.model_key.length)) {
        best = row
        matchType = 'prefix'
      }
    }

    return {
      model,
      modelKey: best?.model_key ?? null,
      origin: best?.origin ?? null,
      priceOrigin: best?.origin ?? null,
      source: best?.source ?? null,
      matchType,
      bindingType: best?.origin === 'user' ? 'custom' : best ? 'automatic' : 'none',
      hasManualBinding: false,
      hasPrice: Boolean(best),
    }
  })
}

export function dryRunLocalModels(db: Database.Database): PricingSyncSummary['dryRun'] {
  const models = db.prepare("SELECT DISTINCT model FROM records WHERE model != 'unknown' ORDER BY model ASC").all() as Array<{ model: string }>
  const unresolved: string[] = []
  let matched = 0
  for (const row of models) {
    if (resolvePriceFromRegistry(db, row.model)) matched++
    else unresolved.push(row.model)
  }
  return { totalModels: models.length, matched, unresolved: unresolved.slice(0, 50) }
}

export function getUserAliasBindings(db: Database.Database): PricingAliasBinding[] {
  return db.prepare(`
    SELECT alias, model_key AS modelKey, origin, source
    FROM model_price_aliases
    WHERE origin = 'user' AND enabled = 1
    ORDER BY alias ASC
  `).all() as PricingAliasBinding[]
}

function buildDrySummary(db: Database.Database, source: 'litellm'): PricingSyncSummary {
  return {
    source,
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    aliasesAdded: 0,
    aliasesUpdated: 0,
    userPreserved: 0,
    dryRun: dryRunLocalModels(db),
  }
}
