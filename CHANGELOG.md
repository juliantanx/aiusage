# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Kelivo backups written by SQLite-era builds could not be imported** — Kelivo moved its chat storage from Hive to SQLite, and a backup `.zip` now carries `database/kelivo.db` instead of `chats.json`, so every import failed with `chats.json not found in zip`. The importer now reads the archive's SQLite database, and it also accepts a `.db`/`.sqlite` file selected directly, while `chats.json` keeps working. The SQLite schema's microsecond timestamps are converted, and cache-write and reasoning tokens — kept in the database's `extras_json` or in `chats.json` — are imported instead of being dropped. Following the rest of AIUsage, cache-write and reasoning tokens are now reported as their own columns rather than folded into input and output tokens.
- **Kelivo records took the provider name from the app's settings** — `providerId` is a user-facing provider label ("OpenAI - MiMo") or, for some rows, a UUID, so provider breakdowns grouped by proxy configuration instead of by model vendor. A record now carries the provider inferred from its model, and keeps the Kelivo label only when the model is not recognised.
- **A Kelivo database was not re-read once its size stopped growing** — the parser's watermark skips a file whose recorded offset reached its end, which is right for append-only logs but wrong for SQLite: it rewrites existing pages and appends to its `-wal` without changing the main file's size, so new messages stayed invisible after the first import. Kelivo databases are now read in full on every run, and a record is only written when its values actually changed, so re-reading neither duplicates nor re-marks synced rows as new.
- **Copying a live Kelivo database could take the database and its WAL apart** — the files were copied one after another, so a checkpoint in between produced a snapshot that was silently missing recent rows. A database that still has a sidecar is now snapshotted with SQLite's online backup, which includes uncheckpointed WAL frames and is never a mixture of the two. The file-by-file copy is left for databases SQLite cannot read online, and reports the same kind of warning. A database copied without its `-wal` (an upload from a running Kelivo) still imports, and now reports that the newest messages may be missing instead of finishing silently.

---

## [1.5.22] - 2026-10-14

Harden local state and scheduled uploads, make LiteLLM pricing deterministic, and reduce site database work.

