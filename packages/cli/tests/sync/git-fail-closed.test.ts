import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
}))

import { readFile, readdir, stat, unlink } from 'node:fs/promises'
import { GitSyncBackend } from '../../src/sync/git.js'

const mockReadFile = vi.mocked(readFile)
const mockReaddir = vi.mocked(readdir)
const mockStat = vi.mocked(stat)
const mockUnlink = vi.mocked(unlink)

const errno = (code: string) => Object.assign(new Error(`${code}: /secret/absolute/path`), { code })
const CACHE = '/home/user/.aiusage/sync-repo'

// The orchestrator prunes local rows against what the backend reports, so
// only a confirmed "no such file" may read as absence. Every other failure
// must surface as an error (without leaking the absolute cache path).

describe('GitSyncBackend fails closed on cache I/O errors', () => {
  let backend: GitSyncBackend

  beforeEach(() => {
    vi.clearAllMocks()
    backend = new GitSyncBackend({ repo: 'u/r', token: 't', cacheDir: CACHE })
  })

  it('readFile returns null only for ENOENT', async () => {
    mockReadFile.mockRejectedValueOnce(errno('ENOENT'))
    await expect(backend.readFile('dev/2026/09/06.ndjson')).resolves.toBeNull()
  })

  it('readFile and listFiles treat ENOTDIR (a file where a directory is expected) as corruption, not absence', async () => {
    mockReadFile.mockRejectedValueOnce(errno('ENOTDIR'))
    await expect(backend.readFile('dev/manifest.json')).rejects.toThrow("Cannot read 'dev/manifest.json' in the GitHub sync cache (ENOTDIR)")
    mockStat.mockRejectedValueOnce(errno('ENOTDIR'))
    await expect(backend.listFiles()).rejects.toThrow("Cannot list 'data' in the GitHub sync cache (ENOTDIR)")
    mockUnlink.mockRejectedValueOnce(errno('ENOTDIR'))
    await expect(backend.deleteFile('dev/x.ndjson')).rejects.toThrow("Cannot delete 'dev/x.ndjson' in the GitHub sync cache (ENOTDIR)")
  })

  it('readFile throws for permission and I/O errors', async () => {
    for (const code of ['EACCES', 'EPERM', 'EIO', 'EISDIR', 'EMFILE']) {
      mockReadFile.mockRejectedValueOnce(errno(code))
      const promise = backend.readFile('dev/2026/09/06.ndjson')
      await expect(promise).rejects.toThrow(`Cannot read 'dev/2026/09/06.ndjson' in the GitHub sync cache (${code})`)
      await promise.catch((e: Error) => {
        expect(e.message).not.toContain('/secret/absolute/path')
        expect(e.message).not.toContain(CACHE)
      })
    }
  })

  it('listFiles is empty only when the data directory does not exist', async () => {
    mockStat.mockRejectedValueOnce(errno('ENOENT'))
    await expect(backend.listFiles()).resolves.toEqual([])
    expect(mockReaddir).not.toHaveBeenCalled()
  })

  it('listFiles throws when the data directory cannot be inspected or walked', async () => {
    mockStat.mockRejectedValueOnce(errno('EACCES'))
    await expect(backend.listFiles()).rejects.toThrow("Cannot list 'data' in the GitHub sync cache (EACCES)")

    mockStat.mockResolvedValueOnce({} as any)
    mockReaddir.mockResolvedValueOnce([
      { name: 'dev', isDirectory: () => true },
    ] as any)
    mockReaddir.mockRejectedValueOnce(errno('EIO'))
    await expect(backend.listFiles()).rejects.toThrow("Cannot list 'data' in the GitHub sync cache (EIO)")
  })

  it('listFiles walks a healthy tree', async () => {
    mockStat.mockResolvedValueOnce({} as any)
    mockReaddir
      .mockResolvedValueOnce([{ name: 'dev', isDirectory: () => true }] as any)
      .mockResolvedValueOnce([
        { name: '2026-09-06.ndjson', isDirectory: () => false },
        { name: 'manifest.json', isDirectory: () => false },
      ] as any)
    await expect(backend.listFiles()).resolves.toEqual(['dev/2026-09-06.ndjson', 'dev/manifest.json'])
  })

  it('deleteFile ignores a missing file but surfaces other failures', async () => {
    mockUnlink.mockRejectedValueOnce(errno('ENOENT'))
    await expect(backend.deleteFile('dev/x.ndjson')).resolves.toBeUndefined()
    mockUnlink.mockRejectedValueOnce(errno('EPERM'))
    await expect(backend.deleteFile('dev/x.ndjson')).rejects.toThrow("Cannot delete 'dev/x.ndjson' in the GitHub sync cache (EPERM)")
  })
})
