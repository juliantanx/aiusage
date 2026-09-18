import { describe, it, expect, vi, beforeEach } from 'vitest'
import { S3SyncBackend } from '../../src/sync/s3.js'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockSend })),
  GetObjectCommand: vi.fn((params) => params),
  PutObjectCommand: vi.fn((params) => params),
  HeadObjectCommand: vi.fn((params) => params),
  ListObjectsV2Command: vi.fn((params) => params),
  DeleteObjectCommand: vi.fn((params) => params),
  DeleteObjectsCommand: vi.fn((params) => params),
}))

// `DeleteObjects` answers 200 even when some keys could not be deleted; they
// come back in `Errors`. `aiusage clean --all` reports the wipe as complete on
// success, so a partial deletion must surface as a failure.

describe('S3SyncBackend.deleteAllData', () => {
  let backend: S3SyncBackend

  beforeEach(() => {
    mockSend.mockReset()
    backend = new S3SyncBackend({ bucket: 'b', prefix: 'aiusage/', accessKeyId: 'k', secretAccessKey: 's' })
  })

  const listing = { Contents: [{ Key: 'aiusage/x/2026/09/06.ndjson' }, { Key: 'aiusage/x/manifest.json' }], IsTruncated: false }

  it('returns the number of data files when every object was deleted', async () => {
    mockSend.mockResolvedValueOnce(listing).mockResolvedValueOnce({ Deleted: [] })
    await expect(backend.deleteAllData()).resolves.toBe(1)
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend.mock.calls[1][0].Delete.Objects).toEqual([{ Key: 'aiusage/x/2026/09/06.ndjson' }, { Key: 'aiusage/x/manifest.json' }])
  })

  it('leaves objects outside the sync layout alone when the prefix is shared', async () => {
    const shared = { ...listing, Contents: [...listing.Contents, { Key: 'aiusage/backup.tar' }, { Key: 'aiusage/x/notes/manifest.json' }] }
    mockSend.mockResolvedValueOnce(shared).mockResolvedValueOnce({ Deleted: [] })
    await expect(backend.deleteAllData()).resolves.toBe(1)
    expect(mockSend.mock.calls[1][0].Delete.Objects).toEqual([{ Key: 'aiusage/x/2026/09/06.ndjson' }, { Key: 'aiusage/x/manifest.json' }])
  })

  it('throws when the response reports per-object failures', async () => {
    mockSend.mockResolvedValueOnce(listing).mockResolvedValueOnce({
      Deleted: [{ Key: 'aiusage/x/2026/09/06.ndjson' }],
      Errors: [{ Key: 'aiusage/x/manifest.json', Code: 'AccessDenied', Message: 'Access Denied' }],
    })
    await expect(backend.deleteAllData()).rejects.toThrow("Could not delete 1 object(s) from the S3 sync target (first: 'x/manifest.json', AccessDenied: Access Denied).")
  })

  it('an empty Errors list is a success', async () => {
    mockSend.mockResolvedValueOnce(listing).mockResolvedValueOnce({ Errors: [] })
    await expect(backend.deleteAllData()).resolves.toBe(1)
  })
})
