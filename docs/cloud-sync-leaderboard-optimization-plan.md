# AIUsage 官方同步与榜单优化方案

## 1. 目标

AIUsage v1 的数据体系应同时满足四类需求：

1. 本地优先：用户不登录、不联网也能解析、统计和查看自己的数据。
2. 官方同步：普通用户可以用 AIUsage 账号完成多设备同步，不需要自己配置 GitHub、S3 或对象存储。
3. 自托管同步：高级用户仍然可以把明细数据同步到自己控制的 GitHub/S3/R2/MinIO 等存储。
4. 公开榜单：用户可以选择上传聚合后的公开排名指标，参与 leaderboard。

最终架构：

```text
本地 SQLite
  records / synced_records / tool_calls
        |
        | aiusage sync
        v
官方同步 / 自托管同步
        |
        | 本地查询合并
        v
本地 summary / dashboard

本地聚合快照
        |
        | aiusage upload
        v
公开 leaderboard_metrics
```

核心边界：

```text
aiusage sync   = 私有明细同步
aiusage upload = 公开榜单上传
```

开启同步不等于参与榜单。参与榜单也不要求上传私有明细。

## 2. 设计原则

### 2.1 本地数据是第一数据源

本地 SQLite 继续作为主数据源：

```text
~/.aiusage/cache.db
```

本地数据库保留：

```text
records
synced_records
tool_calls
sync_tombstones
```

解析、汇总、导出、Web dashboard 都应能在离线状态下工作。

### 2.2 服务端数据库统一，数据域隔离

服务端使用同一个 Postgres 数据库，不拆多个数据库。v1 阶段多个服务端数据库会增加迁移、备份、事务、连接池和运维复杂度，收益不明显。

但统一数据库不等于混用表。服务端数据需要按职责分域：

```text
auth/profile       用户、资料、公开设置
device_auth        CLI 设备授权
cloud_sync         官方私有同步
leaderboard        公开榜单
admin              管理审计
```

如果使用 Postgres schema，可采用：

```text
auth.*
sync.*
leaderboard.*
admin.*
```

如果不使用 schema，则采用清晰表名前缀：

```text
cloud_usage_records
leaderboard_metrics
admin_audit_logs
```

### 2.3 私有明细和公开榜单分离

禁止把私有同步表直接作为榜单表使用，也禁止把榜单表当成用户同步数据使用。

```text
cloud_usage_records = 用户私有明细
leaderboard_metrics = 公开聚合指标
```

如果未来支持从官方同步数据自动生成榜单，也必须通过明确任务写入 `leaderboard_metrics`：

```text
cloud_usage_records -> aggregation job -> leaderboard_metrics
```

不能直接公开查询 `cloud_usage_records`。

### 2.4 价格由系统内置价格表计算

用户自定义价格只用于本地个人展示，不参与官方云端价格计算和公开榜单。

服务端计算公开榜单 `total_cost_usd` 时只使用系统内置价格表。

官方同步可以保存用户本地记录中的 `cost` 字段用于用户自己的私有展示，但任何公开排名、跨用户比较、服务端榜单计算都不能信任客户端上传的自定义价格。

价格表可以入库，但不能做成管理员直接编辑线上 active 表的自由 CRUD。推荐形态是：

```text
packages/core/src/pricing.ts        = CLI/local/offline 的内置默认价格
official_price_tables + entries     = 服务端官方价格版本库
leaderboard_metrics.pricing_version = 榜单 cost 使用的价格版本
```

核心要求：

- `packages/core/src/pricing.ts` 继续保留，保证 CLI 离线可计算和本地 dashboard 可用。
- 服务端从同一份官方价格源 seed / import 到数据库，避免多个模块手工复制价格逻辑。
- 管理员只能编辑 draft 价格表；published 价格版本不可变。
- 发布新价格表必须写审计日志，并触发或允许触发榜单重算。
- 历史榜单必须记录 `pricing_version`，不能因为当前价格变化而无法解释过去排名。

## 3. 数据分层

### 3.1 本地数据

位置：

```text
~/.aiusage/cache.db
~/.aiusage/state.json
~/.aiusage/config.json
```

主要表：

```text
records
synced_records
tool_calls
sync_tombstones
```

职责：

- 保存当前设备解析得到的明细记录。
- 保存从其他设备同步来的记录。
- 支持本地 dashboard、summary、export。
- 作为同步 push 的来源。

### 3.2 官方同步数据

存储位置：

```text
AIUsage 服务端 Postgres
```

建议表：

```text
user_devices
cloud_device_instances
cloud_usage_records
cloud_sync_batches
cloud_sync_state
cloud_sync_resets
```

职责：

- 保存用户私有的跨设备明细数据。
- 支持多设备 pull/push。
- 支持设备撤销、清空云端数据、按设备删除。
- 不直接对外公开。

### 3.3 自托管同步数据

存储位置由用户控制：

```text
GitHub repository
S3 bucket
R2 bucket
MinIO bucket
```

现有远端结构继续保留：

```text
<deviceInstanceId>/<yyyy>/<mm>/<dd>.ndjson
```

职责：

- 面向高级用户、企业用户、隐私敏感用户。
- 数据完全由用户控制。
- 与官方同步互斥或显式切换，避免同一设备同时写多个同步后端导致冲突复杂化。

### 3.4 公开榜单数据

存储位置：

```text
AIUsage 服务端 Postgres
```

主要表：

```text
upload_requests
upload_snapshots
leaderboard_metrics
official_price_tables
official_price_entries
admin_audit_logs
```

职责：

- 保存公开榜单所需的聚合指标。
- 支持按时间、工具、模型、价格、token 组合排名。
- 支持版本化官方价格表，用于公开 cost leaderboard。
- 支持管理员审核、隐藏、恢复和审计。
- 不保存用户私有明细记录。

## 4. 同步模式

### 4.1 官方同步

官方同步是默认推荐模式。

配置：

```json
{
  "sync": {
    "backend": "cloud"
  }
}
```

适合：

- 普通用户。
- 不想配置 GitHub token 或 S3 key 的用户。
- 希望网页登录后自动管理设备和数据的用户。

### 4.2 自托管同步

自托管同步是高级模式。

GitHub：

```json
{
  "sync": {
    "backend": "github",
    "repo": "user/private-aiusage-sync"
  }
}
```

S3：

```json
{
  "sync": {
    "backend": "s3",
    "bucket": "my-bucket",
    "prefix": "aiusage/"
  }
}
```

适合：

- 不希望私有明细进入 AIUsage 官方服务器的用户。
- 企业合规或数据自持有场景。
- 自建对象存储用户。
- 需要独立备份的用户。

### 4.3 模式切换策略

同一时间建议只启用一个同步后端：

```text
cloud | github | s3 | disabled
```

切换同步后端时应提示：

