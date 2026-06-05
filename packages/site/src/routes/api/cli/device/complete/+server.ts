import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { nanoid } from 'nanoid'
import { sha256, generateDeviceSecret, encryptDeviceSecret } from '$lib/server/crypto/hmac.js'
import { createHash } from 'node:crypto'

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { device_request_id, device_verifier } = body

  if (!device_request_id || !device_verifier) {
    return json({ error: 'Missing required fields' }, { status: 400 })
  }

  const requests = await sql`
    SELECT id, device_challenge, user_id, device_name, status
    FROM device_auth_requests
    WHERE id = ${device_request_id}
  `
  const req = requests[0] as { id: string; device_challenge: string; user_id: string | null; device_name: string; status: string } | undefined

  if (!req) {
    return json({ error: 'Request not found', error_code: 'device_not_found' }, { status: 404 })
  }

  if (req.status !== 'approved') {
    return json({ error: 'Request not yet approved', pending: true }, { status: 202 })
  }

  if (!req.user_id) {
    return json({ error: 'Request has no user' }, { status: 400 })
  }

  // Verify PKCE challenge
  const computedChallenge = pkceChallenge(device_verifier)
  if (computedChallenge !== req.device_challenge) {
    return json({ error: 'Invalid verifier' }, { status: 400 })
  }

  // Generate device credentials
  const deviceId = nanoid()
  const deviceSecret = generateDeviceSecret()
  const secretEncrypted = encryptDeviceSecret(deviceSecret)
  const secretHash = sha256(deviceSecret)

  await sql`
    INSERT INTO user_devices (id, user_id, name, secret_encrypted, secret_hash, status)
    VALUES (${deviceId}, ${req.user_id}, ${req.device_name}, ${secretEncrypted}, ${secretHash}, 'active')
  `

  // Mark request as completed
  await sql`UPDATE device_auth_requests SET status = 'completed' WHERE id = ${device_request_id}`

  return json({
    device_id: deviceId,
    device_secret: deviceSecret
  })
}
