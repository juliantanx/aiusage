# OpenCode Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode as a first-class usage source backed by the local OpenCode SQLite database, and add tool-type filtering everywhere the product currently supports device filtering.

**Architecture:** Keep the existing JSONL parsers for Claude Code, Codex, and OpenClaw unchanged. Add a dedicated OpenCode database importer in the CLI parse flow, persist a separate database watermark for incremental imports, and thread an optional `tool` filter through CLI summary, API query handlers, and the Svelte dashboard stores/components.

**Tech Stack:** TypeScript, better-sqlite3, Commander, SvelteKit, Vitest, SQLite

---

## File Structure

### Core files to modify
- `packages/core/src/types.ts` — extend `Tool` union with `opencode`
- `packages/cli/src/cli.ts` — expose `opencode` in parse command and add `--tool` to summary command
- `packages/cli/src/commands/parse.ts` — discover and import OpenCode DB data alongside existing JSONL sources
- `packages/cli/src/commands/summary.ts` — add `tool` filtering to summary queries
- `packages/cli/src/api/server.ts` — add `tool` filtering to all device-aware API endpoints
- `packages/cli/src/watermark.ts` — extend watermark model with OpenCode DB cursor storage
- `packages/web/src/lib/stores.js` — add selected tool store
- `packages/web/src/lib/api.js` — pass tool filter to API requests
- `packages/web/src/lib/i18n.js` — add UI strings for tool selector
- `packages/web/src/routes/+page.svelte` — include tool selector in overview page
- `packages/web/src/routes/tokens/+page.svelte` — include tool selector and pass selected tool
- `packages/web/src/routes/cost/+page.svelte` — include tool selector and pass selected tool
- `packages/web/src/routes/models/+page.svelte` — include tool selector and pass selected tool
- `packages/web/src/routes/tool-calls/+page.svelte` — include tool selector and pass selected tool
- `packages/web/src/routes/projects/+page.svelte` — include tool selector and pass selected tool
- `packages/web/src/routes/sessions/+page.svelte` — include tool selector and pass selected tool

### New files to create
- `packages/cli/src/commands/parse-opencode.ts` — OpenCode SQLite importer and cursor helpers
- `packages/cli/tests/commands/parse-opencode.test.ts` — importer tests using a temporary SQLite database
- `packages/web/src/lib/components/ToolSelector.svelte` — reusable tool-type filter dropdown

### Test files to modify
- `packages/cli/tests/commands/summary.test.ts`
- `packages/cli/tests/api/server.test.ts`
- `packages/cli/tests/watermark.test.ts`
- `packages/core/tests/aggregator.test.ts`

---

### Task 1: Extend the shared tool type to include OpenCode

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/tests/aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test case in `packages/core/tests/aggregator.test.ts` asserting the aggregator can create context for `opencode`:

```ts
it('creates parse context for opencode', () => {
  const aggregator = new Aggregator()
  const context = aggregator.createContext({
    tool: 'opencode',
    sourceFile: '/tmp/opencode.db',
    lineOffset: 0,
    sessionId: 'ses_123',
    device: 'macbook',
    deviceInstanceId: 'device-123',
  })

  expect(context.tool).toBe('opencode')
  expect(context.sessionId).toBe('ses_123')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/core/tests/aggregator.test.ts
```

Expected: FAIL with a TypeScript or runtime error because `'opencode'` is not assignable to `Tool`.

- [ ] **Step 3: Write minimal implementation**

Update `packages/core/src/types.ts`:

```ts
export type Tool = 'claude-code' | 'codex' | 'openclaw' | 'opencode'
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/core/tests/aggregator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/tests/aggregator.test.ts
git commit -m "feat: add opencode as supported tool type"
```

### Task 2: Add OpenCode DB watermark support

