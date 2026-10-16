// The site's LiteLLM price sync on PostgreSQL (PGlite), with a stubbed fetch.
// It has to store what the CLI's sync stores: one owner per model key
// (planLitellmPricing in @aiusage/core), whatever the order of the file.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))

import { migrateTestDatabase, query, truncate } from '../helpers/pglite-sql.js'
import { syncPricingFromLitellm } from '../../src/lib/server/admin/operations.js'
import { planLitellmPricing } from '@aiusage/core'

const perToken = (perMillion: number) => perMillion / 1_000_000
const chat = (provider: string, input: number, output: number, cacheRead?: number) => ({
  litellm_provider: provider,
  mode: 'chat',
  input_cost_per_token: perToken(input),
  output_cost_per_token: perToken(output),
  ...(cacheRead === undefined ? {} : { cache_read_input_token_cost: perToken(cacheRead) }),
})

// Representative collisions from the LiteLLM file (October 2026).
const FILE: Record<string, unknown> = {
  'claude-haiku-4-5': chat('anthropic', 1, 5, 0.1),
  'vertex_ai/claude-haiku-4-5': chat('vertex_ai', 1, 5, 0.1),
  'aihubmix/claude-haiku-4-5': chat('aihubmix', 1.1, 5.5, 0.11),
  // Cohere lists the model at 0/0 with a source page that gives no price.
  'command-a-plus-05-2026': chat('cohere_chat', 0, 0),
  'aihubmix/command-a-plus-05-2026': chat('aihubmix', 2.5, 10),
  // Free on the Gemini API only, with no priced entry: stays free.
  'gemini/gemini-exp-free-only': chat('gemini', 0, 0),
  // No entry under the key itself: the developer's own entry owns it.
  'aihubmix/glm-5.3': chat('aihubmix', 1.1268, 3.9438),
  'zai/glm-5.3': chat('zai', 1.4, 4.4),
  'scaleway/glm-5.3': chat('scaleway', 1.8, 5.5),
  // Dated Claude model without an undated entry.
  'claude-opus-9-20270101': chat('anthropic', 20, 100),
  // Not priced per token: skipped.
  'some-image-model': { litellm_provider: 'openai', mode: 'image_generation', input_cost_per_token: 0, output_cost_per_token: 0 },
}

function reversed(file: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(file).reverse())
}

async function sync(file: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(file), { status: 200 })))
  return syncPricingFromLitellm('admin_1')
}

async function prices(): Promise<Record<string, string>> {
  const rows = await query<{ model_key: string; input: string; output: string; source_model_id: string }>(
    `SELECT model_key, input, output, source_model_id FROM model_prices WHERE source = 'litellm' ORDER BY model_key`)
  return Object.fromEntries(rows.map(r => [r.model_key, `${Number(r.input)}/${Number(r.output)} ${r.source_model_id}`]))
}

async function aliasTarget(alias: string): Promise<string | undefined> {
  const rows = await query<{ model_key: string }>(`SELECT model_key FROM model_price_aliases WHERE alias = $1`, [alias])
  return rows[0]?.model_key
}

beforeAll(async () => {
  await migrateTestDatabase()
})

beforeEach(async () => {
  await truncate('model_price_aliases', 'model_prices', 'admin_audit_logs', 'users')
  await query(`INSERT INTO users (id, username, email, display_name, role) VALUES ('admin_1', 'admin', 'a@example.com', 'Admin', 'admin')`)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('site LiteLLM price sync (PostgreSQL)', () => {
  const EXPECTED = {
    'claude-haiku-4-5': '1/5 claude-haiku-4-5',
    'command-a-plus-05-2026': '2.5/10 aihubmix/command-a-plus-05-2026',
    'gemini-exp-free-only': '0/0 gemini/gemini-exp-free-only',
    'glm-5.3': '1.4/4.4 zai/glm-5.3',
    'claude-opus-9-20270101': '20/100 claude-opus-9-20270101',
  }

  it.each([
    ['in file order', FILE],
    ['in reverse order', reversed(FILE)],
  ])('gives each key the price of one owner, not of the last entry (%s)', async (_label, file) => {
    const result = await sync(file)

    expect(await prices()).toEqual(EXPECTED)
    expect(result).toMatchObject({ added: 5, updated: 0, skipped: 1, userPreserved: 0 })
  })

  it('stores what the CLI plans', async () => {
    await sync(FILE)

    const plan = planLitellmPricing(FILE as Parameters<typeof planLitellmPricing>[0])
    expect(await prices()).toEqual(Object.fromEntries(
      plan.prices.map(p => [p.modelKey, `${p.price.input}/${p.price.output} ${p.sourceModelId}`])
    ))
  })

  it('keeps every other id reachable as an alias of its key, and adds the undated Claude shortcut', async () => {
    await sync(FILE)

    expect(await aliasTarget('aihubmix/claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(await aliasTarget('vertex_ai/claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(await aliasTarget('claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(await aliasTarget('scaleway/glm-5.3')).toBe('glm-5.3')
    expect(await aliasTarget('claude-opus-9')).toBe('claude-opus-9-20270101')
  })

  it('leaves a user price and a user alias alone', async () => {
    await query(`INSERT INTO model_prices (model_key, provider, input, output, origin, source) VALUES ('claude-haiku-4-5', '', 3, 7, 'user', 'manual')`)
    await query(`INSERT INTO model_price_aliases (alias, model_key, origin, source) VALUES ('aihubmix/claude-haiku-4-5', 'claude-haiku-4-5', 'user', 'manual')`)

    const result = await sync(FILE)

    const row = await query<{ input: string; output: string; origin: string }>(`SELECT input, output, origin FROM model_prices WHERE model_key = 'claude-haiku-4-5'`)
    expect(row).toEqual([{ input: '3.00000000', output: '7.00000000', origin: 'user' }])
    expect(result.userPreserved).toBe(1)
    const alias = await query<{ origin: string }>(`SELECT origin FROM model_price_aliases WHERE alias = 'aihubmix/claude-haiku-4-5'`)
    expect(alias).toEqual([{ origin: 'user' }])
  })

  it('corrects a reseller price an earlier sync stored, and reports it as updated', async () => {
    await query(`INSERT INTO model_prices (model_key, provider, input, output, origin, source, source_model_id) VALUES ('claude-haiku-4-5', 'aihubmix', 1.1, 5.5, 'builtin', 'litellm', 'aihubmix/claude-haiku-4-5')`)

    const result = await sync(FILE)

    expect((await prices())['claude-haiku-4-5']).toBe('1/5 claude-haiku-4-5')
    expect(result.updated).toBe(1)
  })

  it('does not point a dated shortcut at the snapshot when the name has a price of its own', async () => {
    await query(`INSERT INTO model_prices (model_key, provider, input, output, origin, source) VALUES ('claude-opus-9', 'anthropic', 15, 75, 'builtin', 'curated')`)

    await sync(FILE)

    expect(await aliasTarget('claude-opus-9')).toBe('claude-opus-9')
  })
})
