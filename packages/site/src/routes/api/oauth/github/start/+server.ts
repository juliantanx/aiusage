import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const GET: RequestHandler = async () => {
  const clientId = env.GITHUB_CLIENT_ID
  if (!clientId) return new Response('GitHub OAuth not configured', { status: 500 })

  const stateMaxAge = await getConfigValue(CFG.OAUTH_STATE_MAX_AGE_SECONDS)
  const state = nanoid(32)
  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const isSecure = siteUrl.startsWith('https://')

  const redirectUri = `${siteUrl}/api/oauth/github/callback`
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`

  const cookieParts = [
    `oauth_state=${state}`,
    'Path=/',
    'HttpOnly',
    `SameSite=Lax`,
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
