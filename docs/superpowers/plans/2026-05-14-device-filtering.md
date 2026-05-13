# Device Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-device data merging and device filtering to the Web Dashboard and CLI `aiusage summary`.

**Architecture:** Add a `getDeviceFilter()` helper to the API server that returns SQL fragments for device-scoped queries (UNION of `records` + `synced_records` for "all devices", single-table for specific device). Add `/api/devices` endpoint. Add `DeviceSelector` Svelte component with a store. Update all Dashboard pages and CLI summary to support device filtering.

**Tech Stack:** TypeScript, better-sqlite3, Svelte, Commander.js, vitest

---

### Task 1: Add `getDeviceFilter` helper and `currentDeviceInstanceId` to API server

**Files:**
- Modify: `packages/cli/src/api/server.ts`
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write failing tests for `getDeviceFilter`**

Add tests to `packages/cli/tests/api/server.test.ts` that verify the three device filter branches. Insert a test record into `records` and a test record into `synced_records` with a different `device_instance_id`, then query `/api/summary` with various `device` params.

```typescript
// Add to packages/cli/tests/api/server.test.ts

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
    source_file: '/test/file.jsonl',
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
    await new Promise<void>((resolve) => server.close(() => resolve()))
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/api/server.test.ts`
Expected: FAIL — `currentDeviceInstanceId` option not recognized, `/api/devices` returns 404

- [ ] **Step 3: Add `currentDeviceInstanceId` to `ApiServerOptions` and implement `getDeviceFilter`**

In `packages/cli/src/api/server.ts`, update the options interface and add the helper function:

```typescript
export interface ApiServerOptions {
  db: Database.Database
  currentDeviceInstanceId?: string
  onRefresh?: () => Promise<{ parsedCount: number; toolCallCount: number; errors: string[] }>
  onSync?: () => Promise<{ status: string; pulledCount: number; uploadedCount: number; mergedCount: number; error?: string }>
  getSyncStatus?: () => { lastSyncAt?: number; lastSyncStatus?: string; lastSyncTarget?: string; lastSyncUploaded?: number; lastSyncPulled?: number } | null
}

interface DeviceFilter {
  /** SQL fragment for WHERE clause (prepend with AND) */
  where: string
  /** Named parameters for the WHERE fragment */
  params: Record<string, unknown>
  /** True when query should UNION records + synced_records */
  useUnion: boolean
}

function getDeviceFilter(
  device: string | null | undefined,
  currentDeviceInstanceId: string | undefined,
): DeviceFilter {
  if (!currentDeviceInstanceId) {
    // No device instance ID available — query only records (legacy behavior)
    return { where: '', params: {}, useUnion: false }
  }

  if (!device) {
    // All devices: UNION records + synced_records (excluding current device's synced副本)
    return {
      where: '',
      params: { currentDeviceId: currentDeviceInstanceId },
      useUnion: true,
    }
  }

  if (device === currentDeviceInstanceId) {
    // Current device only: query records only
    return { where: '', params: {}, useUnion: false }
  }

  // Specific other device: query synced_records only
  return {
    where: 'AND device_instance_id = @deviceId',
    params: { deviceId: device },
    useUnion: false,
  }
}
```

- [ ] **Step 4: Add `/api/devices` endpoint**

In the `createApiServer` function, add the endpoint handler before the 404 handler:

