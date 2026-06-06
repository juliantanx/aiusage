<script>
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'
  $: token = $page.url.searchParams.get('token') || ''

  let password = ''
  let confirmPassword = ''
  let error = ''
  let success = false
  let loading = false

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  async function handleSubmit() {
    error = ''

    if (password !== confirmPassword) {
      error = zh ? '两次输入的密码不一致。' : 'Passwords do not match.'
      return
    }

    loading = true
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ token, password })
      })
      const data = await res.json()
      if (res.ok) {
        success = true
      } else {
        error = data.error || (zh ? '重置失败' : 'Reset failed')
      }
    } catch {
      error = zh ? '网络错误' : 'Network error'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{zh ? '重置密码' : 'Reset Password'} — AIUsage</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-card">
    <h1>{zh ? '重置密码' : 'Reset Password'}</h1>

    {#if !token}
      <div class="error-msg">{zh ? '重置链接无效。' : 'Invalid reset link.'}</div>
      <p class="auth-footer">
        <a href="/forgot-password">{zh ? '重新请求' : 'Request a new link'}</a>
      </p>
    {:else if success}
      <div class="success-msg">
        {zh ? '密码已重置，请使用新密码登录。' : 'Password has been reset. Please sign in with your new password.'}
      </div>
      <p class="auth-footer">
        <a href="/login">{zh ? '去登录' : 'Sign In'}</a>
      </p>
    {:else}
      <p class="auth-subtitle">{zh ? '请输入新密码。' : 'Enter your new password.'}</p>

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}

      <form on:submit|preventDefault={handleSubmit}>
        <div class="field">
          <label for="password">{zh ? '新密码' : 'New Password'}</label>
          <input id="password" type="password" bind:value={password} required autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="confirm-password">{zh ? '确认密码' : 'Confirm Password'}</label>
          <input id="confirm-password" type="password" bind:value={confirmPassword} required autocomplete="new-password" />
        </div>
        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? (zh ? '重置中...' : 'Resetting...') : (zh ? '重置密码' : 'Reset Password')}
        </button>
      </form>

      <p class="auth-footer">
        <a href="/login">{zh ? '返回登录' : 'Back to Sign In'}</a>
      </p>
    {/if}
  </div>
</div>

<style>
  .auth-page { min-height: calc(100vh - 200px); display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .auth-card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
  .auth-subtitle { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .success-msg { background: oklch(0.62 0.14 155 / 0.1); color: oklch(0.42 0.12 155); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .field { margin-bottom: 1rem; }
  label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-secondary); }
  input { width: 100%; padding: 0.625rem 0.875rem; font-size: 0.9375rem; border: 1px solid var(--border-medium); border-radius: 8px; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.15s; }
  input:focus { border-color: var(--accent); }
  .btn-primary { width: 100%; padding: 0.75rem; font-size: 0.9375rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-footer { text-align: center; font-size: 0.875rem; color: var(--text-muted); margin-top: 1.5rem; }
  .auth-footer a { color: var(--accent); text-decoration: none; font-weight: 600; }
</style>
