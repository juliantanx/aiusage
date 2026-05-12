import type { Tool, ParseContext, ParseResult } from './types.js'
import type { Parser } from './parsers/index.js'
import { ClaudeCodeParser } from './parsers/claude-code.js'
import { CodexParser } from './parsers/codex.js'
import { OpenClawParser } from './parsers/openclaw.js'

export interface CreateContextOptions {
  tool: Tool
  sourceFile: string
  lineOffset: number
  sessionId: string
  device: string
  deviceInstanceId: string
}

export class Aggregator {
  private parsers: Map<Tool, Parser>
  private activeParser: Parser | null = null

  constructor() {
    this.parsers = new Map([
      ['claude-code', new ClaudeCodeParser()],
      ['codex', new CodexParser()],
      ['openclaw', new OpenClawParser()],
    ])
  }

  createContext(options: CreateContextOptions): ParseContext {
    return {
      ...options,
      now: Date.now(),
    }
  }

  parseLine(line: string, context: ParseContext): ParseResult | null {
    // Get or create parser for this tool
    if (!this.activeParser || this.activeParser.tool !== context.tool) {
      this.activeParser = this.parsers.get(context.tool) ?? null
    }

    if (!this.activeParser) {
      return null
    }

    return this.activeParser.parseLine(line, context)
  }

  finalize(): ParseResult[] {
    if (!this.activeParser?.finalize) return []
    return this.activeParser.finalize()
  }
}
