import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Tool } from '@aiusage/core'

export interface WatermarkEntry {
  offset: number
  size: number
  mtime: number
  fileIdentity?: { dev?: number; ino?: number; volumeSerial?: string; fileIndex?: string }
  headFingerprint?: string
}

export interface HermesCursor {
  lastEndedAt: number  // Unix timestamp in seconds (float)
  lastId: string
}

export interface OpenCodeCursor {
  lastMessageCreatedAt: number
  lastMessageId: string
}

export interface QoderCursor {
  lastGmtCreate: number
  lastId: string
}

export interface CursorCursor {
  lastCreatedAt: number  // Unix timestamp in milliseconds (composerData.createdAt)
  lastId: string         // composerId
}

export interface TimestampIdCursor {
  lastCreatedAt: string
  lastId: string
}

export interface ZcodeCursor {
  lastStartedAt: number  // Unix timestamp in milliseconds (model_usage.started_at)
  lastId: string         // model_usage.id
}

export type ZcodeToolCursor = ZcodeCursor  // same shape, tracks tool_usage instead

export type FileWatermarkData = Record<Tool, Record<string, WatermarkEntry>>

export interface WatermarkState {
  files: FileWatermarkData
  opencode?: OpenCodeCursor | null
  hermes?: HermesCursor | null
  qoder?: QoderCursor | null
  cursor?: CursorCursor | null
  goose?: TimestampIdCursor | null
  zed?: TimestampIdCursor | null
  kiro?: TimestampIdCursor | null
  zcode?: ZcodeCursor | null
  zcodeTools?: ZcodeToolCursor | null
  trae?: number | null
}

/** @deprecated Use FileWatermarkData instead */
export type WatermarkData = FileWatermarkData

function defaultFileData(): FileWatermarkData {
  return {
    'claude-code': {},
    'codex': {},
    'openclaw': {},
    'opencode': {},
    'hermes': {},
    'qoder': {},
    'cursor': {},
    'kilocode': {},
    'kelivo': {},
    'copilot': {},
    'gemini': {},
    'kimi': {},
    'codebuddy': {},
    'kiro': {},
    'grok': {},
    'antigravity': {},
    'roocode': {},
    'zed': {},
    'goose': {},
    'omp': {},
    'pi': {},
    'craft': {},
    'droid': {},
    'zcode': {},
    'trae': {},
  }
}

export class WatermarkManager {
  private data: WatermarkState
  private path: string

  constructor(path: string) {
    this.path = path
    this.data = this.load()
  }

  private load(): WatermarkState {
    if (!existsSync(this.path)) {
      return { files: defaultFileData() }
    }
    try {
      const content = readFileSync(this.path, 'utf-8')
      const parsed = JSON.parse(content)
      // Handle legacy format (flat Record<Tool, ...> without 'files' key)
      if (parsed && typeof parsed === 'object' && !('files' in parsed)) {
        return { files: { ...defaultFileData(), ...parsed } }
      }
      return { files: { ...defaultFileData(), ...(parsed.files ?? {}) }, opencode: parsed.opencode ?? null, hermes: parsed.hermes ?? null, qoder: parsed.qoder ?? null, cursor: parsed.cursor ?? null, goose: parsed.goose ?? null, zed: parsed.zed ?? null, kiro: parsed.kiro ?? null, zcode: parsed.zcode ?? null, zcodeTools: parsed.zcodeTools ?? null, trae: parsed.trae ?? null }
    } catch {
      return { files: defaultFileData() }
    }
  }

  save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getEntry(tool: Tool, filePath: string): WatermarkEntry | null {
    return this.data.files[tool]?.[filePath] ?? null
  }

  setEntry(tool: Tool, filePath: string, entry: WatermarkEntry): void {
    if (!this.data.files[tool]) {
      this.data.files[tool] = {}
    }
    this.data.files[tool][filePath] = entry
  }

  cleanup(existingFiles: string[]): void {
    const existingSet = new Set(existingFiles)
    for (const tool of Object.keys(this.data.files) as Tool[]) {
      for (const filePath of Object.keys(this.data.files[tool])) {
        if (!existingSet.has(filePath)) {
          delete this.data.files[tool][filePath]
        }
      }
    }
  }

  getOpenCodeCursor(): OpenCodeCursor | null {
    return this.data.opencode ?? null
  }

  setOpenCodeCursor(cursor: OpenCodeCursor): void {
    this.data.opencode = cursor
  }

  getHermesCursor(): HermesCursor | null {
    return this.data.hermes ?? null
  }

  setHermesCursor(cursor: HermesCursor): void {
    this.data.hermes = cursor
  }

  getQoderCursor(): QoderCursor | null {
    return this.data.qoder ?? null
  }

  setQoderCursor(cursor: QoderCursor): void {
    this.data.qoder = cursor
  }

  getCursorCursor(): CursorCursor | null {
    return this.data.cursor ?? null
  }

  setCursorCursor(cursor: CursorCursor): void {
    this.data.cursor = cursor
  }

  getGooseCursor(): TimestampIdCursor | null {
    return this.data.goose ?? null
  }

  setGooseCursor(cursor: TimestampIdCursor): void {
    this.data.goose = cursor
  }

  getZedCursor(): TimestampIdCursor | null {
    return this.data.zed ?? null
  }

  setZedCursor(cursor: TimestampIdCursor): void {
    this.data.zed = cursor
  }

  getKiroCursor(): TimestampIdCursor | null {
    return this.data.kiro ?? null
  }

  setKiroCursor(cursor: TimestampIdCursor): void {
    this.data.kiro = cursor
  }

  getZcodeCursor(): ZcodeCursor | null {
    return this.data.zcode ?? null
  }

  setZcodeCursor(cursor: ZcodeCursor): void {
    this.data.zcode = cursor
  }

  getZcodeToolCursor(): ZcodeToolCursor | null {
    return this.data.zcodeTools ?? null
  }

  setZcodeToolCursor(cursor: ZcodeToolCursor): void {
    this.data.zcodeTools = cursor
  }

  getTraeLastImported(): number {
    return this.data.trae ?? 0
  }

  setTraeLastImported(ts: number): void {
    this.data.trae = ts
  }
}
