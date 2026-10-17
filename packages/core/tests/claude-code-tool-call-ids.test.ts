import { describe, it, expect } from 'vitest'
import { ClaudeCodeParser } from '../src/parsers/claude-code.js'
import { generateBlockToolCallId, generateToolCallId } from '../src/record-id.js'
import type { ParseContext } from '../src/types.js'

const context: ParseContext = {
  tool: 'claude-code',
  sourceFile: '/logs/session.jsonl',
  lineOffset: 0,
  sessionId: 'session',
  device: 'laptop',
  deviceInstanceId: 'device-1',
  now: 1_776_738_090_000,
}

function line(content: unknown[], timestamp = '2026-07-06T08:00:01.000Z'): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    message: {
      id: 'msg_1',
      model: 'claude-sonnet-4-6',
      content,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  })
}

describe('Claude Code tool call ids', () => {
  const parser = new ClaudeCodeParser()

  it('keys a tool call on the id of its tool_use block', () => {
    const result = parser.parseLine(line([{ type: 'tool_use', id: 'toolu_a', name: 'Read', input: {} }]), context)!

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].id).toBe(generateBlockToolCallId(result.record.id, 'toolu_a'))
  })

  it('gives two lines of one message different ids for the same tool name and timestamp', () => {
    // Claude Code writes one line per content block, so both calls have callIndex 0.
    const first = parser.parseLine(line([{ type: 'tool_use', id: 'toolu_a', name: 'Read', input: {} }]), context)!
    const second = parser.parseLine(line([{ type: 'tool_use', id: 'toolu_b', name: 'Read', input: {} }]), { ...context, lineOffset: 400 })!

    expect(second.record.id).toBe(first.record.id)
    expect(second.toolCalls[0]).toMatchObject({ name: 'Read', ts: first.toolCalls[0].ts, callIndex: 0 })
    expect(second.toolCalls[0].id).not.toBe(first.toolCalls[0].id)
  })

  it('gives the same block the same id wherever its line is read from', () => {
    const block = { type: 'tool_use', id: 'toolu_a', name: 'Skill', input: { skill: 'review' } }
    const first = parser.parseLine(line([block]), context)!
    const second = parser.parseLine(line([block], '2026-07-06T09:30:00.000Z'), { ...context, sourceFile: '/logs/resumed.jsonl', lineOffset: 9000 })!

    expect(second.toolCalls[0].id).toBe(first.toolCalls[0].id)
  })

  it('keys a block without an id on its name, timestamp and index, never on the positional id', () => {
    const result = parser.parseLine(line([
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'tool_use', id: '', name: 'Edit', input: {} },
    ]), context)!

    const ts = new Date('2026-07-06T08:00:01.000Z').getTime()
    const ids = result.toolCalls.map(tc => tc.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).not.toContain(generateToolCallId(result.record.id, 'Read', ts, 0))
    expect(ids).not.toContain(generateToolCallId(result.record.id, 'Edit', ts, 1))
    // Stable: the same line gives the same ids again.
    expect(parser.parseLine(line([
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'tool_use', id: '', name: 'Edit', input: {} },
    ]), context)!.toolCalls.map(tc => tc.id)).toEqual(ids)
  })
})

describe('generateBlockToolCallId', () => {
  it('is stable, 16 hex characters, and separates its fields', () => {
    expect(generateBlockToolCallId('rec', 'toolu_a')).toBe(generateBlockToolCallId('rec', 'toolu_a'))
    expect(generateBlockToolCallId('rec', 'toolu_a')).toMatch(/^[0-9a-f]{16}$/)
    expect(generateBlockToolCallId('rec', 'toolu_a')).not.toBe(generateBlockToolCallId('rec', 'toolu_b'))
    expect(generateBlockToolCallId('rec', 'toolu_a')).not.toBe(generateBlockToolCallId('rec2', 'toolu_a'))
    expect(generateBlockToolCallId('ab', 'c')).not.toBe(generateBlockToolCallId('a', 'bc'))
  })
})
