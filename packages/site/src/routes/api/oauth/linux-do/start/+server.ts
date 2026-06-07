import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const GET: RequestHandler = async ({ cookies }) => {
  const clientId = env.LINUX_DO_CLIENT_ID
  const authUrl = env.LINUX_DO_AUTHORIZATION_URL
  if (!clientId || !authUrl) return new Response('Linux Do OAuth not configured', { status: 500 })

  const stateMaxAge = await getConfigValue(CFG.OAUTH_STATE_MAX_AGE_SECONDS)
  const state = nanoid(32)
  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const isSecure = siteUrl.startsWith('https://')

  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: stateMaxAge
  })
  const redirectUri = `${siteUrl}/api/oauth/linux-do/callback`
  const url = `${authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+profile+email&state=${state}`

  throw redirect(302, url)
}
