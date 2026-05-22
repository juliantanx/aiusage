import type Database from 'better-sqlite3'

export interface TodayTokens {
  total: number
  input: number
  output: number
}

export interface MonthTokens {
  total: number
}

export interface TopModel {
  name: string
  share: number
}

export interface WidgetData {
  todayTokens: TodayTokens
  monthTokens: MonthTokens
  topModel: TopModel | null
  lastUpdated: number
}

export function queryWidgetData(db: Database.Database): WidgetData {
  const todayStart = getTodayStartMs()
  const monthStart = getMonthStartMs()
  const tomorrow = todayStart + 86_400_000
  const nextMonthStart = getNextMonthStartMs()

  const todayRow = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input,
      COALESCE(SUM(output_tokens), 0) AS output
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(todayStart, tomorrow) as { input: number; output: number }

  const monthRow = db.prepare(`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(monthStart, nextMonthStart) as { total: number }

  const modelRows = db.prepare(`
    SELECT
      model,
      SUM(input_tokens + output_tokens) AS tokens
    FROM records
    WHERE ts >= ? AND ts < ?
    GROUP BY model
    ORDER BY tokens DESC
  `).all(todayStart, tomorrow) as Array<{ model: string; tokens: number }>

  let topModel: TopModel | null = null
  if (modelRows.length > 0) {
    const totalTokens = modelRows.reduce((acc, r) => acc + r.tokens, 0)
    const top = modelRows[0]
    topModel = {
      name: top.model,
      share: totalTokens > 0 ? Math.round((top.tokens / totalTokens) * 100) : 0,
    }
  }

  return {
    todayTokens: {
      total: todayRow.input + todayRow.output,
      input: todayRow.input,
      output: todayRow.output,
    },
    monthTokens: {
      total: monthRow.total,
    },
    topModel,
    lastUpdated: Date.now(),
  }
}

function getTodayStartMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getMonthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getNextMonthStartMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + 1)
  return d.getTime()
}
