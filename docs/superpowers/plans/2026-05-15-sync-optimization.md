# Sync Backend Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize sync subsystem — device-partitioned daily files eliminate all write conflicts, simplify the SyncBackend interface, remove conflict-detection dead code, and clean up pull/upload logic.

**Architecture:** Each device writes only to its own files (`{deviceInstanceId}/YYYY/MM/DD.ndjson`), so two devices never modify the same file. This eliminates all write conflicts across all backends (Git, S3). The `ConflictError` class, SHA/ETag tracking, `IfMatch` locking, and retry loops are all removed. The old API-based GitHub backend (`github.ts`) is dead code and will be deleted.

**Tech Stack:** TypeScript, better-sqlite3, git CLI, vitest

**No backwards compatibility required** — all existing remote data has been cleaned.

---

## Context for Implementers

### Current vs New File Layout

```
Current:  data/2026/05/13/09.ndjson              ← all devices mixed, hourly
New:      data/{deviceInstanceId}/2026/05/13.ndjson  ← one device per file, daily
```

### Current Sync Flow

```
prepare()  → git fetch + reset to origin/main
pull()     → listFiles → readFile each → filter by deviceInstanceId per-record → insertSyncedRecord
upload()   → getUnsyncedRecords → group by hour → read-merge-write with ConflictError retry
flush()    → git add + commit + push (no retry)
```

### New Sync Flow

```
prepare()  → git fetch + reset to origin/main
pull()     → listFiles → skip own device prefix → readFile each → insertSyncedRecord (no per-record filter)
upload()   → getUnsyncedRecords → group by day+device → read-merge-write own file (no retry)
flush()    → git add + commit + push (with pull --rebase retry)
```

### Key Files

| File | Changes |
|------|---------|
| `packages/cli/src/sync/index.ts` | Simplify `SyncBackend` interface (remove sha), `getSyncPath` adds deviceId, simplify upload & pull |
| `packages/cli/src/sync/git.ts` | Simplify `readFile`/`writeFile` (remove sha), `flush()` adds push retry |
| `packages/cli/src/sync/s3.ts` | Simplify `readFile`/`writeFile` (remove sha/ETag/IfMatch/ConflictError) |
| `packages/cli/src/sync/github.ts` | **Delete** — dead code |
| `packages/cli/tests/sync/index.test.ts` | Update all tests for new interface and paths |
| `packages/cli/tests/sync/git.test.ts` | **Create** — test push retry |
| `packages/cli/tests/sync/s3.test.ts` | Update — remove sha/IfMatch tests |
| `packages/cli/tests/sync/github.test.ts` | **Delete** |
| `README.md`, `README_zh.md` | Update sync docs |

---

### Task 1: Simplify `SyncBackend` Interface — Remove SHA

**Files:**
- Modify: `packages/cli/src/sync/index.ts` (interface + `ConflictError`)
- Modify: `packages/cli/src/sync/git.ts` (`readFile`, `writeFile`)
- Modify: `packages/cli/src/sync/s3.ts` (`readFile`, `writeFile`, remove `ConflictError` import)
- Modify: `packages/cli/tests/sync/s3.test.ts` (remove sha/IfMatch tests)

- [ ] **Step 1: Update `SyncBackend` interface and remove `ConflictError`**

In `packages/cli/src/sync/index.ts`, replace the interface and remove `ConflictError` (lines 8-24):

```typescript
export interface SyncBackend {
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<void>
  listFiles(): Promise<string[]>
  /** Optional: called before sync to fetch latest remote state (e.g. git pull) */
  prepare?(): Promise<void>
  /** Optional: called after all writes to push changes (e.g. git commit + push) */
  flush?(): Promise<boolean>
}
```

Delete the entire `ConflictError` class (lines 18-24).

- [ ] **Step 2: Update `git.ts` — simplify `readFile` and `writeFile`**

In `packages/cli/src/sync/git.ts`, replace `readFile` (lines 58-66):

```typescript
  async readFile(path: string): Promise<string | null> {
    try {
      const fullPath = join(this.dataDir, path)
      return await readFile(fullPath, 'utf-8')
    } catch {
      return null
    }
  }
```

Replace `writeFile` (lines 68-72):

```typescript
  async writeFile(path: string, content: string): Promise<void> {
    const fullPath = join(this.dataDir, path)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
  }
```

- [ ] **Step 3: Update `s3.ts` — remove ConflictError, ETag, IfMatch**

In `packages/cli/src/sync/s3.ts`:

Remove the import (line 2):

```typescript
import { ConflictError } from './index.js'
```

Replace `readFile` (lines 36-57):

