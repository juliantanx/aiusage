import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QoderParser } from '../src/parsers/qoder.js'
import type { ParseContext } from '../src/types.js'

const fixturePath = join(__dirname, 'fixtures/qoder/sample.jsonl')
const lines = readFileSync(fixturePath, 'utf-8').split('\n').filter(Boolean)

describe('QoderParser', () => {
  const baseContext: ParseContext = {
    sourceFile: fixturePath,
    lineOffset: 0,
    sessionId: 'run-fallback',
    tool: 'qoder',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('parses model.response.completed lines', () => {
    const parser = new QoderParser()
    parser.parseLine(lines[0], { ...baseContext, lineOffset: 0 })
    parser.parseLine(lines[1], { ...baseContext, lineOffset: lines[0].length + 1 })
    const result = parser.parseLine(lines[2], { ...baseContext, lineOffset: lines[0].length + lines[1].length + 2 })

    expect(result).not.toBeNull()
    expect(result!.record.tool).toBe('qoder')
    expect(result!.record.model).toBe('qoder-ultimate')
    expect(result!.record.provider).toBe('qoder')
    expect(result!.record.inputTokens).toBe(20908)
    expect(result!.record.outputTokens).toBe(140)
    expect(result!.record.cacheReadTokens).toBe(0)
    expect(result!.record.cacheWriteTokens).toBe(0)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
    expect(result!.record.sessionId).toBe('run-fallback')
    expect(result!.record.ts).toBe(new Date('2026-05-18T13:34:14.750+08:00').getTime())
    expect(result!.toolCalls).toHaveLength(2)
    expect(result!.toolCalls.map(tc => tc.name)).toEqual(['Bash', 'Read'])
  })

  it('parses cache-read tokens and calculates pricing when model is known', () => {
    const parser = new QoderParser()
    const result = parser.parseLine(lines[3], { ...baseContext, lineOffset: lines[0].length + lines[1].length + lines[2].length + 3 })

    expect(result).not.toBeNull()
    expect(result!.record.model).toBe('gpt-4o')
    expect(result!.record.provider).toBe('openai')
    expect(result!.record.cacheReadTokens).toBe(20902)
    expect(result!.record.costSource).toBe('pricing')
    expect(result!.record.cost).toBeGreaterThan(0)
  })

  it('skips non-token qoder log lines', () => {
    const parser = new QoderParser()
    expect(parser.parseLine(lines[4], baseContext)).toBeNull()
    expect(parser.parseLine(lines[5], baseContext)).toBeNull()
    expect(parser.parseLine(lines[6], baseContext)).toBeNull()
  })

  it('skips zero-token model responses', () => {
    const parser = new QoderParser()
    expect(parser.parseLine(lines[7], baseContext)).toBeNull()
  })
})
