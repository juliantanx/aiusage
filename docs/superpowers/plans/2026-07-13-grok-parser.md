# Grok Build Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Grok Build `updates.jsonl` usage reliably, rescan files skipped by the old implementation, and preserve incremental/idempotent imports.

**Architecture:** Add a dedicated stateful parser in `@aiusage/core` that converts cumulative Grok token counters into stable per-turn deltas. Narrow discovery to `updates.jsonl`, derive Grok session/workspace metadata in the parser, and version the Grok file watermark so existing incorrectly-consumed logs are replayed once.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Vitest, better-sqlite3

---

## File map

- Create `packages/core/src/parsers/grok.ts`: Grok JSON-RPC parsing, per-file state, stable record construction, and reset on finalize.
- Create `packages/core/tests/grok.test.ts`: parser behavior and state-isolation regression tests.
- Modify `packages/core/src/parsers/index.ts`: export `GrokParser`.
- Modify `packages/core/src/aggregator.ts`: register `GrokParser` for the `grok` tool.
- Modify `packages/core/tests/aggregator.test.ts`: assert Grok routes to the parser.
- Modify `packages/cli/src/discovery.ts`: limit Grok discovery to `updates.jsonl`.
- Modify `packages/cli/tests/discovery.test.ts`: cover Windows/GROK_HOME paths and file filtering.
- Modify `packages/cli/src/watermark.ts`: migrate old Grok file watermarks once with a parser-version marker.
- Modify `packages/cli/tests/watermark.test.ts`: prove migration scope and persistence.
- Create `packages/cli/tests/commands/parse-grok.test.ts`: end-to-end historical replay, idempotency, metadata, and session isolation.

### Task 1: Specify the Grok parser behavior

**Files:**
- Create: `packages/core/tests/grok.test.ts`
- Create: `packages/core/src/parsers/grok.ts`

- [ ] **Step 1: Write failing parser tests**

Create a shared context builder and tests with representative JSON-RPC rows:

```ts
const context = (sourceFile = '/home/test/.grok/sessions/%2Fwork%2Fapp/session-1/updates.jsonl', lineOffset = 0): ParseContext => ({
  tool: 'grok',
  sourceFile,
  lineOffset,
  sessionId: 'unknown',
  now: 1_800_000_000_000,
  device: 'test-device',
  deviceInstanceId: 'device-1',
})

const row = (sessionUpdate: string, totalTokens?: number, timestamp = 1_700_000_000_000) => JSON.stringify({
  method: 'session/update',
  params: {
    sessionId: 'session-1',
    update: {
      sessionUpdate,
      _meta: { modelId: 'grok-composer-2.5-fast' },
    },
    _meta: { totalTokens, agentTimestampMs: timestamp },
  },
})
```

Cover these assertions:

```ts
it('emits positive cumulative token deltas per turn with stable metadata', () => {
  // baseline 100, first turn reaches 300, second reaches 450
  // expect two records with inputTokens 200 and 150
  // expect xai provider, session-1, decoded cwd /work/app, model and timestamps
})

it('ignores duplicate and decreasing cumulative counters', () => {
  // 100 -> 150 -> 150 -> 120 -> 200 produces 100, never negative or duplicated
})

it('emits an aggregate fallback without a user-message boundary', () => {
  // a single counter of 120 produces one grok-unknown record
})

it('uses stable turn offsets so an appended turn replaces its previous snapshot', () => {
  // finalize at 150, replay plus append to 200; both records use the user row offset
})

it('clears parser state between finalized files', () => {
  // second source starts from zero and uses its own session/model/cwd
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm --filter @aiusage/core test -- grok.test.ts
```

Expected: FAIL because `../src/parsers/grok.js` does not exist.

- [ ] **Step 3: Implement the minimal stateful parser**

Implement `GrokParser implements Parser` with these private state values:

```ts
private currentModel = 'grok-unknown'
private lastTotal: number | null = null
private activeTurn: ActiveTurn | null = null
private fallback: ActiveTurn | null = null
```

`ActiveTurn` stores `baselineTotal`, `maxTotal`, `lineOffset`, `timestamp`, `model`, and the latest `ParseContext`. `parseLine()` must:

