import { fetchLeaderboard, LeaderboardApiError, LeaderboardEntry } from '../leaderboard/api.js'
import { getSiteUrl } from '../site-url.js'

const PERIODS = new Set(['daily', 'weekly', 'monthly', 'yearly', 'all_time'])

function formatTokens(value: string): string {
  return Number(value).toLocaleString()
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toISOString().replace('T', ' ').slice(0, 16)
}

function printRows(entries: LeaderboardEntry[]): void {
  const rankWidth = Math.max(4, ...entries.map(e => String(e.rank).length))
  const nameWidth = Math.min(28, Math.max(4, ...entries.map(e => e.display_name.length)))
  const tokenWidth = Math.max(12, ...entries.map(e => formatTokens(e.total_tokens).length))

  console.log(
    `${'#'.padStart(rankWidth)}  ${'User'.padEnd(nameWidth)}  ${'Tokens'.padStart(tokenWidth)}  Updated`
  )
  console.log(`${'-'.repeat(rankWidth)}  ${'-'.repeat(nameWidth)}  ${'-'.repeat(tokenWidth)}  ${'-'.repeat(16)}`)

  for (const entry of entries) {
    const name = entry.display_name.length > nameWidth
      ? `${entry.display_name.slice(0, Math.max(0, nameWidth - 3))}...`
      : entry.display_name
    console.log(
      `${String(entry.rank).padStart(rankWidth)}  ${name.padEnd(nameWidth)}  ${formatTokens(entry.total_tokens).padStart(tokenWidth)}  ${formatUpdatedAt(entry.updated_at)}`
    )
  }
}

export async function runLeaderboardView(options: { period?: string; limit?: string | number } = {}): Promise<void> {
  const period = options.period || 'daily'
  if (!PERIODS.has(period)) {
    console.error('Invalid period. Use daily, weekly, monthly, yearly, or all_time.')
    process.exit(1)
  }

  const limit = Math.max(1, Math.min(50, Number(options.limit || 20) || 20))
  const serverUrl = getSiteUrl()

  try {
    const data = await fetchLeaderboard(serverUrl, { period_type: period })
    const entries = data.entries.slice(0, limit)

    console.log(`AIUsage Leaderboard (${period})`)
    console.log(`Server: ${serverUrl}`)
    console.log('')

    if (entries.length === 0) {
      console.log('No public entries yet.')
      console.log('Upload requires login: aiusage login && aiusage upload')
      return
    }

    printRows(entries)
    console.log('')
    console.log('Viewing is public. Uploading requires: aiusage login && aiusage upload')
  } catch (error) {
    if (error instanceof LeaderboardApiError) {
      console.error(`Failed to fetch leaderboard: ${error.message}`)
    } else {
      console.error(`Failed to fetch leaderboard: ${error}`)
    }
    process.exit(1)
  }
}
