# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [未发布]

### 修复
- **多设备同步丢失并重复记录** — 共用同一 GitHub 或 S3 同步目标的两台机器可能显示不同的总量，出现名为 `unknown` 的幽灵设备，而本地重建缓存或 ID 生成算法变更后作废的 ID 会永久残留在远端和所有对等设备上。原因与修复：
  - *Antigravity（及 Trae）线路 ID 冲突*：记录此前以 `sha256(device, sourceFile, lineOffset)` 发布，但同一 generation 的多个用量事件共享同一索引，Trae 的所有会话共享偏移 0，导致某台机器上 972 条本地记录只剩 929 条远端记录。两者现在使用解析器生成的 `record.id` 发布。
  - *只增不删的命名空间*：上传只会合并到远端日文件且从不删除，拉取也不会移除已从对等设备命名空间消失的行。现在每台设备的命名空间（`data/<deviceInstanceId>/`）是其本地数据库的权威快照：上传仅重写规范内容有变化的文件（忽略行顺序；重复或格式错误的行会触发重写；S3/R2 ETag 可避免读取未变化的文件），随后发布带有逐文件摘要的 `manifest.json`，最后删除已无本地记录的日文件（命名空间清空时会先发布空 manifest，再删除最后的日文件），并且绝不触碰其他设备的命名空间。拉取会先用 manifest 校验每个外部命名空间，再精确镜像它，移除远端已不存在的 `synced_records` 行及其合并副本。同步绝不删除本地解析的记录。无变化的同步不会写入任何内容。
  - *按目标记录的归属（claims）*：每条拉取的行都会记录它来自哪些同步目标（`sync_record_claims`，含云端）。协调某个目标时只替换该目标的归属记录，只有当没有任何目标再持有该行时才会删除它，因此某个仓库已移除、但另一仓库（或云端）仍保存的记录会被保留。`sync --repair --apply` 与 `aiusage clean` 删除行时会一并删除其归属记录，归属记录不会比其对应的行存活更久。
  - *多个同步目标下的升级*：在归属记录出现之前镜像的行会被标记为*未决*（`synced_records.unclaimed_since`），任何单个目标都不能清理它们。每次可靠的协调都会按目标和命名空间记录一条判定（`sync_namespace_verdicts`，基于单调递增的同步时钟），未决行只有在 `state.json` 中记录的每个目标都在该行变为未决之后判定过其命名空间时才会被删除。因此先同步目标 A 不会再删除目标 B 仍保存的记录；从无法校验的命名空间读到的行受到同样的保护；不再同步的目标由 `sync --repair` 处理，它现在也会报告当前配置目标已校验的命名空间中不包含的未决行。
  - *尚未查看过的已知目标*：此前释放某行的最后一条归属记录时会直接删除该行，即使另一个已知目标只是尚未建立其归属记录（升级后或 `clean --all` 之后还没有同步过）——于是从目标 A 移除的记录会被删除，尽管目标 B 仍保存着它，直到 B 下次同步才重新出现。现在这样的行会变为未决，只有当每个已知目标都对其命名空间有判定时才会立即删除（有判定而无归属记录的目标，在其上一次可靠读取时并不持有该行）；缺失判定的目标第一次给出判定时，要么认领该行（无需重新插入），要么使其被清理。云端墓碑和云端代际重置遵循同一规则；墓碑现在只释放其来源设备所对应的归属记录，因此另一台设备仍在发布的相同 ID 不会再被一并删除。对于键在本次发布中发生变化的配置（非默认分支、前缀或端点），只要设备仍计入升级前的旧键，该旧键就是这样一个“尚未查看”的目标：在它再次同步或通过 `--forget-target` 被释放之前不会清理任何行，`aiusage sync` 每次同步后都会提示这一点。此外，目标再次读取某个命名空间时会撤回它此前对该命名空间的判定，只有可靠的协调才会重新记录；因此在一次无法校验的读取或中途失败的同步之后，该目标先前的结论不会让另一个目标清理刚刚在它上面看到的行。已知限制：所有云端账户共用目标键 `cloud`（设备凭据不包含账户标识），因此登录另一个账户会被视为同一目标的内容发生了变化；详见 `docs/sync-namespaces.md` 的 *Target identity*。
  - *没有日文件的命名空间*：列举结果只显示日文件，因此此前被认领、但日文件已消失的命名空间现在通过其 manifest 来解释——没有 manifest 表示已删除，有效的空 manifest 表示权威性为空（两者都按空集协调），指向缺失文件的 manifest 或无法解析的 manifest 表示无法校验（跳过，保留归属记录和行）。此前这四种情况都被当作“已删除”。
  - *云端线路格式*：CLI 以 `device` 推送设备别名，而服务端读取并返回的是 `deviceName`，导致别名被存为 `null`，拉取的记录也没有别名；Postgres 的 bigint 还会以字符串返回。`sync/cloud-dto.ts` 现在负责双向转换；拉取结果中若包含客户端无法表示的记录，拉取会失败而不是悄悄略过。
  - *同步目标身份*：用于区分同意状态、发布记录和归属记录的键此前只包含仓库名或存储桶名，同一仓库的两个分支、或同一存储桶名下的不同前缀/端点会共用同一个键，从而可能互相清理对方的行。现在只要分支（`github:<repo>?branch=x`）或前缀/端点（`s3:<bucket>?prefix=..&endpoint=..`）与默认值不同，就会成为键的一部分；默认配置保留原有的键。键发生变化的配置会在首次同步时一次性复制旧键下记录的同意状态、发布记录和归属记录，但不复制命名空间判定（判定允许删除，且可能是仍在使用旧键的默认配置作出的）；旧键仍计入已知目标，因此变更后的配置不会单独清理未变更配置可能仍持有的行。
  - *遗忘同步目标*：不再有任何配置在其下同步的键（通常就是上述旧键）会永久保留其归属记录所指向的每一行——包括本次作废的 Antigravity/Trae 旧线路 ID——并永久扣留未决行等待的判定；`sync --repair` 无法把这些行视为孤儿，因为它们仍有归属记录，而此前只有 `clean --all` 会删除归属记录。现在 `aiusage sync --repair --forget-target <key>`（默认演练；`--apply` 执行）可以显式释放这样的键：在单个事务中删除该键的归属记录、命名空间判定、发布记录和已作废线路 ID，并把因此失去最后一条归属记录的行标记为在变更前取得的 tick 上未决，随后再从 `state.json` 中移除该键。它本身不删除任何记录——其余每个已知目标的下一次同步会清理它们都不再持有的行——会拒绝当前配置的目标和未知的键，中断后可安全重跑，并且在配置云端后端时同样可用。普通的 `sync --repair` 现在会以仅供参考的提示列出所有其他已记录的键；只要设备仍计入当前配置升级前的旧键，`aiusage sync` 每次成功同步后也会提示该键。
  - *代际重置后的云端归属*：一次完整的云端拉取对云端目标具有权威性，因此不再返回任何数据的设备（服务器数据已被清空）会失去其云端归属记录，若没有其他目标持有，其行也会被移除，而不是被过期的云端归属记录永久保护。随后的推送使用拉取时观察到的代际（此前在服务器清空后首次同步的客户端会因代际过期被拒绝）；若分页拉取中各页报告的代际不一致，则重新拉取，而不是把两个代际拼成一个快照。
  - *云端同步代际（服务端）*：`cloud_sync_resets.sync_generation` 是 `BIGINT`，站点使用的 Postgres 驱动将其作为字符串返回，因此第二次清空云端数据时会计算出 `"2" + 1 = "21"`，代际变为 1 → 2 → 21 → 211 ……；大约第十七次清空后会超过 2^53，而客户端严格的响应校验会（正确地）拒绝它。clear、push 和 pull 接口现在都按数字读取该值；当代际已无法精确递增时，清空操作会拒绝执行，而不是删除数据却不推进代际。已存储的代际只要小于 2^53 就继续有效；在此修复之前已清空十七次或更多次的账户已超出该范围，需要在服务端重新编号其代际。
  - *已推送的历史 `unknown` 行*：将行归属到真实设备 ID 会改变所有由设备 ID 派生线路 ID 的工具（Claude Code、Codex 等）的线路 ID。已发布过的此类行会按目标作废旧的 `sha256('unknown', …)` ID（云端以墓碑撤回）并重新发布；迁移和归属过程都会执行这一步。
  - *失败即保守（fail-closed）*：GitHub 后端现在仅在 `ENOENT` 时报告文件不存在，其他读取或列举失败都会抛出异常；列举或读取出错会在任何清理发生之前中止同步。数据目录顶层的孤立 `.ndjson` 文件不再被当作命名空间（此前会因其清单路径的 `ENOTDIR` 导致每次同步失败）。若某个命名空间的文件在列举与读取之间消失、包含格式错误的行、或与其 manifest 不匹配（S3 重写进行中或被中断——包括记录在日文件之间移动的情形），本次同步会跳过该命名空间而不是将其视为权威；`aiusage sync` 会报告被跳过的命名空间数量。应用拉取结果时本地数据库出错同样不会被吞掉：同步会在协调之前中止，而协调本身在单个事务中执行。无任何目标持有的历史 `unknown` 行，只有在本次同步可靠读取了目标上的所有命名空间之后才会被清理。
  - *`aiusage clean --before` 与 manifest*：远端清理此前会重写或删除日文件却不刷新命名空间的 manifest，升级后的对等设备会发现摘要不匹配并无限期跳过被清理的命名空间。现在它遵循与同步相同的快照规则：保留的记录以规范形式重写，随后刷新 manifest，最后删除已清空的文件；没有 manifest 的命名空间不会被添加 manifest。
  - *远端清理与修复先校验再重写*：`clean --before` 与 `sync --repair --apply`（包括 `--all-namespaces`）现在与拉取一样通过 manifest 读取每个命名空间，并且只修改快照校验通过的命名空间——manifest 指定的每个文件都存在、每一行都可解析、每个摘要都匹配。所有者正在 S3 上发布中的命名空间、缺失或不匹配的文件、无法解析的 manifest 或格式错误的行都会被跳过并报告，而不是被重写后再用新的 manifest 背书（格式错误的行绝不会被静默丢弃）。因此清理或修复写出的 manifest 只可能描述“已校验的快照减去被移除的行”，所有者的下一次同步会把期间发布的内容重新整理好。manifest 未列出的日文件不会被触碰。
  - *`aiusage clean --all`*：此前仅当列举到日文件时才执行远端清空，因此只剩下 `manifest.json` 的目标永远不会被清理；现在总是调用 `deleteAllData`。本地全量清理也会连同 claims、同步状态和墓碑一起删除待处理的已退役 wire id。
  - *历史 `unknown` 设备 ID*：仍标记为 `unknown` 的本地行在上传前会归属到当前设备；拉取时标记为 `unknown` 的行归属于命名空间所有者，`unknown` 不再显示为独立设备。
  - *合并副本滞后*：远端更新过的已拉取行（例如源设备回填 cwd 之后）现在也会在 `records` 中刷新，而不只是 `synced_records`。
  - 迁移 v14 新增 `sync_record_claims`、`sync_retired_wire_ids`、`sync_namespace_verdicts` 与 `synced_records.unclaimed_since`（所有已有的拉取行起初都是未决的）；已推送到云端后端的旧 Antigravity/Trae ID 会以墓碑撤回，其他设备拉取时会应用墓碑。升级前拉取的行会在本设备用过的每个同步目标都同步一次之后得到处理；只有已废弃的目标才能处理的行，`sync --repair` 会将其报告为孤立行，并可用 `--apply` 移除。
  - 同步模型的不变量以及锁定它们的对抗性场景矩阵记录在 [`docs/sync-namespaces.md`](./docs/sync-namespaces.md)（*Invariants*、*Scenario matrix*）中：记录的所有权与来源、归属记录只能由其所属目标释放、只有在没有任何归属记录且每个已知目标都已判定时才删除、未决行只能由所有已知目标的判定来处理、没有日文件的命名空间的三种状态、只有经过校验的快照才能导致删除、被中断的 Git/S3/云端操作绝不会被当作“不存在”，以及同一记录在不同目标上版本不同时“以观察到的最新版本为准”的规则。
  - `aiusage sync --repair` 现在还会报告并清理本设备命名空间中的过期行和重复行、孤立的拉取行，并报告本地记录间的线路 ID 冲突。`aiusage sync` 会输出 `pruned` 与 `retired` 计数。详见 [`docs/sync-namespaces.md`](./docs/sync-namespaces.md) 与 [`docs/sync-repair.md`](./docs/sync-repair.md)。

