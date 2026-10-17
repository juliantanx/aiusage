import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WatermarkManager } from '../src/watermark.js'

describe('WatermarkManager Claude Code parser version', () => {
  let dir: string
  let watermarkPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiusage-wm-cc-'))
    watermarkPath = join(dir, 'watermark.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const entry = { offset: 200, size: 200, mtime: 2 }

  // The other parsers' versions as this release writes them, so their gates
  // keep their entries whatever their current versions are.
  function otherParserVersions(): Record<string, unknown> {
    const freshPath = join(dir, 'fresh.json')
    new WatermarkManager(freshPath).save()
    const versions = JSON.parse(readFileSync(freshPath, 'utf-8'))
    delete versions.files
    delete versions.claudeCodeParserVersion
    return versions
  }

  it('clears only Claude Code entries when the watermark predates the version', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      files: {
        'claude-code': { '/claude/a.jsonl': entry, '/claude/b.jsonl': entry },
        codex: { '/codex/rollout.jsonl': entry },
        codefuse: { '/cf/session.jsonl': entry },
      },
      ...otherParserVersions(),
      toolCallBackfillVersion: 1,
      opencode: { lastMessageCreatedAt: 5, lastMessageId: 'm' },
    }), 'utf-8')

    const wm = new WatermarkManager(watermarkPath)

    expect(wm.getEntry('claude-code', '/claude/a.jsonl')).toBeNull()
    expect(wm.getEntry('claude-code', '/claude/b.jsonl')).toBeNull()
    expect(wm.getEntry('codex', '/codex/rollout.jsonl')).toEqual(entry)
    expect(wm.getEntry('codefuse', '/cf/session.jsonl')).toEqual(entry)
    expect(wm.getToolCallBackfillVersion()).toBe(1)
    expect(wm.getOpenCodeCursor()).toEqual({ lastMessageCreatedAt: 5, lastMessageId: 'm' })

    wm.save()
    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).claudeCodeParserVersion).toBe(1)
  })

  it('clears the entries once: a watermark saved by this version keeps them', () => {
    writeFileSync(watermarkPath, JSON.stringify({ files: { 'claude-code': { '/claude/a.jsonl': entry } } }), 'utf-8')
    const first = new WatermarkManager(watermarkPath)
    first.setEntry('claude-code', '/claude/a.jsonl', entry)
    first.save()

    expect(new WatermarkManager(watermarkPath).getEntry('claude-code', '/claude/a.jsonl')).toEqual(entry)
  })

  it('clears Claude Code entries of a legacy flat watermark', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      'claude-code': { '/claude/a.jsonl': entry },
      codex: { '/codex/rollout.jsonl': entry },
    }), 'utf-8')

    const wm = new WatermarkManager(watermarkPath)

    expect(wm.getEntry('claude-code', '/claude/a.jsonl')).toBeNull()
    expect(wm.getEntry('codex', '/codex/rollout.jsonl')).toEqual(entry)
  })

  it('writes the version into a new watermark file', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.save()

    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).claudeCodeParserVersion).toBe(1)
  })
})
