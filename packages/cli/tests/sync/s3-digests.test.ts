import { describe, it, expect, vi, beforeEach } from 'vitest'
import { S3SyncBackend } from '../../src/sync/s3.js'
import { contentDigest, serializeSnapshot } from '../../src/sync/index.js'

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

// S3/R2 ETags of single-part PUTs are the hex MD5 of the object, so the
// listing alone tells the orchestrator which day files already match the
// local snapshot — no GET per file on a no-op sync.

describe('S3SyncBackend.listFileDigests', () => {
  let backend: S3SyncBackend

  beforeEach(() => {
    mockSend.mockReset()
    backend = new S3SyncBackend({ bucket: 'b', prefix: 'aiusage/', accessKeyId: 'k', secretAccessKey: 's' })
  })

  it('returns md5 digests from ETags and skips multipart ETags and non-ndjson keys', async () => {
    const content = serializeSnapshot([{ id: 'r1', ts: 1, updatedAt: 1 } as any])
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'aiusage/dev/2026/09/06.ndjson', ETag: `"${contentDigest(content)}"` },
        { Key: 'aiusage/dev/2026/09/07.ndjson', ETag: '"abc123-2"' },
        { Key: 'aiusage/README.md', ETag: '"d41d8cd98f00b204e9800998ecf8427e"' },
      ],
      IsTruncated: false,
    })

    const digests = await backend.listFileDigests()
    expect(digests.get('dev/2026/09/06.ndjson')).toBe(contentDigest(content))
    expect(digests.has('dev/2026/09/07.ndjson')).toBe(false)
    expect(digests.has('README.md')).toBe(false)
  })

  it('follows pagination', async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'aiusage/a/1.ndjson', ETag: '"' + 'a'.repeat(32) + '"' }], IsTruncated: true, NextContinuationToken: 'next' })
      .mockResolvedValueOnce({ Contents: [{ Key: 'aiusage/b/1.ndjson', ETag: '"' + 'b'.repeat(32) + '"' }], IsTruncated: false })
    const digests = await backend.listFileDigests()
    expect([...digests.keys()].sort()).toEqual(['a/1.ndjson', 'b/1.ndjson'])
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
