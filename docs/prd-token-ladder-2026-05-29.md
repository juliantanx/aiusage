# Token 天梯榜 PRD

**日期：** 2026-05-29
**版本：** v1.1
**范围：** `packages/site` 社区公开排行榜 + `@juliantanx/aiusage` CLI 上传链路

---

## 1. 背景

AIUsage 当前以本地优先为核心，已支持本地统计 AI 编程工具的 Token、模型、项目和工具调用等数据。Token 天梯榜只关注社区 Token 消耗排名：用户在明确 opt-in 的前提下，仅将本地聚合后的 Token 消耗量上传到官方站点，并在 `aiusage.jtanx.com` 查看社区公开排行榜。

原方案仅描述“匿名上报聚合统计数据至中央服务”，但当前需求已经升级为：

- 排行榜必须在 `packages/site` 对应的官方站点查看。
- 排行榜查看必须公开可见，不要求登录；上传、上传状态和设备管理必须登录。
- 只上传 Token 消耗量，不上传工具分布、模型分布、项目维度、费用或任何原始内容。
- 上传链路需要具备防篡改、防重放、防冒用、防重复上榜能力。
- 站点需要支持用户名/密码、GitHub、Linux Do 三种登录方式。
- 需要支持用户封禁和榜单治理。

Token 天梯榜不再是一个简单静态页面功能，而是一个包含认证、账号、设备授权、签名上传、榜单聚合和管理能力的完整社区系统。

---

## 2. 目标

### 2.1 产品目标

1. 用户可以在 `aiusage.jtanx.com` 免登录查看 Token 天梯榜。
2. 用户可以通过 `@juliantanx/aiusage` CLI 授权并上传本地聚合 Token 用量。
3. 排行榜展示社区用户的 Token 使用排名，避免同一用户重复占榜。
4. 上传数据和榜单记录一一对应到同一个站内用户。
5. 管理员可以封禁用户，被封禁用户无法上传、无法出现在排行榜。

### 2.2 安全目标

1. 防止未登录、未授权客户端上传数据。
2. 防止其他用户冒用某个用户身份上传数据。
3. 防止已截获请求被重复提交。
4. 防止同一用户通过多账号绑定或多设备上传导致榜单重复记录。
5. 对异常 Token 上传进行限流、审计和风控标记。

### 2.3 非目标

1. 不上传原始 AI 会话内容、prompt、completion、文件路径或项目源码。
2. 不承诺 100% 防止用户在自己设备上构造虚假本地统计；本期目标是防止未授权上传、重放、串号、批量伪造和普通手写请求。
3. 不在本期实现企业组织榜、团队榜或付费会员体系。
4. 不在本期实现多区域多活部署。
5. 榜单不展示费用、不上传费用、不按费用排名；费用是用户本地可自定义估算值，对社区榜无可信意义。

---

## 3. 关键优化点

### 3.1 从匿名上报改为登录用户上报

原方案“匿名上报”无法满足防重复、防封禁、账号合并和一一对应要求。新方案使用站内 `user_id` 作为唯一主体：

- 排行榜记录必须绑定 `user_id`。
- 同一周期内 `leaderboard_entries(user_id, period_type, period_start)` 唯一。
- 账号登录方式通过 `user_id` 归并，不直接决定榜单身份。

### 3.2 从静态站点升级为 SvelteKit Node 服务

`packages/site` 当前使用 `@sveltejs/adapter-static` 构建静态站点，并由 nginx Docker 镜像托管。Token 天梯榜需要服务端 API、OAuth callback、session、数据库连接和管理接口，因此需要升级为：

- `packages/site` 使用 SvelteKit Node adapter。
- Docker 镜像运行 Node server。
- `aiusage.jtanx.com` 同域提供页面和 API。
- 静态资源仍可由 SvelteKit 或前置反代缓存。

### 3.3 统一使用 PostgreSQL

本地开发、测试、生产统一使用 PostgreSQL，避免 SQLite 与 PostgreSQL 行为差异。

- 开发环境通过 Docker Compose 启动 PostgreSQL。
- 生产环境通过 `DATABASE_URL` 连接 PostgreSQL。
- 数据访问层使用 Repository/Service 边界，避免 SQL 分散在页面组件中。

### 3.4 使用设备密钥 + HMAC 签名上传

CLI 上传不只依赖登录态或普通 API Token。用户授权 CLI 后，站点为设备签发：

- `device_id`
- `device_secret`
- `user_id` 绑定关系
- 设备状态与最后使用时间

`device_secret` 只在签发时返回给 CLI 一次。服务端不得明文保存设备密钥，必须使用 `DEVICE_SECRET_ENCRYPTION_KEY` 加密保存为可解密密文，用于后续 HMAC 校验；同时可保存 `secret_hash` 用于审计和轮换识别。

设备密钥加密方案：

- 加密算法：AES-256-GCM（提供认证加密，同时保护机密性和完整性）。
- `DEVICE_SECRET_ENCRYPTION_KEY` 为 32 字节密钥，以 64 字符 hex 编码或 44 字符 base64 编码传入环境变量。
- 每次加密生成独立的 12 字节随机 IV（nonce），IV 与密文一同存储在 `secret_encrypted` 字段中（格式：`iv_base64:ciphertext_base64:tag_base64`）。
- `secret_hash` 使用 SHA-256(`device_secret`) 生成，用于审计识别，不用于 HMAC 计算。
- 本期不实现密钥自动轮换；若 `DEVICE_SECRET_ENCRYPTION_KEY` 泄露，必须撤销全部设备并要求用户重新授权。

CLI 每次上传时使用 HMAC-SHA256 对规范化请求签名，服务端校验签名、时间窗、nonce 和幂等键。

安全边界：服务端可以验证上传来自已授权设备凭证，并验证请求未被篡改或重放；但无法强证明本地执行程序一定是未修改的官方 `@juliantanx/aiusage` npm 包。用户如果取得本机 `device_secret`，仍可能手写兼容协议的上传脚本。本期通过官方 CLI 授权、设备密钥、HMAC 签名、版本校验、限流和风控降低伪造风险；代码签名、远程证明或可信执行环境不纳入本期。

---

## 4. 用户角色

| 角色 | 能力 |
|---|---|
| 游客 | 访问官网首页、文档和公开排行榜；不能上传数据或查看个人上传状态 |
| 普通用户 | 注册、登录、绑定 OAuth、授权 CLI、上传数据、查看自己的上传状态和排行榜增强信息 |
| 被封禁用户 | 可以登录查看封禁提示；不能上传；不出现在排行榜 |
| 管理员 | 查看用户、封禁/解封用户、查看上传审计、处理异常数据 |

本期仅使用 `user` / `admin` 两个角色。`role` 字段使用 enum 类型存储，便于未来扩展更细粒度的角色（如审核员、只读管理员等）。

---

## 5. 功能需求

### 5.1 账号注册

#### 5.1.1 用户名/密码注册

注册表单字段：

- `username`：必填，站内唯一，3-32 字符。
- `email`：必填，站内唯一，需格式校验。
- `password`：必填，最少 8 字符。

注册成功后：

- 创建 `users` 记录。
- 默认 `display_name = username`。
- 密码使用 Argon2id 或 bcrypt 哈希存储。
- `email_verified = false`，完成邮箱验证后才改为 true。
- 用户状态默认为 `active`。

邮箱验证规则：

