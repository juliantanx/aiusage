import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RuntimeSettingsController } from '../../src/runtime/settings-controller.js'

describe('RuntimeSettingsController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts parse scheduling when parseInterval is positive', async () => {
    const loadConfig = vi.fn(() => ({ parseInterval: 25 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(25)

    expect(runParse).toHaveBeenCalledTimes(1)
    expect(runCleanup).not.toHaveBeenCalled()
  })

  it('does not schedule parse when parseInterval is blank or zero', async () => {
    const loadConfig = vi.fn(() => ({ parseInterval: 0 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(runParse).not.toHaveBeenCalled()
  })

  it('rebuilds parse scheduling on reload', async () => {
    let parseInterval = 25
    const loadConfig = vi.fn(() => ({ parseInterval }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(25)
    expect(runParse).toHaveBeenCalledTimes(1)

    parseInterval = 60
    controller.reload()
    await vi.advanceTimersByTimeAsync(59)
    expect(runParse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runParse).toHaveBeenCalledTimes(2)
  })

  it('skips overlapping parse runs', async () => {
    let release!: () => void
    const loadConfig = vi.fn(() => ({ parseInterval: 25 }))
    const runParse = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(25)
    expect(runParse).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(runParse).toHaveBeenCalledTimes(1)

    release()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(25)
    expect(runParse).toHaveBeenCalledTimes(2)
  })

  it('starts cleanup scheduling when retentionDays is positive', async () => {
    const loadConfig = vi.fn(() => ({ retentionDays: 7 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup, cleanupIntervalMs: 50 })

    controller.start()
    await vi.advanceTimersByTimeAsync(50)

    expect(runCleanup).toHaveBeenCalledWith({}, 7)
  })

  it('disables cleanup when retentionDays becomes blank or zero', async () => {
    let retentionDays = 7
    const loadConfig = vi.fn(() => ({ retentionDays }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup, cleanupIntervalMs: 50 })

    controller.start()
    await vi.advanceTimersByTimeAsync(50)
    expect(runCleanup).toHaveBeenCalledTimes(1)

    retentionDays = 0
    controller.reload()
    await vi.advanceTimersByTimeAsync(200)
    expect(runCleanup).toHaveBeenCalledTimes(1)
  })

  it('stops all timers on stop', async () => {
    const loadConfig = vi.fn(() => ({ parseInterval: 25, retentionDays: 7 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup, cleanupIntervalMs: 50 })

    controller.start()
    controller.stop()
    await vi.advanceTimersByTimeAsync(500)

    expect(runParse).not.toHaveBeenCalled()
    expect(runCleanup).not.toHaveBeenCalled()
  })

  it('does not schedule when loadConfig returns null', async () => {
    const loadConfig = vi.fn(() => null)
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(500)

    expect(runParse).not.toHaveBeenCalled()
    expect(runCleanup).not.toHaveBeenCalled()
  })

  it('ignores reload before start', async () => {
    const loadConfig = vi.fn(() => ({ parseInterval: 25 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.reload()
    await vi.advanceTimersByTimeAsync(100)

    expect(runParse).not.toHaveBeenCalled()
  })
})
