import { join } from 'node:path'

// macOS: 32x32 PNG rendered at @2x — displayed as 16x16 logical on Retina via scaleFactor:2
const TRAY_ICON_PNG_MAC_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAsklEQVR4nO2XQQ7EIAhFuQBX8HQe' +
  'hu7Z9U6z8TZu2jSxjekwYxpUuoCEjRr+EzEBgMqQKSDTgkwJmTIybZ08l5hH7ACSIVPsLPoPJkri' +
  'o4XvHuu0z7i5lIkA5V1mi5++QCkOK4AERum/ngFGBF7TZ7vbsSadHQLwyxzAAboBtKp8OEBLwAEc' +
  'QA2grXI1gFbAARzgKcBXSzYRIItNaesbavcrT69oy20HE/PR7BXDqeV4vgPnux87hsqGswAAAABJ' +
  'RU5ErkJggg=='

// Windows: 16x16 PNG
const TRAY_ICON_PNG_WIN_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVR4nGNgYGBg4J3Skco7peMa' +
  '75SO/0RikNpUBiTNxGpEx6kMJNqM4RIGYhVbr5j/v+3UETAGsWHiRBsA0ggDIDbtDUB3MskGoGug' +
  'vQGEnEzQAEIaBrcB17CFASE+clKmLDNRmp0B5XqLc//RXPMAAAAASUVORK5CYII='

// Linux: 22x22 PNG
const TRAY_ICON_PNG_LINUX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAt0lEQVR4nGNggALeKR3ZvFM6zvJO' +
  '6fjDO6XjP4n4D1RvNgMy4J3SsYAMw3DhBcgupZahMJzNAPUCtQ0+y0BmmIKx1Yp5cIwe5gzkGtp+' +
  '6sh/ZADiI8uTbfDUC6dRDAbxB5fBMrP7wZiqBt//+B5uAIhNFYNBrkQHILFhbnDuvu3/P/z4AccQ' +
  'PlUMxqZ4ZBn8hwYG/0EpNk2WzgYrgGEQHyRefXQfXAzExqcWis/SrqCnWdVEq8oUAE+RyDWaecD7' +
  'AAAAAElFTkSuQmCC'

export function shouldShowWindowOnLaunch(isPackaged: boolean): boolean {
  return !isPackaged
}

export function shouldHideWindowOnBlur(isPackaged: boolean): boolean {
  return isPackaged
}

export function shouldHideWindowOnClose(_: boolean): boolean {
  return true
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export function getWindowPosition({
  platform,
  trayBounds,
  windowBounds,
  displayBounds,
}: {
  platform: NodeJS.Platform
  trayBounds: Bounds
  windowBounds: Bounds
  displayBounds: Bounds
}): { x: number; y: number } {
  const preferredX = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const preferredY = platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - windowBounds.height - 4

  const maxX = Math.max(displayBounds.x, displayBounds.x + displayBounds.width - windowBounds.width)
  const maxY = Math.max(displayBounds.y, displayBounds.y + displayBounds.height - windowBounds.height)

  return {
    x: Math.min(Math.max(preferredX, displayBounds.x), maxX),
    y: Math.min(Math.max(preferredY, displayBounds.y), maxY),
  }
}

export function getWidgetNativeBindingPath(baseDir: string): string {
  return join(baseDir, 'native', 'better_sqlite3.node')
}

export function getTrayIconNativeImage(): { buffer: Buffer; scaleFactor?: number } {
  if (process.platform === 'darwin') {
    // 32x32 PNG at scaleFactor 2 = renders as 16x16 logical, sharp on Retina
    return { buffer: Buffer.from(TRAY_ICON_PNG_MAC_BASE64, 'base64'), scaleFactor: 2 }
  }
  if (process.platform === 'linux') {
    return { buffer: Buffer.from(TRAY_ICON_PNG_LINUX_BASE64, 'base64') }
  }
  return { buffer: Buffer.from(TRAY_ICON_PNG_WIN_BASE64, 'base64') }
}
