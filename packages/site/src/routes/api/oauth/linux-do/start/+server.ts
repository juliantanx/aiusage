import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const GET: RequestHandler = async () => {
  const clientId = env.LINUX_DO_CLIENT_ID
  const authorizationUrl = env.LINUX_DO_AUTHORIZATION_URL
  if (!clientId || !authorizationUrl) return new Response('Linux Do OAuth not configured', { status: 500 })

  const stateMaxAge = await getConfigValue(CFG.OAUTH_STATE_MAX_AGE_SECONDS)
  const state = nanoid(32)
  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const isSecure = siteUrl.startsWith('https://')

  const redirectUri = `${siteUrl}/api/oauth/linux-do/callback`
  const authUrl = `${authorizationUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+profile+email&state=${state}`

  const cookieParts = [
    `oauth_state=${state}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${stateMaxAge}`,
  ]
  if (isSecure) cookieParts.push('Secure')

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      'Set-Cookie': cookieParts.join('; '),
    }
  })
}
