import { describe, expect, it } from 'vitest'
import { GrokParser } from '../src/parsers/grok.js'
import type { ParseContext, ParseResult } from '../src/types.js'

function context(
  sourceFile = '/home/test/.grok/sessions/%2Fwork%2Fapp/session-1/updates.jsonl',
  lineOffset = 0,
): ParseContext {
  return {
    tool: 'grok',
    sourceFile,
    lineOffset,
    sessionId: 'unknown',
    now: 1_800_000_000_000,
    device: 'test-device',
    deviceInstanceId: 'device-1',
  }
}

function row(options: {
  sessionUpdate?: string
  totalTokens?: number
  timestamp?: number
  modelId?: string
  sessionId?: string
}): string {
  const {
    sessionUpdate = 'agent_message_chunk',
    totalTokens,
    timestamp = 1_700_000_000_000,
    modelId,
    sessionId = 'session-1',
  } = options
  return JSON.stringify({
    method: 'session/update',
    params: {
      sessionId,
      update: {
        sessionUpdate,
        ...(modelId ? { _meta: { modelId } } : {}),
      },
      _meta: {
        ...(totalTokens == null ? {} : { totalTokens }),
        agentTimestampMs: timestamp,
      },
    },
  })
}

function records(results: Array<ParseResult | null>): ParseResult[] {
  return results.filter((result): result is ParseResult => result?.record != null)
}

describe('GrokParser', () => {
  it('emits positive cumulative token deltas per turn with stable metadata', () => {
    const parser = new GrokParser()
    const emitted = records([
      parser.parseLine(row({ totalTokens: 100 }), context(undefined, 0)),
      parser.parseLine(row({ sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast', timestamp: 1_700_000_001_000 }), context(undefined, 100)),
      parser.parseLine(row({ totalTokens: 250, timestamp: 1_700_000_002_000 }), context(undefined, 200)),
      parser.parseLine(row({ totalTokens: 300, timestamp: 1_700_000_003_000 }), context(undefined, 300)),
      parser.parseLine(row({ sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast', timestamp: 1_700_000_004_000 }), context(undefined, 400)),
      parser.parseLine(row({ totalTokens: 450, timestamp: 1_700_000_005_000 }), context(undefined, 500)),
      ...parser.finalize(),
    ])

    expect(emitted).toHaveLength(2)
    expect(emitted.map(result => result.record?.inputTokens)).toEqual([200, 150])
    expect(emitted.map(result => result.record?.lineOffset)).toEqual([100, 400])
    expect(emitted.map(result => result.record?.ts)).toEqual([1_700_000_003_000, 1_700_000_005_000])
    expect(emitted[0].record).toMatchObject({
      tool: 'grok',
      model: 'grok-composer-2.5-fast',
      provider: 'xai',
      sessionId: 'session-1',
      cwd: '/work/app',
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
  })

  it('ignores duplicate and decreasing cumulative counters', () => {
    const parser = new GrokParser()
    parser.parseLine(row({ totalTokens: 100 }), context(undefined, 0))
    parser.parseLine(row({ sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast' }), context(undefined, 100))
    parser.parseLine(row({ totalTokens: 150 }), context(undefined, 200))
    parser.parseLine(row({ totalTokens: 150 }), context(undefined, 300))
    parser.parseLine(row({ totalTokens: 120 }), context(undefined, 400))
    parser.parseLine(row({ totalTokens: 200, timestamp: 1_700_000_005_000 }), context(undefined, 500))

    const [result] = parser.finalize()
    expect(result.record?.inputTokens).toBe(100)
    expect(result.record?.ts).toBe(1_700_000_005_000)
  })

  it('emits an aggregate fallback without a user-message boundary', () => {
    const parser = new GrokParser()
    parser.parseLine(row({ totalTokens: 120, modelId: undefined }), context(undefined, 25))

    const [result] = parser.finalize()
    expect(result.record).toMatchObject({
      model: 'grok-unknown',
      inputTokens: 120,
      lineOffset: 25,
    })
  })

  it('uses stable turn offsets when an appended turn replaces its previous snapshot', () => {
    const parser = new GrokParser()
    parser.parseLine(row({ sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast' }), context(undefined, 10))
    parser.parseLine(row({ totalTokens: 150 }), context(undefined, 100))
    const [first] = parser.finalize()

    parser.parseLine(row({ sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast' }), context(undefined, 10))
    parser.parseLine(row({ totalTokens: 150 }), context(undefined, 100))
    parser.parseLine(row({ totalTokens: 200 }), context(undefined, 200))
    const [second] = parser.finalize()

    expect(first.record?.id).toBe(second.record?.id)
    expect(first.record?.inputTokens).toBe(150)
    expect(second.record?.inputTokens).toBe(200)
  })

  it('clears parser state between finalized files', () => {
    const parser = new GrokParser()
    parser.parseLine(row({ totalTokens: 100, sessionId: 'session-1', modelId: 'grok-one' }), context(undefined, 0))
    const [first] = parser.finalize()

    const secondSource = '/home/test/.grok/sessions/%2Fwork%2Fother/session-2/updates.jsonl'
    parser.parseLine(row({ totalTokens: 40, sessionId: 'session-2', modelId: 'grok-two' }), context(secondSource, 0))
    const [second] = parser.finalize()

    expect(first.record).toMatchObject({ sessionId: 'session-1', model: 'grok-one', inputTokens: 100, cwd: '/work/app' })
    expect(second.record).toMatchObject({ sessionId: 'session-2', model: 'grok-two', inputTokens: 40, cwd: '/work/other' })
  })
})
