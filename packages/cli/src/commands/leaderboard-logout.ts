import { clearCredentials, hasCredentials } from '../leaderboard/credentials.js'

export async function runLeaderboardLogout(): Promise<void> {
  if (!hasCredentials()) {
    console.log('Not logged in to the public leaderboard.')
    return
  }

  clearCredentials()
  console.log('✓ Logged out from the public leaderboard. Local credentials cleared.')
  console.log('Note: Your device authorization is still valid on the server.')
  console.log('To fully revoke the device, visit the settings page on the website.')
}
