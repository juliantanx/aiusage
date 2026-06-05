import { describe, expect, it } from 'vitest'
import { extractProject, extractProjectFromCwd } from '../../src/api/project-extraction.js'

describe('extractProject', () => {
  it('keeps existing claude project decoding behavior', () => {
    expect(
      extractProject('/Users/alice/.claude/projects/-Users-alice-WebstormProjects-myapp/session.jsonl')
    ).toBe('myapp')
  })

  it('falls back to a readable parent directory for generic local paths', () => {
    expect(
      extractProject('/Users/alice/worktrees/myapp/sessions/abc123.jsonl')
    ).toBe('myapp')
  })

  it('skips generic trailing directories such as logs and data', () => {
    expect(
      extractProject('/Users/alice/projects/myapp/data/logs/run.jsonl')
    ).toBe('myapp')
  })

  it('extracts qoder project names from session segment paths', () => {
    expect(
      extractProject('/Users/example/.qoder/logs/sessions/-Users-example-code-myproject/session-1/segments/2026-05-24T02-03-23.jsonl')
    ).toBe('code/myproject')
  })

  it('extracts codebuddy project names from encoded project paths', () => {
    expect(
      extractProject('/Users/example/.codebuddy/projects/-Users-example-WebstormProjects-myapp/session-1.jsonl')
    ).toBe('myapp')
  })

  it('extracts kimi project names from session paths', () => {
    expect(
      extractProject('/Users/example/.kimi-code/sessions/-Users-example-code-myapp/session-1/agents/main/wire.jsonl')
    ).toBe('code/myapp')
  })

  it('extracts task ids from VS Code task storage paths', () => {
    expect(
      extractProject('/Users/example/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks/task-123/ui_messages.json')
    ).toBe('task/task-123')
  })

  it('joins multi-level claude project paths with / not -', () => {
    expect(
      extractProject('/Users/alice/.claude/projects/-Users-alice-WebstormProjects-myorg-myproject/session.jsonl')
    ).toBe('myorg/myproject')
  })

  it('returns unknown when every directory is generic or machine-like', () => {
    expect(
      extractProject('/tmp/data/logs/2026/05/16/123e4567-e89b-12d3-a456-426614174000.jsonl')
    ).toBe('unknown')
  })

  it('returns unknown for empty sourceFile', () => {
    expect(extractProject('')).toBe('unknown')
  })

  it('extracts openclaw agent name as project', () => {
    expect(
      extractProject('/Users/alice/.openclaw/agents/main/sessions/abc123.jsonl')
    ).toBe('openclaw/main')
  })

  it('extracts openclaw custom agent name', () => {
    expect(
      extractProject('/Users/alice/.openclaw/agents/my-agent/sessions/abc123.jsonl')
    ).toBe('openclaw/my-agent')
  })

  it('extracts hermes project from session title in sourceFile', () => {
    expect(
      extractProject('/Users/alice/.hermes/state.db:session:20260522_081752:Greeting and Assistance Offer')
    ).toBe('Greeting and Assistance Offer')
  })

  it('returns hermes for hermes sessions without title', () => {
    expect(
      extractProject('/Users/alice/.hermes/state.db:session:20260522_081752')
    ).toBe('hermes')
  })

  it('falls back for codex paths without cwd', () => {
    // Codex paths have no project info — project comes from cwd field
    const result = extractProject('/Users/alice/.codex/sessions/2026/05/22/rollout-abc123.jsonl')
    expect(result).not.toBe('unknown') // should extract something from generic path
  })
})

describe('extractProjectFromCwd', () => {
  it('strips WebstormProjects workspace root', () => {
    expect(extractProjectFromCwd('/Users/alice/WebstormProjects/myapp')).toBe('myapp')
  })

  it('returns project root even when cwd is a subdirectory', () => {
    expect(extractProjectFromCwd('/Users/alice/WebstormProjects/myapp/packages/cli')).toBe('myapp')
  })

  it('strips Documents workspace root', () => {
    expect(extractProjectFromCwd('/Users/alice/Documents/org-name/course/homework')).toBe('org-name')
  })

  it('handles path without a workspace root', () => {
    expect(extractProjectFromCwd('/Users/alice/Typora/notes')).toBe('Typora')
  })

  it('returns unknown for empty cwd', () => {
    expect(extractProjectFromCwd('')).toBe('unknown')
  })

  it('handles Windows-style paths', () => {
    expect(extractProjectFromCwd('C:/Users/alice/WebstormProjects/myproject')).toBe('myproject')
  })
})
