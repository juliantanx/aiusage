# Desktop Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `aiusage widget` CLI command that launches a cross-platform Electron system tray app showing today's/this month's token usage and top model in a compact popup panel.

**Architecture:** New `packages/widget` Electron package with a TypeScript main process that reads `~/.aiusage/cache.db` directly via `better-sqlite3`, communicates to a Svelte renderer via IPC, and exposes a system tray icon with a frameless popup panel. The existing `packages/cli` gains a `widget` subcommand that spawns the Electron process detached.

**Tech Stack:** Electron (latest stable), TypeScript, Svelte 4, Vite (renderer build), tsup (main/preload build), better-sqlite3, electron-builder (packaging), Vitest (tests), pnpm workspaces.

---

## File Map

**New files:**
- `packages/widget/package.json` — package manifest, bin entry, electron-builder config pointer
- `packages/widget/tsconfig.json` — TypeScript config for main + preload
- `packages/widget/vite.config.ts` — Vite build for Svelte renderer
- `packages/widget/electron-builder.yml` — cross-platform packaging
- `packages/widget/src/data.ts` — SQLite queries: today tokens, month tokens, top model
- `packages/widget/src/main.ts` — Electron main: tray, BrowserWindow, IPC handlers, serve launcher
- `packages/widget/src/preload.ts` — contextBridge exposing widget API to renderer
- `packages/widget/src/renderer/index.html` — renderer entry HTML
- `packages/widget/src/renderer/main.ts` — Svelte mount point
- `packages/widget/src/renderer/App.svelte` — root panel component
- `packages/widget/src/renderer/components/Header.svelte` — title bar with refresh/close
- `packages/widget/src/renderer/components/StatSection.svelte` — labeled metric block
- `packages/widget/vitest.config.ts` — test config
- `packages/widget/tests/data.test.ts` — unit tests for data query layer

**Modified files:**
- `packages/cli/src/cli.ts` — add `widget` command import and registration
- `packages/cli/src/commands/widget.ts` — new file: spawn/focus logic
- `packages/cli/tests/commands/widget.test.ts` — unit tests for CLI command
- `pnpm-workspace.yaml` — already covers `packages/*`, no change needed
- `package.json` (root) — add widget to build script

---

## Task 1: Scaffold `packages/widget`

**Files:**
- Create: `packages/widget/package.json`
- Create: `packages/widget/tsconfig.json`
- Create: `packages/widget/vite.config.ts`
- Create: `packages/widget/electron-builder.yml`
- Create: `packages/widget/vitest.config.ts`

- [ ] **Step 1: Verify workspace file**

```bash
cat pnpm-workspace.yaml
```

