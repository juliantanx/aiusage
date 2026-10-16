// Leaderboard paths beside moderation that decide what is shown, on
// PostgreSQL (PGlite): cost recompute, the public filter lists and the
// first-page cache.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))
vi.mock('$lib/server/auth/session.js', () => ({ requireAdmin: async () => ({ id: 'admin_1' }) }))

import { migrateTestDatabase, query, truncate } from '../helpers/pglite-sql.js'
import { invalidateConfigCache } from '../../src/lib/server/config.js'
import { invalidateLeaderboardCache, queryLeaderboard } from '../../src/lib/server/leaderboard/query.js'
import { POST as recompute } from '../../src/routes/api/admin/leaderboard/recompute/+server.js'
import { GET as filters } from '../../src/routes/api/leaderboard/filters/+server.js'

const PERIOD = '2026-06-01T00:00:00.000Z'

async function metric(id: string, user: string, scope: string, tool: string | null, model: string | null, tokens: number, cost: number, visibility = 'public') {
  await query(
    `INSERT INTO leaderboard_metrics (id, user_id, device_id, period_type, period_start, period_end, scope_type, tool, model,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, total_tokens, total_cost_usd, visibility)
     VALUES ($1, $2, $3, 'daily', $4, '2026-06-01T23:59:59Z', $5, $6, $7, $8, 0, 0, 0, 0, $8, $9, $10::leaderboard_visibility)`,
    [id, user, `${user}_device`, PERIOD, scope, tool, model, tokens, cost, visibility])
}

async function costs(): Promise<Record<string, number>> {
  const rows = await query<{ id: string; total_cost_usd: string }>(`SELECT id, total_cost_usd FROM leaderboard_metrics ORDER BY id`)
  return Object.fromEntries(rows.map(r => [r.id, Number(r.total_cost_usd)]))
}

beforeAll(async () => {
  await migrateTestDatabase()
})

beforeEach(async () => {
  await truncate('leaderboard_metrics', 'user_devices', 'users', 'site_config', 'model_price_aliases', 'model_prices')
  invalidateConfigCache()
  invalidateLeaderboardCache()
  await truncate('admin_audit_logs')
  await query(`INSERT INTO users (id, username, email, display_name, role) VALUES ('admin_1', 'admin', 'a@example.com', 'Admin', 'admin')`)
  for (const [id, status, visibility] of [['u1', 'active', 'public'], ['u2', 'banned', 'public'], ['u3', 'active', 'private']]) {
    await query(`INSERT INTO users (id, username, email, display_name, status, leaderboard_visibility) VALUES ($1, $1, $1 || '@example.com', $1, $2::user_status, $3)`, [id, status, visibility])
    await query(`INSERT INTO user_devices (id, user_id, name, secret_encrypted, secret_hash) VALUES ($1 || '_device', $1, 'laptop', 'x', 'x')`, [id])
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('admin leaderboard recompute', () => {
  it('keeps a parent\'s cost the cost of all its tokens when a child row is hidden', async () => {
    await query(`INSERT INTO model_prices (model_key, provider, input, output, origin) VALUES ('m1', 't', 3, 3, 'user'), ('m2', 't', 5, 5, 'user')`)
    await metric('tm1', 'u1', 'tool_model', 'cc', 'm1', 1_000_000, 0)
    await metric('tm2', 'u1', 'tool_model', 'cc', 'm2', 1_000_000, 0, 'hidden')
    await metric('model1', 'u1', 'model', null, 'm1', 1_000_000, 0)
    await metric('model2', 'u1', 'model', null, 'm2', 1_000_000, 0, 'hidden')
    await metric('tool', 'u1', 'tool', 'cc', null, 2_000_000, 0)
    await metric('all', 'u1', 'all', null, null, 2_000_000, 0)

    const response = await recompute({ request: new Request('http://localhost', { method: 'POST', body: '{}' }) } as Parameters<typeof recompute>[0])
    expect(response.status).toBe(200)

    // As processUpload prices them: every child counts, whatever its visibility.
    expect(await costs()).toEqual({ all: 8, model1: 3, model2: 5, tm1: 3, tm2: 5, tool: 8 })
    const visibility = await query<{ id: string; visibility: string }>(`SELECT id, visibility FROM leaderboard_metrics WHERE visibility = 'hidden' ORDER BY id`)
    expect(visibility.map(r => r.id)).toEqual(['model2', 'tm2'])
  })
})

describe('leaderboard filters', () => {
  it('lists only tools and models of rows the leaderboard shows', async () => {
    await metric('a', 'u1', 'tool', 'shown-tool', null, 10, 1)
    await metric('b', 'u1', 'model', null, 'shown-model', 10, 1)
    await metric('c', 'u2', 'tool', 'banned-users-tool', null, 10, 1)
    await metric('d', 'u3', 'model', null, 'private-users-model', 10, 1)
    await metric('e', 'u1', 'tool', 'hidden-tool', null, 10, 1, 'hidden')

    const url = new URL(`http://localhost/api/leaderboard/filters?period_type=daily&period_start=${encodeURIComponent(PERIOD)}`)
    const body = await (await filters({ url } as Parameters<typeof filters>[0])).json()

    expect(body).toEqual({ tools: ['shown-tool'], models: ['shown-model'] })
  })
})

describe('leaderboard first-page cache', () => {
  const options = { periodType: 'daily', periodStart: PERIOD, metric: 'tokens' as const, scope: 'all' as const, tool: null, model: null, cursor: null, currentUserId: null }

  it('keeps an entry at most five minutes, whatever TTL is saved', async () => {
    await query(`INSERT INTO site_config (key, value) VALUES ('leaderboard.cache_ttl_ms', '86400000')`)
    await metric('all', 'u1', 'all', null, null, 10, 1)
    const start = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(start)

    expect((await queryLeaderboard(options)).entries).toHaveLength(1)
    // Hidden by another server instance: this one's cache is not cleared.
    await query(`UPDATE leaderboard_metrics SET visibility = 'hidden'`)

    now.mockReturnValue(start + 60_000)
    expect((await queryLeaderboard(options)).entries).toHaveLength(1)

    now.mockReturnValue(start + 5 * 60_000 + 1)
    expect((await queryLeaderboard(options)).entries).toHaveLength(0)
  })

  it('does not cache with a TTL of zero', async () => {
    await query(`INSERT INTO site_config (key, value) VALUES ('leaderboard.cache_ttl_ms', '0')`)
    await metric('all', 'u1', 'all', null, null, 10, 1)

    expect((await queryLeaderboard(options)).entries).toHaveLength(1)
    await query(`UPDATE leaderboard_metrics SET visibility = 'hidden'`)
    expect((await queryLeaderboard(options)).entries).toHaveLength(0)
  })
})