```typescript
  async readFile(path: string): Promise<string | null> {
    const key = this.getObjectKey(path)
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      const response = await this.client.send(command)
      if (!response.Body) return null
      return await response.Body.transformToString('utf-8')
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null
      }
      throw error
    }
  }
```

Replace `writeFile` (lines 59-76):

```typescript
  async writeFile(path: string, content: string): Promise<void> {
    const key = this.getObjectKey(path)
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: 'application/x-ndjson',
    })
    await this.client.send(command)
  }
```

- [ ] **Step 4: Update S3 tests**

In `packages/cli/tests/sync/s3.test.ts`:

Update the "reads file" test — return value is now just a string:

```typescript
  it('reads file and returns content', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: () => Promise.resolve('{"id":"r1"}\n') },
    })

    const result = await backend.readFile('2026/05.ndjson')
    expect(result).toBe('{"id":"r1"}\n')
  })
```

Remove the two IfMatch-related tests entirely:
- `'writes file with IfMatch for optimistic locking'` (lines 81-89)
- `'writes file without IfMatch when no sha'` (lines 92-99)

Update the basic write test — remove `sha` parameter:

```typescript
  it('writes file with content type', async () => {
    mockSend.mockResolvedValueOnce({})

    await backend.writeFile('2026/05.ndjson', '{"id":"r1"}\n')
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'aiusage/2026/05.ndjson',
        Body: '{"id":"r1"}\n',
        ContentType: 'application/x-ndjson',
      })
    )
  })
```

- [ ] **Step 5: Run tests**

Run: `cd packages/cli && npx vitest run tests/sync/s3.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/sync/index.ts packages/cli/src/sync/git.ts packages/cli/src/sync/s3.ts packages/cli/tests/sync/s3.test.ts
git commit -m "refactor: remove sha/ConflictError from SyncBackend interface"
```

---

### Task 2: Simplify Upload — `getSyncPath` to Daily+Device, Remove Retry and Conflict Logic

**Files:**
- Modify: `packages/cli/src/sync/index.ts`
- Test: `packages/cli/tests/sync/index.test.ts`

This task combines `getSyncPath` change and upload simplification into one commit so tests pass at every commit boundary.

- [ ] **Step 1: Update `getSyncPath` function and call site**

In `packages/cli/src/sync/index.ts`, replace the `getSyncPath` function (lines 40-43):

```typescript
export function getSyncPath(ts: string | number, deviceInstanceId: string): string {
  const d = new Date(ts)
  const date = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
  return `${deviceInstanceId}/${date}.ndjson`
}
```

In the `upload()` method, change:

```typescript
      const path = getSyncPath(record.ts)
```

to:

```typescript
      const path = getSyncPath(record.ts, this.options.deviceInstanceId)
```

- [ ] **Step 2: Remove dead code from `index.ts`**

In `packages/cli/src/sync/index.ts`, remove:

1. `const MAX_CONFLICT_RETRIES = 1` (line 45)
2. The `removeUnknownRecords` function (lines 82-89)
3. Rename `mergeRecordsIntoRemote` to `mergeRecords` (lines 67-80) for clarity — it now merges new records into own device's existing data:

```typescript
/** Merge new records into existing map; returns count of actually new/updated records */
function mergeRecords(
  existing: Map<string, SyncRecord>,
  newRecords: SyncRecord[],
): number {
  let changed = 0
  for (const record of newRecords) {
    const prev = existing.get(record.id)
    if (!prev || record.updatedAt > prev.updatedAt) {
      existing.set(record.id, record)
      changed++
    }
  }
  return changed
}
```

4. Replace `uploadFileWithRetry` (lines 182-216) with a simple `uploadFile`:

```typescript
  private async uploadFile(
    path: string,
    localSyncRecords: SyncRecord[],
  ): Promise<number> {
    const existingContent = await this.backend.readFile(path)
    const existing = existingContent ? parseNdjson(existingContent) : new Map<string, SyncRecord>()

    const changedCount = mergeRecords(existing, localSyncRecords)
    if (changedCount === 0) return 0

    const content = Array.from(existing.values()).map(r => JSON.stringify(r)).join('\n') + '\n'
    await this.backend.writeFile(path, content)
    return changedCount
  }
```

5. Update the `upload()` method:
   - Change the comment from `// Group records by hour to keep remote GitHub objects small enough to update reliably.` to `// Group records by day per device.`
   - Change the call from `this.uploadFileWithRetry(path, localSyncRecords)` to `this.uploadFile(path, localSyncRecords)`