- 现有本地数据不会删除。
- 新后端不会自动拥有旧后端的数据，除非用户显式执行迁移。
- 用户可以先 pull 旧后端，再切换到新后端 push。

## 5. 官方同步数据库设计

### 5.1 `user_devices`

复用现有 CLI 设备授权表，不为官方同步另建一套设备身份。

当前服务端已经通过 `user_devices` 支撑 CLI login、设备撤销、HMAC 上传校验和 last used 记录。官方同步应扩展这张表或增加从属表，而不是新增 `cloud_devices` / `cloud_device_tokens`，避免出现两套设备 ID、两套撤销状态和两套凭证生命周期。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 服务端设备 ID，沿用现有 `user_devices.id` |
| `user_id` | TEXT NOT NULL | 用户 ID |
| `name` | TEXT NOT NULL | 设备展示名 |
| `secret_encrypted` | TEXT NOT NULL | 加密保存的设备 secret，用于 HMAC 校验 |
| `secret_hash` | TEXT NOT NULL | secret hash，用于诊断、轮换或未来凭证比对 |
| `status` | device_status | `active` / `revoked` |
| `device_instance_id` | TEXT | 本地 `state.json` 里的设备实例 ID；普通 login/upload 设备可为空 |
| `platform` | TEXT NOT NULL | `darwin` / `linux` / `win32` 等 |
| `app_version` | TEXT | CLI 版本 |
| `last_seen_at` | TIMESTAMPTZ | 最近请求时间 |
| `revoked_at` | TIMESTAMPTZ | 撤销时间 |
| `created_at` | TIMESTAMPTZ NOT NULL | 创建时间 |
| `updated_at` | TIMESTAMPTZ NOT NULL | 更新时间 |

建议唯一约束：

```sql
UNIQUE (user_id, device_instance_id)
```

`device_instance_id` 如果加到 `user_devices`，必须使用部分唯一索引：

```sql
CREATE UNIQUE INDEX idx_user_devices_instance
  ON user_devices(user_id, device_instance_id)
  WHERE device_instance_id IS NOT NULL;
```

更推荐使用 `cloud_device_instances` 从属表，避免破坏现有只用于 login/upload 的设备授权：

```text
cloud_device_instances:
  user_id
  device_id          references user_devices(id)
  device_instance_id TEXT NOT NULL
  sync_generation    BIGINT NOT NULL DEFAULT 1
  last_seen_cursor   TEXT
  created_at
  updated_at

UNIQUE (user_id, device_instance_id)
UNIQUE (device_id)
```

关键约束：所有 CLI 授权统一以 `user_devices.id` 为准；启用 cloud sync 的设备必须绑定非空 `device_instance_id`。不能依赖可空唯一约束，否则 Postgres 会允许同一用户存在多个 `NULL` 设备实例，导致去重和 self-pull 排除失效。

### 5.2 设备凭证存储

现有 HMAC 方案要求服务端能重新计算签名，因此服务端不能只保存不可逆 hash。

v1 保持当前模型：

```text
device_secret 明文只返回给 CLI 一次
服务端保存 secret_encrypted，用 KMS/环境密钥加密
服务端同时保存 secret_hash，便于审计、轮换和未来迁移
```

如果未来改成只保存 hash，则同步和上传认证也必须一起改为 bearer token hash 比对或非对称签名，不能继续使用当前共享密钥 HMAC。

### 5.3 `cloud_usage_records`

官方私有同步主表。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 服务端记录 ID，建议使用 nanoid 风格，匹配现有服务端表 |
| `user_id` | TEXT NOT NULL | 用户 ID |
| `device_id` | TEXT NOT NULL | `user_devices.id` |
| `device_instance_id` | TEXT NOT NULL | 本地设备实例 ID |
| `sync_generation` | BIGINT NOT NULL | 用户清空云端数据后的同步代次 |
| `record_id` | TEXT NOT NULL | 本地记录 ID |
| `ts` | BIGINT NOT NULL | 事件时间戳，毫秒 |
| `tool` | TEXT NOT NULL | 工具 |
| `model` | TEXT NOT NULL | 模型 |
| `provider` | TEXT NOT NULL | 供应商 |
| `input_tokens` | BIGINT NOT NULL DEFAULT 0 | 输入 token |
| `output_tokens` | BIGINT NOT NULL DEFAULT 0 | 输出 token |
| `cache_read_tokens` | BIGINT NOT NULL DEFAULT 0 | 缓存读取 token |
| `cache_write_tokens` | BIGINT NOT NULL DEFAULT 0 | 缓存写入 token |
| `thinking_tokens` | BIGINT NOT NULL DEFAULT 0 | 思考 token |
| `cost` | NUMERIC(20,8) | 客户端本地成本，仅用于用户私有展示 |
| `cost_source` | TEXT | `log` / `pricing` / `unknown` |
| `session_key` | TEXT NOT NULL | 跨设备会话 key |
| `device_name` | TEXT | 冗余展示字段 |
| `platform` | TEXT | 冗余展示字段 |
| `updated_at` | BIGINT NOT NULL | 客户端业务更新时间 |
| `deleted_at` | TIMESTAMPTZ | 删除标记 |
| `created_at` | TIMESTAMPTZ NOT NULL | 服务端创建时间 |
| `server_updated_at` | TIMESTAMPTZ NOT NULL | 服务端更新时间 |
| `change_seq` | BIGINT NOT NULL | 每次 insert / update / tombstone 都重新分配的递增变更序号，用于稳定 pull 游标 |

建议唯一约束：

```sql
UNIQUE (user_id, sync_generation, device_instance_id, record_id)
```

建议索引：

```sql
CREATE INDEX idx_cloud_usage_user_ts ON cloud_usage_records (user_id, ts DESC);
CREATE INDEX idx_cloud_usage_user_tool_ts ON cloud_usage_records (user_id, tool, ts DESC);
CREATE INDEX idx_cloud_usage_user_model_ts ON cloud_usage_records (user_id, model, ts DESC);
CREATE INDEX idx_cloud_usage_device ON cloud_usage_records (user_id, sync_generation, device_instance_id);
CREATE INDEX idx_cloud_usage_server_updated ON cloud_usage_records (user_id, server_updated_at DESC, id DESC);
CREATE INDEX idx_cloud_usage_change_seq ON cloud_usage_records (user_id, change_seq);
```

`change_seq` 不能只依赖 `BIGSERIAL` 插入默认值。upsert 更新、删除 tombstone、设备清空等所有会影响 pull 结果的变更，都必须获得新的 `change_seq`。可选实现：

1. 在 `cloud_usage_records` 上维护 `change_seq`，每次写入从 sequence 取新值。
2. 使用独立 append-only `cloud_usage_changes` 表，记录 `change_seq`、`record_id`、`operation`、`server_updated_at` 和变更后的 record/tombstone 引用。

