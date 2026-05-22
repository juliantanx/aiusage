# Widget Hide/Restore Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the widget hideable without becoming unrecoverable by aligning dev and packaged behavior around the tray as the restore path.

**Architecture:** Keep the existing tray-centered Electron architecture. Fix the interaction routing in `packages/widget/src/main.ts` and the behavior helpers in `packages/widget/src/ui.ts`, then lock the decisions down with focused Vitest coverage in `packages/widget/tests/ui.test.ts`.

**Tech Stack:** Electron, TypeScript, Vitest, Svelte

---

## File Structure

- `packages/widget/src/main.ts`
  - Owns tray click handling, tray context menu, window show/hide behavior, and close-button IPC routing.
- `packages/widget/src/ui.ts`
  - Owns small pure behavior helpers for environment-specific UI decisions.
- `packages/widget/tests/ui.test.ts`
  - Owns focused regression tests for launch, blur, close, and hide/restore behavior decisions.

---

### Task 1: Restore hide-on-close behavior in development

**Files:**
- Modify: `packages/widget/src/ui.ts`
- Modify: `packages/widget/src/main.ts:149-156`
- Test: `packages/widget/tests/ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('hides instead of quitting on close in development', () => {
  expect(shouldHideWindowOnClose(false)).toBe(true)
  expect(shouldHideWindowOnClose(true)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @juliantanx/aiusage-widget test -- tests/ui.test.ts`
Expected: FAIL because `shouldHideWindowOnClose(false)` currently returns `false`

- [ ] **Step 3: Write minimal implementation**

In `packages/widget/src/ui.ts`, make close behavior always hide:

```ts
export function shouldHideWindowOnClose(_isPackaged: boolean): boolean {
  return true
}
```

In `packages/widget/src/main.ts`, keep the close IPC path on hide-only behavior:

```ts
ipcMain.on('widget:hide-window', () => {
  if (shouldHideWindowOnClose(app.isPackaged)) {
    win?.hide()
  }
})
```
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @juliantanx/aiusage-widget test -- tests/ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/ui.ts packages/widget/src/main.ts packages/widget/tests/ui.test.ts
git commit -m "fix(widget): keep close button hide-only"
```

### Task 2: Preserve obvious restore paths through the tray

**Files:**
- Modify: `packages/widget/src/main.ts:54-69`
- Test: `packages/widget/tests/ui.test.ts`

- [ ] **Step 1: Write the failing test**

Add a small pure helper test so the tray contract is explicit:

```ts
it('keeps tray restore affordances enabled', () => {
  expect(getTrayInteractionMode()).toEqual({
    leftClickTogglesWindow: true,
    showPanelMenuItem: true,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @juliantanx/aiusage-widget test -- tests/ui.test.ts`
Expected: FAIL because `getTrayInteractionMode` does not exist yet

- [ ] **Step 3: Write minimal implementation**

In `packages/widget/src/ui.ts`, add the helper:

```ts
export function getTrayInteractionMode(): {
  leftClickTogglesWindow: boolean
  showPanelMenuItem: boolean
} {
  return {
    leftClickTogglesWindow: true,
    showPanelMenuItem: true,
  }
}
```

In `packages/widget/src/main.ts`, keep the tray behavior aligned with that contract:

```ts
tray.on('click', () => toggleWindow())

const menu = Menu.buildFromTemplate([
  { label: 'Show Panel', click: () => showWindow() },
  { label: 'Refresh', click: () => pushDataUpdate() },
  { type: 'separator' },
  { label: 'Quit', click: () => { app.exit(0) } },
])
```
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @juliantanx/aiusage-widget test -- tests/ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/ui.ts packages/widget/src/main.ts packages/widget/tests/ui.test.ts
git commit -m "fix(widget): preserve tray restore path"
```

### Task 3: Verify the full widget interaction contract

**Files:**
- Modify: `packages/widget/tests/ui.test.ts`
- Test: `packages/widget/tests/ui.test.ts`

- [ ] **Step 1: Add the full regression expectations**

```ts
it('shows the window automatically in development', () => {
  expect(shouldShowWindowOnLaunch(false)).toBe(true)
  expect(shouldShowWindowOnLaunch(true)).toBe(false)
})

it('keeps the window visible on blur in development', () => {
  expect(shouldHideWindowOnBlur(false)).toBe(false)
  expect(shouldHideWindowOnBlur(true)).toBe(true)
})

it('hides instead of quitting on close in development', () => {
  expect(shouldHideWindowOnClose(false)).toBe(true)
  expect(shouldHideWindowOnClose(true)).toBe(true)
})

it('keeps tray restore affordances enabled', () => {
  expect(getTrayInteractionMode()).toEqual({
    leftClickTogglesWindow: true,
    showPanelMenuItem: true,
  })
})
```

- [ ] **Step 2: Run the focused widget tests**

Run: `pnpm --filter @juliantanx/aiusage-widget test -- tests/ui.test.ts`
Expected: PASS with all widget UI helper tests green

- [ ] **Step 3: Run the widget build**

Run: `pnpm --filter @juliantanx/aiusage-widget build`
Expected: PASS with renderer build and `tsc -p tsconfig.json` succeeding

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/ui.ts packages/widget/src/main.ts packages/widget/tests/ui.test.ts
git commit -m "test(widget): cover hide and restore interaction"
```

---

## Self-Review

- Spec coverage:
  - Hidden panel recoverable via tray left-click: covered in Task 2 and Task 3
  - Right-click menu keeps `Show Panel`: covered in Task 2 and Task 3
  - `✕` hides instead of quitting in dev and packaged modes: covered in Task 1 and Task 3
  - Dev launch still auto-shows once: preserved and re-verified in Task 3
- Placeholder scan: no TODO/TBD placeholders remain
- Type consistency: helper names are consistent across tasks (`shouldShowWindowOnLaunch`, `shouldHideWindowOnBlur`, `shouldHideWindowOnClose`, `getTrayInteractionMode`)
