import { describe, expect, it } from 'vitest'
import { extractProject } from '../../src/api/project-extraction.js'

describe('extractProject', () => {
  it('keeps existing claude project decoding behavior', () => {
    expect(
      extractProject('/Users/tjh/.claude/projects/-Users-tjh-WebstormProjects-aiusage/session.jsonl')
    ).toBe('aiusage')
  })

  it('falls back to a readable parent directory for generic local paths', () => {
    expect(
      extractProject('/Users/tjh/worktrees/aiusage/sessions/abc123.jsonl')
    ).toBe('aiusage')
  })

  it('skips generic trailing directories such as logs and data', () => {
    expect(
      extractProject('/Users/tjh/projects/aiusage/data/logs/run.jsonl')
    ).toBe('aiusage')
  })

  it('returns unknown when every directory is generic or machine-like', () => {
    expect(
      extractProject('/tmp/data/logs/2026/05/16/123e4567-e89b-12d3-a456-426614174000.jsonl')
    ).toBe('unknown')
  })
})
