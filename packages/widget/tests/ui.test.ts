import { describe, expect, it } from 'vitest'
import {
  getTrayIconDataUrl,
  shouldHideWindowOnBlur,
  shouldHideWindowOnClose,
  shouldShowWindowOnLaunch,
} from '../src/ui'

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

  it('provides a visible tray icon asset', () => {
    const dataUrl = getTrayIconDataUrl()

    if (process.platform === 'win32') {
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    } else {
      expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
    }
    expect(dataUrl.length).toBeGreaterThan(30)
  })
})
