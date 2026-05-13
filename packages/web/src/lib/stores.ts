import { writable, derived } from 'svelte/store'
import type { DateRange } from './api.js'

export const dateRange = writable<DateRange>({ range: 'day' })

export const pollingInterval = writable<number>(30000) // 30 seconds default

export function setRange(range: 'day' | 'week' | 'month') {
  dateRange.set({ range })
}

export function setCustomRange(from: string, to: string) {
  dateRange.set({ from, to })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
