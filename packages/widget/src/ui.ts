const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1" y="1" width="14" height="14" rx="4" fill="#111827"/>
  <path d="M8.8 2.5 4.7 8.2h2.9L7 13.5l4.3-5.9H8.4l.4-5.1Z" fill="#f8fafc"/>
</svg>
`.trim()

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
  return `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString('base64')}`
}
