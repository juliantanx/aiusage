import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchGitHubProfile, findOrCreateOAuthUser, bindOAuthIdentity } from '$lib/server/oauth/providers.js'
import { createSession, getSessionUser, setSessionCookie } from '$lib/server/auth/session.js'
import { env } from '$env/dynamic/private'

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const savedState = cookies.get('oauth_state')

  if (!code || !state || state !== savedState) {
    return new Response('Invalid OAuth state', { status: 400 })
  }
  cookies.delete('oauth_state', { path: '/' })

  const clientId = env.GITHUB_CLIENT_ID
  const clientSecret = env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return new Response('GitHub OAuth not configured', { status: 500 })

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  })
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    return new Response(`GitHub OAuth error: ${tokenData.error}`, { status: 400 })
  }

  const profile = await fetchGitHubProfile(tokenData.access_token)

  // Check if user is already logged in (binding flow)
  const existingSid = cookies.get('ai_session')
  if (existingSid) {
    const existingUser = await getSessionUser(existingSid)
    if (existingUser) {
      const result = await bindOAuthIdentity(existingUser.id, profile, tokenData.access_token)
      throw redirect(302, result.error ? '/settings?error=bind_failed' : '/settings?bound=github')
    }
  }

  const user = await findOrCreateOAuthUser(profile, tokenData.access_token)
  const sid = await createSession(user.id)
  await setSessionCookie(cookies, sid)

  throw redirect(302, '/leaderboard')
}
