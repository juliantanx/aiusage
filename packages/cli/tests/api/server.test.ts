import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { createApiServer } from '../../src/api/server.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { SyncRuntimeController } from '../../src/sync/runtime.js'

function insertTestRecord(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'local00000001',
    ts: new Date().toISOString(),
    ingested_at: Date.now(),
    synced_at: null,
    updated_at: Date.now(),
    line_offset: 0,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    cost: 0.001,
    cost_source: 'pricing',
    session_id: 'session1',
    source_file: '/Users/tjh/.claude/projects/-Users-tjh-WebstormProjects-local-device/session1.jsonl',
    device: 'local-device',
    device_instance_id: 'local-uuid-0000',
  }
  const vals = { ...defaults, ...overrides }
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, thinking_tokens, cost, cost_source, session_id,
      source_file, device, device_instance_id)
    VALUES (@id, @ts, @ingested_at, @synced_at, @updated_at, @line_offset,
      @tool, @model, @provider, @input_tokens, @output_tokens, @cache_read_tokens,
      @cache_write_tokens, @thinking_tokens, @cost, @cost_source, @session_id,
      @source_file, @device, @device_instance_id)
  `).run(vals)
}

function insertTestSyncedRecord(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'synced0000001',
    ts: new Date().toISOString(),
    tool: 'codex',
    model: 'gpt-4.1',
    provider: 'openai',
    input_tokens: 200,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    cost: 0.003,
    cost_source: 'pricing',
    session_key: 'sessionkey1',
    device: 'remote-device',
    device_instance_id: 'remote-uuid-0001',
    updated_at: Date.now(),
  }
  const vals = { ...defaults, ...overrides }
  db.prepare(`
    INSERT INTO synced_records (id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source,
      session_key, device, device_instance_id, updated_at)
    VALUES (@id, @ts, @tool, @model, @provider, @input_tokens, @output_tokens,
      @cache_read_tokens, @cache_write_tokens, @thinking_tokens, @cost, @cost_source,
      @session_key, @device, @device_instance_id, @updated_at)
  `).run(vals)
}

function insertTestPrice(db: Database.Database, modelKey = 'claude-sonnet-4-6') {
  const now = Date.now()
  db.prepare(`
    INSERT INTO model_prices (
      model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
      source_url, origin, status, last_synced_at, created_at, updated_at
    ) VALUES (?, 'anthropic', 3, 15, NULL, NULL, 'USD', 'litellm', ?, NULL, 'builtin', 'active', ?, ?, ?)
  `).run(modelKey, modelKey, now, now, now)
  db.prepare(`
    INSERT INTO model_price_sync_baselines (
      model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
      source_url, last_synced_at, updated_at
    ) VALUES (?, 'anthropic', 3, 15, NULL, NULL, 'USD', 'litellm', ?, NULL, ?, ?)
  `).run(modelKey, modelKey, now, now)
}

async function waitForPricingRecalcDone(baseUrl: string) {
  for (let i = 0; i < 50; i++) {
    const response = await fetch(`${baseUrl}/api/pricing/recalc`)
    expect(response.ok).toBe(true)
    const status = await response.json()
    if (status.state === 'done') return status
    if (status.state === 'error') throw new Error(status.error || 'pricing recalc failed')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('pricing recalc did not finish')
}

describe('API Server', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  it('requires dashboard authentication for protected API routes when password is configured', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    process.env.AIUSAGE_DASHBOARD_PASSWORD = 'secret'
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })

    const protectedRes = await fetch(`${baseUrl}/api/tokens?range=day`)
    expect(protectedRes.status).toBe(401)

    const publicRes = await fetch(`${baseUrl}/api/summary?range=day`)
    expect(publicRes.ok).toBe(true)
  })

  it('allows protected API routes after dashboard login', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    process.env.AIUSAGE_DASHBOARD_PASSWORD = 'secret'
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(loginRes.ok).toBe(true)
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toBeTruthy()

    const protectedRes = await fetch(`${baseUrl}/api/tokens?range=day`, {
      headers: { Cookie: cookie! },
    })
    expect(protectedRes.ok).toBe(true)
  })

  afterEach(async () => {
    delete process.env.AIUSAGE_DASHBOARD_PASSWORD
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('returns summary data', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data).toHaveProperty('totalTokens')
    expect(data).toHaveProperty('totalCost')
  })

  it('returns 400 for invalid range', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=invalid`)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error.code).toBe('INVALID_PARAM')
  })

  it('returns empty data array when no records exist', async () => {
    const response = await fetch(`${baseUrl}/api/tokens?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.data).toEqual([])
  })

  it('returns pricing registry summary for an empty local registry', async () => {
    insertTestRecord(db)

    const response = await fetch(`${baseUrl}/api/pricing`)
    expect(response.ok).toBe(true)
    const data = await response.json()

    expect(data.models).toHaveLength(1)
    expect(data.models[0]).toMatchObject({
      model: 'claude-sonnet-4-6',
      price: null,
      isBuiltin: false,
      isOverride: false,
    })
    expect(data.registry).toEqual({
      totalPrices: 0,
      builtinPrices: 0,
      userPrices: 0,
      activeAliases: 0,
      lastSyncedAt: null,
      localModels: 1,
      matchedLocalModels: 0,
      unresolvedLocalModels: ['claude-sonnet-4-6'],
    })
  })

  it('binds a local model alias to a pricing model', async () => {
    insertTestRecord(db, { model: 'provider/claude-sonnet-4-6', cost: 0, cost_source: 'unknown' })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const before = await fetch(`${baseUrl}/api/pricing`)
    const beforeData = await before.json()
    expect(beforeData.registry.unresolvedLocalModels).toContain('provider/claude-sonnet-4-6')
    expect(beforeData.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: 'claude-sonnet-4-6', origin: 'builtin' }),
    ]))

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'provider/claude-sonnet-4-6', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)
    const bindData = await bind.json()
    expect(bindData).toMatchObject({ ok: true, needsRecalc: true })

    const after = await fetch(`${baseUrl}/api/pricing`)
    const afterData = await after.json()
    expect(afterData.registry.unresolvedLocalModels).not.toContain('provider/claude-sonnet-4-6')
    expect(afterData.localBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: 'provider/claude-sonnet-4-6',
        modelKey: 'claude-sonnet-4-6',
        origin: 'user',
        matchType: 'alias',
      }),
    ]))
    expect(afterData.models[0]).toMatchObject({
      model: 'provider/claude-sonnet-4-6',
      isBuiltin: true,
      matchedBy: 'claude-sonnet-4-6',
    })
  })

  it('unbinds a manual local model alias without recalculating costs', async () => {
    insertTestRecord(db, { model: 'provider/claude-sonnet-4-6', cost: 0, cost_source: 'unknown' })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'provider/claude-sonnet-4-6', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)

    const unbind = await fetch(`${baseUrl}/api/pricing/alias?alias=${encodeURIComponent('provider/claude-sonnet-4-6')}`, { method: 'DELETE' })
    expect(unbind.ok).toBe(true)
    expect(await unbind.json()).toMatchObject({ ok: true, needsRecalc: true })

    const after = await fetch(`${baseUrl}/api/pricing`)
    const afterData = await after.json()
    expect(afterData.registry.unresolvedLocalModels).toContain('provider/claude-sonnet-4-6')
    expect(afterData.localBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: 'provider/claude-sonnet-4-6',
        modelKey: null,
        hasPrice: false,
      }),
    ]))

    const unchanged = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(unchanged.cost).toBe(0)
    expect(unchanged.cost_source).toBe('unknown')
  })

  it('recalculates pricing costs only after the explicit recalc endpoint is triggered', async () => {
    insertTestRecord(db, {
      model: 'provider/claude-sonnet-4-6',
      provider: 'unknown',
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cost: 0,
      cost_source: 'unknown',
    })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'provider/claude-sonnet-4-6', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)
    expect(await bind.json()).toMatchObject({ ok: true, needsRecalc: true })

    const unchanged = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(unchanged.cost).toBe(0)
    expect(unchanged.cost_source).toBe('unknown')

    const start = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(start.status).toBe(202)
    const startData = await start.json()
    expect(startData.accepted).toBe(true)
    expect(startData.status.state).toBe('running')

    const done = await waitForPricingRecalcDone(baseUrl)
    expect(done.total).toBe(1)
    expect(done.processed).toBe(1)
    expect(done.updated).toBe(1)

    const recalculated = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(recalculated.cost_source).toBe('pricing')
    expect(recalculated.cost).toBeCloseTo(10.5)
  })

  it('reports pricing changes as needing recalculation until recalculation completes', async () => {
    insertTestRecord(db, {
      model: 'claude-sonnet-4-6',
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cost: 0,
      cost_source: 'unknown',
    })

    const update = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', input: 6, output: 12, currency: 'USD' }),
    })
    expect(update.ok).toBe(true)
    const updateData = await update.json()
    expect(updateData).toMatchObject({ ok: true, needsRecalc: true })
    expect(typeof updateData.needsRecalcSince).toBe('number')

    const pending = await fetch(`${baseUrl}/api/pricing/recalc`)
    expect(pending.ok).toBe(true)
    const pendingStatus = await pending.json()
    expect(pendingStatus).toMatchObject({
      state: 'idle',
      needsRecalc: true,
      needsRecalcSince: updateData.needsRecalcSince,
    })

    const start = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(start.status).toBe(202)
    const startData = await start.json()
    expect(startData.status).toMatchObject({
      state: 'running',
      needsRecalc: true,
      needsRecalcSince: updateData.needsRecalcSince,
    })

    const done = await waitForPricingRecalcDone(baseUrl)
    expect(done).toMatchObject({
      state: 'done',
      needsRecalc: false,
      needsRecalcSince: null,
    })

    const finalStatusResponse = await fetch(`${baseUrl}/api/pricing/recalc`)
    const finalStatus = await finalStatusResponse.json()
    expect(finalStatus).toMatchObject({
      state: 'done',
      needsRecalc: false,
      needsRecalcSince: null,
    })
  })

  it('starts pricing recalculation even when other database writes are queued', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    server = createApiServer(db, {
      getDbWriteQueueStatus: () => ({ running: true, pending: 8 }),
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })

    insertTestRecord(db, {
      model: 'claude-sonnet-4-6',
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cost: 0,
      cost_source: 'unknown',
    })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const start = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(start.status).toBe(202)
    const startData = await start.json()
    expect(startData.accepted).toBe(true)
    expect(startData.status).toMatchObject({ state: 'running', queueRunning: false, queuePending: 0 })

    const done = await waitForPricingRecalcDone(baseUrl)
    expect(done.state).toBe('done')
    expect(done.updated).toBe(1)
  })

  it('shows corrected Sessions cost after a manual price overrides a log-sourced cost (issue #13)', async () => {
    // Hermes record from a custom gateway: the gateway's self-reported cost is
    // unreliable (≈0), stored as cost_source = 'log', so Sessions shows $0.00.
    insertTestRecord(db, {
      tool: 'hermes',
      model: 'deepseek-v4-pro',
      provider: 'openclaw',
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cost: 0,
      cost_source: 'log',
      session_id: 'hermes-session-1',
    })

    // Sessions menu before fix: cost is 0.
    const before = await fetch(`${baseUrl}/api/sessions?range=all`)
    expect(before.ok).toBe(true)
    const beforeData = await before.json()
    const beforeSession = beforeData.sessions.find((s: any) => s.sessionId === 'hermes-session-1')
    expect(beforeSession.cost).toBe(0)

    // User configures a price in the Pricing UI for this exact model.
    const put = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-v4-pro', input: 1, output: 2, currency: 'USD' }),
    })
    expect(put.ok).toBe(true)
    expect(await put.json()).toMatchObject({ ok: true, needsRecalc: true })

    // Trigger recalc and wait for completion.
    const start = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(start.status).toBe(202)
    const done = await waitForPricingRecalcDone(baseUrl)
    expect(done.updated).toBe(1)

    // The record itself is now priced.
    const record = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(record.cost_source).toBe('pricing')
    // 1M input * $1 + 0.5M output * $2 = 2
    expect(record.cost).toBeCloseTo(2)

    // Sessions menu now shows the corrected cost.
    const after = await fetch(`${baseUrl}/api/sessions?range=all`)
    const afterData = await after.json()
    const afterSession = afterData.sessions.find((s: any) => s.sessionId === 'hermes-session-1')
    expect(afterSession.cost).toBeCloseTo(2)
  })

  it('resets a modified synced price back to the synced baseline', async () => {
    insertTestRecord(db, {
      model: 'claude-sonnet-4-6',
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', input: 30, output: 60, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const modified = await fetch(`${baseUrl}/api/pricing`)
    const modifiedData = await modified.json()
    expect(modifiedData.models[0]).toMatchObject({
      model: 'claude-sonnet-4-6',
      isOverride: true,
      hasSyncedBaseline: true,
    })
    expect(modifiedData.models[0].price).toMatchObject({ input: 30, output: 60 })

    const reset = await fetch(`${baseUrl}/api/pricing?model=${encodeURIComponent('claude-sonnet-4-6')}`, { method: 'DELETE' })
    expect(reset.ok).toBe(true)

    const restored = await fetch(`${baseUrl}/api/pricing`)
    const restoredData = await restored.json()
    expect(restoredData.models[0]).toMatchObject({
      model: 'claude-sonnet-4-6',
      isBuiltin: true,
      isOverride: false,
      hasSyncedBaseline: true,
    })
    expect(restoredData.models[0].price).toMatchObject({ input: 3, output: 15 })
  })

  it('keeps manual local model bindings when resetting a target price', async () => {
    insertTestRecord(db, {
      model: 'local-sonnet-alias',
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', input: 30, output: 60, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'local-sonnet-alias', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)

    const reset = await fetch(`${baseUrl}/api/pricing?model=${encodeURIComponent('claude-sonnet-4-6')}`, { method: 'DELETE' })
    expect(reset.ok).toBe(true)

    const restored = await fetch(`${baseUrl}/api/pricing`)
    const restoredData = await restored.json()
    expect(restoredData.aliasBindings).toContainEqual(expect.objectContaining({
      alias: 'local-sonnet-alias',
      modelKey: 'claude-sonnet-4-6',
      origin: 'user',
    }))
    expect(restoredData.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      modelKey: 'claude-sonnet-4-6',
      origin: 'user',
      priceOrigin: 'builtin',
      matchType: 'alias',
      bindingType: 'manual',
      hasManualBinding: true,
      hasPrice: true,
    }))
  })

  it('marks direct custom prices separately from manual bindings', async () => {
    insertTestRecord(db, { model: 'local-custom-model' })

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local-custom-model', input: 12, output: 24, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const response = await fetch(`${baseUrl}/api/pricing`)
    const data = await response.json()
    expect(data.aliasBindings).not.toContainEqual(expect.objectContaining({
      alias: 'local-custom-model',
      modelKey: 'local-custom-model',
      origin: 'user',
    }))
    expect(data.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-custom-model',
      modelKey: 'local-custom-model',
      origin: 'user',
      priceOrigin: 'user',
      matchType: 'exact',
      bindingType: 'custom',
      hasManualBinding: false,
      hasPrice: true,
    }))
  })

  it('clears direct custom pricing after reset when no manual binding exists', async () => {
    insertTestRecord(db, { model: 'local-custom-model' })

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local-custom-model', input: 12, output: 24, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const reset = await fetch(`${baseUrl}/api/pricing?model=${encodeURIComponent('local-custom-model')}`, { method: 'DELETE' })
    expect(reset.ok).toBe(true)

    const response = await fetch(`${baseUrl}/api/pricing`)
    const data = await response.json()
    expect(data.aliasBindings).not.toContainEqual(expect.objectContaining({
      alias: 'local-custom-model',
      modelKey: 'local-custom-model',
    }))
    expect(data.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-custom-model',
      modelKey: null,
      priceOrigin: null,
      matchType: null,
      bindingType: 'none',
      hasManualBinding: false,
      hasPrice: false,
    }))
  })

  it('marks manual bindings to edited pricing models as custom pricing', async () => {
    insertTestRecord(db, { model: 'local-sonnet-alias' })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'local-sonnet-alias', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', input: 30, output: 60, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const response = await fetch(`${baseUrl}/api/pricing`)
    const data = await response.json()
    expect(data.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      modelKey: 'claude-sonnet-4-6',
      origin: 'user',
      priceOrigin: 'user',
      matchType: 'alias',
      bindingType: 'custom',
      hasManualBinding: true,
      hasPrice: true,
    }))
  })

  it('lets a direct custom price override a manual binding until reset', async () => {
    insertTestRecord(db, {
      model: 'local-sonnet-alias',
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cost: 0,
    })
    insertTestPrice(db, 'claude-sonnet-4-6')

    const bind = await fetch(`${baseUrl}/api/pricing/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'local-sonnet-alias', modelKey: 'claude-sonnet-4-6' }),
    })
    expect(bind.ok).toBe(true)

    const override = await fetch(`${baseUrl}/api/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local-sonnet-alias', input: 20, output: 40, currency: 'USD' }),
    })
    expect(override.ok).toBe(true)

    const customized = await fetch(`${baseUrl}/api/pricing`)
    const customizedData = await customized.json()
    expect(customizedData.models).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      isOverride: true,
      matchedBy: null,
      price: expect.objectContaining({ input: 20, output: 40 }),
    }))
    expect(customizedData.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      modelKey: 'claude-sonnet-4-6',
      priceOrigin: 'user',
      bindingType: 'custom',
      hasManualBinding: true,
      hasPrice: true,
    }))

    const customRecalc = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(customRecalc.ok).toBe(true)
    await waitForPricingRecalcDone(baseUrl)
    const customCost = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(customCost.cost_source).toBe('pricing')
    expect(customCost.cost).toBeCloseTo(60)

    const reset = await fetch(`${baseUrl}/api/pricing?model=${encodeURIComponent('local-sonnet-alias')}`, { method: 'DELETE' })
    expect(reset.ok).toBe(true)

    const restored = await fetch(`${baseUrl}/api/pricing`)
    const restoredData = await restored.json()
    expect(restoredData.models).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      isOverride: false,
      matchedBy: 'claude-sonnet-4-6',
      price: expect.objectContaining({ input: 3, output: 15 }),
    }))
    expect(restoredData.localBindings).toContainEqual(expect.objectContaining({
      model: 'local-sonnet-alias',
      modelKey: 'claude-sonnet-4-6',
      priceOrigin: 'builtin',
      bindingType: 'manual',
      hasManualBinding: true,
      hasPrice: true,
    }))

    const restoredRecalc = await fetch(`${baseUrl}/api/pricing/recalc`, { method: 'POST' })
    expect(restoredRecalc.ok).toBe(true)
    await waitForPricingRecalcDone(baseUrl)
    const restoredCost = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('local00000001') as any
    expect(restoredCost.cost_source).toBe('pricing')
    expect(restoredCost.cost).toBeCloseTo(18)
  })
})

describe('Device filtering', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string
  const CURRENT_DEVICE_ID = 'local-uuid-0000'

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    insertTestRecord(db)
    insertTestSyncedRecord(db)
    server = createApiServer(db, { currentDeviceInstanceId: CURRENT_DEVICE_ID })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('GET /api/devices returns device list', async () => {
    const res = await fetch(`${baseUrl}/api/devices`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.currentDeviceInstanceId).toBe(CURRENT_DEVICE_ID)
    expect(data.devices.length).toBe(2)
    expect(data.devices[0].deviceInstanceId).toBe(CURRENT_DEVICE_ID)
  })

  it('summary with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all`)
    const data = await res.json()
    // local: 100 input + 50 output = 150 tokens
    // remote synced: 200 input + 100 output = 300 tokens
    expect(data.totalTokens).toBe(450)
  })

  it('summary with current device returns only local data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all&device=${CURRENT_DEVICE_ID}`)
    const data = await res.json()
    expect(data.totalTokens).toBe(150)
  })

  it('summary with other device returns only that device synced data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all&device=remote-uuid-0001`)
    const data = await res.json()
    expect(data.totalTokens).toBe(300)
  })

  it('tokens with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/tokens?range=all`)
    const data = await res.json()
    expect(data.data.length).toBeGreaterThan(0)
    const totalInput = data.data.reduce((s: number, d: any) => s + d.inputTokens, 0)
    expect(totalInput).toBe(300) // 100 local + 200 remote
  })

  it('tokens with current device returns only local', async () => {
    const res = await fetch(`${baseUrl}/api/tokens?range=all&device=${CURRENT_DEVICE_ID}`)
    const data = await res.json()
    const totalInput = data.data.reduce((s: number, d: any) => s + d.inputTokens, 0)
    expect(totalInput).toBe(100)
  })

  it('cost with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/cost?range=all`)
    const data = await res.json()
    expect(data.byTool['claude-code']).toBeCloseTo(0.001)
    expect(data.byTool['codex']).toBeCloseTo(0.003)
  })

  it('models with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/models?range=all`)
    const data = await res.json()
    const models = data.models.map((m: any) => m.model)
    expect(models).toContain('claude-sonnet-4-6')
    expect(models).toContain('gpt-4.1')
  })

  it('models returns per-model token breakdown, total cost, and token percentage', async () => {
    insertTestRecord(db, {
      id: 'local00000002',
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 10,
      cache_write_tokens: 5,
      thinking_tokens: 15,
      cost: 0.002,
      session_id: 'session2',
    })
    insertTestSyncedRecord(db, {
      id: 'synced0000002',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 20,
      cache_write_tokens: 10,
      thinking_tokens: 30,
      cost: 0.004,
      session_key: 'sessionkey2',
    })

    const res = await fetch(`${baseUrl}/api/models?range=all`)
    const data = await res.json()
    const model = data.models.find((m: any) => m.model === 'claude-sonnet-4-6')

    expect(model).toMatchObject({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      callCount: 3,
      inputTokens: 300,
      outputTokens: 150,
      cacheReadTokens: 30,
      cacheWriteTokens: 15,
      thinkingTokens: 45,
      totalTokens: 540,
    })
    expect(model.totalCost).toBeCloseTo(0.007)
    expect(model.percentage).toBeCloseTo(64.3, 1)
  })

  it('models returns an empty list when only unknown models match', async () => {
    insertTestRecord(db, {
      id: 'localunknown001',
      model: 'unknown',
      provider: 'unknown',
      input_tokens: 10,
      output_tokens: 5,
      cost: 0.001,
      session_id: 'unknown-session',
      tool: 'opencode',
    })

    const res = await fetch(`${baseUrl}/api/models?range=all&tool=opencode&device=${CURRENT_DEVICE_ID}`)
    expect(res.ok).toBe(true)
    const data = await res.json()

    expect(data.models).toEqual([])
  })

  it('models returns synced-only breakdown for a remote device', async () => {
    insertTestSyncedRecord(db, {
      id: 'synced0000002',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 20,
      cache_write_tokens: 10,
      thinking_tokens: 30,
      cost: 0.004,
      session_key: 'sessionkey2',
    })

    const res = await fetch(`${baseUrl}/api/models?range=all&device=remote-uuid-0001`)
    const data = await res.json()
    const model = data.models.find((m: any) => m.model === 'claude-sonnet-4-6')

    expect(model).toMatchObject({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      callCount: 1,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      thinkingTokens: 30,
      totalTokens: 210,
    })
    expect(model.totalCost).toBeCloseTo(0.004)
    expect(model.percentage).toBeCloseTo(41.2, 1)
  })

  it('models returns local-only breakdown for the current device', async () => {
    insertTestRecord(db, {
      id: 'local00000002',
      input_tokens: 200,
      output_tokens: 100,
      cache_read_tokens: 30,
      cache_write_tokens: 15,
      thinking_tokens: 45,
      cost: 0.006,
      session_id: 'session2',
    })

    const res = await fetch(`${baseUrl}/api/models?range=all&device=${CURRENT_DEVICE_ID}`)
    const data = await res.json()
    const model = data.models.find((m: any) => m.model === 'claude-sonnet-4-6')

    expect(model).toMatchObject({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      callCount: 2,
      inputTokens: 300,
      outputTokens: 150,
      cacheReadTokens: 30,
      cacheWriteTokens: 15,
      thinkingTokens: 45,
      totalTokens: 540,
    })
    expect(model.totalCost).toBeCloseTo(0.007)
    expect(model.percentage).toBeCloseTo(100, 1)
  })

  it('sessions with other device returns empty', async () => {
    const res = await fetch(`${baseUrl}/api/sessions?range=all&device=remote-uuid-0001`)
    const data = await res.json()
    expect(data.sessions).toEqual([])
  })

  it('projects with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/projects?range=all`)
    const data = await res.json()
    expect(data.projects.length).toBeGreaterThan(0)
  })

  it('summary applies tool filter across merged devices', async () => {
    // Insert a second local record with tool 'opencode'
    insertTestRecord(db, { id: 'local00000002', tool: 'opencode', input_tokens: 300, output_tokens: 150, cost: 0.005, session_id: 'session2' })

    const res = await fetch(`${baseUrl}/api/summary?range=all&tool=opencode`)
    const data = await res.json()
    // Only the opencode record should be counted: 300 + 150 = 450
    expect(data.totalTokens).toBe(450)
    expect(Object.keys(data.byTool)).toEqual(['opencode'])
  })

  it('tokens applies tool filter across merged devices', async () => {
    insertTestRecord(db, { id: 'local00000002', tool: 'opencode', input_tokens: 300, output_tokens: 150, cost: 0.005, session_id: 'session2' })
    insertTestSyncedRecord(db, { id: 'synced0000002', tool: 'opencode', input_tokens: 400, output_tokens: 200, cost: 0.007, session_key: 'sessionkey2' })

    const res = await fetch(`${baseUrl}/api/tokens?range=all&tool=opencode`)
    const data = await res.json()
    const totalInput = data.data.reduce((s: number, d: any) => s + d.inputTokens, 0)
    // opencode: 300 local + 400 remote = 700
    expect(totalInput).toBe(700)
  })

  it('cost applies tool and device filter together', async () => {
    const res = await fetch(`${baseUrl}/api/cost?range=all&device=remote-uuid-0001&tool=opencode`)
    const data = await res.json()
    // remote synced record has tool 'codex' by default, so opencode filter returns nothing
    expect(Object.keys(data.byTool)).toEqual([])
  })

  it('cost with tool filter returns matching tool only', async () => {
    const res = await fetch(`${baseUrl}/api/cost?range=all&tool=codex`)
    const data = await res.json()
    expect(data.byTool['codex']).toBeCloseTo(0.003)
    expect(Object.keys(data.byTool)).toEqual(['codex'])
  })

  it('projects derives claude project names instead of grouping them as unknown', async () => {
    insertTestRecord(db, {
      id: 'local00000002',
      source_file: '/Users/tjh/.claude/projects/-Users-tjh-WebstormProjects-aiusage/session-2.jsonl',
      session_id: 'session-2',
    })

    const res = await fetch(`${baseUrl}/api/projects?range=all`)
    const data = await res.json()
    const names = data.projects.map((project: any) => project.name)

    expect(names).toContain('aiusage')
    expect(names).not.toContain('unknown')
  })

  it('projects uses generic path fallback for non-claude local records', async () => {
    insertTestRecord(db, {
      id: 'local00000003',
      tool: 'opencode',
      source_file: '/Users/tjh/worktrees/demo-app/sessions/rollout-123.jsonl',
      session_id: 'session-3',
    })

    const res = await fetch(`${baseUrl}/api/projects?range=all`)
    const data = await res.json()
    const project = data.projects.find((entry: any) => entry.name === 'demo-app')

    expect(project).toMatchObject({ name: 'demo-app', sessions: 1 })
  })
})

