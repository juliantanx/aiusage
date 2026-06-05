import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from '$env/dynamic/private'

function getClient(): S3Client {
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 storage not configured: missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })
}

function getBucket(): string {
  return env.R2_BUCKET || 'aiusage'
}

function getPublicUrl(): string {
  return env.R2_PUBLIC_URL || `https://${env.R2_ACCOUNT_ID}.r2.dev`
}

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getClient()
  await client.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }))
  return `${getPublicUrl()}/${key}`
}

export async function deleteFile(key: string): Promise<void> {
  const client = getClient()
  await client.send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key
  }))
}

export function extractKeyFromUrl(url: string): string | null {
  const publicUrl = getPublicUrl()
  if (url.startsWith(publicUrl)) {
    return url.slice(publicUrl.length + 1)
  }
  return null
}
