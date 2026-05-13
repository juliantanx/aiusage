import { writable } from 'svelte/store'

export const dateRange = writable({ range: 'day' })

export const pollingInterval = writable(30000) // 30 seconds default

export function setRange(range) {
  dateRange.set({ range })
}

export function setCustomRange(from, to) {
  dateRange.set({ from, to })
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString()
}

export function formatNumber(n) {
  return n.toLocaleString()
}

export function formatCost(n) {
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
