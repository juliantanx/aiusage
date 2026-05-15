# Data Update Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align README and sync documentation with the current data update implementation so update modes, file layout, and sync frequency are described accurately.

**Architecture:** This is a documentation-first change. We will verify the current implementation in the CLI and web code, then update the English README, Chinese README, and sync design doc so all three describe the same real behavior: parse is on-demand incremental import, sync is on-demand pull/merge/upload, remote files are device-partitioned daily NDJSON files, and scheduling is external rather than built in.

**Tech Stack:** Markdown documentation, TypeScript implementation references, ripgrep-based verification

---

## File structure

### Files to modify
- `README.md` — English user-facing setup and automation docs for single-machine, multi-machine, and Docker flows
- `README_zh.md` — Chinese user-facing setup and automation docs mirroring the English README
- `docs/sync-and-database.md` — internal sync architecture and database design doc

### Files to reference during implementation
- `packages/cli/src/commands/parse.ts` — confirms parse is incremental and watermark-driven
- `packages/cli/src/commands/sync.ts` — confirms sync entry point and persisted sync state
- `packages/cli/src/sync/index.ts` — confirms remote path layout, pull/upload behavior, and merge rules
- `packages/cli/src/sync/runtime.ts` — confirms non-blocking API sync execution model
- `packages/cli/src/commands/serve.ts` — confirms `/api/refresh` and `/api/sync` wiring
- `packages/web/src/routes/+page.svelte` — confirms homepage-triggered refresh behavior
- `packages/web/src/routes/+layout.svelte` — confirms 2-second sync status polling behavior

### Files not to modify
- Any TypeScript implementation files, unless documentation review reveals a trivial wording fix in comments that is impossible to resolve in docs alone

---

### Task 1: Update `docs/sync-and-database.md`

**Files:**
- Modify: `docs/sync-and-database.md`
- Reference: `packages/cli/src/sync/index.ts`
- Reference: `packages/cli/src/commands/serve.ts`
- Reference: `packages/web/src/routes/+page.svelte`

- [ ] **Step 1: Write the failing test**

Create a temporary verification checklist in your notes with these required facts for `docs/sync-and-database.md`:

```text
1. Must describe remote files as {deviceInstanceId}/YYYY/MM/DD.ndjson
2. Must not describe hourly partitioning
3. Must not describe unknown-device cleanup logic that does not exist
4. Must describe pull filtering as file-level skip of the current device prefix
5. Must state that sync scheduling is external, not built in
6. Must mention homepage refresh triggers parse once on initial load
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rg -n "data/YYYY/MM/DD/HH.ndjson|按小时分区|unknown 设备记录|deviceInstanceId === localDeviceId|内建定时|首页首次加载" docs/sync-and-database.md
```

Expected: output includes stale hourly-path and unknown-device wording, and does not yet include the new homepage-refresh/scheduling clarification.

- [ ] **Step 3: Write minimal implementation**

Edit `docs/sync-and-database.md` so these sections are updated:

```md
### 4.3 SyncOrchestrator.sync() 核心流程

```text
sync()
  │
  ├── 1. pull()          拉取云端数据
  │     ├── backend.listFiles()   列出所有 .ndjson 文件
  │     ├── 过滤当前设备前缀文件 (`${deviceInstanceId}/`)
  │     └── 逐文件处理:
  │           ├── 读取远端文件内容
  │           ├── 逐行 JSON.parse → SyncRecord
  │           └── insertSyncedRecord(db, record) → 写入 synced_records
  │
  ├── 2. mergeSyncedRecordsIntoRecords()   合并到 records
  │
  ├── 3. upload()        上传本地数据
  │     ├── getUnsyncedRecords()   查找 synced_at IS NULL OR updated_at > synced_at
  │     ├── 按 getSyncPath(ts, deviceInstanceId) 按天分组
  │     └── 逐文件:
  │           ├── 读取远端已有内容 → Map<id, SyncRecord>
  │           ├── 合并: 新增 + updatedAt 较新时覆盖
  │           ├── 写回远端 (writeFile with sha/ETag)
  │           └── 标记本地记录 synced_at = Date.now()
