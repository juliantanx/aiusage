import type Database from 'better-sqlite3'

export interface TodayTokens {
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  thinking: number
}

export interface RangeTokens {
  total: number
}

export interface TopModel {
  name: string
  share: number
}

export interface TopTool {
  name: string
  share: number
}

export interface DailyEntry {
  date: string // YYYY-MM-DD
  tokens: number
  cost: number
}

export interface HourlyEntry {
  dayOfWeek: number // 0=Sun … 6=Sat
  hour: number // 0–23
  tokens: number
}

export interface WidgetData {
  todayTokens: TodayTokens
  todayCost: number
  rangeTokens: RangeTokens
  rangeCost: number
  rangeDays: number
  topModel: TopModel | null
  topTool: TopTool | null
  dailyHistory: DailyEntry[]
  sessionCountToday: number
  lastUpdated: number
}

export function queryWidgetData(db: Database.Database, rangeDays: number = 30): WidgetData {
  const todayStart = getTodayStartMs()
  const tomorrow = todayStart + 86_400_000
  const rangeStart = todayStart - (rangeDays - 1) * 86_400_000

  const todayRow = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input,
      COALESCE(SUM(output_tokens), 0) AS output,
      COALESCE(SUM(cache_read_tokens), 0) AS cacheRead,
      COALESCE(SUM(cache_write_tokens), 0) AS cacheWrite,
      COALESCE(SUM(thinking_tokens), 0) AS thinking,
      COALESCE(SUM(cost), 0) AS cost
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(todayStart, tomorrow) as {
    input: number; output: number; cacheRead: number
    cacheWrite: number; thinking: number; cost: number
  }

  const rangeRow = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS total,
      COALESCE(SUM(cost), 0) AS cost
    FROM records
    WHERE ts >= ? AND ts < ?
  `).get(rangeStart, tomorrow) as { total: number; cost: number }

  const modelRows = db.prepare(`
    SELECT
      model,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens
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

  const toolRows = db.prepare(`
    SELECT
      tool,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens
    FROM records
    WHERE ts >= ? AND ts < ?
    GROUP BY tool
    ORDER BY tokens DESC
  `).all(todayStart, tomorrow) as Array<{ tool: string; tokens: number }>

  let topTool: TopTool | null = null
  if (toolRows.length > 0) {
    const totalTokens = toolRows.reduce((acc, r) => acc + r.tokens, 0)
    const top = toolRows[0]
    topTool = {
      name: top.tool,
      share: totalTokens > 0 ? Math.round((top.tokens / totalTokens) * 100) : 0,
    }
  }

  // Daily history for the configured range
  const dailyRows = db.prepare(`
    SELECT
      CAST((ts - ?) / 86400000 AS INTEGER) AS dayIndex,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
      SUM(cost) AS cost
    FROM records
    WHERE ts >= ? AND ts < ?
    GROUP BY dayIndex
    ORDER BY dayIndex
  `).all(rangeStart, rangeStart, tomorrow) as Array<{ dayIndex: number; tokens: number; cost: number }>

  const dailyHistory: DailyEntry[] = []
  const dailyMap = new Map(dailyRows.map(r => [r.dayIndex, r]))
  for (let i = 0; i < rangeDays; i++) {
    const dayMs = rangeStart + i * 86_400_000
    const d = new Date(dayMs)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const row = dailyMap.get(i)
    dailyHistory.push({
      date,
      tokens: row?.tokens ?? 0,
      cost: row?.cost ?? 0,
    })
  }

  // Session count today
  const sessionRow = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS cnt
    FROM records
    WHERE ts >= ? AND ts < ? AND session_id IS NOT NULL AND session_id != ''
  `).get(todayStart, tomorrow) as { cnt: number }

  return {
    todayTokens: {
      total: todayRow.input + todayRow.output + todayRow.cacheRead + todayRow.cacheWrite + todayRow.thinking,
      input: todayRow.input,
      output: todayRow.output,
      cacheRead: todayRow.cacheRead,
      cacheWrite: todayRow.cacheWrite,
      thinking: todayRow.thinking,
    },
    todayCost: todayRow.cost,
    rangeTokens: {
      total: rangeRow.total,
    },
    rangeCost: rangeRow.cost,
    rangeDays,
    topModel,
    topTool,
    dailyHistory,
    sessionCountToday: sessionRow.cnt,
    lastUpdated: Date.now(),
  }
}

function getTodayStartMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}
