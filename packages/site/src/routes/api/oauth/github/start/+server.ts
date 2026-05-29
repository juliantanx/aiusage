import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { nanoid } from 'nanoid'

export const GET: RequestHandler = async ({ cookies }) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) return new Response('GitHub OAuth not configured', { status: 500 })

  const state = nanoid(32)
  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600
  })

  const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
  const redirectUri = `${siteUrl}/api/oauth/github/callback`
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`

  throw redirect(302, url)
}
