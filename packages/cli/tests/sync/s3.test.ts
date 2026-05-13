import { describe, it, expect, vi, beforeEach } from 'vitest'
import { S3SyncBackend } from '../../src/sync/s3.js'

// Mock AWS SDK
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockSend })),
  GetObjectCommand: vi.fn((params) => params),
  PutObjectCommand: vi.fn((params) => params),
  HeadObjectCommand: vi.fn((params) => params),
}))

describe('S3SyncBackend', () => {
  let backend: S3SyncBackend

  beforeEach(() => {
    mockSend.mockReset()
    backend = new S3SyncBackend({
      bucket: 'test-bucket',
      prefix: 'aiusage/',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      endpoint: 'https://test.r2.cloudflarestorage.com',
      region: 'auto',
    })
  })

  it('constructs correct object key', () => {
    expect(backend.getObjectKey('2026/05.ndjson')).toBe('aiusage/2026/05.ndjson')
  })

  it('strips leading slashes from prefix', () => {
    const b = new S3SyncBackend({
      bucket: 'bucket',
      prefix: '/my-prefix/',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    expect(b.getObjectKey('test.ndjson')).toBe('my-prefix/test.ndjson')
  })

  it('reads file and returns content with etag', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: () => Promise.resolve('{"id":"r1"}\n') },
      ETag: '"abc123"',
    })

    const result = await backend.readFile('2026/05.ndjson')
    expect(result).not.toBeNull()
    expect(result!.content).toBe('{"id":"r1"}\n')
    expect(result!.sha).toBe('abc123')
  })

  it('returns null for non-existent file', async () => {
    mockSend.mockRejectedValueOnce({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })

    const result = await backend.readFile('2026/05.ndjson')
    expect(result).toBeNull()
  })

  it('throws on non-404 errors', async () => {
    mockSend.mockRejectedValueOnce({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })

    await expect(backend.readFile('2026/05.ndjson')).rejects.toThrow()
  })

  it('writes file with content type', async () => {
    mockSend.mockResolvedValueOnce({})

    await backend.writeFile('2026/05.ndjson', '{"id":"r1"}\n')
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'aiusage/2026/05.ndjson',
        Body: '{"id":"r1"}\n',
        ContentType: 'application/x-ndjson',
      })
    )
  })

  it('writes file with IfMatch for optimistic locking', async () => {
    mockSend.mockResolvedValueOnce({})

    await backend.writeFile('2026/05.ndjson', '{"id":"r1"}\n', 'abc123')
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        IfMatch: '"abc123"',
      })
    )
  })

  it('writes file without IfMatch when no sha', async () => {
    mockSend.mockResolvedValueOnce({})

    await backend.writeFile('2026/05.ndjson', '{"id":"r1"}\n')
    expect(mockSend).toHaveBeenCalledWith(
      expect.not.objectContaining({ IfMatch: expect.anything() })
    )
  })

  it('checks file existence', async () => {
    mockSend.mockResolvedValueOnce({})
    expect(await backend.fileExists('2026/05.ndjson')).toBe(true)
  })

  it('returns false for non-existent file', async () => {
    mockSend.mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
    expect(await backend.fileExists('2026/05.ndjson')).toBe(false)
  })
})
