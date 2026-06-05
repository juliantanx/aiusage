import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { MAX_PAYLOAD_SIZE, validatePayload, verifyUploadRequest, processUpload } from '$lib/server/uploads/verify.js'

export const POST: RequestHandler = async (event) => {
  const request = event.request
  // Check Content-Type
  const contentType = request.headers.get('Content-Type')
  if (!contentType || !contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  // Check payload size
  const bodyText = await request.text()
  if (bodyText.length > MAX_PAYLOAD_SIZE) {
    return json({ error: 'Payload too large', error_code: 'payload_too_large' }, { status: 413 })
  }

  // Parse and validate
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validation = validatePayload(body)
  if (!validation.valid) {
    return json({ error: validation.error, error_code: validation.error_code }, { status: 400 })
  }

  // Verify HMAC signature
  const verification = await verifyUploadRequest(request, bodyText)
  if (!verification.valid) {
    const status = verification.error_code === 'rate_limited' ? 429 : 401
    return json({ error: verification.error, error_code: verification.error_code }, { status })
  }

  // Process upload
  let ip: string
  try {
    ip = event.getClientAddress()
  } catch {
    ip = '127.0.0.1'
  }
  const result = await processUpload(verification.userId!, verification.deviceId!, verification.idempotencyKey!, body as Parameters<typeof processUpload>[3], ip)

  return json(result)
}