如果采用第二种，pull 应以 `cloud_usage_changes.change_seq` 为唯一游标，避免更新同一行时漏拉。

### 5.4 `cloud_sync_batches`

记录 push/pull 批次，便于诊断和幂等。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 批次 ID |
| `user_id` | TEXT NOT NULL | 用户 ID |
| `device_id` | TEXT NOT NULL | `user_devices.id` |
| `idempotency_key` | TEXT NOT NULL | 幂等 key |
| `direction` | TEXT NOT NULL | `push` / `pull` |
| `record_count` | INTEGER NOT NULL | 记录数 |
| `status` | TEXT NOT NULL | `accepted` / `rejected` / `failed` |
| `error_code` | TEXT | 错误码 |
| `created_at` | TIMESTAMPTZ NOT NULL | 创建时间 |

建议唯一约束：

```sql
UNIQUE (device_id, idempotency_key)
```

### 5.5 `cloud_sync_state`

保存每个设备的同步水位。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `user_id` | TEXT NOT NULL | 用户 ID |
| `device_id` | TEXT NOT NULL | `user_devices.id` |
| `last_push_at` | TIMESTAMPTZ | 最近 push |
| `last_pull_at` | TIMESTAMPTZ | 最近 pull |
| `last_server_cursor` | TEXT | pull 游标 |
| `last_error_code` | TEXT | 最近错误 |
| `updated_at` | TIMESTAMPTZ NOT NULL | 更新时间 |

主键：

```sql
PRIMARY KEY (user_id, device_id)
```

### 5.6 `cloud_sync_resets`

记录用户清空官方同步数据的屏障，防止旧离线设备重新上传已清空的数据。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `user_id` | TEXT PRIMARY KEY | 用户 ID |
| `sync_generation` | BIGINT NOT NULL | 当前有效同步代次 |
| `clear_before_change_seq` | BIGINT | 清空时的最大变更序号 |
| `reset_at` | TIMESTAMPTZ NOT NULL | 最近清空时间 |
| `reset_by_device_id` | TEXT | 触发清空的设备 |

清空语义：

- `POST /api/me/cloud-sync/clear` 必须递增 `sync_generation`，并记录 `clear_before_change_seq`。
- 清空后，新 push 必须携带客户端当前认知的 `sync_generation`。
- 服务端拒绝低于当前 generation 的 push，返回 `sync_generation_stale`，要求 CLI 先 pull/reset 本地同步状态。
- pull 默认只返回当前 generation 的记录和 tombstone。
- 旧 generation 数据可以后台异步物理清理，但不能被旧设备重新恢复到当前 generation。

## 6. 官方同步 API

### 6.1 设备授权

可复用现有 CLI device authorization 流程。

推荐接口：

```text
POST /api/cli/device/start
POST /api/cli/device/approve
POST /api/cli/device/complete
```

完成后 CLI 获取：

```json
{
  "device_id": "user_devices.id",
  "device_secret": "secret"
}
```

服务端保存加密后的 `device_secret` 和 `secret_hash`。明文只返回给 CLI 一次，CLI 存入本地凭据文件并限制权限。

### 6.2 Push

```text
POST /api/cli/sync/push
```

认证：

```text
Authorization: AIUsage-HMAC ...
```

或复用现有设备 HMAC 签名方案。

推荐完全复用 leaderboard upload 的 HMAC 规范：

```text
X-AIUsage-Device-Id
X-AIUsage-Timestamp
X-AIUsage-Nonce
X-AIUsage-Idempotency-Key
X-AIUsage-Signature
```

canonical string：

```text
METHOD
PATH
BODY_SHA256
TIMESTAMP
NONCE
DEVICE_ID
IDEMPOTENCY_KEY
```

GET / pull 请求没有 body 时，`BODY_SHA256 = sha256('')`。Push 必须有 idempotency key；pull 可以使用请求 nonce 作为 idempotency key，或发送显式 read idempotency key 便于审计。nonce 防重放窗口沿用上传接口的时间窗口。

请求体：

```json
{
  "schema_version": 1,
  "device_instance_id": "uuid",
  "sync_generation": 1,
  "client_version": "1.4.0",
  "client_platform": "darwin",
  "records": [],
  "tombstones": []
}
```

限制：

- 单次最多 1000 条记录。
- 请求体建议不超过 1 MB。
- 所有 token 字段必须是非负整数。
- `record_id`、`tool`、`model`、`provider` 必须有长度限制。
- `updated_at` 较新的记录覆盖旧记录。
- 删除通过 tombstone 或 `deleted_at` 传播，不能物理删除后静默丢失。
- tombstone 至少包含 `device_instance_id`、`record_id`、`deleted_at`、`updated_at`。
- 同一 `(user_id, device_instance_id, record_id)` 同时收到 record 和 tombstone 时，以 `updated_at` 较新的为准；相同 `updated_at` 时 tombstone 优先，避免删除被旧数据复活。
- `sync_generation` 必须等于服务端当前 generation，否则返回 `sync_generation_stale`。

返回：

```json
{
  "status": "accepted",
  "inserted": 100,
  "updated": 20,
  "skipped": 5,
  "sync_generation": 1,
  "server_cursor": "cursor"
}
```

### 6.3 Pull

```text
GET /api/cli/sync/pull?cursor=...&limit=1000
```

返回当前用户除本设备外的变更：

```json
{
  "records": [],
  "tombstones": [],
  "sync_generation": 1,
  "next_cursor": "cursor",
  "has_more": true
}
```

Pull 逻辑：

- 默认不返回当前 `device_instance_id` 自己上传的记录。
- 支持按稳定游标增量拉取。推荐游标为 `change_seq`；如果使用 `server_updated_at`，必须同时带上 `id` 作为 tie-breaker，排序为 `(server_updated_at ASC, id ASC)`。
- 返回 tombstone，保证删除能传播。

### 6.4 清空与设备管理

建议接口：

```text
GET    /api/me/devices
PATCH  /api/me/devices/:id
DELETE /api/me/devices/:id
POST   /api/me/cloud-sync/clear
```

能力：

- 查看设备列表。
- 重命名设备。
- 撤销设备凭证。
- 清空官方同步数据。
- 清空某个设备的数据。

## 7. CLI 设计

### 7.1 命令

建议保留并统一命令语义：

```text
aiusage login        授权 CLI 设备
aiusage logout       移除 CLI 授权
aiusage sync         私有同步
aiusage upload       公开榜单上传
aiusage leaderboard  查看公开榜单
aiusage status       查看本地和同步状态
```

`rank` 不作为命令名，只作为 leaderboard entry 的名次字段。

### 7.2 配置

官方同步：

```json
{
  "sync": {
    "backend": "cloud"
  }
}
```

自托管同步：

```json
{
  "sync": {
    "backend": "github",
    "repo": "user/private-aiusage-sync"
  }
}
```

