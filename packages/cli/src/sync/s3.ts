import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { normalizeS3Prefix } from './target.js'

export interface S3Config {
  bucket: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  region?: string
}

export class S3SyncBackend {
  private client: S3Client
  private bucket: string
  private prefix: string

  constructor(config: S3Config) {
    this.bucket = config.bucket
    // Ensure prefix ends with / and doesn't start with / (the same
    // normalisation the sync target key applies, so both name the same store).
    this.prefix = normalizeS3Prefix(config.prefix)
    this.client = new S3Client({
      region: config.region ?? 'auto',
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  getObjectKey(path: string): string {
    return `${this.prefix}${path}`
  }

  async readFile(path: string): Promise<string | null> {
    const key = this.getObjectKey(path)
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      const response = await this.client.send(command)
      if (!response.Body) throw new Error('S3 GetObject returned no body.')
      return await response.Body.transformToString('utf-8')
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null
      }
      throw error
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const key = this.getObjectKey(path)
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: 'application/x-ndjson',
    })
    await this.client.send(command)
  }

  async listFiles(): Promise<string[]> {
    const files: string[] = []
    for (const entry of await this.listEntries()) {
      if (entry.path.endsWith('.ndjson') || /^[^/]+\/manifest\.json$/.test(entry.path)) files.push(entry.path)
    }
    return files.sort()
  }

  /**
   * Content digests from the listing: for single-part uploads (which is all
   * this backend ever writes) the S3/R2 ETag is the hex MD5 of the object.
   * Multipart ETags (containing '-') are not digests and are left out, so the
   * orchestrator falls back to reading those files.
   */
  async listFileDigests(): Promise<Map<string, string>> {
    const digests = new Map<string, string>()
    for (const entry of await this.listEntries()) {
      if (!entry.path.endsWith('.ndjson')) continue
      const etag = entry.etag?.replace(/^"|"$/g, '')
      if (etag && /^[0-9a-f]{32}$/i.test(etag)) digests.set(entry.path, etag.toLowerCase())
    }
    return digests
  }

  /** Every object under the prefix (data files and namespace manifests alike). */
  private async listEntries(): Promise<Array<{ path: string; etag?: string }>> {
    const entries: Array<{ path: string; etag?: string }> = []
    let continuationToken: string | undefined
    const seenTokens = new Set<string>()

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(command)

      if (typeof response.IsTruncated !== 'boolean'
        || (response.Contents !== undefined && !Array.isArray(response.Contents))) {
        throw new Error('S3 returned an invalid object listing.')
      }
      if (response.Contents) {
        for (const obj of response.Contents) {
          const key = obj?.Key
          if (typeof key !== 'string' || !key.startsWith(this.prefix)) {
            throw new Error('S3 returned an invalid object key in its listing.')
          }
          const relPath = key.slice(this.prefix.length)
          if (relPath) entries.push({ path: relPath, etag: obj.ETag })
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
      if (response.IsTruncated) {
        if (typeof continuationToken !== 'string' || !continuationToken.trim() || seenTokens.has(continuationToken)) {
          throw new Error('S3 listing is truncated without a progressing continuation token.')
        }
        seenTokens.add(continuationToken)
      }
    } while (continuationToken)

    return entries
  }

  async fileExists(path: string): Promise<boolean> {
    const key = this.getObjectKey(path)
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      await this.client.send(command)
      return true
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw error
    }
  }

  async deleteFile(path: string): Promise<void> {
    const key = this.getObjectKey(path)
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    await this.client.send(command)
  }

  /**
   * Remove every file of the sync layout under the prefix — day files and
   * namespace manifests, exactly what `listFiles` reports. Anything else a
   * shared prefix may hold was not written by this backend and is left
   * alone. Returns the number of data files removed.
   *
   * `DeleteObjects` succeeds as a request even when individual keys could
   * not be deleted; those come back in `Errors`. A wipe that silently left
   * objects behind would be reported as complete while peers keep mirroring
   * them, so any per-object failure is thrown.
   */
  async deleteAllData(): Promise<number> {
    const files = await this.listFiles()
    if (files.length === 0) return 0

    // Delete in batches of 1000 (S3 limit)
    const BATCH_SIZE = 1000
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: batch.map(f => ({ Key: this.getObjectKey(f) })),
          Quiet: true,
        },
      })
      const response = await this.client.send(command)
      const errors = response.Errors ?? []
      if (errors.length > 0) {
        const first = errors[0]
        const key = first.Key ? first.Key.slice(this.prefix.length) : 'unknown key'
        const detail = [first.Code, first.Message].filter(Boolean).join(': ')
        throw new Error(`Could not delete ${errors.length} object(s) from the S3 sync target (first: '${key}'${detail ? `, ${detail}` : ''}).`)
      }
    }

    return files.filter(f => f.endsWith('.ndjson')).length
  }
}
