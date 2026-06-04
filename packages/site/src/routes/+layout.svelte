<script>
  import { page } from '$app/stores'
  import { goto, invalidateAll } from '$app/navigation'
  import { lang } from '$lib/lang'

  function toggleLang() {
    lang.toggle()
  }

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  let menuOpen = false

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function closeMenu() {
    menuOpen = false
  }

  function handleClickOutside(e) {
    if (menuOpen && !e.target.closest('.user-menu-wrap')) {
      menuOpen = false
    }
  }

  async function handleLogout() {
    menuOpen = false
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': getCsrfToken() }
    })
    await invalidateAll()
    goto('/login')
  }

  $: isDocs = $page.url.pathname.startsWith('/docs')
  $: zh = $lang === 'zh'
  $: user = $page.data.user
</script>

<svelte:head>
  <title>AIUsage — {zh ? 'AI 编程用量分析平台' : 'AI Coding Usage Analytics'}</title>
  <meta name="description" content={zh
    ? '追踪 Claude Code、Codex、Cursor 等 AI 编程工具的 Token 用量、费用和使用模式。本地优先，隐私至上。'
    : 'Track token consumption, costs, and usage patterns across Claude Code, Codex, Cursor, and more. Local-first, privacy-respecting.'
  } />
  <meta name="keywords" content="AIUsage, AI coding, Claude Code, Codex, Cursor, OpenClaw, OpenCode, Hermes, Qoder, AI usage analytics, token consumption, cost tracking, local-first, AI programming tools, AI编程工具, Token用量, 费用追踪" />
  <link rel="canonical" href="https://aiusage.jtanx.com{$page.url.pathname}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="AIUsage" />
  <meta property="og:title" content="AIUsage — {zh ? 'AI 编程用量分析平台' : 'AI Coding Usage Analytics'}" />
  <meta property="og:description" content={zh
    ? '追踪 Claude Code、Codex、Cursor 等 AI 编程工具的 Token 用量、费用和使用模式。本地优先，隐私至上。'
    : 'Track token consumption, costs, and usage patterns across Claude Code, Codex, Cursor, and more. Local-first, privacy-respecting.'
  } />
  <meta property="og:url" content="https://aiusage.jtanx.com{$page.url.pathname}" />
  <meta property="og:locale" content={zh ? 'zh_CN' : 'en_US'} />
  <meta property="og:image" content="https://aiusage.jtanx.com/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="AIUsage — AI Coding Usage Analytics" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="AIUsage — {zh ? 'AI 编程用量分析平台' : 'AI Coding Usage Analytics'}" />
  <meta name="twitter:description" content={zh
    ? '追踪 Claude Code、Codex、Cursor 等 AI 编程工具的 Token 用量、费用和使用模式。本地优先，隐私至上。'
    : 'Track token consumption, costs, and usage patterns across Claude Code, Codex, Cursor, and more. Local-first, privacy-respecting.'
  } />
  <meta name="twitter:image" content="https://aiusage.jtanx.com/og-image.png" />

  <!-- JSON-LD Structured Data -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AIUsage',
    description: zh
      ? '追踪 Claude Code、Codex、Cursor 等 AI 编程工具的 Token 用量、费用和使用模式。本地优先，隐私至上。'
      : 'Track token consumption, costs, and usage patterns across Claude Code, Codex, Cursor, and more. Local-first, privacy-respecting.',
    url: 'https://aiusage.jtanx.com',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    author: {
      '@type': 'Organization',
      name: 'AIUsage'
    },
    softwareVersion: '1.4.0',
    downloadUrl: 'https://www.npmjs.com/package/@juliantanx/aiusage',
    featureList: zh
      ? 'Token用量追踪,费用估算与分析,模型使用排名,工具调用分析,项目维度统计,配额监控,多设备同步,数据导出'
      : 'Token Usage Tracking,Cost Estimation,Model Usage Ranking,Tool Call Analytics,Project-Level Stats,Quota Monitoring,Multi-Device Sync,Data Export'
  })}</script>`}

  <!-- Organization: gives Google an explicit site entity + logo signal -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AIUsage',
    url: 'https://aiusage.jtanx.com/',
    logo: 'https://aiusage.jtanx.com/web-app-manifest-512x512.png',
    sameAs: [
      'https://github.com/juliantanx/aiusage',
      'https://www.npmjs.com/package/@juliantanx/aiusage',
      'https://hub.docker.com/r/juliantanx/aiusage'
    ]
  })}</script>`}
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div class="site">
  <!-- Desktop header -->
  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="site-brand">
        <img src="/logo-icon.svg" alt="" class="brand-icon" width="24" height="24" />
        <span class="brand-text">AIUsage</span>
      </a>

      <nav class="site-nav" aria-label={zh ? '主导航' : 'Main navigation'}>
        <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>
          {zh ? '首页' : 'Home'}
        </a>
        <a href="/docs" class="nav-link" class:active={$page.url.pathname.startsWith('/docs')}>
          {zh ? '文档' : 'Docs'}
        </a>
        <a href="/leaderboard" class="nav-link" class:active={$page.url.pathname.startsWith('/leaderboard')}>
          {zh ? '排行榜' : 'Leaderboard'}
        </a>
      </nav>

      <div class="header-actions">
        <a href="https://github.com/juliantanx/aiusage" class="github-btn" target="_blank" rel="noopener" aria-label="GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
        <button class="lang-toggle" on:click={toggleLang} aria-label={zh ? 'Switch to English' : '切换到中文'}>
          {zh ? 'EN' : '中文'}
        </button>
        {#if user}
          <div class="user-menu-wrap">
            <button class="user-menu-trigger" on:click={toggleMenu} aria-expanded={menuOpen} aria-haspopup="true">
              {#if user.avatar_url}
                <img src={user.avatar_url} alt="" class="user-avatar" width="32" height="32" />
              {:else}
                <span class="user-avatar-fallback">{(user.display_name || user.username).charAt(0).toUpperCase()}</span>
              {/if}
            </button>
            {#if menuOpen}
              <div class="user-menu" role="menu">
                <div class="user-menu-header">
                  <span class="user-menu-name">{user.display_name || user.username}</span>
                  <span class="user-menu-username">@{user.username}</span>
                </div>
                <div class="user-menu-divider"></div>
                <a href="/settings" class="user-menu-item" role="menuitem" on:click|stopPropagation={closeMenu}>
                  {zh ? '设置' : 'Settings'}
                </a>
                <a href="/uploads" class="user-menu-item" role="menuitem" on:click|stopPropagation={closeMenu}>
                  {zh ? '上传状态' : 'Upload status'}
                </a>
                <button class="user-menu-item danger" role="menuitem" on:click={handleLogout}>
                  {zh ? '退出登录' : 'Sign out'}
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <a href="/login" class="header-cta">
            {zh ? '登录' : 'Sign In'}
          </a>
        {/if}
      </div>
    </div>
  </header>

  <!-- Mobile header -->
  <div class="mobile-nav-bar" role="navigation" aria-label={zh ? '移动端导航' : 'Mobile navigation'}>
    <a href="/" class="site-brand">
      <img src="/logo-icon.svg" alt="" class="brand-icon" width="24" height="24" />
      <span class="brand-text">AIUsage</span>
    </a>
    <div class="mobile-actions">
      <a href="/leaderboard" class="nav-link" class:active={$page.url.pathname.startsWith('/leaderboard')}>
        {zh ? '榜' : 'Rank'}
      </a>
      <a href="https://github.com/juliantanx/aiusage" class="github-btn" target="_blank" rel="noopener" aria-label="GitHub">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
      <button class="lang-toggle" on:click={toggleLang} aria-label={zh ? 'Switch to English' : '切换到中文'}>
        {zh ? 'EN' : '中文'}
      </button>
      {#if user}
        <div class="user-menu-wrap">
          <button class="user-menu-trigger" on:click={toggleMenu} aria-expanded={menuOpen} aria-haspopup="true">
            {#if user.avatar_url}
              <img src={user.avatar_url} alt="" class="user-avatar" width="28" height="28" />
            {:else}
              <span class="user-avatar-fallback small">{(user.display_name || user.username).charAt(0).toUpperCase()}</span>
            {/if}
          </button>
          {#if menuOpen}
            <div class="user-menu" role="menu">
              <div class="user-menu-header">
                <span class="user-menu-name">{user.display_name || user.username}</span>
                <span class="user-menu-username">@{user.username}</span>
              </div>
              <div class="user-menu-divider"></div>
              <a href="/settings" class="user-menu-item" role="menuitem" on:click|stopPropagation={closeMenu}>
                {zh ? '设置' : 'Settings'}
              </a>
              <a href="/uploads" class="user-menu-item" role="menuitem" on:click|stopPropagation={closeMenu}>
                {zh ? '上传状态' : 'Upload status'}
              </a>
              <button class="user-menu-item danger" role="menuitem" on:click={handleLogout}>
                {zh ? '退出登录' : 'Sign out'}
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <a href="/login" class="header-cta">
          {zh ? '登录' : 'Sign In'}
        </a>
      {/if}
    </div>
  </div>

  <main>
    <slot />
  </main>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="footer-logo">
          <img src="/logo-icon.svg" alt="" class="brand-icon" width="24" height="24" />
          <span class="brand-text">AIUsage</span>
        </div>
        <p class="footer-tagline">
          {zh
            ? '本地优先的 AI 编程用量分析平台'
            : 'Local-first AI coding usage analytics'}
        </p>
        <div class="footer-badges">
          <a href="https://www.npmjs.com/package/@juliantanx/aiusage" target="_blank" rel="noopener" class="badge-link">
            <img src="https://img.shields.io/npm/v/@juliantanx/aiusage?style=flat-square&color=0d9488" alt="npm version" loading="lazy" />
          </a>
          <a href="https://github.com/juliantanx/aiusage/blob/main/LICENSE" target="_blank" rel="noopener" class="badge-link">
            <img src="https://img.shields.io/github/license/juliantanx/aiusage?style=flat-square" alt="license" loading="lazy" />
          </a>
        </div>
      </div>

      <div class="footer-links">
        <div class="footer-col">
          <h4>{zh ? '产品' : 'Product'}</h4>
          <a href="/">{zh ? '首页' : 'Home'}</a>
          <a href="/docs">{zh ? '文档' : 'Documentation'}</a>
        </div>
        <div class="footer-col">
          <h4>{zh ? '资源' : 'Resources'}</h4>
          <a href="https://github.com/juliantanx/aiusage" target="_blank" rel="noopener">GitHub</a>
          <a href="https://www.npmjs.com/package/@juliantanx/aiusage" target="_blank" rel="noopener">npm — CLI</a>
          <a href="https://www.npmjs.com/package/@juliantanx/aiusage-widget" target="_blank" rel="noopener">npm — Widget</a>
          <a href="https://hub.docker.com/r/juliantanx/aiusage" target="_blank" rel="noopener">Docker Hub</a>
          <a href="https://github.com/juliantanx/aiusage/blob/main/CHANGELOG.md" target="_blank" rel="noopener">{zh ? '更新日志' : 'Changelog'}</a>
        </div>
        <div class="footer-col">
          <h4>{zh ? '联系' : 'Contact'}</h4>
          <a href="mailto:hi@jtanx.com">{zh ? '邮件联系' : 'Email'}</a>
        </div>
        <div class="footer-col">
          <h4>{zh ? '社区' : 'Community'}</h4>
          <a href="https://github.com/juliantanx/aiusage/issues" target="_blank" rel="noopener">{zh ? '问题反馈' : 'Issues'}</a>
          <a href="https://github.com/juliantanx/aiusage/pulls" target="_blank" rel="noopener">{zh ? '贡献代码' : 'Pull Requests'}</a>
        </div>
      </div>
    </div>

    <div class="footer-bottom">
      <span>&copy; {new Date().getFullYear()} AIUsage</span>
      <span class="footer-sep">&middot;</span>
      <span>MIT License</span>
      <span class="footer-sep">&middot;</span>
      <a href="https://github.com/juliantanx/aiusage" target="_blank" rel="noopener">GitHub</a>
      <span class="footer-sep">&middot;</span>
      <a href="https://hub.docker.com/r/juliantanx/aiusage" target="_blank" rel="noopener">Docker</a>
    </div>
  </footer>
</div>

<style>
  /* ── Design tokens ──────────────────────────────────────────────────────── */
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
    scroll-padding-top: 72px;
  }

  :global(body) {
    font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
  }

  :global(:root) {
    --bg:                oklch(0.985 0.004 85);
    --bg-warm:           oklch(0.972 0.006 85);
    --surface:           oklch(0.995 0.002 85);
    --raised:            oklch(0.968 0.007 85);
    --hover:             oklch(0.952 0.009 85);
    --border-subtle:     oklch(0.915 0.009 85);
    --border-medium:     oklch(0.86 0.011 85);
    --text:              oklch(0.15 0.014 85);
    --text-secondary:    oklch(0.38 0.016 85);
    --text-muted:        oklch(0.55 0.013 85);
    --accent:            oklch(0.52 0.14 165);
    --accent-dim:        oklch(0.52 0.14 165 / 0.08);
    --accent-hover:      oklch(0.47 0.15 165);
    --blue:              oklch(0.52 0.16 250);
    --blue-dim:          oklch(0.52 0.16 250 / 0.08);
    --green:             oklch(0.58 0.18 155);
    --green-dim:         oklch(0.58 0.18 155 / 0.08);
    --purple:            oklch(0.55 0.17 300);
    --purple-dim:        oklch(0.55 0.17 300 / 0.08);
    --rose:              oklch(0.55 0.22 25);
    --rose-dim:          oklch(0.55 0.22 25 / 0.08);
    --amber:             oklch(0.68 0.15 85);
    --amber-dim:         oklch(0.68 0.15 85 / 0.08);
    --shadow-sm:         0 1px 2px oklch(0 0 0 / 0.04);
    --shadow-md:         0 1px 3px oklch(0 0 0 / 0.06), 0 4px 12px oklch(0 0 0 / 0.03);
    --shadow-lg:         0 4px 8px oklch(0 0 0 / 0.06), 0 12px 32px oklch(0 0 0 / 0.04);
    --mono:              'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
    --content-width:     min(1320px, 92vw);
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: oklch(0.985 0.004 85 / 0.92);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-inner {
    width: var(--content-width);
    margin: 0 auto;
    height: 60px;
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .site-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    flex-shrink: 0;
  }

  .brand-icon {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 5px;
  }

  .brand-text {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .site-nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
  }

  .nav-link {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }

  .nav-link:hover {
    color: var(--text);
    background: var(--hover);
  }

  .nav-link.active {
    color: var(--accent);
    background: var(--accent-dim);
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .lang-toggle {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .lang-toggle:hover {
    color: var(--text);
    border-color: var(--border-medium);
  }

  .header-cta {
    font-size: 0.875rem;
    font-weight: 600;
    color: oklch(0.99 0.002 85);
    background: var(--accent);
    text-decoration: none;
    padding: 0.45rem 1.1rem;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .header-cta:hover {
    background: var(--accent-hover);
  }

  .github-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--text-secondary);
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }

  .github-btn:hover {
    color: var(--text);
    background: var(--hover);
  }

  .user-menu-wrap {
    position: relative;
  }

  .user-menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.15s;
  }

  .user-menu-trigger:hover,
  .user-menu-trigger[aria-expanded="true"] {
    opacity: 1;
  }

  .user-avatar {
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }

  .user-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .user-avatar-fallback.small {
    width: 28px;
    height: 28px;
    font-size: 0.8rem;
  }

  .user-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    box-shadow: 0 1px 3px oklch(0 0 0 / 0.08), 0 4px 12px oklch(0 0 0 / 0.04);
    z-index: 200;
    padding: 4px 0;
  }

  .user-menu-header {
    padding: 10px 14px 8px;
  }

  .user-menu-name {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }

  .user-menu-username {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .user-menu-divider {
    height: 1px;
    background: var(--border-subtle);
    margin: 4px 0;
  }

  .user-menu-item {
    display: block;
    width: 100%;
    padding: 8px 14px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .user-menu-item:hover {
    background: var(--hover);
    color: var(--text);
  }

  .user-menu-item.danger:hover {
    color: var(--rose);
  }

  /* ── Mobile nav ─────────────────────────────────────────────────────────── */
  .mobile-nav-bar {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .mobile-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* ── Footer ─────────────────────────────────────────────────────────────── */
  .site-footer {
    position: relative;
    z-index: 20;
    background: var(--bg-warm);
    border-top: 1px solid var(--border-subtle);
    margin-top: 4rem;
  }

  .footer-inner {
    width: var(--content-width);
    margin: 0 auto;
    padding: 3rem 0 2rem;
    display: grid;
    grid-template-columns: 1.2fr 2fr;
    gap: 3rem;
  }

  .footer-logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .footer-tagline {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
    max-width: 280px;
    margin-bottom: 1rem;
  }

  .footer-badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .badge-link img {
    height: 22px;
    display: block;
  }

  .footer-links {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2rem;
  }

  .footer-col h4 {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .footer-col a {
    display: block;
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-decoration: none;
    margin-bottom: 0.4rem;
    transition: color 0.15s;
  }

  .footer-col a:hover {
    color: var(--accent);
  }

  .footer-bottom {
    width: var(--content-width);
    margin: 0 auto;
    padding: 1.25rem 0;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    flex-wrap: wrap;
  }

  .footer-bottom a {
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .footer-bottom a:hover {
    color: var(--accent);
  }

  .footer-sep {
    opacity: 0.4;
  }

  /* ── WeChat QR popup ────────────────────────────────────────────────────── */
  /* ── Global typography ──────────────────────────────────────────────────── */
  :global(h1, h2, h3, h4, h5, h6) {
    line-height: 1.25;
  }

  :global(a) {
    color: inherit;
  }

  :global(code) {
    font-family: var(--mono);
    font-size: 0.9em;
  }

  :global(pre) {
    font-family: var(--mono);
    font-size: 0.875rem;
    line-height: 1.7;
    background: oklch(0.15 0.014 85);
    color: oklch(0.88 0.008 85);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    overflow-x: auto;
    border: 1px solid oklch(0.23 0.015 85);
  }

  :global(pre code) {
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }

  /* ── Reduced motion ─────────────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    :global(html) {
      scroll-behavior: auto;
    }
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 800px) {
    .site-header {
      display: none;
    }
    .mobile-nav-bar {
      display: flex;
    }
    .footer-inner {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    .footer-links {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
