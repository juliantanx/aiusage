<script>
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'
  $: status = $page.status
  $: message = $page.error?.message || ''
</script>

<svelte:head>
  <title>{status} — AIUsage</title>
</svelte:head>

<div class="error-page">
  <div class="error-container">
    <span class="error-status">{status}</span>
    <p class="error-message">
      {#if status === 404}
        {zh ? '页面不存在' : 'Page not found'}
      {:else if message}
        {message}
      {:else}
        {zh ? '服务器错误' : 'Internal server error'}
      {/if}
    </p>
    <a href="/" class="error-link">{zh ? '返回首页' : 'Back to home'}</a>
  </div>
</div>

<style>
  .error-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 2rem;
  }
  .error-container {
    text-align: center;
  }
  .error-status {
    display: block;
    font-family: var(--mono);
    font-size: 3rem;
    font-weight: 700;
    color: var(--text-muted);
    line-height: 1;
    margin-bottom: 0.75rem;
  }
  .error-message {
    color: var(--text-secondary);
    font-size: 1rem;
    margin-bottom: 1.5rem;
  }
  .error-link {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: oklch(0.99 0.002 85);
    background: var(--accent);
    border-radius: 6px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .error-link:hover { background: var(--accent-hover); }
</style>