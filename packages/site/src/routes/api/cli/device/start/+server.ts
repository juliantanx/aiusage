import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { nanoid } from 'nanoid'
import { sha256, generateUserCode } from '$lib/server/crypto/hmac.js'
import { env } from '$env/dynamic/private'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { device_name, cli_version, device_challenge } = body

  if (!device_name || !cli_version || !device_challenge) {
    return json({ error: 'Missing required fields' }, { status: 400 })
  }

  const authExpiryMinutes = await getConfigValue(CFG.DEVICE_AUTH_EXPIRY_MINUTES)
  const pollInterval = await getConfigValue(CFG.DEVICE_AUTH_POLL_INTERVAL_SECONDS)
  const id = nanoid()
  const userCode = generateUserCode()
  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const verificationUrl = `${siteUrl}/cli/authorize?code=${userCode}`
  const expiresAt = new Date(Date.now() + authExpiryMinutes * 60 * 1000)

  await sql`
    INSERT INTO device_auth_requests (id, device_challenge, user_code, verification_url, device_name, cli_version, status, expires_at)
    VALUES (${id}, ${device_challenge}, ${userCode}, ${verificationUrl}, ${device_name}, ${cli_version}, 'pending', ${expiresAt})
  `

  return json({
    device_request_id: id,
    user_code: userCode,
    verification_url: verificationUrl,
    expires_at: expiresAt.toISOString(),
    interval: pollInterval
  })
}
