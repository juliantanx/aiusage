import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

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
    // Ensure prefix ends with / and doesn't start with /
    this.prefix = config.prefix.replace(/^\/+/, '').replace(/\/?$/, '/')
    this.client = new S3Client({
      region: config.region ?? 'auto',
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
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
      if (!response.Body) return null
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
    let continuationToken: string | undefined

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(command)

      if (response.Contents) {
        for (const obj of response.Contents) {
          const key = obj.Key!
          const relPath = key.slice(this.prefix.length)
          if (relPath.endsWith('.ndjson')) {
            files.push(relPath)
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return files.sort()
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
}
