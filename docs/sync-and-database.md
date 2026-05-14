# 数据同步流程与数据库设计

## 一、整体架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Device A   │     │   Device B   │     │   Device C   │
│  (MacBook)   │     │  (ThinkPad)  │     │  (Mac Mini)  │
│              │     │              │     │              │
│  ┌────────┐  │     │  ┌────────┐  │     │  ┌────────┐  │
│  │ records│  │     │  │ records│  │     │  │ records│  │
│  │  (本地) │  │     │  │  (本地) │  │     │  │  (本地) │  │
│  └───┬────┘  │     │  └───┬────┘  │     │  └───┬────┘  │
│      │       │     │      │       │     │      │       │
│  ┌───▼────┐  │     │  ┌───▼────┐  │     │  ┌───▼────┐  │
│  │synced_ │  │     │  │synced_ │  │     │  │synced_ │  │
│  │records │  │     │  │records │  │     │  │records │  │
│  └───┬────┘  │     │  └───┬────┘  │     │  └───┬────┘  │
│      │       │     │      │       │     │      │       │
└──────┼───────┘     └──────┼───────┘     └──────┼───────┘
       │                    │                    │
       ▼                    ▼                    ▼
  ┌──────────────────────────────────────────────────┐
  │           Cloud Storage (GitHub / S3)             │
  │                                                   │
  │  data/                                            │
  │  ├── 2026/05/13/00.ndjson   ← 按小时分区          │
  │  ├── 2026/05/13/01.ndjson                        │
  │  ├── 2026/05/13/02.ndjson                        │
  │  └── ...                                         │
  └──────────────────────────────────────────────────┘
```

## 二、数据库 Schema 设计

### 2.1 核心表

#### `records` — 本地使用记录（含已同步的外部记录）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | `sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]` |
| `ts` | INTEGER | 事件时间戳（毫秒） |
| `ingested_at` | INTEGER | 首次入库时间 |
| `synced_at` | INTEGER | 最近上传到云端时间，NULL = 未同步 |
| `updated_at` | INTEGER | 业务字段最近更新时间 |
| `line_offset` | INTEGER | 来源日志行偏移 |
| `tool` | TEXT | `claude-code` / `codex` / `openclaw` |
| `model` | TEXT | 模型名 |
| `provider` | TEXT | 供应商 |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `cache_read_tokens` | INTEGER | |
| `cache_write_tokens` | INTEGER | |
| `thinking_tokens` | INTEGER | |
| `cost` | REAL | USD |
| `cost_source` | TEXT | `log` / `pricing` / `unknown` |
| `session_id` | TEXT | |
| `source_file` | TEXT | 本地文件路径 或 `synced/{deviceInstanceId}` |
| `device` | TEXT | 设备别名 |
| `device_instance_id` | TEXT | 设备实例唯一标识 (UUID) |

**关键索引**: `ts`, `ingested_at`, `updated_at`, `tool`, `model`, `session_id`, `source_file`, `cost_source`

#### `synced_records` — 从云端拉取的外部记录暂存

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | SyncRecord.id = `sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]` |
| `ts` | INTEGER | |
| `tool` | TEXT | |
| `model` | TEXT | |
| `provider` | TEXT | |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `cache_read_tokens` | INTEGER | |
| `cache_write_tokens` | INTEGER | |
| `thinking_tokens` | INTEGER | |
| `cost` | REAL | |
| `cost_source` | TEXT | |
| `session_key` | TEXT | `sha256(device + sessionId)[0:24]` |
| `device` | TEXT | |
| `device_instance_id` | TEXT | |
| `platform` | TEXT | |
| `updated_at` | INTEGER | 用于冲突解决：较新者优先 |

#### `tool_calls` — 工具调用记录

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | `sha256(recordId + name + ts + callIndex)[0:16]` |
| `record_id` | TEXT FK | → records(id) ON DELETE CASCADE |
| `tool` | TEXT | |
| `name` | TEXT | 工具名 |
| `ts` | INTEGER | |
| `call_index` | INTEGER | |

#### `sync_tombstones` — 删除标记（已定义，尚未使用）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 被删除的 record id |
| `device_scope` | TEXT | 设备范围 |
| `deleted_at` | INTEGER | |
| `reason` | TEXT | `retention` / `manual_clean` |

### 2.2 只读视图（v3 迁移创建）

| 视图 | 用途 |
|------|------|
| `v_usage_records` | records 的可读视图，含 `total_tokens` 计算列和格式化时间戳 |
| `v_tool_calls` | tool_calls JOIN records，含父记录上下文 |
| `v_sessions` | 按 session 分组的聚合统计 |

### 2.3 设备标识

```
~/.aiusage/state.json
{
  "deviceInstanceId": "uuid-v4",    // 首次 init 生成，全局唯一
  "lastSyncAt": 1715683200000,
  "lastSyncStatus": "ok",
  "lastSyncError": null,
  "lastSyncTarget": "github:user/repo",
  "lastSyncUploaded": 10,
  "lastSyncPulled": 2,
  "lastSyncDurationMs": 3200
}
```

### 2.4 Schema 版本迁移

| 版本 | 内容 |
|------|------|
| v1 | 基础表: records, synced_records, tool_calls, sync_tombstones |
| v2 | synced_records 增加 platform 列（幂等：先检查列是否存在） |
| v3 | 创建只读视图: v_usage_records, v_tool_calls, v_sessions |

## 三、记录 ID 生成规则

### 3.1 本地记录 ID (StatsRecord.id)

```
sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]
```

包含 deviceInstanceId，天然保证跨设备唯一性。

### 3.2 同步记录 ID (SyncRecord.id)

```
sha256(deviceInstanceId + sourceFile + lineOffset)[0:16]
```

与本地记录 ID 相同（`generateSyncRecordId` 已标记 @deprecated，委托给 `generateRecordId`）。

### 3.3 会话键 (sessionKey)

```
sha256(device + sessionId)[0:24]
```

## 四、同步流程详解

### 4.1 触发方式

1. **CLI**: `aiusage sync` — 同步执行，阻塞等待完成
2. **API**: `POST /api/sync` — 非阻塞，返回 202，后台通过 `SyncRuntimeController` 执行
3. **Web UI**: 点击 Sync 按钮 → 调用 API → 轮询 `GET /api/sync` 获取进度

### 4.2 SyncRuntimeController

```
用户 → POST /api/sync
         │
         ▼
  SyncRuntimeController.start()
         │
         ├── 已在运行? → { accepted: false, alreadyRunning: true }
         │
         └── 未运行 → { accepted: true }
              │
              └── setImmediate() → runInBackground()
                                        │
                                        ▼
                                  SyncOrchestrator.sync()
