import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from 'svelte/compiler'

const source = readFileSync(new URL('../src/routes/settings/+page.svelte', import.meta.url), 'utf8')

describe('settings sync status', () => {
  it('shows the status the server reports instead of rebuilding the target key', () => {
    // The key includes the branch and the S3 prefix/endpoint
    // (`s3:usage?endpoint=...`). Rebuilding it from the form dropped those
    // fields, so a configuration with a custom endpoint or branch never
    // matched its own status and "Last sync" stayed "Never" after a sync.
    expect(source).not.toMatch(/\$\{syncData\.(repo|bucket)\}/)
    // The comment above names the old comparison; only code counts.
    const code = source.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/lastSyncTarget\s*===/)
    expect(source).not.toContain('displayedSyncStatus')
    expect(source).toContain('{formatSyncTime(syncStatusData?.lastSyncAt)}')
    expect(source).toContain('class:ok={syncStatusData?.lastSyncStatus ===')
  })

  it('still compiles', () => {
    expect(() => compile(source, { generate: false })).not.toThrow()
  })
})
