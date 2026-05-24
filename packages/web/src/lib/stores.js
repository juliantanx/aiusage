import { writable, get } from 'svelte/store'

export const dateRange = writable({ range: 'day' })

export const selectedDevice = writable('') // '' = all devices, value = deviceInstanceId

export function setDevice(deviceInstanceId) {
  selectedDevice.set(deviceInstanceId)
}

export const selectedTool = writable('') // '' = all tools, value = tool name

export function setTool(tool) {
  selectedTool.set(tool)
}

export const pollingInterval = writable(30000) // 30 seconds default

export const displayCurrency = writable('USD')
export const exchangeRate = writable(0.137)

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
  const curr = get(displayCurrency)
  if (curr === 'CNY') {
    const rate = get(exchangeRate)
    const cny = n / rate
    return cny < 0.01 ? `¥${cny.toFixed(4)}` : `¥${cny.toFixed(2)}`
  }
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

export function formatTokens(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
