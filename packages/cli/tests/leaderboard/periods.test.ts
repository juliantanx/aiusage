import { describe, it, expect } from 'vitest'
import { getCurrentPeriods } from '../../src/leaderboard/periods.js'

describe('getCurrentPeriods', () => {
  // Use a known date: 2026-06-04 (Thursday)
  const now = new Date('2026-06-04T15:30:00.000Z')
  const periods = getCurrentPeriods(now)

  it('returns 5 periods', () => {
    expect(periods).toHaveLength(5)
    expect(periods.map(p => p.period_type)).toEqual([
      'daily', 'weekly', 'monthly', 'yearly', 'all_time'
    ])
  })

  it('daily period covers the full UTC day', () => {
    const daily = periods.find(p => p.period_type === 'daily')!
    expect(daily.period_start).toBe('2026-06-04T00:00:00.000Z')
    expect(daily.period_end).toBe('2026-06-04T23:59:59.999Z')
  })

  it('weekly period starts on Monday', () => {
    const weekly = periods.find(p => p.period_type === 'weekly')!
    const start = new Date(weekly.period_start)
    expect(start.getUTCDay()).toBe(1) // Monday
    expect(weekly.period_start).toBe('2026-06-01T00:00:00.000Z')
    expect(weekly.period_end).toBe('2026-06-07T23:59:59.999Z')
  })

  it('monthly period covers the full month', () => {
    const monthly = periods.find(p => p.period_type === 'monthly')!
    expect(monthly.period_start).toBe('2026-06-01T00:00:00.000Z')
    expect(monthly.period_end).toBe('2026-06-30T23:59:59.999Z')
  })

  it('yearly period covers the full year', () => {
    const yearly = periods.find(p => p.period_type === 'yearly')!
    expect(yearly.period_start).toBe('2026-01-01T00:00:00.000Z')
    expect(yearly.period_end).toBe('2026-12-31T23:59:59.999Z')
  })

  it('all_time period starts from epoch', () => {
    const allTime = periods.find(p => p.period_type === 'all_time')!
    expect(allTime.period_start).toBe('1970-01-01T00:00:00.000Z')
  })

  it('handles Sunday correctly for weekly', () => {
    const sunday = new Date('2026-06-07T12:00:00.000Z') // Sunday
    const sundayPeriods = getCurrentPeriods(sunday)
    const weekly = sundayPeriods.find(p => p.period_type === 'weekly')!
    const start = new Date(weekly.period_start)
    expect(start.getUTCDay()).toBe(1) // Monday
    expect(weekly.period_start).toBe('2026-06-01T00:00:00.000Z')
  })

  it('handles Monday correctly for weekly', () => {
    const monday = new Date('2026-06-01T12:00:00.000Z') // Monday
    const mondayPeriods = getCurrentPeriods(monday)
    const weekly = mondayPeriods.find(p => p.period_type === 'weekly')!
    expect(weekly.period_start).toBe('2026-06-01T00:00:00.000Z')
  })
})
