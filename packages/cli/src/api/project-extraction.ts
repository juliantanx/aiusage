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
  'projects',
])

const TOOL_DIRECTORY_NAMES = new Set(['agents', 'main'])

export function extractProject(sourceFile: string): string {
  if (!sourceFile) return 'unknown'
  return extractProjectFromClaudePath(sourceFile)
    ?? extractProjectFromKnownToolPath(sourceFile)
    ?? extractProjectFromGenericPath(sourceFile)
    ?? 'unknown'
}

function extractProjectFromClaudePath(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, '/')
  const match = normalized.match(/\.claude\/projects\/([^/]+)/)
  if (!match) return null

  const raw = match[1]
  const parts = raw.split('-').filter(Boolean)
  const webstormIndex = parts.indexOf('WebstormProjects')
  if (webstormIndex >= 0 && webstormIndex < parts.length - 1) return parts.slice(webstormIndex + 1).join('-')

  const documentsIndex = parts.indexOf('Documents')
  if (documentsIndex >= 0 && documentsIndex < parts.length - 1) return parts.slice(documentsIndex + 1).join('-')

  if (parts.length <= 3) return '~'
  return parts.slice(-2).join('-') || raw
}

function extractProjectFromKnownToolPath(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, '/')

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
    return candidate
  }

  return null
}

function isSkippableDirectoryName(name: string): boolean {
  return GENERIC_DIRECTORY_NAMES.has(name) || TOOL_DIRECTORY_NAMES.has(name)
}

function looksMachineGenerated(name: string): boolean {
  return /^\d{4}$/.test(name)
    || /^\d{2}$/.test(name)
    || /^[0-9a-f]{8,}$/i.test(name)
    || /^[0-9a-f-]{32,}$/i.test(name)
}
