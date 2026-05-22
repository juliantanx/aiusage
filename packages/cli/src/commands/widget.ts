import { existsSync, readFileSync } from 'node:fs'
import { spawn, execSync } from 'node:child_process'
import { join } from 'node:path'
import { AIUSAGE_DIR } from '../config.js'

const WIDGET_PID_PATH = join(AIUSAGE_DIR, 'widget.pid')

export async function launchWidget(): Promise<void> {
  if (isWidgetRunning()) {
    console.log('aiusage widget is already running in the system tray.')
    return
  }

  const electronBin = resolveElectronBin()
  if (!electronBin) {
    console.error(
      'Widget not installed. Run: npm install -g @juliantanx/aiusage-widget'
    )
    process.exit(1)
  }

  const child = spawn(electronBin, [], {
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  child.unref()

  console.log('aiusage widget started.')
}

function isWidgetRunning(): boolean {
  if (!existsSync(WIDGET_PID_PATH)) return false

  let pid: number
  try {
    pid = parseInt(readFileSync(WIDGET_PID_PATH, 'utf-8').trim(), 10)
  } catch {
    return false
  }

  if (isNaN(pid)) return false

  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err.code !== 'ESRCH'
  }
}

function resolveElectronBin(): string | null {
  try {
    const result = execSync(
      process.platform === 'win32' ? 'where aiusage-widget' : 'which aiusage-widget',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return result || null
  } catch {
    return null
  }
}
