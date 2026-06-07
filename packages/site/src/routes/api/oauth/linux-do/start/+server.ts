import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { saveOAuthState } from '$lib/server/oauth/state-store.js'

export const GET: RequestHandler = async () => {
  const clientId = env.LINUX_DO_CLIENT_ID
  const authorizationUrl = env.LINUX_DO_AUTHORIZATION_URL
  if (!clientId || !authorizationUrl) return new Response('Linux Do OAuth not configured', { status: 500 })

  const state = nanoid(32)
  saveOAuthState(state)

  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const redirectUri = `${siteUrl}/api/oauth/linux-do/callback`
  const authUrl = `${authorizationUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+profile+email&state=${state}`

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl }
  })
}
