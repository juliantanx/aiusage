import { describe, it, expect } from 'vitest'
import { Aggregator } from '../src/aggregator.js'
import type { ParseContext } from '../src/types.js'

describe('Aggregator', () => {
  const aggregator = new Aggregator()

  it('creates correct context for Claude Code', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/path/to/file.jsonl',
      lineOffset: 100,
      sessionId: 'abc123',
      device: 'test-device',
      deviceInstanceId: 'device-123',
    })
    expect(context.tool).toBe('claude-code')
    expect(context.sourceFile).toBe('/path/to/file.jsonl')
    expect(context.lineOffset).toBe(100)
    expect(context.sessionId).toBe('abc123')
    expect(context.device).toBe('test-device')
    expect(context.deviceInstanceId).toBe('device-123')
    expect(context.now).toBeGreaterThan(0)
  })

  it('processes a line through the correct parser', () => {
    const line = '{"message":{"role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50},"timestamp":1234567890}}'
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    const result = aggregator.parseLine(line, context)
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
  })

  it('returns null for invalid JSON', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    const result = aggregator.parseLine('not json', context)
    expect(result).toBeNull()
  })

  it('finalizes Codex parser and returns orphan tool calls', () => {
    // Simulate Codex function_call without subsequent token_count
    const functionCallLine = '{"event_msg":{"type":"event","payload":{"type":"function_call","function":{"name":"Read"}},"timestamp":1234567890}}'
    const context = aggregator.createContext({
      tool: 'codex',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'rollout-abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    aggregator.parseLine(functionCallLine, context)
    const orphanResults = aggregator.finalize()
    expect(orphanResults).toHaveLength(1)
    expect(orphanResults[0].toolCalls[0].name).toBe('Read')
    expect(orphanResults[0].toolCalls[0].recordId).toBeNull()
  })

  it('creates parse context for opencode', () => {
    const context = aggregator.createContext({
      tool: 'opencode',
      sourceFile: '/tmp/opencode.db',
      lineOffset: 0,
      sessionId: 'ses_123',
      device: 'macbook',
      deviceInstanceId: 'device-123',
    })

    expect(context.tool).toBe('opencode')
    expect(context.sessionId).toBe('ses_123')
  })

  it('returns empty array on finalize for non-Codex parsers', () => {
    const context = aggregator.createContext({
      tool: 'claude-code',
      sourceFile: '/test.jsonl',
      lineOffset: 0,
      sessionId: 'abc',
      device: 'dev',
      deviceInstanceId: 'dev-123',
    })
    // No lines parsed, finalize should return empty
    const results = aggregator.finalize()
    expect(results).toHaveLength(0)
  })
})