6. Update `parseNdjson` — change the comment from `/** Parse ndjson content into a Map<id, SyncRecord>, normalizing string timestamps */` to `/** Parse ndjson content into a Map<id, SyncRecord> */`. Remove the `// Normalize string timestamps to integers (legacy remote data may have ISO strings)` comments inside the function (the normalization code itself is fine to keep as defensive logic, just update the comments):

```typescript
/** Parse ndjson content into a Map<id, SyncRecord> */
function parseNdjson(content: string): Map<string, SyncRecord> {
  const records = new Map<string, SyncRecord>()
  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const record: SyncRecord = JSON.parse(line)
      if (typeof record.ts === 'string') {
        (record as any).ts = new Date(record.ts).getTime()
      }
      if (typeof record.updatedAt === 'string') {
        (record as any).updatedAt = new Date(record.updatedAt).getTime()
      }
      records.set(record.id, record)
    } catch {}
  }
  return records
}
```

- [ ] **Step 3: Update all tests in `index.test.ts`**

Remove the `ConflictError` import:

```typescript
import { SyncOrchestrator, getSyncPath } from '../../src/sync/index.js'
```

Update the mock backend — `readFile` now returns `string | null`, `writeFile` has no `sha`:

```typescript
  const mockBackend = {
    readFile: vi.fn<(path: string) => Promise<string | null>>(),
    writeFile: vi.fn<(path: string, content: string) => Promise<void>>(),
    listFiles: vi.fn<() => Promise<string[]>>(),
  }
```

**Replace "derives an hourly sync path" test** with:

```typescript
  it('derives a daily device-partitioned sync path from timestamps', () => {
    expect(getSyncPath(1778664420000, 'device-abc')).toBe('device-abc/2026/05/13.ndjson')
  })
```

**Update "pulls records from remote" test** — `readFile` returns string directly, use consistent path format:

```typescript
    mockBackend.listFiles.mockResolvedValueOnce(['device-456/2026/05/13.ndjson'])
    mockBackend.readFile.mockResolvedValueOnce(JSON.stringify(remoteRecord) + '\n')
```

**Update "uploads unsynced local records" test** — update path assertion and `readFile` mock:

```typescript
    mockBackend.readFile.mockResolvedValue(null)
```

Change path expectation from `'1970/01/01/00.ndjson'` to `'di1/1970/01/01.ndjson'`.

Update written content assertion — `writeFile.mock.calls[0][1]` (second arg, was `[0][1]` when sha existed, still `[0][1]` now).

**Replace "partitions uploads by hour" test** with:

```typescript
  it('groups uploads by day per device', async () => {
    // Two records on the same day but different hours → same file
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r1', 1778634900000, 1000, 1000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r2', 1778640300000, 1000, 1000, 1, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()

    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(null)
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(2)
    expect(mockBackend.writeFile).toHaveBeenCalledTimes(1)
    expect(mockBackend.writeFile.mock.calls[0][0]).toBe('di1/2026/05/13.ndjson')
  })
```

**Replace "merges with remote data" test** — now merges with own previous data:

```typescript
  it('merges with own previous upload data', async () => {
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('local-1', 2000, 2000, 2000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()

    const previousRecord: SyncRecord = {
      id: 'prev-1',
      ts: 1000,
      tool: 'claude-code',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc',
      device: 'd1',
      deviceInstanceId: 'di1',
      updatedAt: 1000,
    }

    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(JSON.stringify(previousRecord) + '\n')
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(1)

    const written = mockBackend.writeFile.mock.calls[0][1] as string
    const records = written.trim().split('\n').map((l: string) => JSON.parse(l))
    expect(records).toHaveLength(2)
    expect(records.some((r: any) => r.id === 'prev-1')).toBe(true)
  })
```

**Replace "keeps newer record" test** — update `readFile` mock to return string:

```typescript
    mockBackend.readFile.mockResolvedValue(JSON.stringify(remoteRecord) + '\n')
```

Update path expectations from `'1970/01/01/00.ndjson'` to `'di1/1970/01/01.ndjson'`.

**Delete "retries on conflict" test** entirely (~lines 222-270) — conflicts no longer exist.

**Update "does not count already-existing" test** — update `readFile` mock to return string, update path:

```typescript
    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(JSON.stringify(remoteRecord) + '\n')
```

- [ ] **Step 4: Run all sync orchestrator tests**

Run: `cd packages/cli && npx vitest run tests/sync/index.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/sync/index.ts packages/cli/tests/sync/index.test.ts
git commit -m "refactor: device-partitioned daily paths, simplify upload, remove conflict retry"
```

---

### Task 3: Optimize Pull — Skip Own Device Files, Remove Per-Record Filtering