禁用同步：

```json
{
  "sync": null
}
```

### 7.3 同步后端抽象

新增官方同步后端时，不建议让 cloud 强行模拟文件系统。

现有自托管同步抽象是文件式：

```ts
interface SyncBackend {
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<void>
  listFiles(): Promise<string[]>
  prepare?(): Promise<void>
  flush?(): Promise<boolean>
}
```

它适合 GitHub/S3 的 `<device>/<yyyy>/<mm>/<dd>.ndjson` 结构，但不适合官方同步的记录级 push/pull、服务端 cursor、tombstone 和幂等批次。

官方同步 v1 直接引入记录级接口：

```ts
interface RecordSyncBackend {
  prepare?(): Promise<void>
  pull(options: {
    cursor?: string
    limit: number
    excludeDeviceInstanceId: string
  }): Promise<{ records: SyncRecord[]; tombstones: SyncTombstone[]; nextCursor?: string; hasMore: boolean }>
  push(records: SyncRecord[], tombstones: SyncTombstone[], idempotencyKey: string): Promise<{
    inserted: number
    updated: number
    skipped: number
    serverCursor?: string
  }>
  flush?(): Promise<boolean>
}
```

`SyncTombstone` 对应本地 `sync_tombstones` 的删除记录，至少包含 `device_instance_id`、`record_id`、`deleted_at` 和 `updated_at`，用于跨设备传播删除。

落地策略：

1. `CloudRecordSyncBackend` 实现 `RecordSyncBackend`，对接 `/api/cli/sync/push` 和 `/api/cli/sync/pull`。
2. 现有 GitHub/S3 保留 `SyncBackend`，可以通过 `FileRecordSyncAdapter` 适配到记录级 orchestrator。
3. orchestrator 的核心合并逻辑以 `SyncRecord` / tombstone 为单位，文件读写只保留在自托管 backend 内部。

### 7.4 本地合并策略

继续使用当前本地模型：

```text
records         当前设备原始记录
synced_records 其他设备同步记录
```

查询全部设备时：

```text
records where source_file NOT LIKE 'synced/%'
UNION ALL
synced_records where device_instance_id != currentDeviceInstanceId
```

避免重复计算当前设备被合并回 `records` 的 synced copy。

## 8. 榜单设计

### 8.1 榜单数据模型

继续使用通用的 `leaderboard_metrics`，不使用固定 provider 列。

支持维度：

```text
period_type: daily | weekly | monthly | yearly | all_time
metric: tokens | cost
scope_type: all | tool | model | tool_model
filter: tool | model
```

榜单指标表保留：

```text
leaderboard_metrics:
  user_id
  device_id
  period_type
  period_start
  period_end
  scope_type
  tool
  model
  input_tokens
  output_tokens
  cache_read_tokens
  cache_write_tokens
  thinking_tokens
  total_tokens
  total_cost_usd
  pricing_version
  visibility
```

上传快照表保留审核字段：

```text
upload_snapshots:
  status
  reason_code
  reason_message
  review_status
  reviewed_by
  reviewed_at
  review_note
```

管理审计表保留：

```text
admin_audit_logs:
  admin_user_id
  action
  target_type
  target_id
  reason
  metadata
  created_at
```

官方价格表采用版本化模型：

```text
official_price_tables:
  id
  version
  status                  draft | published | archived
  source                  core_pricing | admin_draft | imported
  source_commit
  notes
  created_by
  created_at
  published_by
  published_at
  archived_at

official_price_entries:
  id
  table_id
  model_key
  input
  output
  cache_read
  cache_write
  currency
  source_url
  verified_at
  created_at
```

约束：

- 同一 `table_id + model_key` 唯一。
- 同一时间最多一个 `published` 版本作为默认官方价格表。
- `published` 版本不可修改；修正价格必须复制为新 draft 后重新 publish。
- `archived` 只影响默认选择，不影响历史榜单解释和重算。

### 8.2 上传协议

`aiusage upload` 上传聚合快照：

```json
{
  "schema_version": 1,
  "client_version": "1.4.0",
  "client_platform": "darwin",
  "snapshots": [
    {
      "period_type": "weekly",
      "period_start": "2026-06-01T00:00:00.000Z",
      "period_end": "2026-06-07T23:59:59.999Z",
      "input_tokens": 0,
      "output_tokens": 0,
      "cache_read_tokens": 0,
      "cache_write_tokens": 0,
      "thinking_tokens": 0,
      "total_tokens": 0,
      "breakdowns": [],
      "token_snapshot_hash": "sha256:..."
    }
  ]
}
```

服务端校验：

- schema version 必须匹配。
- 时间周期边界必须正确。
- token 字段必须是非负整数。
- `total_tokens` 必须等于 token components 之和。
- `all/tool/model/tool_model` breakdown 必须互相一致。
- snapshot hash 必须匹配 canonical payload。
- 请求必须通过设备 HMAC。
- 合法 payload 不因为 token 过大被 threshold 阻断。
- 单次最多 5 个 snapshot。
- 单个 snapshot 最多 1000 个 breakdown。
- 通过 nonce 防重放，通过 `device_id + idempotency_key` 保证幂等。

### 8.3 多设备上传一致性

榜单是用户级排名，不是单设备排名。多设备场景必须避免旧设备或未同步设备用不完整聚合覆盖用户总量。

当前 schema v1 的约束：

- CLI 上传前应先执行一次私有同步，或明确提示用户当前快照只包含本地已知数据。
- 服务端 upsert `leaderboard_metrics` 时继续以 `user_id + period + scope + tool/model` 为唯一键。
- schema v1 不包含同步水位，服务端无法证明快照覆盖了所有设备数据。
- 在没有任何多设备同步来源时，schema v1 可以继续作为手动上传协议。
- 只要用户启用了任意多设备同步来源，包括官方同步、GitHub、S3、R2 或 MinIO，手动上传用户级榜单就需要先证明本地已同步到最新已知水位。
- 如果仍允许 CLI 手动上传用户级榜单，应升级 schema v2，加入本次快照使用的同步水位，例如 `sync_cursor`、`known_device_cursors`、自托管远端 revision 或最近成功 pull 时间。
- 服务端或 CLI 发现上传水位落后于远端最新水位时，应拒绝或标记该 snapshot，避免用旧快照覆盖新榜单。

更稳妥的后续形态：

```text
cloud_usage_records -> server aggregation job -> leaderboard_metrics
```

此时 `aiusage upload` 只用于未启用官方同步或选择自托管同步的用户；启用官方同步且选择公开榜单的用户，由服务端基于私有同步数据聚合。

### 8.4 榜单价格

服务端按系统内置价格表计算：

```text
tool_model breakdown -> cost -> aggregate to all/tool/model
```