```

**关键**: `start()` 是同步的，立即返回。实际同步工作在下一个微任务中开始，确保 HTTP 响应先发回客户端。

### 4.3 SyncOrchestrator.sync() 核心流程

```
sync()
  │
  ├── 1. pull()          拉取云端数据
  │     ├── backend.listFiles()   列出所有 .ndjson 文件
  │     └── 逐文件处理:
  │           ├── 读取远端文件内容
  │           ├── 逐行 JSON.parse → SyncRecord
  │           ├── 跳过本设备记录 (deviceInstanceId === localDeviceId)
  │           ├── 跳过 unknown 设备记录
  │           └── insertSyncedRecord(db, record) → 写入 synced_records
  │
  ├── 2. mergeSyncedRecordsIntoRecords()   合并到 records
  │     ├── LEFT JOIN 找出 synced_records 中不存在于 records 的记录
  │     └── INSERT OR REPLACE → 写入 records（source_file = "synced/{deviceInstanceId}"）
  │
  ├── 3. upload()        上传本地数据
  │     ├── getUnsyncedRecords()   查找 synced_at IS NULL OR updated_at > synced_at
  │     ├── 按 getSyncPath(ts) 小时分组
  │     └── 逐文件:
  │           ├── 读取远端已有内容 → Map<id, SyncRecord>
  │           ├── 合并: 新增 + updatedAt 较新时覆盖
  │           ├── 清理 unknown 设备的记录
  │           ├── 写回远端 (writeFile with sha/ETag)
  │           └── 标记本地记录 synced_at = Date.now()
  │
  └── 返回 SyncResult { status, pulledCount, uploadedCount, mergedCount }
```

### 4.4 远端文件结构

```
data/YYYY/MM/DD/HH.ndjson

