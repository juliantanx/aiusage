import type { LayoutServerLoad } from './$types'
import { env } from '$env/dynamic/private'

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user ? {
      id: locals.user.id,
      username: locals.user.username,
      display_name: locals.user.display_name,
      avatar_url: locals.user.avatar_url,
      role: locals.user.role
    } : null,
    oauth: {
      github: !!env.GITHUB_CLIENT_ID,
      linuxDo: !!env.LINUX_DO_CLIENT_ID
    }
  }
}
