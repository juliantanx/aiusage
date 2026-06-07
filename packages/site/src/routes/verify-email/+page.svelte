<script>
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'
  $: data = $page.data
</script>

<svelte:head>
  <title>{zh ? '邮箱验证' : 'Email Verification'} — AIUsage</title>
</svelte:head>

<div class="verify-page">
  <div class="verify-card">
    {#if data.success}
      <div class="icon success">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h1>{zh ? '邮箱验证成功' : 'Email Verified'}</h1>
      <p class="desc">{zh ? '你的邮箱已验证成功，现在可以登录了。' : 'Your email has been verified. You can now sign in.'}</p>
      <a href="/login" class="btn-primary">{zh ? '前往登录' : 'Sign In'}</a>
    {:else}
      <div class="icon error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <h1>{zh ? '验证失败' : 'Verification Failed'}</h1>
      <p class="desc">{zh ? '验证链接无效或已过期。请重新注册或请求新的验证邮件。' : 'The verification link is invalid or expired. Please register again or request a new verification email.'}</p>
      <div class="actions">
        <a href="/register" class="btn-primary">{zh ? '重新注册' : 'Register'}</a>
        <a href="/login" class="btn-secondary">{zh ? '前往登录' : 'Sign In'}</a>
      </div>
    {/if}
  </div>
</div>

<style>
  .verify-page {
    min-height: calc(100vh - 200px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .verify-card {
    width: 100%;
    max-width: 420px;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 2.5rem 2rem;
    box-shadow: var(--shadow-md);
    text-align: center;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    margin-bottom: 1.25rem;
  }
  .icon.success {
    background: oklch(0.62 0.14 155 / 0.1);
    color: oklch(0.42 0.12 155);
  }
  .icon.error {
    background: oklch(0.55 0.22 25 / 0.08);
    color: var(--rose);
  }
  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }
  .desc {
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }
  .btn-primary {
    display: inline-block;
    padding: 0.75rem 2rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: oklch(0.99 0.002 85);
    background: var(--accent);
    border: none;
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .btn-primary:hover {
    background: var(--accent-hover);
  }
  .btn-secondary {
    display: inline-block;
    padding: 0.75rem 2rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .btn-secondary:hover {
    background: var(--surface-hover, oklch(0.92 0.005 250));
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }
</style>