示例: data/2026/05/13/09.ndjson
```

每行一条 JSON 记录 (SyncRecord)，按小时分区以保持文件大小可控。

### 4.5 冲突解决策略

| 场景 | 策略 |
|------|------|
| 同一 record ID, 本地更新 | `updatedAt > remote.updatedAt` → 本地覆盖远端 |
| 同一 record ID, 远端更新 | 远端 updatedAt 更新 → 保留远端 |
| 同一 record ID, 同步更新 | updatedAt 相等 → 任一版本均可（幂等） |
| 本设备记录出现在远端 | pull 时跳过 (`deviceInstanceId === localDeviceId`) |
| unknown 设备记录 | pull 时跳过; upload 时从远端清理 |

### 4.6 同步后端

| 后端 | 写入并发控制 | 读取方式 |
|------|-------------|---------|
| GitHub Contents API | SHA (ETag) — 409 Conflict 表示冲突 | metadata + raw 双请求 |
| S3 | IfMatch (ETag) — PreconditionFailed 表示冲突 | GetObjectCommand |

**GitHub 特殊处理**:
- 手动跟随 302 重定向（Node.js fetch 会丢弃 Authorization header）
- 请求超时 120 秒
- 递归遍历目录树（支持任意深度的年/月/日/时结构）

## 五、数据一致性保证

### 5.1 现有保证

1. **SyncRecord.id 包含 deviceInstanceId**: 不同设备的记录天然隔离
2. **updatedAt 比较**: 合并时以较新版本为准
3. **sha/ETag 传递**: 写入时携带版本标识
4. **本设备记录跳过**: pull 时忽略自己上传的数据

### 5.2 已修复的问题

| # | 问题 | 严重性 | 修复方案 |
|---|------|--------|---------|
| 1 | `insertSyncedRecord` 用 `INSERT OR REPLACE` 无 updatedAt 检查，旧数据可覆盖新数据 | HIGH | 改用 `INSERT ... ON CONFLICT(id) DO UPDATE SET ... WHERE excluded.updated_at > synced_records.updated_at`，仅在远端记录更新时才覆盖 |
| 2 | `mergeSyncedRecordsIntoRecords` 用 `INSERT OR REPLACE` 可能覆盖本地数据 | HIGH | 改用 `INSERT OR IGNORE`，因为 LEFT JOIN 已保证只处理不存在的记录 |
| 3 | `generateRecordId` 不含 deviceInstanceId，跨设备 ID 冲突 | HIGH | `generateRecordId` 改为 `sha256(deviceInstanceId + sourceFile + lineOffset)`，与 `generateSyncRecordId` 统一（后者已标记 @deprecated） |
| 4 | upload 写后读竞争（另一设备同时写入同一文件） | MEDIUM | 新增 `ConflictError`，GitHub (409) 和 S3 (412) 冲突时抛出；`uploadFileWithRetry` 自动重试一次：重新读取远端、重新合并、重新写入 |
| 5 | totalUploaded 计数不准确（含远端已有未更新的记录） | LOW | 新增 `mergeRecordsIntoRemote` 返回实际新增/更新的记录数，只有 `changedCount > 0` 时才写入 |

### 5.3 待规划

| # | 问题 | 严重性 | 备注 |
|---|------|--------|------|
| 6 | sync_tombstones 表已定义但未使用 | LOW | 删除标记功能待实现 |
| 7 | 同步中断（pull 后 upload 前崩溃）可能导致重复上传 | LOW | 已有幂等保护：updatedAt 比较确保不会覆盖较新数据 |

## 六、API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sync` | POST | 触发同步，返回 202 (已接受) 或 200 (已在运行) |
| `/api/sync` | GET | 获取同步状态和进度 |
| `/api/refresh` | POST | 重新解析本地日志 |
| `/api/devices` | GET | 列出所有设备及其记录数 |

### 同步状态响应格式

```json
{
  "status": {
    "isRunning": true,
    "startedAt": 1715683200000,
    "phase": "uploading",
    "currentPath": "2026/05/13/09.ndjson",
    "completedFiles": 2,
    "totalFiles": 5,
    "uploadedCount": 30,
    "lastSyncAt": 1715683000000,
    "lastSyncStatus": "ok",
    "lastSyncError": null,
    "lastSyncTarget": "github:user/repo",
    "lastSyncUploaded": 100,
    "lastSyncPulled": 10,
    "lastSyncDurationMs": 5200
  }
}
```

## 七、安全与隐私

1. **用户同意**: 首次同步需通过 `aiusage init` 确认，指纹 (SHA-256) 绑定配置
2. **会话键**: `sha256(device + sessionId)[0:24]` — 不暴露原始 sessionId
3. **凭证管理**: GitHub token / S3 密钥存储在 `~/.aiusage/credentials/`
4. **数据内容**: 不上传 tool_calls 详情、source_file 原始路径、session_id 原文
