const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1" y="9" width="4" height="6" rx="1" fill="#111827"/>
  <rect x="6" y="5" width="4" height="10" rx="1" fill="#111827"/>
  <rect x="11" y="2" width="4" height="13" rx="1" fill="#111827"/>
</svg>
`.trim()

// Pre-rendered 32x32 PNG of the same icon — Windows tray doesn't support SVG
const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAAoUlE' +
  'QVRYhe2UMQ6DMAxFnyMuwFapdOxpuEfOVE7Su7DC0I0jpBuKEEVuFLcDfmu+kyfLDjhnR6wubi/' +
  '3nhQGhOvmaIYUl9f4BAhWAhAeO48DdCDDmrIToDs4u/1CQIULNN8WaKdbS0EHdNNtKKCbbkuBqr' +
  'iAC6z/QO391pJ1oO5+FwjU3e8Sgb/gAi7gArnAfJCbrHKZQIofiiYRol3u7LwB6zstOIKDR/wAA' +
  'AAASUVORK5CYII='

export function shouldShowWindowOnLaunch(isPackaged: boolean): boolean {
  return !isPackaged
}

export function shouldHideWindowOnBlur(isPackaged: boolean): boolean {
  return isPackaged
}

export function shouldHideWindowOnClose(_: boolean): boolean {
  return true
}

export function getTrayIconDataUrl(): string {
  // Windows tray doesn't render SVG icons — use pre-rendered PNG
  if (process.platform === 'win32') {
    return `data:image/png;base64,${TRAY_ICON_PNG_BASE64}`
  }
  return `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString('base64')}`
}