不使用客户端上传的 `cost` 或用户自定义价格。

价格计算必须记录版本：

```text
pricing_version = 内置价格表版本或 commit hash
model_normalized = 服务端归一化后的模型 ID
```

策略：

- 服务端先做模型别名归一化，再计算 cost。
- 服务端 cost leaderboard 使用当前 `published` 的 `official_price_tables`。
- `leaderboard_metrics.pricing_version` 记录本次 cost 使用的价格表版本。
- 价格表更新后，不直接修改历史 `total_cost_usd`；必须通过后台重算任务按新的 `pricing_version` 更新 cost leaderboard。
- unknown model 不应静默按 0 成本参与 cost leaderboard；推荐标记 snapshot 为 `flagged`，或让该 model 只参与 token leaderboard、不参与 cost leaderboard。
- 管理员可以在审核页看到 unknown model、原始 model、归一化 model 和价格版本。

管理员价格管理：

- 可以新增 / 编辑 / 删除 draft 中的 price entry。
- 可以从 `packages/core/src/pricing.ts` 或 JSON seed 生成新的 draft。
- 可以比较两个价格版本的 diff。
- 可以 publish draft，使其成为新的官方价格版本。
- 可以 archive 旧版本，但不能删除 published 版本。
- publish / archive / recompute 都必须写入 `admin_audit_logs`。

不建议能力：

- 不允许直接编辑当前 published 版本。
- 不允许删除已被 `leaderboard_metrics.pricing_version` 引用的价格版本。
- 不允许用户自定义价格进入 official price table。
- 不允许服务端、CLI、文档各维护一份彼此独立的官方价格表。

### 8.5 从官方同步自动生成榜单

v1 可以先保持手动 `aiusage upload`。

后续可以提供可选能力：

```text
使用官方同步数据自动更新榜单
```

必须满足：

- 用户明确开启 leaderboard。
- 用户明确选择公开范围。
- 后台 job 从 `cloud_usage_records` 聚合后写入 `leaderboard_metrics`。
- 不直接公开私有明细表。

### 8.6 管理员审核与治理

公开榜单需要内置管理员治理能力，避免异常上传、作弊数据、违规用户资料或误判数据长期展示。

现有服务端能力应保留并产品化：

```text
users.role = user | admin
users.status = active | banned | deleted
upload_snapshots.status = accepted | rejected | flagged
upload_snapshots.review_status = pending | approved | rejected | hidden
leaderboard_metrics.visibility = public | hidden | flagged
admin_audit_logs 记录所有管理操作
```

管理员能力：

- 查看 flagged / rejected / hidden / recent uploads 队列。
- 查看某个 snapshot 的 period、token totals、breakdowns、hash、设备、用户和上传时间。
- approve snapshot：标记审核通过；只有当用户状态和用户榜单可见性允许时，才能保留或恢复对应榜单指标。
- reject snapshot：标记审核拒绝，并同步隐藏该 snapshot 派生出的所有 `leaderboard_metrics`。
- hide snapshot：隐藏该 snapshot 派生出的所有 `leaderboard_metrics`。
- hide metric：隐藏单条 `leaderboard_metrics`，用于只处理某个 scope/tool/model 维度。
- restore metric：恢复误隐藏的榜单指标。
- ban / unban user：封禁用户后公开榜单查询必须排除该用户。
- set role：授予或撤销 admin 权限。
- 管理官方价格表 draft / publish / archive。
- 触发用户/周期/价格表维度的榜单重算。

审核状态机：

| upload_snapshots.status | review_status | 默认 metric visibility | 允许操作 | 操作后结果 |
|---|---|---|---|---|
| `accepted` | `NULL` / `approved` | `public` | hide / reject | metrics -> `hidden` 或 `flagged` |
| `flagged` | `pending` | `flagged` 或 `hidden` | approve / reject / hide | approve 才可 public |
| `rejected` | `rejected` | `hidden` | approve | 仅在用户状态允许时恢复 public |
| `accepted` | `hidden` | `hidden` | restore metric | 仅恢复指定 metric |
| any | any | any | ban user | 查询层全部排除 |

推荐 v1 策略：`flagged` snapshot 默认不公开，管理员 approve 后才写入或恢复为 `public`。如果为了减少审核队列压力而允许 flagged 先公开，必须在 UI 中标记并支持事后快速隐藏，但这会增加作弊曝光风险。

推荐 API：

```text
GET  /api/admin/uploads?status=flagged&limit=50&offset=0
POST /api/admin/uploads/:snapshotId/approve
POST /api/admin/uploads/:snapshotId/reject
POST /api/admin/uploads/:snapshotId/hide
POST /api/admin/leaderboard/:metricId/hide
POST /api/admin/leaderboard/:metricId/restore
POST /api/admin/users/:id/ban
POST /api/admin/users/:id/unban
POST /api/admin/users/:id/role
GET  /api/admin/audit-logs
GET  /api/admin/pricing
POST /api/admin/pricing/drafts
PATCH /api/admin/pricing/drafts/:id
POST /api/admin/pricing/drafts/:id/publish
POST /api/admin/pricing/:version/archive
POST /api/admin/leaderboard/recompute
```

管理操作要求：

- 所有写操作必须通过 `requireAdmin` 或等价权限检查。
- 所有写操作必须写入 `admin_audit_logs`，记录 admin、action、target、reason、metadata 和时间。
- hide/reject 不物理删除原始上传，保证可审计和可恢复。
- `reject snapshot` 必须把同一 `upload_request_id + user_id + period_type + period_start` 派生出的 `leaderboard_metrics.visibility` 更新为 `hidden` 或 `flagged`。
- `hide snapshot` 必须隐藏该 snapshot 派生出的全部 metrics；`hide metric` 只隐藏单条 metric。
- `approve snapshot` 或 `restore metric` 不得绕过 `users.status`、`users.leaderboard_visibility` 和管理员此前对同一 metric 的显式隐藏策略。
- 公开榜单查询只返回 `leaderboard_metrics.visibility = 'public'`、`users.status = 'active'`、`users.leaderboard_visibility = 'public'` 的数据。
- 用户启用匿名榜单时，公开查询必须返回匿名化身份：固定 display name、空 avatar/profile URL，并避免暴露可反查真实账号的稳定 `user_id`。
- 管理员页面可以展示聚合指标和用户资料，但不能展示私有明细、prompt、completion 或原始日志。

风控标记建议：

- 单次上传 token 数量相对用户历史增长异常。
- snapshot 中 tool/model breakdown 和 all total 不一致。
- 同一设备短时间重复上传过多。
- 周期边界、hash、schema、nonce、idempotency 异常。
- 成本榜中 unknown model 或价格表无法识别的模型占比异常。
- 用户名、display name、avatar 或 profile URL 违规。

## 9. 用户设置

建议拆分同步设置与榜单设置。

