# Auto-Detect Installed AI Tools

## Problem

Users must manually configure data source paths in `config.json` and the Settings UI. This is friction-heavy — most tools install to well-known platform-specific locations. The system should auto-detect installed tools and silently skip absent ones.

## Design

### Approach: Functional Probe Pattern

Each supported AI tool gets a set of probe functions. No config file for paths. Environment variables serve as the only override mechanism.

### New Module: `packages/cli/src/discovery.ts`

```typescript
interface DetectedTool {
  tool: Tool
  path: string
  fileCount: number        // number of data files found (0 = installed but empty)
  status: 'found' | 'empty' | 'not_found'
}

// Per-tool probe: returns canonical data path or null
function probeClaudeCode(env?: NodeJS.ProcessEnv): string | null
function probeCodex(env?: NodeJS.ProcessEnv): string | null
// ... one per tool

// Unified entry point
function discoverTools(env?: NodeJS.ProcessEnv): DetectedTool[]
```

**Probe priority** (per tool):
1. `AIUSAGE_<TOOL>_PATH` env var override (e.g. `AIUSAGE_CLAUDE_CODE_PATH`)
2. Tool's own env var (e.g. `COPILOT_OTEL_FILE_EXPORTER_PATH`)
3. Platform default path + `existsSync()` check

### Changes

| File | Action |
|------|--------|
| `config.ts` | Remove `SOURCE_KEYS`, `SourcesConfig`, `Config.sources` |
| `parse.ts` | `discoverLogFiles()` calls `discoverTools()` instead of reading config; remove `getDefaultSourcePaths()` ; move `default*Path()` helpers to `discovery.ts` |
| `server.ts` | Remove `sources`/`defaultPaths` from `GET /api/config`; remove sources write from `PUT /api/config`; add `GET /api/detected-tools` |
| `settings/+page.svelte` | Replace editable Sources card with read-only Detected Tools panel |
| `constants.js` | Remove `SOURCE_KEYS`, `SOURCE_LABELS` (tool labels come from API) |
| `i18n.js` | Update settings strings |

### Settings UI: Detected Tools Panel

Read-only card showing each tool's detection status:
- Tool name + icon/badge
- Detected path (monospace)
- Status indicator: green dot (found), gray dot (not found)
- File count for found tools
- Platform badge (macOS/Windows/Linux)
- No save button — purely informational

### Environment Variable Override

Format: `AIUSAGE_<TOOL_KEY>_PATH` where `<TOOL_KEY>` is the tool name uppercased with hyphens replaced by underscores.

| Tool | Env Var |
|------|---------|
| claude-code | `AIUSAGE_CLAUDE_CODE_PATH` |
| codex | `AIUSAGE_CODEX_PATH` |
| openclaw | `AIUSAGE_OPENCLAW_PATH` |
| opencode | `AIUSAGE_OPENCODE_PATH` |
| hermes | `AIUSAGE_HERMES_PATH` |
| qoder | `AIUSAGE_QODER_PATH` |
| qoder-db | `AIUSAGE_QODER_DB_PATH` |
| cursor | `AIUSAGE_CURSOR_PATH` |
| kilocode-db | `AIUSAGE_KILOCODE_DB_PATH` |
| copilot | `AIUSAGE_COPILOT_PATH` |

### Migration

Existing `config.json` files with `sources` key will continue to work during a transition period — the discovery module checks `config.sources` as a fallback before platform defaults. This avoids breaking existing users. The `sources` field is no longer exposed in the UI or API for editing.

### Non-Goals

- No new tool support in this PR (same 10 tools)
- No hook installation or passive mode detection
- No changes to parsers or aggregator
