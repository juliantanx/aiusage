# Widget Auto-Setup: CLI Detection, Installation & First Parse

## Problem

The widget (`@juliantanx/aiusage-widget`) reads from `~/.aiusage/cache.db`, which is created and populated by the CLI (`@juliantanx/aiusage`). Users who install only the widget get an empty UI with all values at 0 because no database exists.

## Solution

On startup, if `cache.db` does not exist, the widget automatically:

1. Checks whether the CLI is already installed (`aiusage --version`)
2. If not installed, installs it (reusing existing `installAiusageCli()`)
3. Runs `aiusage parse` to populate the database
4. Opens the database and refreshes the UI

## Flow

```
app.whenReady()
  │
  ├── cache.db exists → normal startup (unchanged)
  │
  └── cache.db missing → autoSetup()
        │
        ├── show install overlay (setupTitle)
        │
        ├── checkCliInstalled() — run `aiusage --version`
        │     ├── found → skip install
        │     └── not found → installAiusageCli() (existing)
        │           ├── success → continue
        │           └── failure → show error, end
        │
        ├── run `aiusage parse`
        │     ├── success → continue
        │     └── failure → continue anyway (user may have no logs)
        │
        ├── open database (if cache.db now exists)
        │
        └── hide overlay, push data update
```

## Changes

### 1. `main.ts`

Add `autoSetup()` function called from `app.whenReady()` when `cache.db` is missing.

- `checkCliInstalled()`: spawn `aiusage --version`, resolve true/false
- If not installed: call existing `installAiusageCli()`
- `runFirstParse()`: spawn `aiusage parse`, wait for exit
- After parse: attempt `db = new Database(DB_PATH, { readonly: true, ... })`
- Notify renderer via existing `install:status` IPC channel with new phase values

New phases sent to renderer: `checking`, `installing` (existing), `parsing`, `done` (existing), `failed` (existing).

### 2. `i18n.ts`

Add new translation keys:

| Key | English | Chinese |
|-----|---------|---------|
| `setupTitle` | "First Time Setup" | "首次配置" |
| `setupChecking` | "Checking CLI..." | "检测 CLI..." |
| `setupParsing` | "Parsing usage logs..." | "解析使用日志..." |
| `setupDone` | "Ready!" | "就绪！" |
| `setupFailed` | "Setup failed" | "配置失败" |

### 3. `App.svelte`

Add mapping for new phases in the `installMessage` reactive block:

- `checking` → `i18n.setupChecking`
- `parsing` → `i18n.setupParsing`

Use `setupTitle` instead of `installTitle` when the overlay is triggered by auto-setup (distinguish via a new phase prefix or a separate IPC channel flag).

## Error Handling

- **CLI install fails**: show error with manual install instructions (same as existing dashboard install failure)
- **`aiusage parse` fails or no logs**: not an error — continue to normal startup with empty data
- **`cache.db` still missing after parse**: normal startup, widget shows `--` for all values (existing behavior)

## Files Unchanged

- `data.ts` — query logic stays the same
- `settings.ts` — unrelated
- `currency.ts` — unrelated
- Existing `openDashboardAction()` flow — untouched