Expected output includes `packages/*`. If not present, the file content should be:
```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create package.json**

```bash
mkdir -p packages/widget/src/renderer/components packages/widget/tests packages/widget/bin
```

Create `packages/widget/package.json`:

```json
{
  "name": "@juliantanx/aiusage-widget",
  "version": "1.0.0",
  "private": false,
  "description": "System tray widget for aiusage",
  "main": "dist/main.js",
  "bin": {
    "aiusage-widget": "bin/launcher.js"
  },
  "scripts": {
    "dev": "concurrently \"vite build --watch\" \"tsc -p tsconfig.json --watch\" \"wait-on dist/main.js && electron .\"",
    "build": "vite build && tsc -p tsconfig.json",
    "pack": "pnpm build && electron-builder",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "*",
    "electron": "^33.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "@types/better-sqlite3": "*",
    "@types/node": "*",
    "concurrently": "^8.0.0",
    "electron-builder": "^25.0.0",
    "svelte": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0",
    "wait-on": "^7.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/widget/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/main.ts", "src/preload.ts", "src/data.ts"],
  "exclude": ["src/renderer", "node_modules", "dist"]
}
```

- [ ] **Step 4: Create vite.config.ts**

Create `packages/widget/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [svelte()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 5: Create electron-builder.yml**

Create `packages/widget/electron-builder.yml`:

```yaml
appId: com.juliantanx.aiusage-widget
productName: aiusage Widget
directories:
  output: dist-electron
  buildResources: build
files:
  - dist/**
  - "!dist/renderer/**"
  - dist/renderer/**
  - node_modules/**
extraMetadata:
  main: dist/main.js
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
    - target: zip
win:
  target:
    - target: nsis
linux:
  target:
    - target: AppImage
    - target: deb
```

- [ ] **Step 6: Create vitest.config.ts**

Create `packages/widget/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Create bin/launcher.js**

Create `packages/widget/bin/launcher.js`:

```javascript
#!/usr/bin/env node
const { spawn } = require('child_process')
const electron = require('electron')
const path = require('path')

const child = spawn(
  String(electron),
  [path.join(__dirname, '..', 'dist', 'main.js')],
  { detached: true, stdio: 'ignore' }
)
child.unref()
```

Make it executable:
```bash
chmod +x packages/widget/bin/launcher.js
```

- [ ] **Step 8: Install dependencies**

```bash
cd packages/widget && pnpm install
```

- [ ] **Step 9: Commit scaffold**

```bash
git add packages/widget/package.json packages/widget/tsconfig.json packages/widget/vite.config.ts packages/widget/electron-builder.yml packages/widget/vitest.config.ts packages/widget/bin/launcher.js
git commit -m "feat(widget): scaffold packages/widget Electron app"
```

---

## Task 2: Data query layer (TDD)

**Files:**
- Create: `packages/widget/src/data.ts`
- Create: `packages/widget/tests/data.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/widget/tests/data.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { queryWidgetData } from '../src/data'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      tool TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0
    )
  `)
  return db
}

function todayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function monthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

describe('queryWidgetData', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('returns zero totals when no records exist', () => {
    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(0)
    expect(result.todayTokens.input).toBe(0)
    expect(result.todayTokens.output).toBe(0)
    expect(result.monthTokens.total).toBe(0)
    expect(result.topModel).toBeNull()
  })

  it('counts today tokens correctly', () => {
    const now = Date.now()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.todayTokens.input).toBe(1000)
    expect(result.todayTokens.output).toBe(500)
    expect(result.todayTokens.total).toBe(1500)
  })

  it('excludes records from before today', () => {
    const yesterday = todayMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(0)
  })

  it('counts month tokens including today', () => {
    const now = Date.now()
    const startOfMonth = monthStartMs()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r2', startOfMonth + 1000, 'claude-code', 'claude-sonnet-4-6', 2000, 1000, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.monthTokens.total).toBe(4500)
  })

  it('excludes records from before this month', () => {
    const beforeMonth = monthStartMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', beforeMonth, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.monthTokens.total).toBe(0)
  })

  it('returns top model with share percentage', () => {
    const now = Date.now()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 800, 200, 0, 0, 0, 0)
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r2', now, 'claude-code', 'claude-haiku-4-5-20251001', 200, 50, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.topModel).not.toBeNull()
    expect(result.topModel!.name).toBe('claude-sonnet-4-6')
    // 1000 out of 1250 total = 80%
    expect(result.topModel!.share).toBe(80)
  })

  it('returns null topModel when no today records', () => {
    const yesterday = todayMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.topModel).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/widget && pnpm test
```

Expected: FAIL — `queryWidgetData` not found.

- [ ] **Step 3: Implement data.ts**

Create `packages/widget/src/data.ts`:

