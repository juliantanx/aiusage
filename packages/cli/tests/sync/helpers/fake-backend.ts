import type { SyncBackend } from '../../../src/sync/index.js'

/**
 * In-memory file-based backend shared by several "devices" in a test, mimicking
 * a GitHub/S3 data directory: `<deviceInstanceId>/YYYY/MM/DD.ndjson`.
 */
export class FakeSyncBackend implements SyncBackend {
  readonly files = new Map<string, string>()
  readonly writes: Array<{ path: string; content: string }> = []
  readonly deletes: string[] = []
  flushCount = 0

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
    this.writes.push({ path, content })
  }

  /** Like GitHub/S3: list day files and namespace manifests. */
  async listFiles(): Promise<string[]> {
    return Array.from(this.files.keys()).filter(p => p.endsWith('.ndjson') || /^[^/]+\/manifest\.json$/.test(p)).sort()
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
    this.deletes.push(path)
  }

  async flush(): Promise<boolean> {
    this.flushCount++
    return true
  }

  /** Every path touched by a write or a delete, in order. */
  get mutations(): string[] {
    return [...this.writes.map(w => w.path), ...this.deletes]
  }

  /** Data files (not manifests) touched by a write or a delete. */
  get dataMutations(): string[] {
    return this.mutations.filter(p => p.endsWith('.ndjson'))
  }

  /** All parsed lines currently stored under a namespace. */
  linesUnder(deviceInstanceId: string): Array<Record<string, any>> {
    const out: Array<Record<string, any>> = []
    for (const [path, content] of this.files) {
      if (!path.startsWith(`${deviceInstanceId}/`) || !path.endsWith('.ndjson')) continue
      for (const line of content.split('\n').filter(Boolean)) out.push(JSON.parse(line))
    }
    return out
  }
}
