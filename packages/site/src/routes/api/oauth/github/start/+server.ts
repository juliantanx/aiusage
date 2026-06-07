import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const GET: RequestHandler = async ({ cookies }) => {
  const clientId = env.GITHUB_CLIENT_ID
  if (!clientId) return new Response('GitHub OAuth not configured', { status: 500 })

  const stateMaxAge = await getConfigValue(CFG.OAUTH_STATE_MAX_AGE_SECONDS)
  const state = nanoid(32)
  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: stateMaxAge
  })

  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const redirectUri = `${siteUrl}/api/oauth/github/callback`
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`

  throw redirect(302, url)
}