- 用户名/密码注册后应发送邮箱验证链接。
- 未验证邮箱可用于登录，但不能用于 OAuth 自动合并，也不能通过 `ADMIN_EMAILS` 自动获得管理员权限。
- 如果本期部署时暂不配置邮件发送，则密码注册用户的 `email_verified` 保持 false，只能通过已验证 OAuth 邮箱触发自动合并或管理员初始化。
- 如果配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`、`EMAIL_FROM`，则启用邮箱验证邮件发送。

#### 5.1.2 用户名规则

- `username` 是站内唯一身份标识。
- 用户名可用于登录。
- 用户名后续可修改，但必须保持唯一。
- 排行榜展示优先使用 `display_name`，不展示邮箱。
- `display_name` 默认等于 `username`，不强制唯一。

### 5.2 登录

站点必须支持三种登录方式：

1. 用户名/密码登录。
2. GitHub OAuth 登录。
3. Linux Do OAuth/OIDC 登录。

用户名/密码登录支持：

- `username + password`
- `email + password`

OAuth 登录使用 Authorization Code Flow。Linux Do 接入以官方 [Linux Do Connect](https://connect-docs.linux.do/) 文档为准，OAuth/OIDC endpoint 不在代码中硬编码，通过环境变量配置。

建议环境变量见“10.2 必需环境变量”。

### 5.3 账号合并与 OAuth 绑定

#### 5.3.1 身份表设计

OAuth 身份不直接创建榜单主体，而是绑定到统一 `users.id`。

- `users`：站内用户。
- `user_identities`：第三方身份，包含 `provider`、`provider_user_id`、`email`、`email_verified`。

#### 5.3.2 自动合并规则

OAuth 首次登录时：

1. 如果 `provider + provider_user_id` 已存在，登录对应用户。
2. 如果 provider 返回已验证邮箱，并且该邮箱已属于某个 `email_verified = true` 的站内用户，则绑定到该用户。
3. 如果邮箱缺失、未验证或存在冲突，则不自动合并；OAuth 首次登录创建独立用户，后续只能通过已登录状态下的手动绑定合并身份。
4. 如果自动生成的用户名已占用，追加短后缀，例如 `julian-8f3a`。

显式说明：密码注册用户的 `email_verified` 默认为 `false`（见 5.1.1），因此不会被 OAuth 自动合并。密码注册用户如需关联 OAuth 账号，必须登录后在设置页手动绑定。这是有意设计，防止未验证邮箱被恶意利用进行账号抢占。

#### 5.3.3 手动绑定规则

用户登录后可在设置页绑定 GitHub 或 Linux Do。

- 一个 OAuth identity 只能绑定一个用户。
- 一个用户可绑定多个 provider。
- 绑定前必须确认当前用户已登录。
- 绑定冲突时拒绝操作并提示该第三方账号已被其他用户绑定。

账号合并规则：

- OAuth identity 已绑定到其他用户时，普通手动绑定不得直接抢占该 identity。
- 如用户确实需要合并两个站内账号，必须走独立“账号合并”流程或管理员后台处理。
- 账号合并前，用户必须证明同时拥有源账号和目标账号，或由管理员根据审计证据操作。
- 合并时迁移 `user_identities`、`user_devices`、`upload_requests`；`leaderboard_entries` 按目标用户重新执行 `user_id + period_type + period_start` 快照覆盖规则。
- 合并完成后源用户标记为 `deleted`，不得继续登录或出现在排行榜。

### 5.4 CLI 授权

`@juliantanx/aiusage` 新增 Token 天梯榜相关命令，命令名可在实现阶段最终确定，但 PRD 推荐：

```bash
aiusage login
aiusage upload
aiusage upload-status
aiusage logout
```

#### 5.4.1 授权流程

推荐使用浏览器授权 + 设备码兑换流程：

1. 用户运行 `aiusage login`。
2. CLI 本地生成 `device_verifier`，并计算 `device_challenge = base64url(sha256(device_verifier))`。
3. CLI 调用 `POST /api/cli/device/start` 创建授权请求，传入设备名称、CLI 版本和 `device_challenge`。
4. 服务端返回 `verification_url`、`user_code`、`device_request_id`、过期时间和轮询间隔。
5. CLI 打开浏览器访问 `verification_url`，或提示用户手动输入 URL 和 `user_code`。
6. 用户在站点登录并进入 `/cli/authorize` 页面，确认授权当前设备上传聚合统计。
7. 站点调用 `POST /api/cli/device/approve`，将授权请求绑定到当前 `user_id`。
8. CLI 调用 `POST /api/cli/device/complete` 轮询或兑换授权结果，并提交 `device_request_id + device_verifier`。
9. 服务端校验 `base64url(sha256(device_verifier)) == device_challenge`，防止授权结果被其他客户端抢先兑换。
10. 授权成功后，站点生成新的 `device_id + device_secret`，只在该响应中返回一次。
11. CLI 保存 `device_id` 与 `device_secret`，后续上传使用设备凭证签名请求。

凭证本地保存要求：

- 优先使用系统 keychain/keyring。
- 无 keychain 时保存到 AIUsage 配置目录，文件权限限制为当前用户可读写。
- `device_secret` 不写入日志，不进入导出文件。

#### 5.4.2 设备管理

站点需要提供设备管理能力：

- 查看已授权设备列表。
- 显示设备名称、创建时间、最后上传时间、状态。
- 支持撤销设备。
- 被撤销设备无法继续上传。

#### 5.4.3 设备迁移与重新授权

同一用户可以授权多个上传设备，但排行榜身份始终按 `user_id` 聚合，不按设备生成独立榜单记录。

换设备上传时：

1. 用户在新设备运行 `aiusage login`。
2. 用户在浏览器中登录同一个站内账号并确认授权。
3. 站点为新设备签发新的 `device_id + device_secret`。
4. 新设备后续使用自己的设备密钥签名上传。
5. 服务端按 `user_id + period_type + period_start` upsert 榜单记录，避免同一用户多设备重复占榜。

设备撤销规则：

- 撤销是不可逆操作，表示旧设备凭证不再可信。
- 被撤销的 `device_id + device_secret` 永久不能再用于上传。
- 被撤销设备后续上传返回 `device_revoked`。
- 撤销设备不删除该设备过去产生的上传审计，也不删除已归属到 `user_id` 的历史榜单记录。
- 如果用户后续还需要在旧设备上传，必须在旧设备重新运行 `aiusage login`，生成新的设备记录和新的设备密钥。
- 设备名称可以复用，例如仍显示为 “MacBook Pro”，但内部必须是新的 `device_id`。

数据完整性提示：

- 本期 CLI 必须上传“完整周期快照”，而不是增量累加，减少多设备重复计算风险。
- 同一 `user_id + period_type + period_start` 的新 accepted upload 覆盖 `leaderboard_entries` 中该周期的数值。
- 服务端不对同一用户同一周期的多次上传做累加；如需未来支持增量上传，必须先引入本地记录 ID 或上传批次 ID 去重模型。
- 如果新设备没有旧设备历史数据，CLI 应提示用户当前只会上传本设备可见的聚合数据。
- 如需完整历史，用户应先通过 AIUsage 现有 sync 能力同步本地数据，或在旧设备完成上传。

### 5.5 数据上传

#### 5.5.1 上传范围

CLI 只上传 Token 聚合统计，不上传原始内容或本地成本估算。

上传字段包括：

- 统计周期：`period_type`、`period_start`、`period_end`
- Token 总量：`total_tokens`
- AIUsage CLI 版本：`client_version`
- 客户端平台信息：`client_platform`（值为 `macos`、`linux`、`windows` 之一）
- 数据 schema 版本：`schema_version`
- `token_snapshot_hash`：CLI 对本次 Token 总量快照生成的稳定 hash，用于审计重复上传和异常变更

`token_snapshot_hash` 生成口径：

```text
sha256(canonical_json({
  period_type,
  period_start,
  period_end,
  total_tokens,
  schema_version
}))
```

hash 输入不得包含原始日志、路径、项目、模型、工具、费用或任何非 Token 榜单必要字段。

禁止上传字段：

- prompt/completion 内容
- 会话标题或消息内容
- 本地文件路径
- Git 仓库远程地址
- 用户代码片段
- 原始日志全文
- 费用、价格表、汇率或任何本地自定义成本估算字段
- 工具分布、工具调用统计、模型分布、项目维度或其他非 Token 消耗量统计

#### 5.5.2 上传粒度

本期支持：

- 日榜：UTC 自然日。
- 周榜：UTC ISO week，默认从周一开始。
- 月榜：UTC 自然月。
- 年榜：UTC 自然年。
- 总榜：用户历史累计聚合。

服务端必须记录聚合使用的时区策略。本期统一使用 UTC，UI 可显示用户本地时间说明，但不得改变服务端排名周期。社区公开榜不支持用户自定义时区或周起始日，否则不同用户统计窗口不可比。

时区显示规则：

- 榜单页面使用浏览器 `Intl.DateTimeFormat().resolvedOptions().timeZone` 自动检测用户本地时区。
- 榜单时间展示格式示例："2026-05-29 (UTC+8)"，同时标注 UTC 原始日期。
- 用户可在设置页手动覆盖时区偏好，存储在 `users.timezone` 字段中（如 `Asia/Shanghai`）。
- 时区仅影响前端显示，不改变服务端存储的 UTC 时间和排名计算。

周期边界规则：

- `daily`：`period_start` 为 UTC 当日 `00:00:00.000Z`。
- `weekly`：`period_start` 为该 ISO week 周一 `00:00:00.000Z`，周榜默认从周一开始。
- `monthly`：`period_start` 为 UTC 当月 1 日 `00:00:00.000Z`。
- `yearly`：`period_start` 为 UTC 当年 1 月 1 日 `00:00:00.000Z`。
- `all_time`：`period_start` 固定为 `1970-01-01T00:00:00.000Z`。
- `period_end` 为该周期结束时间；`all_time` 的 `period_end` 为 CLI 本地数据中最后一条 AI 会话记录的时间戳（即该快照覆盖的最新数据时间），而非上传时间。
- 所有榜单周期均使用 `user_id + period_type + period_start` 唯一约束。

#### 5.5.3 上传 API

推荐接口：

```http
POST /api/leaderboard/uploads
```

请求 body 结构：

```json
{
  "schema_version": 1,
  "client_version": "1.0.0",
  "client_platform": "macos",
  "snapshots": [
    {
      "period_type": "daily",
      "period_start": "2026-05-29T00:00:00.000Z",
      "period_end": "2026-05-29T23:59:59.999Z",
      "total_tokens": 123456,
      "token_snapshot_hash": "sha256:..."
    }
  ]
}
```

字段层级：

- `schema_version`、`client_version`、`client_platform` 是请求级字段。
- `period_type`、`period_start`、`period_end`、`total_tokens`、`token_snapshot_hash` 是 snapshot 级字段。
- HMAC 签名覆盖完整 request body。

请求头：

```http
X-AIUsage-Device-Id: <device_id>
X-AIUsage-Timestamp: <unix_ms>
X-AIUsage-Nonce: <random_nonce>
X-AIUsage-Idempotency-Key: <stable_key>
X-AIUsage-Signature: hmac-sha256=<signature>
```

签名内容使用规范化字符串：

```text
METHOD\n
PATH\n
BODY_SHA256\n
TIMESTAMP\n
NONCE\n
DEVICE_ID\n
IDEMPOTENCY_KEY
```

服务端校验：

1. `device_id` 存在且状态为 active。
2. 设备所属用户状态为 active。
3. timestamp 在允许时间窗内，建议 5 分钟。
4. nonce 未被同一设备使用过。
5. 使用 `device_id` 找到并解密 `secret_encrypted`，计算 HMAC 并与请求签名做常量时间比较。
6. body hash 与签名内容中的 `BODY_SHA256` 匹配。
7. 幂等键未被成功处理过；若已处理且 `payload_hash` 相同则返回同一结果，若已处理但 `payload_hash` 不同则拒绝。
8. payload schema 校验通过。使用字段白名单（`schema_version`、`client_version`、`client_platform`、`snapshots` 数组，以及 snapshot 内的 `period_type`、`period_start`、`period_end`、`total_tokens`、`token_snapshot_hash`），未知字段直接拒绝（返回 `payload_forbidden_field`）。
9. 上传值满足非负数、整数 token、合理 token 上限等边界校验。

#### 5.5.4 批量上传策略

一次上传请求可以包含多个周期快照，推荐 CLI 每次上传同一用户当前可见数据的 5 类快照：

- 当前日榜快照
- 当前周榜快照
- 当前月榜快照
- 当前年榜快照
- 总榜快照

服务端处理规则：

- 请求级 HMAC、nonce、timestamp 和 idempotency 校验通过后，再逐条校验 snapshots。
- 每个 snapshot 独立执行 schema 校验、周期边界校验和风控检测。
- 每个 accepted snapshot 按 `user_id + period_type + period_start` upsert。
- 同一请求内如某个 snapshot rejected，不影响其他合法 snapshot，响应中返回逐条结果。
- 同一请求内如某个 snapshot flagged，默认不进入公开榜，其他 accepted snapshot 可正常公开。
- 幂等键作用于整个请求；同一幂等键重试必须携带完全相同 payload。

#### 5.5.5 上传错误码

上传 API 使用稳定错误码，便于 CLI 给出明确提示。

| 错误码 | 含义 | CLI 行为 |
|---|---|---|
| `device_not_found` | 设备不存在 | 提示重新登录 |
| `device_revoked` | 设备已撤销 | 提示重新执行 `aiusage login` |
| `user_banned` | 用户已封禁 | 停止上传并展示封禁提示 |
| `invalid_signature` | HMAC 签名错误 | 停止重试，提示重新登录或检查本地凭证 |
| `timestamp_expired` | timestamp 超出时间窗 | 提示校准系统时间后重试 |
| `nonce_reused` | nonce 已使用 | 重新生成 nonce 后重试一次 |
| `idempotency_conflict` | 同一幂等键对应不同 payload | 停止重试，生成新上传批次 |
| `rate_limited` | 命中限流 | 按 `retry_after` 延迟重试 |
| `unsupported_schema_version` | schema 版本不支持 | 提示升级 CLI |
| `client_version_too_old` | CLI 版本过旧 | 提示升级 CLI |
| `payload_too_large` | payload 超过大小限制 | 停止上传并提示反馈问题 |
| `payload_forbidden_field` | payload 包含禁止字段 | 停止上传并提示升级或反馈问题 |
| `invalid_period_boundary` | 周期边界不符合 UTC 规则 | 停止上传并提示升级 CLI |
| `invalid_token_value` | token 值非法 | 停止上传并提示本地数据异常 |
| `flagged_for_review` | 数据进入风控审核 | 告知用户等待审核 |

#### 5.5.6 CLI 重试策略

CLI 对上传失败的处理必须区分可重试与不可重试错误：

**可重试错误**（指数退避，基础间隔 5 秒，最大间隔 60 秒，最多重试 3 次）：

- `rate_limited`：按响应中 `retry_after` 字段指定的秒数等待后重试。
- `timestamp_expired`：提示用户校准系统时间后重试。
- `nonce_reused`：重新生成 nonce 后重试一次。
- 网络超时或 5xx 服务端错误。

**不可重试错误**（立即停止，提示用户操作）：

- `device_not_found`、`device_revoked`：提示重新执行 `aiusage login`。
- `user_banned`：停止上传并展示封禁提示。
- `invalid_signature`：提示重新登录或检查本地凭证。
- `idempotency_conflict`：停止重试，生成新上传批次。
- `unsupported_schema_version`、`client_version_too_old`：提示升级 CLI。
- `payload_too_large`、`payload_forbidden_field`：提示反馈问题。
- `invalid_period_boundary`、`invalid_token_value`：提示本地数据异常。

**离线场景**：

- CLI 在无网络时本地缓存待上传快照，联网后自动上传。
- 离线缓存不超过 7 天的快照数据，超过 7 天的旧快照不再上传。
- 离线缓存使用本地文件存储，文件权限限制为当前用户可读写。

### 5.6 防篡改、风控与人工审计

#### 5.6.1 防护能力

本期必须实现：

- HMAC 请求签名。
- nonce 防重放。
- timestamp 时间窗。
- idempotency key 防重复处理。
- 用户级、设备级、IP 级限流。
- 设备撤销不可恢复，旧设备如需再次上传必须重新授权。
- 用户封禁。
- 上传审计日志。
- 异常值检测。

#### 5.6.2 rejected 与 flagged 语义

`rejected` 表示协议、安全或 schema 不合法，服务端拒绝处理，不进入榜单。

典型 rejected 场景：

- HMAC 签名错误。
- nonce 重放。
- timestamp 过期。
- schema_version 不支持。
- payload 包含禁止字段。
- period 边界不符合 UTC 规则。
- total_tokens 不是非负整数。

`flagged` 表示请求格式合法、签名有效，但数据或行为可疑，需要人工审计。flagged snapshot 默认不进入公开榜，不影响用户登录。

典型 flagged 场景：

- 单周期 total_tokens 超过配置阈值。
- 同一用户短时间内频繁覆盖同一周期。
- 新快照相比上一 accepted 快照出现大幅跳变。
- 新快照 total_tokens 明显低于上一 accepted 值。
- 同一用户多个设备短时间上传同一周期且数值差异很大。
- client_version 过旧但仍可解析。
- 上传行为接近限流阈值或出现多 IP/多设备异常切换。
- 管理员手动标记。

#### 5.6.3 审计原因码

flagged 和 rejected 必须记录结构化原因码和人类可读说明。

建议原因码：

| reason_code | 说明 |
|---|---|
| `token_exceeds_daily_threshold` | 日榜 token 超过阈值 |
| `token_exceeds_weekly_threshold` | 周榜 token 超过阈值 |
| `token_exceeds_monthly_threshold` | 月榜 token 超过阈值 |
| `token_exceeds_yearly_threshold` | 年榜 token 超过阈值 |
| `token_exceeds_all_time_threshold` | 总榜 token 超过阈值 |
| `frequent_period_overwrite` | 短时间频繁覆盖同一周期 |
| `large_token_jump` | total_tokens 相比上一 accepted 快照大幅增长 |
| `token_regression` | total_tokens 相比上一 accepted 快照明显倒退 |
| `multi_device_conflict` | 多设备同周期快照冲突 |
| `client_version_old` | CLI 版本过旧但仍可解析 |
| `manual_admin_flag` | 管理员手动标记 |
| `rate_limit_abuse` | 上传行为接近或触发滥用阈值 |
| `payload_forbidden_field` | payload 包含禁止字段 |
| `invalid_period_boundary` | 周期边界非法 |
| `invalid_token_value` | token 值非法 |

`reason_message` 示例：

```json
{
  "reason_code": "large_token_jump",
  "reason_message": "daily total_tokens increased from 120000 to 9800000 within 10 minutes"
}
```

#### 5.6.4 人工审计处理

管理员可以对 flagged snapshot 执行：

- `approve`：确认数据可公开，将 snapshot 应用到 `leaderboard_entries`，对应 entry `visibility = public`。
- `reject`：确认数据无效，snapshot 保留为 rejected，不进入榜单。
- `hide`：不公开该 snapshot 或对应 entry，但保留审计记录。
- `ban_user`：封禁用户，并隐藏该用户所有公开榜单记录。

所有审计动作必须写入 `admin_audit_logs`，包括管理员、动作、目标、原因和时间。

#### 5.6.5 审计页面信息

管理员审计页面展示：

- 用户 ID / display_name
- 设备 ID / 设备名称
- period_type
- period_start / period_end
- total_tokens
- 上一次 accepted total_tokens
- 本次与上次差值和倍率
- client_version
- schema_version
- ip_hash
- status
- reason_code
- reason_message
- created_at
- 管理员操作历史

管理员审计页面不得展示：

- 原始日志
- prompt/completion
- 本地路径
- 项目名
- 工具/模型分布

#### 5.6.6 用户上传状态

用户可以查看自己的上传状态。CLI 的 `aiusage upload-status` 和站点设置页应展示：

- 最近上传时间
- 每个周期 snapshot 的 accepted / flagged / rejected 状态
- flagged 的简短说明，例如“数据异常，等待人工审核”
- rejected 的错误码和建议操作

用户只能查看自己的上传状态，不能查看其他用户的审计详情。

#### 5.6.7 异常检测

服务端对上传数据进行基础风控：

- 单次上传 token 数超过阈值时标记 `flagged`。
- 同一用户短时间内频繁覆盖历史周期时标记 `flagged`。
- client_version 过旧时可拒绝上传或提示升级。
- schema_version 不支持时拒绝上传。
- token 总量超过合理阈值时标记 `flagged`。

被标记的记录：

- 可以进入审计队列。
- 默认不影响用户登录。
- 是否进入公开榜由配置决定；本期默认不进入公开榜，待管理员确认后才可转为 public。

### 5.7 排行榜

#### 5.7.1 页面访问

排行榜页面位于：

```text
https://aiusage.jtanx.com/leaderboard
```

访问规则：

- 未登录用户可以查看公开榜单列表。
- 被封禁用户可以查看封禁提示，但不展示榜单数据。
- 登录用户可查看日榜、周榜、月榜、年榜、总榜，并额外看到自己的排名信息。
- `leaderboard_visibility = private` 的用户不出现在公开榜单，但本人仍可在个人设置中查看自己的上传状态。

#### 5.7.2 排名规则

默认按 `total_tokens` 降序排序。

并列规则：

1. `total_tokens` 高者排名靠前。
2. `updated_at` 早者靠前。
3. `user_id` 字典序靠前者靠前，保证排序稳定。

#### 5.7.3 去重规则

排行榜必须保证同一用户在同一榜单周期只有一条记录：

```text
unique(user_id, period_type, period_start)
```

多设备上传同一周期数据时：

- 服务端按用户维度聚合。
- 同周期重复上传使用 upsert 更新该用户记录。
- 新 accepted upload 覆盖该周期旧值，不与旧值累加。
- 不按 device_id 生成独立榜单记录。

#### 5.7.4 展示字段

榜单展示：

- 排名
- 用户 display_name
- 头像
- 总 Token
- 最后更新时间

不展示：

- 邮箱
- 设备 ID
- IP
- 原始记录 ID
- 任何会话内容

#### 5.7.5 排行榜查询与分页

排行榜查询采用分页策略：

- 默认每页 50 条记录，最大每页 100 条。
- 使用 cursor-based 分页。当前实现使用稳定排名游标，并按 `total_tokens DESC, updated_at ASC, user_id ASC` 计算全局名次。
- 响应包含 `next_cursor` 字段，客户端传入 `cursor` 参数获取下一页。
- 除分页列表外，登录用户额外返回自己的排名和数据（即使不在当前页内），方便用户了解自己的位置；匿名请求该字段为 null。
- 排行榜数据缓存 60 秒，减少数据库压力；缓存仅作用于列表查询，用户自身排名实时计算。

### 5.8 用户封禁

#### 5.8.1 封禁状态

用户状态：

- `active`
- `banned`
- `deleted`

封禁用户：

- 无法上传数据。
- 不出现在排行榜。
- 已存在榜单记录在查询时过滤，或由后台任务标记隐藏。
- 登录后看到封禁提示。

#### 5.8.2 管理员操作

管理员可执行：

- 封禁用户。
- 解封用户。
- 查看用户上传历史。
- 查看被风控标记的上传。
- 隐藏或恢复某条榜单记录。

所有管理员操作写入审计日志。

### 5.9 Session、CSRF 与管理员初始化

#### 5.9.1 Session 安全

站点登录态使用安全 cookie + 服务端 session 存储。

Session 存储方案：

- 使用 PostgreSQL 存储 session 数据，避免引入 Redis 依赖。
- 建议 `sessions` 表：`sid`（主键）、`user_id`、`data`（JSON）、`expires_at`。
- 应用启动时自动创建 `sessions` 表（如不存在），使用 SvelteKit hooks 读写 session。
- 过期 session 由后台清理任务定期删除（与 nonce 清理复用同一 cron 任务）。
- 多实例部署时共享同一 PostgreSQL，session 一致性由数据库保证。

Cookie 要求：

- `HttpOnly`
- `Secure`，生产环境必须开启
- `SameSite=Lax` 或更严格
- session id 必须使用密码学安全随机数生成
- 登录成功后必须轮换 session id，防止 session fixation
- 退出登录时服务端 session 失效，客户端 cookie 清除

#### 5.9.2 CSRF 与 OAuth 防护

所有会改变服务端状态的浏览器表单/API 必须具备 CSRF 防护，包括：

- 注册、登录、退出
- OAuth 绑定/解绑
- CLI 设备批准
- 设备撤销
- 管理员封禁/解封/隐藏榜单记录

OAuth 登录和绑定必须校验 `state`。如 provider 支持 PKCE，应启用 PKCE；不支持时必须使用 state + redirect URI 严格校验。

CLI 签名上传 API 使用 HMAC header 认证，不依赖浏览器 cookie，不需要 CSRF token，但仍必须校验 origin-independent 的签名、timestamp、nonce 和 idempotency key。

#### 5.9.3 安全响应头

所有页面和 API 响应必须包含以下安全头：

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`（HSTS，强制 HTTPS）
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;`（CSP，限制资源加载来源；具体策略可在实现阶段调整）
- `X-Content-Type-Options: nosniff`（防止 MIME 类型嗅探）
- `X-Frame-Options: DENY`（防止点击劫持）
- `Referrer-Policy: strict-origin-when-cross-origin`
- 上传 API 必须校验 `Content-Type: application/json`，拒绝其他 Content-Type。

#### 5.9.4 管理员初始化

第一批管理员通过环境变量指定：

```env
ADMIN_EMAILS=admin@example.com,owner@example.com
```

规则：

- 用户注册或 OAuth 登录后，如果其已验证邮箱命中 `ADMIN_EMAILS`，自动授予 `admin` 角色。
- 未验证邮箱不得自动授予管理员权限。
- 后续管理员可在后台授予或撤销其他用户的管理员角色。
- 管理员角色变更必须写入 `admin_audit_logs`。

### 5.10 数据增长与维护策略

当前榜单数据增长是可控的线性增长，不应设计成按原始记录、会话或消息上传。服务端只保存用户维度的周期快照和必要审计数据。

### 5.10.1 榜单主表增长上限

`leaderboard_entries` 只按 `user_id + period_type + period_start` 保存周期快照。每个活跃用户每年最多新增：

- 日榜：366 条
- 周榜：53 条
- 月榜：12 条
- 年榜：1 条
- 总榜：1 条固定记录，后续覆盖

即每用户每年约 432 条榜单记录，是线性增长，不随本地会话数、API 调用数、工具调用数或模型数量增长。

### 5.10.2 上传频率限制

为避免 `upload_requests` 审计表无限快速增长：

- CLI 默认每日自动上传最多 1 次，可允许用户手动触发。
- 默认服务端限流：每设备每小时最多 10 次上传请求、每用户每天最多 50 次上传请求、每 IP 每小时最多 100 次上传请求。
- 同一设备同一周期重复上传使用幂等键和快照覆盖，不新增多条榜单记录。
- 服务端必须设置用户级、设备级、IP 级 rate limit。
- 对同一用户同一周期的频繁覆盖上传进行风控标记。

### 5.10.3 Payload 大小限制

上传 payload 只允许包含 Token 消耗量字段和必要元数据，禁止包含工具、模型、项目等分布统计。服务端必须校验 payload JSON 大小上限，超限拒绝。

### 5.10.4 审计与临时数据保留

不同表采用不同保留策略：

- `leaderboard_entries`：长期保留，用于历史榜单。
- `upload_requests`：默认保留 180 天；超过期限可归档或删除，仅保留聚合后的榜单结果。
- `upload_snapshots`：默认随 `upload_requests` 保留 180 天；flagged/rejected 记录可按审计需要延长保留。
- `upload_nonces`：只需覆盖重放时间窗和少量延迟，默认保留 24 小时后清理。
- `admin_audit_logs`：长期保留，或至少保留 2 年。
- 被拒绝的异常上传可只保留摘要、hash、原因和时间，不保留完整 payload。

清理触发方式：

- 使用 PostgreSQL `pg_cron` 扩展或应用层定时任务（Node.js `node-cron`），每日 UTC 03:00 执行清理。
- 清理任务先 DELETE 过期记录，再 VACUUM 相关表以回收空间。
- 清理任务执行日志写入 `admin_audit_logs`，记录清理表名、删除行数和执行耗时。
- 若 `pg_cron` 不可用，降级为应用层 `node-cron`，通过 SvelteKit server startup 注册定时任务。

### 5.10.5 数据库索引与清理任务

必须建立面向查询和清理的索引：

- `leaderboard_entries(period_type, period_start, visibility, total_tokens DESC)`
- `leaderboard_entries(user_id, period_type, period_start)` unique
- `upload_requests(device_id, idempotency_key)` unique
- `upload_snapshots(upload_request_id, period_type, period_start)` unique
- `upload_snapshots(user_id, period_type, period_start)`
- `upload_snapshots(status, created_at)`
- `upload_requests(created_at)`
- `upload_nonces(created_at)`
- `user_devices(user_id, status)`

站点需要后台清理任务或管理命令：

- 清理过期 nonce。
- 清理或归档过期 upload_requests。
- 重新计算指定用户/周期的榜单快照。
- 检查异常膨胀的 upload payload。

### 5.10.6 运维阈值

PRD 默认按 1000+ 用户设计。若未来达到更高规模，可按以下阈值演进：

- `upload_requests` 超过百万级：按月份分区或归档。
- `upload_snapshots` 超过百万级：随 upload_requests 按月份分区或归档。
- `leaderboard_entries` 超过千万级：按 `period_type` 或时间分区。
- 排行榜查询变慢：为当前周期榜单增加缓存或物化视图。
- 上传高峰明显：将上传处理改为队列异步写入，但 HMAC 校验和幂等检查仍同步执行。

---

## 6. 数据模型

### 6.1 users

| 字段 | 说明 |
|---|---|
| id | 主键 |
| username | 唯一用户名 |
| email | 唯一邮箱 |
| email_verified | 邮箱是否已验证 |
| password_hash | 密码哈希，可为空 |
| display_name | 榜单展示名 |
| avatar_url | 头像 |
| leaderboard_visibility | public/private，控制用户是否出现在公开榜单 |
| role | user/admin |
| status | active/banned/deleted |
| created_at | 创建时间 |
| updated_at | 更新时间 |
| banned_at | 封禁时间 |
| ban_reason | 封禁原因 |
| timezone | 用户偏好时区，如 `Asia/Shanghai`，可为空（自动检测） |

### 6.2 user_identities

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 关联 users.id |
| provider | github/linux_do |
| provider_user_id | provider 内用户 ID |
| provider_username | provider 用户名 |
| email | provider 返回邮箱 |
| email_verified | 邮箱是否已验证 |
| raw_profile | 脱敏后的 profile JSON |
| created_at | 创建时间 |

唯一约束：

```text
unique(provider, provider_user_id)
```

### 6.3 user_devices

| 字段 | 说明 |
|---|---|
| id | device_id |
| user_id | 关联 users.id |
| name | 设备名称 |
| secret_encrypted | 使用 `DEVICE_SECRET_ENCRYPTION_KEY` 加密后的 device_secret，用于 HMAC 校验 |
| secret_hash | device_secret 哈希，用于审计、识别和轮换，不用于 HMAC 计算 |
| status | active/revoked |
| created_at | 创建时间 |
| last_used_at | 最后使用时间 |
| revoked_at | 撤销时间 |

### 6.4 upload_nonces

| 字段 | 说明 |
|---|---|
| device_id | 设备 ID |
| nonce | 随机 nonce |
| created_at | 创建时间 |

唯一约束：

```text
unique(device_id, nonce)
```

nonce 记录可设置 TTL 清理。

### 6.5 upload_requests

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 用户 ID |
| device_id | 设备 ID |
| idempotency_key | 幂等键 |
| payload_hash | payload hash |
| status | accepted/rejected/flagged |
| result_summary | 批量 snapshots 的处理结果摘要 |
| rejection_reason | 拒绝原因 |
| client_version | CLI 版本 |
| client_platform | 客户端平台：macos/linux/windows |
| schema_version | schema 版本 |
| ip_hash | 使用 `IP_HASH_SECRET` 对规范化 IP 做 HMAC 后的 hash |
| created_at | 创建时间 |

唯一约束：

```text
unique(device_id, idempotency_key)
```

`upload_requests.status` 表示请求级处理状态：

- `accepted`：请求通过认证且至少一个 snapshot accepted。
- `rejected`：请求级认证、签名、schema 或幂等校验失败，未处理 snapshots。
- `flagged`：请求通过认证，但全部 snapshots 均进入审核或存在请求级异常。

### 6.6 upload_snapshots

`upload_snapshots` 记录批量上传中每个周期快照的独立处理结果，解决单个请求内 accepted/rejected/flagged 混合状态的审计问题。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| upload_request_id | 关联 upload_requests.id |
| user_id | 用户 ID |
| device_id | 设备 ID |
| period_type | daily/weekly/monthly/yearly/all_time |
| period_start | 周期开始 |
| period_end | 周期结束 |
| total_tokens | 总 Token |
| token_snapshot_hash | Token 快照 hash |
| status | accepted/rejected/flagged |
| reason_code | 结构化原因码 |
| reason_message | 人类可读原因说明 |
| review_status | pending/approved/rejected/hidden |
| reviewed_by | 管理员用户 ID |
| reviewed_at | 审计处理时间 |
| review_note | 管理员审计备注 |
| leaderboard_entry_id | accepted 或 approved 后关联的 leaderboard_entries.id |
| created_at | 创建时间 |

建议约束和索引：

```text
unique(upload_request_id, period_type, period_start)
index(user_id, period_type, period_start)
index(status, created_at)
```

`review_status` 状态机：

- `status = accepted` 的 snapshot：`review_status` 为 `null`（无需审核）。
- `status = flagged` 的 snapshot：`review_status` 初始为 `pending`。
- `pending` → `approved`：管理员审核通过，snapshot 数据应用到 `leaderboard_entries`（`visibility = public`）。
- `pending` → `rejected`：管理员审核拒绝，snapshot 保持 flagged 状态，不进入榜单。
- `pending` → `hidden`：管理员隐藏，保留审计记录但不公开。
- `status = rejected` 的 snapshot：`review_status` 为 `null`（协议级拒绝，无需人工审核）。

### 6.7 leaderboard_entries

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 用户 ID |
| period_type | daily/weekly/monthly/yearly/all_time |
| period_start | 周期开始 |
| period_end | 周期结束 |
| total_tokens | 总 Token |
| visibility | public/hidden/flagged |
| source_snapshot_id | 最近一次影响该 entry 的 upload_snapshots.id，完整历史通过 upload_snapshots / upload_requests 查询 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

唯一约束：

```text
unique(user_id, period_type, period_start)
```

### 6.8 admin_audit_logs

| 字段 | 说明 |
|---|---|
| id | 主键 |
| admin_user_id | 管理员用户 ID |
| action | 操作类型 |
| target_type | users/leaderboard_entries/upload_requests |
| target_id | 目标 ID |
| reason | 操作原因 |
| created_at | 创建时间 |

### 6.9 sessions

| 字段 | 说明 |
|---|---|
| sid | 主键，session ID |
| user_id | 关联 users.id |
| data | session 数据（JSON） |
| expires_at | 过期时间 |

索引：

```text
index(expires_at)
```

过期 session 由定时任务清理（见 5.10.4 清理触发方式）。

---

## 7. 系统架构

### 7.1 站点架构

`packages/site` 改造为 SvelteKit Node 服务：

- 页面路由：官网、文档、登录、注册、排行榜、设置、管理员。
- API 路由：认证、OAuth callback、CLI 授权、上传、排行榜查询、管理操作。
- 数据库：PostgreSQL。
- Session：安全 cookie + 服务端 session 存储，所有浏览器状态变更操作启用 CSRF 防护。
- Docker：`juliantanx/aiusage-site` 镜像运行 Node server。

### 7.2 目录建议

```text
packages/site/src/lib/server/
  auth/
  db/
  leaderboard/
  uploads/
  oauth/
  admin/

