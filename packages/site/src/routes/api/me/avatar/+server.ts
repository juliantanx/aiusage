import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '$lib/server/storage/r2.js'
import { getConfigValue, CFG } from '$lib/server/config.js'
import sharp from 'sharp'
import { nanoid } from 'nanoid'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export const POST: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const maxSize = await getConfigValue(CFG.AVATAR_MAX_FILE_SIZE)
  const avatarSize = await getConfigValue(CFG.AVATAR_OUTPUT_SIZE)
  const avatarQuality = await getConfigValue(CFG.AVATAR_QUALITY)

  const contentType = event.request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const formData = await event.request.formData()
  const file = formData.get('avatar')

  if (!file || !(file instanceof File)) {
    return json({ error: 'No avatar file provided' }, { status: 400 })
  }

  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024)
    return json({ error: `File too large (max ${maxMB}MB)` }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return json({ error: 'Failed to read uploaded file' }, { status: 400 })
  }

  // Resize and compress to WebP
  let processed: Buffer
  try {
    processed = await sharp(buffer)
      .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
      .webp({ quality: avatarQuality })
      .toBuffer()
  } catch (err) {
    console.error('Avatar image processing failed:', err)
    return json({ error: 'Failed to process image. The file may be corrupted or in an unsupported format.' }, { status: 400 })
  }

  // Delete old avatar from R2 if exists
  const oldRows = await sql`SELECT avatar_url FROM users WHERE id = ${user.id}`
  const oldUrl = (oldRows[0] as { avatar_url: string | null })?.avatar_url
  if (oldUrl) {
    const oldKey = extractKeyFromUrl(oldUrl)
    if (oldKey) {
      try { await deleteFile(oldKey) } catch { /* ignore */ }
    }
  }

  // Upload new avatar
  const key = `avatars/${user.id}/${nanoid(8)}.webp`
  let avatarUrl: string
  try {
    avatarUrl = await uploadFile(key, processed, 'image/webp')
  } catch (err) {
    console.error('Avatar R2 upload failed:', err)
    return json({ error: 'Failed to store avatar. Please try again later.' }, { status: 500 })
  }

  // Update user record
  try {
    await sql`UPDATE users SET avatar_url = ${avatarUrl}, updated_at = NOW() WHERE id = ${user.id}`
  } catch (err) {
    console.error('Avatar DB update failed:', err)
    return json({ error: 'Failed to save avatar reference. Please try again.' }, { status: 500 })
  }

  return json({ avatar_url: avatarUrl })
}

export const DELETE: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const rows = await sql`SELECT avatar_url FROM users WHERE id = ${user.id}`
  const avatarUrl = (rows[0] as { avatar_url: string | null })?.avatar_url

  if (avatarUrl) {
    const key = extractKeyFromUrl(avatarUrl)
    if (key) {
      try { await deleteFile(key) } catch { /* ignore */ }
    }
  }

  await sql`UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = ${user.id}`

  return json({ avatar_url: null })
}
