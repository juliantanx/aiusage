/** In-memory OAuth state store — replaces unreliable cookie-based state for 302 redirects */
const pending = new Map<string, number>()

const MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export function saveOAuthState(state: string): void {
  pending.set(state, Date.now())
  // Prune expired entries
  const now = Date.now()
  for (const [k, ts] of pending) {
    if (now - ts > MAX_AGE_MS) pending.delete(k)
  }
}

export function consumeOAuthState(state: string): boolean {
  const ts = pending.get(state)
  if (!ts) return false
  pending.delete(state)
  return Date.now() - ts < MAX_AGE_MS
}
