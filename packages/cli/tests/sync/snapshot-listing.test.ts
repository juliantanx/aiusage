import { describe, it, expect } from 'vitest'
import { isDayFilePath } from '../../src/sync/manifest.js'
import { listedOwners, ownerDataPaths } from '../../src/sync/snapshot.js'

// A listing includes day files and manifests. Only files inside a
// namespace folder are day files; a stray top-level file has no owner.

describe('day files in a listing', () => {
  it('are .ndjson files inside a namespace folder, manifests excluded', () => {
    expect(isDayFilePath('device-a/2026/09/06.ndjson')).toBe(true)
    expect(isDayFilePath('device-a/06.ndjson')).toBe(true)
    expect(isDayFilePath('device-a/manifest.json')).toBe(false)
    expect(isDayFilePath('device-a/2026/09/06.json')).toBe(false)
    expect(isDayFilePath('notes.ndjson')).toBe(false)
    expect(isDayFilePath('/06.ndjson')).toBe(false)
    expect(isDayFilePath('manifest.json')).toBe(false)
  })

  it('give a listing its owners, without inventing one for a stray file', () => {
    const listing = ['notes.ndjson', 'device-b/2026/09/06.ndjson', 'device-a/2026/09/07.ndjson', 'device-a/2026/09/06.ndjson', 'device-a/manifest.json', 'device-c/manifest.json', 'manifest.json', 'stray/subdir/manifest.json', 'readme.md']
    expect(listedOwners(listing)).toEqual(['device-a', 'device-b', 'device-c'])
    expect(ownerDataPaths('device-a', listing)).toEqual(['device-a/2026/09/06.ndjson', 'device-a/2026/09/07.ndjson'])
    expect(ownerDataPaths('notes.ndjson', listing)).toEqual([])
  })
})
