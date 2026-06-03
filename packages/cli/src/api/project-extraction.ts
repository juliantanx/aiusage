import path from 'node:path'

// Workspace root directories that sit between the home dir and the actual project.
// The first path segment that is NOT in this set is treated as the project name.
const CWD_WORKSPACE_ROOTS = new Set([
  'WebstormProjects', 'Documents', 'Projects', 'workspace', 'Workspace',
  'dev', 'code', 'repos', 'Developer', 'src',
])

/**
 * Extract a project name from a full working-directory path.
 * Strips the home-directory prefix and any well-known workspace root directories,
 * then returns the first meaningful path segment as the project name.
 *
 * Examples:
 *   /Users/alice/WebstormProjects/my-project          → my-project
 *   /Users/alice/WebstormProjects/my-project/pkg/cli  → my-project
 *   /Users/alice/Documents/org-name/course/homework   → org-name
 *   /Users/alice/Documents/AppName/notes              → AppName
 */
export function extractProjectFromCwd(cwd: string): string {
  if (!cwd) return 'unknown'
  const normalized = cwd.replace(/\\/g, '/')
  // Strip home-dir prefix: /Users/<name>/, /home/<name>/, /root/, C:/Users/<name>/
  const withoutHome = normalized
    .replace(/^[A-Za-z]:\/(?:Users|home)\/[^/]+\//, '')
    .replace(/^\/(Users|home)\/[^/]+\//, '')
    .replace(/^\/root\//, '')
  const parts = withoutHome.split('/').filter(Boolean)
  for (const part of parts) {
    if (!CWD_WORKSPACE_ROOTS.has(part)) return part
  }
  return parts[parts.length - 1] ?? 'unknown'
}

const GENERIC_DIRECTORY_NAMES = new Set([
  'sessions',
  'session',
  'logs',
  'log',
  'data',
  'tmp',
  'temp',
  'cache',
  '.claude',
  '.codex',
  '.opencode',
  '.openclaw',
  '.qoder',
  '.kimi',
  '.kimi-code',
  '.codebuddy',
  '.kiro',
  '.grok',
  '.gemini',
  '.omp',
  '.pi',
  '.craft-agent',
  '.droid',
  'projects',
  'runs',
  'wire',
  'globalStorage',
  'dev_data',
])

const TOOL_DIRECTORY_NAMES = new Set(['agents', 'main'])

export function extractProject(sourceFile: string): string {
  if (!sourceFile) return 'unknown'
  return extractProjectFromClaudePath(sourceFile)
    ?? extractProjectFromKnownToolPath(sourceFile)
    ?? extractProjectFromGenericPath(sourceFile)
    ?? 'unknown'
}

/**
 * Decode an encoded project path (where `/` was replaced with `-`) into a
 * human-readable name. Known workspace roots (WebstormProjects, Documents, …)
 * are stripped and the remaining segments are joined with `/` so that
 * multi-level paths like `org/project` are preserved correctly.
 */
function decodeEncodedPath(raw: string): string {
  const parts = raw.split('-').filter(Boolean)

  const WORKSPACE_ROOTS = ['WebstormProjects', 'Documents', 'Projects', 'workspace', 'Workspace']
  for (const root of WORKSPACE_ROOTS) {
    const idx = parts.indexOf(root)
    if (idx >= 0 && idx < parts.length - 1) {
      return parts.slice(idx + 1).join('/')
    }
  }

  const meaningful = parts.filter(p => !looksMachineGenerated(p))
  if (meaningful.length === 0) return raw
  if (meaningful.length <= 3) return meaningful[meaningful.length - 1] ?? '~'
  return meaningful.slice(-2).join('/')
}

function extractProjectFromClaudePath(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, '/')
  const match = normalized.match(/\.claude\/projects\/([^/]+)/)
  if (!match) return null
  return decodeEncodedPath(match[1])
}

function extractProjectFromKnownToolPath(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, '/')

  const qoderSessionMatch = normalized.match(/\/\.qoder\/logs\/sessions\/([^/]+)\//)
  if (qoderSessionMatch) return decodeEncodedPath(qoderSessionMatch[1])

  const codeBuddyProjectMatch = normalized.match(/\/\.codebuddy\/projects\/([^/]+)\//)
  if (codeBuddyProjectMatch) return decodeEncodedPath(codeBuddyProjectMatch[1])

  const kimiSessionMatch = normalized.match(/\/\.kimi-code\/sessions\/([^/]+)\//)
  if (kimiSessionMatch) return decodeEncodedPath(kimiSessionMatch[1])

  const legacyKimiSessionMatch = normalized.match(/\/\.kimi\/sessions\/([^/]+)\//)
  if (legacyKimiSessionMatch) return decodeEncodedPath(legacyKimiSessionMatch[1])

  const taskMatch = normalized.match(/\/globalStorage\/(?:rooveterinaryinc\.roo-cline|kilocode\.kilo-code)\/tasks\/([^/]+)\//)
  if (taskMatch) return `task/${taskMatch[1]}`

  if (normalized.includes('/.openclaw/')) {
    const parts = normalized.split('/').filter(Boolean)
    const sessionsIndex = parts.indexOf('sessions')
    if (sessionsIndex > 1) {
      const candidate = parts[sessionsIndex - 1]
      if (!isSkippableDirectoryName(candidate)) return candidate
    }
  }

  if (normalized.includes('/.codex/') || normalized.includes('/.opencode/')) {
    return extractProjectFromGenericPath(normalized)
  }

  if (normalized.includes('/.qoder/logs/runs/')) {
    return 'unknown'
  }

  return null
}

function extractProjectFromGenericPath(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, '/')
  const directory = path.posix.dirname(normalized)
  const parts = directory.split('/').filter(Boolean)

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index]
    if (isSkippableDirectoryName(candidate)) continue
    if (looksMachineGenerated(candidate)) continue
    if (isPurelyNumeric(candidate)) {
      if (index > 0) {
        const parent = parts[index - 1]
        if (!isSkippableDirectoryName(parent) && !looksMachineGenerated(parent) && !isPurelyNumeric(parent)) {
          return `${parent}/${candidate}`
        }
      }
      continue  // no meaningful parent, skip this numeric segment
    }
    return candidate
  }

  return null
}

function isSkippableDirectoryName(name: string): boolean {
  return GENERIC_DIRECTORY_NAMES.has(name) || TOOL_DIRECTORY_NAMES.has(name)
}

function looksMachineGenerated(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(name)
    || /^[0-9a-f]{8,}$/i.test(name)
    || /^[0-9a-f-]{32,}$/i.test(name)
}

function isPurelyNumeric(name: string): boolean {
  return /^\d+$/.test(name)
}
