<script>
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'

  let email = ''
  let error = ''
  let success = false
  let loading = false

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  async function handleSubmit() {
    error = ''
    loading = true
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        success = true
      } else {
        error = data.error || (zh ? '发送失败' : 'Failed to send')
      }
    } catch {
      error = zh ? '网络错误' : 'Network error'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{zh ? '忘记密码' : 'Forgot Password'} — AIUsage</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-card">
    <h1>{zh ? '忘记密码' : 'Forgot Password'}</h1>
    <p class="auth-subtitle">{zh ? '输入你的邮箱地址，我们将发送重置密码链接。' : 'Enter your email address and we will send you a password reset link.'}</p>

    {#if success}
      <div class="success-msg">
        {zh ? '如果该邮箱对应的账号存在，重置密码链接已发送，请查收邮箱。' : 'If an account exists for that email, a password reset link has been sent. Please check your inbox.'}
      </div>
    {:else}
      {#if error}
        <div class="error-msg">{error}</div>
      {/if}

      <form on:submit|preventDefault={handleSubmit}>
        <div class="field">
          <label for="email">{zh ? '邮箱' : 'Email'}</label>
          <input id="email" type="email" bind:value={email} required autocomplete="email" />
        </div>
        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? (zh ? '发送中...' : 'Sending...') : (zh ? '发送重置链接' : 'Send Reset Link')}
        </button>
      </form>
    {/if}

    <p class="auth-footer">
      <a href="/login">{zh ? '返回登录' : 'Back to Sign In'}</a>
    </p>
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
