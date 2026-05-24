import path from 'node:path'

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
  'projects',
  'runs',
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