---

## [1.5.17] - 2026-09-15

### 变更
- **本地仪表盘导航** — 隐藏侧边栏中的“服务与支持”入口；仍可通过 `/support` 直接访问该页面。
- **启动解析响应性** — 初次解析改为在端口开始监听后执行，历史工具调用回填期间主动让出事件循环，并缓存定价查询，避免大量本地历史记录阻塞仪表盘。

### 修复
- **本地日历范围**（[#62](https://github.com/juliantanx/aiusage/pull/62)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— 自定义范围边界和按日聚合改用本地日历日期构建，不再错误使用 UTC 日期。

---

## [1.5.16] - 2026-09-14

### 新增
- **本地同步支持 GitHub App 认证**（[#53](https://github.com/juliantanx/aiusage/pull/53)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— 新增 `aiusage github login` 设备授权、安全凭据存储及经过认证的 GitHub 同步，无需用户自行创建和粘贴个人访问令牌。

### 变更
- **强化本地仪表盘信任边界**（[#53](https://github.com/juliantanx/aiusage/pull/53)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— 无密码服务默认仅监听回环地址，非回环地址及 Docker 访问必须设置密码；拒绝跨域和 DNS 重绑定请求，使存储的凭据只能通过 HTTP 写入，保护敏感数据接口，并仅通过公开的 home-summary 接口提供汇总总量。数据刷新改用 `POST`，认证 Cookie 也会正确识别 HTTPS 代理头。

### 修复
- **Antigravity 解析器会拒绝合法的 10 字节 varint**（[#54](https://github.com/juliantanx/aiusage/pull/54)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— protobuf varint 读取器此前在 8 字节后停止，导致包含 10 字节 varint 的 generation 或 step 元数据解析失败，并丢弃该行的全部用量记录。现在可接受 protobuf 规定的最多 10 字节，同时仍会拒绝更长的序列。

---

## [1.5.15] - 2026-09-08

### 新增
- **Antigravity 用量解析**（[#52](https://github.com/juliantanx/aiusage/pull/52)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— 从支持的安装、备份及配置目录中发现 Antigravity 对话数据库，并从 SQLite 的 generation、step 和 retry 元数据导入 token 用量。解析器会对重叠记录去重、规范化模型别名以正确解析供应商和价格，并使用兼容 WAL 活跃会话的增量游标，避免空 generation 阻塞后续解析。

---

## [1.5.14] - 2026-09-07

### 修复
- **跨设备同步会重新上传已拉取记录**（[#51](https://github.com/juliantanx/aiusage/pull/51)，[@Ntrxi](https://github.com/Ntrxi) 贡献）— 从其他设备拉取的记录保留了真实 `source_file`，旧逻辑因此误将其视为本地记录，并以当前设备的命名空间和冲突 ID 重新上传，造成各设备重复计量。现在使用显式的 `records.origin` 字段标记来源，只上传属于当前设备的本地记录，并忽略命名空间不匹配及本机回声记录；迁移 v13 会确定性地回填现有数据库。新增 `aiusage sync --repair [--apply] [--all-namespaces]`，可先报告、再按需清理本地数据库和远端命名空间中的污染数据。详见[同步修复指南](./docs/sync-repair.md)。

---

## [1.5.13] - 2026-09-01

### 修复
- **可靠关闭 `serve`**（[#50](https://github.com/juliantanx/aiusage/pull/50)；由 [@lmingde](https://github.com/lmingde) 在 [#49](https://github.com/juliantanx/aiusage/issues/49) 中报告）— 使关闭流程保持幂等、仅注册一次信号处理器、立即关闭空闲 HTTP 连接，并在短暂超时后强制断开活跃连接，确保 `Ctrl+C` 总能退出且不会累积 `close` 监听器。

---

## [1.5.12] - 2026-08-18

### 修复
- **大型 Cursor 数据库解析**（[#47](https://github.com/juliantanx/aiusage/pull/47)，[@chomoe327](https://github.com/chomoe327) 贡献）— 用索引范围查询替代重复的全表扫描，跳过缺少 `cursorDiskKV` 表的不兼容数据库，并按 composer 报告解析进度。2.75 GB 数据库的解析时间从超过 10 分钟仍无法完成缩短到约 10 秒，无新增数据的增量解析约一秒即可完成。

---

## [1.5.11] - 2026-07-16

### 修复
- **Grok Build 用量解析** ([#45](https://github.com/juliantanx/aiusage/pull/45)) — 新增专用的有状态解析器，处理 Grok Build `updates.jsonl` 日志，将累计 token 计数器转换为每轮正增量，并将发现范围限定为真实用量日志。v1.5.10 跳过的历史日志会自动重放一次，重复或下降的计数器保持幂等，不会重复计量。

---

## [1.5.10] - 2026-07-10

### 新增
- **CodeFuse 支持** ([#42](https://github.com/juliantanx/aiusage/pull/42) by [@Ed-Bg](https://github.com/Ed-Bg)) — 检测并解析 `~/.codefuse` 下的 [CodeFuse](https://github.com/codefuse-ai) 使用日志，覆盖其多种日志布局（`projects`、含 Claude Code 形态 `ant_cc_*.json` 的 `engine/cc/projects`、以及 `engine/codex/sessions`）。可从 Claude Code、原生和 Codex payload 三种结构中读取 token 用量，并一并提取工具调用。可用 `AIUSAGE_CODEFUSE_PATH` 覆盖路径。

## [1.5.9] - 2026-07-06

### 修复
- **Trae 解析不再阻塞 `serve` 启动和仪表盘** ([#40](https://github.com/juliantanx/aiusage/issues/40)) — Trae 解析器读取会话元数据时,对每个 git tag 都单独 spawn 一次 `git log`(没有 `chain-start` tag 时还会再全量扫一遍做回退)。在大型快照存储上(约 72 个仓库、696 个 tag),单次解析要产生数百个 git 子进程 —— Windows 上约 40 秒 —— 从而阻塞 `/api/refresh`,使仪表盘一直卡在加载状态。现在解析器改为每个仓库只用一次 `git for-each-ref` 取回所有 tag 名和时间戳(约 768 次 → 72 次),首页/概览页也改为先渲染已有数据、再后台触发刷新,首屏不再阻塞在日志解析上。

## [1.5.8] - 2026-07-01

### 新增
- **CodeBuddy IDE 支持** — 检测并解析腾讯 CodeBuddy IDE（含 CN 变体）。其逐条消息的 JSON 日志位于 `CodeBuddyExtension/Data/**/CodeBuddyIDE/**/history/<会话>/<对话>/messages/`。原有的 `codebuddy` JSONL 解析器仅覆盖 `~/.codebuddy/projects`，因此 IDE 用量此前无法被检测到。用量数据取自每个对话累计的 `statsSnapshot`（未命中缓存的输入、缓存输入、输出）。归入现有的 **CodeBuddy** 工具，新增 `codebuddy-ide` 数据源；可用 `AIUSAGE_CODEBUDDY_IDE_PATH` 覆盖路径。

### 修复
- **CodeBuddy CLI 缓存 token 重复计数** — CLI 同时把用量写在 `message.usage`（字段名是 Anthropic 风格，但语义是 OpenAI 风格——`input_tokens` 已包含缓存 token）和 `providerData.rawUsage` 里。通用解析器按 Anthropic 语义处理，在已含缓存的 `input_tokens` 之上又加了一遍 `cache_read_input_tokens`，导致输入被缓存量虚高（缓存密集的轮次可达约 100 倍）。现在 codebuddy 改为读取 `rawUsage` 中干净的 `prompt_cache_hit/miss` 分解（缺失时回退到 `message.usage` 并减去缓存读取部分）。
- **回填的 cwd/source_file 现在可跨设备传播** ([#12](https://github.com/juliantanx/aiusage/issues/12)) — 在运行 `aiusage serve` 的设备上，跨设备项目统计会丢失 Codex（及其他依赖 cwd 的）项目：cwd 与 Hermes source_file 的回填虽然补全了本地记录，却没有更新 `updated_at`，而跨设备同步只会重新上传 `updated_at > synced_at` 的记录，因此补全后的字段从未传播到其他设备。现在这些回填会像 `backfillCodexModels` 一样更新 `updated_at`。迁移 v12 会修复已运行过 v1.5.0–v1.5.7 有缺陷回填的既有安装：重新将已补全的记录标记为已变更，强制重新上传一次。

## [1.5.7] - 2026-06-25

### 新增
- **Trae 支持** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 检测并解析 Trae 会话，覆盖 Trae CN、TRAE SOLO CN 和国际版 Trae 三个变体。
- **Cursor 隐私模式解析** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 当 Cursor 以 `PRIVACY_MODE_NO_STORAGE` 运行时，回退到 agent-transcript JSONL 日志，仍可统计用量。

### 变更
- **会话列表显示完整日期和时间** — Sessions 表格的「时间」列现在显示日期和时间（`toLocaleString`），不再只显示日期，与会话详情页保持一致。

### 修复
- **Kiro 解析器** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 支持 `workspace-sessions` JSON 格式，新增 `tokens_generated.jsonl` 探测，修复 token 估算。
- **Trae 会话 ID 提取** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 从 v2 子目录读取会话 ID。
- **工具发现审计** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — 修正 Trae、Cursor、Kiro、KiloCode 的日志发现逻辑（含 KiloCode 的 Windows 数据库路径）。
- **OpenClaw 零成本记录卡在 $0** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 只要日志里存在 `usage.cost` 字段，OpenClaw 解析器就把 `cost_source` 标为 `'log'`，即使 `total` 是 `0`。自定义网关（如 openclaw → `deepseek-v4-pro`）对它们不计价的模型会上报 `cost.total: 0`，这些记录因此被当作权威的 `$0`、永远无法计价。现在解析器要求日志成本为正数才使用 `'log'`，否则回退到按价格表计算 —— 与 Cline、Hermes 解析器保持一致。
- **重算修正日志来源费用** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 当 `cost_source = 'log'` 记录的日志成本为非正数（网关上报的不可靠 `0`），或用户为该模型设置了手动价格时，重算现在会重新计算费用。这样无需重新导入即可修复已入库的记录。真正为正的日志成本仍会保留。
- **旧版 config 价格覆盖现已生效** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — 在定价注册表出现之前配置的价格覆盖只存在于 `config.json`，重算时被忽略，导致手动设置的价格不影响重算后的费用。服务端现在会在启动时把 `config.priceOverrides` 导入注册表作为用户价格（已通过 UI 设置的价格会保留），并从 config 中清除，使注册表成为唯一数据源。升级后点击一次 **重算** 即可应用到存量记录。

---

## [1.5.6] - 2026-06-17

### 新增
- **Widget 自动设置** — 当 `cache.db` 缺失时自动设置 CLI 并运行首次解析，包含显示设置阶段的覆盖层 UI、IPC 状态通道和国际化支持。

### 修复
- **CLI 逐工具进度** — 解析过程中显示逐工具进度，替代之前误导的全局计数器。
- **CLI 损坏数据库恢复** — 启动时自动重建损坏的 SQLite 数据库。

---

## [1.5.5] - 2026-06-17

### 修复
- **Qoder Windows 数据库路径** ([#34](https://github.com/juliantanx/aiusage/pull/34)，@Mnoisec 贡献) — 将 Windows 上 Qoder Desktop SQLite 数据库路径从 `LOCALAPPDATA`（Local）修正为 `APPDATA`（Roaming）。

---

## [1.5.4] - 2026-06-15

### 新增
- **ZCode 解析器** ([#33](https://github.com/juliantanx/aiusage/pull/33)，@zhaolu83949426-hub 贡献) — 新增 ZCode CLI 的用量统计支持，解析其 SQLite 数据库（`~/.zcode/cli/db/db.sqlite`）。从 `model_usage` 表读取每次请求的 token 用量（输入、输出、推理、缓存读/写），从 `tool_usage` 表读取工具调用记录。token 记录关联 `session.directory` 作为工作目录；工具调用作为孤儿记录入库（无父记录），因为 zcode 仅通过 `turn_id`（多对多）将它们与模型请求关联。两张表各有独立的增量游标。
- **ZCode 环境变量文档** — 在站点文档中记录 `ZCODE_DB` 环境变量，用于自定义 ZCode 数据库路径。

### 修复
- **Claude Code 消息去重** ([#32](https://github.com/juliantanx/aiusage/pull/32)，@joyshan1986 贡献) — 通过 `message.id` 对 Claude Code 记录去重，防止重复条目。
- **孤儿工具调用计数** — 在工具调用统计和仪表盘中计入孤儿工具调用。

---

## [1.5.3] - 2026-06-10

### 新增
- **LiteLLM 定价同步** — 从 LiteLLM 注册表同步模型定价，在本地 Web 引导首次定价同步，并将本地模型绑定到定价别名。
- **云端全局开关和公开定价** — 新增云端全局关闭开关（ban 语义），公开只读定价页面和 API 端点，以及配置中的逐条风控规则开关。
- **代理云同步状态端点** — 通过代理端点暴露云同步状态。

### 修复
- **Pi 会话解析** ([#31](https://github.com/juliantanx/aiusage/pull/31)，@joyshan1986 贡献) — 按文件提取 Pi 的会话 ID，并识别其缓存 token 字段。
- **排行榜费用聚合** — 按周期聚合排行榜费用，并在重算时保留费用数据。
- **定价别名解析** — 在费用重算时正确解析同步的定价别名。
- **本地数据库写入串行化** — 串行化本地数据库写入以防止并发写冲突。
- **配置目录安全** — 在保存前确保配置目录存在，并分离错误处理。
- **定价表重新设计** — 移除过时的云同步引用并重新设计定价表。
- **快照审核流程** — 将已审核的快照排除在标记列表之外，审批时恢复 leaderboard_metrics 的公开可见性。
- **同步记录字段命名** — 将同步 API 请求/响应中的 `record_id` 重命名为 `id`；同步拉取时仅计算实际变更的记录数。

### 变更
- **定价管理全面改版** — 增强定价管理，新增重算追踪、显式重算工作流，以及优化交互体验。
- **移除内置定价种子** — 从运行时移除内置定价种子数据和站点定价版本模型。
- **站点 Docker 缓存优化** — 优化站点 Docker 依赖缓存。

---

## [1.5.2] - 2026-06-08

### 新增
- **Kelivo 手动备份导入** ([#29](https://github.com/juliantanx/aiusage/pull/29)，@Fiveo9 贡献) — 将 Kelivo 加入手动导入来源，支持解析导出的 `chats.json` 与 `.zip` 备份，新增 `POST /api/import/kelivo`，并在设置页展示导入状态和结果。
- **排行榜加入指南** — 在文档和仪表盘中补充加入公开排行榜的引导。
- **高分辨率布局支持** — 在大屏上加宽站点内容，同时保持文档导航和设置页布局对齐。

### 修复
- **头像上传错误与限制展示** — 提供更清晰的上传失败提示，并在设置页动态显示当前头像大小限制。
- **仪表盘启动通知** — 仪表盘首次成功打开时也会发送 `install:done` 通知。
- **文档锚点导航** — 修复站点头部下的锚点滚动，并补充 Kelivo 手动导入文档。
- **首页 URL、SEO 与响应头** — 刷新首页元数据、规范 URL 和响应头。

### 变更
- **`aiusage clean` 重置流程** — 将 reset 行为合并到 `clean`，并通过 Git、S3 和 Cloud Sync 传播云同步清理；同步更新交互式菜单和测试。
- **排行榜周期与设置页清理** — 移除滚动排行榜周期，简化相关查询/UI 代码，并保持设置页展示行为一致。
- **支持工具数量文案** — 将 README、文档、首页和发布记录中的固定 `23 种工具` 文案调整为 `20+ 种工具`。
- **README 清理** — 精简 license 前的过时章节，并移除废弃 docs 资源。

---

## [1.5.1] - 2026-06-07

### 新增
- **认证错误国际化** — 登录、注册、忘记密码和重置密码页面现在返回机器可读的错误码，并显示本地化消息（中/英文）。
- **品牌化 HTML 邮件模板** — 验证邮件和密码重置邮件使用响应式品牌布局，包含 logo、卡片设计和样式化 CTA 按钮。
- **邮箱验证结果页面** — 专用的验证结果页面，显示成功/失败状态，替代之前的纯服务器重定向；在任何设备上均可正常显示。
- **跨设备邮箱验证** — 注册成功后，PC 端自动轮询验证状态，在手机上点击验证链接后自动跳转到登录页。
- **OAuth 解绑安全检查** — 防止解绑最后一个认证方式；通过 OAuth 重新登录时，自动关联已有账号。
- **管理后台配置显示优化** — 字节值现在显示为 MB，毫秒值显示为秒。
- **排行榜 @用户名显示** — 在排行榜条目中显示名下方展示 `@username`，区分显示名相同的用户。

### 修复
- **排行榜缓存清除** — `unbanUser` 和 `setUserRole` 现在正确清除排行榜缓存。
- **API 响应 Cache-Control: no-store** — 在 hooks 和排行榜端点直接添加 `Cache-Control: no-store`，防止 Cloudflare 缓存动态 API 响应。
- **头像上传大小限制** — 移除无效的 `bodySizeLimit` svelte.config.js 配置；adapter-node 通过 `BODY_SIZE_LIMIT` 环境变量控制。

### 变更
- **OAuth 重新关联逻辑** — 用户通过 OAuth 登录时，如果已存在相同邮箱的账号，将身份关联到已有账号，而不是报 duplicate key 错误。

---

## [1.5.0] - 2026-06-07

### 新增
- **Windows 仪表盘启动器** ([#23](https://github.com/juliantanx/aiusage/pull/23)，@joyshan1986 贡献) — 提供专用的 Windows 启动器，避免依赖 shell 包装即可打开仪表盘。
- **token 排行榜、云同步与 Web 增强** ([#24](https://github.com/juliantanx/aiusage/pull/24)) — 引入 token 排行榜，扩展云同步流程，并围绕同步与排行榜工作流更新 Web 仪表盘。
- **交互式 `aiusage menu` 命令** ([#25](https://github.com/juliantanx/aiusage/pull/25)) — 新增终端菜单，把常用 CLI 操作集中到一个入口。
- **仪表盘密码解锁流程** ([#27](https://github.com/juliantanx/aiusage/pull/27)，@Fiveo9 贡献) — 新增本地仪表盘密码保护与解锁流程。
- **会话详情和排行榜功能增强** ([#28](https://github.com/juliantanx/aiusage/pull/28)) — 扩展会话详情页和排行榜工作流，提供更多上下文与管理端可用性优化。
- **密码重置流程与 Resend 邮件服务** — 新增忘记密码和重置密码支持，并补充账号恢复与管理相关增强。
- **Widget 费用显示与 UI 刷新** — Widget 会根据所选货币显示费用，并带来重新设计的 i18n / 设置 / 图表体验。

### 修复
- **云同步校验与同步可靠性** — 通过 GitHub 星标校验限制 Cloud Sync，正确保留同步配置，修复 R2 路径风格处理，并修正上传记录计数。
- **OAuth 与认证流程加固** — 用内存存储替换基于 cookie 的 OAuth state，修复显式 `Set-Cookie` 处理，从 `SITE_URL` 推导安全 cookie，并在 GitHub OAuth 启动流程中使用 SvelteKit redirect。
- **仪表盘与排行榜打磨** — `serve` 启动时自动解析日志，用成功 toast 替代上传结果摘要，改进排行榜前三名展示和排序筛选，并优化管理后台徽章与角色切换布局。
- **Web 界面清理** — 改善深色主题对比度，抑制对话框遮罩层的可访问性警告，并减少筛选器布局冲突。

### 变更
- **文档与发布内容刷新** — 更新仪表盘文档/截图、项目概览与安全策略、演示 GIF 托管，以及站点/版本元数据到 `1.5.0`。

---

## [1.4.0] - 2026-06-03

### 新增
- **GitHub Copilot 用量追踪与配额支持** ([#19](https://github.com/juliantanx/aiusage/pull/19)) — CopilotParser 解析 OTEL JSONL 文件（Copilot CLI 和 VS Code Copilot Chat），通过 GitHub OAuth 查询 Copilot 配额 API，自动发现 `~/.copilot/otel/*.jsonl` 和 `$COPILOT_OTEL_FILE_EXPORTER_PATH`
- **KiloCode 解析器** ([#20](https://github.com/juliantanx/aiusage/pull/20)，@zhaolu83949426-hub 贡献) — 解析 KiloCode VS Code 扩展的 SQLite 数据库 (`kilo.db`)，支持输入/输出/缓存/思考 token 和费用计算
- **按模型 token 分解与堆叠柱状图** ([#21](https://github.com/juliantanx/aiusage/pull/21)) — API 暴露每个模型的 inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、thinkingTokens、totalCost；统一排名列表与堆叠组合柱状图
- **自动检测工具，从 8 个扩展到 20+ 个** ([#22](https://github.com/juliantanx/aiusage/pull/22)) — 自动检测已安装的 AI 工具，替代手动配置源路径；设置页面只读的"已检测工具"面板；`GET /api/detected-tools` 接口
- **USD/CNY 货币切换** ([#17](https://github.com/juliantanx/aiusage/pull/17)) — 定价页面分段切换器，在 USD 和 CNY 显示之间切换并自动汇率转换
- **扩展模型定价表** — 新增 OpenRouter、Google 及更多 Claude/OpenAI 模型变体；新增 `inputText` 定价字段，用于文本输入单独计价的模型

### 修复
- **定价保存/重置后自动重算费用** ([#15](https://github.com/juliantanx/aiusage/pull/15)) — 服务器在保存/重置定价后自动重算所有记录费用，无需手动操作；修复中文标签的编辑表单布局
- **密钥链数据不可用时回退到凭据文件** ([#18](https://github.com/juliantanx/aiusage/pull/18)) — 当 macOS 钥匙串条目不可用（解析错误、auth_mode 错误）时回退到基于文件的凭据

### 变更
- 移除站点布局中的公告横幅
- 简化首页 hero 区域

---

## [1.3.4] - 2026-05-29

### 修复
- **Widget 全局安装崩溃** — `aiusage-widget` 在 `npm install -g` 后报错 `Cannot find module 'electron'`，因为 `electron` 是开发依赖，不会安装给终端用户。现已改为运行时依赖。
- **跨平台原生绑定** — 此前 widget 仅包含在 CI 运行器（Linux x64）上构建的单一 `better-sqlite3` 预编译二进制文件，无法在 macOS 或 Windows 上加载。新增 `postinstall` 步骤，自动获取匹配用户平台、架构和已安装 Electron ABI 的 `better-sqlite3` 绑定，同时不影响 CLI 使用的 Node-ABI 绑定。

---

## [1.3.3] - 2026-05-28

### 新增
- **Logo 重设计** — 全新上升柱状图图标替代旧 logo
- **联系方式页脚** — 站点新增微信二维码弹窗、Discord、Telegram 和 Email 链接
- 站点联系页脚新增 **Facebook 链接**
- **小米 MiMo 模型定价** 添加到定价表
- **全面站点 SEO 优化** — 结构化数据、meta 标签、favicon 集
- 侧边栏导航新增**官网链接**
- **扩展 Widget 文档** — 截图、面板功能、托盘图标使用说明
- **字体大小可读性和移动端响应式** 改进

### 修复
- **Widget 面板定位与 Node/Electron sqlite ABI 冲突** — 解决 Electron 环境下加载 sqlite 的崩溃问题
- **Widget launcher 语法错误** 导致后台分离失败
- **Widget 托盘图标渲染** — 用新 logo 替换闪电图标
- **PM2 启动失败** — 解决 ESM 和原生模块兼容性问题
- **Docker 发布构建** — 修复损坏的构建流程
- **GitHub 统计徽章** — 通过 API 渲染替代不稳定的 shields.io
- **Node 26 widget sqlite 依赖** — 修复原生绑定加载
- **文档侧边栏滚动** — 导航时保持活动项可见

### 变更
- 最低 Node.js 要求从 18 提升至 20
- 生成的 SvelteKit 构建输出不再纳入 git 跟踪
- README GIF 替换为静态截图
- 站点文档与实际仪表盘行为对齐
- 截图脱敏处理（项目名称、源路径、设备别名）

---

## [1.3.2] - 2026-05-27

### 新增
- README 和 `site` 包中添加官网链接

### 修复
- 修正所有文档中的 PM2 后台服务说明

---

## [1.3.1] - 2026-05-26

### 新增
- **桌面系统托盘 widget** — `@juliantanx/aiusage-widget` 包与 npm 发布工作流 ([#7](https://github.com/juliantanx/aiusage/pull/7))
- **PM2 后台支持** — 通过 PM2 将 aiusage 作为后台服务运行
- **Cursor 工具支持** — 检测并显示 Cursor AI 工具使用情况
- **Widget 端口自动检测** — widget 自动发现后端端口
- **官方配额仪表盘** — 显示订阅用量和限额
- **会话详情页** — `/sessions/[sessionId]` 显示时长、工具调用次数和时间偏移
- **MCP 服务器标签页** — 在概览工具调用卡片中查看热门 MCP 服务器
- **工具调用类型分类** — 按类型（内置、MCP、skill）过滤工具调用
- **Cursor AI 消耗支持** — 解析并显示 Cursor AI 用量数据
- **Skill 名称提取** — 从 Claude Code `Skill` tool_use 块中提取具体 skill 名称，含显示名称分类
- **改进项目名称提取** — 使用 cwd 解析项目名称并显示完整路径

### 修复
- 会话查询 LEFT JOIN 后 SQL 列限定符（`ts`、`tool`）歧义
- Codex 记录显示 `model=unknown` — 解析水印前行并扫描 `turn_context` 事件进行回填
- `formatRelativeTs` 负偏移保护和空记录状态处理
- 会话详情端点中去除 `skill__` 前缀显示名
- SQL LIKE 下划线转义防止 `skill_view` 匹配 `skill__` 过滤器
- 回填 `skill__unknown` 行（不仅限于旧版 Skill 行）
- 当 `input.skill` 缺失时从 `input.name` 提取 skill 名称，同时检查 `input.skillName`
- 工具调用信息提示边框颜色修正
- 验证 `/api/tool-calls` 中的 `toolType` 参数
- 会话详情 URL 中始终包含 `tool` 和 `device` 参数
- 当基于 cwd 的项目名未知时回退到 `source_file` 提取

### 变更
- 移除未使用的 `aiusage-data` gitlink

---

## [1.3.0] - 2026-05-25

### 新增
- CNY 定价与实时汇率 — 以人民币显示价格，启动时自动获取汇率，设置中可配置货币和汇率
- 全新 UI 重设计与设计系统
- Qoder 结构化会话日志解析 ([#5](https://github.com/juliantanx/aiusage/pull/5)，@jlxyfll 贡献)
- Qoder SQLite 数据库解析、cwd 追踪和设置页面重构
- 过滤状态跨页面刷新持久化
- 重置命令、解析进度条和状态设备名修复

### 修复
- 清除覆盖时将 exchangeRate 存储重置为缓存汇率
- 移除 serve.ts 和 pricing.ts 中未使用的导入
- 显式推送带注释的标签以触发下游工作流

---

## [1.2.1] - 2026-05-22

### 新增
- Node.js 18–24 兼容性和多版本 CI 测试
- `pnpm rebuild:sqlite` 脚本，切换 Node 版本后重新编译原生模块
- 自动化 Star History 每日刷新工作流
- Release Patch 一键发布补丁工作流

### 变更
- README（英文/中文）：Node 版本说明、重编译文档、Hermes 支持

---

## [1.2.0] - 2026-05-22

### 新增
- **Hermes Agent 解析器** — 检测并显示 Hermes AI agent 使用情况 ([#3](https://github.com/juliantanx/aiusage/pull/3))
- Hermes 水印管理器和工具类型集成

### 修复
- 将 hermes 添加到工具过滤白名单，修复孤立会话的 token 导入

### 变更
- 通过 engine 约束设置最低 Node.js 要求为 >=18

---

## [1.1.1] - 2026-05-21

### 修复
- UI 布局不再限制为 1100px 最大宽度，修复高分辨率/宽屏显示器右侧空白
- 文档页面文本限制为 72ch 最大宽度以提高宽屏可读性
- `serve` 命令现在优雅处理被占用的开发端口

### 变更
- CI npm 认证重写为直接写入 `~/.npmrc`，不再依赖 `setup-node` registry-url

---

## [1.1.0] - 2026-05-21

### 新增
- 可折叠侧边栏导航，分组区域（分析、数据、管理）与图标
- 应用内文档页面（`/docs`），含 CLI 参考和功能指南
- Token 图表分解/总计模式切换 — 在分类柱状图和单一组合柱状图之间切换
- token 详情表新增思考 token 列

### 修复
- 路由变化时导航活动状态正确更新
- `thinkingTokens` 空值守卫防止字段缺失时 token 总计出现 NaN
- 文档页面目录在 701–800px 视口的粘性偏移修正
- 文档页面响应式断点对齐至 800px
- 侧边栏折叠按钮提示使用 i18n（`nav.expand` / `nav.collapse`）

### 变更
- 导航首页标签重命名：Dashboard → Home
- 更新 README 截图（仪表盘、概览、token 页面）

---

## [1.0.6] - 2026-05-17

### 变更
- CLI 包添加包元数据（homepage、repository、keywords、license）
- README 截图通过 jsDelivr CDN 提供以支持国内访问

---

## [1.0.5] - 2026-05-17

### 变更
- README 截图压缩并重新导出为干净的 PNG
- npm 包中添加 README 文件

---

## [1.0.4] - 2026-05-17

### 新增
- **设置页面** — 通用/源/同步/数据分区，支持 i18n
- **运行时设置控制器** — 更改立即生效无需重启
- **首页重设计** — 实时 token 计数器替代概览统计；统计移至 `/overview`
- **开发模式支持** — tsx 和 Vite API 代理
- 设置表单中的凭据显示/隐藏切换
- `weekStart` 配置字段用于每周聚合起始日

### 修复
- 设置表单动态 type 属性、i18n 显示/隐藏标签
- 空字符串的设备名回退处理
- 轮询间隔使用空值合并回退
- `onConfigUpdated` 测试服务器 try/finally 清理

---

## [1.0.3] - 2026-05-16

### 修复
- **修复 6 个安全和正确性问题**
- 定价表新增模型价格，清理思考相关死代码

### 变更
- 改进测试覆盖率

---

## [1.0.2] - 2026-05-16

### 新增
- **分层项目提取** — 从会话数据中更智能地解析项目名称

### 变更
- 移除仓库中的 superpowers 规划产物

---

## [1.0.1] - 2026-05-16

### 新增
- **OpenCode 支持** — 从 SQLite 解析并显示 OpenCode AI 工具用量
- **自定义源路径** — 配置非默认日志文件位置
- **跨平台修复** — 改善 macOS、Linux 和 Windows 兼容性
- **完整 UI 重设计** — Obsidian Terminal 主题，支持 i18n 和主题系统
- **双向数据同步** — 与 GitHub 和 S3 后端进行拉取/推送
- **Docker 支持** — 容器化部署与部署指南
- **多设备过滤** — CLI 的 `--device` 参数，Web 仪表盘的设备选择器
- **定价管理** — 在设置中编辑和自定义模型定价
- **后台同步** — 进度追踪，按小时分区与数据库视图
- **工具过滤** — 按工具类型过滤仪表盘视图

### 修复
- 包重命名为 `@juliantanx/aiusage` 以避免 npm 命名冲突
- 定价表更新为已验证的 2026 模型价格
- 解析数据丢失和准确性问题
- 防止记录 ID 冲突，跳过检查中包含缓存 token
- 时间戳归一化为整数，添加冲突重试逻辑

---

[1.5.17]: https://github.com/juliantanx/aiusage/compare/v1.5.16...v1.5.17
[1.5.16]: https://github.com/juliantanx/aiusage/compare/v1.5.15...v1.5.16
[1.5.15]: https://github.com/juliantanx/aiusage/compare/v1.5.14...v1.5.15
[1.5.14]: https://github.com/juliantanx/aiusage/compare/v1.5.13...v1.5.14
[1.5.13]: https://github.com/juliantanx/aiusage/compare/v1.5.12...v1.5.13
[1.5.12]: https://github.com/juliantanx/aiusage/compare/v1.5.11...v1.5.12
[1.5.11]: https://github.com/juliantanx/aiusage/compare/v1.5.10...v1.5.11
[1.5.10]: https://github.com/juliantanx/aiusage/compare/v1.5.9...v1.5.10
[1.5.9]: https://github.com/juliantanx/aiusage/compare/v1.5.8...v1.5.9
[1.5.8]: https://github.com/juliantanx/aiusage/compare/v1.5.7...v1.5.8
[1.5.7]: https://github.com/juliantanx/aiusage/compare/v1.5.6...v1.5.7
[1.5.6]: https://github.com/juliantanx/aiusage/compare/v1.5.5...v1.5.6
[1.5.5]: https://github.com/juliantanx/aiusage/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/juliantanx/aiusage/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/juliantanx/aiusage/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/juliantanx/aiusage/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/juliantanx/aiusage/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/juliantanx/aiusage/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/juliantanx/aiusage/compare/v1.3.4...v1.4.0
[1.3.4]: https://github.com/juliantanx/aiusage/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/juliantanx/aiusage/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/juliantanx/aiusage/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/juliantanx/aiusage/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/juliantanx/aiusage/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/juliantanx/aiusage/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/juliantanx/aiusage/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/juliantanx/aiusage/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/juliantanx/aiusage/compare/v1.0.6...v1.1.0
[1.0.6]: https://github.com/juliantanx/aiusage/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/juliantanx/aiusage/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/juliantanx/aiusage/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/juliantanx/aiusage/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/juliantanx/aiusage/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/juliantanx/aiusage/releases/tag/v1.0.1
