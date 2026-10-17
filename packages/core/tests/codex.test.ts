import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CodexParser } from '../src/parsers/codex.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/codex/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('CodexParser', () => {
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'rollout-abc123',
    tool: 'codex',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('skips session init line', () => {
    const parser = new CodexParser()
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).toBeNull()
  })

  it('skips function_call lines (stored as pending)', () => {
    const parser = new CodexParser()
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).toBeNull()
  })

  it('parses token_count line and associates pending tool calls', () => {
    const parser = new CodexParser()
    // Parse function_call first
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    // Parse token_count
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('gpt-4o')
    expect(result!.record.inputTokens).toBe(100)
    // fixture: output_tokens 50 of which reasoning_output_tokens 20
    expect(result!.record.outputTokens).toBe(30)
    expect(result!.record.cacheReadTokens).toBe(0)
    expect(result!.record.thinkingTokens).toBe(20)
    expect(result!.record.cacheWriteTokens).toBe(0)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].recordId).toBe(result!.record.id)
  })

  it('stores input tokens exclusive of cached input tokens', () => {
    const parser = new CodexParser()
    // fixture: input_tokens 200 of which cached_input_tokens 50
    const result = parser.parseLine(lines[4], { ...baseContext, lineOffset: 0 })
    expect(result!.record.inputTokens).toBe(150)
    expect(result!.record.cacheReadTokens).toBe(50)
    expect(result!.record.outputTokens).toBe(80)
  })

  it('associates multiple tool calls with one token_count', () => {
    const parser = new CodexParser()
    // Parse two function_calls
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    // Parse token_count
    const result = parser.parseLine(lines[4], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + lines[3].length + 4 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Bash')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('handles orphan tool calls on finalize', () => {
    const parser = new CodexParser()
    // Parse function_call that won't be associated
    parser.parseLine(lines[5], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + lines[3].length + lines[4].length + 5 })
    const results = parser.finalize()
    expect(results).toHaveLength(1)
    expect(results[0].record).toBeNull()
    expect(results[0].toolCalls).toHaveLength(1)
    expect(results[0].toolCalls[0].name).toBe('Edit')
    expect(results[0].toolCalls[0].recordId).toBeNull()
  })

  it('parses response_item function_call format and associates pending tool calls', () => {
    const parser = new CodexParser()
    const functionCall = JSON.stringify({
      timestamp: '2026-05-26T08:05:24.042Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"pwd"}',
        call_id: 'call_123',
      },
    })
    const tokenCount = JSON.stringify({
      timestamp: '2026-05-26T08:05:25.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        model: 'gpt-5.4',
        info: {
          last_token_usage: {
            input_tokens: 12,
            cached_input_tokens: 0,
            output_tokens: 3,
            reasoning_output_tokens: 0,
          },
        },
      },
    })

    expect(parser.parseLine(functionCall, { ...baseContext, lineOffset: 100 })).toBeNull()
    const result = parser.parseLine(tokenCount, { ...baseContext, lineOffset: 200 })

    expect(result).not.toBeNull()
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('exec_command')
  })
})