```typescript
import type Database from 'better-sqlite3'

export interface TodayTokens {
  total: number
  input: number
  output: number
}

export interface MonthTokens {
  total: number
}

export interface TopModel {
  name: string
  share: number
}

export interface WidgetData {
  todayTokens: TodayTokens
  monthTokens: MonthTokens
  topModel: TopModel | null
  lastUpdated: number
}

export function queryWidgetData(db: Database.Database): WidgetData {
  const todayStart = getTodayStartMs()
  const monthStart = getMonthStartMs()
  const tomorrow = todayStart + 86_400_000
  const nextMonthStart = getNextMonthStartMs()

  const todayRow = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input,
      COALESCE(SUM(output_tokens), 0) AS output
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(todayStart, tomorrow) as { input: number; output: number }

  const monthRow = db.prepare(`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(monthStart, nextMonthStart) as { total: number }

  const modelRows = db.prepare(`
    SELECT
      model,
      SUM(input_tokens + output_tokens) AS tokens
    FROM records
    WHERE ts >= ? AND ts < ?
    GROUP BY model
    ORDER BY tokens DESC
  `).all(todayStart, tomorrow) as Array<{ model: string; tokens: number }>

  let topModel: TopModel | null = null
  if (modelRows.length > 0) {
    const totalTokens = modelRows.reduce((acc, r) => acc + r.tokens, 0)
    const top = modelRows[0]
    topModel = {
      name: top.model,
      share: totalTokens > 0 ? Math.round((top.tokens / totalTokens) * 100) : 0,
    }
  }

  return {
    todayTokens: {
      total: todayRow.input + todayRow.output,
      input: todayRow.input,
      output: todayRow.output,
    },
    monthTokens: {
      total: monthRow.total,
    },
    topModel,
    lastUpdated: Date.now(),
  }
}

function getTodayStartMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getMonthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getNextMonthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + 1)
  return d.getTime()
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/widget && pnpm test
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/data.ts packages/widget/tests/data.test.ts
git commit -m "feat(widget): add data query layer with tests"
```

---

## Task 3: Preload script

**Files:**
- Create: `packages/widget/src/preload.ts`

- [ ] **Step 1: Create preload.ts**

Create `packages/widget/src/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

export interface WidgetAPI {
  getData: () => Promise<import('./data').WidgetData>
  openDashboard: () => Promise<void>
  hideWindow: () => void
  onDataUpdate: (callback: (data: import('./data').WidgetData) => void) => void
}

contextBridge.exposeInMainWorld('widget', {
  getData: () => ipcRenderer.invoke('widget:get-data'),
  openDashboard: () => ipcRenderer.invoke('widget:open-dashboard'),
  hideWindow: () => ipcRenderer.send('widget:hide-window'),
  onDataUpdate: (callback: (data: import('./data').WidgetData) => void) => {
    ipcRenderer.on('widget:data-update', (_event, data) => callback(data))
  },
} satisfies WidgetAPI)
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
cd packages/widget && npx tsc -p tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/preload.ts
git commit -m "feat(widget): add preload contextBridge API"
```

---

## Task 4: Main process

**Files:**
- Create: `packages/widget/src/main.ts`

- [ ] **Step 1: Create main.ts**

Create `packages/widget/src/main.ts`:

```typescript
import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { queryWidgetData } from './data'

const require = createRequire(import.meta.url ?? __filename)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

const DB_PATH = join(homedir(), '.aiusage', 'cache.db')
const DASHBOARD_PORT = 3847
const REFRESH_INTERVAL_MS = 60_000

let tray: Tray | null = null
let win: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null

app.setName('aiusage Widget')

// Prevent dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide()
}

app.whenReady().then(() => {
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true })
  }

  createTray()
  createWindow()
  startAutoRefresh()
})

app.on('window-all-closed', (e: Event) => {
  // Keep the app running in the tray
  e.preventDefault()
})

function createTray(): void {
  // Use a minimal 16x16 icon; in production this would be a real icon file
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('aiusage Widget')

  tray.on('click', () => toggleWindow())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show Panel', click: () => showWindow() },
      { label: 'Refresh', click: () => pushDataUpdate() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.exit(0) } },
    ])
    tray!.popUpContextMenu(menu)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 320,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const rendererPath = join(__dirname, 'renderer', 'index.html')
  win.loadFile(rendererPath)

  win.on('blur', () => win?.hide())
}

function showWindow(): void {
  if (!win) return

  // Position near tray
  const trayBounds = tray!.getBounds()
  const winBounds = win.getBounds()
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  const y = process.platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - winBounds.height - 4

  win.setPosition(x, y, false)
  win.show()
  win.focus()
  pushDataUpdate()
}

function toggleWindow(): void {
  if (win?.isVisible()) {
    win.hide()
  } else {
    showWindow()
  }
}

function pushDataUpdate(): void {
  if (!win || !db) return
  try {
    const data = queryWidgetData(db)
    win.webContents.send('widget:data-update', data)
  } catch {
    // DB may not be initialized yet; silently skip
  }
}

