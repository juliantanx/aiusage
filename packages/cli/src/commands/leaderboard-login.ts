import { createHash, randomBytes } from 'node:crypto'
import { startDeviceAuth, completeDeviceAuth } from '../leaderboard/api.js'
import { saveCredentials, hasCredentials } from '../leaderboard/credentials.js'
import { base64url, sha256Buffer } from '../leaderboard/crypto.js'
import { execSync } from 'node:child_process'
import * as readline from 'node:readline'
import { getSiteUrl } from '../site-url.js'

function getDeviceName(): string {
  try {
    if (process.platform === 'darwin') {
      return execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim()
    }
    if (process.platform === 'linux') {
      return execSync('hostname', { encoding: 'utf-8' }).trim()
    }
    if (process.platform === 'win32') {
      return execSync('hostname', { encoding: 'utf-8' }).trim()
    }
  } catch {
    // Fallback
  }
  return `${process.platform}-${process.arch}`
}

function getCliVersion(): string {
  try {
    // Try to read from package.json
    const { readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const pkgPath = join(__dirname, '../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function openBrowser(url: string): boolean {
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' })
      return true
    }
    if (process.platform === 'linux') {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' })
      return true
    }
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' })
      return true
    }
  } catch {
    // Browser open failed
  }
  return false
}

export async function runLeaderboardLogin(): Promise<void> {
  if (hasCredentials()) {
    console.log('Already logged in. Run `aiusage logout` first to re-authenticate.')
    return
  }

  const serverUrl = getSiteUrl()
  const deviceName = getDeviceName()
  const cliVersion = getCliVersion()

  // Generate PKCE verifier and challenge
  const deviceVerifier = base64url(randomBytes(32))
  const deviceChallenge = base64url(sha256Buffer(deviceVerifier))

  console.log('Starting device authorization...')
  console.log(`Server: ${serverUrl}`)
  console.log(`Device: ${deviceName}`)

  try {
    // Start device auth
    const startResponse = await startDeviceAuth(serverUrl, {
      device_name: deviceName,
      cli_version: cliVersion,
      device_challenge: deviceChallenge,
    })

    console.log('\n=== Device Authorization ===')
    console.log(`User Code: ${startResponse.user_code}`)
    console.log(`URL: ${startResponse.verification_url}`)
    console.log(`Expires: ${new Date(startResponse.expires_at).toLocaleString()}`)
    console.log('')

    // Try to open browser
    const opened = openBrowser(startResponse.verification_url)
    if (opened) {
      console.log('Opening browser for authorization...')
    } else {
      console.log('Please open the URL above in your browser and enter the user code.')
    }

    console.log('\nWaiting for authorization...')

    // Poll for completion
    const startTime = Date.now()
    const expiresAt = new Date(startResponse.expires_at).getTime()
    const interval = startResponse.interval * 1000

    while (Date.now() < expiresAt) {
      await new Promise(resolve => setTimeout(resolve, interval))

      try {
        const completeResponse = await completeDeviceAuth(serverUrl, {
          device_request_id: startResponse.device_request_id,
          device_verifier: deviceVerifier,
        })

        // Save credentials
        saveCredentials({
          device_id: completeResponse.device_id,
          device_secret: completeResponse.device_secret,
          obtained_at: new Date().toISOString(),
        })

        console.log('\n✓ Authorization successful!')
        console.log(`Device ID: ${completeResponse.device_id}`)
        console.log('Credentials saved. You can now run `aiusage upload`.')
        return
      } catch (error: any) {
        if (error.code === 'authorization_pending') {
          // Still waiting
          continue
        }
        if (error.code === 'authorization_expired') {
          console.error('\n✗ Authorization expired. Please try again.')
          return
        }
        if (error.code === 'authorization_declined') {
          console.error('\n✗ Authorization was declined.')
          return
        }
        console.error(`\n✗ Authorization failed: ${error instanceof Error ? error.message : error}`)
        return
      }
    }

    console.error('\n✗ Authorization timed out. Please try again.')
  } catch (error: any) {
    console.error(`\n✗ Failed to start authorization: ${error.message}`)
    process.exit(1)
  }
}
