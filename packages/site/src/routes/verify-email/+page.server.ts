import type { PageServerLoad } from './$types'
import { consumeEmailVerificationToken } from '$lib/server/auth/email-verification.js'
import { maybeGrantAdmin } from '$lib/server/oauth/providers.js'

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token')
  if (!token) {
    return { success: false, error: 'invalid' }
  }

  const result = await consumeEmailVerificationToken(token)
  if (!result) {
    return { success: false, error: 'invalid' }
  }

  await maybeGrantAdmin(result.userId, result.email)
  return { success: true, error: null }
}
