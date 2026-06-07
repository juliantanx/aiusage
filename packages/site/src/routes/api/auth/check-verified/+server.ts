import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'

export const GET: RequestHandler = async ({ url }) => {
  const email = url.searchParams.get('email')
  if (!email) {
    return json({ verified: false })
  }

  const rows = await sql`
    SELECT email_verified FROM users WHERE email = ${email} LIMIT 1
  `
  const user = rows[0] as { email_verified: boolean } | undefined
  return json({ verified: user?.email_verified ?? false })
}
