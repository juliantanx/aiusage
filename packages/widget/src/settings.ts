import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

export interface WidgetSettings {
  theme: 'system' | 'light' | 'dark'
  refreshIntervalSec: number
  rangeDays: number
  showCost: boolean
  showHeatmap: boolean
  showTokenBreakdown: boolean
  locale: 'en' | 'zh'
}

const SETTINGS_PATH = join(homedir(), '.aiusage', 'widget-settings.json')

const DEFAULT_SETTINGS: WidgetSettings = {
  theme: 'system',
  refreshIntervalSec: 60,
  rangeDays: 30,
  showCost: true,
  showHeatmap: true,
  showTokenBreakdown: true,
  locale: 'en',
}

export function loadSettings(): WidgetSettings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
      return { ...DEFAULT_SETTINGS, ...raw }
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: WidgetSettings): void {
  const dir = join(homedir(), '.aiusage')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getDefaultSettings(): WidgetSettings {
  return { ...DEFAULT_SETTINGS }
}
