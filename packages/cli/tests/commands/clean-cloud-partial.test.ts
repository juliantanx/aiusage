import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// `aiusage clean --before <N>d` is a partial clean. The cloud backend only has
// "clear everything" (POST /api/cli/sync/clear, which drops the records of
// every device and starts a new generation), so a partial clean must not
// reach it.

const home = mkdtempSync(join(tmpdir(), 'aiusage-clean-cloud-'))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => home }
})

// Must import after mock
const { propagateClean, getRemoteBackends, cleanReachesBackend } = await import('../../src/commands/clean.js')

const aiusageDir = join(home, '.aiusage')

function writeConfig(config: unknown): void {
  mkdirSync(aiusageDir, { recursive: true })
  writeFileSync(join(aiusageDir, 'config.json'), JSON.stringify(config))
}

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ sync_generation: 2 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('clean with the cloud backend', () => {
  beforeEach(() => {
    writeConfig({ sync: { backend: 'cloud' }, device: 'laptop' })
    writeFileSync(join(aiusageDir, 'leaderboard-credentials.json'), JSON.stringify({
      device_id: 'dev-1',
      device_secret: 'secret',
      obtained_at: '2026-01-01T00:00:00.000Z',
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(aiusageDir, { recursive: true, force: true })
  })

  it('makes no request for --before and reports the cloud as left untouched', async () => {
    const fetchMock = stubFetch()

    const result = await propagateClean({ all: false, beforeDays: 180 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.backends).toHaveLength(1)
    expect(result.backends[0].backend.type).toBe('cloud')
    expect(result.backends[0].status).toBe('skipped')
    expect(result.backends[0].detail).toContain('left untouched')
  })

  it('makes no request for --before --target cloud either', async () => {
    const fetchMock = stubFetch()

    const result = await propagateClean({ all: false, beforeDays: 30, target: 'cloud' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.backends[0].status).toBe('skipped')
  })

  it('still clears the cloud for --all', async () => {
    const fetchMock = stubFetch()

    const result = await propagateClean({ all: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/cli\/sync\/clear$/)
    expect(init?.method).toBe('POST')
    expect(result.backends).toEqual([{
      backend: { type: 'cloud', label: 'AIUsage Cloud' },
      status: 'ok',
      detail: 'generation updated to 2',
    }])
  })

  it('reports a cloud clear that failed as failed, not as skipped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'boom', error_code: 'server_error' }), { status: 500, headers: { 'content-type': 'application/json' } })))

    const result = await propagateClean({ all: true })

    expect(result.backends).toHaveLength(1)
    expect(result.backends[0]).toMatchObject({ backend: { type: 'cloud' }, status: 'failed' })
  })

  it('does not count the cloud as reached by a partial clean', () => {
    const [cloud] = getRemoteBackends()
    expect(cloud.type).toBe('cloud')
    expect(cleanReachesBackend(cloud, false)).toBe(false)
    expect(cleanReachesBackend(cloud, true)).toBe(true)
  })

  it('counts file-based backends as reached by both kinds of clean', () => {
    writeConfig({ sync: { backend: 'github', repo: 'user/aiusage-data' } })
    const [github] = getRemoteBackends()
    expect(github.type).toBe('github')
    expect(cleanReachesBackend(github, false)).toBe(true)
    expect(cleanReachesBackend(github, true)).toBe(true)

    writeConfig({ sync: { backend: 's3', bucket: 'my-bucket' } })
    const [s3] = getRemoteBackends()
    expect(s3.type).toBe('s3')
    expect(cleanReachesBackend(s3, false)).toBe(true)
    expect(cleanReachesBackend(s3, true)).toBe(true)
  })
})
