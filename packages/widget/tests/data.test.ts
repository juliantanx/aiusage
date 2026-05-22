import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { queryWidgetData } from '../src/data'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      tool TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0
    )
  `)
  return db
}

function todayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function monthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

describe('queryWidgetData', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('returns zero totals when no records exist', () => {
    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(0)
    expect(result.todayTokens.input).toBe(0)
    expect(result.todayTokens.output).toBe(0)
    expect(result.monthTokens.total).toBe(0)
    expect(result.topModel).toBeNull()
  })

  it('counts today tokens correctly', () => {
    const now = Date.now()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.todayTokens.input).toBe(1000)
    expect(result.todayTokens.output).toBe(500)
    expect(result.todayTokens.total).toBe(1500)
  })

  it('excludes records from before today', () => {
    const yesterday = todayMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(0)
  })

  it('counts month tokens including today', () => {
    const now = Date.now()
    const startOfMonth = monthStartMs()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r2', startOfMonth + 1000, 'claude-code', 'claude-sonnet-4-6', 2000, 1000, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.monthTokens.total).toBe(4500)
  })

  it('excludes records from before this month', () => {
    const beforeMonth = monthStartMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', beforeMonth, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.monthTokens.total).toBe(0)
  })

  it('returns top model with share percentage', () => {
    const now = Date.now()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 800, 200, 0, 0, 0, 0)
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r2', now, 'claude-code', 'claude-haiku-4-5-20251001', 200, 50, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.topModel).not.toBeNull()
    expect(result.topModel!.name).toBe('claude-sonnet-4-6')
    // 1000 out of 1250 total = 80%
    expect(result.topModel!.share).toBe(80)
  })

  it('includes cache and thinking tokens in totals', () => {
    const now = Date.now()
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 200, 300, 400, 0)

    const result = queryWidgetData(db)
    // total = input(100) + output(50) + cache_read(200) + cache_write(300) + thinking(400) = 1050
    expect(result.todayTokens.total).toBe(1050)
    expect(result.todayTokens.input).toBe(100)
    expect(result.todayTokens.output).toBe(50)
    expect(result.monthTokens.total).toBe(1050)
  })

  it('returns null topModel when no today records', () => {
    const yesterday = todayMs() - 1
    db.prepare(`INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0)

    const result = queryWidgetData(db)
    expect(result.topModel).toBeNull()
  })
})
