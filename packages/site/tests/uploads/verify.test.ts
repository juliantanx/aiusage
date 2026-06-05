import { describe, it, expect } from 'vitest'
import { validatePayload, validatePeriodBoundary, type UploadSnapshot, type UploadBreakdown } from '../../src/lib/server/uploads/verify.js'
import { createHash } from 'node:crypto'

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function makeBreakdown(overrides: Partial<UploadBreakdown> = {}): UploadBreakdown {
  return {
    scope_type: 'all',
    tool: null,
    model: null,
    total_tokens: 100,
    input_tokens: 40,
    output_tokens: 30,
    cache_read_tokens: 10,
    cache_write_tokens: 10,
    thinking_tokens: 10,
    ...overrides
  }
}

function makeSnapshot(overrides: Partial<UploadSnapshot> = {}): UploadSnapshot {
  const allBd = makeBreakdown({ scope_type: 'all', tool: null, model: null })
  const toolBd = makeBreakdown({ scope_type: 'tool', tool: 'claude-code', model: null })
  const modelBd = makeBreakdown({ scope_type: 'model', tool: null, model: 'claude-sonnet-4-20250514' })
  const tmBd = makeBreakdown({ scope_type: 'tool_model', tool: 'claude-code', model: 'claude-sonnet-4-20250514' })

  const snap: UploadSnapshot = {
    period_type: 'daily',
    period_start: '2026-06-01T00:00:00.000Z',
    period_end: '2026-06-01T23:59:59.999Z',
    total_tokens: 100,
    input_tokens: 40,
    output_tokens: 30,
    cache_read_tokens: 10,
    cache_write_tokens: 10,
    thinking_tokens: 10,
    breakdowns: [allBd, toolBd, modelBd, tmBd],
    token_snapshot_hash: '',
    ...overrides
  }

  if (!overrides.token_snapshot_hash) {
    snap.token_snapshot_hash = computeHash(snap)
  }

  return snap
}

function computeHash(snap: UploadSnapshot): string {
  const canonical = {
    period_type: snap.period_type,
    period_start: snap.period_start,
    period_end: snap.period_end,
    total_tokens: snap.total_tokens,
    input_tokens: snap.input_tokens,
    output_tokens: snap.output_tokens,
    cache_read_tokens: snap.cache_read_tokens,
    cache_write_tokens: snap.cache_write_tokens,
    thinking_tokens: snap.thinking_tokens,
    breakdowns: [...snap.breakdowns].sort((a, b) =>
      a.scope_type.localeCompare(b.scope_type) ||
      String(a.tool ?? '').localeCompare(String(b.tool ?? '')) ||
      String(a.model ?? '').localeCompare(String(b.model ?? ''))
    ).map(b => ({
      scope_type: b.scope_type,
      tool: b.tool,
      model: b.model,
      total_tokens: b.total_tokens,
      input_tokens: b.input_tokens,
      output_tokens: b.output_tokens,
      cache_read_tokens: b.cache_read_tokens,
      cache_write_tokens: b.cache_write_tokens,
      thinking_tokens: b.thinking_tokens,
    })),
  }
  return `sha256:${sha256(JSON.stringify(canonical))}`
}

function makeValidPayload(snapOverrides: Partial<UploadSnapshot> = {}) {
  return {
    schema_version: 1,
    client_version: '1.4.0',
    client_platform: 'macos',
    snapshots: [makeSnapshot(snapOverrides)]
  }
}