describe('Tool calls API', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string
  const DEVICE_ID = 'local-uuid-0000'

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db, { currentDeviceInstanceId: DEVICE_ID })
    baseUrl = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        resolve(`http://127.0.0.1:${address.port}`)
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('/api/tool-calls counts orphan tool calls (record_id IS NULL)', async () => {
    // A linked tool call (has a matching record)
    insertTestRecord(db, { id: 'rec1' })
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_linked', 'rec1', 'claude-code', 'Bash', Date.now(), 0)

    // Orphan tool calls (no record) — e.g. from ZCode, Codex backfill
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_orphan1', null, 'zcode', 'Bash', Date.now(), 0)
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_orphan2', null, 'zcode', 'Read', Date.now(), 1)

    const res = await fetch(`${baseUrl}/api/tool-calls?range=all`)
    const data = await res.json()

    // All three should be counted, including orphans
    const bashRow = data.toolCalls.find((r: any) => r.name === 'Bash')
    const readRow = data.toolCalls.find((r: any) => r.name === 'Read')
    expect(bashRow.count).toBe(2) // 1 linked + 1 orphan
    expect(readRow.count).toBe(1) // 1 orphan
  })

  it('dashboard topToolCalls includes orphan calls', async () => {
    insertTestRecord(db, { id: 'rec1' })
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_linked', 'rec1', 'claude-code', 'Edit', Date.now(), 0)
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_orphan1', null, 'zcode', 'Bash', Date.now(), 0)
    db.prepare(`INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('tc_orphan2', null, 'zcode', 'Bash', Date.now(), 1)

    const res = await fetch(`${baseUrl}/api/summary?range=all`)
    const data = await res.json()

    const bashRow = data.topToolCalls.find((r: any) => r.name === 'Bash')
    expect(bashRow).toBeDefined()
    expect(bashRow.count).toBe(2) // both orphans
  })
})

describe('Sync API', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('starts sync in the background and reports running status', async () => {
    let resolveSync: (() => void) | null = null
    let persistedStatus = {
      deviceInstanceId: 'dev-1',
      lastSyncStatus: 'failed' as const,
      lastSyncError: 'Previous failure',
    }

    const controller = new SyncRuntimeController({
      runSync: ({ onProgress }) => new Promise<void>((resolve) => {
        resolveSync = () => {
          persistedStatus = {
            ...persistedStatus,
            lastSyncStatus: 'ok',
            lastSyncError: undefined,
            lastSyncAt: Date.now(),
            lastSyncUploaded: 10,
            lastSyncPulled: 2,
          }
          resolve()
        }
        onProgress?.({ phase: 'uploading', currentPath: '2026/05.ndjson', completedFiles: 0, totalFiles: 1, uploadedCount: 0 })
      }),
      getPersistedState: () => persistedStatus,
    })

    server = createApiServer(db, {
      onSyncStart: () => controller.start(),
      getSyncStatus: () => controller.getStatus(),
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })

    const startRes = await fetch(`${baseUrl}/api/sync`, { method: 'POST' })
    expect(startRes.status).toBe(202)
    const startData = await startRes.json()
    expect(startData.accepted).toBe(true)
    expect(startData.status.isRunning).toBe(true)
    expect(startData.status.phase).toBeUndefined()

    const duplicateRes = await fetch(`${baseUrl}/api/sync`, { method: 'POST' })
    expect(duplicateRes.status).toBe(200)
    const duplicateData = await duplicateRes.json()
    expect(duplicateData.accepted).toBe(false)
    expect(duplicateData.alreadyRunning).toBe(true)
    expect(duplicateData.status.phase).toBe('uploading')

    resolveSync?.()
    await new Promise(resolve => setTimeout(resolve, 0))

    const statusRes = await fetch(`${baseUrl}/api/sync`)
    expect(statusRes.ok).toBe(true)
    const statusData = await statusRes.json()
    expect(statusData.status.isRunning).toBe(false)
    expect(statusData.status.lastSyncStatus).toBe('ok')
    expect(statusData.status.lastSyncUploaded).toBe(10)
  })

  it('defers sync work until after start returns', async () => {
    let resolveSync: (() => void) | null = null
    let started = false
    const controller = new SyncRuntimeController({
      runSync: () => new Promise<void>((resolve) => {
        started = true
        resolveSync = resolve
      }),
      getPersistedState: () => ({ deviceInstanceId: 'dev-1', lastSyncStatus: 'failed' as const }),
    })

    const result = controller.start()
    expect(result.accepted).toBe(true)
    expect(started).toBe(false)

    await new Promise(resolve => setImmediate(resolve))
    expect(started).toBe(true)

    resolveSync?.()
  })
})
