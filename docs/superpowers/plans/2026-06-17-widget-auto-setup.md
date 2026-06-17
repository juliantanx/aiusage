# Widget Auto-Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the widget starts and `cache.db` doesn't exist, automatically detect/install the CLI and run first parse so users who only install the widget get data out of the box.

**Architecture:** Add an `autoSetup()` function to `main.ts` that orchestrates CLI detection → installation → first parse → DB open. The renderer overlay (already used for dashboard install) is reused with new phase values and i18n keys.

**Tech Stack:** Electron (main process), Svelte (renderer), Node.js child_process

---

### Task 1: Add i18n keys for setup overlay

**Files:**
- Modify: `packages/widget/src/i18n.ts:3-39` (Translations interface)
- Modify: `packages/widget/src/i18n.ts:42-79` (en translations)
- Modify: `packages/widget/src/i18n.ts:81-118` (zh translations)

- [ ] **Step 1: Add new keys to Translations interface**

In `packages/widget/src/i18n.ts`, add after the `installFailed` line in the `Translations` interface (line 39):

```typescript
  setupTitle: string
  setupChecking: string
  setupParsing: string
  setupDone: string
  setupFailed: string
```

- [ ] **Step 2: Add English translations**

In the `en` object, add after `installFailed` (line 78):

```typescript
  setupTitle: 'First Time Setup',
  setupChecking: 'Checking CLI...',
  setupParsing: 'Parsing usage logs...',
  setupDone: 'Ready!',
  setupFailed: 'Setup failed',
```

- [ ] **Step 3: Add Chinese translations**

In the `zh` object, add after `installFailed` (line 117):

```typescript
  setupTitle: '首次配置',
  setupChecking: '检测 CLI...',
  setupParsing: '解析使用日志...',
  setupDone: '就绪！',
  setupFailed: '配置失败',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd packages/widget && npx tsc --noEmit -p tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/i18n.ts
git commit -m "feat(widget): add i18n keys for auto-setup overlay"
```

---

### Task 2: Update App.svelte to handle setup phases

**Files:**
- Modify: `packages/widget/src/renderer/App.svelte:49-53` (installPhase/installMessage vars)
- Modify: `packages/widget/src/renderer/App.svelte:149-153` (installMessage reactive block)
- Modify: `packages/widget/src/renderer/App.svelte:157-167` (overlay template)

- [ ] **Step 1: Add `isSetup` tracking variable**

In `App.svelte`, after the `installError` declaration (line 54), add:

```typescript
  let isSetup = false
```

- [ ] **Step 2: Add setup status listener in onMount**

In the `onMount` block, after the existing `onInstallStatus` listener (after line 125), add a new listener:

```typescript
    ;(window as any).widget.onSetupStatus((status: { phase: string; error?: string }) => {
      isSetup = true
      installPhase = status.phase
      installError = status.error ?? null
      if (status.phase === 'done' || status.phase === 'failed') {
        setTimeout(() => { installPhase = null; installError = null; isSetup = false }, 3000)
      }
    })
```

- [ ] **Step 3: Update installMessage reactive block to handle setup phases**

Replace the `installMessage` reactive block (lines 149-153) with:

```typescript
  $: installMessage = installPhase === 'checking' ? i18n.setupChecking
    : installPhase === 'parsing' ? i18n.setupParsing
    : installPhase === 'installing' ? i18n.installInstalling
    : installPhase === 'launching' ? i18n.installLaunching
    : installPhase === 'done' ? (isSetup ? i18n.setupDone : i18n.installDone)
    : installPhase === 'failed' ? (isSetup ? i18n.setupFailed : i18n.installFailed)
    : i18n.installPreparing
```

- [ ] **Step 4: Update overlay title to use setupTitle when in setup mode**

In the overlay template (line 161), change:

```svelte
        <div class="install-title">{i18n.installTitle}</div>
```

to:

```svelte
        <div class="install-title">{isSetup ? i18n.setupTitle : i18n.installTitle}</div>
```

- [ ] **Step 5: Verify build**

Run: `cd packages/widget && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/renderer/App.svelte
git commit -m "feat(widget): handle setup phases in overlay UI"
```

---

### Task 3: Add setup status IPC to preload

**Files:**
- Modify: `packages/widget/src/preload.ts:6-9` (InstallStatus type)
- Modify: `packages/widget/src/preload.ts:11-21` (WidgetAPI interface)
- Modify: `packages/widget/src/preload.ts:23-39` (contextBridge)

- [ ] **Step 1: Add onSetupStatus to WidgetAPI interface**

In `packages/widget/src/preload.ts`, add to the `WidgetAPI` interface (after line 17):

```typescript
  onSetupStatus: (callback: (status: InstallStatus) => void) => void
```