describe('validatePayload', () => {
  it('accepts valid payload', () => {
    const result = validatePayload(makeValidPayload())
    expect(result.valid).toBe(true)
  })

  it('rejects non-object', () => {
    expect(validatePayload(null).valid).toBe(false)
    expect(validatePayload('string').valid).toBe(false)
    expect(validatePayload(42).valid).toBe(false)
  })

  it('rejects wrong schema_version', () => {
    const result = validatePayload({ ...makeValidPayload(), schema_version: 2 })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('unsupported_schema_version')
  })

  it('rejects invalid client_platform', () => {
    const result = validatePayload({ ...makeValidPayload(), client_platform: 'darwin' })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_payload')
  })

  it('rejects empty snapshots', () => {
    const result = validatePayload({ ...makeValidPayload(), snapshots: [] })
    expect(result.valid).toBe(false)
  })

  it('rejects more than 5 snapshots', () => {
    const snap = makeSnapshot()
    const result = validatePayload({ ...makeValidPayload(), snapshots: Array(6).fill(snap) })
    expect(result.valid).toBe(false)
  })

  it('rejects negative token values', () => {
    const snap = makeSnapshot()
    snap.input_tokens = -1
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_token_value')
  })

  it('rejects mismatched total_tokens', () => {
    const snap = makeSnapshot()
    snap.total_tokens = 999
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_token_value')
  })

  it('rejects forbidden payload fields', () => {
    const result = validatePayload({ ...makeValidPayload(), extra_field: 'x' })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('payload_forbidden_field')
  })

  it('rejects invalid period_type', () => {
    const snap = makeSnapshot({ period_type: 'hourly' as any })
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_period_boundary')
  })

  it('rejects snapshot hash mismatch', () => {
    const snap = makeSnapshot()
    snap.token_snapshot_hash = 'sha256:wrong'
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_snapshot_hash')
  })

  it('rejects breakdown with wrong scope_type tool/model combo', () => {
    const snap = makeSnapshot()
    // 'all' scope should have tool=null, model=null
    snap.breakdowns[0] = makeBreakdown({ scope_type: 'all', tool: 'something', model: null })
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
  })

  it('rejects duplicate breakdown keys', () => {
    const snap = makeSnapshot()
    // Add duplicate tool_model breakdown
    snap.breakdowns.push(makeBreakdown({ scope_type: 'tool_model', tool: 'claude-code', model: 'claude-sonnet-4-20250514' }))
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_breakdowns')
  })

  it('rejects inconsistent tool breakdown totals', () => {
    const allBd = makeBreakdown({ scope_type: 'all', total_tokens: 100, input_tokens: 40, output_tokens: 30, cache_read_tokens: 10, cache_write_tokens: 10, thinking_tokens: 10 })
    const toolBd = makeBreakdown({ scope_type: 'tool', tool: 'claude-code', total_tokens: 50, input_tokens: 20, output_tokens: 15, cache_read_tokens: 5, cache_write_tokens: 5, thinking_tokens: 5 })
    const modelBd = makeBreakdown({ scope_type: 'model', model: 'claude-sonnet-4-20250514' })
    const tmBd = makeBreakdown({ scope_type: 'tool_model', tool: 'claude-code', model: 'claude-sonnet-4-20250514' })

    const snap = makeSnapshot({ breakdowns: [allBd, toolBd, modelBd, tmBd] })
    snap.token_snapshot_hash = computeHash(snap)
    const result = validatePayload({ ...makeValidPayload(), snapshots: [snap] })
    expect(result.valid).toBe(false)
    expect(result.error_code).toBe('invalid_breakdowns')
  })
})

describe('validatePeriodBoundary', () => {
  it('accepts valid daily boundary', () => {
    const snap = makeSnapshot({
      period_type: 'daily',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-06-01T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(true)
  })

  it('rejects daily with wrong end time', () => {
    const snap = makeSnapshot({
      period_type: 'daily',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-06-02T00:00:00.000Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(false)
  })

  it('accepts valid weekly boundary (Monday start)', () => {
    // 2026-06-01 is Monday
    const snap = makeSnapshot({
      period_type: 'weekly',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-06-07T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(true)
  })

  it('rejects weekly not starting on Monday', () => {
    // 2026-06-02 is Tuesday
    const snap = makeSnapshot({
      period_type: 'weekly',
      period_start: '2026-06-02T00:00:00.000Z',
      period_end: '2026-06-08T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(false)
  })

  it('accepts valid monthly boundary', () => {
    const snap = makeSnapshot({
      period_type: 'monthly',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-06-30T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(true)
  })

  it('rejects monthly not starting on 1st', () => {
    const snap = makeSnapshot({
      period_type: 'monthly',
      period_start: '2026-06-15T00:00:00.000Z',
      period_end: '2026-07-14T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(false)
  })

  it('accepts valid yearly boundary', () => {
    const snap = makeSnapshot({
      period_type: 'yearly',
      period_start: '2026-01-01T00:00:00.000Z',
      period_end: '2026-12-31T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(true)
  })

  it('accepts valid all_time boundary', () => {
    const snap = makeSnapshot({
      period_type: 'all_time',
      period_start: '1970-01-01T00:00:00.000Z',
      period_end: '2026-06-01T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(true)
  })

  it('rejects all_time not starting from epoch', () => {
    const snap = makeSnapshot({
      period_type: 'all_time',
      period_start: '2020-01-01T00:00:00.000Z',
      period_end: '2026-06-01T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(false)
  })

  it('rejects invalid dates', () => {
    const snap = makeSnapshot({
      period_start: 'not-a-date',
      period_end: '2026-06-01T23:59:59.999Z'
    })
    expect(validatePeriodBoundary(snap)).toBe(false)
  })
})
