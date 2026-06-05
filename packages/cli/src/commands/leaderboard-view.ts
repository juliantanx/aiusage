import { fetchLeaderboard, LeaderboardApiError, LeaderboardEntry } from '../leaderboard/api.js'
import { getSiteUrl } from '../site-url.js'

const PERIODS = new Set(['daily', 'weekly', 'monthly', 'yearly', 'all_time'])
const METRICS = new Set(['tokens', 'cost'])
const SCOPES = new Set(['all', 'tool', 'model', 'tool_model'])

function formatTokens(value: string): string {
  return Number(value).toLocaleString()
}

function formatCost(value: string): string {
  const num = Number(value)
  return Number.isFinite(num) ? `$${num.toFixed(4)}` : '$0.0000'
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toISOString().replace('T', ' ').slice(0, 16)
}

function scopeLabel(entry: LeaderboardEntry): string {
  if (entry.scope_type === 'tool') return entry.tool ?? '-'
  if (entry.scope_type === 'model') return entry.model ?? '-'
  if (entry.scope_type === 'tool_model') return `${entry.tool ?? '-'}/${entry.model ?? '-'}`
  return 'all'
}

function printRows(entries: LeaderboardEntry[], metric: string, scope: string): void {
  const rankWidth = Math.max(4, ...entries.map(e => String(e.rank).length))
  const nameWidth = Math.min(28, Math.max(4, ...entries.map(e => e.display_name.length)))
  const valueWidth = Math.max(12, ...entries.map(e => metric === 'cost' ? formatCost(e.total_cost_usd).length : formatTokens(e.total_tokens).length))
  const scopeWidth = scope === 'all' ? 0 : Math.min(32, Math.max(5, ...entries.map(e => scopeLabel(e).length)))

  console.log(
    `${'#'.padStart(rankWidth)}  ${'User'.padEnd(nameWidth)}  ${scope === 'all' ? '' : `${'Scope'.padEnd(scopeWidth)}  `}${(metric === 'cost' ? 'Cost' : 'Tokens').padStart(valueWidth)}  Updated`
  )
  console.log(`${'-'.repeat(rankWidth)}  ${'-'.repeat(nameWidth)}  ${scope === 'all' ? '' : `${'-'.repeat(scopeWidth)}  `}${'-'.repeat(valueWidth)}  ${'-'.repeat(16)}`)

  for (const entry of entries) {
    const name = entry.display_name.length > nameWidth
      ? `${entry.display_name.slice(0, Math.max(0, nameWidth - 3))}...`
      : entry.display_name
    const label = scopeLabel(entry)
    const clippedScope = label.length > scopeWidth ? `${label.slice(0, Math.max(0, scopeWidth - 3))}...` : label
    const value = metric === 'cost' ? formatCost(entry.total_cost_usd) : formatTokens(entry.total_tokens)
    console.log(
      `${String(entry.rank).padStart(rankWidth)}  ${name.padEnd(nameWidth)}  ${scope === 'all' ? '' : `${clippedScope.padEnd(scopeWidth)}  `}${value.padStart(valueWidth)}  ${formatUpdatedAt(entry.updated_at)}`
    )
  }
}

export async function runLeaderboardView(options: { period?: string; metric?: string; scope?: string; tool?: string; model?: string; limit?: string | number } = {}): Promise<void> {
  const period = options.period || 'daily'
  const metric = options.metric || 'tokens'
  const scope = options.scope || 'all'
  if (!PERIODS.has(period)) {
    console.error('Invalid period. Use daily, weekly, monthly, yearly, or all_time.')
    process.exit(1)
  }
  if (!METRICS.has(metric)) {
    console.error('Invalid metric. Use tokens or cost.')
    process.exit(1)
  }
  if (!SCOPES.has(scope)) {
    console.error('Invalid scope. Use all, tool, model, or tool_model.')
    process.exit(1)
  }

  const limit = Math.max(1, Math.min(50, Number(options.limit || 20) || 20))
  const serverUrl = getSiteUrl()

  try {
    const data = await fetchLeaderboard(serverUrl, { period_type: period, metric, scope, tool: options.tool, model: options.model })
    const entries = data.entries.slice(0, limit)

    console.log(`AIUsage Leaderboard (${period}, ${metric}, ${scope})`)
    console.log(`Server: ${serverUrl}`)
    console.log('')

    if (entries.length === 0) {
      console.log('No public entries yet.')
      console.log('Upload requires login: aiusage login && aiusage upload')
      return
    }

    printRows(entries, metric, scope)
    console.log('')
    console.log('Viewing is public. Uploading requires: aiusage login && aiusage upload')
  } catch (error: unknown) {
    const message = error instanceof LeaderboardApiError ? error.message
      : error instanceof Error ? error.message
      : String(error)
    console.error(`Failed to fetch leaderboard: ${message}`)
    process.exit(1)
  }
}
