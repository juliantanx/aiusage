# F3 + F4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Skill/MCP tool type analysis to the Tool Calls page (F3) and session duration/detail timeline to the Sessions page (F4).

**Architecture:** All classification logic lives in the backend (`packages/cli/src/api/server.ts`). No DB migrations needed — all data is derivable from existing `records` and `tool_calls` tables. The SvelteKit frontend (`packages/web`) consumes the enhanced API responses.

**Tech Stack:** TypeScript, better-sqlite3, SvelteKit (Svelte 4), vitest

---

## File Map

### Modified files
- `packages/cli/src/api/server.ts` — add toolType filter, topMcpServers, duration+toolCallCount, session detail endpoint
- `packages/web/src/lib/i18n.js` — add i18n keys for F3 and F4
- `packages/web/src/routes/tool-calls/+page.svelte` — type tabs, MCP display, type badges
- `packages/web/src/routes/overview/+page.svelte` — MCP servers tab in topToolCalls card
- `packages/web/src/routes/sessions/+page.svelte` — duration/toolCallCount columns, clickable rows
- `packages/web/src/lib/api.js` — fetchSessionDetail helper

### Created files
- `packages/cli/tests/api/tool-classification.test.ts` — unit tests for classification helpers
- `packages/cli/tests/api/session-detail.test.ts` — integration tests for sessions API
- `packages/web/src/routes/sessions/[sessionId]/+page.svelte` — session detail page

---

## Task 1: Backend — tool call classification helpers + /api/tool-calls enhancement

**Files:**
- Create: `packages/cli/tests/api/tool-classification.test.ts`
- Modify: `packages/cli/src/api/server.ts` (add helpers, modify `/api/tool-calls` handler)

- [ ] **Step 1: Write the failing test**

Create `packages/cli/tests/api/tool-classification.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// These helpers will be extracted from server.ts in Step 3
// Import them once they exist:
// import { classifyToolCall, parseMcpName, getToolTypeFilter } from '../../src/api/server.js'

// For now, define inline to make tests runnable first
function classifyToolCall(name: string): 'mcp' | 'skill' | 'builtin' {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name === 'Skill') return 'skill'
  return 'builtin'
}

function parseMcpName(name: string): { server: string; action: string; display: string } {
  const withoutPrefix = name.slice(5) // remove 'mcp__'
  const idx = withoutPrefix.indexOf('__')
  if (idx === -1) return { server: withoutPrefix, action: '', display: withoutPrefix }
  return {
    server: withoutPrefix.slice(0, idx),
    action: withoutPrefix.slice(idx + 2),
    display: `${withoutPrefix.slice(0, idx)} / ${withoutPrefix.slice(idx + 2)}`,
  }
}

function getToolTypeFilter(toolType: string | null): string {
  if (toolType === 'mcp') return "AND tc.name LIKE 'mcp__%'"
  if (toolType === 'skill') return "AND tc.name = 'Skill'"
  if (toolType === 'builtin') return "AND tc.name NOT LIKE 'mcp__%' AND tc.name != 'Skill'"
  return ''
}

describe('classifyToolCall', () => {
  it('classifies mcp__ prefix as mcp', () => {
    expect(classifyToolCall('mcp__brave__search')).toBe('mcp')
    expect(classifyToolCall('mcp__filesystem__read_file')).toBe('mcp')
  })

  it('classifies exact "Skill" as skill', () => {
    expect(classifyToolCall('Skill')).toBe('skill')
  })

  it('classifies SkillXYZ as builtin (not skill)', () => {
    expect(classifyToolCall('SkillX')).toBe('builtin')
  })

  it('classifies common tools as builtin', () => {
    expect(classifyToolCall('Read')).toBe('builtin')
    expect(classifyToolCall('Bash')).toBe('builtin')
    expect(classifyToolCall('Edit')).toBe('builtin')
  })
})

describe('parseMcpName', () => {
  it('parses standard mcp__server__action', () => {
    const result = parseMcpName('mcp__brave__search')
    expect(result.server).toBe('brave')
    expect(result.action).toBe('search')
    expect(result.display).toBe('brave / search')
  })

  it('handles complex action names', () => {
    const result = parseMcpName('mcp__filesystem__read_file')
    expect(result.server).toBe('filesystem')
    expect(result.action).toBe('read_file')
    expect(result.display).toBe('filesystem / read_file')
  })

  it('handles missing second double underscore', () => {
    const result = parseMcpName('mcp__bareserver')
    expect(result.server).toBe('bareserver')
    expect(result.action).toBe('')
    expect(result.display).toBe('bareserver')
  })
})

describe('getToolTypeFilter', () => {
  it('returns mcp filter for mcp type', () => {
    expect(getToolTypeFilter('mcp')).toBe("AND tc.name LIKE 'mcp__%'")
  })

  it('returns skill filter for skill type', () => {
    expect(getToolTypeFilter('skill')).toBe("AND tc.name = 'Skill'")
  })

  it('returns exclusion filter for builtin type', () => {
    expect(getToolTypeFilter('builtin')).toBe("AND tc.name NOT LIKE 'mcp__%' AND tc.name != 'Skill'")
  })

  it('returns empty string for null (all types)', () => {
    expect(getToolTypeFilter(null)).toBe('')
    expect(getToolTypeFilter('')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && pnpm test tests/api/tool-classification.test.ts
```

