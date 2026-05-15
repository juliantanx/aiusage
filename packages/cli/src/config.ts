import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ConsentConfig } from './sync/consent.js'
import type { PriceEntry } from '@aiusage/core'

export const AIUSAGE_DIR = join(homedir(), '.aiusage')
export const CONFIG_PATH = join(AIUSAGE_DIR, 'config.json')

export const SYNC_FIELDS = [
  'ts', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens',
  'thinkingTokens', 'cost', 'costSource', 'tool', 'model', 'provider',
  'sessionKey', 'device', 'deviceInstanceId', 'updatedAt',
]

export interface SyncConfig {
  backend: 'github' | 's3'
  repo?: string
  bucket?: string
  prefix?: string
  endpoint?: string
  region?: string
  credentialRef?: string
}

export interface SourcesConfig {
  /** Custom path to Claude Code projects dir (default: ~/.claude/projects) */
  'claude-code'?: string
  /** Custom path to Codex sessions dir (default: ~/.codex/sessions) */
  'codex'?: string
  /** Custom path to OpenClaw sessions dir (default: ~/.openclaw/agents/main/sessions) */
  'openclaw'?: string
  /** Custom path to opencode.db file (default: platform-specific) */
  'opencode'?: string
}

export interface Config {
  sync?: SyncConfig
  device?: string
  platform?: string                    // 'win32' | 'darwin' | 'linux'
  retentionDays?: number
  parseInterval?: number
  dashboardPollInterval?: number
  credentials?: Record<string, string>
  priceOverrides?: Record<string, PriceEntry>
  /** Override default source paths for each AI tool */
  sources?: SourcesConfig
}

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function buildConsentConfig(config: Config): ConsentConfig | null {
  const sync = config.sync
  if (!sync) return null

  const backend = sync.backend
  const target = backend === 'github'
    ? sync.repo ?? ''
    : `${sync.bucket}/${sync.prefix ?? 'aiusage/'}`
  const endpoint = backend === 'github'
    ? 'https://api.github.com'
    : sync.endpoint ?? 'https://s3.amazonaws.com'
  const region = sync.region ?? 'global'

  return {
    backend,
    target,
    endpoint,
    region,
    fields: SYNC_FIELDS,
    operations: ['read', 'write'],
    schemaVersion: 'v1',
  }
}

export function loadCredential(key: string): string | null {
  const config = loadConfig()
  if (!config?.credentials) return null
  return config.credentials[key] ?? null
}

export function saveCredential(key: string, value: string): void {
  const config = loadConfig() ?? {}
  if (!config.credentials) config.credentials = {}
  config.credentials[key] = value
  saveConfig(config)
}