```typescript
// ── /api/devices ──────────────────────────────────────────────
if (url.pathname === '/api/devices') {
  const currentId = options?.currentDeviceInstanceId
  if (!currentId) {
    json(res, { currentDeviceInstanceId: null, devices: [] })
    return
  }

  // Current device from records
  const localRow = db.prepare(`
    SELECT device, device_instance_id AS deviceInstanceId, COUNT(*) AS recordCount
    FROM records
    GROUP BY device_instance_id
  `).all() as any[]

  // Other devices from synced_records (exclude current device副本)
  const syncedRows = db.prepare(`
    SELECT device, device_instance_id AS deviceInstanceId, COUNT(*) AS recordCount
    FROM synced_records
    WHERE device_instance_id != @currentId
    GROUP BY device_instance_id
  `).all({ currentId }) as any[]

  // Merge and deduplicate
  const deviceMap = new Map<string, { device: string; deviceInstanceId: string; recordCount: number }>()
  for (const row of localRows) {
    deviceMap.set(row.deviceInstanceId, { device: row.device, deviceInstanceId: row.deviceInstanceId, recordCount: row.recordCount })
  }
  for (const row of syncedRows) {
    const existing = deviceMap.get(row.deviceInstanceId)
    if (existing) {
      existing.recordCount += row.recordCount
    } else {
      deviceMap.set(row.deviceInstanceId, { device: row.device, deviceInstanceId: row.deviceInstanceId, recordCount: row.recordCount })
    }
  }

  const devices = [...deviceMap.values()].sort((a, b) => b.recordCount - a.recordCount)
  json(res, { currentDeviceInstanceId: currentId, devices })
  return
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/api/server.test.ts`
Expected: All 4 new device filtering tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/server.test.ts
git commit -m "feat(api): add getDeviceFilter helper and /api/devices endpoint"
```

---

### Task 2: Add device filtering to `/api/summary` endpoint

**Files:**
- Modify: `packages/cli/src/api/server.ts:86-143` (summary handler)
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write failing test for summary with device filtering**

The tests from Task 1 already cover this (`summary with no device param`, `summary with current device`, `summary with other device`). Verify they fail for the summary-specific UNION logic.

- [ ] **Step 2: Implement device filtering in `/api/summary`**

Replace the summary handler in `packages/cli/src/api/server.ts`. The key change: when `useUnion` is true, query both `records` and `synced_records` with a UNION. When `device` is specified as another device, query only `synced_records`.

```typescript
if (url.pathname === '/api/summary') {
  if (range && !['day', 'week', 'month', 'last30', 'all'].includes(range)) {
    json(res, { error: { code: 'INVALID_PARAM', message: 'Invalid range' } }, 400)
    return
  }
  const dr = getDateRangeFilter(range, from, to)
  const device = url.searchParams.get('device')
  const df = getDeviceFilter(device, options?.currentDeviceInstanceId)

  let totalsSql: string
  let totalsParams: Record<string, unknown>

  if (df.useUnion) {
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
        COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(DISTINCT substr(ts, 1, 10)) AS activeDays,
        COUNT(DISTINCT session_id) AS totalSessions
      FROM (
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts, session_id FROM records WHERE 1=1 ${dr.where}
        UNION ALL
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts, session_key AS session_id FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where}
      )`
    totalsParams = { ...dr.params, currentDeviceId: df.params.currentDeviceId }
  } else if (device && device !== options?.currentDeviceInstanceId) {
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
        COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(DISTINCT substr(ts, 1, 10)) AS activeDays,
        COUNT(DISTINCT session_key) AS totalSessions
      FROM synced_records WHERE 1=1 ${df.where} ${dr.where}`
    totalsParams = { ...df.params, ...dr.params }
  } else {
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
        COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(DISTINCT substr(ts, 1, 10)) AS activeDays,
        COUNT(DISTINCT session_id) AS totalSessions
      FROM records WHERE 1=1 ${dr.where}`
    totalsParams = { ...dr.params }
  }

  const totals = db.prepare(totalsSql).get(totalsParams) as any

  // byTool query — same UNION pattern
  let byToolSql: string
  if (df.useUnion) {
    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM (
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts FROM records WHERE 1=1 ${dr.where}
        UNION ALL
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where}
      )
      GROUP BY tool ORDER BY cost DESC`
  } else if (device && device !== options?.currentDeviceInstanceId) {
    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM synced_records WHERE 1=1 ${df.where} ${dr.where}
      GROUP BY tool ORDER BY cost DESC`
  } else {
    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM records WHERE 1=1 ${dr.where}
      GROUP BY tool ORDER BY cost DESC`
  }

  const byToolRows = db.prepare(byToolSql).all(df.useUnion ? { ...dr.params, currentDeviceId: df.params.currentDeviceId } : { ...df.params, ...dr.params }) as any[]

  const byTool: Record<string, { tokens: number; cost: number }> = {}
  for (const row of byToolRows) {
    byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
  }

  // topToolCalls — always local only (tool_calls not synced)
  const drJoin = getDateRangeFilter(range, from, to, 'r')
  const topToolCalls = db.prepare(`
    SELECT tc.name, COUNT(*) AS count
    FROM tool_calls tc
    JOIN records r ON r.id = tc.record_id
    WHERE 1=1 ${drJoin.where}
    GROUP BY tc.name ORDER BY count DESC LIMIT 10
  `).all(drJoin.params) as any[]

  json(res, {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens,
    thinkingTokens: totals.thinkingTokens,
    totalTokens: totals.totalTokens,
    totalCost: totals.totalCost,
    activeDays: totals.activeDays,
    totalSessions: totals.totalSessions,
    byTool,
    topToolCalls,
  })
  return
}
```

- [ ] **Step 3: Run tests**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/api/server.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/api/server.ts
git commit -m "feat(api): add device filtering to /api/summary endpoint"
```