packages/site/src/routes/
  login/
  register/
  leaderboard/
  settings/devices/
  admin/
  api/
    auth/
    oauth/
    cli/
    leaderboard/
```

### 7.3 CLI 改造范围

`@juliantanx/aiusage` 需要新增：

- CLI 授权命令。
- 设备凭证安全存储。
- 聚合上传 payload 构造。
- HMAC 签名。
- 上传状态查询。
- logout 撤销本地凭证。

---

## 8. API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 用户名/密码注册 |
| POST | `/api/auth/login` | 用户名/邮箱密码登录 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/oauth/github/start` | GitHub 登录开始 |
| GET | `/api/oauth/github/callback` | GitHub callback |
| GET | `/api/oauth/linux-do/start` | Linux Do 登录开始 |
| GET | `/api/oauth/linux-do/callback` | Linux Do callback |
| POST | `/api/cli/device/start` | CLI 创建设备授权请求 |
| GET | `/cli/authorize` | 用户确认 CLI 设备授权页面 |
| POST | `/api/cli/device/approve` | 登录用户批准设备授权 |
| POST | `/api/cli/device/complete` | CLI 轮询或兑换设备凭证 |
| POST | `/api/leaderboard/uploads` | CLI 签名上传聚合数据 |
| GET | `/api/leaderboard` | 查询排行榜 |
| GET | `/api/me/devices` | 查看设备列表 |
| DELETE | `/api/me/devices/:id` | 撤销设备，撤销后不可恢复 |
| GET | `/api/me/leaderboard/uploads` | 查看自己的上传状态和审核状态 |
| GET | `/api/admin/uploads` | 查看上传审计和 flagged snapshots |
| POST | `/api/admin/uploads/:snapshotId/approve` | 审核通过 flagged snapshot |
| POST | `/api/admin/uploads/:snapshotId/reject` | 审核拒绝 flagged snapshot |
| POST | `/api/admin/uploads/:snapshotId/hide` | 隐藏 snapshot 或对应榜单记录 |
| POST | `/api/admin/leaderboard/:id/hide` | 隐藏榜单记录 |
| POST | `/api/admin/leaderboard/:id/restore` | 恢复榜单记录 |
| POST | `/api/admin/users/:id/role` | 授予或撤销管理员角色 |
| POST | `/api/admin/users/:id/ban` | 封禁用户 |
| POST | `/api/admin/users/:id/unban` | 解封用户 |

