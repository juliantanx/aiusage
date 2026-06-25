import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, isAbsolute, basename } from 'node:path'
import { homedir, platform } from 'node:os'
import type { Tool } from '@aiusage/core'
import { loadConfig } from './config.js'

export interface DetectedTool {
  tool: Tool
  /** The source key used in config/watermarks (e.g. 'claude-code', 'qoder-db') */
  sourceKey: string
  label: string
  path: string
  paths?: string[]
  fileCount: number
  status: 'found' | 'empty' | 'not_found'
  lastImportedAt?: number
}

// ── Environment variable helpers ─────────────────────────────────────

function envKey(sourceKey: string): string {
  return `AIUSAGE_${sourceKey.toUpperCase().replace(/-/g, '_')}_PATH`
}

function envOverride(sourceKey: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[envKey(sourceKey)] || undefined
}

function xdgDataDir(home: string, app: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), app)
}

function relativeOrAbsolute(baseDir: string, value: string): string {
  return value === ':memory:' || isAbsolute(value) ? value : join(baseDir, value)
}

function existingOpenCodeDbs(env: NodeJS.ProcessEnv = process.env): string[] {
  const dataDir = xdgDataDir(homedir(), 'opencode', env)
  const primary = join(dataDir, 'opencode.db')
  const paths = [primary]
  try {
    for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!/^opencode(?:-[A-Za-z0-9._-]+)?\.db$/.test(entry.name)) continue
      const dbPath = join(dataDir, entry.name)
      if (dbPath !== primary) paths.push(dbPath)
    }
  } catch {}
  return unique(paths)
}

// ── File helpers ─────────────────────────────────────────────────────

function findJsonlFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath))
      } else if (entry.isFile() && extname(entry.name) === '.jsonl') {
        results.push(fullPath)
      }
    }
  } catch {}
  return results
}

function findQoderSegmentFiles(dir: string): string[] {
  return findJsonlFiles(dir).filter((filePath) => {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    const sessionsIndex = parts.lastIndexOf('sessions')
    const segmentsIndex = parts.lastIndexOf('segments')
    return sessionsIndex >= 0
      && segmentsIndex > sessionsIndex
      && segmentsIndex === parts.length - 2
  })
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)]
}

function codexLogDirs(ctx: ProbeContext, sessionsDir: string): string[] {
  const customPath = envOverride('codex', ctx.env) || ctx.legacySources?.['codex']
  if (customPath) {
    const root = customPath.replace(/[\\/]sessions[\\/]?$/, '')
    return unique([customPath, join(root, 'archived_sessions')])
  }
  const root = ctx.env.CODEX_HOME ?? join(ctx.home, '.codex')
  return [sessionsDir, join(root, 'archived_sessions')]
}

function windowsUserHomesFromWsl(): string[] {
  const homes: string[] = []
  if (!existsSync('/mnt')) return homes
  try {
    const drives = readdirSync('/mnt', { withFileTypes: true })
    for (const drive of drives) {
      if (!drive.isDirectory() || !/^[a-z]$/i.test(drive.name)) continue
      const usersDir = join('/mnt', drive.name, 'Users')
      if (!existsSync(usersDir)) continue
      try {
        const users = readdirSync(usersDir, { withFileTypes: true })
        for (const user of users) {
          if (!user.isDirectory()) continue
          if (['All Users', 'Default', 'Default User', 'Public'].includes(user.name)) continue
          homes.push(join(usersDir, user.name))
        }
      } catch {}
    }
  } catch {}
  return homes
}

// ── Platform-aware default path resolvers ────────────────────────────

export function defaultOpenCodeDbPath(): string {
  return join(xdgDataDir(homedir(), 'opencode'), 'opencode.db')
}

export function defaultHermesDbPath(): string {
  return join(homedir(), '.hermes', 'state.db')
}

export function defaultQoderDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
  }
  if (plat === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
  }
  const xdgDataHome = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share')
  return join(xdgDataHome, 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
}

export function defaultCursorDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return join(xdgConfigHome, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

export function defaultKiloDbPath(): string {
  return join(xdgDataDir(homedir(), 'kilo'), 'kilo.db')
}

export function defaultGooseDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'goose', 'sessions', 'sessions.db')
  }
  if (plat === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'goose', 'sessions', 'sessions.db')
  }
  return join(xdgDataDir(home, 'goose'), 'sessions', 'sessions.db')
}

