import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Tool } from '@aiusage/core'

const CURRENT_GROK_PARSER_VERSION = 1
const CURRENT_CODEBUDDY_PARSER_VERSION = 1
/**
 * v1: model resolution prefers readable model metadata over unknown numeric
 * ids and keeps effort-qualified Gemini Pro names (issues #68, #69). Every
 * conversation database is re-imported once; records keep their ids, so the
 * re-import corrects model, provider and cost in place.
 */
const CURRENT_ANTIGRAVITY_PARSER_VERSION = 1
/**
 * v1: input tokens of embedded Codex sessions exclude cached tokens. Every
 * CodeFuse log is re-imported once; records keep their ids, so the re-import
 * corrects input tokens and cost in place.
 */
const CURRENT_CODEFUSE_PARSER_VERSION = 1

/**
 * v1: tool calls are keyed on the tool_use block and a re-inserted record
 * keeps its tool calls (issue #89). Every Claude Code log is re-imported once
 * to restore the calls earlier releases dropped. Records keep their ids and
 * are updated in place; `runParse` removes the old-scheme tool calls of each
 * log it reads from the start.
 */
const CURRENT_CLAUDE_CODE_PARSER_VERSION = 1

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
  grokParserVersion?: number
  codebuddyParserVersion?: number
  antigravityParserVersion?: number
  codefuseParserVersion?: number
  claudeCodeParserVersion?: number
  toolCallBackfillVersion?: number
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
  codebuddyIde?: number | null
}

/** @deprecated Use FileWatermarkData instead */
export type WatermarkData = FileWatermarkData

function defaultState(): WatermarkState {
  return {
    files: defaultFileData(),
    grokParserVersion: CURRENT_GROK_PARSER_VERSION,
    codebuddyParserVersion: CURRENT_CODEBUDDY_PARSER_VERSION,
    antigravityParserVersion: CURRENT_ANTIGRAVITY_PARSER_VERSION,
    codefuseParserVersion: CURRENT_CODEFUSE_PARSER_VERSION,
    claudeCodeParserVersion: CURRENT_CLAUDE_CODE_PARSER_VERSION,
  }
}

function defaultFileData(): FileWatermarkData {
  return {
    'claude-code': {},
    'codex': {},
    'codefuse': {},
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
      return defaultState()
    }
    try {
      const content = readFileSync(this.path, 'utf-8')
      const parsed = JSON.parse(content)
      let state: WatermarkState
      // Handle legacy format (flat Record<Tool, ...> without 'files' key)
      if (parsed && typeof parsed === 'object' && !('files' in parsed)) {
        state = { files: { ...defaultFileData(), ...parsed } }
      } else {
        state = {
          files: { ...defaultFileData(), ...(parsed.files ?? {}) },
          grokParserVersion: parsed.grokParserVersion,
          codebuddyParserVersion: parsed.codebuddyParserVersion,
          antigravityParserVersion: parsed.antigravityParserVersion,
          codefuseParserVersion: parsed.codefuseParserVersion,
          claudeCodeParserVersion: parsed.claudeCodeParserVersion,
          toolCallBackfillVersion: parsed.toolCallBackfillVersion,
          opencode: parsed.opencode ?? null,
          hermes: parsed.hermes ?? null,
          qoder: parsed.qoder ?? null,
          cursor: parsed.cursor ?? null,
          goose: parsed.goose ?? null,
          zed: parsed.zed ?? null,
          kiro: parsed.kiro ?? null,
          zcode: parsed.zcode ?? null,
          zcodeTools: parsed.zcodeTools ?? null,
          trae: parsed.trae ?? null,
          codebuddyIde: parsed.codebuddyIde ?? null,
        }
      }

      if ((state.grokParserVersion ?? 0) < CURRENT_GROK_PARSER_VERSION) {
        state.files.grok = {}
        state.grokParserVersion = CURRENT_GROK_PARSER_VERSION
      }
      if ((state.codebuddyParserVersion ?? 0) < CURRENT_CODEBUDDY_PARSER_VERSION) {
        // v1: codebuddy parser now counts usage on function_call lines; reset so
        // historical files are re-parsed and previously dropped usage is backfilled.
        state.files.codebuddy = {}
        state.codebuddyParserVersion = CURRENT_CODEBUDDY_PARSER_VERSION
      }
      if ((state.antigravityParserVersion ?? 0) < CURRENT_ANTIGRAVITY_PARSER_VERSION) {
        // v1: Antigravity usage was attributed to placeholder ids such as
        // antigravity-model-1318 although the row named the model; re-import
        // every conversation database so those records are corrected in place.
        state.files.antigravity = {}
        state.antigravityParserVersion = CURRENT_ANTIGRAVITY_PARSER_VERSION
      }
      if ((state.codefuseParserVersion ?? 0) < CURRENT_CODEFUSE_PARSER_VERSION) {
        // v1: embedded Codex sessions stored input_tokens inclusive of the
        // cached tokens also stored as cache-read; re-import every CodeFuse
        // log so those records are corrected in place.
        state.files.codefuse = {}
        state.codefuseParserVersion = CURRENT_CODEFUSE_PARSER_VERSION
      }
      if ((state.claudeCodeParserVersion ?? 0) < CURRENT_CLAUDE_CODE_PARSER_VERSION) {
        // v1: a message's tool calls were deleted each time its record was
        // inserted again, leaving about one call per message; re-import every
        // Claude Code log so the missing calls are restored.
        state.files['claude-code'] = {}
        state.claudeCodeParserVersion = CURRENT_CLAUDE_CODE_PARSER_VERSION
      }
      return state
    } catch {
      return defaultState()
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

  getCodeBuddyIdeCursor(): number {
    return this.data.codebuddyIde ?? 0
  }

  setCodeBuddyIdeCursor(ts: number): void {
    this.data.codebuddyIde = ts
  }

  getToolCallBackfillVersion(): number {
    return this.data.toolCallBackfillVersion ?? 0
  }

  setToolCallBackfillVersion(version: number): void {
    this.data.toolCallBackfillVersion = version
  }
}
