import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { consumeEmailVerificationToken } from '$lib/server/auth/email-verification.js'
import { maybeGrantAdmin } from '$lib/server/oauth/providers.js'

export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token')
  if (!token) {
    throw redirect(303, '/login?verified=invalid')
  }

  const result = await consumeEmailVerificationToken(token)
  if (!result) {
    throw redirect(303, '/login?verified=invalid')
  }

  await maybeGrantAdmin(result.userId, result.email)
  throw redirect(303, '/login?verified=1')
}
