import { describe, it, expect } from 'vitest'
import { inferProvider, MODEL_PROVIDER_MAP } from '../src/provider.js'

describe('MODEL_PROVIDER_MAP', () => {
  it('contains expected prefixes', () => {
    const prefixes = MODEL_PROVIDER_MAP.map(([prefix]) => prefix)
    expect(prefixes).toContain('claude-')
    expect(prefixes).toContain('gpt-')
    expect(prefixes).toContain('o1-')
    expect(prefixes).toContain('o3-')
    expect(prefixes).toContain('o4-')
    expect(prefixes).toContain('deepseek-')
    expect(prefixes).toContain('gemini-')
  })
})

describe('inferProvider', () => {
  it('returns anthropic for claude- models', () => {
    expect(inferProvider('claude-opus-4-6')).toBe('anthropic')
    expect(inferProvider('claude-sonnet-4-6')).toBe('anthropic')
    expect(inferProvider('claude-haiku-4-5')).toBe('anthropic')
  })

  it('returns openai for gpt- models', () => {
    expect(inferProvider('gpt-4o')).toBe('openai')
    expect(inferProvider('gpt-4.1')).toBe('openai')
  })

  it('returns openai for o1-, o3-, o4- models', () => {
    expect(inferProvider('o1-preview')).toBe('openai')
    expect(inferProvider('o3-mini')).toBe('openai')
    expect(inferProvider('o4-mini')).toBe('openai')
  })

  it('returns deepseek for deepseek- models', () => {
    expect(inferProvider('deepseek-v3')).toBe('deepseek')
    expect(inferProvider('deepseek-r1')).toBe('deepseek')
  })

  it('returns google for gemini- models', () => {
    expect(inferProvider('gemini-2.0-flash')).toBe('google')
    expect(inferProvider('gemini-pro')).toBe('google')
  })

  it('returns unknown for unrecognized models', () => {
    expect(inferProvider('unknown-model')).toBe('unknown')
    expect(inferProvider('custom-model-v1')).toBe('unknown')
    expect(inferProvider('')).toBe('unknown')
  })

  it('handles case-sensitive matching', () => {
    expect(inferProvider('Claude-Opus-4-6')).toBe('unknown')
    expect(inferProvider('GPT-4o')).toBe('unknown')
  })
})