### Fixed
- **Monthly leaderboard auto-upload uploaded continuously** ([#131](https://github.com/juliantanx/aiusage/pull/131) by [@aaroncchung](https://github.com/aaroncchung)) — the Monthly interval (2592000000 ms) is above the largest delay a Node timer holds, so the timer fired every millisecond and `aiusage serve` parsed and uploaded back to back. Auto-upload now waits one interval from the last successful upload, which is stored in `state.json`, so a config save or a restart no longer starts the wait again. Manual uploads count towards the schedule, and a failed or rejected upload is retried after an hour. An installation with auto-upload on uploads once at the first `serve` start after upgrading.
- **Interval settings accepted any value** ([#131](https://github.com/juliantanx/aiusage/pull/131) by [@aaroncchung](https://github.com/aaroncchung)) — `PUT /api/config` now answers 400 `INVALID_INTERVAL` for a `refreshInterval` below 1 second, a `syncInterval` below 1 minute, a `leaderboardUploadInterval` outside 1 hour to 365 days, or a refresh or sync interval above the timer limit (2^31 − 1 ms). A blank or zero value still removes the setting.
- **An unreadable `state.json` or `config.json` was overwritten** ([#132](https://github.com/juliantanx/aiusage/pull/132) by [@aaroncchung](https://github.com/aaroncchung)) — a file that exists but does not parse was treated as missing, and the next save wrote a default over it: a truncated `state.json` gave the installation a new device identity and dropped its sync consents, and a `config.json` with a typo lost its settings. Both files are now written through a temporary file and a rename, and a file that cannot be read is never written over. The command prints an error that names the file, leaves it untouched and exits non-zero.
- **A failed background sync ended `aiusage serve`** ([#132](https://github.com/juliantanx/aiusage/pull/132) by [@aaroncchung](https://github.com/aaroncchung)) — an error thrown during a background sync was an unhandled rejection and stopped the process; cloud sync on an installation with no `state.json` was one way to reach it. The error is now caught and shown in the sync status, `state.json` is created before every command, and a sync reports a missing or unreadable state file as a failed run.
- **LiteLLM price sync let a reseller's entry replace a model's own price** ([#133](https://github.com/juliantanx/aiusage/pull/133) by [@aaroncchung](https://github.com/aaroncchung)) — the sync drops the provider prefix of an id, so `aihubmix/claude-haiku-4-5`, `vertex_ai/claude-haiku-4-5` and `claude-haiku-4-5` share one price key, and the last entry in the file won. Each key now has one owner: the entry listed under the key itself, otherwise the model developer's own entry, otherwise a fixed provider order with `aihubmix` last; an entry priced at zero does not take a key from a priced one. The result no longer depends on the order of the file. Stored prices are corrected at the next price sync.
- **Site queried the database for every unsaved config key and loaded the session twice per request** ([#134](https://github.com/juliantanx/aiusage/pull/134) by [@aaroncchung](https://github.com/aaroncchung)) — `readConfig` cached a value only when `site_config` had a row for the key, so until an admin saved the form every lookup was a query, and an upload read eleven risk settings per snapshot (57 config queries for five snapshots). A missing key is now cached for the same 60 seconds as a stored one, the risk settings are read once per upload, and `requireUser` and `requireAdmin` use the user the request hook already loaded.

---

## [1.5.21] - 2026-10-12

Protect destructive CLI operations, make cloud synchronization generation-aware, correct Sessions analytics, and preserve leaderboard data and moderation.

### Fixed
- **Leaderboard rows deleted when upload history was pruned** ([#127](https://github.com/juliantanx/aiusage/pull/127) by [@aaroncchung](https://github.com/aaroncchung)) — `leaderboard_metrics` referenced its upload request with `ON DELETE CASCADE`, so the cleanup job that removes upload requests older than the "Keep upload history" setting (180 days by default) deleted the leaderboard rows those requests had written. Site migration v16 makes the column nullable and the key `ON DELETE SET NULL`; it runs by itself at the first startup, and pruning now leaves the leaderboard alone.
- **Leaderboard moderation undone by the next upload** ([#127](https://github.com/juliantanx/aiusage/pull/127) by [@aaroncchung](https://github.com/aaroncchung)) — a new upload of a period an admin had hidden made its rows public again, and approve, reject and hide on a snapshot that a later upload had superseded changed nothing while reporting success. Hidden rows now stay hidden across uploads; the snapshot actions match on user and period, report how many rows changed, and fail for a snapshot that does not exist. Approving a snapshot publishes only rows written by that upload or by an accepted or approved upload of the same period, and uploads and moderation of one user are serialized.
- **Records marked as synced that the cloud never received** ([#129](https://github.com/juliantanx/aiusage/pull/129) by [@aaroncchung](https://github.com/aaroncchung)) — after uploading, cloud sync read the uploadable records again and marked all of them, so a record parsed during the upload was marked without being sent, and a record rewritten during the upload counted as synced although its newer version was not. Each batch is now acknowledged when the cloud accepts it, and a record is marked only if it still is the version that was sent.
- **Nothing uploaded after the cloud was cleared** ([#129](https://github.com/juliantanx/aiusage/pull/129) by [@aaroncchung](https://github.com/aaroncchung)) — clearing the cloud starts a new sync generation, but a device that had already synced kept its sync state and uploaded nothing to it. The generation is now stored per sync target, and when a pull reports a different one the device uploads its records again. A device whose cloud was cleared before this release uploads its history once more on the first sync; records the cloud already has are left as they are. Only one cloud sync runs at a time per installation.
- **Sessions list inflated tokens and cost** ([#130](https://github.com/juliantanx/aiusage/pull/130) by [@aaroncchung](https://github.com/aaroncchung)) — the list joined records to tool calls before summing, so a record's tokens and cost were counted once per tool call. Records are now totalled per session first and the tool-call count is attached afterwards.
- **Session header covered only part of a multi-model session** ([#130](https://github.com/juliantanx/aiusage/pull/130) by [@aaroncchung](https://github.com/aaroncchung)) — the header grouped by tool and model as well as session. It now covers the whole session, and `GET /api/sessions/:id` returns the models used as `session.models`.
- **Sessions paging** ([#130](https://github.com/juliantanx/aiusage/pull/130) by [@aaroncchung](https://github.com/aaroncchung)) — the Sessions page returns to the first page when the date range or device changes and ignores late responses for an earlier filter. `GET /api/sessions` answers 400 `INVALID_PARAM` for a `page` or `pageSize` that is not a positive integer, where it used to clamp the value or fail with a 500.
- **`clean --before` cleared the whole cloud copy** ([#128](https://github.com/juliantanx/aiusage/pull/128) by [@aaroncchung](https://github.com/aaroncchung)) — the cloud backend has no partial delete, and a clean limited to older records still called its clear endpoint, which removes everything and starts a new sync generation. Only `clean --all` clears the cloud now; `--before` cleans locally and says the cloud is left untouched.
- **Menu clean ran on any input** ([#128](https://github.com/juliantanx/aiusage/pull/128) by [@aaroncchung](https://github.com/aaroncchung)) — in the menu, Data → Clean deleted records older than 180 days for an empty line or any input other than `2` or `3`, and passed `--yes`, which skipped the confirmation. It now runs only on an explicit `1`, cancels otherwise, and leaves the confirmation to the command.
- **`aiusage init` dropped existing settings** ([#128](https://github.com/juliantanx/aiusage/pull/128) by [@aaroncchung](https://github.com/aaroncchung)) — `init` rebuilt the config from a few fields, losing every other key, and with no `--backend` it also removed the sync configuration; the menu's Init entry runs exactly that. Every path now keeps the existing config and changes only what was passed. Sync is removed only by an explicit `--backend skip`.

---

## [1.5.20] - 2026-10-10

Fix cached-input accounting and restore GitHub sync on current Git for Windows releases.

### Fixed
- **Codex cached input tokens counted and billed twice** ([#73](https://github.com/juliantanx/aiusage/pull/73) by [@aaroncchung](https://github.com/aaroncchung)) — Codex logs `input_tokens` inclusive of `cached_input_tokens`, and the parser stored both as-is. Every other tool stores input as the uncached part only and pricing charges input and cache-read separately, so cached Codex tokens appeared in both the input and the cache-read column and were charged once at the input price and again at the cache-read price, overstating Codex input tokens, total tokens and cost. The parser now stores `input_tokens - cached_input_tokens` as input. Database migration v15 applies the same correction to the Codex records this device already parsed and marks them changed so the corrected values are published on the next sync; costs that came from pricing are recomputed right after the migration, once the curated prices are seeded and the runtime price table (registry, aliases and legacy `config.priceOverrides`) is loaded, so they match what the parser would compute. Logged costs are kept. Codex records pulled from another device are corrected when that device upgrades and syncs.
- **CodeFuse embedded Codex sessions counted and billed cached input tokens twice** ([#74](https://github.com/juliantanx/aiusage/pull/74) by [@aaroncchung](https://github.com/aaroncchung)) — sessions CodeFuse runs through its embedded Codex engine log `input_tokens` inclusive of `cached_input_tokens`, and the parser stored both as-is, so cached tokens appeared in both the input and the cache-read column and were charged once at the input price and again at the cache-read price. The parser now stores `input_tokens - cached_input_tokens` as input for those sessions; CodeFuse's Claude Code and native formats were already correct. CodeFuse parsing is versioned in `watermark.json`: the upgrade re-imports every CodeFuse log once, and since record ids do not depend on the token counts, the corrected input tokens and cost replace the old rows in place and are published on the next sync. Records whose log file no longer exists cannot be re-imported and keep their old values.
- **Corrections from another device ignored after a local pricing recalculation** ([#73](https://github.com/juliantanx/aiusage/pull/73) by [@aaroncchung](https://github.com/aaroncchung)) — *Recalculate pricing* stamped every record it repriced with the local time, including copies of records pulled from other devices. Such a copy then looked newer than anything its owner published afterwards, so a later correction reached `synced_records` but never the merged copy that summaries and exports read. Recalculation now marks only locally parsed records as changed, and a merged copy whose token counts differ from its owner's current record is refreshed regardless of timestamps, which also repairs copies an earlier recalculation had already stamped.
- **GitHub sync failed on Git for Windows 2.56** ([#72](https://github.com/juliantanx/aiusage/pull/72) by [@aaroncchung](https://github.com/aaroncchung)) — Git for Windows 2.56 rejects `GIT_CONFIG_GLOBAL=NUL`, causing every isolated Git command to fail before syncing. Windows now uses an AIUsage-owned empty regular file for the global Git config while system config, inherited Git settings, credential persistence and hooks remain disabled. Git failures now include a sanitized actionable summary without copying server-controlled output or leaking credentials.

---

## [1.5.19] - 2026-09-24

Improve Antigravity attribution, cloud sync accounting, and pricing for newly released models.

### Fixed
- **Antigravity usage attributed to placeholder model ids** ([#70](https://github.com/juliantanx/aiusage/pull/70) by [@Ntrxi](https://github.com/Ntrxi); fixes [#68](https://github.com/juliantanx/aiusage/issues/68)) — a usage row's numeric model id took precedence over the readable model stored beside it, so every model whose id was missing from the parser's hard-coded table (1050, 1071, 1264, 1298, 1299, 1318, …) was imported as `antigravity-model-<id>` with `provider=unknown` and a $0 cost, and the list grows with every model Antigravity ships. A generation or step is now named from its own readable metadata first: the model name Antigravity assigned to the row (`gemini-3.8-flash`, `gemini-3.5-flash-high`; canonicalised when it is a known variant) as long as it agrees with what the row's `MODEL_PLACEHOLDER_M<n>`, display label or known id says it ran (so it refines the identity with an effort or variant qualifier but never contradicts it), then `MODEL_PLACEHOLDER_M<n>` (which denotes id `1000 + n` and also supplies the id when a row stores none), then the display label (canonical or slugified), then the hard-coded id table, then the executor model (which is not always the row's own model), then a routing alias such as `gemini-default` (whose target moves between releases), then a model-shaped value from the `executor_metadata` table, then any remaining name verbatim; `antigravity-model-<id>` is used only when nothing readable exists. A usage event inherits a name only from a row whose id equals its own, otherwise from rows elsewhere in the same database that name its id (every row is consulted, and usage imported earlier under a placeholder is re-emitted once a later row names its id, so an incremental import ends where a full one would), then from the hard-coded id table, and from the id-less row it was read from only as a last resort — so Antigravity's helper model (id 1050, never named) is no longer billed as the conversation's model. Two copies of one response that disagree on the model id are no longer merged field by field: the first copy is kept whole, so neither the other copy's name nor its token counts move to another model. The hard-coded ids for Claude 4.5 Sonnet/Haiku now resolve to the priceable `claude-sonnet-4-5`/`claude-haiku-4-5`. Antigravity parsing is versioned in `watermark.json`: the upgrade re-imports every conversation database once, and since record ids do not depend on the model, the corrected model, provider and cost replace the old rows in place instead of duplicating them.
- **Gemini 3.x Pro usage priced at $0** ([#70](https://github.com/juliantanx/aiusage/pull/70) by [@Ntrxi](https://github.com/Ntrxi); fixes [#69](https://github.com/juliantanx/aiusage/issues/69)) — LiteLLM lists Gemini 3.1 Pro only as `gemini-3.1-pro-preview`, and prefix matching only helps a model name that is longer than the registry key, so records correctly identified as `gemini-3.1-pro` kept `costSource=unknown`. The pricing registry now seeds builtin aliases `gemini-3.1-pro`, `gemini-3.1-pro-high`, `gemini-3.1-pro-low` → `gemini-3.1-pro-preview` (likewise the `gemini-3-pro` family → `gemini-3-pro-preview` and `gemini-3-flash` → `gemini-3-flash-preview`) on every database open and after each pricing sync, whenever the target price exists and neither a price nor an alias of that name does, so a user binding or a real key LiteLLM adds later always wins, and an alias it seeded follows the curated list when its target changes; the site seeds the same aliases on every startup and during the admin *Sync pricing* action, so new uploads are priced without a manual sync, and existing leaderboard costs follow on the next admin leaderboard recompute. The alias affects price resolution only: records keep the model name the parser gives them. Antigravity's effort-qualified `gemini-3.1-pro-high`/`-low` are no longer collapsed to `gemini-3.1-pro`; they keep their own identity and price the same. *Recalculate pricing* (or the one-time Antigravity re-import) repairs existing $0 records.
- **Cloud sync push result counters** ([#67](https://github.com/juliantanx/aiusage/pull/67) by [@Ntrxi](https://github.com/Ntrxi)) — the site now distinguishes newly inserted records, newer updates, and stale or equal no-ops instead of reporting every successful UPSERT as an insert. Site tests and builds now run in pull-request CI.
- **New model prices on stale registries** ([#71](https://github.com/juliantanx/aiusage/pull/71) by [@Ntrxi](https://github.com/Ntrxi)) — seed verified standard-tier prices for Claude Opus 5.5, GPT-6 Sol, and GPT-6 Luna on CLI database open and site startup without overriding LiteLLM-synced or user-defined prices.

---

## [1.5.18] - 2026-09-20

Fix multi-device sync correctness across GitHub, S3/R2, and Cloud.

### Fixed
- **Multi-device sync lost and duplicated records** — two machines sharing one GitHub or S3 sync target could report different totals, a phantom `unknown` device could appear, and ids retired by a local rebuild or by an id-generation change lived on remotely and on every peer. Root causes and fixes:
  - *Antigravity (and Trae) wire-id collisions*: records were published under `sha256(device, sourceFile, lineOffset)`, but several Antigravity usage events share one generation index and every Trae session shares offset 0, so on one machine 972 local records became 929 remote ones. Both tools now publish under their parser-generated `record.id`.
  - *Upsert-only namespaces*: upload merged into the remote day files and never removed anything, and pull never dropped rows that had vanished from a peer's namespace. Each device's namespace (`data/<deviceInstanceId>/`) is now an authoritative snapshot of its local database: upload rewrites only files whose canonical content differs (line order is ignored; duplicated or malformed lines force a rewrite; S3/R2 ETags avoid even reading unchanged files), then publishes a `manifest.json` with per-file digests, then deletes day files with no local records left (a namespace that empties out publishes an empty manifest before its last day files go), and never touches another device's namespace. Pull verifies every foreign namespace against its manifest and mirrors it exactly, removing `synced_records` rows and their merged copies that are no longer present remotely. Locally parsed records are never deleted by sync. A sync without changes writes nothing.
  - *Per-target claims*: every pulled row is claimed by the sync targets it was read from (`sync_record_claims`, cloud included). Reconciling one target replaces only that target's claims — a target only ever releases its own claim, and a cloud tombstone never touches a row the cloud does not claim — and a row is deleted only once no target claims it, so a record dropped from one repository but still carried by another (or by the cloud) is kept. `sync --repair --apply` and `aiusage clean` drop the claims of the rows they delete, so a claim never outlives its row.
  - *Upgrading with several sync targets*: rows mirrored before claims existed are marked *unresolved* (`synced_records.unclaimed_since`) and are never pruned by a single target. Each reliable reconciliation records a verdict per target and namespace (`sync_namespace_verdicts`, on a monotonic sync clock), and an unresolved row goes only once every target recorded in `state.json` has judged its namespace after the row became unresolved. Syncing target A first can therefore no longer delete a record that target B still carries; rows read from a namespace that could not be verified are protected the same way, and a target that is never synced again is handled by `sync --repair`, which now also reports unresolved rows that the configured target's verified namespace does not contain.
  - *A known target that has not looked yet*: releasing a row's last claim used to delete it even when another known target had simply not established its claims yet — never synced since the upgrade or since `clean --all` — so a record that left target A was dropped although target B still carried it, and came back with B's next sync. Such a row now becomes unresolved instead and is deleted at once only when every known target has a verdict for its namespace (a target with a verdict and no claim did not carry the row at its last reliable read); the missing target's first verdict either claims it, with no re-insertion, or settles it. Cloud tombstones and cloud generation resets follow the same rule, and a tombstone now releases only the claim held for the device it comes from, so the same id still published by another device is no longer deleted with it. For a configuration whose key changed with this release (non-default branch, prefix or endpoint) the pre-upgrade key is such a target for as long as the device counts it: nothing is pruned until it syncs again or is released with `--forget-target`, as `aiusage sync` points out after every sync. A target's verdict on a namespace is also withdrawn when the target reads that namespace again and recorded anew only by a reliable reconciliation, so after an unverifiable read, or a sync that failed part-way, what the target concluded earlier cannot let another target settle a row it has just been seen to hold. Known limitation: every cloud account shares the target key `cloud` (the device credentials carry no account identity), so logging into another account is treated as the same target whose content changed; see *Target identity* in `docs/sync-namespaces.md`.
  - *Namespaces with no day files*: the listing only shows day files, so a previously claimed namespace whose day files are gone is now interpreted through its manifest — no manifest means deleted, a valid empty manifest means authoritatively empty (both reconciled against the empty set), a manifest naming missing files or one that does not parse means unverifiable (skipped, claims and rows kept). Previously all four read as "deleted".
  - *Cloud wire format*: the CLI pushed the device alias as `device` while the server reads and returns `deviceName`, so aliases were stored as `null` and pulled records had none; Postgres bigints also came back as strings. `sync/cloud-dto.ts` now translates in both directions and a pull containing a record the client cannot represent fails instead of silently omitting it.
  - *Sync target identity*: the key that scopes consent, publish bookkeeping and claims used to be the repository or bucket name alone, so two branches of one repository, or two prefixes or endpoints on one bucket name, shared it and could prune each other's rows. The key now includes the branch (`github:<repo>?branch=x`) and the prefix/endpoint (`s3:<bucket>?prefix=..&endpoint=..`) whenever they differ from the defaults; default configurations keep their old key. A configuration whose key changed copies the consent, bookkeeping and claims recorded under its old key on its first sync, once — not the namespace verdicts, which permit deletion and may have been made by the default configuration that still uses that key. The old key stays among the known targets for the same reason: the changed configuration alone never settles rows the unchanged one may still carry.
  - *Forgetting a sync target*: a key nothing syncs under any more (typically that old key) keeps every row its claims name — including the retired Antigravity/Trae wire ids — and withholds the verdict unresolved rows wait for, forever; `sync --repair` could not see those rows as orphans because they still had a claim, and only `clean --all` dropped claims. `aiusage sync --repair --forget-target <key>` (dry run; `--apply` performs it) now releases such a key explicitly: in one transaction it deletes the key's claims, verdicts, publish bookkeeping and retired wire ids and marks the rows that lost their last claim unresolved at the tick taken beforehand, then removes the key from `state.json`. It deletes no record itself — the next sync of every remaining known target prunes what none of them carries — refuses the configured target and unknown keys, is safe to re-run after an interruption, and works with the cloud backend configured. Plain `sync --repair` now names every other recorded key as a report-only hint, and `aiusage sync` names the configuration's pre-upgrade key after every successful sync for as long as the device still counts it.
  - *Cloud claims after a generation reset*: a completed cloud pull is authoritative for the cloud target, so a device that no longer returns anything (the server's data was cleared) loses its cloud claims and its rows go unless another target still claims them, instead of stale cloud claims shielding them forever. The pushes that follow use the generation the pull observed (a client that last synced before the server was cleared was rejected as stale), and a pull whose pages report different generations is restarted rather than combined into one snapshot.
  - *Cloud sync generation (server)*: `cloud_sync_resets.sync_generation` is a `BIGINT`, which the site's Postgres driver returns as a string, so clearing cloud data a second time computed `"2" + 1 = "21"` and the generation went 1 → 2 → 21 → 211 …; around the seventeenth clear it would pass 2^53, which the client's strict envelope validation rightly refuses. The clear, push and pull endpoints now read it as a number, and clearing refuses a generation it can no longer increment exactly instead of deleting the data without advancing it. Generations already stored keep working as long as they are below 2^53; an account that was cleared seventeen or more times before this fix is past that and needs its generation renumbered on the server.
  - *Legacy `unknown` rows already pushed*: adopting a row under the real device id changes the wire id of every tool that derives it from the device id (Claude Code, Codex, …). Such rows that had already been published have their old `sha256('unknown', …)` id retired per target (tombstoned on the cloud) and are published again, both by the migration and by the adoption itself.
  - *Fail-closed reconciliation*: the GitHub backend now reports a missing file only for `ENOENT` (`ENOTDIR`, a file where a directory should be, is corruption and throws like permission and I/O errors); a listing or read error aborts the sync before anything is pruned. A stray `.ndjson` file at the top of the data directory is no longer taken for a namespace (which made every sync fail on the `ENOTDIR` of its manifest path). The S3 backend inspects the per-object errors of `DeleteObjects`, so `clean --all` fails instead of reporting a partial wipe as complete. A namespace whose files vanished between listing and reading, contain a malformed line, or do not match their manifest (an S3 rewrite in progress or interrupted — including a record moving between day files) is skipped for that sync instead of being treated as authoritative; `aiusage sync` reports skipped namespaces. A local database failure while applying a pull is never swallowed either: it aborts the sync before reconciliation, which itself runs in one transaction (rows upserted before the failure stay, as unresolved rows no single target can prune). Legacy rows stamped `unknown` that no target claims are dropped only once every known target has read every namespace reliably.
  - *`aiusage clean --before` and manifests*: remote cleanup rewrote and deleted day files without refreshing the namespace manifests, so upgraded peers found digest mismatches and skipped the cleaned namespaces indefinitely. It now follows the snapshot rules of sync: kept records are rewritten canonically, the manifest is refreshed, then emptied files are deleted; namespaces without a manifest stay without one.
  - *Remote cleanup and repair verify before they rewrite*: `clean --before` and `sync --repair --apply` (including `--all-namespaces`) read every namespace through its manifest, exactly as pull does, and only modify a namespace whose snapshot verified — every named file present, every line parsing, every digest matching. A namespace mid-publish by its owner on S3, a missing or mismatching file, an unparsable manifest or a malformed line is skipped and reported instead of being rewritten and blessed with a new manifest (a malformed line is never silently dropped). A manifest written by cleanup or repair can therefore only describe the verified snapshot minus the removed lines, and the owner's next sync settles whatever it published in between. Day files a manifest does not name are left alone.
  - *`aiusage clean --all`*: the remote wipe ran only when the listing showed day files, so a target left with nothing but a `manifest.json` was never cleared; `deleteAllData` now always runs. A full local clean also drops pending retired wire ids together with claims, sync state and tombstones.
  - *Legacy `unknown` device id*: local rows still stamped `unknown` are adopted by the current device before upload, and namespace lines stamped `unknown` are attributed to the namespace owner on pull, so `unknown` no longer shows up as a device.
  - *Merged copies fell behind*: pulled rows updated remotely (e.g. after a cwd backfill on the origin device) are now refreshed in `records`, not only in `synced_records`.
  - Migration v14 adds `sync_record_claims`, `sync_retired_wire_ids`, `sync_namespace_verdicts` and `synced_records.unclaimed_since` (every existing pulled row starts unresolved); the old Antigravity/Trae ids already pushed to the cloud backend are retracted with tombstones, which other devices now honour on pull. Rows pulled before the upgrade settle once every sync target the device has used has synced once; `sync --repair` reports the ones only an abandoned target could have settled as orphaned and removes them with `--apply`.
  - The sync model's invariants and the adversarial scenario matrix that locks them down are documented in [`docs/sync-namespaces.md`](./docs/sync-namespaces.md) (*Invariants*, *Scenario matrix*): record ownership and provenance, claims released only by their own target, deletion only without claims and once every known target has judged the namespace, unresolved rows settled only by every known target's verdict, the three states of a namespace with no day files, verified snapshots as the sole source of deletions, interrupted Git/S3/cloud operations never reading as absence, and the documented "newest version ever observed wins" rule for a record carried at different versions by different targets.
  - `aiusage sync --repair` additionally reports and removes stale and duplicated lines in this device's namespace, orphaned pulled rows, and reports wire-id collisions among local records. `aiusage sync` prints `pruned` and `retired` counts. See [`docs/sync-namespaces.md`](./docs/sync-namespaces.md) and [`docs/sync-repair.md`](./docs/sync-repair.md).

---

## [1.5.17] - 2026-09-15

### Changed
- **Local dashboard navigation** — hide the Service & Support item from the sidebar; the `/support` page remains available by direct URL.
- **Responsive startup parsing** — start listening before the initial parse, yield during historical tool-call backfill, and cache pricing lookups so large local histories do not block the dashboard.

### Fixed
- **Local calendar ranges** ([#62](https://github.com/juliantanx/aiusage/pull/62) by [@Ntrxi](https://github.com/Ntrxi)) — build custom range boundaries and daily aggregation buckets from local calendar dates instead of UTC dates.

---

## [1.5.16] - 2026-09-14

### Added
- **GitHub App authentication for local sync** ([#53](https://github.com/juliantanx/aiusage/pull/53) by [@Ntrxi](https://github.com/Ntrxi)) — add `aiusage github login` device authorization, secure credential storage, and authenticated GitHub sync without requiring users to create and paste a personal access token.

### Changed
- **Hardened local dashboard trust boundary** ([#53](https://github.com/juliantanx/aiusage/pull/53) by [@Ntrxi](https://github.com/Ntrxi)) — bind passwordless servers to loopback by default, require a password for non-loopback and Docker access, reject cross-origin and DNS-rebinding requests, make stored credentials write-only over HTTP, protect sensitive data APIs, and expose only aggregate totals through the public home-summary endpoint. Refresh requests now use `POST`, and authentication cookies honor HTTPS proxy headers.

### Fixed
- **Antigravity parser rejected valid 10-byte varints** ([#54](https://github.com/juliantanx/aiusage/pull/54) by [@Ntrxi](https://github.com/Ntrxi)) — the protobuf varint reader stopped after 8 bytes, so generation or step metadata containing a 10-byte varint could fail and drop every usage record in that row. The reader now accepts the full 10-byte protobuf maximum and still rejects longer sequences.

---

## [1.5.15] - 2026-09-08

### Added
- **Antigravity usage parsing** ([#52](https://github.com/juliantanx/aiusage/pull/52) by [@Ntrxi](https://github.com/Ntrxi)) — discover Antigravity conversation databases across supported installation, backup, and configuration roots, then import token usage from SQLite generation, step, and retry metadata. The parser deduplicates overlapping records, normalizes model aliases for provider and pricing resolution, and maintains a WAL-safe incremental cursor without stalling on empty generations.

---

## [1.5.14] - 2026-09-07

### Fixed
- **Cross-device sync re-uploaded pulled records** ([#51](https://github.com/juliantanx/aiusage/pull/51) by [@Ntrxi](https://github.com/Ntrxi)) — records pulled from another device kept their real `source_file`, so the `source_file NOT LIKE 'synced/%'` heuristic treated them as local and re-uploaded them under the pulling device's namespace with colliding ids (`line_offset = 0`), double-counting usage on every machine. Provenance is now an explicit `records.origin` column (`local` | `synced`); only local rows stamped with the current device id are uploaded, and only under that device's namespace. Pull ignores lines that do not belong to the namespace they sit in, and echoes of the device's own records. Migration v13 back-fills `origin` deterministically for existing databases. A new `aiusage sync --repair [--apply] [--all-namespaces]` command reports and, on request, removes contamination from the local database and the remote namespaces. See [`docs/sync-repair.md`](./docs/sync-repair.md).

---

## [1.5.13] - 2026-09-01

### Fixed
- **Reliable `serve` shutdown** ([#50](https://github.com/juliantanx/aiusage/pull/50); reported by [@lmingde](https://github.com/lmingde) in [#49](https://github.com/juliantanx/aiusage/issues/49)) — make shutdown idempotent, register signal handlers once, close idle HTTP connections immediately, and force-close active connections after a short timeout so `Ctrl+C` always exits without accumulating `close` listeners.

---

## [1.5.12] - 2026-08-18

### Fixed
- **Large Cursor database parsing** ([#47](https://github.com/juliantanx/aiusage/pull/47) by [@chomoe327](https://github.com/chomoe327)) — replace repeated full-table scans with indexed range queries, skip incompatible databases without a `cursorDiskKV` table, and report per-composer progress. Parsing a 2.75 GB database now completes in about 10 seconds instead of stalling for more than 10 minutes, while no-op incremental runs finish in about one second.

---

## [1.5.11] - 2026-07-16

### Fixed
- **Grok Build usage parsing** ([#45](https://github.com/juliantanx/aiusage/pull/45)) — add a dedicated stateful parser for Grok Build `updates.jsonl` logs, convert cumulative token counters into positive per-turn deltas, and restrict discovery to actual usage logs. Historical logs skipped by v1.5.10 are replayed once, while repeated or decreasing counters remain idempotent and do not double-count usage.

---

## [1.5.10] - 2026-07-10

### Added
- **CodeFuse support** ([#42](https://github.com/juliantanx/aiusage/pull/42) by [@Ed-Bg](https://github.com/Ed-Bg)) — detect and parse [CodeFuse](https://github.com/codefuse-ai) usage logs under `~/.codefuse`, covering its multiple log layouts (`projects`, `engine/cc/projects` with Claude-Code-shaped `ant_cc_*.json`, and `engine/codex/sessions`). Token usage is read from the Claude Code, native, and Codex payload shapes, and tool calls are extracted alongside. Override the path with `AIUSAGE_CODEFUSE_PATH`.

## [1.5.9] - 2026-07-06

### Fixed
- **Trae parsing no longer blocks `serve` startup and the dashboard** ([#40](https://github.com/juliantanx/aiusage/issues/40)) — the Trae parser read session metadata by spawning one `git log` per tag (plus a second pass for the no-`chain-start` fallback). On large snapshot stores (~72 repos, ~696 tags) this meant hundreds of git subprocesses per parse — ~40s on Windows — which blocked `/api/refresh` and left the dashboard stuck on the loading state. The parser now reads all tag names and timestamps with a single `git for-each-ref` call per repo (~768 spawns → 72), and the home/overview pages render existing data before triggering a background refresh so first paint is never blocked on log parsing.

## [1.5.8] - 2026-07-01

### Added
- **CodeBuddy IDE support** — detect and parse the Tencent CodeBuddy IDE (including the CN variant), whose per-message JSON logs live under `CodeBuddyExtension/Data/**/CodeBuddyIDE/**/history/<session>/<conversation>/messages/`. The existing `codebuddy` JSONL parser only covered `~/.codebuddy/projects`, so IDE usage went undetected. Token usage is read from each conversation's cumulative `statsSnapshot` (cache-miss input, cached input, output). Reported under the existing **CodeBuddy** tool via a new `codebuddy-ide` source; override the path with `AIUSAGE_CODEBUDDY_IDE_PATH`.

### Fixed
- **CodeBuddy CLI double-counted cached tokens** — the CLI logs usage under both `message.usage` (Anthropic-shaped field names but OpenAI-style semantics, where `input_tokens` already includes cached tokens) and `providerData.rawUsage`. The generic parser assumed Anthropic semantics and added `cache_read_input_tokens` on top of the cache-inclusive `input_tokens`, inflating input by the cached amount (~100× on cache-heavy turns). CodeBuddy now reads the clean `prompt_cache_hit/miss` decomposition from `rawUsage` (falling back to `message.usage` with cache reads subtracted).
- **Backfilled cwd/source_file now propagate across devices** ([#12](https://github.com/juliantanx/aiusage/issues/12)) — cross-device project stats lost Codex (and other cwd-dependent) projects on the device running `aiusage serve`: the cwd and Hermes source_file backfills enriched local records but did not bump `updated_at`, so cross-device sync (which only re-uploads records where `updated_at > synced_at`) never propagated the enriched fields. The backfills now bump `updated_at` to match `backfillCodexModels`. Migration v12 repairs existing installs that ran the buggy v1.5.0–v1.5.7 backfill by re-marking enriched records for one re-upload.

## [1.5.7] - 2026-06-25

### Added
- **Trae support** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — detect and parse Trae sessions, covering the Trae CN, TRAE SOLO CN, and international Trae variants.
- **Cursor privacy-mode parsing** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — fall back to the agent-transcript JSONL logs when Cursor runs with `PRIVACY_MODE_NO_STORAGE`, so usage is still captured.

### Changed
- **Session list shows full date and time** — the Sessions table Time column now shows the date and time (`toLocaleString`) instead of the date only, matching the session detail page.

### Fixed
- **Kiro parser** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — support the `workspace-sessions` JSON format, add a `tokens_generated.jsonl` probe, and fix token estimation.
- **Trae session id extraction** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — read the session id from the v2 subdirectory.
- **Tool discovery audit** ([#35](https://github.com/juliantanx/aiusage/pull/35)) — correctness fixes to Trae, Cursor, Kiro, and KiloCode log discovery (including the KiloCode Windows database path).
- **OpenClaw zero-cost records stuck at $0** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — the OpenClaw parser stamped `cost_source = 'log'` whenever a `usage.cost` field was present, even when its `total` was `0`. Custom gateways (e.g. openclaw → `deepseek-v4-pro`) report `cost.total: 0` for models they don't price, so these records were treated as authoritative `$0` and could never be priced. The parser now requires a positive logged cost before using `'log'`, otherwise it falls through to pricing — matching the Cline and Hermes parsers.
- **Recalc corrects log-sourced costs** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — recalc now recomputes a `cost_source = 'log'` record when its logged cost is non-positive (an unreliable gateway-reported `0`) or when the user has set a manual price for that model. This repairs already-imported records without a re-import. Genuinely positive logged costs are still preserved.
- **Legacy config price overrides now apply** ([#13](https://github.com/juliantanx/aiusage/issues/13)) — price overrides configured before the pricing registry existed lived only in `config.json` and were ignored by recalc, so a manually set price never affected recalculated costs. On startup the server now imports `config.priceOverrides` into the registry as user prices (existing UI-set prices are preserved) and clears them from config, making the registry the single source of truth. After upgrading, click **Recalculate** once to apply them to existing records.

---

## [1.5.6] - 2026-06-17

### Added
- **Widget auto-setup** — automatically sets up CLI and runs first parse when `cache.db` is missing, with overlay UI showing setup phases, IPC status channel, and i18n support.

### Fixed
- **CLI per-tool progress** — shows per-tool progress instead of misleading global counter during parsing.
- **CLI corrupted database recovery** — auto-recreates corrupted SQLite database on startup.

---

## [1.5.5] - 2026-06-17

### Fixed
- **Qoder Windows DB path** ([#34](https://github.com/juliantanx/aiusage/pull/34) by @Mnoisec) — use `APPDATA` (Roaming) instead of `LOCALAPPDATA` (Local) for the Qoder Desktop SQLite database path on Windows.

---

## [1.5.4] - 2026-06-15

### Added
- **ZCode parser** ([#33](https://github.com/juliantanx/aiusage/pull/33) by @zhaolu83949426-hub) — adds usage tracking for ZCode CLI by parsing its SQLite database (`~/.zcode/cli/db/db.sqlite`). Reads the `model_usage` table for per-request token counts (input, output, reasoning, cache read/write) and the `tool_usage` table for tool-call invocations. Token records join `session.directory` as the working directory; tool calls are emitted as orphans (no parent record) because ZCode relates them to model requests only via `turn_id` (multi-to-multi). Each table has its own incremental cursor.
- **ZCode env var in site docs** — documents the `ZCODE_DB` environment variable for custom ZCode database paths.

### Fixed
- **Claude Code message deduplication** ([#32](https://github.com/juliantanx/aiusage/pull/32) by @joyshan1986) — deduplicates Claude Code records by `message.id` to prevent duplicate entries.
- **Orphan tool call counting** — counts orphan tool calls in tool-calls and dashboard stats.

---

## [1.5.3] - 2026-06-10

### Added
- **LiteLLM pricing sync** — syncs model pricing from the LiteLLM registry, guides first-time pricing sync in local web, and binds local models to pricing aliases.
- **Cloud global toggle and public pricing** — adds a global cloud kill switch with ban semantics, public read-only pricing page and API endpoint, and per-rule risk enable/disable switches in config.
- **Proxied cloud sync status endpoint** — exposes cloud sync status through a proxied endpoint.

### Fixed
- **Pi session parsing** ([#31](https://github.com/juliantanx/aiusage/pull/31) by @joyshan1986) — extracts per-file session ID for Pi and recognizes its cache token fields.
- **Leaderboard cost aggregation** — aggregates leaderboard costs by period and preserves costs during recompute.
- **Pricing alias resolution** — resolves synced pricing aliases correctly during cost recalculation.
- **Local database write serialization** — serializes local database writes to prevent concurrent write conflicts.
- **Config directory safety** — ensures config directory exists before saving and separates error handling.
- **Pricing table redesign** — removes obsolete cloud sync references and redesigns the pricing table.
- **Snapshot review pipeline** — excludes reviewed snapshots from flagged list and restores leaderboard_metrics visibility on approval.
- **Sync record field naming** — renames `record_id` to `id` in sync API request/response fields; only counts actually changed records in sync pull.

### Changed
- **Pricing management overhaul** — enhances pricing management with recalc tracking, explicit recalculation workflow, and polished interactions.
- **Remove bundled pricing seed** — removes the bundled pricing seed from runtime and the site pricing version model.
- **Site Docker caching** — optimizes site Docker dependency caching.

---

## [1.5.2] - 2026-06-08

### Added
- **Kelivo manual backup import** ([#29](https://github.com/juliantanx/aiusage/pull/29) by @Fiveo9) — adds Kelivo as a manual-import source, parses exported `chats.json` and `.zip` backups, exposes `POST /api/import/kelivo`, and shows import status/results in Settings.
- **Leaderboard join guide** — adds documentation and UI guidance for joining the public leaderboard from the dashboard.
- **High-resolution layout support** — widens site content on large displays while keeping docs navigation and settings layouts aligned.

### Fixed
- **Avatar upload errors and limits** — surfaces clearer upload failures and shows the active avatar size limit dynamically in Settings.
- **Dashboard launch notification** — sends the `install:done` notification when the dashboard opens successfully on the first attempt.
- **Docs anchor navigation** — fixes anchor scrolling with the site header and adds Kelivo manual-import documentation.
- **Homepage URLs, SEO, and headers** — refreshes homepage metadata, canonical URLs, and response headers.

### Changed
- **`aiusage clean` reset workflow** — folds reset behavior into `clean`, propagates cloud-sync clearing through Git, S3, and Cloud Sync, and updates the interactive menu/tests around the new flow.
- **Leaderboard period and settings cleanup** — removes the rolling leaderboard period, simplifies related query/UI code, and keeps settings display behavior consistent.
- **Supported tools wording** — changes fixed `23 tools` copy to `20+ tools` across README, docs, homepage, and release notes.
- **README cleanup** — trims outdated sections before the license and removes obsolete docs assets.

---

## [1.5.1] - 2026-06-07

### Added
- **Auth error i18n** — login, register, forgot-password, and reset-password pages now return machine-readable error codes and display localized messages (EN/ZH).
- **Branded HTML email templates** — verification and password reset emails use a responsive branded layout with logo, card design, and styled CTA button.
- **Verify-email page** — dedicated verification result page with success/error UI replaces the previous server-only redirect; works on any device.
- **Cross-device email verification** — after registration, the PC page polls for verification status and auto-redirects to sign-in once the email link is opened on another device.
- **OAuth unlink safety** — prevents unlinking the last remaining auth method; re-links existing user by email when re-logging in via OAuth.
- **Admin config display multiplier** — byte values now display as MB and millisecond values as seconds in the admin config panel.
- **Leaderboard @username display** — shows `@username` below display name in leaderboard entries to distinguish users with identical display names.

### Fixed
- **Leaderboard cache invalidation** — `unbanUser` and `setUserRole` now properly invalidate the leaderboard cache.
- **Cache-Control: no-store for API responses** — added `Cache-Control: no-store` to all `/api/` routes in hooks and directly on the leaderboard endpoint to prevent Cloudflare from caching dynamic API responses.
- **Avatar upload body size limit** — removed invalid `bodySizeLimit` svelte.config.js option; adapter-node uses `BODY_SIZE_LIMIT` env var instead.

### Changed
- **OAuth re-linking on login** — when a user logs in via OAuth and an account with the same email already exists, the identity is linked to the existing account instead of failing with a duplicate key error.

---

## [1.5.0] - 2026-06-07

### Added
- **Windows dashboard launcher** ([#23](https://github.com/juliantanx/aiusage/pull/23) by @joyshan1986) — adds a dedicated Windows launcher so the dashboard can be opened without a shell wrapper.
- **Token leaderboard, cloud sync, and web enhancements** ([#24](https://github.com/juliantanx/aiusage/pull/24)) — introduces the token leaderboard, expands the cloud-sync workflow, and updates the web dashboard around the new sync and leaderboard flows.
- **Interactive `aiusage menu` command** ([#25](https://github.com/juliantanx/aiusage/pull/25)) — adds a terminal menu for common CLI actions from one place.
- **Password-protected dashboard unlock flow** ([#27](https://github.com/juliantanx/aiusage/pull/27) by @Fiveo9) — adds local dashboard password protection and unlock flow.
- **Session detail improvements and leaderboard features** ([#28](https://github.com/juliantanx/aiusage/pull/28)) — expands the session detail page and leaderboard workflow with more context and admin-side usability improvements.
- **Password reset flow and Resend email provider** — adds forgot-password and reset-password support, plus admin enhancements for account recovery and moderation.
- **Widget currency-aware cost display and UI refresh** — the widget now reflects the selected currency and ships a redesigned i18n/settings/chart experience.

### Fixed
- **Cloud Sync verification and sync reliability** — gates Cloud Sync behind GitHub star verification, preserves sync config correctly, fixes R2 path-style handling, and repairs uploaded-record counts.
- **OAuth and auth flow hardening** — replaces cookie-based OAuth state with in-memory storage, fixes explicit `Set-Cookie` handling, derives secure cookies from `SITE_URL`, and uses SvelteKit redirects for GitHub OAuth start.
- **Dashboard and leaderboard polish** — auto-parses logs on `serve` startup, replaces upload result summaries with success toasts, improves the leaderboard podium and sort filters, and tightens admin badge and role-toggle layout.
- **Web UI cleanup** — improves dark-theme contrast, suppresses the dialog overlay a11y warning, and trims layout friction in the filter selectors.

### Changed
- **Docs and release content refreshed** — updates dashboard docs/screenshots, the project overview and security policy, demo GIF hosting, and the site/version metadata to `1.5.0`.

---

## [1.4.0] - 2026-06-03

### Added
- **GitHub Copilot usage tracking and quota support** ([#19](https://github.com/juliantanx/aiusage/pull/19)) — CopilotParser for OTEL JSONL files (Copilot CLI and VS Code Copilot Chat), Copilot quota API query via GitHub OAuth token, auto-discovery of `~/.copilot/otel/*.jsonl` and `$COPILOT_OTEL_FILE_EXPORTER_PATH`
- **KiloCode parser support** ([#20](https://github.com/juliantanx/aiusage/pull/20) by @zhaolu83949426-hub) — parser for KiloCode VS Code extension SQLite database (`kilo.db`), supports input/output/cache/thinking tokens and cost calculation
- **Per-model token breakdown with stacked bar visualization** ([#21](https://github.com/juliantanx/aiusage/pull/21)) — API exposes inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens, totalCost per model; unified ranked list with stacked composition bars
- **Auto-detect tools and expand from 8 to 22** ([#22](https://github.com/juliantanx/aiusage/pull/22)) — automatic detection of installed AI tools replaces manual source path configuration; read-only Detected Tools panel in settings UI; `GET /api/detected-tools` endpoint
- **USD/CNY currency toggle** ([#17](https://github.com/juliantanx/aiusage/pull/17)) — segmented toggle in Pricing page to switch between USD and CNY display with exchange rate conversion
- **Expanded model pricing table** — added OpenRouter, Google, and additional Claude/OpenAI model variants; new `inputText` pricing field for models with separate text input pricing

### Fixed
- **Auto-recalculate costs after pricing save/reset** ([#15](https://github.com/juliantanx/aiusage/pull/15)) — server automatically recalculates all record costs after save/reset, removing the need for manual recalculation; fix edit form layout for Chinese labels
- **Fallback to credential file when keychain data is unusable** ([#18](https://github.com/juliantanx/aiusage/pull/18)) — falls through to file-based credentials when macOS Keychain entry is not usable (parse error, wrong auth_mode)

### Changed
- Removed announcement banner from site layout
- Simplified hero section on homepage

---

## [1.3.4] - 2026-05-29

### Fixed
- **Widget global install crash** — `aiusage-widget` failed with `Cannot find module 'electron'` after `npm install -g`, because `electron` was a dev dependency and never installed for end users. It is now a runtime dependency.
- **Cross-platform native binding** — the widget previously shipped a single prebuilt `better-sqlite3` binary built on the CI runner (Linux x64), which could not load on macOS or Windows. A `postinstall` step now fetches the `better-sqlite3` binding matching the user's platform, arch, and the installed Electron ABI, without disturbing the Node-ABI binding used by the CLI.

---

## [1.3.3] - 2026-05-28

### Added
- **Logo redesign** — new rising bar chart icon replacing the previous logo
- **Contact footer** — WeChat QR popup, Discord, Telegram, and Email links on the site
- **Facebook link** in site contact footer section
- **Xiaomi MiMo model pricing** added to pricing table
- **Comprehensive site SEO** — structured data, meta tags, favicon set
- **Official website link** added to sidebar navigation
- **Expanded widget documentation** — screenshot, panel features, tray icon usage
- **Font size legibility and mobile responsiveness** improvements

### Fixed
- **Widget panel positioning and Node/Electron sqlite ABI conflict** — resolve crash when loading sqlite in Electron environment
- **Widget launcher syntax error** that prevented background detach
- **Widget tray icon rendering** — replaced lightning icon with new logo
- **PM2 startup failures** with ESM and native module compatibility
- **Docker release builds** — repair broken build pipeline
- **GitHub stats badges** — render via API instead of flaky shields.io
- **Node 26 widget sqlite dependency** — fix native binding loading
- **Docs sidebar scroll** — keep active item in view while navigating

### Changed
- Minimum Node.js requirement bumped from 18 to 20
- Generated SvelteKit build output no longer tracked in git
- README GIF replaced with static screenshots
- Site docs aligned with actual dashboard behavior
- Screenshots desensitized (project names, source paths, device aliases)

---

## [1.3.2] - 2026-05-27

### Added
- Official website link in README and `site` package for the project homepage

### Fixed
- Correct PM2 background service instructions across all documentation

---

## [1.3.1] - 2026-05-26

### Added
- **Desktop system tray widget** — `@juliantanx/aiusage-widget` package with npm publish workflow ([#7](https://github.com/juliantanx/aiusage/pull/7))
- **PM2 background support** — run aiusage as a background service via PM2
- **Cursor tool support** — detect and display Cursor AI tool usage
- **Widget port auto-detection** — widget automatically discovers the backend port
- **Official subscription quota dashboard** — display subscription usage and limits
- **Session detail page** — `/sessions/[sessionId]` with duration, tool call count, and time offset display
- **MCP servers tab** — view top MCP servers in the overview tool calls card
- **Tool call type classification** — filter tool calls by type (built-in, MCP, skill) with tabs on the Tool Calls page
- **Cursor AI consumption support** — parse and display Cursor AI usage data (F1-B)
- **Skill name extraction** — extract specific skill names from Claude Code `Skill` tool_use blocks, with display name classification and info notice for tools without tool call data
- **Improved project name extraction** — use cwd to resolve project names with full path display

### Fixed
- SQL ambiguous column qualifiers (`ts`, `tool`) in sessions queries after LEFT JOIN
- Codex records showing `model=unknown` — parse pre-watermark lines and scan `turn_context` events for backfill
- Negative offset guard in `formatRelativeTs` and empty records state handling
- Strip `skill__` prefix from display names in session detail endpoint
- Escape SQL LIKE underscores to prevent `skill_view` matching `skill__` filter
- Re-backfill `skill__unknown` rows (not just legacy Skill rows)
- Extract skill name from `input.name` when `input.skill` is absent, also check `input.skillName`
- Tool-calls info notice border color (`--blue` instead of invisible `--blue-dim`)
- Validate `toolType` parameter in `/api/tool-calls`
- Always include `tool` and `device` params in session detail URL
- Fall back to `source_file` extraction when cwd-based project name is unknown

### Changed
- Remove unused `aiusage-data` gitlink

---

## [1.3.0] - 2026-05-25

### Added
- CNY pricing with real-time exchange rate — display prices in CNY, auto-fetch rate on startup, configurable currency and rate in Settings
- Complete UI redesign with new design system
- Qoder usage parsing from structured session logs ([#5](https://github.com/juliantanx/aiusage/pull/5) by @jlxyfll)
- Qoder SQLite database parsing, cwd tracking, and settings page overhaul
- Filter state persistence across page refreshes
- Reset command, parse progress bar, and status device name fix

### Fixed
- Reset exchangeRate store to cached rate when override is cleared
- Remove unused imports in serve.ts and pricing.ts
- Push annotated tag explicitly to trigger downstream workflows

---

## [1.2.1] - 2026-05-22

### Added
- Node.js 18–24 compatibility and multi-version CI testing
- `pnpm rebuild:sqlite` script for native module recompile after switching Node versions
- Automated Star History daily refresh workflow
- Release Patch workflow for one-click patch releases

### Changed
- README (EN/ZH): Node version notes, rebuild docs, Hermes support

---

## [1.2.0] - 2026-05-22

### Added
- **Hermes Agent parser** — detect and display Hermes AI agent usage ([#3](https://github.com/juliantanx/aiusage/pull/3))
- Hermes watermark manager and tool type integration

### Fixed
- Add hermes to tool filter allowlist and fix token import for orphaned sessions

### Changed
- Minimum Node.js requirement set to >=18 via engine constraint

---

## [1.1.1] - 2026-05-21

### Fixed
- UI layout no longer constrained to 1100px max-width, fixing empty right-side space on high-resolution/widescreen displays
- Docs page text constrained to 72ch max-width for readability on wide viewports
- `serve` command now handles occupied dev ports gracefully

### Changed
- CI npm auth rewritten to write token directly to `~/.npmrc` instead of relying on `setup-node` registry-url

---

## [1.1.0] - 2026-05-21

### Added
- Collapsible sidebar navigation with grouped sections (Analytics, Data, Manage) and icons
- In-app documentation page (`/docs`) with CLI reference and feature guides
- Token chart breakdown/total mode toggle — switch between per-type bars and a single combined bar
- Thinking tokens column added to the tokens detail table

### Fixed
- Nav active state now updates correctly on route change
- `thinkingTokens` null-guard to prevent NaN in token totals when field is absent
- Docs page TOC sticky offset on 701–800px viewports to clear the mobile header
- Docs page responsive breakpoint aligned to 800px (matched layout breakpoint)
- Sidebar collapse button tooltip now uses i18n (`nav.expand` / `nav.collapse`)

### Changed
- Nav home label renamed: Dashboard → Home
- README screenshots updated (dashboard, overview, token pages)

---

## [1.0.6] - 2026-05-17

### Changed
- Added package metadata (homepage, repository, keywords, license) to CLI package
- README screenshot served via jsDelivr CDN for access in China

---

## [1.0.5] - 2026-05-17

### Changed
- README screenshot compressed and re-exported as clean PNG
- README added to npm package files

---

## [1.0.4] - 2026-05-17

### Added
- **Settings page** — general/sources/sync/data sections with i18n support
- **Runtime settings controller** — changes take effect immediately without restart
- **Home page redesign** — live token counter replaces overview stats; stats moved to `/overview`
- **Dev mode support** with tsx and Vite API proxy
- Credential reveal toggle in settings form
- `weekStart` config field for weekly aggregation start day

### Fixed
- Dynamic type attribute in settings form, i18n Show/Hide labels
- Effective device name fallback for empty strings
- Poll interval fallback using nullish coalescing
- `onConfigUpdated` test server cleanup with try/finally

---

## [1.0.3] - 2026-05-16

### Fixed
- **6 security and correctness bugs** resolved
- New model prices added to pricing table, cleaned up thinking dead code

### Changed
- Improved test coverage

---

## [1.0.2] - 2026-05-16

### Added
- **Layered project extraction** — smarter project name resolution from session data

### Changed
- Removed superpowers planning artifacts from repository

---

## [1.0.1] - 2026-05-16

### Added
- **OpenCode support** — parse and display OpenCode AI tool usage from SQLite
- **Custom source paths** — configure non-default log file locations
- **Cross-platform fixes** — improved compatibility across macOS, Linux, and Windows
- **Complete UI redesign** — Obsidian Terminal theme with i18n and theme system
- **Bidirectional data sync** — pull/push with GitHub and S3 backends
- **Docker support** — containerized deployment with deployment guide
- **Multi-device filtering** — `--device` flag for CLI, DeviceSelector for web dashboard
- **Pricing management** — edit and customize model pricing in settings
- **Background sync** — progress tracking with hourly partitioning and DB views
- **Tool filter** — filter dashboard views by tool type (Claude Code, Cursor, etc.)

### Fixed
- Package renamed to `@juliantanx/aiusage` to avoid npm name conflict
- Pricing table updated with verified 2026 model prices
- Parse data loss and accuracy issues resolved
- Record ID collisions prevented, cache tokens included in skip check
- Timestamps normalized to integers, conflict retry logic added

---

[1.5.22]: https://github.com/juliantanx/aiusage/compare/v1.5.21...v1.5.22
[1.5.21]: https://github.com/juliantanx/aiusage/compare/v1.5.20...v1.5.21
[1.5.20]: https://github.com/juliantanx/aiusage/compare/v1.5.19...v1.5.20
[1.5.19]: https://github.com/juliantanx/aiusage/compare/v1.5.18...v1.5.19
[1.5.18]: https://github.com/juliantanx/aiusage/compare/v1.5.17...v1.5.18
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
