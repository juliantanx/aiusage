export interface PeriodInfo {
  period_type: string
  period_start: string
  period_end: string
}

export function getCurrentPeriods(now: Date = new Date()): PeriodInfo[] {
  return [
    getDailyPeriod(now),
    getWeeklyPeriod(now),
    getMonthlyPeriod(now),
    getYearlyPeriod(now),
    getAllTimePeriod(now),
  ]
}

function getDailyPeriod(now: Date): PeriodInfo {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start.getTime() + 86400000 - 1)
  return {
    period_type: 'daily',
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  }
}

function getWeeklyPeriod(now: Date): PeriodInfo {
  // ISO week: Monday = 1
  const day = now.getUTCDay()
  const diff = day === 0 ? 6 : day - 1 // Days since Monday
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  const end = new Date(start.getTime() + 7 * 86400000 - 1)
  return {
    period_type: 'weekly',
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  }
}

function getMonthlyPeriod(now: Date): PeriodInfo {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  return {
    period_type: 'monthly',
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  }
}

function getYearlyPeriod(now: Date): PeriodInfo {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999))
  return {
    period_type: 'yearly',
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  }
}

function getAllTimePeriod(now: Date): PeriodInfo {
  return {
    period_type: 'all_time',
    period_start: '1970-01-01T00:00:00.000Z',
    period_end: now.toISOString(),
  }
}
