# Tool Calls & Skill Stats — Design

Date: 2026-05-26

## Problem

1. **Skill stats collapse**: The tool-calls page groups all Claude Code skill invocations under one row named "Skill", losing the specific skill name. Users cannot see which skills are actually used.

2. **Missing tool call extraction**: Qoder and Cursor parsers always return empty `toolCalls: []`. Their data sources do not expose tool-call-level data in a parseable form with the current integration.

3. **UI gap**: When a user filters to Qoder or Cursor on the tool-calls page, they see a generic "no data" empty state with no explanation.

## Scope

- Claude Code, Codex, OpenClaw, OpenCode, Hermes: already extract tool calls. No changes needed.
- Qoder, Cursor: tool call data not available → UI annotation only.
- Skill name granularity: Claude Code only (the only tool using the Superpowers Skill tool).

## Design

### 1. Specific Skill Name Tracking

**Parser change (`packages/core/src/parsers/claude-code.ts`)**

When a `tool_use` block has `name === 'Skill'`, extract the specific skill from `block.input?.skill`:
- If `block.input?.skill` is a non-empty string → store name as `skill__${block.input.skill}` (e.g., `skill__superpowers:brainstorming`)
- Otherwise → store as `skill__unknown` (Skill called without a named argument)

This uses the same `skill__` prefix convention as MCP uses `mcp__`.

**Classification (`packages/cli/src/api/server.ts`)**

```
classifyToolCall(name):
  name.startsWith('mcp__')   → 'mcp'
  name.startsWith('skill__') → 'skill'
  name === 'Skill'           → 'skill'   // backward compat for existing DB rows
  otherwise                  → 'builtin'
```

**Type filter (SQL)**

```sql
-- skill filter
AND (tc.name LIKE 'skill__%' OR tc.name = 'Skill')
-- builtin filter
AND tc.name NOT LIKE 'mcp__%' AND tc.name NOT LIKE 'skill__%' AND tc.name != 'Skill'
```

**Display name**

For `skill__` prefix entries: strip `skill__` prefix for display (e.g., `superpowers:brainstorming`).
For legacy `Skill` entries: display as `Skill` unchanged.

**Backward compatibility**

Existing DB rows with `name = 'Skill'` continue to be classified as 'skill' and displayed as-is. No migration needed.

### 2. UI Annotation for Qoder / Cursor

**Where**: `packages/web/src/routes/tool-calls/+page.svelte`

**Behavior**: When `$selectedTool` is `'qoder'` or `'cursor'`, render an info notice above the type tabs and results area. The notice uses neutral wording (not "cannot implement").

**Wording** (to be i18n-keyed):
- `toolCalls.noToolCallData`: `"该工具的数据源中不包含工具调用记录"` / `"Tool call data is not available in this tool's data source"`

The notice is dismissible per session (no persistence needed). The existing empty-state block still renders below if the query truly returns no rows.

**Appearance**: same info-style banner pattern as other informational states in the app — blue-tinted, small text, not alarming.

### 3. Test Updates

- `packages/cli/tests/api/tool-classification.test.ts`: add cases for `skill__superpowers:brainstorming` → 'skill', `skill__unknown` → 'skill', update builtin filter test.
- `packages/core/tests/claude-code.test.ts`: add case for `Skill` block with `input.skill` → stores `skill__<name>`; case with no input → stores `skill__unknown`.

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/parsers/claude-code.ts` | Extract `block.input.skill`, store as `skill__<name>` |
| `packages/cli/src/api/server.ts` | Update `classifyToolCall`, `getToolTypeFilter`, display name for `skill__` |
| `packages/web/src/routes/tool-calls/+page.svelte` | Add info notice for Qoder/Cursor |
| `packages/cli/tests/api/tool-classification.test.ts` | New skill__ test cases |
| `packages/core/tests/claude-code.test.ts` | New Skill block test cases |

## Out of Scope

- Extracting tool calls from Qoder or Cursor data sources (data not available).
- Skill name tracking for non-Claude-Code tools (no equivalent concept).
- DB migration for existing `Skill` rows.
