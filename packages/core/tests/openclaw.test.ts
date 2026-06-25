import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OpenClawParser } from '../src/parsers/openclaw.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/openclaw/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('OpenClawParser', () => {
  const parser = new OpenClawParser()
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'session-abc',
    tool: 'openclaw',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('parses message with cost field (costSource = log)', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('gpt-4o')
    expect(result!.record.cost).toBe(0.05)
    expect(result!.record.costSource).toBe('log')
    expect(result!.record.provider).toBe('openai')
  })

  it('parses message without cost field (costSource = pricing)', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('claude-sonnet-4-6')
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
  })

  it('uses message.provider when available', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result!.record.provider).toBe('anthropic')
  })

  it('infers provider from model when message.provider missing', () => {
    const result = parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    expect(result!.record.provider).toBe('openai')
  })

  it('parses message with unknown model', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('unknown')
    expect(result!.record.costSource).toBe('unknown')
    expect(result!.record.cost).toBe(0)
  })

  it('parses tool calls in correct order', () => {
    const result = parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    expect(result!.toolCalls).toHaveLength(1)
    expect(result!.toolCalls[0].name).toBe('Bash')
    expect(result!.toolCalls[0].callIndex).toBe(0)
  })

  it('parses multiple tool calls', () => {
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('Read')
    expect(result!.toolCalls[0].callIndex).toBe(0)
    expect(result!.toolCalls[1].name).toBe('Edit')
    expect(result!.toolCalls[1].callIndex).toBe(1)
  })

  it('does not treat a zero logged cost as authoritative (issue #13)', () => {
    // Custom gateways report cost.total = 0 for models they do not price. A zero logged
    // cost must NOT be stamped as 'log' (which would block pricing/recalc forever).
    // 'test' has no entry in the pricing table, so it resolves to 'unknown'/0.
    const line = '{"message":{"role":"assistant","model":"test","usage":{"input":10,"output":10,"cost":0}}}'
    const result = parser.parseLine(line, { ...baseContext, lineOffset: 0 })
    expect(result!.record.costSource).not.toBe('log')
    expect(result!.record.costSource).toBe('unknown')
    expect(result!.record.cost).toBe(0)
  })

  it('prices a model when the logged cost object total is zero (issue #13)', () => {
    // Same shape as the real openclaw deepseek logs: cost present but total = 0.
    // A priced model must fall through to pricing instead of being stuck at 'log'/0.
    const line = '{"message":{"role":"assistant","model":"claude-sonnet-4-6","usage":{"input":1000000,"output":0,"cost":{"input":0,"output":0,"total":0}}}}'
    const result = parser.parseLine(line, { ...baseContext, lineOffset: 0 })
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
  })

  it('still treats a positive logged cost as authoritative (costSource = log)', () => {
    const line = '{"message":{"role":"assistant","model":"test","usage":{"input":10,"output":10,"cost":{"input":0.03,"output":0.02,"total":0.05}}}}'
    const result = parser.parseLine(line, { ...baseContext, lineOffset: 0 })
    expect(result!.record.cost).toBe(0.05)
    expect(result!.record.costSource).toBe('log')
  })

  it('returns orphan tool calls for assistant messages without usage', () => {
    const parser = new OpenClawParser()
    const line = JSON.stringify({
      type: 'message',
      id: 'msg-1',
      timestamp: '2026-05-18T13:37:38.877Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will inspect the file first.' },
          { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: '/tmp/demo.txt' } },
          { type: 'toolCall', id: 'call_2', name: 'exec', arguments: { command: 'pwd' } },
        ],
      },
    })

    const result = parser.parseLine(line, { ...baseContext, lineOffset: 999 })

    expect(result).not.toBeNull()
    expect(result!.record).toBeNull()
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls[0].name).toBe('read')
    expect(result!.toolCalls[0].recordId).toBeNull()
    expect(result!.toolCalls[1].name).toBe('exec')
    expect(result!.toolCalls[1].recordId).toBeNull()
  })
})