**Files:**
- Modify: `packages/cli/src/sync/index.ts` (`pull` method)
- Test: `packages/cli/tests/sync/index.test.ts`

- [ ] **Step 1: Add test for skipping own device files**

In `packages/cli/tests/sync/index.test.ts`, add:

```typescript
  it('skips own device files during pull', async () => {
    const otherRecord: SyncRecord = {
      id: 'other-1',
      ts: 1000,
      tool: 'claude-code',
      model: 'test',
      provider: 'test',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc',
      device: 'other',
      deviceInstanceId: 'device-456',
      updatedAt: 1000,
    }

    mockBackend.listFiles.mockResolvedValue([
      'device-123/2026/05/13.ndjson',  // own device — should be skipped
      'device-456/2026/05/13.ndjson',  // other device — should be read
    ])
    mockBackend.readFile.mockResolvedValueOnce(JSON.stringify(otherRecord) + '\n')
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'device-123',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    // readFile called only for the other device's file
    expect(mockBackend.readFile).toHaveBeenCalledTimes(1)
    expect(result.pulledCount).toBe(1)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/sync/index.test.ts -t "skips own device"`
Expected: FAIL — `pull()` currently reads all files.

- [ ] **Step 3: Rewrite `pull()` method**

In `packages/cli/src/sync/index.ts`, replace the entire `pull()` method with:

```typescript
  private async pull(): Promise<number> {
    const allPaths = await this.backend.listFiles()
    const localDevicePrefix = `${this.options.deviceInstanceId}/`
    const paths = allPaths.filter(p => !p.startsWith(localDevicePrefix))

    this.options.onProgress?.({
      phase: 'pulling',
      completedFiles: 0,
      totalFiles: paths.length,
      pulledCount: 0,
    })
    if (paths.length === 0) return 0

    let totalPulled = 0

    for (const [index, path] of paths.entries()) {
      this.options.onProgress?.({
        phase: 'pulling',
        currentPath: path,
        completedFiles: index,
        totalFiles: paths.length,
        pulledCount: totalPulled,
      })
      const content = await this.backend.readFile(path)
      if (!content) continue

      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const record: SyncRecord = JSON.parse(line)
          if (typeof record.ts === 'string') {
            (record as any).ts = new Date(record.ts).getTime()
          }
          if (typeof record.updatedAt === 'string') {
            (record as any).updatedAt = new Date(record.updatedAt).getTime()
          }
          insertSyncedRecord(this.db, record)
          totalPulled++
        } catch {}
      }

      this.options.onProgress?.({
        phase: 'pulling',
        currentPath: path,
        completedFiles: index + 1,
        totalFiles: paths.length,
        pulledCount: totalPulled,
      })
    }

    return totalPulled
  }
```

Key changes vs current:
- Filter out own device files by path prefix (no need to read them)
- Removed per-record `deviceInstanceId === localDeviceId` check
- Removed per-record `deviceInstanceId === 'unknown'` check
- `readFile` now returns `string | null` directly (no `.content`)

- [ ] **Step 4: Run tests**

Run: `cd packages/cli && npx vitest run tests/sync/index.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/sync/index.ts packages/cli/tests/sync/index.test.ts
git commit -m "perf: skip own device files during pull, remove per-record filtering"
```

---

### Task 4: Add Git Push Retry with `pull --rebase`

**Files:**
- Modify: `packages/cli/src/sync/git.ts`
- Create: `packages/cli/tests/sync/git.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/cli/tests/sync/git.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({}),
}))

import { execFile } from 'node:child_process'
const mockExecFile = vi.mocked(execFile)

function gitResolves(stdout = '') {
  mockExecFile.mockImplementationOnce((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(null, { stdout })
    return {} as any
  })
}

function gitRejects(message: string) {
  mockExecFile.mockImplementationOnce((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(new Error(message), { stdout: '' })
    return {} as any
  })
}

describe('GitSyncBackend.flush', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retries push after pull --rebase when rejected', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitRejects('rejected')           // push 1 → fail
    gitResolves()                    // pull --rebase
    gitResolves()                    // push 2 → ok

    const result = await backend.flush()
    expect(result).toBe(true)

    const pullCall = mockExecFile.mock.calls.find((c: any) =>
      Array.isArray(c[1]) && c[1].includes('pull') && c[1].includes('--rebase')
    )
    expect(pullCall).toBeTruthy()
  })

  it('throws after max retries', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitRejects('rejected')           // push 1
    gitResolves()                    // pull --rebase 1
    gitRejects('rejected')           // push 2
    gitResolves()                    // pull --rebase 2
    gitRejects('rejected')           // push 3

    await expect(backend.flush()).rejects.toThrow('rejected')
  })

  it('pushes without retry on success', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('M data/x.ndjson') // status
    gitResolves()                    // add
    gitResolves()                    // commit
    gitResolves()                    // push → ok

    const result = await backend.flush()
    expect(result).toBe(true)
    // No pull --rebase called
    const pullCall = mockExecFile.mock.calls.find((c: any) =>
      Array.isArray(c[1]) && c[1].includes('pull')
    )
    expect(pullCall).toBeUndefined()
  })

  it('returns false when no changes', async () => {
    const { GitSyncBackend } = await import('../../src/sync/git.js')
    const backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: '/tmp/s' })

    gitResolves('') // status → empty (no changes)

    const result = await backend.flush()
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/sync/git.test.ts`
Expected: FAIL — `flush()` doesn't retry.

