import { createInterface, type Interface } from 'node:readline'
import { spawn, spawnSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AIUSAGE_DIR } from '../config.js'

const DEFAULT_PORT = 3847
const PORT_FILE = join(AIUSAGE_DIR, '.serve-port')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearScreen(): void {
  process.stdout.write('\x1Bc')
}

function getPort(): number {
  if (existsSync(PORT_FILE)) {
    const raw = readFileSync(PORT_FILE, 'utf-8').trim()
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n > 0) return n
  }
  return DEFAULT_PORT
}

function getPidOnPort(port: number): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `netstat -ano | findstr LISTENING | findstr :${port}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      )
      const parts = out.trim().split(/\s+/)
      const pid = parts[parts.length - 1] ?? null
      return pid && /^\d+$/.test(pid) ? pid : null
    } else {
      const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const pid = out.trim().split('\n')[0] ?? null
      return pid && /^\d+$/.test(pid) ? pid : null
    }
  } catch {
    return null
  }
}

function isDashboardRunning(): { running: boolean; port: number } {
  const port = getPort()
  const pid = getPidOnPort(port)
  return { running: pid !== null, port }
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' })
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch {
    // ignore
  }
}

function runCommand(args: string[]): void {
  try {
    spawnSync('aiusage', args, { stdio: 'inherit' })
  } catch {
    // command handles its own output
  }
}

function prompt(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

function dashboardStatusLine(): string {
  const { running, port } = isDashboardRunning()
  return running
    ? `  Dashboard: RUNNING  http://localhost:${port}`
    : '  Dashboard: STOPPED'
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

function stopDashboard(port: number): boolean {
  const pid = getPidOnPort(port)
  if (!pid || !/^\d+$/.test(pid)) return false
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(parseInt(pid, 10), 'SIGTERM')
    }
    return true
  } catch {
    return false
  }
}

