import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { destroySession } from '$lib/server/auth/session.js'

export const POST: RequestHandler = async ({ cookies }) => {
  const sid = cookies.get('ai_session')
  if (sid) {
    await destroySession(sid)
    cookies.delete('ai_session', { path: '/' })
  }
  return json({ success: true })
}
