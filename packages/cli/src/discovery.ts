import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, isAbsolute } from 'node:path'
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
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return join(localAppData, 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
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
  { tool: 'kilocode', sourceKey: 'kilocode-db', label: 'KiloCode', probe: probeKiloDb },
  { tool: 'copilot', sourceKey: 'copilot', label: 'Copilot', probe: probeCopilot },
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
          fileCount += findJsonlFiles(detectedPath).length
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
