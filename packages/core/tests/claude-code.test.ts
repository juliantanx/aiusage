import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeCodeParser } from '../src/parsers/claude-code.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/claude-code/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('ClaudeCodeParser', () => {
  const parser = new ClaudeCodeParser()
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'abc123',
    tool: 'claude-code',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('skips lines without message.usage', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).toBeNull()
  })

  it('parses assistant message with tool_use', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.inputTokens).toBe(100)
    expect(result!.record.outputTokens).toBe(50)
    expect(result!.record.cacheWriteTokens).toBe(200)
    expect(result!.record.cacheReadTokens).toBe(0)
    expect(result!.record.thinkingTokens).toBe(0)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
  })

  it('parses assistant message without tool_use', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.cacheWriteTokens).toBe(0)
    expect(result!.record.cacheReadTokens).toBe(100)
    expect(result!.toolCalls).toHaveLength(0)
  })

  it('parses message with unknown model', () => {
    const result = parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + 3 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('unknown')
    expect(result!.record.costSource).toBe('unknown')
  })

  it('parses multiple tool calls in correct order', () => {
    const result = parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + 3 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Bash')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Edit')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('uses message.timestamp as tool call timestamp', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result!.toolCalls[0].ts).toBe(1776738085400)
  })

  it('generates consistent record IDs', () => {
    const result1 = parser.parseLine(lines[1], { ...baseContext, lineOffset: 100 })
    const result2 = parser.parseLine(lines[1], { ...baseContext, lineOffset: 100 })
    expect(result1!.record.id).toBe(result2!.record.id)
  })
})