export function defaultZedDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Zed', 'threads', 'threads.db')
  }
  if (plat === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return join(localAppData, 'Zed', 'threads', 'threads.db')
  }
  return join(xdgDataDir(home, 'zed'), 'threads', 'threads.db')
}

export function defaultZcodeDbPath(): string {
  // ZCode CLI stores its usage database at <home>/.zcode/cli/db/db.sqlite
  return join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite')
}

// ── Per-tool probe functions ─────────────────────────────────────────
// Each returns the resolved data path (or null if not installed).
// Priority: env override → legacy config.sources → platform default + existence check

interface ProbeContext {
  home: string
  env: NodeJS.ProcessEnv
  legacySources?: Record<string, string | undefined>
}

function probeClaudeCode(ctx: ProbeContext): string | null {
  const override = envOverride('claude-code', ctx.env)
  if (override) return override
  if (ctx.env.CLAUDE_CONFIG_DIR) return join(ctx.env.CLAUDE_CONFIG_DIR, 'projects')
  const legacy = ctx.legacySources?.['claude-code']
  if (legacy) return legacy
  const dir = join(ctx.home, '.claude', 'projects')
  return existsSync(dir) ? dir : null
}

function probeCodex(ctx: ProbeContext): string | null {
  const override = envOverride('codex', ctx.env)
  if (override) return override
  if (ctx.env.CODEX_HOME) return join(ctx.env.CODEX_HOME, 'sessions')
  const legacy = ctx.legacySources?.['codex']
  if (legacy) return legacy
  const codexHome = join(ctx.home, '.codex')
  const sessionsDir = join(codexHome, 'sessions')
  const archivedDir = join(codexHome, 'archived_sessions')
  return existsSync(sessionsDir) || existsSync(archivedDir) ? sessionsDir : null
}

function probeOpenClaw(ctx: ProbeContext): string | null {
  const override = envOverride('openclaw', ctx.env)
  if (override) return override
  if (ctx.env.OPENCLAW_STATE_DIR) return join(ctx.env.OPENCLAW_STATE_DIR, 'agents')
  const legacy = ctx.legacySources?.['openclaw']
  if (legacy) return legacy
  const dir = join(ctx.home, '.openclaw', 'agents')
  return existsSync(dir) ? dir : null
}

function probeOpenCode(ctx: ProbeContext): string | null {
  const override = envOverride('opencode', ctx.env)
  if (override) return override
  if (ctx.env.OPENCODE_DB) return ctx.env.OPENCODE_DB
  const legacy = ctx.legacySources?.['opencode']
  if (legacy) return legacy
  const dbPaths = existingOpenCodeDbs(ctx.env)
  return dbPaths.find((dbPath) => existsSync(dbPath)) ?? null
}

