import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'
import { env } from '$env/dynamic/private'
import { saveOAuthState } from '$lib/server/oauth/state-store.js'

export const GET: RequestHandler = async () => {
  const clientId = env.GITHUB_CLIENT_ID
  if (!clientId) return new Response('GitHub OAuth not configured', { status: 500 })

  const state = nanoid(32)
  saveOAuthState(state)

  const siteUrl = env.SITE_URL || 'http://localhost:5173'
  const redirectUri = `${siteUrl}/api/oauth/github/callback`
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl }
  })
}