- [ ] **Step 2: Add onSetupStatus to contextBridge**

In the `contextBridge.exposeInMainWorld` object, add after the `onInstallStatus` entry (after line 34):

```typescript
  onSetupStatus: (callback: (status: InstallStatus) => void) => {
    ipcRenderer.removeAllListeners('setup:status')
    ipcRenderer.on('setup:status', (_event, status) => callback(status))
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/widget && npx tsc --noEmit -p tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/preload.ts
git commit -m "feat(widget): add setup status IPC channel to preload"
```

---

### Task 4: Implement autoSetup in main.ts

**Files:**
- Modify: `packages/widget/src/main.ts:50-67` (app.whenReady block)
- Modify: `packages/widget/src/main.ts` (add new functions before IPC handlers)

- [ ] **Step 1: Add checkCliInstalled function**

In `packages/widget/src/main.ts`, add before the `// IPC handlers` comment (line 349):

```typescript
function checkCliInstalled(): Promise<boolean> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')
  return new Promise((resolve) => {
    execFile('aiusage', ['--version'], { timeout: 10_000, shell: true }, (err) => {
      resolve(!err)
    })
  })
}
```

- [ ] **Step 2: Add runFirstParse function**

Add after `checkCliInstalled`:

```typescript
function runFirstParse(): Promise<{ success: boolean; error?: string }> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')
  return new Promise((resolve) => {
    execFile('aiusage', ['parse'], { timeout: 120_000, shell: true }, (err, _stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr || err.message })
      } else {
        resolve({ success: true })
      }
    })
  })
}
```

- [ ] **Step 3: Add autoSetup function**

Add after `runFirstParse`:

```typescript
async function autoSetup(): Promise<void> {
  // Show overlay
  notifyRenderer('setup:status', { phase: 'checking' })
  showWindow()

  // Check if CLI is installed
  const cliFound = await checkCliInstalled()

  if (!cliFound) {
    // Install CLI
    notifyRenderer('setup:status', { phase: 'installing' })
    const installResult = await installAiusageCli()
    if (!installResult.success) {
      notifyRenderer('setup:status', { phase: 'failed', error: installResult.error })
      return
    }
  }

  // Run first parse
  notifyRenderer('setup:status', { phase: 'parsing' })
  await runFirstParse()
  // Parse failure is not fatal — user may have no logs yet

  // Open database if it now exists
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, {
      readonly: true,
      nativeBinding: getWidgetNativeBindingPath(__dirname),
    })
  }

  notifyRenderer('setup:status', { phase: 'done' })
  pushDataUpdate()
}
```

- [ ] **Step 4: Update app.whenReady to call autoSetup**

Replace the `app.whenReady().then(...)` block (lines 50-67) with:

```typescript
app.whenReady().then(async () => {
  const dbExists = existsSync(DB_PATH)

  if (dbExists) {
    db = new Database(DB_PATH, {
      readonly: true,
      nativeBinding: getWidgetNativeBindingPath(__dirname),
    })
  }

  applyTheme(settings.theme)
  createTray()
  createWindow()
  startAutoRefresh()
  void refreshExchangeRate()

  if (!dbExists) {
    await autoSetup()
  } else if (shouldShowWindowOnLaunch(app.isPackaged)) {
    showWindowWhenTrayReady()
  }
})
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd packages/widget && npx tsc --noEmit -p tsconfig.json`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/main.ts
git commit -m "feat(widget): auto-setup CLI and first parse when cache.db missing"
```

---

### Task 5: Add unit tests for new functions

**Files:**
- Modify: `packages/widget/tests/ui.test.ts` (add tests for checkCliInstalled, runFirstParse)

- [ ] **Step 1: Check existing test structure**

Read `packages/widget/tests/ui.test.ts` to understand the test patterns used.

- [ ] **Step 2: Note on testability**

The `checkCliInstalled` and `runFirstParse` functions use `nodeRequire('child_process')` which makes them difficult to unit test in isolation (they depend on Electron's `createRequire` and actual system state). The existing test files (`data.test.ts`, `ui.test.ts`) test pure functions only.

Since these functions are thin wrappers around `execFile`, and the integration is best tested by running the actual widget, skip adding unit tests for the child_process functions. The existing test suite covers `queryWidgetData` and UI utilities — the new code is integration-level.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

Run: `cd packages/widget && pnpm test`
Expected: All existing tests pass

- [ ] **Step 4: Commit (if any test fixes needed)**

Only commit if changes were needed to fix tests.

---

### Task 6: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Run full widget build**

Run: `cd packages/widget && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run all tests**

Run: `cd packages/widget && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Final commit (if any adjustments needed)**

Only commit if build/test revealed issues that needed fixing.
