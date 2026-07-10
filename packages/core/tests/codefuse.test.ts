import { describe, it, expect } from 'vitest'
import { CodeFuseParser } from '../src/parsers/codefuse.js'
import type { ParseContext } from '../src/types.js'

describe('CodeFuseParser', () => {
  const baseContext: ParseContext = {
    sourceFile: '/tmp/codefuse/session.jsonl',
    lineOffset: 0,
    sessionId: 'session-1',
    tool: 'codefuse',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('parses CodeFuse CC assistant usage and tool calls', () => {
    const parser = new CodeFuseParser()
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'assistant-uuid-1',
      sessionId: 'cc-session',
      timestamp: '2026-07-06T08:00:00.000Z',
      message: {
        id: 'duplicate-message-id',
        model: 'GLM-5.1',
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'pwd' } },
          { type: 'tool_use', name: 'Skill', input: { skill: 'superpowers:brainstorming' } },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        },
      },
    })

    const result = parser.parseLine(line, baseContext)

    expect(result).not.toBeNull()
    expect(result!.record.tool).toBe('codefuse')
    expect(result!.record.sessionId).toBe('cc-session')
    expect(result!.record.model).toBe('glm-5.1')
    expect(result!.record.provider).toBe('zhipu')
    expect(result!.record.inputTokens).toBe(100)
    expect(result!.record.outputTokens).toBe(20)
    expect(result!.record.cacheWriteTokens).toBe(30)
    expect(result!.record.cacheReadTokens).toBe(40)
    expect(result!.toolCalls.map((tc) => tc.name)).toEqual(['Bash', 'skill__superpowers:brainstorming'])
  })

  it('uses uuid rather than repeated message.id for CodeFuse CC record IDs', () => {
    const parser = new CodeFuseParser()
    const makeLine = (uuid: string) => JSON.stringify({
      type: 'assistant',
      uuid,
      sessionId: 'cc-session',
      message: {
        id: 'same-message-id',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 1, output_tokens: 2 },
      },
      timestamp: '2026-07-06T08:00:00.000Z',
    })

    const result1 = parser.parseLine(makeLine('uuid-1'), { ...baseContext, lineOffset: 10 })
    const result2 = parser.parseLine(makeLine('uuid-2'), { ...baseContext, lineOffset: 20 })

    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()
    expect(result1!.record.id).not.toBe(result2!.record.id)
  })

  it('does not double-count native cachedTokens', () => {
    const parser = new CodeFuseParser()
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'native-uuid-1',
      sessionId: 'native-session',
      timestamp: '2026-07-06T08:00:00.000Z',
      startTime: 1783334400000,
      modelId: 'antchat/GLM-5.1',
      message: {
        content: [
          { type: 'tool-call', toolName: 'Read', input: { filePath: '/tmp/a.ts' } },
        ],
      },
      usage: {
        promptTokens: 100,
        completionTokens: 25,
        cachedTokens: 60,
        totalTokens: 125,
      },
    })

    const result = parser.parseLine(line, baseContext)

    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('glm-5.1')
    expect(result!.record.inputTokens).toBe(40)
    expect(result!.record.cacheReadTokens).toBe(60)
    expect(result!.record.outputTokens).toBe(25)
    expect(result!.record.ts).toBe(1783334400000)
    expect(result!.toolCalls.map((tc) => tc.name)).toEqual(['Read'])
  })

  it('normalizes routed models before pricing and provider inference', () => {
    const parser = new CodeFuseParser()
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'native-uuid-priced',
      sessionId: 'native-session',
      timestamp: '2026-07-06T08:00:00.000Z',
      modelId: 'glink/claude-opus-4-6',
      usage: {
        promptTokens: 1000,
        completionTokens: 100,
        cachedTokens: 400,
      },
    })

    const result = parser.parseLine(line, baseContext)

    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-opus-4-6')
    expect(result!.record.provider).toBe('anthropic')
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
  })

  it('does not parse non-assistant CodeFuse-looking usage rows', () => {
    const parser = new CodeFuseParser()
    const nativeToolRow = JSON.stringify({
      type: 'tool',
      uuid: 'tool-uuid',
      modelId: 'antchat/GLM-5.1',
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        cachedTokens: 10,
      },
    })
    const ccUserRow = JSON.stringify({
      type: 'user',
      uuid: 'user-uuid',
      message: {
        model: 'claude-opus-4-8',
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    })

    expect(parser.parseLine(nativeToolRow, baseContext)).toBeNull()
    expect(parser.parseLine(ccUserRow, baseContext)).toBeNull()
  })

  it('skips synthetic and zero-token CodeFuse CC messages', () => {
    const parser = new CodeFuseParser()
    const synthetic = JSON.stringify({
      type: 'assistant',
      uuid: 'synthetic-uuid',
      message: {
        model: '<synthetic>',
        usage: { input_tokens: 100, output_tokens: 1 },
      },
    })
    const zero = JSON.stringify({
      type: 'assistant',
      uuid: 'zero-uuid',
      message: {
        model: 'GLM-5.1',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })

    expect(parser.parseLine(synthetic, baseContext)).toBeNull()
    expect(parser.parseLine(zero, baseContext)).toBeNull()
  })

  it('parses embedded Codex token_count as CodeFuse and associates pending tool calls', () => {
    const parser = new CodeFuseParser()
    const functionCall = JSON.stringify({
      timestamp: '2026-07-06T08:00:00.000Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command' },
    })
    const tokenCount = JSON.stringify({
      timestamp: '2026-07-06T08:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        model: 'gpt-5.4',
        info: {
          last_token_usage: {
            input_tokens: 10,
            output_tokens: 5,
            cached_input_tokens: 2,
            reasoning_output_tokens: 1,
          },
        },
      },
    })

    expect(parser.parseLine(functionCall, baseContext)).toBeNull()
    const result = parser.parseLine(tokenCount, { ...baseContext, lineOffset: 100 })

    expect(result).not.toBeNull()
    expect(result!.record.tool).toBe('codefuse')
    expect(result!.record.model).toBe('gpt-5.4')
    expect(result!.record.cacheReadTokens).toBe(2)
    expect(result!.record.thinkingTokens).toBe(1)
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].recordId).toBe(result!.record.id)
  })

  it('does not carry embedded Codex model state across finalized files', () => {
    const parser = new CodeFuseParser()
    const turnContext = JSON.stringify({
      type: 'turn_context',
      payload: { model: 'gpt-5.4' },
    })
    const tokenCountWithoutModel = JSON.stringify({
      timestamp: '2026-07-06T08:01:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        },
      },
    })

    expect(parser.parseLine(turnContext, baseContext)).toBeNull()
    expect(parser.finalize()).toEqual([])
    const result = parser.parseLine(tokenCountWithoutModel, {
      ...baseContext,
      sourceFile: '/tmp/codefuse/next-session.jsonl',
      sessionId: 'next-session',
    })

    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('unknown')
    expect(result!.record.costSource).toBe('unknown')
  })

  it('finalizes embedded Codex function calls as CodeFuse orphan tool calls', () => {
    const parser = new CodeFuseParser()
    const functionCall = JSON.stringify({
      timestamp: '2026-07-06T08:00:00.000Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command' },
    })

    expect(parser.parseLine(functionCall, baseContext)).toBeNull()
    const results = parser.finalize()

    expect(results).toHaveLength(1)
    expect(results[0].record).toBeNull()
    expect(results[0].toolCalls).toHaveLength(1)
    expect(results[0].toolCalls[0]).toMatchObject({
      recordId: null,
      tool: 'codefuse',
      name: 'exec_command',
    })
  })
})