---

### Task 3: Add device filtering to `/api/tokens` and `/api/cost` endpoints

**Files:**
- Modify: `packages/cli/src/api/server.ts` (tokens and cost handlers)
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
it('tokens with no device param returns merged data', async () => {
  const res = await fetch(`${baseUrl}/api/tokens?range=all`)
  const data = await res.json()
  expect(data.data.length).toBeGreaterThan(0)
  // Should include tokens from both local and remote
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
  // local cost: 0.001, remote cost: 0.003
  expect(data.byTool['claude-code']).toBeCloseTo(0.001)
  expect(data.byTool['codex']).toBeCloseTo(0.003)
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement device filtering in `/api/tokens` and `/api/cost`**

Apply the same UNION pattern as Task 2 to the tokens and cost handlers. Each handler reads `device` from query params, calls `getDeviceFilter`, and branches on `useUnion`.

For `/api/tokens`:
```typescript
if (url.pathname === '/api/tokens') {
  const dr = getDateRangeFilter(range, from, to)
  const device = url.searchParams.get('device')
  const df = getDeviceFilter(device, options?.currentDeviceInstanceId)

  let sql: string
  let params: Record<string, unknown>

  if (df.useUnion) {
    sql = `
      SELECT substr(ts, 1, 10) AS date,
             SUM(input_tokens) AS inputTokens,
             SUM(output_tokens) AS outputTokens,
             SUM(cache_read_tokens) AS cacheReadTokens,
             SUM(cache_write_tokens) AS cacheWriteTokens,
             SUM(thinking_tokens) AS thinkingTokens
      FROM (
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, ts FROM records WHERE 1=1 ${dr.where}
        UNION ALL
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, ts FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where}
      )
      GROUP BY date ORDER BY date`
    params = { ...dr.params, currentDeviceId: df.params.currentDeviceId }
  } else if (device && device !== options?.currentDeviceInstanceId) {
    sql = `
      SELECT substr(ts, 1, 10) AS date,
             SUM(input_tokens) AS inputTokens,
             SUM(output_tokens) AS outputTokens,
             SUM(cache_read_tokens) AS cacheReadTokens,
             SUM(cache_write_tokens) AS cacheWriteTokens,
             SUM(thinking_tokens) AS thinkingTokens
      FROM synced_records WHERE 1=1 ${df.where} ${dr.where}
      GROUP BY date ORDER BY date`
    params = { ...df.params, ...dr.params }
  } else {
    sql = `
      SELECT substr(ts, 1, 10) AS date,
             SUM(input_tokens) AS inputTokens,
             SUM(output_tokens) AS outputTokens,
             SUM(cache_read_tokens) AS cacheReadTokens,
             SUM(cache_write_tokens) AS cacheWriteTokens,
             SUM(thinking_tokens) AS thinkingTokens
      FROM records WHERE 1=1 ${dr.where}
      GROUP BY date ORDER BY date`
    params = { ...dr.params }
  }

  const rows = db.prepare(sql).all(params) as any[]
  json(res, { data: rows })
  return
}
```

Apply the same pattern to `/api/cost` (both daily and byTool/byModel sub-queries).

- [ ] **Step 4: Run tests**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/api/server.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/server.test.ts
git commit -m "feat(api): add device filtering to /api/tokens and /api/cost"
```

---

### Task 4: Add device filtering to `/api/models`, `/api/projects`, and `/api/sessions` endpoints

**Files:**
- Modify: `packages/cli/src/api/server.ts`
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
it('models with no device param returns merged data', async () => {
  const res = await fetch(`${baseUrl}/api/models?range=all`)
  const data = await res.json()
  const models = data.models.map((m: any) => m.model)
  expect(models).toContain('claude-sonnet-4-6')
  expect(models).toContain('gpt-4.1')
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
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement device filtering**

For `/api/models` and `/api/projects`: apply the same UNION pattern.

For `/api/sessions` and `/api/tool-calls`: these only query local data per spec. When `device` is specified as another device, return empty results immediately.

```typescript
// In /api/sessions handler, add at the beginning:
const device = url.searchParams.get('device')
if (device && device !== options?.currentDeviceInstanceId) {
  json(res, { sessions: [], total: 0, page, pageSize })
  return
}

// In /api/tool-calls handler, add at the beginning:
const device = url.searchParams.get('device')
if (device && device !== options?.currentDeviceInstanceId) {
  json(res, { toolCalls: [] })
  return
}
```

For `/api/sessions` with "all devices" or "current device", behavior stays the same (local only — tool_calls are not synced).

- [ ] **Step 4: Run tests**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/api/server.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/server.test.ts
git commit -m "feat(api): add device filtering to models, projects, sessions endpoints"
```

---

### Task 5: Pass `currentDeviceInstanceId` from serve command to API server

**Files:**
- Modify: `packages/cli/src/commands/serve.ts:43-57`

- [ ] **Step 1: Update serve command to pass device instance ID**

In `packages/cli/src/commands/serve.ts`, read `currentDeviceInstanceId` from `state.json` and pass it to `createApiServer`:

```typescript
export function serve(options: ServeOptions): void {
  const state = getState(AIUSAGE_DIR)
  const currentDeviceInstanceId = state?.deviceInstanceId

  const apiServer = createApiServer(options.db, {
    currentDeviceInstanceId,
    onRefresh: () => runParse(options.db),
    onSync: () => runSync(options.db),
    getSyncStatus: () => {
      if (!state) return null
      return {
        lastSyncAt: state.lastSyncAt,
        lastSyncStatus: state.lastSyncStatus,
        lastSyncTarget: state.lastSyncTarget,
        lastSyncUploaded: state.lastSyncUploaded,
        lastSyncPulled: state.lastSyncPulled,
      }
    },
  })
  // ... rest unchanged
}
```

Note: also move `getState` call earlier so it's available for both `currentDeviceInstanceId` and `getSyncStatus`.

- [ ] **Step 2: Verify by running the dev server manually**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli build && node packages/cli/dist/index.js serve --port 3848`
Then: `curl http://localhost:3848/api/devices`
Expected: JSON with `currentDeviceInstanceId` populated

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/serve.ts
git commit -m "feat(serve): pass currentDeviceInstanceId to API server"
```

---

### Task 6: Add `selectedDevice` store and `DeviceSelector` component

**Files:**
- Modify: `packages/web/src/lib/stores.js`
- Modify: `packages/web/src/lib/api.js`
- Create: `packages/web/src/lib/components/DeviceSelector.svelte`
- Modify: `packages/web/src/lib/i18n.js`

- [ ] **Step 1: Add `selectedDevice` store to `stores.js`**

```javascript
// Add to packages/web/src/lib/stores.js
export const selectedDevice = writable('') // '' = all devices, value = deviceInstanceId

export function setDevice(deviceInstanceId) {
  selectedDevice.set(deviceInstanceId)
}
```

- [ ] **Step 2: Add `device` param to `api.js` functions**

Update `buildUrl` calls in `api.js` to include `device` when present. The existing `buildUrl` function already handles this — just pass `device` as part of the params object. No code change needed in `buildUrl`, but each fetch function needs to accept and pass `device`.

Update `fetchSummary`, `fetchTokens`, `fetchCost`, `fetchModels`, `fetchToolCalls`, `fetchSessions`, `fetchProjects` to pass `device` from params:

```javascript
export async function fetchSummary(params) {
  return apiFetch(buildUrl('/api/summary', params))
}
// params already includes device if passed from the page — no change needed
// because buildUrl passes all params through
```

Actually, looking at the existing code, `buildUrl` already passes all params. The pages just need to include `device` in the params they pass. No change to `api.js` is needed.

- [ ] **Step 3: Add i18n translations**

Add to `packages/web/src/lib/i18n.js` in both `en` and `zh` objects:

```javascript
// In en:
device: {
  allDevices: 'All Devices',
  loading: 'Loading...',
},

// In zh:
device: {
  allDevices: '全部设备',
  loading: '加载中...',
},
```

- [ ] **Step 4: Create `DeviceSelector.svelte`**

Create `packages/web/src/lib/components/DeviceSelector.svelte`:

```svelte
<script>
  import { onMount } from 'svelte'
  import { selectedDevice, setDevice } from '../stores.js'
  import { t } from '../i18n.js'

  let devices = []
  let loading = true

  onMount(async () => {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      devices = data.devices || []
    } catch {
      devices = []
    } finally {
      loading = false
    }
  })

  function handleChange(e) {
    setDevice(e.target.value)
  }
