import type { Tool, ParseContext, ParseResult } from './types.js'
import type { Parser } from './parsers/index.js'
import { ClaudeCodeParser } from './parsers/claude-code.js'
import { CodexParser } from './parsers/codex.js'
import { CodeFuseParser } from './parsers/codefuse.js'
import { OpenClawParser } from './parsers/openclaw.js'
import { QoderParser } from './parsers/qoder.js'
import { CopilotParser } from './parsers/copilot.js'
import { GenericJsonlParser } from './parsers/generic-jsonl.js'

export interface CreateContextOptions {
  tool: Tool
  sourceFile: string
  lineOffset: number
  sessionId: string
  device: string
  deviceInstanceId: string
  platform?: string
  exchangeRate?: number
}

export class Aggregator {
  private parsers: Map<Tool, Parser>
  private activeParser: Parser | null = null

  constructor() {
    this.parsers = new Map([
      ['claude-code', new ClaudeCodeParser()],
      ['codex', new CodexParser()],
      ['codefuse', new CodeFuseParser()],
      ['openclaw', new OpenClawParser()],
      ['qoder', new QoderParser()],
      ['copilot', new CopilotParser()],
      ['gemini', new GenericJsonlParser('gemini', 'gemini-unknown')],
      ['kimi', new GenericJsonlParser('kimi', 'kimi-for-coding')],
      ['codebuddy', new GenericJsonlParser('codebuddy', 'codebuddy-unknown')],
      ['antigravity', new GenericJsonlParser('antigravity', 'antigravity-unknown')],
      ['omp', new GenericJsonlParser('omp', 'omp-unknown')],
      ['pi', new GenericJsonlParser('pi', 'pi-unknown')],
      ['craft', new GenericJsonlParser('craft', 'craft-unknown')],
      ['droid', new GenericJsonlParser('droid', 'droid-unknown')],
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
    const results: ParseResult[] = []
    for (const parser of this.parsers.values()) {
      if (parser.finalize) {
        results.push(...parser.finalize())
      }
    }
    return results
  }
}