---

## 9. 隐私与合规

1. 排行榜为用户主动 opt-in 功能。
2. CLI 首次上传前必须明确提示将上传哪些聚合字段。
3. 用户可随时撤销设备，停止后续上传；撤销不可恢复，如需继续使用该设备必须重新授权。
4. 用户可隐藏自己的榜单展示，设置 `leaderboard_visibility = private` 后不出现在公开榜单；历史上传审计仍按安全需要保留。
5. 公开页面不展示邮箱、设备、IP、原始日志、会话内容。
6. IP 地址只保存 HMAC hash 或用于短期限流，不长期保存明文 IP；不得直接使用 SHA256(IP)，必须使用 `HMAC(IP_HASH_SECRET, normalized_ip)`。

---

## 10. 部署要求

### 10.1 Docker 镜像

`juliantanx/aiusage-site` 需要从 nginx 静态镜像改为 Node 运行镜像。

运行时依赖：

- Node.js runtime
- PostgreSQL 连接
- `DEVICE_SECRET_ENCRYPTION_KEY` 加密保护设备密钥

### 10.2 必需环境变量

| 变量 | 格式 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | PostgreSQL 连接字符串 |
| `SESSION_SECRET` | 至少 32 字符的随机字符串 | Session cookie 签名密钥 |
| `DEVICE_SECRET_ENCRYPTION_KEY` | 64 字符 hex 编码（32 字节） | AES-256-GCM 加密设备密钥的主密钥 |
| `IP_HASH_SECRET` | 至少 32 字符的随机字符串 | HMAC 计算 IP hash 的密钥 |
| `SITE_URL` | URL | 站点公开地址，如 `https://aiusage.jtanx.com` |
| `ADMIN_EMAILS` | 逗号分隔的邮箱列表 | 自动授予管理员权限的已验证邮箱，空格会被 trim |
| `GITHUB_CLIENT_ID` | 字符串 | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | 字符串 | GitHub OAuth App Client Secret |
| `LINUX_DO_CLIENT_ID` | 字符串 | Linux Do OAuth Client ID |
| `LINUX_DO_CLIENT_SECRET` | 字符串 | Linux Do OAuth Client Secret |
| `LINUX_DO_AUTHORIZATION_URL` | URL | Linux Do OAuth 授权端点 |
| `LINUX_DO_TOKEN_URL` | URL | Linux Do OAuth Token 端点 |
| `LINUX_DO_USERINFO_URL` | URL | Linux Do OAuth UserInfo 端点 |
| `SMTP_HOST` | 主机名 | SMTP 服务器地址（可选，不配置则不发送邮件） |
| `SMTP_PORT` | 数字 | SMTP 端口，如 `587` |
| `SMTP_USER` | 字符串 | SMTP 用户名 |
| `SMTP_PASSWORD` | 字符串 | SMTP 密码 |
| `EMAIL_FROM` | 邮箱地址 | 发件人地址，如 `noreply@aiusage.jtanx.com` |
| `SENTRY_DSN` | URL（可选） | Sentry 错误追踪 DSN，不配置则仅写入本地日志 |
| `LOG_LEVEL` | `debug`/`info`/`warn`/`error`（可选） | 日志级别，默认 `info` |

