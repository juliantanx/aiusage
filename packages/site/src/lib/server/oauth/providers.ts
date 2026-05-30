import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'
import type { SessionUser } from '../auth/session.js'
import { env } from '$env/dynamic/private'

export interface OAuthProfile {
  provider: string
  providerUserId: string
  username: string
  email: string | null
  emailVerified: boolean
  avatarUrl: string | null
  rawProfile: Record<string, unknown>
}

export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<SessionUser> {
  // 1. Check if identity already exists
  const existing = await sql`
    SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role, u.status
    FROM user_identities ui
    JOIN users u ON u.id = ui.user_id
    WHERE ui.provider = ${profile.provider} AND ui.provider_user_id = ${profile.providerUserId}
  `

  if (existing[0]) {
    return existing[0] as SessionUser
  }

  // 2. Try auto-merge by verified email
  if (profile.email && profile.emailVerified) {
    const emailUser = await sql`
      SELECT id, username, email, display_name, avatar_url, role, status
      FROM users
      WHERE email = ${profile.email} AND email_verified = TRUE
    `
    if (emailUser[0]) {
      const user = emailUser[0] as SessionUser
      await sql`
        INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_username, email, email_verified, raw_profile)
        VALUES (${nanoid()}, ${user.id}, ${profile.provider}, ${profile.providerUserId}, ${profile.username}, ${profile.email}, ${profile.emailVerified}, ${JSON.stringify(profile.rawProfile)})
      `
      return user
    }
  }

  // 3. Create new user
  const userId = nanoid()
  let username = profile.username
  const existingUsername = await sql`SELECT id FROM users WHERE username = ${username}`
  if (existingUsername[0]) {
    username = `${username}-${nanoid(4)}`
  }

  const displayName = profile.username
  await sql`
    INSERT INTO users (id, username, email, email_verified, display_name, avatar_url, role, status)
    VALUES (${userId}, ${username}, ${profile.email || `${username}@placeholder.local`}, ${profile.emailVerified}, ${displayName}, ${profile.avatarUrl}, 'user', 'active')
  `

  await sql`
    INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_username, email, email_verified, raw_profile)
    VALUES (${nanoid()}, ${userId}, ${profile.provider}, ${profile.providerUserId}, ${profile.username}, ${profile.email}, ${profile.emailVerified}, ${JSON.stringify(profile.rawProfile)})
  `

  // Check admin emails
  if (profile.email && profile.emailVerified) {
    await maybeGrantAdmin(userId, profile.email)
  }

  return {
    id: userId,
    username,
    email: profile.email || `${username}@placeholder.local`,
    display_name: displayName,
    avatar_url: profile.avatarUrl,
    role: 'user',
    status: 'active'
  }
}

export async function maybeGrantAdmin(userId: string, email: string): Promise<void> {
  const adminEmails = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
  if (adminEmails.includes(email)) {
    await sql`UPDATE users SET role = 'admin' WHERE id = ${userId} AND role = 'user'`
  }
}

export async function bindOAuthIdentity(userId: string, profile: OAuthProfile): Promise<{ error?: string }> {
  // Check if already bound to another user
  const existing = await sql`
    SELECT user_id FROM user_identities
    WHERE provider = ${profile.provider} AND provider_user_id = ${profile.providerUserId}
  `
  if (existing[0]) {
    if ((existing[0] as { user_id: string }).user_id === userId) {
      return {} // Already bound
    }
    return { error: 'This account is already linked to another user' }
  }

  await sql`
    INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_username, email, email_verified, raw_profile)
    VALUES (${nanoid()}, ${userId}, ${profile.provider}, ${profile.providerUserId}, ${profile.username}, ${profile.email}, ${profile.emailVerified}, ${JSON.stringify(profile.rawProfile)})
  `
  return {}
}

export async function fetchGitHubProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json() as Record<string, unknown>

  let email = data.email as string | null
  let emailVerified = false
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }
    })
    if (emailsRes.ok) {
      const emails = await emailsRes.json() as Array<{ email: string; verified: boolean; primary: boolean }>
      const primary = emails.find(e => e.primary && e.verified)
      if (primary) {
        email = primary.email
        emailVerified = true
      }
    }
  } else {
    emailVerified = true // GitHub public email is verified
  }

  return {
    provider: 'github',
    providerUserId: String(data.id),
    username: (data.login as string) || 'github-user',
    email,
    emailVerified,
    avatarUrl: data.avatar_url as string | null,
    rawProfile: data
  }
}

export async function fetchLinuxDoProfile(accessToken: string): Promise<OAuthProfile> {
  const userInfoUrl = env.LINUX_DO_USERINFO_URL || 'https://connect.linux.do/api/userinfo'
  const res = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`Linux Do API error: ${res.status}`)
  const data = await res.json() as Record<string, unknown>

  return {
    provider: 'linux_do',
    providerUserId: String(data.sub || data.id),
    username: (data.username || data.preferred_username || data.name || 'linuxdo-user') as string,
    email: (data.email as string) || null,
    emailVerified: Boolean(data.email_verified),
    avatarUrl: (data.picture as string) || null,
    rawProfile: data
  }
}