function startAutoRefresh(): void {
  setInterval(() => pushDataUpdate(), REFRESH_INTERVAL_MS)
}

// IPC handlers
ipcMain.handle('widget:get-data', () => {
  if (!db) return null
  return queryWidgetData(db)
})

ipcMain.handle('widget:open-dashboard', async () => {
  const reachable = await isDashboardReachable()
  if (!reachable) {
    await launchDashboard()
  }
  shell.openExternal(`http://localhost:${DASHBOARD_PORT}`)
})

ipcMain.on('widget:hide-window', () => win?.hide())

async function isDashboardReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const http = require('http') as typeof import('http')
    const req = http.get(`http://localhost:${DASHBOARD_PORT}`, (res) => {
      res.destroy()
      resolve(res.statusCode !== undefined)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

async function launchDashboard(): Promise<void> {
  const { spawn } = require('child_process') as typeof import('child_process')
  const child = spawn('aiusage', ['serve'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  })
  child.unref()

  // Wait up to 5 seconds for the server to be ready
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    if (await isDashboardReachable()) return
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/widget && npx tsc -p tsconfig.json --noEmit
```

Expected: No errors (Electron types may warn about some APIs — those are acceptable).

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/main.ts
git commit -m "feat(widget): add Electron main process with tray and IPC"
```

---

## Task 5: Renderer UI (Svelte)

**Files:**
- Create: `packages/widget/src/renderer/index.html`
- Create: `packages/widget/src/renderer/main.ts`
- Create: `packages/widget/src/renderer/App.svelte`
- Create: `packages/widget/src/renderer/components/Header.svelte`
- Create: `packages/widget/src/renderer/components/StatSection.svelte`

- [ ] **Step 1: Create index.html**

Create `packages/widget/src/renderer/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>aiusage Widget</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create renderer/main.ts**

Create `packages/widget/src/renderer/main.ts`:

```typescript
import App from './App.svelte'

const app = new App({ target: document.getElementById('app')! })

export default app
```

- [ ] **Step 3: Create Header.svelte**

Create `packages/widget/src/renderer/components/Header.svelte`:

```svelte
<script lang="ts">
  export let onRefresh: () => void
  export let onClose: () => void
</script>

<div class="header">
  <span class="logo">⚡ aiusage</span>
  <div class="actions">
    <button class="icon-btn" title="Refresh" on:click={onRefresh}>↻</button>
    <button class="icon-btn" title="Close" on:click={onClose}>✕</button>
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }
  .logo {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }
  .actions {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
  }
  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s, color 0.1s;
    padding: 0;
  }
  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 4: Create StatSection.svelte**

Create `packages/widget/src/renderer/components/StatSection.svelte`:

```svelte
<script lang="ts">
  export let label: string
  export let primary: string
  export let secondary: string = ''
</script>

<div class="section">
  <div class="section-label">{label}</div>
  <div class="values">
    <span class="primary">{primary}</span>
    {#if secondary}
      <span class="secondary">{secondary}</span>
    {/if}
  </div>
</div>

<style>
  .section {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .values {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .primary {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .secondary {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
```

- [ ] **Step 5: Create App.svelte**

Create `packages/widget/src/renderer/App.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import Header from './components/Header.svelte'
  import StatSection from './components/StatSection.svelte'

  interface WidgetData {
    todayTokens: { total: number; input: number; output: number }
    monthTokens: { total: number }
    topModel: { name: string; share: number } | null
    lastUpdated: number
  }

  let data: WidgetData | null = null
  let loading = true

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  async function refresh() {
    loading = true
    data = await (window as any).widget.getData()
    loading = false
  }

  function close() {
    ;(window as any).widget.hideWindow()
  }

  async function openDashboard() {
    await (window as any).widget.openDashboard()
  }

  onMount(() => {
    refresh()
    ;(window as any).widget.onDataUpdate((d: WidgetData) => {
      data = d
      loading = false
    })
  })

  $: todayStr = data ? formatTokens(data.todayTokens.total) : '—'
  $: todaySubStr = data
    ? `↑${formatTokens(data.todayTokens.input)}  ↓${formatTokens(data.todayTokens.output)}`
    : ''
  $: monthStr = data ? formatTokens(data.monthTokens.total) : '—'
  $: modelStr = data?.topModel?.name ?? '—'
  $: modelSubStr = data?.topModel ? `${data.topModel.share}%` : ''
</script>

<div class="panel" class:loading>
  <Header onRefresh={refresh} onClose={close} />

  <StatSection
    label="TODAY"
    primary={todayStr}
    secondary={todaySubStr}
  />

  <StatSection
    label="THIS MONTH"
    primary={monthStr}
  />

  <StatSection
    label="TOP MODEL"
    primary={modelStr}
    secondary={modelSubStr}
  />

  <div class="footer">
    <button class="open-btn" on:click={openDashboard}>
      Open Full Dashboard →
    </button>
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  :global(:root) {
    --bg: #1a1a1f;
    --bg-hover: rgba(255, 255, 255, 0.06);
    --border: rgba(255, 255, 255, 0.08);
    --text-primary: #f0f0f2;
    --text-muted: rgba(240, 240, 242, 0.45);
    --accent: #6c8eff;
  }
  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #ffffff;
      --bg-hover: rgba(0, 0, 0, 0.05);
      --border: rgba(0, 0, 0, 0.08);
      --text-primary: #0f0f12;
      --text-muted: rgba(15, 15, 18, 0.45);
      --accent: #3b5bdb;
    }
  }
  .panel {
    background: var(--bg);
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: opacity 0.15s;
  }
  .panel.loading {
    opacity: 0.7;
  }
  .footer {
    padding: 10px 14px 14px;
  }
  .open-btn {
    width: 100%;
    padding: 9px 14px;
    border: 1px solid var(--accent);
    border-radius: 7px;
    background: transparent;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    letter-spacing: 0.01em;
  }
  .open-btn:hover {
    background: rgba(108, 142, 255, 0.1);
  }
</style>
```

- [ ] **Step 6: Build renderer to verify Vite + Svelte compiles**

```bash
cd packages/widget && npx vite build
```

Expected: `dist/renderer/` created with `index.html` + JS/CSS bundles. No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/widget/src/renderer/
git commit -m "feat(widget): add Svelte renderer UI panel"
```

---

## Task 6: Build main + preload, verify full build

**Files:** No new files — just wiring the build together.

- [ ] **Step 1: Build main process**

```bash
cd packages/widget && npx tsc -p tsconfig.json
```

Expected: `dist/main.js`, `dist/preload.js`, `dist/data.js` created. No errors.

- [ ] **Step 2: Verify dist structure**

```bash
ls packages/widget/dist/
```

Expected output includes: `main.js`, `preload.js`, `data.js`, `renderer/`

- [ ] **Step 3: Copy renderer into dist**

The vite build already outputs to `dist/renderer/`. Verify:

```bash
ls packages/widget/dist/renderer/
```

Expected: `index.html` and one or more `.js`/`.css` files.

- [ ] **Step 4: Add full build script to widget package.json**

Edit `packages/widget/package.json` — update the `"build"` script to run both in sequence:

```json
"build": "vite build && tsc -p tsconfig.json"
```

(This is already correct from Task 1 Step 2. Confirm it's in place.)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/package.json
git commit -m "feat(widget): verify full build pipeline"
```

---

## Task 7: CLI command `aiusage widget`

**Files:**
- Create: `packages/cli/src/commands/widget.ts`
- Create: `packages/cli/tests/commands/widget.test.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/tests/commands/widget.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { launchWidget } from '../../src/commands/widget'

vi.mock('node:fs')
vi.mock('node:child_process')

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

describe('launchWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('exports launchWidget function', () => {
    expect(typeof launchWidget).toBe('function')
  })

  it('detects stale PID file when process does not exist', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('99999999' as any)

    // Mock process.kill to throw ESRCH (process not found)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
      throw err
    })

    const { spawn } = await import('node:child_process')
    const spawnMock = vi.mocked(spawn)
    spawnMock.mockReturnValue({ unref: vi.fn(), pid: 12345 } as any)

    await launchWidget()

    expect(spawnMock).toHaveBeenCalled()
    killSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/cli && pnpm test -- tests/commands/widget.test.ts
```

Expected: FAIL — `launchWidget` not found.

- [ ] **Step 3: Implement widget.ts**

Create `packages/cli/src/commands/widget.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { AIUSAGE_DIR } from '../config.js'

const WIDGET_PID_PATH = join(AIUSAGE_DIR, 'widget.pid')

export async function launchWidget(): Promise<void> {
  if (isWidgetRunning()) {
    console.log('aiusage widget is already running in the system tray.')
    return
  }

  const electronBin = resolveElectronBin()
  if (!electronBin) {
    console.error(
      'Widget not installed. Run: npm install -g @juliantanx/aiusage-widget'
    )
    process.exit(1)
  }

  const child = spawn(electronBin, [], {
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  child.unref()

  if (child.pid) {
    writeFileSync(WIDGET_PID_PATH, String(child.pid), { encoding: 'utf-8' })
    console.log('aiusage widget started.')
  }
}

function isWidgetRunning(): boolean {
  if (!existsSync(WIDGET_PID_PATH)) return false

  let pid: number
  try {
    pid = parseInt(readFileSync(WIDGET_PID_PATH, 'utf-8').trim(), 10)
  } catch {
    return false
  }

  if (isNaN(pid)) return false

  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err.code !== 'ESRCH'
  }
}

function resolveElectronBin(): string | null {
  // Check if aiusage-widget binary is available via launcher
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const result = execSync(
      process.platform === 'win32' ? 'where aiusage-widget' : 'which aiusage-widget',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return result || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/cli && pnpm test -- tests/commands/widget.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Register command in cli.ts**

Open `packages/cli/src/cli.ts` and add the following import at the top (after existing imports):

```typescript
import { launchWidget } from './commands/widget.js'
```

Add the following command registration before the `export { program }` line at the bottom:

```typescript
// widget command
program
  .command('widget')
  .description('Start the system tray widget')
  .action(async () => {
    await launchWidget()
  })
```

- [ ] **Step 6: Build CLI to verify no TypeScript errors**

```bash
cd packages/cli && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Run full CLI test suite**

```bash
cd packages/cli && pnpm test
```

Expected: All existing tests still pass, widget tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/widget.ts packages/cli/src/cli.ts packages/cli/tests/commands/widget.test.ts
git commit -m "feat(cli): add aiusage widget command"
```

---

## Task 8: Root build integration

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root package.json build script**

Read the current root `package.json`:

```bash
cat package.json
```

Update the `"build"` script to include the widget package:

```json
"build": "pnpm --filter @aiusage/core build && pnpm --filter @aiusage/web build && pnpm --filter @juliantanx/aiusage build && pnpm --filter @juliantanx/aiusage-widget build"
```

- [ ] **Step 2: Run full monorepo build**

```bash
pnpm build
```

Expected: All four packages build successfully. No errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests across all packages pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: include widget in monorepo build"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| System tray popup widget | Task 4 (Tray + BrowserWindow) |
| `aiusage widget` CLI command | Task 7 |
| New native-style compact panel | Task 5 (Svelte renderer) |
| Today tokens (total, input ↑, output ↓) | Tasks 2 + 5 |
| This month tokens | Tasks 2 + 5 |
| Top model + share % | Tasks 2 + 5 |
| Direct SQLite access (no HTTP) | Task 2 (`data.ts`) |
| "Open Full Dashboard" button | Tasks 4 (IPC) + 5 (UI) |
| Auto-start serve if not running | Task 4 (`launchDashboard`) |
| Cross-platform (macOS/Windows/Linux) | Task 1 (`electron-builder.yml`) |
| Separate npm package | Task 1 (`package.json`) |
| 60s auto-refresh | Task 4 (`startAutoRefresh`) |
| Click-outside to hide | Task 4 (`win.on('blur')`) |
| Dark/light theme | Task 5 (`prefers-color-scheme`) |

All requirements covered. No placeholders. Types are consistent throughout (`WidgetData` defined in `data.ts`, imported into `preload.ts`, mirrored inline in renderer for isolation).