### 10.3 本地开发

本地开发与生产同样使用 PostgreSQL。

推荐：

```bash
pnpm dev:site-db
pnpm --filter @aiusage/site dev
```

具体脚本可在实现阶段加入根 `package.json` 或 `packages/site/package.json`。

### 10.4 健康检查与可观测性

#### 健康检查

- 提供 `GET /api/health` 端点，返回 `{ status: "ok", db: "connected", uptime: <seconds> }`。
- 若数据库连接失败，返回 HTTP 503 和 `{ status: "error", db: "disconnected" }`。
- Docker 容器配置 HEALTHCHECK 指令调用该端点。

#### 日志

- 使用 JSON 结构化日志（推荐 `pino` 或 `winston` JSON format）。
- 每条日志包含 `timestamp`、`level`、`request_id`（用于链路追踪）。
- 生产环境日志级别默认 `info`，可通过 `LOG_LEVEL` 环境变量调整。
- 敏感信息（session id、device_secret、password）不得出现在日志中。

#### 错误上报

- 本期可选接入 Sentry 或类似错误追踪服务，通过 `SENTRY_DSN` 环境变量配置。
- 未配置时错误仅写入本地日志。

#### 关键指标

应用应记录以下指标（可通过日志或 Prometheus 格式暴露）：

