# Desktop Widget Design Spec

**Date:** 2026-05-22
**Topic:** Cross-platform desktop widget for aiusage
**Status:** Approved

---

## Overview

Provide aiusage token usage data as a cross-platform desktop system tray widget. Users run `aiusage widget` to launch a persistent tray icon that shows a compact popup panel with key token metrics. Detailed data remains available via the existing web dashboard.

---

## Architecture

### New Package

A new `packages/widget` package is added to the monorepo as an Electron application. It is published separately as `@juliantanx/aiusage-widget` to avoid increasing the CLI installation footprint.

### Monorepo Structure

```
packages/
  core/     (existing) shared types, database schema, pricing
  cli/      (existing) CLI commands — gains `widget` subcommand
  web/      (existing) SvelteKit web dashboard
  widget/   (new)      Electron system tray widget
```

### CLI Integration

The existing `packages/cli` gains a `widget` subcommand:

```
aiusage widget
```

Behavior:
- Checks for a running widget process via a PID file (`~/.aiusage/widget.pid`)
- If already running: brings the tray window into focus
- If not running: spawns the Electron process detached (background-resident), writes PID file

If the Electron runtime is not found, the CLI prints an installation prompt directing the user to install `@juliantanx/aiusage-widget`.

### Data Flow

```
aiusage widget (CLI)
  └─▶ spawn Electron process (detached)
        └─▶ main process reads ~/.aiusage/cache.db via @aiusage/core
        └─▶ IPC → renderer process (panel UI)
        └─▶ auto-refresh every 60 seconds
```

The widget reads the SQLite database directly — no HTTP server is required for the widget itself.

### "Open Full Dashboard" Flow

```
User clicks "Open Full Dashboard"
  └─▶ main process checks if localhost:3847 is reachable
        ├─ reachable  → open default browser at http://localhost:3847
        └─ unreachable → spawn `aiusage serve`, wait for ready, open browser
```

---

## UI Design

### Tray Icon Behavior

| Action | Result |
|--------|--------|
| Left click | Toggle panel visibility |
| Right click | Context menu: Show Panel / Refresh / Quit |

### Panel Specification

- **Size:** 320px wide, ~280px tall (height adapts to content)
- **Style:** Frameless, rounded corners, follows system dark/light theme
- **Position:** Adjacent to tray icon (below menu bar on macOS, above taskbar on Windows/Linux)
- **Dismiss:** Click outside panel to hide

### Panel Layout

```
┌─────────────────────────────────┐
│  ⚡ aiusage          [↻] [✕]   │
├─────────────────────────────────┤
│  TODAY                          │
│  Tokens  128.4K  ↑64K  ↓64K    │
├─────────────────────────────────┤
│  THIS MONTH                     │
│  Tokens  1.2M                   │
├─────────────────────────────────┤
│  TOP MODEL                      │
│  claude-sonnet-4-6   84%        │
├─────────────────────────────────┤
│  [  Open Full Dashboard  →  ]   │
└─────────────────────────────────┘
```

### Displayed Metrics

| Section | Data |
|---------|------|
| TODAY Tokens | Total tokens, input tokens (↑), output tokens (↓) |
| THIS MONTH Tokens | Total tokens for current calendar month |
| TOP MODEL | Most-used model name and share percentage (today) |

Cost data is intentionally excluded from the widget.

### Interaction Details

- Number changes animate with a brief transition
- `[↻]` button triggers immediate data refresh
- `[✕]` button hides the panel (does not quit the tray process)

---

## Package Structure

```
packages/widget/
  src/
    main.ts              Electron main: tray, window, IPC, data queries, serve launcher
    preload.ts           contextBridge — exposes safe IPC API to renderer
    renderer/
      App.svelte         Panel root component
      components/
        Header.svelte    Title bar with refresh and close buttons
        StatRow.svelte   Single metric row (label + value)
  electron-builder.yml   Cross-platform packaging config
  package.json
  vite.config.ts         Renderer build (Svelte + Vite)
```

### Technology

| Layer | Technology |
|-------|-----------|
| Runtime | Electron (latest stable) |
| Main process | TypeScript + Node.js |
| Renderer | Svelte (consistent with `packages/web`) |
| Build | Vite (renderer), tsc (main/preload) |
| Packaging | electron-builder |
| Data access | `@aiusage/core` (direct SQLite, no HTTP) |

---

## Distribution

The widget is published as a separate optional package to avoid increasing CLI install size.

### Package

`@juliantanx/aiusage-widget` on npm — contains the prebuilt Electron binaries.

### Platform Targets

| Platform | Output Format |
|----------|--------------|
| macOS | `.dmg` + `.zip` |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` + `.deb` |

### Install Flow (user)

```bash
# Install CLI (unchanged)
npm install -g @juliantanx/aiusage

# Install widget (optional)
npm install -g @juliantanx/aiusage-widget

# Launch widget
aiusage widget
```

---

## Out of Scope

- Cost/pricing display in the widget
- Widget configuration UI (refresh interval, etc.)
- Multiple widget windows or multi-monitor awareness
- Notification/alert system
- Auto-start on system login (can be added later)