```

### 4.4 远端文件结构

```text
{deviceInstanceId}/YYYY/MM/DD.ndjson

示例: 550e8400-e29b-41d4-a716-446655440000/2026/05/13.ndjson
```

每行一条 JSON 记录 (SyncRecord)。当前实现按设备隔离、按天分文件。

### 4.5 冲突解决策略

| 场景 | 策略 |
|------|------|
| 本设备文件 | pull 时在文件级跳过当前设备前缀 |
| unknown 设备记录 | 当前实现无专门清理逻辑，文档不做额外保证 |

### 4.7 自动化与刷新频率

- 项目本身不内建定时同步或定时解析能力
- `aiusage parse` 与 `aiusage sync` 的执行频率由用户手动触发或外部 cron / 任务计划控制
- Web 首页首次加载时会调用 `/api/refresh` 触发一次本地增量 parse
- Web 同步按钮触发后，前端会每 2 秒轮询 `/api/sync` 查询进度；这不是新的数据采集周期
```
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rg -n "\{deviceInstanceId\}/YYYY/MM/DD\.ndjson|按设备隔离、按天分文件|外部 cron|首页首次加载时会调用 /api/refresh|每 2 秒轮询" docs/sync-and-database.md
```

Expected: PASS by returning matches for the new wording.

- [ ] **Step 5: Commit**

```bash
git add docs/sync-and-database.md
git commit -m "docs: align sync architecture doc with current implementation"
```

### Task 2: Update `README.md`

**Files:**
- Modify: `README.md`
- Reference: `packages/cli/src/commands/parse.ts`
- Reference: `packages/cli/src/commands/serve.ts`
- Reference: `packages/web/src/routes/+page.svelte`

- [ ] **Step 1: Write the failing test**

Create a checklist for the English README:

```text
1. Single-machine flow should clarify parse is on-demand and can be automated externally
2. Web dashboard section should mention homepage load triggers one refresh/parse
3. Multi-machine sync should clearly describe device-partitioned daily files
4. Automation wording should not imply a built-in scheduler
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rg -n "homepage|refresh|on-demand|external cron|device-partitioned daily files|built-in scheduler" README.md
```

Expected: limited or no matches for the new wording.

- [ ] **Step 3: Write minimal implementation**

Update `README.md` with wording like this in the relevant sections:

```md
Daily usage is typically just:

```bash
aiusage parse   # import newly appended local log data
aiusage serve   # open the dashboard
```

`aiusage` does not run a built-in background parser. If you want automatic imports, schedule `aiusage parse` with cron or Task Scheduler.
```

```md
### Web Dashboard

```bash
aiusage serve
# open http://localhost:3847
```

On the overview page's first load, the dashboard triggers `/api/refresh`, which runs one incremental local parse before loading summary data.
```

```md
**How sync works:**

- Each machine has a unique `deviceInstanceId` (generated on first run)
- Each device writes to its own daily file (`{deviceInstanceId}/YYYY/MM/DD.ndjson`) in the remote backend
- Pull reads other devices' files into the local `synced_records` table; upload writes only this device's files
- Sync frequency comes from your external scheduler or manual runs; aiusage does not include a built-in sync daemon
```
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rg -n "does not run a built-in background parser|first load.*?/api/refresh|\{deviceInstanceId\}/YYYY/MM/DD\.ndjson|does not include a built-in sync daemon" README.md
```