- 上传成功率（accepted / total）。
- flagged 比例（flagged / total）。
- API 响应时间（P50 / P95 / P99）。
- 活跃设备数。
- 活跃用户数。

---

## 11. 测试要求

### 11.1 单元测试

- 用户名、邮箱、密码校验。
- OAuth 账号合并规则。
- HMAC canonical string 生成。
- HMAC 签名校验。
- 只允许上传 Token 消耗量字段，拒绝费用、工具、模型、项目等非榜单必要字段。
- 排行榜排序和并列规则。
- 完整周期快照上传语义。
- 管理员初始化规则。
- CSRF token 校验与 OAuth state 校验。

### 11.2 集成测试

- 注册、登录、退出。
- OAuth callback 模拟。
- CLI 设备授权。
- 签名上传成功。
- 批量上传 5 类周期快照并逐条返回结果。
- 错误签名拒绝。
- 重放 nonce 拒绝。
- 幂等键重复返回一致结果。
- 命中限流时返回 `rate_limited` 和 `retry_after`。
- 风控标记的 snapshot 默认不进入公开榜。
- flagged snapshot 记录 reason_code/reason_message，并可由管理员 approve/reject/hide。
- 被封禁用户上传拒绝。
- 同用户多设备上传后榜单仍只有一条记录。