1. Ignore invalid JSON and non-`session/update` rows.
2. Update model from `params.update._meta.modelId` or `params._meta.modelId`.
3. On `user_message_chunk`, emit the prior active turn, then start a new turn from `lastTotal ?? 0` using that row's stable line offset.
4. Read non-negative finite cumulative totals from supported paths.
5. Ignore totals lower than `lastTotal`; update a turn only when the total increases.
6. Use `params.sessionId` over the incoming context session ID.
7. Decode the grandparent directory of `updates.jsonl` with `decodeURIComponent` for `cwd`.
8. Build records with `generateRecordId(deviceInstanceId, sourceFile, turn.lineOffset)`, `inferProvider`, `resolvePrice`, and `calculateCost`.
9. Return the final active/fallback turn from `finalize()` and reset every state field before returning.

Use this token mapping:

```ts
const usage = {
  inputTokens: delta,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  thinkingTokens: 0,
}
```

- [ ] **Step 4: Run parser tests and verify GREEN**

Run:

```bash
pnpm --filter @aiusage/core test -- grok.test.ts
```

Expected: all Grok parser tests pass.

### Task 2: Register Grok in the aggregator

**Files:**
- Modify: `packages/core/src/parsers/index.ts`
- Modify: `packages/core/src/aggregator.ts`
- Modify: `packages/core/tests/aggregator.test.ts`

- [ ] **Step 1: Add a failing aggregator routing test**

```ts
it('processes Grok Build updates through the Grok parser', () => {
  const aggregator = new Aggregator()
  const context = aggregator.createContext({
    tool: 'grok',
    sourceFile: '/tmp/project/session-1/updates.jsonl',
    lineOffset: 0,
    sessionId: 'session-1',
    device: 'dev',
    deviceInstanceId: 'dev-123',
  })
  aggregator.parseLine(JSON.stringify({
    method: 'session/update',
    params: { sessionId: 'session-1', _meta: { totalTokens: 42, agentTimestampMs: 1_700_000_000_000 } },
  }), context)
  const [result] = aggregator.finalize()
  expect(result.record?.tool).toBe('grok')
  expect(result.record?.inputTokens).toBe(42)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @aiusage/core test -- aggregator.test.ts
```

Expected: FAIL because no parser is registered for `grok`.

- [ ] **Step 3: Export and register `GrokParser`**

Add:

```ts
export { GrokParser } from './grok.js'
```

Import it in `aggregator.ts` and add:

```ts
['grok', new GrokParser()],
```

- [ ] **Step 4: Run core tests**

Run:

```bash
pnpm --filter @aiusage/core test
```

Expected: all core tests pass.

- [ ] **Step 5: Commit the core parser**

```bash
git add packages/core/src/parsers/grok.ts packages/core/src/parsers/index.ts packages/core/src/aggregator.ts packages/core/tests/grok.test.ts packages/core/tests/aggregator.test.ts
git commit -m "fix: parse Grok Build usage updates"
```

### Task 3: Restrict Grok discovery to usage files

**Files:**
- Modify: `packages/cli/tests/discovery.test.ts`
- Modify: `packages/cli/src/discovery.ts`

- [ ] **Step 1: Add failing discovery tests**

Create `%USERPROFILE%/.grok/sessions/<encoded-project>/<session>/` with `updates.jsonl`, `events.jsonl`, and `chat_history.jsonl`. Assert on `win32` that:

```ts
expect(discoverTools().find((tool) => tool.sourceKey === 'grok')?.status).toBe('found')
expect(discoverLogFiles().find((result) => result.tool === 'grok')?.paths).toEqual([updatesPath])
```

Add a second test with `process.env.GROK_HOME = customRoot` and assert discovery uses `customRoot/sessions/.../updates.jsonl`. Add `GROK_HOME` cleanup in `afterEach`.

- [ ] **Step 2: Run discovery tests and verify RED**

Run:

```bash
pnpm --filter @juliantanx/aiusage test -- discovery.test.ts
```

Expected: FAIL because Grok currently returns all `.jsonl` files.

- [ ] **Step 3: Narrow the Grok filter**

Change the source entry to:

```ts
{ tool: 'grok', path: probeGrok(ctx), filter: (p) => basename(p) === 'updates.jsonl' },
```

- [ ] **Step 4: Run discovery tests and verify GREEN**

Run the same command and expect all discovery tests to pass.

### Task 4: Migrate stale Grok watermarks once

**Files:**
- Modify: `packages/cli/tests/watermark.test.ts`
- Modify: `packages/cli/src/watermark.ts`

- [ ] **Step 1: Add failing migration tests**

