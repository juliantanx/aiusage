import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Tool } from '@aiusage/core'

export interface WatermarkEntry {
  offset: number
  size: number
  mtime: number
  fileIdentity?: { dev?: number; ino?: number; volumeSerial?: string; fileIndex?: string }
  headFingerprint?: string
}

export interface OpenCodeCursor {
  lastMessageCreatedAt: number
  lastMessageId: string
}

export type FileWatermarkData = Record<Tool, Record<string, WatermarkEntry>>

export interface WatermarkState {
  files: FileWatermarkData
  opencode?: OpenCodeCursor | null
}

/** @deprecated Use FileWatermarkData instead */
export type WatermarkData = FileWatermarkData

function defaultFileData(): FileWatermarkData {
  return {
    'claude-code': {},
    'codex': {},
    'openclaw': {},
    'opencode': {},
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
      return { files: parsed.files ?? defaultFileData(), opencode: parsed.opencode ?? null }
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
}
