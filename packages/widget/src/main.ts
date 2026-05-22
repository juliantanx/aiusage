import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { queryWidgetData } from './data'
import {
  getTrayIconDataUrl,
  shouldHideWindowOnBlur,
  shouldHideWindowOnClose,
  shouldShowWindowOnLaunch,
} from './ui'

const nodeRequire = createRequire(__filename)
const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3')

const DB_PATH = join(homedir(), '.aiusage', 'cache.db')
const DASHBOARD_PORT = 3847
const REFRESH_INTERVAL_MS = 60_000

let tray: Tray | null = null
let win: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null

app.setName('aiusage Widget')

// Prevent dock icon on macOS
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide()
}

app.whenReady().then(() => {
  if (existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true })
  }

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

function createTray(): void {
  const icon = nativeImage.createFromDataURL(getTrayIconDataUrl())
  tray = new Tray(icon)
  tray.setToolTip('aiusage Widget')

  // On macOS, SVG icons silently fail — use a text label as the visible entry
  if (process.platform === 'darwin') {
    tray.setTitle('⚡')
  }

  tray.on('click', () => toggleWindow())
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show Panel', click: () => showWindow() },
      { label: 'Refresh', click: () => pushDataUpdate() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.exit(0) } },
    ])
    tray!.popUpContextMenu(menu)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 320,
    height: 300,
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
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  const y = process.platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - winBounds.height - 4

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
    const data = queryWidgetData(db)
    win.webContents.send('widget:data-update', data)
  } catch {
    // DB may not be initialized yet; silently skip
  }
}

function startAutoRefresh(): void {
  setInterval(() => pushDataUpdate(), REFRESH_INTERVAL_MS)
}

// IPC handlers
ipcMain.handle('widget:get-data', () => {
  if (!db) return null
  return queryWidgetData(db)
})

ipcMain.handle('widget:open-dashboard', async () => {
  const reachable = await isDashboardReachable()
  if (!reachable) {
    await launchDashboard()
  }
  shell.openExternal(`http://localhost:${DASHBOARD_PORT}`)
})

ipcMain.on('widget:hide-window', () => {
  win?.hide()
})

async function isDashboardReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const http = nodeRequire('http') as typeof import('http')
    const req = http.get(`http://localhost:${DASHBOARD_PORT}`, (res) => {
      res.destroy()
      resolve(res.statusCode !== undefined && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

async function launchDashboard(): Promise<void> {
  const { spawn } = nodeRequire('child_process') as typeof import('child_process')
  const child = spawn('aiusage', ['serve'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  })
  child.unref()

  // Wait up to 5 seconds for the server to be ready
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    if (await isDashboardReachable()) return
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
