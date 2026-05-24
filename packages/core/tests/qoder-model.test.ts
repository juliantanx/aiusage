import { describe, expect, it } from 'vitest'
import { normalizeQoderModel } from '../src/qoder-model.js'

describe('normalizeQoderModel', () => {
  it('normalizes qoder tier model names', () => {
    expect(normalizeQoderModel('ultimate')).toBe('qoder-ultimate')
    expect(normalizeQoderModel('efficient')).toBe('qoder-efficient')
    expect(normalizeQoderModel('QODER-PERFORMANCE')).toBe('qoder-performance')
  })

  it('preserves provider model ids and unknown values', () => {
    expect(normalizeQoderModel('gpt-4o')).toBe('gpt-4o')
    expect(normalizeQoderModel('unknown')).toBe('unknown')
  })

  it('returns unknown for empty or degenerate inputs', () => {
    expect(normalizeQoderModel('')).toBe('unknown')
    expect(normalizeQoderModel('   ')).toBe('unknown')
    expect(normalizeQoderModel('qoder-')).toBe('unknown')
  })
})
