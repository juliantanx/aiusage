import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchLinuxDoProfile, findOrCreateOAuthUser, bindOAuthIdentity } from '$lib/server/oauth/providers.js'
import { createSession, getSessionCookie, getSessionUser } from '$lib/server/auth/session.js'
import { env } from '$env/dynamic/private'

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const savedState = cookies.get('oauth_state')

  if (!code || !state || state !== savedState) {
    return new Response('Invalid OAuth state', { status: 400 })
  }
  cookies.delete('oauth_state', { path: '/' })

  const clientId = env.LINUX_DO_CLIENT_ID
  const clientSecret = env.LINUX_DO_CLIENT_SECRET
  const tokenUrl = env.LINUX_DO_TOKEN_URL
  if (!clientId || !clientSecret || !tokenUrl) return new Response('Linux Do OAuth not configured', { status: 500 })

  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const redirectUri = `${siteUrl}/api/oauth/linux-do/callback`

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  })
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    return new Response(`Linux Do OAuth error: ${tokenData.error}`, { status: 400 })
  }

  const profile = await fetchLinuxDoProfile(tokenData.access_token)

  const existingSid = cookies.get('ai_session')
  if (existingSid) {
    const existingUser = await getSessionUser(existingSid)
    if (existingUser) {
      const result = await bindOAuthIdentity(existingUser.id, profile)
      throw redirect(302, result.error ? '/settings?error=bind_failed' : '/settings?bound=linux_do')
    }
  }

  const user = await findOrCreateOAuthUser(profile)
  const sid = await createSession(user.id)
  cookies.set('ai_session', sid, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 604800
  })

  throw redirect(302, '/leaderboard')
}