function probeHermes(ctx: ProbeContext): string | null {
  const override = envOverride('hermes', ctx.env)
  if (override) return override
  if (ctx.env.HERMES_HOME) return join(ctx.env.HERMES_HOME, 'state.db')
  const legacy = ctx.legacySources?.['hermes']
  if (legacy) return legacy
  const dbPath = defaultHermesDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeQoderSessions(ctx: ProbeContext): string | null {
  const override = envOverride('qoder', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['qoder']
  if (legacy) return legacy
  const dirs = defaultQoderSessionDirs(ctx.home)
  return dirs.find((d) => existsSync(d)) ?? null
}

function probeQoderDb(ctx: ProbeContext): string | null {
  const override = envOverride('qoder-db', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['qoder-db']
  if (legacy) return legacy
  const dbPath = defaultQoderDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeCursor(ctx: ProbeContext): string | null {
  const override = envOverride('cursor', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['cursor']
  if (legacy) return legacy
  const dbPath = defaultCursorDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeKiloDb(ctx: ProbeContext): string | null {
  const override = envOverride('kilocode-db', ctx.env)
  if (override) return override
  if (ctx.env.KILO_DB) return relativeOrAbsolute(xdgDataDir(ctx.home, 'kilo', ctx.env), ctx.env.KILO_DB)
  const legacy = ctx.legacySources?.['kilocode-db']
  if (legacy) return legacy
  const dbPath = defaultKiloDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeKiloTasks(ctx: ProbeContext): string | null {
  const override = envOverride('kilocode', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['kilocode']
  if (legacy) return legacy
  for (const root of ideRoots(ctx)) {
    const dir = join(root, 'User', 'globalStorage', 'kilocode.kilo-code', 'tasks')
    if (existsSync(dir)) return dir
  }
  return null
}

function probeKelivo(ctx: ProbeContext): string | null {
  const override = envOverride('kelivo', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['kelivo']
  if (legacy) return legacy
  return null
}

function probeCopilot(ctx: ProbeContext): string | null {
  const override = envOverride('copilot', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['copilot']
  if (legacy) return legacy
  // Check tool's own env var
  const otelPath = ctx.env.COPILOT_OTEL_FILE_EXPORTER_PATH
  if (otelPath && existsSync(otelPath)) return otelPath
  const dir = join(ctx.home, '.copilot', 'otel')
  return existsSync(dir) ? dir : null
}

function probeGemini(ctx: ProbeContext): string | null {
  const override = envOverride('gemini', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['gemini']
  if (legacy) return legacy
  const dir = ctx.env.GEMINI_HOME ? join(ctx.env.GEMINI_HOME, 'tmp') : join(ctx.home, '.gemini', 'tmp')
  return existsSync(dir) ? dir : null
}

function probeKimi(ctx: ProbeContext): string | null {
  const override = envOverride('kimi', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['kimi']
  if (legacy) return legacy
  const codeHome = ctx.env.KIMI_CODE_HOME ?? join(ctx.home, '.kimi-code')
  const legacyHome = ctx.env.KIMI_HOME ?? join(ctx.home, '.kimi')
  if (existsSync(join(codeHome, 'sessions'))) return join(codeHome, 'sessions')
  return existsSync(join(legacyHome, 'sessions')) ? join(legacyHome, 'sessions') : null
}

function probeCodeBuddy(ctx: ProbeContext): string | null {
  const override = envOverride('codebuddy', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['codebuddy']
  if (legacy) return legacy
  const dir = join(ctx.env.CODEBUDDY_HOME ?? join(ctx.home, '.codebuddy'), 'projects')
  return existsSync(dir) ? dir : null
}

function probeKiro(ctx: ProbeContext): string | null {
  const override = envOverride('kiro', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['kiro']
  if (legacy) return legacy
  const devDataBase = kiroDevDataDir(ctx)
  const ideDb = join(devDataBase, 'devdata.sqlite')
  const tokensJsonl = join(devDataBase, 'tokens_generated.jsonl')
  const cliSessions = join(ctx.env.KIRO_HOME ?? join(ctx.home, '.kiro'), 'sessions', 'cli')
  const appSupport = platform() === 'darwin'
    ? join(ctx.home, 'Library', 'Application Support', 'kiro-cli', 'data.sqlite3')
    : platform() === 'win32'
      ? join(ctx.env.APPDATA ?? join(ctx.home, 'AppData', 'Roaming'), 'kiro-cli', 'data.sqlite3')
      : join(ctx.env.XDG_DATA_HOME ?? join(ctx.home, '.local', 'share'), 'kiro-cli', 'data.sqlite3')
  if (existsSync(ideDb) && statSync(ideDb).size > 0) return ideDb
  if (existsSync(appSupport)) return appSupport
  if (existsSync(cliSessions)) return cliSessions
  if (existsSync(tokensJsonl)) return devDataBase
  return null
}


function kiroDevDataDir(ctx: ProbeContext): string {
  if (platform() === 'darwin') {
    return join(ctx.home, 'Library', 'Application Support', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'dev_data')
  }
  if (platform() === 'win32') {
    const appData = ctx.env.APPDATA ?? join(ctx.home, 'AppData', 'Roaming')
    return join(appData, 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'dev_data')
  }
  return join(ctx.env.XDG_DATA_HOME ?? join(ctx.home, '.local', 'share'), 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'dev_data')
}
function kiroWorkspaceSessionsDir(ctx: ProbeContext): string {
  if (platform() === 'darwin') {
    return join(ctx.home, 'Library', 'Application Support', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'workspace-sessions')
  }
  if (platform() === 'win32') {
    const appData = ctx.env.APPDATA ?? join(ctx.home, 'AppData', 'Roaming')
    return join(appData, 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'workspace-sessions')
  }
  return join(ctx.env.XDG_DATA_HOME ?? join(ctx.home, '.local', 'share'), 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'workspace-sessions')
}

function probeGrok(ctx: ProbeContext): string | null {
  const override = envOverride('grok', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['grok']
  if (legacy) return legacy
  const dir = join(ctx.env.GROK_HOME ?? join(ctx.home, '.grok'), 'sessions')
  return existsSync(dir) ? dir : null
}

function probeAntigravity(ctx: ProbeContext): string | null {
  const override = envOverride('antigravity', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['antigravity']
  if (legacy) return legacy
  const home = ctx.env.GEMINI_HOME ?? join(ctx.home, '.gemini')
  const dir = join(home, 'tmp', 'antigravity')
  return existsSync(dir) ? dir : null
}

function ideRoots(ctx: ProbeContext): string[] {
  const roots: string[] = []
  if (typeof ctx.env.AIUSAGE_IDE_ROOTS === 'string' && ctx.env.AIUSAGE_IDE_ROOTS.trim()) {
    roots.push(...ctx.env.AIUSAGE_IDE_ROOTS.split(':').map((p) => p.trim()).filter(Boolean))
  }
  const home = ctx.home
  if (platform() === 'darwin') {
    const base = join(home, 'Library', 'Application Support')
    roots.push(...['Code', 'Cursor', 'CodeBuddy', 'Windsurf', 'VSCodium'].map((name) => join(base, name)))
  } else if (platform() === 'win32') {
    const appData = ctx.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    roots.push(...['Code', 'Cursor', 'CodeBuddy', 'Windsurf', 'VSCodium'].map((name) => join(appData, name)))
  } else {
    const config = ctx.env.XDG_CONFIG_HOME ?? join(home, '.config')
    roots.push(...['Code', 'Cursor', 'CodeBuddy', 'Windsurf', 'VSCodium'].map((name) => join(config, name)))
  }
  return unique(roots)
}

function probeRooCode(ctx: ProbeContext): string | null {
  const override = envOverride('roocode', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['roocode']
  if (legacy) return legacy
  for (const root of ideRoots(ctx)) {
    const dir = join(root, 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks')
    if (existsSync(dir)) return dir
  }
  return null
}

function probeZed(ctx: ProbeContext): string | null {
  const override = envOverride('zed', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['zed']
  if (legacy) return legacy
  const dbPath = defaultZedDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeZcode(ctx: ProbeContext): string | null {
  const override = envOverride('zcode', ctx.env)
  if (override) return override
  if (ctx.env.ZCODE_HOME) return join(ctx.env.ZCODE_HOME, 'cli', 'db', 'db.sqlite')
  const legacy = ctx.legacySources?.['zcode']
  if (legacy) return legacy
  const dbPath = defaultZcodeDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeGoose(ctx: ProbeContext): string | null {
  const override = envOverride('goose', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['goose']
  if (legacy) return legacy
  const dbPath = ctx.env.GOOSE_PATH_ROOT ? join(ctx.env.GOOSE_PATH_ROOT, 'data', 'sessions', 'sessions.db') : defaultGooseDbPath()
  return existsSync(dbPath) ? dbPath : null
}

function probeOmp(ctx: ProbeContext): string | null {
  const override = envOverride('omp', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['omp']
  if (legacy) return legacy
  const dir = join(ctx.env.OMP_HOME ?? join(ctx.home, '.omp'), 'agent', 'sessions')
  return existsSync(dir) ? dir : null
}

function probePi(ctx: ProbeContext): string | null {
  const override = envOverride('pi', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['pi']
  if (legacy) return legacy
  const dir = ctx.env.PI_CODING_AGENT_DIR
    ? join(ctx.env.PI_CODING_AGENT_DIR, 'sessions')
    : join(ctx.home, '.pi', 'agent', 'sessions')
  return existsSync(dir) ? dir : null
}

function probeCraft(ctx: ProbeContext): string | null {
  const override = envOverride('craft', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['craft']
  if (legacy) return legacy
  const dir = ctx.env.CRAFT_CONFIG_DIR ?? join(ctx.home, '.craft-agent')
  return existsSync(dir) ? dir : null
}

function probeDroid(ctx: ProbeContext): string | null {
  const override = envOverride('droid', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['droid']
  if (legacy) return legacy
  const dir = join(ctx.home, '.droid', 'sessions')
  return existsSync(dir) ? dir : null
}

function probeTrae(ctx: ProbeContext): string | null {
  const override = envOverride('trae', ctx.env)
  if (override) return override
  const legacy = ctx.legacySources?.['trae']
  if (legacy) return legacy

  // Detect the correct Trae variant by checking each data directory.
  // Order: Trae CN > TRAE SOLO CN > Trae (international)
  const appNames = platform() === 'darwin'
    ? ['Trae CN', 'TRAE SOLO CN', 'Trae']
    : platform() === 'win32'
      ? ['Trae CN', 'TRAE SOLO CN', 'Trae']
      : ['Trae CN', 'TRAE SOLO CN', 'Trae']

  for (const appName of appNames) {
    let dbPath: string
    if (platform() === 'darwin') {
      dbPath = join(ctx.home, 'Library', 'Application Support', appName, 'User', 'globalStorage', 'state.vscdb')
    } else if (platform() === 'win32') {
      const appData = ctx.env.APPDATA ?? join(ctx.home, 'AppData', 'Roaming')
      dbPath = join(appData, appName, 'User', 'globalStorage', 'state.vscdb')
    } else {
      const config = ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, '.config')
      dbPath = join(config, appName, 'User', 'globalStorage', 'state.vscdb')
    }
    if (existsSync(dbPath)) return dbPath
  }

  return null
}

// ── Qoder multi-dir helpers ──────────────────────────────────────────

function defaultQoderSessionDirs(home: string): string[] {
  const windowsHomes = [
    process.env.USERPROFILE,
    ...windowsUserHomesFromWsl(),
  ].filter((value): value is string => !!value)

  const dirs = [
    join(home, '.qoder', 'logs', 'sessions'),
    ...windowsHomes.flatMap((windowsHome) => [
      join(windowsHome, '.qoder', 'logs', 'sessions'),
      join(windowsHome, 'AppData', 'Local', '.qoder', 'logs', 'sessions'),
      join(windowsHome, 'AppData', 'Roaming', 'Qoder', 'logs', 'sessions'),
    ]),
  ]

  if (process.env.LOCALAPPDATA) {
    dirs.push(join(process.env.LOCALAPPDATA, '.qoder', 'logs', 'sessions'))
  }
  if (process.env.APPDATA) {
    dirs.push(join(process.env.APPDATA, 'Qoder', 'logs', 'sessions'))
  }

  return unique(dirs)
}

// ── Tool registry ────────────────────────────────────────────────────

interface ToolEntry {
  tool: Tool
  sourceKey: string
  label: string
  probe: (ctx: ProbeContext) => string | null
}

const TOOL_REGISTRY: readonly ToolEntry[] = [
  { tool: 'claude-code', sourceKey: 'claude-code', label: 'Claude Code', probe: probeClaudeCode },
  { tool: 'codex', sourceKey: 'codex', label: 'Codex', probe: probeCodex },
  { tool: 'openclaw', sourceKey: 'openclaw', label: 'OpenClaw', probe: probeOpenClaw },
  { tool: 'opencode', sourceKey: 'opencode', label: 'OpenCode', probe: probeOpenCode },
  { tool: 'hermes', sourceKey: 'hermes', label: 'Hermes', probe: probeHermes },
  { tool: 'qoder', sourceKey: 'qoder', label: 'Qoder (sessions)', probe: probeQoderSessions },
  { tool: 'qoder', sourceKey: 'qoder-db', label: 'Qoder (desktop)', probe: probeQoderDb },
  { tool: 'cursor', sourceKey: 'cursor', label: 'Cursor', probe: probeCursor },
  { tool: 'kilocode', sourceKey: 'kilocode', label: 'Kilo Code (extension)', probe: probeKiloTasks },
  { tool: 'kilocode', sourceKey: 'kilocode-db', label: 'KiloCode', probe: probeKiloDb },
  { tool: 'kelivo', sourceKey: 'kelivo', label: 'Kelivo', probe: probeKelivo },
  { tool: 'copilot', sourceKey: 'copilot', label: 'Copilot', probe: probeCopilot },
  { tool: 'gemini', sourceKey: 'gemini', label: 'Gemini CLI', probe: probeGemini },
  { tool: 'kimi', sourceKey: 'kimi', label: 'Kimi Code', probe: probeKimi },
  { tool: 'codebuddy', sourceKey: 'codebuddy', label: 'CodeBuddy', probe: probeCodeBuddy },
  { tool: 'kiro', sourceKey: 'kiro', label: 'Kiro', probe: probeKiro },
  { tool: 'grok', sourceKey: 'grok', label: 'Grok Build', probe: probeGrok },
  { tool: 'antigravity', sourceKey: 'antigravity', label: 'Antigravity', probe: probeAntigravity },
  { tool: 'roocode', sourceKey: 'roocode', label: 'Roo Code', probe: probeRooCode },
  { tool: 'zed', sourceKey: 'zed', label: 'Zed', probe: probeZed },
  { tool: 'zcode', sourceKey: 'zcode', label: 'ZCode', probe: probeZcode },
  { tool: 'goose', sourceKey: 'goose', label: 'Goose', probe: probeGoose },
  { tool: 'omp', sourceKey: 'omp', label: 'oh-my-pi', probe: probeOmp },
  { tool: 'pi', sourceKey: 'pi', label: 'pi', probe: probePi },
  { tool: 'craft', sourceKey: 'craft', label: 'Craft', probe: probeCraft },
  { tool: 'droid', sourceKey: 'droid', label: 'Droid', probe: probeDroid },
  { tool: 'trae', sourceKey: 'trae', label: 'Trae', probe: probeTrae },
] as const

// ── Public API ───────────────────────────────────────────────────────

/**
 * Discover all supported AI tools installed on this system.
 * Returns detection info for every known tool (including not-found ones).
 */
export function discoverTools(env: NodeJS.ProcessEnv = process.env): DetectedTool[] {
  const home = homedir()
  const config = loadConfig()
  const legacySources = config?.sources as Record<string, string | undefined> | undefined

  const ctx: ProbeContext = { home, env, legacySources }

  return TOOL_REGISTRY.map((entry) => {
    const path = entry.probe(ctx)
    if (!path) {
      return { tool: entry.tool, sourceKey: entry.sourceKey, label: entry.label, path: '', fileCount: 0, status: 'not_found' as const }
    }

    // Count data files for the detected path
    const detectedPaths = entry.sourceKey === 'opencode'
      && !envOverride('opencode', env)
      && !env.OPENCODE_DB
      && !legacySources?.['opencode']
      ? existingOpenCodeDbs(env).filter((dbPath) => existsSync(dbPath))
      : entry.sourceKey === 'codex'
        ? codexLogDirs(ctx, path)
        : [path]
    let fileCount = 0
    for (const detectedPath of detectedPaths) {
      try {
        const stat = statSync(detectedPath)
        if (stat.isDirectory()) {
          if (entry.sourceKey === 'roocode' || entry.sourceKey === 'kilocode') {
            fileCount += findJsonFiles(detectedPath).filter((p) => basename(p) === 'ui_messages.json').length
          } else if (entry.sourceKey === 'kelivo') {
            fileCount += findJsonFiles(detectedPath).filter((p) => basename(p) === 'chats.json').length
              + findZipFiles(detectedPath).length
          } else if (entry.sourceKey === 'kiro') {
            fileCount += unique([...findJsonlFiles(detectedPath), ...findJsonFiles(detectedPath)]).length
          } else {
            fileCount += findJsonlFiles(detectedPath).length
          }
        } else if (stat.isFile()) {
          fileCount += 1
        }
      } catch {}
    }

    const status = fileCount > 0 ? 'found' as const : 'empty' as const
    const visiblePaths = entry.sourceKey === 'codex'
      ? detectedPaths.filter((detectedPath) => existsSync(detectedPath))
      : detectedPaths
    return {
      tool: entry.tool,
      sourceKey: entry.sourceKey,
      label: entry.label,
      path,
      paths: visiblePaths.length > 1 || (entry.sourceKey === 'codex' && visiblePaths.length > 0) ? visiblePaths : undefined,
      fileCount,
      status,
    }
  })
}

/**
 * Discover JSONL log file paths for all detected tools.
 * This replaces the old discoverLogFiles(sources) function in parse.ts.
 */
export function discoverLogFiles(env: NodeJS.ProcessEnv = process.env): { tool: Tool; paths: string[] }[] {
  const home = homedir()
  const config = loadConfig()
  const legacySources = config?.sources as Record<string, string | undefined> | undefined

  const ctx: ProbeContext = { home, env, legacySources }
  const results: { tool: Tool; paths: string[] }[] = []

  // Claude Code
  const claudePath = probeClaudeCode(ctx)
  if (claudePath && existsSync(claudePath)) {
    const paths = findJsonlFiles(claudePath)
    if (paths.length > 0) results.push({ tool: 'claude-code', paths })
  }

  // Codex
  const codexPath = probeCodex(ctx)
  if (codexPath) {
    const paths = unique(
      codexLogDirs(ctx, codexPath)
        .filter((dir) => existsSync(dir))
        .flatMap((dir) => findJsonlFiles(dir))
    )
    if (paths.length > 0) results.push({ tool: 'codex', paths })
  }

  // OpenClaw — scan all agents under agents/*/sessions/
  const openclawPath = probeOpenClaw(ctx)
  if (openclawPath && existsSync(openclawPath)) {
    let paths: string[]
    const isCustom = envOverride('openclaw', ctx.env) || legacySources?.['openclaw']
    if (isCustom) {
      paths = findJsonlFiles(openclawPath).filter(p => !p.includes('.checkpoint.'))
    } else {
      paths = []
      try {
        const agentEntries = readdirSync(openclawPath, { withFileTypes: true })
        for (const agentEntry of agentEntries) {
          if (!agentEntry.isDirectory()) continue
          const sessionsDir = join(openclawPath, agentEntry.name, 'sessions')
          if (existsSync(sessionsDir)) {
            paths.push(...findJsonlFiles(sessionsDir).filter(p => !p.includes('.checkpoint.')))
          }
        }
      } catch {}
    }
    if (paths.length > 0) results.push({ tool: 'openclaw', paths })
  }

  // Qoder sessions
  const qoderPath = probeQoderSessions(ctx)
  if (qoderPath) {
    // Handle custom path normalization
    const override = envOverride('qoder', ctx.env) || legacySources?.['qoder']
    const dirs = override ? normalizeQoderPath(override) : defaultQoderSessionDirs(home)
    const paths = unique(
      dirs
        .filter((dir) => existsSync(dir))
        .flatMap((dir) => findQoderSegmentFiles(dir))
    )
    if (paths.length > 0) results.push({ tool: 'qoder', paths })
  }

  // Copilot OTEL
  const copilotPath = probeCopilot(ctx)
  if (copilotPath && existsSync(copilotPath)) {
    const paths: string[] = []
    try {
      const stat = statSync(copilotPath)
      if (stat.isDirectory()) {
        paths.push(...findJsonlFiles(copilotPath))
      } else if (stat.isFile()) {
        paths.push(copilotPath)
      }
    } catch {}
    // Also check COPILOT_OTEL_FILE_EXPORTER_PATH
    const envPath = ctx.env.COPILOT_OTEL_FILE_EXPORTER_PATH
    if (envPath && existsSync(envPath) && !paths.includes(envPath)) {
      paths.push(envPath)
    }
    if (paths.length > 0) results.push({ tool: 'copilot', paths: unique(paths) })
  }

  const jsonlSources: Array<{ tool: Tool; path: string | null; filter?: (path: string) => boolean }> = [
    { tool: 'gemini', path: probeGemini(ctx) },
    { tool: 'kimi', path: probeKimi(ctx), filter: (p) => basename(p) === 'wire.jsonl' },
    { tool: 'codebuddy', path: probeCodeBuddy(ctx) },
    { tool: 'kiro', path: kiroDevDataDir(ctx), filter: (p) => extname(p) === '.jsonl' || extname(p) === '.json' },
    { tool: 'kiro', path: kiroWorkspaceSessionsDir(ctx), filter: (p) => extname(p) === '.json' && basename(p) !== 'sessions.json' },
    { tool: 'grok', path: probeGrok(ctx), filter: (p) => extname(p) === '.jsonl' },
    { tool: 'antigravity', path: probeAntigravity(ctx) },
    { tool: 'omp', path: probeOmp(ctx) },
    { tool: 'pi', path: probePi(ctx) },
    { tool: 'craft', path: probeCraft(ctx) },
    { tool: 'droid', path: probeDroid(ctx) },
  ]

  for (const source of jsonlSources) {
    if (!source.path || !existsSync(source.path)) continue
    let paths = source.tool === 'kiro'
      ? [...findJsonlFiles(source.path), ...findJsonFiles(source.path)]
      : findJsonlFiles(source.path)
    if (source.filter) paths = paths.filter(source.filter)
    if (paths.length > 0) results.push({ tool: source.tool, paths: unique(paths) })
  }

  const roocodePath = probeRooCode(ctx)
  if (roocodePath && existsSync(roocodePath)) {
    const paths = findJsonFiles(roocodePath).filter((p) => basename(p) === 'ui_messages.json')
    if (paths.length > 0) results.push({ tool: 'roocode', paths: unique(paths) })
  }

  const kilocodeTaskPath = probeKiloTasks(ctx)
  if (kilocodeTaskPath && existsSync(kilocodeTaskPath)) {
    const paths = findJsonFiles(kilocodeTaskPath).filter((p) => basename(p) === 'ui_messages.json')
    if (paths.length > 0) results.push({ tool: 'kilocode', paths: unique(paths) })
  }

  const kelivoPath = probeKelivo(ctx)
  if (kelivoPath && existsSync(kelivoPath)) {
    const paths = statSync(kelivoPath).isDirectory()
      ? [...findJsonFiles(kelivoPath).filter((p) => basename(p) === 'chats.json'), ...findZipFiles(kelivoPath)]
      : basename(kelivoPath) === 'chats.json'
        || basename(kelivoPath).endsWith('.zip')
        ? [kelivoPath]
        : []
    if (paths.length > 0) results.push({ tool: 'kelivo', paths: unique(paths) })
  }

  // Cursor agent-transcript JSONL files (fallback for privacy mode)
  const cursorHome = join(ctx.home, '.cursor', 'projects')
  if (existsSync(cursorHome)) {
    const transcriptPaths = findCursorTranscriptFiles(cursorHome)
    if (transcriptPaths.length > 0) {
      // Merge with existing cursor paths if any, otherwise add new
      const existing = results.find(r => r.tool === 'cursor')
      if (existing) {
        existing.paths = unique([...existing.paths, ...transcriptPaths])
      } else {
        results.push({ tool: 'cursor', paths: transcriptPaths })
      }
    }
  }

  return results
}

function findCursorTranscriptFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const agentDir = join(dir, entry.name, 'agent-transcripts')
      if (!existsSync(agentDir)) continue
      try {
        const sessions = readdirSync(agentDir, { withFileTypes: true })
        for (const session of sessions) {
          if (!session.isDirectory()) continue
          const jsonlPath = join(agentDir, session.name, `${session.name}.jsonl`)
          if (existsSync(jsonlPath)) results.push(jsonlPath)
        }
      } catch {}
    }
  } catch {}
  return results
}

function findJsonFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findJsonFiles(fullPath))
      } else if (entry.isFile() && extname(entry.name) === '.json') {
        results.push(fullPath)
      }
    }
  } catch {}
  return results
}

function findZipFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findZipFiles(fullPath))
      } else if (entry.isFile() && extname(entry.name) === '.zip') {
        results.push(fullPath)
      }
    }
  } catch {}
  return results
}

function normalizeQoderPath(source: string): string[] {
  const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.endsWith('/logs/sessions') || normalized.endsWith('/sessions') || normalized.endsWith('/segments')) {
    return [source]
  }
  if (normalized.endsWith('/logs')) return [join(source, 'sessions')]
  return [join(source, 'logs', 'sessions')]
}

// ── DB path accessors (used by parse.ts for SQLite-based tools) ──────

export function getDbPath(sourceKey: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const config = loadConfig()
  const legacySources = config?.sources as Record<string, string | undefined> | undefined
  const ctx: ProbeContext = { home: homedir(), env, legacySources }

  const entry = TOOL_REGISTRY.find((e) => e.sourceKey === sourceKey)
  if (!entry) return null
  return entry.probe(ctx)
}

/**
 * Returns the tool registry for UI display purposes.
 */
export function getToolLabels(): { sourceKey: string; label: string }[] {
  return TOOL_REGISTRY.map(({ sourceKey, label }) => ({ sourceKey, label }))
}
