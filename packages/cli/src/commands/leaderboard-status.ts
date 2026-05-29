import { fetchLeaderboardStatus, LeaderboardApiError } from '../leaderboard/api.js'
import { hasCredentials, loadCredentials } from '../leaderboard/credentials.js'

function getServerUrl(): string {
  return process.env.AIUSAGE_LEADERBOARD_URL || 'https://aiusage.jtanx.com'
}

export async function runLeaderboardStatus(): Promise<void> {
  if (!hasCredentials()) {
    console.error('Not logged in. Run `aiusage leaderboard login` first.')
    process.exit(1)
  }

  const serverUrl = getServerUrl()
  const creds = loadCredentials()

  console.log('=== Leaderboard Status ===')
  console.log(`Device ID: ${creds?.device_id}`)
  console.log(`Server: ${serverUrl}`)
  console.log('')

  try {
    const status = await fetchLeaderboardStatus(serverUrl)

    if (status.snapshots.length === 0) {
      console.log('No uploads yet. Run `aiusage leaderboard upload` to submit your data.')
      return
    }

    console.log('Recent uploads:')
    console.log('─'.repeat(80))

    for (const snap of status.snapshots) {
      const date = new Date(snap.created_at).toLocaleString()
      const tokens = Number(snap.total_tokens).toLocaleString()
      const icon = snap.status === 'accepted' ? '✓' :
                  snap.status === 'flagged' ? '⚠' : '✗'

      console.log(`${icon} ${snap.period_type.padEnd(10)} ${tokens.padStart(15)} tokens  ${snap.status.padEnd(10)} ${date}`)
      if (snap.reason_message) {
        console.log(`  └─ ${snap.reason_message}`)
      }
    }

    // Show summary
    const accepted = status.snapshots.filter(s => s.status === 'accepted').length
    const flagged = status.snapshots.filter(s => s.status === 'flagged').length
    const rejected = status.snapshots.filter(s => s.status === 'rejected').length

    console.log('─'.repeat(80))
    console.log(`Total: ${status.snapshots.length} uploads (${accepted} accepted, ${flagged} flagged, ${rejected} rejected)`)

  } catch (error) {
    if (error instanceof LeaderboardApiError) {
      console.error(`\n✗ Failed to fetch status: ${error.message}`)

      if (error.code === 'device_not_found' || error.code === 'device_revoked') {
        console.error('Please run `aiusage leaderboard login` to re-authenticate.')
      }
    } else {
      console.error(`\n✗ Failed to fetch status: ${error}`)
    }
    process.exit(1)
  }
}
