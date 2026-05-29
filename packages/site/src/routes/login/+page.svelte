<script>
  import { goto } from '$app/navigation'

  let login = ''
  let password = ''
  let error = ''
  let loading = false

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  async function handleLogin() {
    error = ''
    loading = true
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ login, password })
      })
      const data = await res.json()
      if (res.ok) {
        goto('/leaderboard')
      } else {
        error = data.error === 'user_banned' ? 'Your account has been banned.' : data.error || 'Login failed'
      }
    } catch {
      error = 'Network error'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Login — AIUsage</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-card">
    <h1>Sign In</h1>
    <p class="auth-subtitle">Sign in to view the Token Leaderboard</p>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleLogin}>
      <div class="field">
        <label for="login">Username or Email</label>
        <input id="login" type="text" bind:value={login} required autocomplete="username" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={password} required autocomplete="current-password" />
      </div>
      <button type="submit" class="btn-primary" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <div class="auth-divider"><span>or</span></div>

    <div class="oauth-buttons">
      <a href="/api/oauth/github/start" class="btn-oauth github">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Continue with GitHub
      </a>
      <a href="/api/oauth/linux-do/start" class="btn-oauth linuxdo">
        Linux Do
      </a>
    </div>

    <p class="auth-footer">
      Don't have an account? <a href="/register">Register</a>
    </p>
  </div>
</div>

<style>
  .auth-page { min-height: calc(100vh - 200px); display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .auth-card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
  .auth-subtitle { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .field { margin-bottom: 1rem; }
  label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-secondary); }
  input { width: 100%; padding: 0.625rem 0.875rem; font-size: 0.9375rem; border: 1px solid var(--border-medium); border-radius: 8px; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.15s; }
  input:focus { border-color: var(--accent); }
  .btn-primary { width: 100%; padding: 0.75rem; font-size: 0.9375rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-divider { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; color: var(--text-muted); font-size: 0.8125rem; }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
  .oauth-buttons { display: flex; flex-direction: column; gap: 0.75rem; }
  .btn-oauth { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.625rem; font-size: 0.875rem; font-weight: 600; border: 1px solid var(--border-medium); border-radius: 8px; text-decoration: none; color: var(--text); transition: border-color 0.15s, background 0.15s; }
  .btn-oauth:hover { border-color: var(--text-muted); background: var(--hover); }
  .auth-footer { text-align: center; font-size: 0.875rem; color: var(--text-muted); margin-top: 1.5rem; }
  .auth-footer a { color: var(--accent); text-decoration: none; font-weight: 600; }
</style>
