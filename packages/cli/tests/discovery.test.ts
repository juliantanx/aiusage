import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let mockHome = tmpdir()
let mockPlatform: NodeJS.Platform = 'linux'

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return {
    ...actual,
    homedir: () => mockHome,
    platform: () => mockPlatform,
  }
})

vi.mock('../src/config.js', () => ({ loadConfig: () => null }))

async function loadDiscovery(options: { home: string; platform?: NodeJS.Platform }) {
  mockHome = options.home
  mockPlatform = options.platform ?? 'linux'
  vi.resetModules()
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
    delete process.env.AIUSAGE_IDE_ROOTS
    delete process.env.AIUSAGE_KELIVO_PATH
    delete process.env.AIUSAGE_CODEFUSE_PATH
    delete process.env.CODEFUSE_HOME
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

    if (platform === 'win32') {
      expect(defaultKiloDbPath()).toBe(join(home, 'AppData', 'Roaming', 'kilo', 'kilo.db'))
    } else {
      expect(defaultKiloDbPath()).toBe(join(home, '.local', 'share', 'kilo', 'kilo.db'))
    }
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

  it('discovers CodeFuse native, CC, embedded Codex, and snapshot fallback files', async () => {
    const home = makeHome()
    const nativeDir = join(home, '.codefuse', 'projects', '-workspace')
    const ccDir = join(home, '.codefuse', 'engine', 'cc', 'projects', '-workspace')
    const embeddedCodexDir = join(home, '.codefuse', 'engine', 'codex', 'sessions', '2026', '07', '06')
    mkdirSync(nativeDir, { recursive: true })
    mkdirSync(ccDir, { recursive: true })
    mkdirSync(embeddedCodexDir, { recursive: true })
    const nativeFile = join(nativeDir, 'native-session.jsonl')
    const ccFile = join(ccDir, 'cc-session.jsonl')
    const snapshotFile = join(ccDir, 'ant_cc_snapshot-only.json')
    const ignoredJson = join(ccDir, 'prompt-cc-session.json')
    const embeddedCodexFile = join(embeddedCodexDir, 'rollout-embedded.jsonl')
    writeFileSync(nativeFile, '{}\n')
    writeFileSync(ccFile, '{}\n')
    writeFileSync(snapshotFile, '{}')
    writeFileSync(ignoredJson, '{}')
    writeFileSync(embeddedCodexFile, '{}\n')

    const { discoverLogFiles, discoverTools } = await loadDiscovery({ home, platform: 'linux' })
    const codefuse = discoverTools().find((tool) => tool.sourceKey === 'codefuse')
    const logFiles = discoverLogFiles().find((result) => result.tool === 'codefuse')?.paths ?? []

    expect(codefuse?.status).toBe('found')
    expect(codefuse?.fileCount).toBe(4)
    expect(codefuse?.paths).toEqual([
      join(home, '.codefuse', 'projects'),
      join(home, '.codefuse', 'engine', 'cc', 'projects'),
      join(home, '.codefuse', 'engine', 'codex', 'sessions'),
    ])
    expect(logFiles).toEqual(expect.arrayContaining([
      nativeFile,
      ccFile,
      snapshotFile,
      embeddedCodexFile,
    ]))
    expect(logFiles).not.toContain(ignoredJson)
  })

  it('supports a custom CodeFuse path that points directly at CC projects', async () => {
    const home = makeHome()
    const ccRoot = join(home, 'custom-codefuse-cc')
    const ccDir = join(ccRoot, '-workspace')
    mkdirSync(ccDir, { recursive: true })
    const ccFile = join(ccDir, 'cc-session.jsonl')
    const snapshotFile = join(ccDir, 'ant_cc_cc-session.json')
    writeFileSync(ccFile, '{}\n')
    writeFileSync(snapshotFile, '{}')

    const { discoverLogFiles, discoverTools } = await loadDiscovery({ home, platform: 'linux' })
    const env = { AIUSAGE_CODEFUSE_PATH: ccRoot }
    const codefuse = discoverTools(env).find((tool) => tool.sourceKey === 'codefuse')
    const logFiles = discoverLogFiles(env).find((result) => result.tool === 'codefuse')?.paths ?? []

    expect(codefuse?.status).toBe('found')
    expect(codefuse?.fileCount).toBe(2)
    expect(codefuse?.path).toBe(ccRoot)
    expect(codefuse?.paths).toEqual([ccRoot])
    expect(logFiles).toEqual(expect.arrayContaining([ccFile, snapshotFile]))
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

  it('discovers additional tool paths', async () => {
    const home = makeHome()
    mkdirSync(join(home, '.kimi-code', 'sessions', 'wd', 'sess', 'agents', 'main'), { recursive: true })
    writeFileSync(join(home, '.kimi-code', 'sessions', 'wd', 'sess', 'agents', 'main', 'wire.jsonl'), '{}\n')
    mkdirSync(join(home, '.codebuddy', 'projects', '-workspace'), { recursive: true })
    writeFileSync(join(home, '.codebuddy', 'projects', '-workspace', 'session.jsonl'), '{}\n')
    const kiroDataDir = join(home, '.local', 'share', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'dev_data')
    mkdirSync(kiroDataDir, { recursive: true })
    writeFileSync(join(kiroDataDir, 'tokens_generated.jsonl'), '{"model":"agent","provider":"kiro","promptTokens":10,"generatedTokens":5}\n')
    const ideRoot = join(home, '.config', 'Code')
    mkdirSync(join(ideRoot, 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks', 'task-1'), { recursive: true })
    writeFileSync(join(ideRoot, 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks', 'task-1', 'ui_messages.json'), '[]')
    mkdirSync(join(home, '.local', 'share', 'goose', 'sessions'), { recursive: true })
    writeFileSync(join(home, '.local', 'share', 'goose', 'sessions', 'sessions.db'), '')
    mkdirSync(join(home, 'kelivo-backups'), { recursive: true })
    writeFileSync(join(home, 'kelivo-backups', 'chats.json'), JSON.stringify({ messages: [] }))

    process.env.AIUSAGE_IDE_ROOTS = ideRoot
    process.env.AIUSAGE_KELIVO_PATH = join(home, 'kelivo-backups')
    const { discoverLogFiles, discoverTools } = await loadDiscovery({ home, platform: 'linux' })

    expect(discoverTools().find((tool) => tool.sourceKey === 'kimi')?.status).toBe('found')
    expect(discoverTools().find((tool) => tool.sourceKey === 'codebuddy')?.status).toBe('found')
    expect(discoverTools().find((tool) => tool.sourceKey === 'kiro')?.status).toBe('found')
    expect(discoverTools().find((tool) => tool.sourceKey === 'roocode')?.status).toBe('found')
    expect(discoverTools().find((tool) => tool.sourceKey === 'goose')?.status).toBe('found')
    expect(discoverTools().find((tool) => tool.sourceKey === 'kelivo')?.status).toBe('found')
    expect(discoverLogFiles().find((result) => result.tool === 'kimi')?.paths).toHaveLength(1)
    expect(discoverLogFiles().find((result) => result.tool === 'codebuddy')?.paths).toHaveLength(1)
    expect(discoverLogFiles().find((result) => result.tool === 'kiro')?.paths).toHaveLength(1)
    expect(discoverLogFiles().find((result) => result.tool === 'roocode')?.paths).toHaveLength(1)
    expect(discoverLogFiles().find((result) => result.tool === 'kelivo')?.paths).toHaveLength(1)
  })
})
