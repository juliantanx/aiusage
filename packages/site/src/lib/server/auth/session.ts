import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'
import type { RequestEvent } from '@sveltejs/kit'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_COOKIE = 'ai_session'

export interface SessionUser {
  id: string
  username: string
  email: string
  display_name: string
  avatar_url: string | null
  role: string
  status: string
}

export async function createSession(userId: string): Promise<string> {
  const sid = nanoid(32)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await sql`INSERT INTO sessions (sid, user_id, expires_at) VALUES (${sid}, ${userId}, ${expiresAt})`
  return sid
}

export async function getSessionUser(sid: string): Promise<SessionUser | null> {
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role, u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.sid = ${sid} AND s.expires_at > NOW()
  `
  return rows[0] as SessionUser || null
}

export async function destroySession(sid: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE sid = ${sid}`
}

export function setSessionCookie(event: RequestEvent, sid: string): void {
  event.cookies.set(SESSION_COOKIE, sid, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS / 1000
  })
}

export function getSessionCookie(event: RequestEvent): string | undefined {
  return event.cookies.get(SESSION_COOKIE)
}

export function clearSessionCookie(event: RequestEvent): void {
  event.cookies.delete(SESSION_COOKIE, { path: '/' })
}

export async function getUserFromEvent(event: RequestEvent): Promise<SessionUser | null> {
  const sid = getSessionCookie(event)
  if (!sid) return null
  try {
    return await getSessionUser(sid)
  } catch (err) {
    console.error('getUserFromEvent DB error:', err)
    return null
  }
}

export async function requireUser(event: RequestEvent): Promise<SessionUser> {
  const user = await getUserFromEvent(event)
  if (!user) {
    throw new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  if (user.status === 'banned') {
    throw new Response(JSON.stringify({ error: 'user_banned' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return user
}

export async function requireAdmin(event: RequestEvent): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return user
}