### 11.3 E2E 测试

- 用户注册并登录后查看排行榜。
- 用户授权 CLI 并上传数据后在榜单看到自己的记录。
- 管理员封禁用户后，该用户从榜单消失且无法上传。

---

## 12. 验收标准

1. `packages/site` Docker 镜像可以通过 `DATABASE_URL` 连接 PostgreSQL 并提供动态页面/API。
2. 用户可以使用用户名/密码注册和登录。
3. 用户可以使用 GitHub 登录。
4. 用户可以使用 Linux Do 登录，OAuth endpoint 由环境变量配置。
5. OAuth 已验证邮箱可合并到同一站内用户。
6. CLI 可完成设备授权并保存设备凭证。
7. CLI 上传请求必须通过 HMAC 签名校验，服务端使用加密保存的设备密钥计算签名。
8. 重放 nonce、过期 timestamp、错误签名、被撤销设备均被拒绝。
9. 同一用户同一周期只会产生一条排行榜记录，重复完整快照上传只覆盖不累加。
10. 被封禁用户不能上传，也不会出现在排行榜。
11. 排行榜页面和 `GET /api/leaderboard` 必须允许未登录用户查看公开列表；上传、个人上传状态和设备管理仍必须登录。
12. 上传内容不包含原始 prompt、completion、本地文件路径或源码。
13. 总榜使用固定 `period_start = 1970-01-01T00:00:00.000Z`，确保唯一约束可执行。
14. 周榜固定使用 UTC ISO week，周一开始，不支持用户切换周起始日。
15. 年榜使用 UTC 自然年，`period_start` 为当年 1 月 1 日 `00:00:00.000Z`。
16. 浏览器登录、OAuth、设备管理和管理员操作具备 session 安全与 CSRF 防护。
17. 上传 payload 包含费用、价格表、汇率、本地自定义成本、工具分布、模型分布、项目维度或其他非 Token 消耗量统计字段时必须被拒绝。
18. `leaderboard_entries` 按用户和周期保存快照，不按原始记录/会话/API 调用保存明细。
19. `upload_requests`、`upload_snapshots`、`upload_nonces` 必须具备保留期限和清理机制，避免无限增长。
20. CLI 上传请求支持批量提交当前日榜、周榜、月榜、年榜和总榜快照，并返回逐条处理结果。
21. 服务端必须实现默认限流，并在限流时返回 `rate_limited` 和 `retry_after`。
22. `flagged` snapshot 默认不进入公开榜，管理员确认后才可公开。
23. flagged/rejected snapshot 必须记录结构化 `reason_code` 和 `reason_message`。
24. 管理员可以 approve/reject/hide flagged snapshot，所有审计操作写入 `admin_audit_logs`。
25. 用户可以通过站点或 CLI 查看自己的上传状态和审核状态。
26. 设备密钥使用 AES-256-GCM 加密存储，每个密钥使用独立随机 IV。
27. Session 数据存储在 PostgreSQL，过期 session 由定时任务清理。
28. 排行榜查询支持分页（cursor-based），每页默认 50 条，并返回当前用户排名。
29. CLI 上传失败时区分可重试/不可重试错误，可重试错误使用指数退避重试。
30. 上传 API 使用字段白名单校验，未知字段返回 `payload_forbidden_field`。
31. `flagged` snapshot 的 `review_status` 状态机（pending → approved/rejected/hidden）正确实现。
32. 所有页面和 API 响应包含 HSTS、CSP、X-Content-Type-Options、X-Frame-Options 安全头。
33. `GET /api/health` 端点正确返回数据库连接状态。
34. 数据保留清理任务按配置的保留期限定期执行。
35. `upload_snapshots` 包含 `client_platform` 字段，`users` 包含 `timezone` 字段。
36. 开发完成后，所有相关文档（README、CLI 文档、部署文档、项目指引、API 文档、管理员手册）已更新，反映 Token 天梯榜的架构变更、新增命令、环境变量和部署方式。

