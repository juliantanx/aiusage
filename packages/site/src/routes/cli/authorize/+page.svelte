<script>
  import { page } from '$app/stores'
  import { onMount } from 'svelte'

  let userCode = ''
  let loading = false
  let error = ''
  let approved = false
  let notLoggedIn = false

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  onMount(async () => {
    const res = await fetch('/api/leaderboard?period_type=daily')
    if (res.status === 401) {
      notLoggedIn = true
    }
    userCode = $page.url.searchParams.get('code') || ''
  })

  async function approveDevice() {
    if (!userCode) return
    loading = true
    error = ''
    try {
      const res = await fetch('/api/cli/device/approve-by-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ user_code: userCode })
      })
      if (res.ok) {
        approved = true
      } else {
        const data = await res.json()
        error = data.error || 'Failed to approve'
      }
    } catch {
      error = 'Network error'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Authorize CLI Device — AIUsage</title>
</svelte:head>

<div class="authorize-page">
  <div class="authorize-card">
    {#if notLoggedIn}
      <h1>Sign In Required</h1>
      <p>You need to sign in before authorizing a CLI device.</p>
      <a href="/login?redirect=/cli/authorize?code={userCode}" class="btn-primary">Sign In</a>
    {:else if approved}
      <div class="success-icon">&#10003;</div>
      <h1>Device Authorized</h1>
      <p>Your CLI device has been authorized. You can close this page and return to your terminal.</p>
    {:else}
      <h1>Authorize CLI Device</h1>
      <p class="authorize-desc">
        Your CLI is requesting permission to upload token usage data to the AIUsage leaderboard.
      </p>

      {#if userCode}
        <div class="code-display">
          <span class="code-label">Device Code</span>
          <span class="code-value">{userCode}</span>
        </div>
      {/if}

      <div class="authorize-info">
        <h3>This will allow the CLI to:</h3>
        <ul>
          <li>Upload aggregated token usage statistics</li>
          <li>Appear on the community leaderboard</li>
        </ul>
        <h3>Data that will NOT be uploaded:</h3>
        <ul>
          <li>Prompt or completion content</li>
          <li>File paths or project names</li>
          <li>Cost or pricing information</li>
        </ul>
      </div>

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}

      <button class="btn-primary" on:click={approveDevice} disabled={loading || !userCode}>
        {loading ? 'Authorizing...' : 'Authorize Device'}
      </button>
    {/if}
  </div>
</div>

<style>
  .authorize-page { min-height: calc(100vh - 200px); display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .authorize-card { width: 100%; max-width: 480px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); text-align: center; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; }
  .authorize-desc { color: var(--text-secondary); font-size: 0.9375rem; margin-bottom: 1.5rem; }
  .success-icon { font-size: 3rem; color: var(--green); margin-bottom: 1rem; }
  .code-display { background: var(--raised); border: 1px solid var(--border-medium); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
  .code-label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 0.5rem; }
  .code-value { font-family: var(--mono); font-size: 1.5rem; font-weight: 700; letter-spacing: 0.1em; color: var(--accent); }
  .authorize-info { text-align: left; margin-bottom: 1.5rem; }
  .authorize-info h3 { font-size: 0.875rem; font-weight: 600; margin: 1rem 0 0.5rem; }
  .authorize-info h3:first-child { margin-top: 0; }
  .authorize-info ul { padding-left: 1.25rem; font-size: 0.875rem; color: var(--text-secondary); }
  .authorize-info li { margin-bottom: 0.25rem; }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .btn-primary { display: inline-block; padding: 0.75rem 2rem; font-size: 0.9375rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 8px; cursor: pointer; text-decoration: none; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