### 9.1 同步设置

```text
user_sync_settings:
  user_id
  cloud_sync_enabled
  default_sync_backend
  retention_days
  aggregate_retention_policy
  updated_at
```

`retention_days` 只控制官方同步私有明细的保留时间。已生成的 `leaderboard_metrics` 和必要的不可逆聚合快照可按更长周期保留，用于历史榜单展示、价格表重算和管理员审计。

如果用户要求彻底删除公开榜单数据，应隐藏或删除对应 `leaderboard_metrics`，并记录审计；如果只清理私有明细，不应破坏已经公开授权过的聚合榜单，除非产品明确要求同步删除。

### 9.2 榜单设置

```text
user_leaderboard_settings:
  user_id
  display_name
  avatar_url
  leaderboard_visibility
  leaderboard_anonymous
  profile_url
  updated_at
```

建议语义：

```text
leaderboard_visibility = public | private
leaderboard_anonymous = true | false
```

展示规则：

- `private`：不出现在公开榜单。
- `public + anonymous`：出现在榜单，但隐藏身份。
- `public + not anonymous`：展示用户资料。

## 10. 隐私与安全

### 10.1 权限边界

| 数据 | 可见性 | 存储 | 说明 |
|---|---|---|---|
| `records` | 本机私有 | 本地 SQLite | 当前设备明细 |
| `synced_records` | 本机私有 | 本地 SQLite | 其他设备同步明细 |
| `cloud_usage_records` | 用户私有 | 官方服务端 | 官方同步明细 |
| `leaderboard_metrics` | 公开或隐藏 | 官方服务端 | 榜单聚合指标 |

### 10.2 设备凭证

设备凭证要求：

- 明文只返回给 CLI 一次。
- 当前 HMAC 方案下，服务端保存加密 secret 和 secret hash。
- 加密密钥必须独立于数据库保存，支持轮换。
- 支持撤销。
- 支持 last used 记录。
- 支持按设备清空数据。

### 10.3 数据删除

必须支持：

- 清空本地数据。
- 清空官方同步数据。
- 删除某个设备的官方同步数据。
- 撤销设备但保留历史数据。
- 撤销设备并删除该设备数据。
- 关闭榜单并隐藏公开指标。

删除同步建议使用 tombstone，避免设备 A 删除后设备 B 下次同步又把旧记录上传回来。

### 10.4 数据最小化

官方同步上传字段应保持最小化：

- 不上传原始日志文件内容。
- 不上传 prompt、completion、代码片段。
- 不上传完整本地路径，除非未来有明确的项目维度功能并经过脱敏。
- 榜单上传只上传聚合指标。

## 11. 性能与体验优化

AIUsage 的本地 Web dashboard 和公开 leaderboard 都必须把性能作为 v1 验收目标。尤其是本地启动 Web、首页初始化、菜单切换和大数据量聚合查询，不能依赖每次页面切换都全量扫描 `records` / `synced_records` / `tool_calls`。

### 11.1 体验目标

建议目标：

- `aiusage serve` 启动后先打开 Web shell，再后台解析和刷新数据。
- 首页首屏优先展示最近一次缓存 summary，不等待所有图表和排行都计算完成。
- 菜单切换应立即显示目标页面 shell 或 stale cache，具体图表异步刷新。
- 常用时间范围的 summary / tokens / cost / models 查询在普通数据量下应在 300-500ms 内返回。
- 大数据量场景下，页面不应白屏；应显示 skeleton、stale data 或分块加载状态。
- 任何单个 API 慢查询都不应阻塞整个 dashboard 初始化。

### 11.2 本地 SQLite 查询优化

本地 dashboard 的主要风险是多个菜单页面各自触发聚合查询，且查询经常需要合并：

```text
records
UNION ALL
synced_records
JOIN tool_calls
GROUP BY day / tool / model / project / session
```

建议增加索引：

```sql
CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts);
CREATE INDEX IF NOT EXISTS idx_records_tool_ts ON records(tool, ts);
CREATE INDEX IF NOT EXISTS idx_records_model_ts ON records(model, ts);
CREATE INDEX IF NOT EXISTS idx_records_device_ts ON records(device_instance_id, ts);
CREATE INDEX IF NOT EXISTS idx_records_session_ts ON records(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);

CREATE INDEX IF NOT EXISTS idx_synced_records_device_ts ON synced_records(device_instance_id, ts);
CREATE INDEX IF NOT EXISTS idx_synced_records_tool_ts ON synced_records(tool, ts);
CREATE INDEX IF NOT EXISTS idx_synced_records_model_ts ON synced_records(model, ts);
CREATE INDEX IF NOT EXISTS idx_synced_records_updated_at ON synced_records(updated_at);

CREATE INDEX IF NOT EXISTS idx_tool_calls_record_id ON tool_calls(record_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);
```

建议新增本地聚合缓存表：

```text
usage_daily_aggregates:
  day
  device_instance_id
  tool
  model
  input_tokens
  output_tokens
  cache_read_tokens
  cache_write_tokens
  thinking_tokens
  total_tokens
  cost
  record_count
  updated_at

dashboard_query_cache:
  cache_key
  payload_json
  source_max_updated_at
  generated_at
```

策略：

- 解析日志、同步 pull、价格重算后，增量更新 aggregate，而不是每次页面访问都重新全表聚合。
- 常用范围如 today / week / month / last30 / all 可以预热 summary cache。
- 查询 cache key 必须包含 range、from/to、device、tool、weekStart、pricing revision 和数据水位。
- 当 `records.updated_at` 或 `synced_records.updated_at` 没有超过 cache 水位时，直接返回缓存。
- 对 all-time 大查询优先读 aggregate；只有调试或重算时才扫描明细表。

### 11.3 本地 API 与页面加载

本地 Web API 应避免首页一次性串行请求多个重聚合接口。

建议：

- 新增 `/api/bootstrap` 或 `/api/dashboard/summary`，一次返回首页首屏需要的最小数据：summary、当前范围、设备列表、最近更新时间、是否正在解析。
- tokens chart、cost chart、models、projects、sessions、tool calls 分面延迟加载。
- 菜单切换时按路由懒加载数据，不在全局 layout 中预拉所有页面数据。
- 前端以 query key 缓存 API 响应，参数未变时返回 stale data 并后台刷新。
- 使用 AbortController 取消已离开的页面请求，避免旧请求返回后覆盖新页面状态。
- 对 sessions、projects、tool_calls 使用分页、游标或虚拟列表，禁止一次加载全部明细。
- 价格重算、日志解析、同步 pull/push 必须是后台任务，页面通过状态接口轮询或订阅进度。

### 11.4 菜单切换优化

菜单切换慢通常来自三类问题：

1. 前端等待目标页所有 API 完成后才渲染。
2. 每个页面重复请求 summary、devices、settings 等公共数据。
3. 后端每个接口都扫描大表并重复执行相似聚合。

