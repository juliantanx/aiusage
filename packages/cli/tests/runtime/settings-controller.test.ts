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

  it('starts scheduling when refreshInterval is positive', async () => {
    const loadConfig = vi.fn(() => ({ refreshInterval: 1000 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(runParse).toHaveBeenCalledTimes(1)
    expect(runCleanup).not.toHaveBeenCalled()
  })

  it('does not schedule when refreshInterval is blank or zero', async () => {
    const loadConfig = vi.fn(() => ({ refreshInterval: 0 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(runParse).not.toHaveBeenCalled()
  })

  it('rebuilds scheduling on reload', async () => {
    let refreshInterval = 1000
    const loadConfig = vi.fn(() => ({ refreshInterval }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runParse).toHaveBeenCalledTimes(1)

    refreshInterval = 2400
    controller.reload()
    await vi.advanceTimersByTimeAsync(2399)
    expect(runParse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runParse).toHaveBeenCalledTimes(2)
  })

  it('skips overlapping parse runs', async () => {
    let release!: () => void
    const loadConfig = vi.fn(() => ({ refreshInterval: 1000 }))
    const runParse = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runParse).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4000)
    expect(runParse).toHaveBeenCalledTimes(1)

    release()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runParse).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['refreshInterval', { refreshInterval: 30 }],
    ['legacy parseInterval', { parseInterval: 30 }],
  ])('parses at most once a second for a %s below the minimum (saved by an earlier release)', async (_label, config) => {
    const runParse = vi.fn(async () => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig: vi.fn(() => config), runParse, runCleanup: vi.fn() })

    controller.start()
    await vi.advanceTimersByTimeAsync(999)
    expect(runParse).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runParse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runParse).toHaveBeenCalledTimes(4)
  })

  it('syncs at most once a minute for a syncInterval below the minimum, and reports that schedule', async () => {
    const runSync = vi.fn()
    const onSyncScheduleChanged = vi.fn()
    const start = Date.now()
    const controller = new RuntimeSettingsController({
      db: {} as any, loadConfig: vi.fn(() => ({ syncInterval: 50, sync: { backend: 'cloud' as const } })),
      runParse: vi.fn(async () => {}), runCleanup: vi.fn(), runSync, onSyncScheduleChanged,
    })

    controller.start()
    expect(onSyncScheduleChanged).toHaveBeenLastCalledWith(start + 60_000)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(runSync).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runSync).toHaveBeenCalledTimes(1)
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
    const loadConfig = vi.fn(() => ({ refreshInterval: 25, retentionDays: 7 }))
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
    const loadConfig = vi.fn(() => ({ refreshInterval: 25 }))
    const runParse = vi.fn(async () => {})
    const runCleanup = vi.fn(() => {})
    const controller = new RuntimeSettingsController({ db: {} as any, loadConfig, runParse, runCleanup })

    controller.reload()
    await vi.advanceTimersByTimeAsync(100)

    expect(runParse).not.toHaveBeenCalled()
  })
})
