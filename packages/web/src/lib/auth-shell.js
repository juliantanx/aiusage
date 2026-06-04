export function getAuthShellState({ pathname, authEnabled, authenticated, authLoading }) {
  const isHome = pathname === '/'
  if (authLoading) return isHome ? 'public-home' : 'loading'
  if (!authEnabled || authenticated) return 'shell'
  return isHome ? 'public-home' : 'login-page'
}