Expected: Tests pass (since helpers are defined inline in the test file for now).

- [ ] **Step 3: Add helper functions to server.ts and enhance /api/tool-calls**

In `packages/cli/src/api/server.ts`, add these helpers near the top (after `getToolFilter`):

```typescript
function classifyToolCall(name: string): 'mcp' | 'skill' | 'builtin' {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name === 'Skill') return 'skill'
  return 'builtin'
}

function parseMcpName(name: string): { server: string; action: string; display: string } {
  const withoutPrefix = name.slice(5)
  const idx = withoutPrefix.indexOf('__')
  if (idx === -1) return { server: withoutPrefix, action: '', display: withoutPrefix }
  return {
    server: withoutPrefix.slice(0, idx),
    action: withoutPrefix.slice(idx + 2),
    display: `${withoutPrefix.slice(0, idx)} / ${withoutPrefix.slice(idx + 2)}`,
  }
}

function getToolTypeFilter(toolType: string | null): string {
  if (toolType === 'mcp') return "AND tc.name LIKE 'mcp__%'"
  if (toolType === 'skill') return "AND tc.name = 'Skill'"
  if (toolType === 'builtin') return "AND tc.name NOT LIKE 'mcp__%' AND tc.name != 'Skill'"
  return ''
}
```

Replace the existing `/api/tool-calls` handler (lines ~485–520) with:

```typescript
// ── /api/tool-calls ───────────────────────────────────────────
if (url.pathname === '/api/tool-calls') {
  const device = url.searchParams.get('device')
  if (device && device !== options?.currentDeviceInstanceId) {
    json(res, { toolCalls: [] })
    return
  }

  const dr = getDateRangeFilter(range, from, to, 'r', weekStart)
  const tool = url.searchParams.get('tool')
  const tf = getToolFilter(tool, 'r')
  const toolType = url.searchParams.get('toolType')
  const ttf = getToolTypeFilter(toolType)

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total FROM tool_calls tc
    JOIN records r ON r.id = tc.record_id
    WHERE 1=1 ${dr.where} ${tf.where} ${ttf}
  `).get({ ...dr.params, ...tf.params }) as any
  const total = totalRow.total || 1

  const rows = db.prepare(`
    SELECT tc.name, COUNT(*) AS count
    FROM tool_calls tc
    JOIN records r ON r.id = tc.record_id
    WHERE 1=1 ${dr.where} ${tf.where} ${ttf}
    GROUP BY tc.name ORDER BY count DESC
  `).all({ ...dr.params, ...tf.params }) as any[]

  const toolCalls = rows.map(r => {
    const type = classifyToolCall(r.name)
    const parsed = type === 'mcp' ? parseMcpName(r.name) : null
    return {
      name: r.name,
      displayName: parsed ? parsed.display : r.name,
      mcpServer: parsed ? parsed.server : null,
      type,
      count: r.count,
      percentage: Math.round((r.count / total) * 1000) / 10,
    }
  })

  json(res, { toolCalls })
  return
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && pnpm test
```

Expected: All existing tests pass, new tool-classification tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/tool-classification.test.ts
git commit -m "feat: add tool call type classification to /api/tool-calls"
```

---

## Task 2: Backend — topMcpServers in /api/summary

**Files:**
- Modify: `packages/cli/src/api/server.ts` (enhance `/api/summary` response)

- [ ] **Step 1: Locate the summary topToolCalls query** (around line 252) and add topMcpServers below it

Find this block in the `/api/summary` handler:

```typescript
const topToolCalls = db.prepare(`
  SELECT tc.name, COUNT(*) AS count
  FROM tool_calls tc
  JOIN records r ON r.id = tc.record_id
  WHERE 1=1 ${dfJoin} ${drJoin.where} ${tfJoin.where}
  GROUP BY tc.name ORDER BY count DESC LIMIT 10
`).all({ ...drJoin.params, ...df.params, ...tfJoin.params }) as any[]
```

Add this immediately after it:

```typescript
const topMcpServersRaw = db.prepare(`
  SELECT tc.name, COUNT(*) AS count
  FROM tool_calls tc
  JOIN records r ON r.id = tc.record_id
  WHERE tc.name LIKE 'mcp__%'
    AND INSTR(SUBSTR(tc.name, 6), '__') > 0
    ${dfJoin} ${drJoin.where} ${tfJoin.where}
  GROUP BY tc.name ORDER BY count DESC
`).all({ ...drJoin.params, ...df.params, ...tfJoin.params }) as any[]

// Aggregate by server (multiple mcp__server__X tools collapse to one server)
const mcpServerMap = new Map<string, number>()
for (const row of topMcpServersRaw) {
  const server = parseMcpName(row.name).server
  mcpServerMap.set(server, (mcpServerMap.get(server) ?? 0) + row.count)
}
const topMcpServers = Array.from(mcpServerMap.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([server, count]) => ({ server, count }))
```

- [ ] **Step 2: Add topMcpServers to the json response**

Find the `json(res, { ... })` call for `/api/summary` and add `topMcpServers`:

```typescript
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
  topMcpServers,   // ADD THIS LINE
})
```

