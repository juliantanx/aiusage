import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog, screen, nativeTheme } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { queryWidgetData } from './data'
import { loadSettings, saveSettings } from './settings'
import type { WidgetSettings } from './settings'
import {
  getTrayIconNativeImage,
  getWidgetNativeBindingPath,
  getWindowPosition,
  shouldHideWindowOnBlur,
  shouldHideWindowOnClose,
  shouldShowWindowOnLaunch,
} from './ui'

const nodeRequire = createRequire(__filename)
const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3')

const DB_PATH = join(homedir(), '.aiusage', 'cache.db')
const PORT_FILE = join(homedir(), '.aiusage', '.serve-port')
const DASHBOARD_PORT = 3847

let tray: Tray | null = null
let win: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let settings: WidgetSettings = loadSettings()

app.setName('aiusage Widget')

// Prevent dock icon on macOS
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide()
}

app.whenReady().then(() => {
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, {
      readonly: true,
      nativeBinding: getWidgetNativeBindingPath(__dirname),
    })
  }

  applyTheme(settings.theme)
  createTray()
  createWindow()
  startAutoRefresh()

  if (shouldShowWindowOnLaunch(app.isPackaged)) {
    showWindow()
  }
})

app.on('window-all-closed', () => {
  // Keep the app running in the tray — do not quit
})

app.on('before-quit', () => {
  db?.close()
})

function applyTheme(theme: WidgetSettings['theme']): void {
  nativeTheme.themeSource = theme
}

function createTray(): void {
  const { buffer, scaleFactor } = getTrayIconNativeImage()
  const icon = nativeImage.createFromBuffer(buffer, scaleFactor ? { scaleFactor } : undefined)
  tray = new Tray(icon)
  tray.setToolTip('aiusage Widget')

  tray.on('click', () => toggleWindow())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show Panel', click: () => showWindow() },
      { label: 'Open Dashboard', click: () => openDashboardAction() },
      { label: 'Refresh', click: () => pushDataUpdate() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.exit(0) } },
    ])
    tray!.popUpContextMenu(menu)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 380,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const rendererPath = join(__dirname, 'renderer', 'index.html')
  win.loadFile(rendererPath)

  if (shouldHideWindowOnBlur(app.isPackaged)) {
    win.on('blur', () => win?.hide())
  }
}

function showWindow(): void {
  if (!win) return

  // Position near tray icon
  const trayBounds = tray!.getBounds()
  const winBounds = win.getBounds()
  const displayBounds = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }).workArea
  const { x, y } = getWindowPosition({
    platform: process.platform,
    trayBounds,
    windowBounds: winBounds,
    displayBounds,
  })

  win.setPosition(x, y, false)
  win.show()
  win.focus()
  pushDataUpdate()
}

function toggleWindow(): void {
  if (win?.isVisible()) {
    win.hide()
  } else {
    showWindow()
  }
}

function pushDataUpdate(): void {
  if (!win || !db) return
  try {
    const data = queryWidgetData(db, settings.rangeDays)
    win.webContents.send('widget:data-update', data)
  } catch {
    // DB may not be initialized yet; silently skip
  }
}

function startAutoRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => pushDataUpdate(), settings.refreshIntervalSec * 1000)
}

async function openDashboardAction(): Promise<void> {
  const port = getDashboardPort()
  const reachable = await isDashboardReachable(port)
  if (!reachable) {
    const result = await launchDashboard()
    if (!result.success) {
      // CLI not found; attempt auto-install
      notifyRenderer('install:status', { phase: 'installing' })
      const installResult = await installAiusageCli()
      if (!installResult.success) {
        notifyRenderer('install:status', { phase: 'failed', error: installResult.error })
        dialog.showErrorBox(
          'Installation Failed',
          `Could not install @juliantanx/aiusage automatically.\n\n${installResult.error ?? 'Unknown error'}\n\nTry manually:\n  npm install -g @juliantanx/aiusage`
        )
        return
      }
      notifyRenderer('install:status', { phase: 'launching' })
      const retryResult = await launchDashboard()
      if (!retryResult.success) {
        notifyRenderer('install:status', { phase: 'failed', error: retryResult.error })
        dialog.showErrorBox(
          'Launch Failed',
          'aiusage was installed but the dashboard failed to start.\n\nTry running:\n  aiusage serve'
        )
        return
      }
      notifyRenderer('install:status', { phase: 'done' })
    }
  }
  shell.openExternal(`http://localhost:${getDashboardPort()}`)
}

function notifyRenderer(channel: string, payload: Record<string, unknown>): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

async function installAiusageCli(): Promise<{ success: boolean; error?: string }> {
  const { execFile } = nodeRequire('child_process') as typeof import('child_process')

  // Try npm first, fall back to pnpm, then yarn
  const managers = ['npm', 'pnpm', 'yarn']

  for (const pm of managers) {
    const args = pm === 'yarn'
      ? ['global', 'add', '@juliantanx/aiusage']
      : ['install', '-g', '@juliantanx/aiusage']

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      execFile(pm, args, { timeout: 120_000, shell: true }, (err, _stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr || err.message })
        } else {
          resolve({ success: true })
        }
      })
    })

    if (result.success) return result
    // If this package manager isn't installed, try the next one
  }

  return { success: false, error: 'No package manager (npm/pnpm/yarn) could install @juliantanx/aiusage.' }
}

// IPC handlers
ipcMain.handle('widget:get-data', () => {
  if (!db) return null
  return queryWidgetData(db)
})

ipcMain.handle('widget:open-dashboard', async () => {
  await openDashboardAction()
})

ipcMain.handle('widget:get-settings', () => {
  return settings
})

ipcMain.handle('widget:save-settings', (_event, newSettings: WidgetSettings) => {
  settings = newSettings
  saveSettings(settings)
  applyTheme(settings.theme)
  startAutoRefresh()
  return settings
})

ipcMain.on('widget:hide-window', () => {
  win?.hide()
})

function getDashboardPort(): number {
  try {
    if (existsSync(PORT_FILE)) {
      const port = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10)
      if (!isNaN(port) && port > 0) return port
    }
  } catch {}
  return DASHBOARD_PORT
}

async function isDashboardReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const http = nodeRequire('http') as typeof import('http')
    const req = http.get(`http://localhost:${port}`, (res) => {
      res.destroy()
      resolve(res.statusCode !== undefined && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(200, () => { req.destroy(); resolve(false) })
  })
}

async function launchDashboard(): Promise<{ success: boolean; error?: string }> {
  const { spawn } = nodeRequire('child_process') as typeof import('child_process')

  return new Promise((resolve) => {
    const child = spawn('aiusage', ['serve'], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    })

    let failed = false

    child.on('error', () => { failed = true })

    child.on('close', (code) => {
      if (code !== 0) failed = true
    })

    child.unref()

    let attempts = 0
    const check = async () => {
      if (failed) {
        resolve({ success: false, error: 'aiusage command not found' })
        return
      }
      if (await isDashboardReachable(getDashboardPort())) {
        resolve({ success: true })
        return
      }
      attempts++
      if (attempts >= 25) {
        resolve({ success: false, error: 'Server failed to start within 5 seconds' })
        return
      }
      setTimeout(check, 200)
    }
    check()
  })
}
