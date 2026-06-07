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
      cost REAL NOT NULL DEFAULT 0,
      session_id TEXT
    )
  `)
  return db
}

function todayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const INSERT_SQL = `INSERT INTO records (id, ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

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
    expect(result.todayTokens.cacheRead).toBe(0)
    expect(result.todayTokens.cacheWrite).toBe(0)
    expect(result.todayTokens.thinking).toBe(0)
    expect(result.todayCost).toBe(0)
    expect(result.rangeTokens.total).toBe(0)
    expect(result.rangeCost).toBe(0)
    expect(result.rangeDays).toBe(30)
    expect(result.topModel).toBeNull()
    expect(result.topTool).toBeNull()
    expect(result.dailyHistory).toHaveLength(30)
    expect(result.sessionCountToday).toBe(0)
  })

  it('counts today tokens correctly with all token types', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 200, 100, 300, 0.05, 's1')

    const result = queryWidgetData(db)
    expect(result.todayTokens.input).toBe(1000)
    expect(result.todayTokens.output).toBe(500)
    expect(result.todayTokens.cacheRead).toBe(200)
    expect(result.todayTokens.cacheWrite).toBe(100)
    expect(result.todayTokens.thinking).toBe(300)
    expect(result.todayTokens.total).toBe(2100)
    expect(result.todayCost).toBeCloseTo(0.05)
  })

  it('excludes records from before today', () => {
    const yesterday = todayMs() - 1
    db.prepare(INSERT_SQL)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 1.0, null)

    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(0)
    expect(result.todayCost).toBe(0)
  })

  it('counts range tokens and cost including today (default 30 days)', () => {
    const now = Date.now()
    const fifteenDaysAgo = todayMs() - 15 * 86_400_000 + 1000
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0.03, null)
    db.prepare(INSERT_SQL)
      .run('r2', fifteenDaysAgo, 'claude-code', 'claude-sonnet-4-6', 2000, 1000, 0, 0, 0, 0.07, null)

    const result = queryWidgetData(db)
    expect(result.rangeTokens.total).toBe(4500)
    expect(result.rangeCost).toBeCloseTo(0.10)
    expect(result.rangeDays).toBe(30)
  })

  it('excludes records older than rangeDays', () => {
    const thirtyOneDaysAgo = todayMs() - 31 * 86_400_000 + 1000
    db.prepare(INSERT_SQL)
      .run('r1', thirtyOneDaysAgo, 'claude-code', 'claude-sonnet-4-6', 9999, 9999, 0, 0, 0, 5.0, null)

    const result = queryWidgetData(db, 30)
    expect(result.rangeTokens.total).toBe(0)
    expect(result.rangeCost).toBe(0)
  })

  it('respects custom rangeDays parameter', () => {
    const now = Date.now()
    const fiveDaysAgo = todayMs() - 5 * 86_400_000 + 1000
    const tenDaysAgo = todayMs() - 10 * 86_400_000 + 1000
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 0, 0, 0, 0.01, null)
    db.prepare(INSERT_SQL)
      .run('r2', fiveDaysAgo, 'claude-code', 'claude-sonnet-4-6', 200, 100, 0, 0, 0, 0.02, null)
    db.prepare(INSERT_SQL)
      .run('r3', tenDaysAgo, 'claude-code', 'claude-sonnet-4-6', 500, 250, 0, 0, 0, 0.05, null)

    // 7-day range should include today + 5 days ago, but NOT 10 days ago
    const result7 = queryWidgetData(db, 7)
    expect(result7.rangeDays).toBe(7)
    expect(result7.rangeTokens.total).toBe(450) // 150 + 300
    expect(result7.dailyHistory).toHaveLength(7)

    // 14-day range should include all three
    const result14 = queryWidgetData(db, 14)
    expect(result14.rangeDays).toBe(14)
    expect(result14.rangeTokens.total).toBe(1200) // 150 + 300 + 750
    expect(result14.dailyHistory).toHaveLength(14)
  })

  it('returns top model with share percentage', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 800, 200, 0, 0, 0, 0, null)
    db.prepare(INSERT_SQL)
      .run('r2', now, 'claude-code', 'claude-haiku-4-5-20251001', 200, 50, 0, 0, 0, 0, null)

    const result = queryWidgetData(db)
    expect(result.topModel).not.toBeNull()
    expect(result.topModel!.name).toBe('claude-sonnet-4-6')
    expect(result.topModel!.share).toBe(80)
  })

  it('returns top tool with share percentage', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 800, 200, 0, 0, 0, 0, null)
    db.prepare(INSERT_SQL)
      .run('r2', now, 'cursor', 'gpt-4o', 200, 50, 0, 0, 0, 0, null)

    const result = queryWidgetData(db)
    expect(result.topTool).not.toBeNull()
    expect(result.topTool!.name).toBe('claude-code')
    expect(result.topTool!.share).toBe(80)
  })

  it('includes cache and thinking tokens in totals', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 200, 300, 400, 0, null)

    const result = queryWidgetData(db)
    expect(result.todayTokens.total).toBe(1050)
    expect(result.todayTokens.input).toBe(100)
    expect(result.todayTokens.output).toBe(50)
    expect(result.rangeTokens.total).toBe(1050)
  })

  it('returns null topModel when no today records', () => {
    const yesterday = todayMs() - 1
    db.prepare(INSERT_SQL)
      .run('r1', yesterday, 'claude-code', 'claude-sonnet-4-6', 1000, 500, 0, 0, 0, 0, null)

    const result = queryWidgetData(db)
    expect(result.topModel).toBeNull()
    expect(result.topTool).toBeNull()
  })

  it('returns correct number of days in daily history (default 30)', () => {
    const result = queryWidgetData(db)
    expect(result.dailyHistory).toHaveLength(30)
    expect(result.dailyHistory[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.dailyHistory[29].tokens).toBe(0)
  })

  it('populates daily history with actual data', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 500, 250, 0, 0, 0, 0.02, null)

    const result = queryWidgetData(db)
    const todayEntry = result.dailyHistory[result.dailyHistory.length - 1]
    expect(todayEntry.tokens).toBe(750)
    expect(todayEntry.cost).toBeCloseTo(0.02)
  })

  it('counts distinct sessions today', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 0, 0, 0, 0, 'session-a')
    db.prepare(INSERT_SQL)
      .run('r2', now, 'claude-code', 'claude-sonnet-4-6', 200, 100, 0, 0, 0, 0, 'session-a')
    db.prepare(INSERT_SQL)
      .run('r3', now, 'claude-code', 'claude-sonnet-4-6', 300, 150, 0, 0, 0, 0, 'session-b')

    const result = queryWidgetData(db)
    expect(result.sessionCountToday).toBe(2)
  })

  it('excludes null and empty session_id from session count', () => {
    const now = Date.now()
    db.prepare(INSERT_SQL)
      .run('r1', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 0, 0, 0, 0, null)
    db.prepare(INSERT_SQL)
      .run('r2', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 0, 0, 0, 0, '')
    db.prepare(INSERT_SQL)
      .run('r3', now, 'claude-code', 'claude-sonnet-4-6', 100, 50, 0, 0, 0, 0, 'real-session')

    const result = queryWidgetData(db)
    expect(result.sessionCountToday).toBe(1)
  })
})
