import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { WatermarkManager } from '../src/watermark.js'

describe('WatermarkManager', () => {
  const testDir = join(tmpdir(), 'aiusage-watermark-test')
  const watermarkPath = join(testDir, 'watermark.json')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads empty watermark when file does not exist', () => {
    const wm = new WatermarkManager(watermarkPath)
    const entry = wm.getEntry('claude-code', '/path/to/file.jsonl')
    expect(entry).toBeNull()
  })

  it('saves and loads watermark entry', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/path/to/file.jsonl', {
      offset: 1000,
      size: 1000,
      mtime: 1776738085346,
      fileIdentity: { dev: 123, ino: 456 },
      headFingerprint: 'abc123',
    })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    const entry = wm2.getEntry('claude-code', '/path/to/file.jsonl')
    expect(entry).not.toBeNull()
    expect(entry!.offset).toBe(1000)
    expect(entry!.size).toBe(1000)
    expect(entry!.mtime).toBe(1776738085346)
    expect(entry!.fileIdentity).toEqual({ dev: 123, ino: 456 })
    expect(entry!.headFingerprint).toBe('abc123')
  })

  it('returns null for non-existent tool', () => {
    const wm = new WatermarkManager(watermarkPath)
    const entry = wm.getEntry('codex', '/path/to/file.jsonl')
    expect(entry).toBeNull()
  })

  it('cleans up entries for non-existent files', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/non/existent/file.jsonl', {
      offset: 1000,
      size: 1000,
      mtime: 1776738085346,
    })
    wm.setEntry('claude-code', '/another/file.jsonl', {
      offset: 500,
      size: 500,
      mtime: 1776738085000,
    })
    wm.save()

    // Clean should remove non-existent entries
    wm.cleanup(['/another/file.jsonl'])
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getEntry('claude-code', '/non/existent/file.jsonl')).toBeNull()
    expect(wm2.getEntry('claude-code', '/another/file.jsonl')).not.toBeNull()
  })

  it('handles multiple tools', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('claude-code', '/path/a.jsonl', { offset: 100, size: 100, mtime: 1000 })
    wm.setEntry('codex', '/path/b.jsonl', { offset: 200, size: 200, mtime: 2000 })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getEntry('claude-code', '/path/a.jsonl')!.offset).toBe(100)
    expect(wm2.getEntry('codex', '/path/b.jsonl')!.offset).toBe(200)
  })

  it('persists opencode database cursor', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setOpenCodeCursor({ lastMessageCreatedAt: 1000, lastMessageId: 'msg_1' })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getOpenCodeCursor()).toEqual({
      lastMessageCreatedAt: 1000,
      lastMessageId: 'msg_1',
    })
  })

  it('migrates legacy flat watermark format to new envelope', () => {
    const legacyData = {
      'claude-code': { '/path/file.jsonl': { offset: 500, size: 500, mtime: 1000 } },
      'codex': {},
      'openclaw': {},
    }
    writeFileSync(watermarkPath, JSON.stringify(legacyData), 'utf-8')

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('claude-code', '/path/file.jsonl')!.offset).toBe(500)
    expect(wm.getOpenCodeCursor()).toBeNull()

    // Verify it round-trips into new format
    wm.save()
    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getEntry('claude-code', '/path/file.jsonl')!.offset).toBe(500)
  })

  it('clears only stale Grok entries when upgrading the Grok parser', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      files: {
        grok: { '/old/updates.jsonl': { offset: 100, size: 100, mtime: 1 } },
        'claude-code': { '/claude/session.jsonl': { offset: 200, size: 200, mtime: 2 } },
      },
    }), 'utf-8')

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('grok', '/old/updates.jsonl')).toBeNull()
    expect(wm.getEntry('claude-code', '/claude/session.jsonl')?.offset).toBe(200)

    wm.save()
    const saved = JSON.parse(readFileSync(watermarkPath, 'utf-8'))
    expect(saved.grokParserVersion).toBe(1)
  })

  it('preserves Grok entries written by the current parser version', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      files: {
        grok: { '/current/updates.jsonl': { offset: 300, size: 300, mtime: 3 } },
      },
      grokParserVersion: 1,
    }), 'utf-8')

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('grok', '/current/updates.jsonl')?.offset).toBe(300)
  })

  it('returns null when no opencode cursor has been set', () => {
    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getOpenCodeCursor()).toBeNull()
  })
})

describe('WatermarkManager - HermesCursor', () => {
  const testDir = join(tmpdir(), 'aiusage-watermark-hermes-test')
  const watermarkPath = join(testDir, 'watermark.json')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns null when no hermes cursor is set', () => {
    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getHermesCursor()).toBeNull()
  })

  it('saves and loads hermes cursor', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setHermesCursor({ lastEndedAt: 1779408317.5, lastId: '20260522_080254_59211c' })
    wm.save()

    const wm2 = new WatermarkManager(watermarkPath)
    expect(wm2.getHermesCursor()).toEqual({
      lastEndedAt: 1779408317.5,
      lastId: '20260522_080254_59211c',
    })
  })

  it('loads legacy watermark file without hermes key', () => {
    writeFileSync(watermarkPath, JSON.stringify({
      files: { 'claude-code': {}, 'codex': {}, 'openclaw': {}, 'opencode': {}, 'hermes': {} },
    }))
    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getHermesCursor()).toBeNull()
    expect(() => wm.setEntry('qoder', '/some/path/qodercli.log', { offset: 0, size: 0, mtime: 0 })).not.toThrow()
  })

  it('hermes key included in defaultFileData', () => {
    const wm = new WatermarkManager(watermarkPath)
    // setEntry for hermes should not throw (key exists in files map)
    expect(() => wm.setEntry('hermes', '/some/path', { offset: 0, size: 0, mtime: 0 })).not.toThrow()
  })
})
