const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1" y="1" width="14" height="14" rx="4" fill="#111827"/>
  <path d="M8.8 2.5 4.7 8.2h2.9L7 13.5l4.3-5.9H8.4l.4-5.1Z" fill="#f8fafc"/>
</svg>
`.trim()

// Pre-rendered 32x32 PNG of the same icon — Windows tray doesn't support SVG
const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAyUlEQVR4nMWXMQ6DMAxFzRcX6NYu' +
  'XTtw/6N06NqFbhyhVYYsQUkT+zt+ExLI7zsCJ4gEs7RuXq6PL0NyfF5Vz+Ip7gmCWfJabcyS1xxg' +
  'yPf3Ux0CWqlWXoIy0SyyE5HdmwIw5OoApfx23+YGYIKopVcF2MnyoQAe8sTKKFIL1/NywiJo0ftl' +
  'rJZioYOoxchcgJAZHUqQYMAsphnJ0MpY+wEkGDCKmHfDo3Fu95JnJyQY5AvNKli7T5yk3gfUslH8e' +
  '8BTngj/OQ3nB+9vTnl87+2CAAAAAElFTkSuQmCC'

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