优化要求：

- 路由切换先渲染页面骨架和上次缓存结果。
- 公共数据放入全局 store，带 TTL 和 query key。
- 页面级请求并行发起，禁止不必要的 waterfall。
- hover / focus 菜单项时可以预取目标页轻量数据。
- 图表和排行分区加载，单个慢区块不能阻塞整个页面。

### 11.5 服务端榜单性能

公开 leaderboard 查询必须保持只读路径轻量。

要求：

- `leaderboard_metrics` 保留 rank 相关索引：`period_type, period_start, scope_type, visibility, total_tokens DESC` 和 `total_cost_usd DESC`。
- cost leaderboard 查询必须使用已写入的 `total_cost_usd`，不能请求时重新按价格表计算。
- 常用周期和 scope 可以使用短 TTL cache，例如 30-120 秒。
- 管理员 hide/reject/restore、价格重算、用户可见性变更后，应失效相关 leaderboard cache。
- 深分页避免 offset，继续使用 cursor。
- current user rank 对大榜单可异步加载，或使用单独 endpoint，避免拖慢主列表。

### 11.6 性能验收

验收建议：

- 在 100k、1M、5M records 数据量下分别跑本地 dashboard 性能测试。
- 首页首屏不等待 projects/sessions/tool_calls 全量聚合。
- 菜单切换时 100ms 内完成 shell 渲染，数据可异步刷新。
- 常用范围 summary / tokens / cost 接口有 explain plan 或基准测试记录。
- all-time 查询有 aggregate 或 cache 路径，不直接依赖每次全表扫描。
- 价格重算和日志解析期间 dashboard 仍可读取旧数据。
- CI 或手工 benchmark 覆盖至少一个大数据 fixture。

## 12. 后台任务

建议新增后台任务能力：

### 12.1 榜单重算

用于：

- 价格表更新。
- 修复榜单聚合 bug。
- 清理异常数据。
- 重新生成某个时间范围或某个用户的 leaderboard metrics。
- 管理员处理异常数据后恢复一致状态。
- unknown model 归一化规则更新。
- 官方价格版本发布后更新 cost leaderboard。

输入：

```text
period_type
period_start
period_end
user_id optional
metric scope optional
```

输出：

```text
leaderboard_metrics
pricing_version
diff summary
```

### 12.2 官方价格表发布

用于：

- 从 `packages/core/src/pricing.ts` 或 JSON seed 导入新的 draft。
- 管理员编辑 draft 价格条目。
- 校验价格字段、currency、model_key、source_url 和重复模型。
- 比较 draft 和当前 published 版本的差异。
- 发布新的 official price table。
- 将新版本用于后续榜单上传和可选历史重算。

输入：

```text
draft table id
admin_user_id
source_commit optional
publish note
```

输出：

```text
official_price_tables.version
published_at
diff summary
admin_audit_logs
```

要求：

- draft 可编辑、可删除。
- published 不可编辑、不可删除。
- archive 不影响历史 `pricing_version` 引用。
- publish 后不自动静默重算历史榜单；必须创建显式 recompute job。

### 12.3 榜单风控与审核队列

用于：

- 发现异常上传并标记 `upload_snapshots.status = 'flagged'`。
- 把 flagged snapshot 放入管理员审核队列。
- 根据管理员操作同步更新 `upload_snapshots.review_status` 和 `leaderboard_metrics.visibility`。
- 清理长期隐藏或被拒绝数据的派生指标。
- 保证 rejected / hidden snapshot 不留下 public metric。

输入：

```text
upload_request_id optional
user_id optional
period_type optional
lookback window
ruleset version
```

输出：

```text
upload_snapshots.status / review_status
leaderboard_metrics.visibility
admin_audit_logs
```

### 12.4 官方同步数据维护

用于：

- 过期数据清理。
- 删除 tombstone 压缩。
- 设备撤销后的数据处理。
- 异常批次诊断。
- 清空云端后的旧 generation 清理。
- 保留必要聚合快照以支持历史榜单重算。

## 13. 实施计划

### 阶段 1：稳定公开榜单 v1

目标：

- 保持 `leaderboard_metrics` 通用模型。
- 完成 `leaderboard` 命令、`upload` 命令和 Web 查询。
- 移除 threshold 阻断，合法 payload 都能上传。
- 服务端严格校验 schema、hash、period、breakdown。
- 补齐管理员审核、隐藏、恢复和审计能力。
- 服务端 cost leaderboard 使用版本化官方价格表。

验收：

- `aiusage upload` 能上传 daily/weekly/monthly/yearly/all_time。
- Web leaderboard 支持 tokens/cost、all/tool/model/tool_model。
- `rank` 不作为命令名。
- 价格由服务端系统内置价格表计算。
- 管理员可以查看 flagged uploads、approve/reject/hide snapshot、hide/restore metric。
- 管理员所有写操作都有 audit log。
- 被隐藏、被拒绝、用户被封禁或用户隐藏榜单时，公开榜单查询不会展示对应数据。
- reject snapshot 后对应派生 metrics 不再保持 `public`。
- flagged snapshot 默认不公开，除非方案明确采用“先公开后审核”并在 UI 标记。
- 匿名榜单不会暴露真实 `user_id`、avatar 或 profile URL。
- `leaderboard_metrics` 写入明确 `pricing_version`。
- unknown model 不静默按 0 成本参与 cost leaderboard。

### 阶段 2：官方同步最小可用版

目标：

- 新增 `cloud` sync backend。
- 复用 `user_devices` 作为 CLI 设备身份。
- 新增服务端 `cloud_usage_records`、`cloud_sync_batches`、`cloud_sync_state`。
- 引入记录级 `RecordSyncBackend`，官方同步不模拟文件式远端。
- CLI 支持 `sync.backend = cloud`。
- 支持 push 当前设备 records。
- 支持 pull 其他设备 records 到 `synced_records`。

验收：

- 两台设备登录同一账号后可以互相看到汇总数据。
- 断网或服务端错误不会破坏本地数据。
- 重复 push 不产生重复记录。
- 当前设备数据不被 pull 回来重复计算。
- 增量 pull 使用稳定 cursor，不因相同 `server_updated_at` 漏数据。
- update 和 tombstone 都会推进 pull cursor，不会因为 upsert 同一行而漏拉。
- 清空云端数据会递增 `sync_generation`，旧 generation 设备 push 会被拒绝或要求重置。

### 阶段 3：设备管理与数据删除

目标：

- Web 设置页展示设备列表。
- 支持撤销设备凭证。
- 支持清空官方同步数据。
- 支持删除某个设备的数据。
- tombstone 删除传播。

验收：

- 撤销设备后旧凭证不能再 push/pull。
- 清空云端数据后其他设备不会重新恢复已删除数据。
- 本地数据删除和云端删除语义清晰。

