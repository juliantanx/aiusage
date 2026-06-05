import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '$lib/server/storage/r2.js'
import sharp from 'sharp'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB raw upload limit
const AVATAR_SIZE = 256 // output 256x256
const AVATAR_QUALITY = 80
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export const POST: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const contentType = event.request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const formData = await event.request.formData()
  const file = formData.get('avatar')

  if (!file || !(file instanceof File)) {
    return json({ error: 'No avatar file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Resize and compress to WebP
  const processed = await sharp(buffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: AVATAR_QUALITY })
    .toBuffer()

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
  const avatarUrl = await uploadFile(key, processed, 'image/webp')

  // Update user record
  await sql`UPDATE users SET avatar_url = ${avatarUrl}, updated_at = NOW() WHERE id = ${user.id}`

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
