import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { launchWidget } from '../../src/commands/widget'

vi.mock('node:fs')
vi.mock('node:child_process')

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

describe('launchWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('exports launchWidget function', () => {
    expect(typeof launchWidget).toBe('function')
  })

  it('detects stale PID file when process does not exist', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('99999999' as any)

    // Mock process.kill to throw ESRCH (process not found)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
      throw err
    })

    const { spawn, execSync } = await import('node:child_process')
    const spawnMock = vi.mocked(spawn)
    spawnMock.mockReturnValue({ unref: vi.fn(), pid: 12345 } as any)
    vi.mocked(execSync).mockReturnValue('/usr/local/bin/aiusage-widget' as any)

    await launchWidget()

    expect(spawnMock).toHaveBeenCalled()
    killSpy.mockRestore()
  })
})
