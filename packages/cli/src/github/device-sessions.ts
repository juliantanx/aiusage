import { randomUUID } from 'node:crypto'
import { appSettings, connectRepository, githubApi, GitHubAuthError, installationRepositories, pollDeviceAuthorization, startDeviceAuthorization, type DeviceAuthorization } from './auth.js'
import type { GitHubCredentials } from './credentials.js'
import { runInit } from '../commands/init.js'

/** Per-server, short-lived capabilities. No browser callback or OAuth secret crosses
 * the local API boundary. Routes also require dashboard auth and same-origin checks.
 */
export function createGitHubDeviceSessions() {
  const sessions = new Map<string, { flow: DeviceAuthorization; expiresAt: number; creds?: GitHubCredentials; login?: string; busy?: boolean }>()
  return async (action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    for (const [id, s] of sessions) if (s.expiresAt <= Date.now()) sessions.delete(id)
    if (action === 'start') {
      if (sessions.size >= 5) throw new GitHubAuthError('Too many pending GitHub connections. Cancel a connection or retry after it expires.')
      const id = randomUUID()
      // Reserve a slot before the network request.
      const slot = { flow: null as unknown as DeviceAuthorization, expiresAt: Date.now() + 900_000 }
      sessions.set(id, slot)
      setTimeout(() => sessions.delete(id), 900_000).unref()
      try {
        slot.flow = await startDeviceAuthorization()
        return { sessionId: id, userCode: slot.flow.userCode, verificationUrl: slot.flow.verificationUrl, expiresAt: slot.flow.expiresAt, installUrl: appSettings().installUrl }
      } catch (error) { sessions.delete(id); throw error }
    }
    const id = typeof body.sessionId === 'string' ? body.sessionId : ''
    const session = sessions.get(id)
    if (!session?.flow) throw new GitHubAuthError('GitHub connection expired. Connect GitHub again.')
    if (action === 'cancel') { sessions.delete(id); return { ok: true } }
    if (session.busy) {
      if (action === 'poll') return { status: 'pending' }
      throw new GitHubAuthError('GitHub connection is busy. Retry shortly.')
    }
    session.busy = true
    try {
      if (action === 'poll') {
        if (!session.creds) {
          const creds = await pollDeviceAuthorization(session.flow)
          if (!creds) return { status: 'pending' }
          session.creds = creds
          const user = await githubApi(creds.accessToken, '/user')
          if (!/^[A-Za-z0-9-]+$/.test(user.login)) throw new GitHubAuthError('GitHub returned an invalid user profile.')
          session.login = user.login
        }
        return { status: 'authorized', login: session.login }
      }
      if (!session.creds || !session.login) throw new GitHubAuthError('Complete GitHub authorization first.')
      if (action === 'repositories') return { repositories: await installationRepositories(session.creds.accessToken), login: session.login }
      if (action === 'connect') {
        // Revalidate installation and push permission at selection time.
        const choices = await installationRepositories(session.creds.accessToken)
        if (sessions.get(id) !== session || session.expiresAt <= Date.now()) throw new GitHubAuthError('GitHub connection expired or was cancelled. Connect GitHub again.')
        const choice = choices.find(c => c.repo === body.repo)
        if (!choice) throw new GitHubAuthError('Select a repository with App Contents write access.')
        connectRepository(session.creds, session.login, choice)
        const result = runInit({ backend: 'github', repo: choice.repo, githubAuth: 'github-app' })
        if (!result.success) throw new GitHubAuthError('Cannot finish GitHub sync configuration. Please reconnect.')
        sessions.delete(id)
        return { ok: true, repo: choice.repo, login: session.login }
      }
      throw new GitHubAuthError('Unknown GitHub connection action.')
    } catch (error) {
      if (action === 'poll') sessions.delete(id)
      throw error
    } finally { session.busy = false }
  }
}