async function startDashboard(port: number): Promise<boolean> {
  const child = spawn('aiusage', ['serve'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  // wait up to 15s for port to become available
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    if (getPidOnPort(port)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Submenus
// ---------------------------------------------------------------------------

async function dashboardSubmenu(rl: Interface): Promise<void> {
  while (true) {
    clearScreen()
    const { running, port } = isDashboardRunning()
    const status = running ? `RUNNING  http://localhost:${port}` : 'STOPPED'
    console.log(`
========================================
  Dashboard  (${status})
========================================

  [1] Start
  [2] Stop
  [3] Restart
  [4] Open in Browser
  [0] Back
`)
    const choice = await prompt(rl, '  Select [0-4]: ')
    switch (choice) {
      case '1': {
        if (running) {
          console.log('\n  Dashboard is already running.')
        } else {
          console.log('\n  Starting dashboard...')
          const started = await startDashboard(port)
          if (started) {
            console.log(`  Dashboard started on http://localhost:${port}`)
            openBrowser(`http://localhost:${port}`)
          } else {
            console.log('  Dashboard may not have started — check logs.')
          }
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '2': {
        if (!running) {
          console.log('\n  Dashboard is not running.')
        } else {
          const stopped = stopDashboard(port)
          if (stopped) {
            console.log('\n  Dashboard stopped.')
          } else {
            console.log('\n  Failed to stop dashboard.')
          }
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '3': {
        stopDashboard(port)
        await new Promise((r) => setTimeout(r, 1000))
        console.log('\n  Starting dashboard...')
        const started = await startDashboard(port)
        if (started) {
          console.log(`  Dashboard restarted on http://localhost:${port}`)
          openBrowser(`http://localhost:${port}`)
        } else {
          console.log('  Dashboard may not have restarted — check logs.')
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '4': {
        if (running) {
          openBrowser(`http://localhost:${port}`)
          console.log('\n  Opened browser.')
        } else {
          console.log('\n  Dashboard is not running. Start it first.')
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '0':
        return
      default:
        break
    }
  }
}

async function dataSubmenu(rl: Interface): Promise<void> {
  while (true) {
    clearScreen()
    console.log(`
========================================
  Data
========================================

  [1] Parse
  [2] Summary
  [3] Export
  [4] Clean
  [5] Reset
  [6] Recalc
  [0] Back
`)
    const choice = await prompt(rl, '  Select [0-6]: ')
    switch (choice) {
      case '1': {
        const progress = await prompt(rl, '  Show progress? [Y/N]: ')
        const args = ['parse']
        if (progress.toLowerCase() === 'y') args.push('--progress')
        console.log('')
        runCommand(args)
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '2': {
        console.log('  1=All time  2=This week  3=This month')
        const period = await prompt(rl, '  Select [1-3]: ')
        const args = ['summary']
        if (period === '2') args.push('--week')
        else if (period === '3') args.push('--month')
        console.log('')
        runCommand(args)
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '3': {
        console.log('  Format: 1=CSV  2=JSON  3=NDJSON')
        const fmtChoice = await prompt(rl, '  Select [1-3]: ')
        const fmtMap: Record<string, string> = { '1': 'csv', '2': 'json', '3': 'ndjson' }
        const fmt = fmtMap[fmtChoice] ?? 'csv'
        const output = await prompt(rl, '  Output file (leave blank for stdout): ')
        const args = ['export', '--format', fmt]
        if (output) args.push('-o', output)
        console.log('')
        runCommand(args)
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '4': {
        const dur = await prompt(rl, '  Duration to keep (default 180d): ')
        const before = dur || '180d'
        console.log('')
        runCommand(['clean', '--before', before, '--yes'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '5': {
        const confirm = await prompt(
          rl,
          '  WARNING: This will delete ALL parsed data. Type "yes" to confirm: ',
        )
        if (confirm.toLowerCase() === 'yes') {
          console.log('')
          runCommand(['reset', '--yes'])
        } else {
          console.log('\n  Cancelled.')
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '6': {
        console.log('')
        runCommand(['recalc'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '0':
        return
      default:
        break
    }
  }
}

async function syncSubmenu(rl: Interface): Promise<void> {
  while (true) {
    clearScreen()
    console.log(`
========================================
  Sync
========================================

  [1] Init (configure cloud sync)
  [2] Sync
  [0] Back
`)
    const choice = await prompt(rl, '  Select [0-2]: ')
    switch (choice) {
      case '1': {
        console.log('')
        runCommand(['init'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '2': {
        console.log('')
        runCommand(['sync'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '0':
        return
      default:
        break
    }
  }
}

async function leaderboardSubmenu(rl: Interface): Promise<void> {
  while (true) {
    clearScreen()
    console.log(`
========================================
  Leaderboard
========================================

  [1] View
  [2] Login
  [3] Upload
  [4] Upload Status
  [5] Logout
  [0] Back
`)
    const choice = await prompt(rl, '  Select [0-5]: ')
    switch (choice) {
      case '1': {
        console.log('  Period: 1=Daily  2=Weekly  3=Monthly  4=Yearly  5=All Time')
        const pChoice = await prompt(rl, '  Select [1-5]: ')
        const periodMap: Record<string, string> = {
          '1': 'daily',
          '2': 'weekly',
          '3': 'monthly',
          '4': 'yearly',
          '5': 'all_time',
        }
        const period = periodMap[pChoice] ?? 'daily'
        console.log('')
        runCommand(['leaderboard', '-p', period])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '2': {
        console.log('')
        runCommand(['login'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '3': {
        console.log('')
        runCommand(['upload'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '4': {
        console.log('')
        runCommand(['upload-status'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '5': {
        console.log('')
        runCommand(['logout'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '0':
        return
      default:
        break
    }
  }
}

async function systemSubmenu(rl: Interface): Promise<void> {
  while (true) {
    clearScreen()
    console.log(`
========================================
  System
========================================

  [1] Status
  [2] Widget
  [3] PM2 Setup
  [4] PM2 Start
  [5] Check Update
  [0] Back
`)
    const choice = await prompt(rl, '  Select [0-5]: ')
    switch (choice) {
      case '1': {
        console.log('')
        runCommand(['status'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '2': {
        console.log('')
        runCommand(['widget'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '3': {
        console.log('')
        runCommand(['pm2-setup'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '4': {
        console.log('')
        runCommand(['pm2-start'])
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '5': {
        console.log('')
        try {
          const localVersion = execSync('aiusage --version', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim()
          let remoteVersion = 'unknown'
          try {
            const npmInfo = execSync('npm view aiusage version', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            }).trim()
            remoteVersion = npmInfo
          } catch {
            // registry unavailable
          }
          console.log(`  Local version:  ${localVersion}`)
          console.log(`  Latest version: ${remoteVersion}`)
          if (remoteVersion !== 'unknown' && localVersion !== remoteVersion) {
            const doUpdate = await prompt(
              rl,
              '  Update available. Install now? [Y/N]: ',
            )
            if (doUpdate.toLowerCase() === 'y') {
              console.log('  Updating...')
              try {
                execSync('npm install -g aiusage@latest', { stdio: 'inherit' })
                console.log('  Update complete.')
              } catch {
                console.log('  Update failed. Try manually: npm install -g aiusage@latest')
              }
            }
          } else if (remoteVersion === localVersion) {
            console.log('  Already up to date.')
          }
        } catch {
          console.log('  Could not determine version information.')
        }
        await prompt(rl, '\n  Press Enter to continue...')
        break
      }
      case '0':
        return
      default:
        break
    }
  }
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export async function runMenu(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    while (true) {
      clearScreen()
      console.log(`
========================================
  AI Usage Manager (aiusage)
========================================

${dashboardStatusLine()}

  [1] Dashboard      (serve/stop/restart/open)
  [2] Data           (parse/summary/export/clean/reset/recalc)
  [3] Sync           (init/sync)
  [4] Leaderboard    (view/login/upload/status/logout)
  [5] System         (status/widget/pm2/update)
  [6] Exit

`)
      const choice = await prompt(rl, '  Select [1-6]: ')
      switch (choice) {
        case '1':
          await dashboardSubmenu(rl)
          break
        case '2':
          await dataSubmenu(rl)
          break
        case '3':
          await syncSubmenu(rl)
          break
        case '4':
          await leaderboardSubmenu(rl)
          break
        case '5':
          await systemSubmenu(rl)
          break
        case '6':
          return
        default:
          break
      }
    }
  } finally {
    rl.close()
  }
}