---

## 13. 里程碑

### M1：站点后端化与数据库基础

- SvelteKit Node adapter 改造。
- PostgreSQL 连接与迁移体系。
- 用户、身份、session 基础表。
- Docker 镜像运行 Node server。

### M2：认证系统

- 用户名/密码注册登录。
- GitHub OAuth。
- Linux Do OAuth/OIDC。
- 账号合并与手动绑定。

### M3：CLI 设备授权与签名上传

- CLI rank 命令。
- 设备授权流程。
- HMAC 签名上传 API。
- nonce、timestamp、idempotency 校验。

### M4：排行榜页面与聚合

- 上传 payload 聚合入库。
- 日榜、周榜、月榜、年榜、总榜。
- 登录后排行榜页面。
- 同用户去重与多设备合并。

### M5：治理与安全

- 用户封禁。
- 设备撤销。
- 上传审计。
- 异常检测。
- 数据保留和清理任务。
- 管理员基础页面和上传审计页面。

### M6：文档与上线

- 更新 `packages/site` README，说明 Node 服务部署方式、环境变量配置和数据库迁移流程。
- 更新 CLI 文档，新增 `leaderboard` 子命令说明、授权流程和离线缓存行为。
- 更新根项目 README 和部署文档，反映 Docker 镜像从 nginx 静态站点改为 Node 服务的变更。
- 更新 `CLAUDE.md` / `MEMORY.md` 等项目指引文件，记录新的架构约定和开发流程。
- 更新 API 文档或 OpenAPI spec（如有），覆盖所有新增端点。
- 编写管理员操作手册，说明封禁、审核、设备撤销等后台操作流程。

---

## 14. 风险与决策

| 风险 | 决策 |
|---|---|
| 本地数据可被高级用户伪造 | 本期通过授权、签名、审计和异常检测降低风险，不承诺强证明 |
| Linux Do OAuth 文档可能变化 | endpoint 通过环境变量配置，不在代码中硬编码；参考 [Linux Do Connect 文档](https://connect-docs.linux.do/) |
| 静态站点无法支持登录/API | `packages/site` 升级为 SvelteKit Node 服务 |
| 1000+ 用户并发上传 | 本地、测试、生产统一 PostgreSQL |
| OAuth 邮箱缺失或未验证 | 不自动合并（密码注册用户 email_verified=false 不参与自动合并），要求登录后手动绑定 |
| 同一用户多设备重复上传 | 服务端按 `user_id + period` upsert 聚合，完整周期快照覆盖旧值不累加 |
| HMAC 校验需要设备密钥 | 服务端使用 AES-256-GCM + `DEVICE_SECRET_ENCRYPTION_KEY` 加密保存设备密钥，每密钥独立 IV，不明文保存 |
| `DEVICE_SECRET_ENCRYPTION_KEY` 泄露 | 本期不实现自动轮换；泄露时必须撤销全部设备并要求用户重新授权 |
| 数据表无限增长 | 榜单表只保存用户周期快照；上传审计、nonce、session 设置保留期限，由 pg_cron 或 node-cron 定时清理 |
| 排行榜查询性能 | 采用 cursor-based 分页 + 60 秒缓存；用户自身排名实时查询 |
| 需要多实例部署共享 session | Session 存储在 PostgreSQL，由数据库保证一致性 |

---

## 15. 推荐实现顺序

1. 先改造 `packages/site` 为 Node 服务并接入 PostgreSQL。
2. 实现账号注册、登录、session。
3. 实现 GitHub/Linux Do OAuth 与账号合并。
4. 实现 CLI 设备授权。
5. 实现 HMAC 上传 API。
6. 实现 leaderboard entries upsert 和页面展示。
7. 实现封禁、设备撤销、审计与风控。
8. 完成测试、部署脚本和生产环境配置。
9. 更新所有相关文档（README、CLI 文档、部署文档、项目指引、API 文档、管理员手册）。

---

## 16. 实施状态

**最后更新：** 2026-05-29

### 已完成

#### M1：站点后端化与数据库基础 ✓
- [x] SvelteKit Node adapter 改造
- [x] PostgreSQL 连接与迁移体系
- [x] 用户、身份、session 基础表
- [x] Docker 镜像运行 Node server

#### M2：认证系统 ✓
- [x] 用户名/密码注册登录
- [x] GitHub OAuth
- [x] Linux Do OAuth/OIDC
- [x] 账号合并与手动绑定

#### M3：CLI 设备授权与签名上传 ✓
- [x] CLI rank 命令（rank, login, upload, status, logout）
- [x] 设备授权流程
- [x] HMAC 签名上传 API
- [x] nonce、timestamp、idempotency 校验

#### M4：排行榜页面与聚合 ✓
- [x] 上传 payload 聚合入库
- [x] 日榜、周榜、月榜、年榜、总榜
- [x] 公开排行榜页面和匿名 GET 查询
- [x] 登录后个人排名增强信息
- [x] 同用户去重与多设备合并

#### M5：治理与安全 ✓
- [x] 用户封禁
- [x] 设备撤销
- [x] 上传审计
- [x] 异常检测
- [x] 数据保留和清理任务
- [x] 管理员基础页面和上传审计页面
- [x] CSRF 防护（浏览器表单提交）
- [x] 安全响应头（HSTS, CSP, X-Content-Type-Options, X-Frame-Options）

### 待完成

#### M6：文档与上线
- [x] 更新站内文档
- [x] 更新 CLI 文档
- [x] 更新根项目 README
- [ ] 更新部署文档
- [ ] 更新 `CLAUDE.md` / `MEMORY.md`
- [ ] 更新 API 文档或 OpenAPI spec
- [ ] 编写管理员操作手册

#### 测试
- [ ] 单元测试
- [ ] 集成测试
- [ ] E2E 测试

### 实现细节

#### CLI 命令
```bash
# 查看公开排行榜（无需登录）
aiusage rank

# 设备授权
aiusage login

# 上传数据
aiusage upload

# 查看状态
aiusage upload-status

# 退出登录
aiusage logout
```

#### 环境变量
```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SESSION_SECRET=your-session-secret-min-32-chars
DEVICE_SECRET_ENCRYPTION_KEY=64-char-hex-encoded-key
IP_HASH_SECRET=your-ip-hash-secret-min-32-chars
SITE_URL=https://aiusage.jtanx.com
ADMIN_EMAILS=admin@example.com,owner@example.com
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
LINUX_DO_CLIENT_ID=your-linux-do-client-id
LINUX_DO_CLIENT_SECRET=your-linux-do-client-secret
LINUX_DO_AUTHORIZATION_URL=https://connect.linux.do/oauth2/authorize
LINUX_DO_TOKEN_URL=https://connect.linux.do/oauth2/token
LINUX_DO_USERINFO_URL=https://connect.linux.do/api/userinfo
```

#### 安全特性
- HMAC-SHA256 请求签名
- AES-256-GCM 设备密钥加密
- Nonce 防重放
- Timestamp 时间窗校验
- Idempotency key 防重复处理
- CSRF 防护（浏览器表单）
- 安全响应头（HSTS, CSP, X-Content-Type-Options, X-Frame-Options）
- 会话安全（HttpOnly, Secure, SameSite=Lax cookies）
