import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function loadDiscovery(options: { home: string; platform?: NodeJS.Platform }) {
  vi.resetModules()
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os')
    return {
      ...actual,
      homedir: () => options.home,
      platform: () => options.platform ?? 'linux',
    }
  })
  vi.doMock('../src/config.js', () => ({ loadConfig: () => null }))
  return import('../src/discovery.js')
}

describe('discovery path resolution', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.XDG_DATA_HOME
    delete process.env.APPDATA
    delete process.env.LOCALAPPDATA
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeHome(): string {
    const dir = mkdtempSync(join(tmpdir(), 'aiusage-discovery-'))
    tempDirs.push(dir)
    return dir
  }

  it.each(['darwin', 'win32', 'linux'] as NodeJS.Platform[])('uses XDG data path for OpenCode on %s', async (platform) => {
    const home = makeHome()
    process.env.APPDATA = join(home, 'AppData', 'Roaming')
    process.env.LOCALAPPDATA = join(home, 'AppData', 'Local')
    const { defaultOpenCodeDbPath } = await loadDiscovery({ home, platform })

    expect(defaultOpenCodeDbPath()).toBe(join(home, '.local', 'share', 'opencode', 'opencode.db'))
  })

  it('honors XDG_DATA_HOME for OpenCode', async () => {
    const home = makeHome()
    process.env.XDG_DATA_HOME = join(home, 'xdg-data')
    const { defaultOpenCodeDbPath } = await loadDiscovery({ home, platform: 'linux' })

    expect(defaultOpenCodeDbPath()).toBe(join(home, 'xdg-data', 'opencode', 'opencode.db'))
  })

  it.each(['darwin', 'win32', 'linux'] as NodeJS.Platform[])('uses XDG data path for KiloCode on %s', async (platform) => {
    const home = makeHome()
    process.env.APPDATA = join(home, 'AppData', 'Roaming')
    process.env.LOCALAPPDATA = join(home, 'AppData', 'Local')
    const legacyDir = join(home, 'Library', 'Application Support', 'kilo')
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, 'kilo.db'), '')
    const { defaultKiloDbPath } = await loadDiscovery({ home, platform })

    expect(defaultKiloDbPath()).toBe(join(home, '.local', 'share', 'kilo', 'kilo.db'))
  })

  it('honors XDG_DATA_HOME for KiloCode', async () => {
    const home = makeHome()
    process.env.XDG_DATA_HOME = join(home, 'xdg-data')
    const { defaultKiloDbPath } = await loadDiscovery({ home, platform: 'linux' })

    expect(defaultKiloDbPath()).toBe(join(home, 'xdg-data', 'kilo', 'kilo.db'))
  })

  it('honors native environment overrides for tool roots and database paths', async () => {
    const home = makeHome()
    const { getDbPath, discoverTools } = await loadDiscovery({ home, platform: 'linux' })

    const customClaude = join(home, 'claude-config')
    const customCodex = join(home, 'codex-home')
    const customOpenClaw = join(home, 'openclaw-state')
    const customHermes = join(home, 'hermes-home')
    const customOpenCode = join(home, 'opencode-custom.db')
    const customKilo = join(home, 'kilo-custom.db')

    const env = {
      CLAUDE_CONFIG_DIR: customClaude,
      CODEX_HOME: customCodex,
      OPENCLAW_STATE_DIR: customOpenClaw,
      HERMES_HOME: customHermes,
      OPENCODE_DB: customOpenCode,
      KILO_DB: customKilo,
    }

    expect(discoverTools(env).find((tool) => tool.sourceKey === 'claude-code')?.path)
      .toBe(join(customClaude, 'projects'))
    expect(discoverTools(env).find((tool) => tool.sourceKey === 'codex')?.path)
      .toBe(join(customCodex, 'sessions'))
    expect(discoverTools(env).find((tool) => tool.sourceKey === 'openclaw')?.path)
      .toBe(join(customOpenClaw, 'agents'))
    expect(getDbPath('hermes', env)).toBe(join(customHermes, 'state.db'))
    expect(getDbPath('opencode', env)).toBe(customOpenCode)
    expect(getDbPath('kilocode-db', env)).toBe(customKilo)
  })

  it('includes Codex archived sessions when discovering log files', async () => {
    const home = makeHome()
    const archivedDir = join(home, '.codex', 'archived_sessions', '2026', '06', '03')
    mkdirSync(archivedDir, { recursive: true })
    const archivedFile = join(archivedDir, 'rollout-2026-06-03T10-00-00-id.jsonl')
    writeFileSync(archivedFile, '{}\n')

    const { discoverLogFiles } = await loadDiscovery({ home, platform: 'linux' })

    expect(discoverLogFiles().find((result) => result.tool === 'codex')?.paths).toEqual([archivedFile])
  })

  it('counts Codex archived sessions when regular sessions are absent', async () => {
    const home = makeHome()
    const archivedDir = join(home, '.codex', 'archived_sessions', '2026', '06', '03')
    mkdirSync(archivedDir, { recursive: true })
    const archivedFile = join(archivedDir, 'rollout-2026-06-03T10-00-00-id.jsonl')
    writeFileSync(archivedFile, '{}\n')

    const { discoverTools } = await loadDiscovery({ home, platform: 'linux' })
    const codex = discoverTools().find((tool) => tool.sourceKey === 'codex')

    expect(codex?.status).toBe('found')
    expect(codex?.fileCount).toBe(1)
    expect(codex?.paths).toEqual([join(home, '.codex', 'archived_sessions')])
  })

  it('lists all detected OpenCode channel databases', async () => {
    const home = makeHome()
    const opencodeDir = join(home, '.local', 'share', 'opencode')
    mkdirSync(opencodeDir, { recursive: true })
    const primaryDb = join(opencodeDir, 'opencode.db')
    const devDb = join(opencodeDir, 'opencode-dev.db')
    writeFileSync(primaryDb, '')
    writeFileSync(devDb, '')

    const { discoverTools } = await loadDiscovery({ home, platform: 'linux' })
    const opencode = discoverTools().find((tool) => tool.sourceKey === 'opencode')

    expect(opencode?.status).toBe('found')
    expect(opencode?.fileCount).toBe(2)
    expect(opencode?.path).toBe(primaryDb)
    expect(opencode?.paths).toEqual([primaryDb, devDb])
  })
})
