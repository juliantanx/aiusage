# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
