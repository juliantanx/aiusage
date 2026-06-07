import { describe, expect, it } from 'vitest'
import {
  getTrayIconNativeImage,
  getWidgetNativeBindingPath,
  getWindowPosition,
  shouldHideWindowOnBlur,
  shouldHideWindowOnClose,
  shouldShowWindowOnLaunch,
} from '../src/ui'
import { t } from '../src/i18n'

describe('widget UI helpers', () => {
  it('shows the window automatically in development', () => {
    expect(shouldShowWindowOnLaunch(false)).toBe(true)
    expect(shouldShowWindowOnLaunch(true)).toBe(false)
  })

  it('keeps the window visible on blur in development and hides only in packaged mode', () => {
    expect(shouldHideWindowOnBlur(false)).toBe(false)
    expect(shouldHideWindowOnBlur(true)).toBe(true)
  })

  it('hides the window on close in both development and packaged modes', () => {
    expect(shouldHideWindowOnClose(false)).toBe(true)
    expect(shouldHideWindowOnClose(true)).toBe(true)
  })

  it('keeps a tray-positioned window within the visible display bounds', () => {
    expect(getWindowPosition({
      platform: 'darwin',
      trayBounds: { x: 1200, y: 0, width: 32, height: 24 },
      windowBounds: { x: 575, y: 328, width: 320, height: 300 },
      displayBounds: { x: 0, y: 0, width: 1470, height: 956 },
    })).toEqual({ x: 1056, y: 28 })
  })

  it('falls back to the menu-bar side when macOS reports a bogus bottom-left tray bound', () => {
    expect(getWindowPosition({
      platform: 'darwin',
      trayBounds: { x: 0, y: 956, width: 32, height: 0 },
      windowBounds: { x: 575, y: 328, width: 320, height: 300 },
      displayBounds: { x: 0, y: 0, width: 1470, height: 956 },
    })).toEqual({ x: 1150, y: 28 })
  })

  it('keeps an oversized window anchored inside the display origin', () => {
    expect(getWindowPosition({
      platform: 'darwin',
      trayBounds: { x: 0, y: 200, width: 20, height: 0 },
      windowBounds: { x: 0, y: 0, width: 320, height: 300 },
      displayBounds: { x: 0, y: 0, width: 200, height: 200 },
    })).toEqual({ x: 0, y: 0 })
  })

  it('resolves the widget-specific native sqlite binding path', () => {
    expect(getWidgetNativeBindingPath('/app/dist')).toBe('/app/dist/native/better_sqlite3.node')
  })

  it('provides a visible tray icon asset', () => {
    const { buffer } = getTrayIconNativeImage()

    expect(buffer.length).toBeGreaterThan(30)
  })

  it('localizes tray context menu labels', () => {
    expect(t('en').openDashboard).toBe('Open Dashboard')
    expect(t('zh').openDashboard).toBe('打开仪表盘')
    expect(t('zh').showPanel).toBe('显示面板')
    expect(t('zh').quit).toBe('退出')
  })
})