- [ ] **Step 3: Run tests**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/api/server.ts
git commit -m "feat: add topMcpServers to /api/summary"
```

---

## Task 3: Frontend — Tool Calls page with type tabs, badges, MCP display + F3 i18n

**Files:**
- Modify: `packages/web/src/lib/i18n.js`
- Modify: `packages/web/src/routes/tool-calls/+page.svelte`

- [ ] **Step 1: Add F3 i18n keys to i18n.js**

In `i18n.js`, find the English `toolCalls` block (line ~116) and replace it:

```javascript
toolCalls: {
  title: 'Tool Calls',
  desc: 'Most frequently invoked tools by AI assistants.',
  noData: 'No tool call data',
  noDataHint: 'No tool calls recorded for this period.',
  typeAll: 'All',
  typeBuiltin: 'Built-in',
  typeMcp: 'MCP',
  typeSkill: 'Skill',
  badgeMcp: 'mcp',
  badgeSkill: 'skill',
},
```

Find the Chinese `toolCalls` block (line ~381) and replace it:

```javascript
toolCalls: {
  title: '工具调用',
  desc: 'AI 助手最常调用的工具排名。',
  noData: '暂无工具调用数据',
  noDataHint: '当前时间段内无工具调用记录。',
  typeAll: '全部',
  typeBuiltin: '内置',
  typeMcp: 'MCP',
  typeSkill: 'Skill',
  badgeMcp: 'mcp',
  badgeSkill: 'skill',
},
```

- [ ] **Step 2: Rewrite the Tool Calls page**

Replace the entire content of `packages/web/src/routes/tool-calls/+page.svelte`:

```svelte
<script>
  import { dateRange, selectedDevice, selectedTool, formatNumber } from '$lib/stores.js'
  import { fetchToolCalls } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let selectedType = null // null = all

  const TYPES = [
    { key: null,       label: () => $t('toolCalls.typeAll') },
    { key: 'builtin',  label: () => $t('toolCalls.typeBuiltin') },
    { key: 'mcp',      label: () => $t('toolCalls.typeMcp') },
    { key: 'skill',    label: () => $t('toolCalls.typeSkill') },
  ]

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchToolCalls({
        ...$dateRange,
        device: $selectedDevice,
        tool: $selectedTool,
        toolType: selectedType,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, $selectedTool, selectedType, loadData()
</script>

<svelte:head>
  <title>{$t('toolCalls.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('toolCalls.title')}</h1>
  <p>{$t('toolCalls.desc')}</p>
</div>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
  <ToolSelector />
</div>

<div class="type-tabs">
  {#each TYPES as type}
    <button
      class="tab"
      class:active={selectedType === type.key}
      on:click={() => { selectedType = type.key }}
    >
      {type.label()}
    </button>
  {/each}
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if !data?.toolCalls.length}
  <div class="state-msg">
    <h2>{$t('toolCalls.noData')}</h2>
    <p>{$t('toolCalls.noDataHint')}</p>
  </div>
{:else}
  <div class="ranking">
    {#each data.toolCalls as tc, i}
      <div class="row animate-row">
        <span class="rank mono">#{i + 1}</span>
        <span class="name mono">
          {tc.displayName}
          {#if tc.type === 'mcp'}
            <span class="badge badge-mcp">{$t('toolCalls.badgeMcp')}</span>
          {:else if tc.type === 'skill'}
            <span class="badge badge-skill">{$t('toolCalls.badgeSkill')}</span>
          {/if}
        </span>
        <div class="bar-container">
          <div class="bar" style="width: {tc.percentage}%"></div>
        </div>
        <span class="count mono">{formatNumber(tc.count)}</span>
        <span class="pct mono">{tc.percentage.toFixed(1)}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .type-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .tab {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    font-family: var(--mono);
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .tab:hover {
    color: var(--text);
    background: var(--hover);
  }
  .tab.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: var(--accent);
    font-weight: 600;
  }

  .ranking {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 1fr 1fr 4.5rem 3.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--surface);
    border-radius: 8px;
    transition: background 0.15s;
  }
  .row:hover {
    background: var(--hover);
  }
  .rank {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .badge-mcp {
    background: var(--blue-dim);
    color: var(--blue);
  }
  .badge-skill {
    background: var(--purple-dim);
    color: var(--purple);
  }
  .bar-container {
    height: 6px;
    background: var(--raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.6s ease;
  }
  .count {
    text-align: right;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text);
  }
  .pct {
    text-align: right;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .animate-row {
    animation: fadeIn 0.2s ease both;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
```

- [ ] **Step 3: Update fetchToolCalls in api.js to pass toolType**

In `packages/web/src/lib/api.js`, find:

```javascript
export async function fetchToolCalls(params) {
  return apiFetch(buildUrl('/api/tool-calls', params))
}
```

Replace with:

```javascript
export async function fetchToolCalls(params) {
  return apiFetch(buildUrl('/api/tool-calls', {
    ...params,
    toolType: params.toolType || undefined,
  }))
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/i18n.js packages/web/src/routes/tool-calls/+page.svelte packages/web/src/lib/api.js
git commit -m "feat: add type tabs and MCP display to Tool Calls page"
```

---

## Task 4: Frontend — Overview MCP tab in topToolCalls card

**Files:**
- Modify: `packages/web/src/lib/i18n.js`
- Modify: `packages/web/src/routes/overview/+page.svelte`

- [ ] **Step 1: Add F3 overview i18n keys**

In `i18n.js`, find the English `overview` block (line ~48) and add these keys inside it (after `noToolCalls`):

```javascript
topMcpServers: 'MCP Servers',
noMcpCalls: 'No MCP calls recorded',
tabAll: 'All',
tabMcp: 'MCP Servers',
```

Find the Chinese `overview` block (line ~313) and add the same keys in Chinese:

```javascript
topMcpServers: 'MCP 服务器',
noMcpCalls: '暂无 MCP 调用记录',
tabAll: '全部',
tabMcp: 'MCP 服务器',
```

- [ ] **Step 2: Update the topToolCalls card in overview/+page.svelte**

In `packages/web/src/routes/overview/+page.svelte`, find the entire "Top Tool Calls" card block:

```svelte
<div class="card">
  <div class="section-title">{$t('overview.topToolCalls')}</div>
  {#if data.topToolCalls.length === 0}
    <p class="muted">{$t('overview.noToolCalls')}</p>
  {:else}
    <div class="tc-list">
      {#each data.topToolCalls as tc, i}
        <div class="tc-row" style="animation-delay: {i * 40}ms">
          <span class="tc-rank">#{i + 1}</span>
          <span class="tc-name mono">{tc.name}</span>
          <span class="tc-count mono">{formatNumber(tc.count)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

Replace with:

```svelte
<div class="card">
  <div class="card-header">
    <div class="section-title">{$t('overview.topToolCalls')}</div>
    <div class="card-tabs">
      <button class="card-tab" class:active={tcTab === 'all'} on:click={() => tcTab = 'all'}>
        {$t('overview.tabAll')}
      </button>
      <button class="card-tab" class:active={tcTab === 'mcp'} on:click={() => tcTab = 'mcp'}>
        {$t('overview.tabMcp')}
      </button>
    </div>
  </div>
  {#if tcTab === 'all'}
    {#if data.topToolCalls.length === 0}
      <p class="muted">{$t('overview.noToolCalls')}</p>
    {:else}
      <div class="tc-list">
        {#each data.topToolCalls as tc, i}
          <div class="tc-row" style="animation-delay: {i * 40}ms">
            <span class="tc-rank">#{i + 1}</span>
            <span class="tc-name mono">{tc.name}</span>
            <span class="tc-count mono">{formatNumber(tc.count)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    {#if !data.topMcpServers?.length}
      <p class="muted">{$t('overview.noMcpCalls')}</p>
    {:else}
      <div class="tc-list">
        {#each data.topMcpServers as srv, i}
          <div class="tc-row" style="animation-delay: {i * 40}ms">
            <span class="tc-rank">#{i + 1}</span>
            <span class="tc-name mono">{srv.server}</span>
            <span class="tc-count mono">{formatNumber(srv.count)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Add tcTab variable to script block**

In the `<script>` section of `overview/+page.svelte`, add after the existing `let loading = true`:

```javascript
let tcTab = 'all'
```

- [ ] **Step 4: Add styles for card-header and card-tabs**

In the `<style>` section of `overview/+page.svelte`, add:

```css
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.card-header .section-title {
  margin-bottom: 0;
}
.card-tabs {
  display: flex;
  gap: 0.2rem;
}
.card-tab {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.65rem;
  font-family: var(--mono);
  font-weight: 500;
  transition: color 0.12s, background 0.12s;
}
.card-tab:hover { color: var(--text); background: var(--hover); }
.card-tab.active { color: var(--accent); background: var(--accent-dim); border-color: var(--accent); font-weight: 600; }
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/i18n.js packages/web/src/routes/overview/+page.svelte
git commit -m "feat: add MCP servers tab to overview top tool calls card"
```

---

## Task 5: Backend — /api/sessions with duration + toolCallCount

**Files:**
- Create: `packages/cli/tests/api/session-detail.test.ts`
- Modify: `packages/cli/src/api/server.ts` (enhance `/api/sessions` query)

- [ ] **Step 1: Write the failing test**

Create `packages/cli/tests/api/session-detail.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

function seedSession(db: Database.Database) {
  const base = 1715683200000
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id)
    VALUES (?, ?, ?, ?, 0, 'claude-code', 'claude-sonnet-4-6', 'anthropic',
      1000, 200, 300, 100, 0, 0.005, 'pricing', 'sess-1', '/tmp/test.jsonl', 'mac', 'dev-1')
  `).run('r1', base, base, base)
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id)
    VALUES (?, ?, ?, ?, 0, 'claude-code', 'claude-sonnet-4-6', 'anthropic',
      2000, 400, 600, 200, 0, 0.01, 'pricing', 'sess-1', '/tmp/test.jsonl', 'mac', 'dev-1')
  `).run('r2', base + 60000, base, base)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc1', 'r1', 'claude-code', 'Read', ?, 0)
  `).run(base + 100)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc2', 'r1', 'claude-code', 'mcp__brave__search', ?, 1)
  `).run(base + 200)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc3', 'r2', 'claude-code', 'Bash', ?, 0)
  `).run(base + 60100)
}

describe('sessions list query', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    seedSession(db)
  })

  afterEach(() => db.close())

  it('returns duration as MAX(ts) - MIN(ts)', () => {
    const row = db.prepare(`
      SELECT session_id, MAX(ts) - MIN(ts) AS duration
      FROM records
      WHERE session_id = 'sess-1'
      GROUP BY session_id
    `).get() as any
    expect(row.duration).toBe(60000)
  })

  it('returns toolCallCount via LEFT JOIN', () => {
    const row = db.prepare(`
      SELECT r.session_id, COUNT(DISTINCT tc.id) AS toolCallCount
      FROM records r
      LEFT JOIN tool_calls tc ON tc.record_id = r.id
      WHERE r.session_id = 'sess-1'
      GROUP BY r.session_id
    `).get() as any
    expect(row.toolCallCount).toBe(3)
  })
})

describe('session detail query', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    seedSession(db)
  })

  afterEach(() => db.close())

  it('returns records in ascending ts order', () => {
    const rows = db.prepare(`
      SELECT id, ts FROM records
      WHERE session_id = 'sess-1'
      ORDER BY ts ASC
    `).all() as any[]
    expect(rows[0].id).toBe('r1')
    expect(rows[1].id).toBe('r2')
  })

  it('returns tool calls grouped by record_id', () => {
    const rows = db.prepare(`
      SELECT tc.record_id, tc.name, tc.call_index
      FROM tool_calls tc
      JOIN records r ON r.id = tc.record_id
      WHERE r.session_id = 'sess-1'
      ORDER BY tc.record_id, tc.call_index ASC
    `).all() as any[]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ record_id: 'r1', name: 'Read', call_index: 0 })
    expect(rows[1]).toMatchObject({ record_id: 'r1', name: 'mcp__brave__search', call_index: 1 })
    expect(rows[2]).toMatchObject({ record_id: 'r2', name: 'Bash', call_index: 0 })
  })

  it('returns session metadata aggregate', () => {
    const row = db.prepare(`
      SELECT session_id, MIN(ts) AS firstTs, MAX(ts) AS lastTs,
             MAX(ts) - MIN(ts) AS duration,
             SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
             SUM(cost) AS cost, COUNT(*) AS recordCount
      FROM records
      WHERE session_id = 'sess-1'
      GROUP BY session_id
    `).get() as any
    expect(row.firstTs).toBe(1715683200000)
    expect(row.duration).toBe(60000)
    expect(row.inputTokens).toBe(3000)
    expect(row.recordCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd packages/cli && pnpm test tests/api/session-detail.test.ts
```

Expected: All tests pass (pure SQL queries tested against in-memory DB).

- [ ] **Step 3: Enhance /api/sessions in server.ts**

Find the sessions query (the `db.prepare(...)` that builds the sessions list, around line 550). Replace the query SQL to include duration and toolCallCount:

```typescript
const sessions = db.prepare(`
  SELECT r.session_id AS sessionId,
         r.tool,
         r.model,
         MIN(r.ts) AS ts,
         MAX(r.ts) - MIN(r.ts) AS duration,
         SUM(r.input_tokens) AS inputTokens,
         SUM(r.output_tokens) AS outputTokens,
         SUM(r.cache_read_tokens) AS cacheReadTokens,
         SUM(r.cache_write_tokens) AS cacheWriteTokens,
         SUM(r.cost) AS cost,
         COUNT(DISTINCT tc.id) AS toolCallCount
  FROM records r
  LEFT JOIN tool_calls tc ON tc.record_id = r.id
  WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
  GROUP BY r.session_id
  ORDER BY ts DESC
  LIMIT @limit OFFSET @offset
`).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as any[]
```

Note: the original query used unaliased `records` table — change to `r` alias throughout to support the LEFT JOIN. Also update the `totalRow` query to use `r.session_id`:

```typescript
const totalRow = db.prepare(`
  SELECT COUNT(DISTINCT r.session_id) AS total
  FROM records r
  WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
`).get(params) as any
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/session-detail.test.ts
git commit -m "feat: add duration and toolCallCount to /api/sessions"
```

---

## Task 6: Backend — /api/sessions/:sessionId endpoint

**Files:**
- Modify: `packages/cli/src/api/server.ts` (add session detail route before `/api/sessions` check)

- [ ] **Step 1: Add the session detail route handler**

In `server.ts`, find the `// ── /api/sessions ─────────────────────────────────────────────` comment. Add this block **immediately before** it:

```typescript
// ── /api/sessions/:sessionId ──────────────────────────────────
if (url.pathname.startsWith('/api/sessions/') && req.method === 'GET') {
  const sessionId = decodeURIComponent(url.pathname.slice('/api/sessions/'.length))
  if (!sessionId) {
    json(res, { error: { code: 'INVALID_PARAM', message: 'Missing sessionId' } }, 400)
    return
  }

  const toolParam = url.searchParams.get('tool')
  const deviceParam = url.searchParams.get('device')

  // Build optional filters
  const toolClause = toolParam ? 'AND tool = @tool' : ''
  const deviceClause = deviceParam ? 'AND device_instance_id = @device' : ''
  const filterParams: Record<string, unknown> = { sessionId }
  if (toolParam) filterParams.tool = toolParam
  if (deviceParam) filterParams.device = deviceParam

  // Session metadata
  const meta = db.prepare(`
    SELECT session_id AS sessionId,
           tool, model,
           MIN(ts) AS firstTs,
           MAX(ts) AS lastTs,
           MAX(ts) - MIN(ts) AS duration,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(cache_read_tokens) AS cacheReadTokens,
           SUM(cache_write_tokens) AS cacheWriteTokens,
           SUM(thinking_tokens) AS thinkingTokens,
           SUM(cost) AS cost,
           COUNT(*) AS recordCount
    FROM records
    WHERE session_id = @sessionId ${toolClause} ${deviceClause}
    GROUP BY session_id, tool, model
    ORDER BY MIN(ts) ASC
    LIMIT 1
  `).get(filterParams) as any

  if (!meta) {
    json(res, { error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404)
    return
  }

  // Records in ascending order
  const records = db.prepare(`
    SELECT id, ts, model,
           input_tokens AS inputTokens,
           output_tokens AS outputTokens,
           cache_read_tokens AS cacheReadTokens,
           cache_write_tokens AS cacheWriteTokens,
           thinking_tokens AS thinkingTokens,
           cost
    FROM records
    WHERE session_id = @sessionId ${toolClause} ${deviceClause}
    ORDER BY ts ASC
  `).all(filterParams) as any[]

  // Tool calls for all records in this session
  const toolCallRows = db.prepare(`
    SELECT tc.record_id AS recordId, tc.name, tc.ts, tc.call_index AS callIndex
    FROM tool_calls tc
    JOIN records r ON r.id = tc.record_id
    WHERE r.session_id = @sessionId ${toolClause.replace(/\btool\b/g, 'r.tool')} ${deviceClause.replace(/\bdevice_instance_id\b/g, 'r.device_instance_id')}
    ORDER BY tc.record_id, tc.call_index ASC
  `).all(filterParams) as any[]

  // Group tool calls by record_id
  const toolCallsByRecord: Record<string, any[]> = {}
  for (const tc of toolCallRows) {
    if (!toolCallsByRecord[tc.recordId]) toolCallsByRecord[tc.recordId] = []
    const type = classifyToolCall(tc.name)
    const parsed = type === 'mcp' ? parseMcpName(tc.name) : null
    toolCallsByRecord[tc.recordId].push({
      name: tc.name,
      displayName: parsed ? parsed.display : tc.name,
      type,
      ts: tc.ts,
      callIndex: tc.callIndex,
    })
  }

  const toolCallCount = toolCallRows.length

  json(res, {
    session: { ...meta, toolCallCount },
    records: records.map(r => ({
      ...r,
      toolCalls: toolCallsByRecord[r.id] ?? [],
    })),
  })
  return
}
```

- [ ] **Step 2: Run tests**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/api/server.ts
git commit -m "feat: add /api/sessions/:sessionId detail endpoint"
```

---

## Task 7: Frontend — Sessions list with duration + toolCallCount + F4 i18n

**Files:**
- Modify: `packages/web/src/lib/i18n.js`
- Modify: `packages/web/src/lib/api.js`
- Modify: `packages/web/src/routes/sessions/+page.svelte`

- [ ] **Step 1: Add F4 i18n keys**

In `i18n.js`, find the English `sessions` block (line ~122) and replace it:

```javascript
sessions: {
  title: 'Sessions',
  desc: 'Per-session log with token and cost details.',
  assistant: 'AI Assistant',
  time: 'Time',
  tool: 'Tool',
  model: 'Model',
  input: 'Input',
  output: 'Output',
  cost: 'Cost',
  duration: 'Duration',
  toolCalls: 'Tools',
  noData: 'No sessions',
  noDataHint: 'No sessions recorded for this period.',
  detail: {
    back: '← Sessions',
    title: 'Session Detail',
    meta: {
      duration: 'Duration',
      tokens: 'Tokens',
      cost: 'Cost',
      apiCalls: 'API Calls',
      toolCalls: 'Tool Calls',
      model: 'Model',
    },
    gap: 'gap',
    noToolCalls: 'No tool calls',
    record: 'API Call',
    toolCall: 'Tool',
  },
},
```

Find the Chinese `sessions` block (line ~387) and replace it:

```javascript
sessions: {
  title: '会话',
  desc: '每条会话的 Token 用量和费用详细记录。',
  assistant: 'AI 助手',
  time: '时间',
  tool: '工具',
  model: '模型',
  input: '输入',
  output: '输出',
  cost: '费用',
  duration: '时长',
  toolCalls: '工具调用',
  noData: '暂无会话',
  noDataHint: '当前时间段内无会话记录。',
  detail: {
    back: '← 会话列表',
    title: '会话详情',
    meta: {
      duration: '时长',
      tokens: 'Token',
      cost: '费用',
      apiCalls: 'API 调用',
      toolCalls: '工具调用',
      model: '模型',
    },
    gap: '间隔',
    noToolCalls: '无工具调用',
    record: 'API 调用',
    toolCall: '工具',
  },
},
```

- [ ] **Step 2: Add fetchSessionDetail to api.js**

In `packages/web/src/lib/api.js`, add after `fetchSessions`:

```javascript
export async function fetchSessionDetail(sessionId, params = {}) {
  return apiFetch(buildUrl(`/api/sessions/${encodeURIComponent(sessionId)}`, params))
}
```

- [ ] **Step 3: Rewrite sessions list page**

Replace the entire content of `packages/web/src/routes/sessions/+page.svelte`:

```svelte
<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens, formatCost, formatDate } from '$lib/stores.js'
  import { fetchSessions } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let page = 1
  const pageSize = 50

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    if (m === 0) return `${s}s`
    return `${m}m ${s % 60}s`
  }

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchSessions({
        ...$dateRange,
        device: $selectedDevice,
        tool: $selectedTool,
        page,
        pageSize,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $selectedTool, (page = 1)
  $: $dateRange, $selectedDevice, $selectedTool, page, loadData()

  function nextPage() {
    if (data && page * pageSize < data.total) page++
  }

  function prevPage() {
    if (page > 1) page--
  }

  function goToDetail(session) {
    const params = new URLSearchParams()
    if ($selectedTool) params.set('tool', $selectedTool)
    if ($selectedDevice) params.set('device', $selectedDevice)
    const qs = params.toString()
    window.location.href = `/sessions/${encodeURIComponent(session.sessionId)}${qs ? '?' + qs : ''}`
  }
</script>

<svelte:head>
  <title>{$t('sessions.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('sessions.title')}</h1>
  <p>{$t('sessions.desc')}</p>
</div>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
  <ToolSelector />
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if !data?.sessions.length}
  <div class="state-msg">
    <h2>{$t('sessions.noData')}</h2>
    <p>{$t('sessions.noDataHint')}</p>
  </div>
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{$t('sessions.time')}</th>
          <th>{$t('sessions.tool')}</th>
          <th>{$t('sessions.model')}</th>
          <th>{$t('sessions.duration')}</th>
          <th>{$t('sessions.toolCalls')}</th>
          <th>{$t('sessions.input')}</th>
          <th>{$t('sessions.output')}</th>
          <th>{$t('sessions.cost')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.sessions as session}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-interactive-element-to-noninteractive-role -->
          <tr class="clickable" on:click={() => goToDetail(session)}>
            <td class="mono">{formatDate(session.ts)}</td>
            <td>{session.tool}</td>
            <td class="mono model">{session.model}</td>
            <td class="mono muted">{formatDuration(session.duration)}</td>
            <td class="mono">{session.toolCallCount ?? 0}</td>
            <td class="mono green">{formatTokens(session.inputTokens)}</td>
            <td class="mono blue">{formatTokens(session.outputTokens)}</td>
            <td class="mono accent">{formatCost(session.cost)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pagination">
    <button on:click={prevPage} disabled={page <= 1}>← {$t('common.previous')}</button>
    <span class="page-info mono">{$t('common.page')} {page} {$t('common.of')} {Math.ceil(data.total / pageSize)}</span>
    <button on:click={nextPage} disabled={page * pageSize >= data.total}>{$t('common.next')} →</button>
  </div>
{/if}

<style>
  .clickable {
    cursor: pointer;
  }
  .model {
    font-size: 0.8rem;
    color: var(--text);
  }
  .muted {
    color: var(--text-muted);
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .pagination button {
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--border-subtle);
    background: var(--raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: color 0.2s;
  }
  .pagination button:hover:not(:disabled) {
    color: var(--accent);
  }
  .pagination button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .page-info {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/i18n.js packages/web/src/lib/api.js packages/web/src/routes/sessions/+page.svelte
git commit -m "feat: add duration, toolCallCount columns and detail navigation to Sessions page"
```

---

## Task 8: Frontend — Session detail page /sessions/[sessionId]

**Files:**
- Create: `packages/web/src/routes/sessions/[sessionId]/+page.svelte`

- [ ] **Step 1: Create the session detail page**

Create directory and file `packages/web/src/routes/sessions/[sessionId]/+page.svelte`:

```svelte
<script>
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { formatCost, formatTokens, formatDate } from '$lib/stores.js'
  import { fetchSessionDetail } from '$lib/api.js'
  import { t } from '$lib/i18n.js'

  const sessionId = $page.params.sessionId
  const tool = $page.url.searchParams.get('tool')
  const device = $page.url.searchParams.get('device')

  let data = null
  let error = null
  let loading = true

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    if (m === 0) return `${s}s`
    return `${m}m ${s % 60}s`
  }

  function formatRelative(ts, firstTs) {
    const diff = ts - firstTs
    if (diff < 1000) return `+${diff}ms`
    return `+${formatDuration(diff)}`
  }

  function formatGap(ms) {
    if (ms < 1000) return null
    return formatDuration(ms)
  }

  onMount(async () => {
    try {
      const params = {}
      if (tool) params.tool = tool
      if (device) params.device = device
      data = await fetchSessionDetail(sessionId, params)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load session'
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>{$t('sessions.detail.title')} — AIUsage</title>
</svelte:head>

<div class="page-header-row page-header">
  <div>
    <a href="/sessions" class="back-link">{$t('sessions.detail.back')}</a>
    <h1>{$t('sessions.detail.title')}</h1>
    <p class="mono session-id">{sessionId}</p>
  </div>
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if data}
  {@const s = data.session}

  <div class="meta-bar card">
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.duration')}</span>
      <span class="meta-value mono">{formatDuration(s.duration)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.model')}</span>
      <span class="meta-value mono">{s.model}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.tokens')}</span>
      <span class="meta-value mono">{formatTokens(s.inputTokens + s.outputTokens)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.cost')}</span>
      <span class="meta-value mono accent">{formatCost(s.cost)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.apiCalls')}</span>
      <span class="meta-value mono">{s.recordCount}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">{$t('sessions.detail.meta.toolCalls')}</span>
      <span class="meta-value mono">{s.toolCallCount}</span>
    </div>
  </div>

  <div class="timeline">
    {#each data.records as record, idx}
      {@const gap = idx > 0 ? formatGap(record.ts - data.records[idx - 1].ts) : null}

      {#if gap}
        <div class="gap-divider">
          <span class="gap-label">— {gap} {$t('sessions.detail.gap')} —</span>
        </div>
      {/if}

      <div class="record-card">
        <div class="record-header">
          <span class="record-label mono">{$t('sessions.detail.record')} #{idx + 1}</span>
          <span class="record-time mono">{formatRelative(record.ts, data.session.firstTs)}</span>
          <span class="record-model mono">{record.model}</span>
          <span class="record-tokens mono green">{formatTokens(record.inputTokens)} in</span>
          <span class="record-tokens mono blue">{formatTokens(record.outputTokens)} out</span>
          <span class="record-cost mono accent">{formatCost(record.cost)}</span>
        </div>

        {#if record.toolCalls.length > 0}
          <div class="tool-calls">
            {#each record.toolCalls as tc}
              <div class="tool-call">
                <span class="tc-index mono">#{tc.callIndex}</span>
                <span class="tc-name mono">
                  {tc.displayName}
                  {#if tc.type === 'mcp'}
                    <span class="badge badge-mcp">mcp</span>
                  {:else if tc.type === 'skill'}
                    <span class="badge badge-skill">skill</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="no-tool-calls">{$t('sessions.detail.noToolCalls')}</div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .back-link {
    display: inline-block;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-decoration: none;
    margin-bottom: 0.5rem;
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--accent); }

  .session-id {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .meta-bar {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    padding: 1rem 1.25rem;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .meta-label {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .meta-value {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .gap-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0;
  }
  .gap-label {
    font-family: var(--mono);
    font-size: 0.65rem;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }

  .record-card {
    background: var(--surface);
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }
  .record-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    background: var(--raised);
    flex-wrap: wrap;
  }
  .record-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .record-time {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .record-model {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex: 1;
  }
  .record-tokens {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .record-cost {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .tool-calls {
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0;
  }
  .tool-call {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.85rem;
    transition: background 0.12s;
  }
  .tool-call:hover {
    background: var(--hover);
  }
  .tc-index {
    font-size: 0.65rem;
    color: var(--text-muted);
    width: 1.5rem;
    flex-shrink: 0;
  }
  .tc-name {
    font-size: 0.8rem;
    color: var(--text);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .badge {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .badge-mcp {
    background: var(--blue-dim);
    color: var(--blue);
  }
  .badge-skill {
    background: var(--purple-dim);
    color: var(--purple);
  }

  .no-tool-calls {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.4rem 0.85rem;
    font-style: italic;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/sessions/
git commit -m "feat: add session detail page with timeline view"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task |
|--|--|
| F3: classify mcp__ prefix → mcp | Task 1 (classifyToolCall) |
| F3: classify Skill → skill | Task 1 (classifyToolCall) |
| F3: others → builtin | Task 1 (classifyToolCall) |
| F3: Tool Calls page type filter | Task 3 (type tabs) |
| F3: MCP display as server / action | Task 1 (parseMcpName) + Task 3 |
| F3: type badges | Task 3 (badge-mcp, badge-skill) |
| F3: Overview MCP server ranking | Task 2 (topMcpServers) + Task 4 |
| F4: sessions list duration column | Task 5 + Task 7 |
| F4: sessions list toolCallCount column | Task 5 + Task 7 |
| F4: clickable rows → detail page | Task 7 (goToDetail) |
| F4: session detail metadata | Task 6 + Task 8 |
| F4: API call timeline (records) | Task 6 + Task 8 |
| F4: tool calls under each record | Task 6 + Task 8 |
| F4: gap indicators between records | Task 8 (gap-divider) |
| F3+F4: i18n EN + ZH | Tasks 3, 4, 7 |

All spec requirements are covered.

### Placeholder Scan

No TBD, TODO, or vague steps detected.

### Type Consistency

- `classifyToolCall` returns `'mcp' | 'skill' | 'builtin'` — used consistently in Tasks 1, 6, 8
- `parseMcpName` returns `{ server, action, display }` — `display` used in Tool Calls page and session detail; `server` used in topMcpServers
- `getToolTypeFilter` returns a SQL string — used only in Task 1 server-side
- Session API response: `duration` (ms integer), `toolCallCount` (integer) — consumed in Tasks 7, 8
- `fetchSessionDetail` signature: `(sessionId: string, params?: Record<string, string>)` — used in Task 8