### 阶段 4：产品化同步体验

目标：

- 默认推荐官方同步。
- 自托管同步保留为高级选项。
- Web UI 清楚区分“官方同步”“自托管同步”“公开榜单”。
- `status` 显示同步后端、最近成功时间、最近错误。
- 本地 Web dashboard 支持快速首屏、菜单懒加载、查询缓存和大数据量聚合优化。

验收：

- 新用户无需 GitHub/S3 即可启用多设备同步。
- 高级用户仍可使用 GitHub/S3。
- UI 文案不会让用户误以为同步等于上榜。
- 首页首屏不等待所有图表和排行全量聚合。
- 菜单切换先渲染页面 shell 或 stale cache，再异步刷新数据。
- 常用 range 查询走索引、aggregate 或 cache 路径。

### 阶段 5：自动榜单与重算能力

目标：

- 后台 job 支持从官方同步数据生成 leaderboard metrics。
- 支持价格表版本更新后的重算。
- 支持管理员按用户/周期重算。
- 管理员可以在重算后查看差异摘要，并保留审计记录。
- 支持 unknown model 归一化规则更新后的重算或重新审核。
- 支持官方价格表 draft / publish / archive 工作流。

验收：

- 用户可选择“使用官方同步数据自动更新榜单”。
- 不开启公开榜单时，私有同步数据不会出现在榜单。
- 价格表变化后可重算历史 cost leaderboard。
- 重算不会恢复管理员明确隐藏或拒绝的数据，除非管理员显式 restore。
- 历史重算有明确 `pricing_version`，不会依赖已经按 retention 删除的私有明细。
- 管理员只能编辑 draft 价格表；published 版本不可变。
- publish 价格版本会写 audit log，并可触发显式 recompute job。

## 14. 迁移策略

当前没有必须兼容的历史云端数据时，可以采用干净 v1 设计：

1. 保留本地 SQLite schema 的兼容迁移。
2. 服务端新增官方同步表。
3. 旧榜单表如不符合新模型，可清空或重建。
4. 自托管同步文件格式保持现有 ndjson，避免破坏已有用户。
5. 官方同步作为新增 backend，不影响 GitHub/S3。

如果需要清空服务端旧数据：

- 先停止写入。
- 导出备份。
- 重建 schema。
- 恢复必要用户和设备授权。
- 重新上传榜单或重新 sync。

## 15. 需要避免的设计

不要把私有同步和公开榜单合并成一个上传接口。

不要在榜单表里使用固定 provider 列，例如：

```text
gpt_tokens
claude_tokens
cursor_tokens
```

应使用：

```text
scope_type
tool
model
metric
```

不要在多个服务端模块复制价格表。价格逻辑应有单一来源。

不要把用户自定义价格用于公开排名。

不要让管理员直接编辑当前 published 官方价格表；必须通过 draft -> publish 产生新版本。

不要删除已经被 `leaderboard_metrics.pricing_version` 引用的价格版本。

不要让官方同步强依赖文件式远端结构。官方同步应使用记录级接口；GitHub/S3 的文件结构只留在自托管 backend 内部。

不要默认上传 prompt、completion、代码片段、完整原始日志。

不要让 Web dashboard 首页和菜单切换依赖多个串行全表聚合查询。

不要在 sessions、projects、tool_calls 等明细页面一次性加载全部数据。

## 16. 验收清单

### 数据正确性

- 同一记录重复 push 不重复入库。
- 多设备记录按 `device_instance_id + record_id` 唯一。
- 当前设备不会重复计算自己同步回来的记录。
- 删除能通过 tombstone 传播。
- 清空云端数据后，旧 generation 离线设备不能重新恢复旧记录。
- cost leaderboard 不使用用户自定义价格。
- cost leaderboard 记录 `pricing_version`，unknown model 不静默以 0 成本参与排名。
- published 官方价格版本不可变，历史榜单可追溯到具体价格版本。
- 多设备榜单上传不能用落后水位的聚合快照覆盖较新的用户级榜单；该要求适用于官方同步和所有自托管同步后端。

### 稳定性

- 网络失败不影响本地 records。
- push/pull 支持重试和幂等。
- 服务端限制 payload 大小和记录数。
- 大量记录按分页或批次同步。
- API 有明确错误码。

### 性能

- 本地 dashboard 首页首屏优先返回缓存 summary 或最小 bootstrap 数据。
- 菜单切换 100ms 内渲染页面 shell，慢查询以 skeleton 或 stale data 承接。
- summary / tokens / cost 常用范围查询有索引、aggregate 或 cache 路径。
- projects / sessions / tool_calls 使用分页、游标或虚拟列表。
- 解析、同步、价格重算期间 dashboard 仍可读取旧数据。
- 至少用 100k / 1M / 5M records fixture 做本地性能基准。

### 可维护性

- 官方同步、公开榜单、自托管同步表结构分离。
- 价格逻辑单一来源。
- 官方价格表有 draft / published / archived 生命周期。
- CLI backend 抽象清晰。
- 服务端迁移可重复执行。
- 后台任务可重算。
- 管理员操作统一走同一套 service 层并写审计日志。

### 隐私

- 同步和榜单分别授权。
- 设备 secret 明文只返回一次；服务端在 HMAC 方案下保存加密 secret 和 hash。
- 用户可以清空官方同步数据。
- 用户可以隐藏榜单。
- 匿名榜单隐藏真实身份字段，不暴露可反查用户的稳定 ID。
- 私有明细不会被公开查询。
- 管理员界面只展示审核所需的聚合指标和账号/设备元数据，不展示 prompt、completion 或原始日志。

### 管理员治理

- 非 admin 访问管理 API 返回 403。
- admin hide/reject 后公开榜单立即排除对应 metric。
- admin restore 不应绕过用户自身 `leaderboard_visibility` 或用户封禁状态。
- reject snapshot 必须同步隐藏该 snapshot 派生出的 metrics。
- ban user 后该用户所有公开榜单 entry 都不可见。
- audit log 能追溯 action、target、reason、admin 和时间。

### 产品体验

- 默认官方同步配置简单。
- 自托管同步仍可用。
- UI 文案明确区分：
  - 官方同步
  - 自托管同步
  - 公开榜单
- `leaderboard` 术语统一，`rank` 只表示名次。

## 17. 推荐最终形态

```text
本地 SQLite：离线可用、解析与个人统计的事实数据
官方 Cloud Sync：默认多设备同步体验
自托管 Sync：高级用户的数据自持有选项
Public Leaderboard：公开聚合排名系统
```

服务端使用一个 Postgres 数据库，多张职责清晰的表。

本地 SQLite 独立保留，不被云端数据库替代。

私有同步和公开榜单严格分离，通过明确授权和明确数据流连接。