</script>

<div class="device-selector">
  <select
    value={$selectedDevice}
    on:change={handleChange}
    disabled={loading}
  >
    <option value="">{$t('device.allDevices')}</option>
    {#each devices as d}
      <option value={d.deviceInstanceId}>{d.device} ({d.recordCount})</option>
    {/each}
  </select>
</div>

<style>
  .device-selector {
    display: inline-flex;
    align-items: center;
  }
  select {
    padding: 0.38rem 0.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.78rem;
    background: var(--bg-raised);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    appearance: auto;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
  }
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/stores.js packages/web/src/lib/i18n.js packages/web/src/lib/components/DeviceSelector.svelte
git commit -m "feat(web): add selectedDevice store and DeviceSelector component"
```

---

### Task 7: Integrate DeviceSelector into all Dashboard pages

**Files:**
- Modify: `packages/web/src/routes/+page.svelte`
- Modify: `packages/web/src/routes/tokens/+page.svelte`
- Modify: `packages/web/src/routes/cost/+page.svelte`
- Modify: `packages/web/src/routes/models/+page.svelte`
- Modify: `packages/web/src/routes/tool-calls/+page.svelte`
- Modify: `packages/web/src/routes/projects/+page.svelte`
- Modify: `packages/web/src/routes/sessions/+page.svelte`

- [ ] **Step 1: Update overview page (`+page.svelte`)**

In `packages/web/src/routes/+page.svelte`:

1. Import `selectedDevice` from stores
2. Import `DeviceSelector` component
3. Place `<DateRangeSelector />` and `<DeviceSelector />` together
4. Add `$selectedDevice` to the reactive trigger
5. Pass `device` to `fetchSummary`

```svelte
<script>
  import { onMount } from 'svelte'
  import { dateRange, selectedDevice, formatNumber, formatCost, formatTokens } from '$lib/stores.js'
  import { fetchSummary, refreshData } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let initialized = false

  async function loadData() {
    if (!initialized) return
    loading = true
    error = null
    try {
      data = await fetchSummary({ ...$dateRange, device: $selectedDevice })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  onMount(async () => {
    await refreshData().catch(() => {})
    initialized = true
    await loadData()
  })

  $: $dateRange, $selectedDevice, loadData()
</script>

<svelte:head>
  <title>{$t('overview.title')} — AIUsage</title>
</svelte:head>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
</div>

<!-- rest of template unchanged -->
```

Add CSS for `.filter-bar`:
```css
.filter-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 2: Update tokens page**

Same pattern: import `selectedDevice` and `DeviceSelector`, add to reactive trigger, pass `device` to `fetchTokens`.

```svelte
<script>
  import { dateRange, selectedDevice, formatTokens } from '$lib/stores.js'
  import { fetchTokens } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'

  // ... existing code ...

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchTokens({ ...$dateRange, device: $selectedDevice })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, loadData()
</script>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
</div>
```

- [ ] **Step 3: Update cost page**

Same pattern as tokens page.

- [ ] **Step 4: Update models page**

Same pattern.

- [ ] **Step 5: Update tool-calls page**

Same pattern. Note: tool-calls endpoint returns empty for other devices (local-only).

- [ ] **Step 6: Update projects page**

Same pattern.

- [ ] **Step 7: Update sessions page**

Same pattern. Note: sessions endpoint returns empty for other devices (local-only).

- [ ] **Step 8: Build web and verify manually**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/web build`
Then start dev server and verify device selector appears and functions.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/routes/
git commit -m "feat(web): integrate DeviceSelector into all Dashboard pages"
```

---

### Task 8: Update CLI `aiusage summary` with multi-device support and `--device` flag

**Files:**
- Modify: `packages/cli/src/commands/summary.ts`
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/tests/commands/summary.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to packages/cli/tests/commands/summary.test.ts

it('returns merged data from records and synced_records', () => {
  const db = new Database(':memory:')
  initializeDatabase(db)
  // Insert local record
  insertTestRecord(db, { id: 'local1', input_tokens: 100, output_tokens: 50 })
  // Insert synced record from another device
  insertTestSyncedRecord(db, { id: 'synced1', device_instance_id: 'other-device', input_tokens: 200, output_tokens: 100 })

  const result = generateSummary(db, { currentDeviceInstanceId: 'local-uuid' })
  expect(result.totalTokens).toBe(450) // 150 + 300
})

it('filters by device when --device specified', () => {
  const db = new Database(':memory:')
  initializeDatabase(db)
  insertTestRecord(db, { id: 'local1', input_tokens: 100, output_tokens: 50, device: 'macbook', device_instance_id: 'uuid1' })
  insertTestSyncedRecord(db, { id: 'synced1', device_instance_id: 'uuid2', device: 'desktop', input_tokens: 200, output_tokens: 100 })

  const result = generateSummary(db, { device: 'uuid2', currentDeviceInstanceId: 'uuid1' })
  expect(result.totalTokens).toBe(300) // only remote device
})

it('returns only local data when no synced records exist', () => {
  const db = new Database(':memory:')
  initializeDatabase(db)
  insertTestRecord(db, { id: 'local1', input_tokens: 100, output_tokens: 50 })

  const result = generateSummary(db, { currentDeviceInstanceId: 'uuid1' })
  expect(result.totalTokens).toBe(150)
  expect(result.deviceCount).toBe(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Update `generateSummary` to support device filtering**

Refactor `packages/cli/src/commands/summary.ts`:

```typescript
import type Database from 'better-sqlite3'
import { getToolCallStats } from '../db/tool-calls.js'

export interface SummaryOptions {
  device?: string
  currentDeviceInstanceId?: string
}

export interface SummaryResult {
  totalTokens: number
  totalCost: number
  recordCount: number
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
  deviceCount: number
  deviceLabel: string | null
}

export function generateSummary(db: Database.Database, options?: SummaryOptions): SummaryResult {
  const currentId = options?.currentDeviceInstanceId
  const device = options?.device

  let totalsSql: string
  let totalsParams: Record<string, unknown> = {}
  let byToolSql: string
  let byToolParams: Record<string, unknown> = {}

  if (currentId && !device) {
    // All devices: UNION
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM (
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM records
        UNION ALL
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM synced_records WHERE device_instance_id != @currentId
      )`
    totalsParams = { currentId }

    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM (
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM records
        UNION ALL
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM synced_records WHERE device_instance_id != @currentId
      )
      GROUP BY tool ORDER BY cost DESC`
    byToolParams = { currentId }
  } else if (currentId && device && device !== currentId) {
    // Specific other device
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM synced_records WHERE device_instance_id = @device`
    totalsParams = { device }

    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM synced_records WHERE device_instance_id = @device
      GROUP BY tool ORDER BY cost DESC`
    byToolParams = { device }
  } else {
    // Local only (legacy behavior or current device specified)
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM records`
    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM records
      GROUP BY tool ORDER BY cost DESC`
  }

  const totals = db.prepare(totalsSql).get(totalsParams) as { totalTokens: number; totalCost: number; recordCount: number }

  const byToolRows = db.prepare(byToolSql).all(byToolParams) as Array<{ tool: string; tokens: number; cost: number }>
  const byTool: Record<string, { tokens: number; cost: number }> = {}
  for (const row of byToolRows) {
    byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
  }

  const toolCallStats = getToolCallStats(db)

  // Count devices
  let deviceCount = 1
  let deviceLabel: string | null = null
  if (currentId) {
    const localDevices = db.prepare('SELECT DISTINCT device_instance_id FROM records').all() as any[]
    const syncedDevices = db.prepare('SELECT DISTINCT device_instance_id FROM synced_records WHERE device_instance_id != ?').all(currentId) as any[]
    const allDeviceIds = new Set([...localDevices.map(d => d.device_instance_id), ...syncedDevices.map(d => d.device_instance_id)])
    deviceCount = allDeviceIds.size
    if (device) {
      const row = db.prepare('SELECT device FROM synced_records WHERE device_instance_id = ? LIMIT 1').get(device) as any
      deviceLabel = row?.device ?? device
    }
  }

  return {
    totalTokens: totals.totalTokens,
    totalCost: totals.totalCost,
    recordCount: totals.recordCount,
    byTool,
    topToolCalls: toolCallStats.slice(0, 3),
    deviceCount,
    deviceLabel,
  }
}
```

- [ ] **Step 4: Update CLI to pass options and display device info**

In `packages/cli/src/cli.ts`, update the summary command:

```typescript
import { getState } from './init.js'
import { AIUSAGE_DIR } from './config.js'

// In the default action and summary command:
const state = getState(AIUSAGE_DIR)
const summary = generateSummary(db, {
  currentDeviceInstanceId: state?.deviceInstanceId,
  device: options.device, // new --device flag
})

// Display device info
if (summary.deviceLabel) {
  console.log(`设备：${summary.deviceLabel}`)
} else if (summary.deviceCount > 1) {
  console.log(`设备：全部（${summary.deviceCount} 台设备在线）`)
}
```

Add `--device` option to the summary command:
```typescript
program
  .command('summary')
  .description('Show usage summary')
  .option('--week', 'Show this week')
  .option('--month', 'Show this month')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--device <id>', 'Filter by device instance ID')
  .action((options) => {
    // ... existing code
  })
```

- [ ] **Step 5: Run tests**

Run: `cd E:/WebstormProjects/aiusage && pnpm --filter @aiusage/cli test -- --run packages/cli/tests/commands/summary.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/summary.ts packages/cli/src/cli.ts packages/cli/tests/commands/summary.test.ts
git commit -m "feat(summary): add multi-device support and --device flag"
```

---

### Task 9: Final integration test and cleanup

**Files:**
- Test: full build and manual verification

- [ ] **Step 1: Run all tests**

Run: `cd E:/WebstormProjects/aiusage && pnpm test`
Expected: All PASS

- [ ] **Step 2: Build all packages**

Run: `cd E:/WebstormProjects/aiusage && pnpm build`
Expected: No errors

- [ ] **Step 3: Manual verification**

Start the server and verify:
1. `GET /api/devices` returns device list
2. All data endpoints accept `?device=` parameter
3. Dashboard shows DeviceSelector and filters correctly
4. `aiusage summary --device <id>` works

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for device filtering"
```
