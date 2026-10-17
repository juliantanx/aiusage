import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { WatermarkManager } from '../src/watermark.js'

// CodeFuse parser version 2: output tokens of embedded Codex sessions exclude
// reasoning tokens. A watermark written by an earlier version has its CodeFuse
// file entries cleared once, so every CodeFuse log is re-imported.

const CODEFUSE_FILE = '/cf/engine/codex/sessions/rollout-a.jsonl'
const CODEX_FILE = '/codex/sessions/rollout-b.jsonl'

describe('WatermarkManager CodeFuse parser version 2', () => {
  let testDir: string
  let watermarkPath: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'aiusage-watermark-codefuse-v2-'))
    watermarkPath = join(testDir, 'watermark.json')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  function writeWatermark(codefuseParserVersion: number | undefined): void {
    writeFileSync(watermarkPath, JSON.stringify({
      files: {
        codefuse: { [CODEFUSE_FILE]: { offset: 12, size: 12, mtime: 6 } },
        codex: { [CODEX_FILE]: { offset: 200, size: 200, mtime: 2 } },
      },
      grokParserVersion: 1,
      codebuddyParserVersion: 1,
      antigravityParserVersion: 1,
      ...(codefuseParserVersion === undefined ? {} : { codefuseParserVersion }),
    }), 'utf-8')
  }

  it('clears CodeFuse entries written by parser version 1 and keeps every other tool', () => {
    writeWatermark(1)

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('codefuse', CODEFUSE_FILE)).toBeNull()
    // Stored Codex rows are corrected by migration v16, not by a re-import.
    expect(wm.getEntry('codex', CODEX_FILE)?.offset).toBe(200)

    wm.save()
    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).codefuseParserVersion).toBe(2)
  })

  it('clears CodeFuse entries of a watermark that predates the version field', () => {
    writeWatermark(undefined)

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('codefuse', CODEFUSE_FILE)).toBeNull()
    expect(wm.getEntry('codex', CODEX_FILE)?.offset).toBe(200)
  })

  it('keeps CodeFuse entries written by parser version 2, across reloads', () => {
    writeWatermark(2)

    const wm = new WatermarkManager(watermarkPath)
    expect(wm.getEntry('codefuse', CODEFUSE_FILE)?.offset).toBe(12)
    wm.save()

    expect(new WatermarkManager(watermarkPath).getEntry('codefuse', CODEFUSE_FILE)?.offset).toBe(12)
  })

  it('stamps a new watermark with version 2 so nothing is re-imported later', () => {
    const wm = new WatermarkManager(watermarkPath)
    wm.setEntry('codefuse', CODEFUSE_FILE, { offset: 12, size: 12, mtime: 6 })
    wm.save()

    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).codefuseParserVersion).toBe(2)
    expect(new WatermarkManager(watermarkPath).getEntry('codefuse', CODEFUSE_FILE)?.offset).toBe(12)
  })
})
