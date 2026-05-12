import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Tool } from '@aiusage/core'

export interface WatermarkEntry {
  offset: number
  size: number
  mtime: number
  fileIdentity?: { dev?: number; ino?: number; volumeSerial?: string; fileIndex?: string }
  headFingerprint?: string
}

export type WatermarkData = Record<Tool, Record<string, WatermarkEntry>>

export class WatermarkManager {
  private data: WatermarkData
  private path: string

  constructor(path: string) {
    this.path = path
    this.data = this.load()
  }

  private load(): WatermarkData {
    if (!existsSync(this.path)) {
      return {
        'claude-code': {},
        'codex': {},
        'openclaw': {},
      }
    }
    try {
      const content = readFileSync(this.path, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {
        'claude-code': {},
        'codex': {},
        'openclaw': {},
      }
    }
  }

  save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getEntry(tool: Tool, filePath: string): WatermarkEntry | null {
    return this.data[tool]?.[filePath] ?? null
  }

  setEntry(tool: Tool, filePath: string, entry: WatermarkEntry): void {
    if (!this.data[tool]) {
      this.data[tool] = {}
    }
    this.data[tool][filePath] = entry
  }

  cleanup(existingFiles: string[]): void {
    const existingSet = new Set(existingFiles)
    for (const tool of Object.keys(this.data) as Tool[]) {
      for (const filePath of Object.keys(this.data[tool])) {
        if (!existingSet.has(filePath)) {
          delete this.data[tool][filePath]
        }
      }
    }
  }
}
