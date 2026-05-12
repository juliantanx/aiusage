import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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
})