Write an envelope containing both Grok and Claude entries but no Grok parser version:

```ts
writeFileSync(watermarkPath, JSON.stringify({
  files: {
    grok: { '/old/updates.jsonl': { offset: 100, size: 100, mtime: 1 } },
    'claude-code': { '/claude/session.jsonl': { offset: 200, size: 200, mtime: 2 } },
  },
}))
```

Assert that a new manager returns `null` for the Grok entry, preserves Claude, then after `save()` the JSON contains `grokParserVersion: 1`. Add a second test with version 1 proving a current Grok entry is preserved.

- [ ] **Step 2: Run watermark tests and verify RED**

Run:

```bash
pnpm --filter @juliantanx/aiusage test -- watermark.test.ts
```

Expected: FAIL because the version/migration does not exist.

- [ ] **Step 3: Implement scoped migration**

Add:

```ts
const CURRENT_GROK_PARSER_VERSION = 1
```

Extend `WatermarkState` with `grokParserVersion?: number`. Normalize both legacy-flat and envelope states, and when the loaded version is older:

```ts
state.files.grok = {}
state.grokParserVersion = CURRENT_GROK_PARSER_VERSION
```

Do not reset a newly-created empty state, and preserve all unrelated cursor fields during envelope loading.

- [ ] **Step 4: Run watermark tests and verify GREEN**

Run the same command and expect all watermark tests to pass.

- [ ] **Step 5: Commit discovery and migration**

```bash
git add packages/cli/src/discovery.ts packages/cli/tests/discovery.test.ts packages/cli/src/watermark.ts packages/cli/tests/watermark.test.ts
git commit -m "fix: rediscover historical Grok usage logs"
```

### Task 5: Prove end-to-end import and idempotency

**Files:**
- Create: `packages/cli/tests/commands/parse-grok.test.ts`

- [ ] **Step 1: Add an end-to-end CLI test**

Mock `homedir()` to a temporary directory, create `.aiusage/config.json`, two Grok session directories, and an old watermark that marks both `updates.jsonl` files fully consumed without `grokParserVersion`.

Use counters `100 -> 300 -> 450` in session A and `20 -> 70` in session B. Then:

```ts
const first = await runParse(cacheDb, 'grok')
expect(first.parsedCount).toBe(3)

const rows = cacheDb.prepare(`
  SELECT session_id, model, input_tokens, cwd
  FROM records
  WHERE tool = 'grok'
  ORDER BY session_id, line_offset
`).all()

expect(rows).toEqual([
  // session A: 200 and 150, decoded cwd
  // session B: 50, isolated from session A
])

const second = await runParse(cacheDb, 'grok')
expect(second.parsedCount).toBe(0)
expect(cacheDb.prepare("SELECT COUNT(*) AS count FROM records WHERE tool = 'grok'").get()).toEqual({ count: 3 })
```

- [ ] **Step 2: Run the test and verify RED if integration gaps remain**

Run:

```bash
pnpm --filter @aiusage/core build
pnpm --filter @juliantanx/aiusage test -- parse-grok.test.ts
```

Expected before any integration correction: the test identifies any remaining metadata, replay, or stable-ID issue.

- [ ] **Step 3: Make only the minimal integration correction**

If necessary, adjust Grok parser stable offsets/reset behavior or watermark normalization. Do not broaden parsing to other Grok files or add unrelated telemetry sources.

- [ ] **Step 4: Run the focused integration suite**

Run:

```bash
pnpm --filter @aiusage/core build
pnpm --filter @juliantanx/aiusage test -- parse-grok.test.ts discovery.test.ts watermark.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the integration regression test**

```bash
git add packages/cli/tests/commands/parse-grok.test.ts packages/core/src/parsers/grok.ts packages/cli/src/watermark.ts
git commit -m "test: cover Grok historical import"
```

### Task 6: Full verification and handoff

**Files:**
- Verify all files changed by Tasks 1-5.

- [ ] **Step 1: Run formatting/whitespace validation**

```bash
git diff --check main...HEAD
```

Expected: no output and exit 0.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all workspace test suites pass with zero failures.

- [ ] **Step 3: Run lint and build**

```bash
pnpm lint
pnpm build
```

Expected: both commands exit 0.

- [ ] **Step 4: Review scope and branch state**

```bash
git status --short --branch
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: clean `fix/issue-43-grok-parser` branch containing only the design, plan, parser, discovery, watermark, and tests for issue #43.