- [ ] **Step 3: Add push retry logic**

In `packages/cli/src/sync/git.ts`, replace the `flush` method (lines 82-92):

```typescript
  private static readonly MAX_PUSH_RETRIES = 3

  /** Commit and push all changes. Returns true if anything was pushed. */
  async flush(): Promise<boolean> {
    const status = await this.git(['status', '--porcelain'])
    if (!status) return false

    await this.git(['add', 'data/'])
    await this.git(['commit', '-m', `sync ${new Date().toISOString()}`])

    for (let attempt = 1; attempt <= GitSyncBackend.MAX_PUSH_RETRIES; attempt++) {
      try {
        await this.git(['push', 'origin', 'main'])
        return true
      } catch (error) {
        if (attempt >= GitSyncBackend.MAX_PUSH_RETRIES) throw error
        await this.git(['pull', '--rebase', 'origin', 'main'])
      }
    }

    return false
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/sync/git.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/sync/git.ts packages/cli/tests/sync/git.test.ts
git commit -m "fix: retry git push with pull --rebase on rejection"
```

---

### Task 5: Remove Dead Code

**Files:**
- Delete: `packages/cli/src/sync/github.ts`
- Delete: `packages/cli/tests/sync/github.test.ts`

- [ ] **Step 1: Verify no imports**

```bash
grep -r "GitHubSyncBackend\|from.*sync/github" packages/cli/src/ --include="*.ts"
```

Expected: No matches.

- [ ] **Step 2: Delete files**

```bash
rm packages/cli/src/sync/github.ts
rm packages/cli/tests/sync/github.test.ts
```

- [ ] **Step 3: Run full test suite**

Run: `cd packages/cli && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead GitHub Contents API backend"
```

---

### Task 6: Update README Documentation

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`

- [ ] **Step 1: Update sync mechanism in `README.md`**

In the "How sync works" section, replace:

```markdown
- Data is stored as hourly NDJSON files (`YYYY/MM/DD/HH.ndjson`) in the remote backend
- Pull merges remote records into local `synced_records` table; Upload merges local records to remote (never overwrites)
- Optimistic locking (ETag on S3, SHA on GitHub) prevents conflicts
```

with:

```markdown
- Each device writes to its own daily files (`{deviceId}/YYYY/MM/DD.ndjson`) in the remote backend
- Pull reads other devices' files into local `synced_records` table; Upload writes only to own device's files
- Device-partitioned files eliminate write conflicts — no locking needed
```

- [ ] **Step 2: Update sync mechanism in `README_zh.md`**

Replace:

```markdown
- 数据按小时存储为 NDJSON 文件（`YYYY/MM/DD/HH.ndjson`）在远端后端
- Pull 将远端记录合并到本地 `synced_records` 表，Upload 将本地记录合并到远端（永远不覆盖）
- 使用乐观锁（S3 的 ETag、GitHub 的 SHA）防止多设备冲突
```

with:

```markdown
- 每台设备写入自己的按天文件（`{deviceId}/YYYY/MM/DD.ndjson`）到远端后端
- Pull 读取其他设备的文件到本地 `synced_records` 表，Upload 仅写入自己设备的文件
- 按设备分文件，从根本上消除写冲突，无需加锁
```

- [ ] **Step 3: Commit**

```bash
git add README.md README_zh.md
git commit -m "docs: update sync docs for device-partitioned daily files"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: No errors.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Verify no stale references**

```bash
grep -rP "GitHubSyncBackend|HH\.ndjson|MAX_CONFLICT_RETRIES|uploadFileWithRetry|removeUnknownRecords|ConflictError|IfMatch|mergeRecordsIntoRemote" packages/ --include="*.ts" | grep -v node_modules | grep -v dist
```

Expected: No matches.
