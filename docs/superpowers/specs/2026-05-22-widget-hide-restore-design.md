# Widget Hide/Restore Interaction Design

**Date:** 2026-05-22
**Topic:** Restore path for hidden desktop widget
**Status:** Draft

---

## Goal

Ensure that when the desktop widget is hidden, the user always has an obvious way to bring it back.

---

## Problem

The widget currently supports hiding, but after hiding it can feel lost from the user's perspective. The interaction needs a clear, discoverable recovery path.

---

## Interaction Decision

### Primary behavior

- **Left-click tray icon:** toggle widget panel visibility
- **Right-click tray icon:** open context menu
- **Context menu:** keep `Show Panel`, `Refresh`, and `Quit`
- **Close button (`✕`):** hide the panel only, do not quit the app

### Recovery path

After the panel is hidden, the user can bring it back by either:

1. left-clicking the tray icon, or
2. right-clicking the tray icon and selecting `Show Panel`

This gives both a fast path and a discoverable fallback.

---

## Development Mode

Development mode should stay aligned with packaged behavior:

- Widget launches with the panel shown once for convenience
- After that, `✕` hides the panel instead of quitting
- Hidden panels are restored via the same tray interactions as packaged mode

This avoids dev-only interaction rules that would differ from the shipped widget.

---

## Rationale

This approach is preferred because:

- it matches common tray app behavior,
- it preserves a quick left-click toggle,
- it keeps a visible fallback in the context menu,
- it avoids hidden state becoming a dead end,
- and it keeps dev and packaged behavior consistent.

---

## Implementation Notes

Expected code areas:

- `packages/widget/src/main.ts`
  - tray click behavior
  - tray menu actions
  - close/hide behavior routing
- `packages/widget/src/ui.ts`
  - small environment-specific interaction helpers if needed
- `packages/widget/tests/ui.test.ts`
  - behavior tests for visibility/hide decisions

---

## Acceptance Criteria

- Hiding the panel never removes the ability to reopen it
- Left-clicking the tray icon restores a hidden panel
- Right-click tray menu still exposes `Show Panel`
- `✕` hides instead of quitting in both dev and packaged modes
- Dev launch still shows the panel initially for convenience
