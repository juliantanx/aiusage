import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { splitSettingsSources } from '../src/lib/settings-sources.js'

const settingsSource = readFileSync(
  fileURLToPath(new URL('../src/routes/settings/+page.svelte', import.meta.url)),
  'utf8',
)

describe('settings source grouping', () => {
  it('separates manual import tools from auto-detected tools', () => {
    const tools = [
      { sourceKey: 'claude-code', label: 'Claude Code', status: 'found' },
      { sourceKey: 'kelivo', label: 'Kelivo', status: 'not_found' },
      { sourceKey: 'cursor', label: 'Cursor', status: 'not_found' },
    ]

    const groups = splitSettingsSources(tools)

    expect(groups.manualImportTools.map((tool) => tool.sourceKey)).toEqual(['kelivo'])
    expect(groups.activeDetectedTools.map((tool) => tool.sourceKey)).toEqual(['claude-code'])
    expect(groups.notFoundDetectedTools.map((tool) => tool.sourceKey)).toEqual(['cursor'])
  })

  it('renders manual imports inside the Data Sources section', () => {
    const dataSourcesIndex = settingsSource.indexOf('<!-- Data Sources -->')
    const manualImportsIndex = settingsSource.indexOf('settings.manualImports')
    const detectedToolsIndex = settingsSource.indexOf('settings.detectedTools')
    const syncIndex = settingsSource.indexOf('<!-- Sync -->')

    expect(dataSourcesIndex).toBeGreaterThanOrEqual(0)
    expect(manualImportsIndex).toBeGreaterThan(dataSourcesIndex)
    expect(detectedToolsIndex).toBeGreaterThan(manualImportsIndex)
    expect(syncIndex).toBeGreaterThan(detectedToolsIndex)
  })
})