Expected: PASS by returning matches for all new explanations.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: clarify english update and sync behavior"
```

### Task 3: Update `README_zh.md`

**Files:**
- Modify: `README_zh.md`
- Reference: `packages/cli/src/commands/parse.ts`
- Reference: `packages/cli/src/commands/serve.ts`
- Reference: `packages/web/src/routes/+page.svelte`

- [ ] **Step 1: Write the failing test**

Create a checklist for the Chinese README:

```text
1. 说明 parse 是按需增量导入，不是内建后台任务
2. 说明首页首次加载会触发一次 refresh/parse
3. 说明同步文件是按 deviceInstanceId/按天分区
4. 说明自动化依赖外部 cron 或任务计划
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rg -n "后台任务|首次加载|refresh|deviceInstanceId|外部 cron|内建" README_zh.md
```

Expected: limited or no matches for the new wording.

- [ ] **Step 3: Write minimal implementation**

Update `README_zh.md` with wording like this:

```md
日常使用只需两条命令：

```bash
aiusage parse   # 增量导入本地日志中新追加的数据
aiusage serve   # 打开仪表盘
```

`aiusage` 本身不运行内建后台解析任务。如需自动导入，请使用 cron 或任务计划定时执行 `aiusage parse`。
```

```md
## Web 仪表盘

```bash
aiusage serve
# 打开 http://localhost:3847
```

概览页首次加载时会调用 `/api/refresh`，触发一次本地增量 parse，然后再加载统计数据。
```

```md
**同步原理：**

- 每台机器有唯一的 `deviceInstanceId`（首次运行时生成）
- 每台设备写入自己的按天文件（`{deviceInstanceId}/YYYY/MM/DD.ndjson`）到远端后端
- Pull 读取其他设备的文件到本地 `synced_records` 表，Upload 仅写入当前设备自己的文件
- 自动化频率由外部 cron / 任务计划控制，aiusage 本身不内建常驻同步进程
```
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rg -n "不运行内建后台解析任务|首次加载时会调用 /api/refresh|\{deviceInstanceId\}/YYYY/MM/DD\.ndjson|外部 cron / 任务计划控制" README_zh.md
```

Expected: PASS by returning matches for all new explanations.

- [ ] **Step 5: Commit**

```bash
git add README_zh.md
git commit -m "docs: clarify chinese update and sync behavior"
```

### Task 4: Cross-check the three docs together

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `docs/sync-and-database.md`

- [ ] **Step 1: Write the failing test**

Define the exact shared facts that all three docs must agree on:

```text
1. parse is incremental and on-demand
2. sync is on-demand and externally scheduled if automated
3. homepage first load triggers one refresh/parse
4. sync files are {deviceInstanceId}/YYYY/MM/DD.ndjson
5. no doc promises unknown-device cleanup behavior
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rg -n "data/YYYY/MM/DD/HH.ndjson|按小时分区|hourly partition|unknown 设备记录|unknown-device cleanup" README.md README_zh.md docs/sync-and-database.md
```

Expected: any remaining stale matches indicate the docs are not fully aligned yet.

- [ ] **Step 3: Write minimal implementation**

Make final consistency edits so the three docs share the same wording intent. Use these exact facts as the source of truth:

```text
- parse imports newly appended local log data using watermark-based incremental reads
- aiusage has no built-in background parser or sync daemon
- overview-page first load triggers one /api/refresh call
- sync stores remote files at {deviceInstanceId}/YYYY/MM/DD.ndjson
- pull skips the current device at file-prefix level
- unknown-device cleanup is not documented as a current guarantee
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rg -n "data/YYYY/MM/DD/HH.ndjson|按小时分区|hourly partition|unknown 设备记录|unknown-device cleanup" README.md README_zh.md docs/sync-and-database.md
```

Expected: PASS by returning no matches.

Then run:

```bash
rg -n "\{deviceInstanceId\}/YYYY/MM/DD\.ndjson|/api/refresh|built-in background parser|内建后台解析任务|外部 cron|external scheduler" README.md README_zh.md docs/sync-and-database.md
```

Expected: PASS by returning matches that confirm the shared source of truth.

- [ ] **Step 5: Commit**

```bash
git add README.md README_zh.md docs/sync-and-database.md
git commit -m "docs: align update behavior across project docs"
```
