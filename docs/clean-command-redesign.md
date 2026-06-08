# Clean Command Redesign

## Problem

The `reset` and `clean` commands only affected local data. For users with cloud sync enabled (GitHub, S3, AIUsage Cloud), running `reset` or `clean` was effectively useless — the next `sync` would pull the deleted data right back.

Additionally, `reset` was essentially `clean --all`, making it redundant.

## Solution

1. **Delete `reset` command entirely** (not deprecated, fully removed)
2. **Merge reset functionality into `clean --all`** — fully equivalent: all records, tool_calls, synced_records, watermark
3. **Propagate deletions to remote backends** when cloud sync is configured
4. **Require user confirmation** before any destructive operation

## CLI Interface

```
aiusage clean [options]

Options:
  --before <duration>   Delete data older than this (e.g., 30d, 180d) (default: 180d)
  --all                 Wipe all data (equivalent to former reset: all records, tool calls, synced records, watermark)
  --local-only          Only clean local data, do not propagate to remote backends
  --target <backend>    Target specific remote backend (github/s3/cloud)
  --yes                 Skip local confirmation (remote deletion still requires explicit confirmation)
```

### Mutually Exclusive

`--all` and `--before` cannot be used together.

## Confirmation Flow

### Local-only (no remote backends configured)

```
? Confirm? [y/N]
```

### With remote backends

```
Cloud sync is configured. The following remote backends will also be affected:
  - GitHub (user/repo)
  - S3 (my-bucket)

? Confirm deletion on local + 2 remote backend(s)? [y/N]
```

### With --yes flag

Local confirmation skipped, but remote deletion still requires typing "confirm":

```
? Type "confirm" to proceed with remote deletion:
```

### Non-interactive mode (stdin is not a TTY)

Exits with error:
```
Non-interactive mode detected. Use --local-only to skip remote propagation, or run interactively.
```

## Semantic Matrix

| Scenario | Local DB | Remote Backends | Confirmation |
|----------|----------|-----------------|--------------|
| `clean` (default 180d) | Delete old records | Propagate if configured | `[y/N]` |
| `clean --before 30d` | Delete records >30d | Propagate if configured | `[y/N]` |
| `clean --all` | Wipe everything | Propagate if configured | `[y/N]` |
| `clean --all --local-only` | Wipe everything | Skip | `[y/N]` |
| `clean --all --target github` | Wipe everything | Only GitHub | `[y/N]` |
| `clean --all --yes` | Wipe everything | Propagate | Type "confirm" |

## Cloud Backend Deletion Strategies

### AIUsage Cloud

POST to `/api/cli/sync/clear` with HMAC auth. Server:
1. Increments `sync_generation`
2. Marks all `cloud_usage_records` as deleted
3. Updates `cloud_device_instances` with new generation

### GitHub (GitSyncBackend)

1. `listFiles()` to enumerate ndjson files
2. For `--all`: `deleteAllData()` removes entire data directory
3. For `--before`: iterate files, parse ndjson, filter by timestamp, rewrite or delete
4. `flush()` to commit and push

### S3 (S3SyncBackend)

1. `listFiles()` to enumerate objects
2. For `--all`: `deleteAllData()` uses `DeleteObjectsCommand` (batch, 1000 per request)
3. For `--before`: iterate objects, parse ndjson, filter, rewrite or delete
4. `flush()` (no-op for S3)

## Interface Changes

### SyncBackend (sync/index.ts)

Added optional methods:

```typescript
deleteFile?(path: string): Promise<void>
deleteAllData?(): Promise<number>
```

## File Change Manifest

| File | Action | Description |
|------|--------|-------------|
| `packages/cli/src/commands/reset.ts` | DELETE | Entirely removed |
| `packages/cli/src/commands/clean.ts` | REWRITE | Added `cleanAll`, `getRemoteBackends`, `propagateClean` |
| `packages/cli/src/cli.ts` | MODIFY | Removed reset command, rewrote clean with confirmation flow |
| `packages/cli/src/commands/menu.ts` | MODIFY | Removed reset from menu, added "All (=reset)" option |
| `packages/cli/src/sync/index.ts` | MODIFY | Added `deleteFile?`, `deleteAllData?` to interface |
| `packages/cli/src/sync/git.ts` | MODIFY | Implemented `deleteFile`, `deleteAllData` |
| `packages/cli/src/sync/s3.ts` | MODIFY | Implemented `deleteFile`, `deleteAllData` |
| `packages/cli/src/sync/cloud.ts` | MODIFY | Implemented `cloudClear()` with HMAC auth |
| `packages/site/src/routes/api/cli/sync/clear/+server.ts` | CREATE | HMAC-authenticated clear endpoint |
| `packages/cli/tests/commands/clean.test.ts` | REWRITE | 9 tests covering cleanOldData and cleanAll |
| `packages/site/src/routes/docs/+page.svelte` | MODIFY | Removed reset docs, updated clean docs |
