import { describe, it, expect } from 'vitest'
import { GenericJsonlParser } from '../src/parsers/generic-jsonl.js'
import type { ParseContext } from '../src/types.js'

// CodeBuddy CLI writes usage under both `message.usage` (Anthropic-shaped names but
// OpenAI-style semantics — input_tokens INCLUDES cached tokens) and
// `providerData.rawUsage` (clean prompt_cache_hit/miss decomposition). The parser must
// not double-count the cached tokens as both input and cache-read.
describe('GenericJsonlParser codebuddy CLI usage', () => {
  const parser = new GenericJsonlParser('codebuddy', 'codebuddy-unknown')
  const ctx: ParseContext = {
    sourceFile: '/tmp/cb.jsonl',
    lineOffset: 0,
    sessionId: 'session-1',
    tool: 'codebuddy',
    now: 1776738085700,
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }

  it('uses rawUsage hit/miss decomposition (no double-count of cached input)', () => {
    const line = JSON.stringify({
      type: 'message',
      role: 'assistant',
      timestamp: '2026-07-01T07:28:00.000Z',
      message: {
        // Cache-inclusive input_tokens; naive parsing double-counts the 27264 cached.
        usage: { input_tokens: 27537, output_tokens: 552, total_tokens: 28089, cache_read_input_tokens: 27264 },
      },
      providerData: {
        model: 'glm-5.1',
        rawUsage: {
          prompt_tokens: 27537,
          completion_tokens: 552,
          prompt_cache_hit_tokens: 27264,
          prompt_cache_miss_tokens: 273,
          prompt_cache_write_tokens: 0,
          completion_thinking_tokens: 0,
          prompt_tokens_details: { cached_tokens: 27264 },
        },
      },
    })

    const result = parser.parseLine(line, ctx)
    expect(result).not.toBeNull()
    expect(result!.record).toMatchObject({
      model: 'glm-5.1',
      provider: 'zhipu',
      inputTokens: 273,        // non-cached only (prompt_cache_miss_tokens)
      outputTokens: 552,
      cacheReadTokens: 27264,  // cached, counted once
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    })
  })

  it('falls back to message.usage and subtracts cache reads from input', () => {
    const line = JSON.stringify({
      type: 'message',
      role: 'assistant',
      timestamp: '2026-07-01T07:28:00.000Z',
      providerData: { model: 'glm-5.1' },
      message: {
        usage: { input_tokens: 28923, output_tokens: 106, cache_read_input_tokens: 28672 },
      },
    })

    const result = parser.parseLine(line, ctx)
    expect(result).not.toBeNull()
    expect(result!.record).toMatchObject({
      model: 'glm-5.1',
      inputTokens: 251,        // 28923 - 28672
      outputTokens: 106,
      cacheReadTokens: 28672,
    })
  })
})