**Files:**
- Modify: `packages/cli/src/watermark.ts`
- Test: `packages/cli/tests/watermark.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test in `packages/cli/tests/watermark.test.ts` for OpenCode DB cursor persistence:

```ts
it('persists opencode database cursor', () => {
  const wm = new WatermarkManager(watermarkPath)
  wm.setOpenCodeCursor({ lastMessageCreatedAt: 1000, lastMessageId: 'msg_1' })
  wm.save()

  const wm2 = new WatermarkManager(watermarkPath)
  expect(wm2.getOpenCodeCursor()).toEqual({
    lastMessageCreatedAt: 1000,
    lastMessageId: 'msg_1',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/tests/watermark.test.ts
```

Expected: FAIL because `setOpenCodeCursor` and `getOpenCodeCursor` do not exist.

- [ ] **Step 3: Write minimal implementation**

Extend `packages/cli/src/watermark.ts` with dedicated cursor storage:

```ts
export interface OpenCodeCursor {
  lastMessageCreatedAt: number
  lastMessageId: string
}

export interface WatermarkState {
  files: Record<Tool, Record<string, WatermarkEntry>>
  opencode?: OpenCodeCursor | null
}
```

Add methods:

```ts
getOpenCodeCursor(): OpenCodeCursor | null {
  return this.data.opencode ?? null
}

setOpenCodeCursor(cursor: OpenCodeCursor): void {
  this.data.opencode = cursor
}
```

Keep file-based entries under `files`, and update `getEntry`, `setEntry`, and `cleanup` to use `this.data.files`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/tests/watermark.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/watermark.ts packages/cli/tests/watermark.test.ts
git commit -m "feat: persist opencode import cursor"
```

### Task 3: Build the OpenCode SQLite importer

**Files:**
- Create: `packages/cli/src/commands/parse-opencode.ts`
- Test: `packages/cli/tests/commands/parse-opencode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/tests/commands/parse-opencode.test.ts` with a temporary database fixture:

```ts
it('imports assistant messages and tool parts from opencode db', () => {
  const result = runParseOpenCode(db, {
    dbPath,
    device: 'macbook',
    deviceInstanceId: 'device-123',
    now: 1778822000000,
    cursor: null,
  })

  expect(result.records).toHaveLength(1)
  expect(result.records[0].tool).toBe('opencode')
  expect(result.records[0].model).toBe('glm-5.1')
  expect(result.records[0].provider).toBe('qianfan')
  expect(result.records[0].inputTokens).toBe(120)
  expect(result.toolCalls.map(tc => tc.name)).toEqual(['bash', 'read'])
  expect(result.nextCursor).toEqual({
    lastMessageCreatedAt: 1778821880545,
    lastMessageId: 'msg_1',
  })
})
```

Use fixture rows shaped like:

```ts
const messageData = JSON.stringify({
  role: 'assistant',
  modelID: 'glm-5.1',
  providerID: 'qianfan',
  cost: 0,
  tokens: {
    input: 120,
    output: 30,
    reasoning: 5,
    cache: { read: 0, write: 0 },
  },
  time: { created: 1778821880545, completed: 1778821881000 },
})
```

```ts
const partData = JSON.stringify({ type: 'tool', tool: 'bash' })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/parse-opencode.test.ts
```

Expected: FAIL because `parse-opencode.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/commands/parse-opencode.ts` exporting:

```ts
export interface OpenCodeImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  now: number
  cursor: OpenCodeCursor | null
}

export interface OpenCodeImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  nextCursor: OpenCodeCursor | null
  errors: string[]
}
```

Implement a query ordered by `m.time_created, m.id`:

```sql
SELECT m.id, m.session_id, m.time_created, m.data
FROM message m
WHERE m.time_created > ? OR (m.time_created = ? AND m.id > ?)
ORDER BY m.time_created, m.id
```

Parse only assistant messages with tokens, map them to `StatsRecord`, and load parts with:

```sql
SELECT id, message_id, session_id, time_created, data
FROM part
WHERE message_id = ?
ORDER BY time_created, id
```

Generate IDs with existing helpers:

```ts
const recordId = generateRecordId(deviceInstanceId, dbPath, message.time_created)
```

Set:

```ts
tool: 'opencode'
sourceFile: dbPath
lineOffset: message.time_created
costSource: parsed.cost != null ? 'log' : 'unknown'
```

For unknown provider fallback:

```ts
const provider = parsed.providerID ?? inferProvider(model)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/parse-opencode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/parse-opencode.ts packages/cli/tests/commands/parse-opencode.test.ts
git commit -m "feat: import opencode usage from sqlite"
```

### Task 4: Integrate OpenCode import into `aiusage parse`

**Files:**
- Modify: `packages/cli/src/commands/parse.ts`
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/tests/commands/parse-opencode.test.ts`

- [ ] **Step 1: Write the failing test**

Add an integration-style test asserting `runParse` imports OpenCode when `--tool opencode` is selected:

```ts
it('runParse imports opencode records when tool filter is opencode', async () => {
  const result = await runParse(cacheDb, 'opencode')
  expect(result.parsedCount).toBe(1)
  expect(result.toolCallCount).toBe(2)
})
```

Stub `homedir()`-relative file setup by creating:
- `~/.aiusage/watermark.json`
- `~/.local/share/opencode/opencode.db`

inside a temporary test home, or factor `runParse` helpers so the DB path can be injected during tests.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/parse-opencode.test.ts
```

Expected: FAIL because `runParse` never looks for OpenCode DBs.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/commands/parse.ts`:
- import `existsSync` path check for `~/.local/share/opencode/opencode.db`
- import `runParseOpenCode`
- after JSONL tools are processed, add OpenCode branch

Use logic like:

```ts
const openCodeDbPath = join(home, '.local', 'share', 'opencode', 'opencode.db')
if ((!filterTool || filterTool === 'opencode') && existsSync(openCodeDbPath)) {
  const result = runParseOpenCode(db, {
    dbPath: openCodeDbPath,
    device,
    deviceInstanceId,
    now: Date.now(),
    cursor: wm.getOpenCodeCursor(),
  })

  for (const record of result.records) insertRecord(db, record)
  for (const tc of result.toolCalls) insertToolCall(db, tc)
  if (result.nextCursor) wm.setOpenCodeCursor(result.nextCursor)
  parsedCount += result.records.length
  toolCallCount += result.toolCalls.length
  errors.push(...result.errors)
}
```

Update parse command help text in `packages/cli/src/cli.ts`:

```ts
.option('--tool <tool>', 'Specific tool to parse (claude-code|codex|openclaw|opencode)')
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/parse-opencode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/parse.ts packages/cli/src/cli.ts packages/cli/tests/commands/parse-opencode.test.ts
git commit -m "feat: wire opencode into parse command"
```

### Task 5: Add tool filtering to CLI summary

**Files:**
- Modify: `packages/cli/src/commands/summary.ts`
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/tests/commands/summary.test.ts`

- [ ] **Step 1: Write the failing test**

Add a summary test:

```ts
it('filters summary by tool', () => {
  insertRecord(db, createTestRecord({ id: 'r1', tool: 'claude-code', inputTokens: 100, outputTokens: 50, cost: 0.001 }))
  insertRecord(db, createTestRecord({ id: 'r2', tool: 'opencode', inputTokens: 300, outputTokens: 100, cost: 0.002 }))

  const summary = generateSummary(db, { tool: 'opencode' })

  expect(summary.totalTokens).toBe(400)
  expect(Object.keys(summary.byTool)).toEqual(['opencode'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/summary.test.ts
```

Expected: FAIL because `SummaryOptions` has no `tool` filter and SQL ignores it.

- [ ] **Step 3: Write minimal implementation**

Extend `SummaryOptions`:

```ts
export interface SummaryOptions {
  device?: string
  tool?: string
  currentDeviceInstanceId?: string
}
```

Build a reusable tool condition:

```ts
const toolWhere = options?.tool ? 'AND tool = @tool' : ''
```

Thread it into every records/synced_records query and include `tool` in params.

Update CLI summary command:

```ts
.option('--tool <tool>', 'Filter by tool type')
```

Pass through:

```ts
tool: options.tool,
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/tests/commands/summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/summary.ts packages/cli/src/cli.ts packages/cli/tests/commands/summary.test.ts
git commit -m "feat: add tool filter to cli summary"
```

### Task 6: Add tool filtering to API query handlers

**Files:**
- Modify: `packages/cli/src/api/server.ts`
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add API tests like:

```ts
it('summary applies tool filter across merged devices', async () => {
  insertTestRecord(db, { tool: 'claude-code', input_tokens: 100, output_tokens: 50, cost: 0.001 })
  insertTestSyncedRecord(db, { tool: 'opencode', input_tokens: 200, output_tokens: 100, cost: 0.003 })

  const res = await fetch(`${baseUrl}/api/summary?range=all&tool=opencode`)
  const data = await res.json()

  expect(data.totalTokens).toBe(300)
  expect(Object.keys(data.byTool)).toEqual(['opencode'])
})
```

Also add one test for `/api/tokens` and one for `/api/cost` with both `device` and `tool`:

```ts
const res = await fetch(`${baseUrl}/api/cost?range=all&device=remote-uuid-0001&tool=opencode`)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/cli/tests/api/server.test.ts
```

Expected: FAIL because endpoints ignore `tool` query params.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/api/server.ts`, add helper:

```ts
function getToolFilter(tool: string | null, prefix = '') {
  if (!tool) return { where: '', params: {} }
  const col = prefix ? `${prefix}.tool` : 'tool'
  return { where: `AND ${col} = @tool`, params: { tool } }
}
```

Read `const tool = url.searchParams.get('tool')` in every endpoint that already reads `device`, then inject `tf.where` and `tf.params` into:
- `/api/summary`
- `/api/tokens`
- `/api/cost`
- `/api/models`
- `/api/tool-calls`
- `/api/projects`
- `/api/sessions`

For joined tool-call queries, use `getToolFilter(tool, 'r')` so the filter applies to joined records.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/cli/tests/api/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/server.test.ts
git commit -m "feat: add tool filter to api endpoints"
```

### Task 7: Add a reusable tool selector to the web app

**Files:**
- Create: `packages/web/src/lib/components/ToolSelector.svelte`
- Modify: `packages/web/src/lib/stores.js`
- Modify: `packages/web/src/lib/i18n.js`

- [ ] **Step 1: Write the failing test**

If the web app already has component tests, add one. If it does not, add a store-level test in the nearest existing test file or create a minimal one asserting selected tool defaults to all tools:

```ts
expect(get(selectedTool)).toBe('')
setTool('opencode')
expect(get(selectedTool)).toBe('opencode')
```

If there is no existing Svelte test harness, use this as the first check and keep the UI component covered by downstream page tests/manual verification.

- [ ] **Step 2: Run test to verify it fails**

Run the project's web test command or the nearest existing targeted command, for example:

```bash
pnpm vitest run packages/web
```

Expected: FAIL because `selectedTool` and `setTool` do not exist.

- [ ] **Step 3: Write minimal implementation**

Update `packages/web/src/lib/stores.js`:

```js
export const selectedTool = writable('')

export function setTool(tool) {
  selectedTool.set(tool)
}
```

Create `packages/web/src/lib/components/ToolSelector.svelte`:

```svelte
<script>
  import { selectedTool, setTool } from '../stores.js'
  import { t } from '../i18n.js'

  const tools = ['claude-code', 'codex', 'openclaw', 'opencode']

  function handleChange(e) {
    setTool(e.target.value)
  }
</script>

<div class="tool-selector">
  <select value={$selectedTool} on:change={handleChange} title={$t('tool.allTools')}>
    <option value="">{$t('tool.allTools')}</option>
    {#each tools as tool}
      <option value={tool}>{tool}</option>
    {/each}
  </select>
</div>
```

Add i18n keys in `packages/web/src/lib/i18n.js`:

```js
tool: {
  allTools: 'All tools'
}
```

and Chinese equivalent:

```js
tool: {
  allTools: '全部工具'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run packages/web
```

Expected: PASS, or if there are no web vitest tests configured, the new store test passes and no import errors remain.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/components/ToolSelector.svelte packages/web/src/lib/stores.js packages/web/src/lib/i18n.js
git commit -m "feat: add web tool selector state"
```

### Task 8: Thread tool filtering through all dashboard pages

**Files:**
- Modify: `packages/web/src/lib/api.js`
- Modify: `packages/web/src/routes/+page.svelte`
- Modify: `packages/web/src/routes/tokens/+page.svelte`
- Modify: `packages/web/src/routes/cost/+page.svelte`
- Modify: `packages/web/src/routes/models/+page.svelte`
- Modify: `packages/web/src/routes/tool-calls/+page.svelte`
- Modify: `packages/web/src/routes/projects/+page.svelte`
- Modify: `packages/web/src/routes/sessions/+page.svelte`

- [ ] **Step 1: Write the failing test**

Add at least one API wiring test at the route level, or if page tests do not exist, add a manual verification checklist in the commit and rely on API tests from Task 6 plus a targeted smoke run. The expected route code change should look like:

```svelte
$: $dateRange, $selectedDevice, $selectedTool, loadData()
```

and request payloads should include:

```ts
{ ...$dateRange, device: $selectedDevice, tool: $selectedTool }
```

- [ ] **Step 2: Run test to verify it fails**

Run the relevant web test command or build command:

```bash
pnpm --filter @aiusage/web test
```

If no page tests exist, use:

```bash
pnpm --filter @aiusage/web build
```

Expected: current behavior lacks tool selector and omits `tool` from fetch calls.

- [ ] **Step 3: Write minimal implementation**

Update `packages/web/src/lib/api.js` to keep passing arbitrary params unchanged.

For each route page, import the selector and store:

```svelte
import { dateRange, selectedDevice, selectedTool } from '$lib/stores.js'
import ToolSelector from '$lib/components/ToolSelector.svelte'
```

Render both selectors in the filter bar:

```svelte
<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
  <ToolSelector />
</div>
```

Update every data load call to include `tool: $selectedTool`.

Update each reactive reload statement to include `$selectedTool`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @aiusage/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/api.js packages/web/src/routes/+page.svelte packages/web/src/routes/tokens/+page.svelte packages/web/src/routes/cost/+page.svelte packages/web/src/routes/models/+page.svelte packages/web/src/routes/tool-calls/+page.svelte packages/web/src/routes/projects/+page.svelte packages/web/src/routes/sessions/+page.svelte
git commit -m "feat: apply tool filtering across dashboard views"
```

### Task 9: Run targeted verification and full regression checks

**Files:**
- Modify: no source files expected unless failures are found
- Test: `packages/core/tests/aggregator.test.ts`
- Test: `packages/cli/tests/watermark.test.ts`
- Test: `packages/cli/tests/commands/parse-opencode.test.ts`
- Test: `packages/cli/tests/commands/summary.test.ts`
- Test: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
pnpm vitest run packages/core/tests/aggregator.test.ts packages/cli/tests/watermark.test.ts packages/cli/tests/commands/parse-opencode.test.ts packages/cli/tests/commands/summary.test.ts packages/cli/tests/api/server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web build**

Run:

```bash
pnpm --filter @aiusage/web build
```

Expected: PASS.

- [ ] **Step 3: Run repo lint/type/test command(s)**

Read `package.json` / workspace scripts first, then run the exact existing verification commands. If the repo exposes a single root verification command, prefer it. If not, run the smallest existing set covering typecheck and tests.

Expected: PASS.

- [ ] **Step 4: Manual smoke check**

Run:

```bash
aiusage parse --tool opencode
aiusage summary --tool opencode
aiusage serve
```

Expected:
- parse prints a non-negative record/tool-call count and no crash
- summary prints only `opencode` rows in `By Tool`
- dashboard pages load and respond to tool selector changes

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify opencode import and tool filtering"
```

## Self-Review

### Spec coverage
- OpenCode as a distinct tool type: covered by Tasks 1, 3, 4
- SQLite data source instead of JSONL: covered by Tasks 3 and 4
- Assistant-message record granularity: covered by Task 3
- Tool call extraction from `part.data`: covered by Task 3
- Separate DB watermark: covered by Task 2
- Tool filter across CLI/API/Web: covered by Tasks 5, 6, 7, 8
- Device + tool combined filtering: covered by Tasks 5, 6, 8

### Placeholder scan
- No `TODO` / `TBD` placeholders remain
- Every code-touching task names exact files and commands
- Each testing step includes a concrete command and expected result

### Type consistency
- `opencode` is the only new tool literal used throughout the plan
- Web store naming uses `selectedTool` / `setTool` consistently
- OpenCode watermark naming uses `OpenCodeCursor`, `getOpenCodeCursor`, and `setOpenCodeCursor` consistently

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-opencode-support.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
