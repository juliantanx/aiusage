<script>
  import { page } from '$app/stores'
  import { onDestroy, onMount } from 'svelte'
  import { lang, toggleLang, t } from '$lib/i18n.js'
  import { userPref, cycleTheme, initTheme } from '$lib/theme.js'
  import { triggerSync, fetchSyncStatus, fetchConfig, fetchAuthStatus, login } from '$lib/api.js'
  import { displayCurrency, exchangeRate } from '$lib/stores.js'
  import { getAuthShellState } from '$lib/auth-shell.js'
  import {
    House, LayoutDashboard, Coins, DollarSign, Box,
    MessageSquare, FolderKanban, Wrench,
    Gauge, Tag, Trophy, Settings, HelpCircle,
    RefreshCw, ArrowUpDown, Sun, Moon, MonitorCog,
    Languages, PanelLeftClose, PanelLeftOpen, ExternalLink
  } from 'lucide-svelte'

  const NAV_GROUPS = [
    {
      key: 'nav.group.overview',
      items: [
        { path: '/',           key: 'nav.home',      icon: House },
        { path: '/overview',   key: 'nav.overview',  icon: LayoutDashboard },
      ]
    },
    {
      key: 'nav.group.analytics',
      items: [
        { path: '/tokens',     key: 'nav.tokens',    icon: Coins },
        { path: '/cost',       key: 'nav.cost',      icon: DollarSign },
        { path: '/models',     key: 'nav.models',    icon: Box },
      ]
    },
    {
      key: 'nav.group.activity',
      items: [
        { path: '/sessions',   key: 'nav.sessions',  icon: MessageSquare },
        { path: '/projects',   key: 'nav.projects',  icon: FolderKanban },
        { path: '/tool-calls', key: 'nav.toolCalls', icon: Wrench },
      ]
    },
    {
      key: 'nav.group.system',
      items: [
        { path: '/quotas',     key: 'nav.quotas',    icon: Gauge },
        { path: '/pricing',    key: 'nav.pricing',   icon: Tag },
        { path: '/leaderboard', key: 'nav.leaderboard', icon: Trophy },
        { path: '/settings',   key: 'nav.settings',  icon: Settings },
        { path: '/support',    key: 'nav.support',   icon: HelpCircle },
      ]
    }
  ]

  const SIDEBAR_KEY = 'aiusage-sidebar-collapsed'

  let collapsed = false
  let mobileOpen = false

  const themeIcons = { system: MonitorCog, dark: Moon, light: Sun }

  let syncStatus = null
  let syncing = false
  let syncResult = ''
  let syncPollTimer = null
  let authLoading = true
  let authEnabled = false
  let authenticated = false
  let password = ''
  let authError = ''
  let authSubmitting = false
  let unlockOpen = false

  $: isHomeRoute = $page.url.pathname === '/'
  $: shellState = getAuthShellState({
    pathname: $page.url.pathname,
    authEnabled,
    authenticated,
    authLoading,
  })
  $: shouldShowLogin = shellState === 'login-page'
  $: shouldShowPublicHome = shellState === 'public-home'

  async function loadAuthStatus() {
    try {
      const status = await fetchAuthStatus()
      authEnabled = Boolean(status.enabled)
      authenticated = Boolean(status.authenticated)
    } catch {
      authEnabled = false
      authenticated = false
    } finally {
      authLoading = false
    }
  }

  async function handleLogin() {
    authError = ''
    authSubmitting = true
    try {
      await login(password)
      authenticated = true
      password = ''
      unlockOpen = false
      loadSyncStatus()
      fetchConfig().then(applyConfig).catch(() => {})
    } catch (err) {
      authError = err instanceof Error ? err.message : $t('auth.loginFailed')
    } finally {
      authSubmitting = false
    }
  }

  async function loadSyncStatus() {
    try {
      const data = await fetchSyncStatus()
      syncStatus = data.status
      syncing = Boolean(syncStatus?.isRunning)
      updateSyncPolling()
    } catch {
      syncStatus = null
      syncing = false
      updateSyncPolling()
    }
  }

  async function handleSync() {
    syncResult = ''
    try {
      const result = await triggerSync()
      syncStatus = result.status
      syncing = Boolean(result.status?.isRunning)
      syncResult = result.alreadyRunning ? $t('sync.inProgress') : $t('sync.started')
      updateSyncPolling()
    } catch {
      syncResult = $t('sync.failed')
      syncing = false
      updateSyncPolling()
    }
    setTimeout(() => {
      if (!syncing) syncResult = ''
    }, 3000)
  }

  function updateSyncPolling() {
    if (syncPollTimer) {
      clearInterval(syncPollTimer)
      syncPollTimer = null
    }
    if (!syncing) return
    syncPollTimer = setInterval(async () => {
      await loadSyncStatus()
      if (!syncStatus?.isRunning) {
        syncResult = syncStatus?.lastSyncStatus === 'ok'
          ? $t('sync.complete')
          : (syncStatus?.lastSyncError || $t('sync.failed'))
        setTimeout(() => { syncResult = '' }, 5000)
      }
    }, 2000)
  }

  function formatSyncTime(ts) {
    if (!ts) return $t('sync.never')
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function toggleSidebar() {
    collapsed = !collapsed
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed))
    }
  }

  function toggleMobile() {
    mobileOpen = !mobileOpen
  }

  function openUnlock() {
    if (authLoading) return
    unlockOpen = true
    authError = ''
  }

  function closeUnlock() {
    unlockOpen = false
    authError = ''
    password = ''
  }

  function applyConfig(cfg) {
    if (cfg.displayCurrency) displayCurrency.set(cfg.displayCurrency)
    if (cfg.exchangeRateCache?.CNY_USD) exchangeRate.set(cfg.exchangeRateCache.CNY_USD)
    if (cfg.exchangeRate) exchangeRate.set(cfg.exchangeRate)
  }

  onMount(() => {
    initTheme()
    loadAuthStatus()
    loadSyncStatus()
    // Initialize currency stores from config
    fetchConfig().then(applyConfig).catch(() => {})
    if (typeof window !== 'undefined') {
      collapsed = localStorage.getItem(SIDEBAR_KEY) === 'true'
    }
  })

  onDestroy(() => {
    if (syncPollTimer) clearInterval(syncPollTimer)
  })

  $: $page, mobileOpen = false
</script>

{#if mobileOpen && shellState === 'shell'}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="mobile-backdrop" on:click={toggleMobile}></div>
{/if}

{#if shouldShowLogin}
  <main class="auth-page">
    <section class="auth-card">
      <a href="/" class="brand auth-brand">
        <svg class="brand-logo" width="24" height="24" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor"/>
          <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
          <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
          <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
        </svg>
        <span class="brand-name">AIUsage</span>
      </a>
      <h1>{$t('auth.locked')}</h1>
      <p>{$t('auth.lockedHint')}</p>
      <form on:submit|preventDefault={handleLogin}>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          type="password"
          bind:value={password}
          placeholder={$t('auth.password')}
          autocomplete="current-password"
          autofocus
        />
        <button type="submit" disabled={authSubmitting || !password}>
          {authSubmitting ? $t('auth.unlocking') : $t('auth.unlock')}
        </button>
      </form>
      {#if authError}
        <div class="auth-error">{authError}</div>
      {/if}
      <a class="auth-home" href="/">{$t('auth.backHome')}</a>
    </section>
  </main>
{:else if shellState === 'loading'}
  <main class="auth-page">
    <section class="auth-card">
      <div class="auth-loading">{$t('auth.checking')}</div>
    </section>
  </main>
{:else if shouldShowPublicHome}
  <div class="public-shell">
    <header class="public-header">
      <button class="public-unlock" type="button" on:click={openUnlock} aria-label={$t('auth.unlockDashboard')}>
        <svg class="brand-logo" width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor"/>
          <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
          <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
          <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
        </svg>
        <span>AIUsage</span>
      </button>
      <button class="public-lang" type="button" on:click={toggleLang} title={$lang === 'en' ? '中文' : 'EN'}>
        {$lang === 'en' ? '中' : 'EN'}
      </button>
    </header>

    <main class="public-page-content">
      <div class="public-page-inner">
        <slot />
      </div>
    </main>
  </div>

  {#if unlockOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="auth-modal-backdrop" on:click={closeUnlock}></div>
    <section class="auth-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <button class="auth-close" type="button" on:click={closeUnlock} aria-label="Close">×</button>
      <div class="brand auth-brand">
        <svg class="brand-logo" width="24" height="24" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor"/>
          <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
          <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
          <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
        </svg>
        <span class="brand-name">AIUsage</span>
      </div>
      <h1 id="unlock-title">{$t('auth.unlockDashboard')}</h1>
      <p>{$t('auth.unlockHint')}</p>
      <form on:submit|preventDefault={handleLogin}>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          type="password"
          bind:value={password}
          placeholder={$t('auth.password')}
          autocomplete="current-password"
          autofocus
        />
        <button type="submit" disabled={authSubmitting || !password}>
          {authSubmitting ? $t('auth.unlocking') : $t('auth.unlock')}
        </button>
      </form>
      {#if authError}
        <div class="auth-error">{authError}</div>
      {/if}
    </section>
  {/if}
{:else}
<div class="app" class:collapsed>

  <aside class="sidebar" class:open={mobileOpen}>
    <div class="sidebar-inner">

      <a href="/" class="brand">
        <svg class="brand-logo" width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor"/>
          <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
          <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
          <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
        </svg>
        {#if !collapsed}
          <span class="brand-name">AIUsage</span>
        {/if}
      </a>

      <nav class="sidebar-nav">
        {#each NAV_GROUPS as group}
          <div class="nav-group">
            {#if !collapsed}
              <div class="group-label">{$t(group.key)}</div>
            {/if}
            {#each group.items as item}
              <a
                href={item.path}
                class="nav-item"
                class:active={$page.url.pathname === item.path}
                title={collapsed ? $t(item.key) : undefined}
              >
                <span class="nav-icon"><svelte:component this={item.icon} size={16} strokeWidth={1.75} /></span>
                {#if !collapsed}
                  <span class="nav-label">{$t(item.key)}</span>
                {/if}
              </a>
            {/each}
          </div>
        {/each}
      </nav>

      <div class="sidebar-footer">
        <button
          class="ctrl-btn sync-btn"
          on:click={handleSync}
          disabled={syncing}
          title={syncStatus
            ? `${$t('sync.lastSync')}: ${formatSyncTime(syncStatus.lastSyncAt)}`
            : $t('sync.notConfigured')}
        >
          <span class="ctrl-icon" class:spinning={syncing}>{#if syncing}<RefreshCw size={14} strokeWidth={1.75} />{:else}<ArrowUpDown size={14} strokeWidth={1.75} />{/if}</span>
          {#if !collapsed}
            <span class="ctrl-label" class:ok={syncResult === $t('sync.complete')} class:err={syncResult === $t('sync.failed')}>
              {syncResult || $t('sync.trigger')}
            </span>
          {/if}
        </button>

        <button class="ctrl-btn" on:click={cycleTheme} title={$t(`theme.${$userPref}`)}>
          <span class="ctrl-icon"><svelte:component this={themeIcons[$userPref]} size={14} strokeWidth={1.75} /></span>
          {#if !collapsed}
            <span class="ctrl-label">{$t(`theme.${$userPref}`)}</span>
          {/if}
        </button>

        <button class="ctrl-btn" on:click={toggleLang} title={$lang === 'en' ? '中文' : 'EN'}>
          <span class="ctrl-icon lang-icon">{$lang === 'en' ? '中' : 'EN'}</span>
          {#if !collapsed}
            <span class="ctrl-label">{$lang === 'en' ? '中文' : 'English'}</span>
          {/if}
        </button>

        <button class="ctrl-btn collapse-btn" on:click={toggleSidebar} title={$t(collapsed ? 'nav.expand' : 'nav.collapse')}>
          <span class="ctrl-icon">{#if collapsed}<PanelLeftOpen size={14} strokeWidth={1.75} />{:else}<PanelLeftClose size={14} strokeWidth={1.75} />{/if}</span>
          {#if !collapsed}
            <span class="ctrl-label">{$t('nav.collapse')}</span>
          {/if}
        </button>

        <a class="ctrl-btn" href="https://aiusage.jtanx.com" target="_blank" rel="noopener" title="aiusage.jtanx.com">
          <span class="ctrl-icon"><ExternalLink size={14} strokeWidth={1.75} /></span>
          {#if !collapsed}
            <span class="ctrl-label">{$lang === 'en' ? 'Website' : '官网'}</span>
          {/if}
        </a>
      </div>

    </div>
  </aside>

  <div class="main-area">

    <header class="mobile-header">
      <button class="hamburger" on:click={toggleMobile}>
        <span></span><span></span><span></span>
      </button>
      <a href="/" class="brand brand-mobile">
        <svg class="brand-logo" width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor"/>
          <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
          <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
          <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
        </svg>
        <span class="brand-name">AIUsage</span>
      </a>
      <div class="mobile-controls">
        <button class="ctrl-btn" on:click={cycleTheme}>
          <span class="ctrl-icon"><svelte:component this={themeIcons[$userPref]} size={14} strokeWidth={1.75} /></span>
        </button>
        <button class="ctrl-btn" on:click={toggleLang}>
          <span class="ctrl-icon lang-icon">{$lang === 'en' ? '中' : 'EN'}</span>
        </button>
      </div>
    </header>

    <main class="page-content">
      <slot />
    </main>

  </div>

</div>
{/if}

<style>
  /* ── Reset & base ─────────────────────────────────────────────────────── */
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  :global(html) {
    font-size: 18px;
  }
  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    transition: background 0.2s ease, color 0.2s ease;
  }

  /* ── Light theme (default) ────────────────────────────────────────────── */
  :global(:root) {
    --bg:               oklch(0.985 0.004 175);
    --surface:          oklch(0.995 0.003 175);
    --raised:           oklch(0.97 0.006 175);
    --hover:            oklch(0.955 0.008 175);
    --sidebar-bg:       oklch(0.98 0.005 175);
    --border-subtle:    oklch(0.92 0.008 175);
    --border-medium:    oklch(0.87 0.01 175);
    --text:             oklch(0.18 0.012 175);
    --text-secondary:   oklch(0.42 0.015 175);
    --text-muted:       oklch(0.6 0.012 175);
    --accent:           oklch(0.55 0.12 175);
    --accent-dim:       oklch(0.55 0.12 175 / 0.1);
    --accent-hover:     oklch(0.50 0.13 175);
    --green:            oklch(0.62 0.17 155);
    --green-dim:        oklch(0.62 0.17 155 / 0.1);
    --blue:             oklch(0.55 0.14 250);
    --blue-dim:         oklch(0.55 0.14 250 / 0.1);
    --purple:           oklch(0.58 0.16 300);
    --purple-dim:       oklch(0.58 0.16 300 / 0.1);
    --rose:             oklch(0.58 0.2 25);
    --rose-dim:         oklch(0.58 0.2 25 / 0.1);
    --badge-override-bg: oklch(0.55 0.12 175 / 0.1);
    --badge-override-fg: oklch(0.55 0.12 175);
    --badge-matched-bg:  oklch(0.62 0.17 155 / 0.1);
    --badge-matched-fg:  oklch(0.62 0.17 155);
    --badge-noprice-bg:  oklch(0.58 0.2 25 / 0.08);
    --badge-noprice-fg:  oklch(0.58 0.2 25);
    --shadow-sm:        0 1px 2px oklch(0 0 0 / 0.05);
    --shadow-md:        0 1px 3px oklch(0 0 0 / 0.08), 0 4px 12px oklch(0 0 0 / 0.04);
    --shadow-lg:        0 4px 8px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.06);
    --overlay:          oklch(0 0 0 / 0.25);
    --mono:             'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
    --sidebar-width:    180px;
    --sidebar-collapsed: 56px;
    --chart-input:      oklch(0.65 0.14 175);
    --chart-output:     oklch(0.6 0.15 250);
    --chart-cache-read: oklch(0.7 0.1 65);
    --chart-cache-write: oklch(0.65 0.12 310);
    --chart-thinking:   oklch(0.62 0.18 20);
    --chart-total:      oklch(0.55 0.12 175);
  }

  /* ── Dark theme ───────────────────────────────────────────────────────── */
  :global(:root[data-theme="dark"]) {
    --bg:               oklch(0.15 0.01 175);
    --surface:          oklch(0.18 0.012 175);
    --raised:           oklch(0.22 0.014 175);
    --hover:            oklch(0.26 0.016 175);
    --sidebar-bg:       oklch(0.14 0.01 175);
    --border-subtle:    oklch(0.25 0.014 175);
    --border-medium:    oklch(0.32 0.016 175);
    --text:             oklch(0.9 0.008 175);
    --text-secondary:   oklch(0.65 0.015 175);
    --text-muted:       oklch(0.45 0.014 175);
    --accent:           oklch(0.7 0.12 175);
    --accent-dim:       oklch(0.7 0.12 175 / 0.12);
    --accent-hover:     oklch(0.75 0.11 175);
    --green:            oklch(0.72 0.16 155);
    --green-dim:        oklch(0.72 0.16 155 / 0.12);
    --blue:             oklch(0.68 0.14 250);
    --blue-dim:         oklch(0.68 0.14 250 / 0.12);
    --purple:           oklch(0.7 0.14 300);
    --purple-dim:       oklch(0.7 0.14 300 / 0.12);
    --rose:             oklch(0.68 0.18 25);
    --rose-dim:         oklch(0.68 0.18 25 / 0.12);
    --badge-override-bg: oklch(0.7 0.12 175 / 0.15);
    --badge-override-fg: oklch(0.7 0.12 175);
    --badge-matched-bg:  oklch(0.72 0.16 155 / 0.15);
    --badge-matched-fg:  oklch(0.72 0.16 155);
    --badge-noprice-bg:  oklch(0.68 0.18 25 / 0.12);
    --badge-noprice-fg:  oklch(0.68 0.18 25);
    --shadow-sm:        0 1px 2px oklch(0 0 0 / 0.2);
    --shadow-md:        0 1px 3px oklch(0 0 0 / 0.3), 0 4px 12px oklch(0 0 0 / 0.15);
    --shadow-lg:        0 4px 8px oklch(0 0 0 / 0.3), 0 12px 32px oklch(0 0 0 / 0.2);
    --overlay:          oklch(0 0 0 / 0.5);
    --chart-input:      oklch(0.72 0.13 175);
    --chart-output:     oklch(0.68 0.14 250);
    --chart-cache-read: oklch(0.75 0.09 65);
    --chart-cache-write: oklch(0.72 0.11 310);
    --chart-thinking:   oklch(0.7 0.17 20);
    --chart-total:      oklch(0.7 0.12 175);
  }

  /* ── App shell ────────────────────────────────────────────────────────── */
  .app {
    display: flex;
    min-height: 100vh;
  }

  .public-shell {
    min-height: 100vh;
    padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 2.5rem;
  }

  .public-header {
    max-width: 1180px;
    margin: 0 auto 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .public-page-content {
    min-height: calc(100vh - 5.25rem);
  }

  .public-page-inner {
    max-width: 1180px;
    margin: 0 auto;
  }

  .public-unlock {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.5rem;
    padding: 0 0.85rem;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .public-unlock:hover {
    border-color: var(--border-medium);
    color: var(--accent);
  }

  .public-lang {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    min-width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
  }

  .public-lang:hover {
    border-color: var(--border-medium);
    color: var(--accent);
  }

  .auth-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: var(--overlay);
    backdrop-filter: blur(8px);
  }

  .auth-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 510;
    transform: translate(-50%, -50%);
  }

  .auth-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--raised);
    color: var(--text-secondary);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }

  .auth-close:hover {
    color: var(--text);
    border-color: var(--border-medium);
  }

  .auth-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background:
      radial-gradient(circle at top left, var(--accent-dim), transparent 30rem),
      var(--bg);
  }

  .auth-card {
    width: min(100%, 380px);
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 1.25rem;
    box-shadow: var(--shadow-lg);
    padding: 1.5rem;
  }

  .auth-brand {
    width: fit-content;
    padding: 0;
    margin-bottom: 1.25rem;
  }

  .auth-card h1 {
    font-size: 1.45rem;
    letter-spacing: -0.03em;
    margin-bottom: 0.35rem;
  }

  .auth-card p {
    color: var(--text-secondary);
    margin-bottom: 1.25rem;
    line-height: 1.5;
  }

  .auth-card form {
    display: grid;
    gap: 0.75rem;
  }

  .auth-card input {
    width: 100%;
    height: 2.75rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-medium);
    background: var(--raised);
    color: var(--text);
    padding: 0 0.9rem;
    font: inherit;
    outline: none;
  }

  .auth-card input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .auth-card button {
    height: 2.75rem;
    border: 0;
    border-radius: 0.75rem;
    background: var(--accent);
    color: white;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .auth-card button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .auth-card .auth-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--raised);
    color: var(--text-secondary);
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1;
  }

  .auth-card .auth-close:hover {
    color: var(--text);
    border-color: var(--border-medium);
  }

  .auth-error {
    margin-top: 0.9rem;
    color: var(--rose);
    font-size: 0.9rem;
  }

  .auth-home {
    display: inline-block;
    margin-top: 1rem;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .auth-home:hover {
    color: var(--accent);
  }

  .auth-loading {
    color: var(--text-secondary);
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  .sidebar {
    width: var(--sidebar-width);
    min-height: 100vh;
    background: var(--sidebar-bg);
    position: fixed;
    top: 0;
    left: 0;
    z-index: 200;
    transition: width 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .app.collapsed .sidebar {
    width: var(--sidebar-collapsed);
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Brand */
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0.875rem;
    text-decoration: none;
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .brand-logo {
    display: block;
    color: var(--accent);
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }
  .brand-name {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 0.8125rem;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .brand-mobile {
    padding: 0;
  }

  /* Nav */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .nav-group {
    margin-bottom: 0.125rem;
  }

  .group-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.5rem 0.875rem 0.25rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.875rem;
    margin: 0 0.375rem;
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    border-radius: 6px;
    transition: color 0.12s, background 0.12s;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
  }
  .nav-item:hover {
    color: var(--text);
    background: var(--hover);
  }
  .nav-item.active {
    color: var(--text);
    background: var(--accent-dim);
    font-weight: 600;
  }

  .nav-icon {
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .nav-label {
    flex: 1;
    min-width: 0;
  }

  /* Sidebar footer */
  .sidebar-footer {
    padding: 0.5rem 0;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem;
    margin: 0 0.375rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
    white-space: nowrap;
    overflow: hidden;
    width: calc(100% - 0.75rem);
    text-align: left;
  }
  .ctrl-btn:hover {
    color: var(--text);
    background: var(--hover);
  }
  .ctrl-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ctrl-icon {
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lang-icon {
    font-size: 0.75rem;
    font-weight: 700;
  }
  .ctrl-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.02em;
    flex: 1;
  }
  .ctrl-label.ok { color: var(--green); }
  .ctrl-label.err { color: var(--rose); }

  .spinning {
    animation: spin 0.9s linear infinite;
    display: inline-block;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .collapse-btn { margin-top: 0.125rem; }

  /* ── Main area ────────────────────────────────────────────────────────── */
  .main-area {
    flex: 1;
    min-width: 0;
    margin-left: var(--sidebar-width);
    transition: margin-left 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .app.collapsed .main-area {
    margin-left: var(--sidebar-collapsed);
  }

  /* Mobile top bar */
  .mobile-header {
    display: none;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .hamburger span {
    display: block;
    width: 16px;
    height: 1.5px;
    background: var(--text-secondary);
    border-radius: 1px;
  }

  .mobile-controls {
    margin-left: auto;
    display: flex;
    gap: 0.125rem;
  }
  .mobile-controls .ctrl-btn {
    padding: 0.25rem 0.5rem;
    width: auto;
    margin: 0;
  }

  /* Page content */
  .page-content {
    flex: 1;
    min-width: 0;
    padding: 2rem 2.5rem;
    width: 100%;
    animation: fadeIn 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* Mobile backdrop */
  .mobile-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: var(--overlay);
    z-index: 190;
  }

  /* ── Global design tokens ─────────────────────────────────────────────── */
  :global(.card) {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem;
    transition: background 0.2s;
    overflow: hidden;
  }

  :global(.section-title) {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  :global(.page-header) {
    margin-bottom: 1.5rem;
  }
  :global(.page-header h1) {
    font-size: 1.375rem;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
    margin-bottom: 0.25rem;
  }
  :global(.page-header p) {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  :global(.page-header-row) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  :global(.filter-bar) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    background: var(--raised);
    border-radius: 8px;
  }

  :global(table) {
    width: 100%;
    border-collapse: collapse;
  }
  :global(th) {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  :global(td) {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: color 0.2s;
  }
  :global(tbody tr) {
    transition: background 0.1s;
  }
  :global(tbody tr:hover) {
    background: var(--hover);
  }

  :global(.mono) { font-family: var(--mono); }
  :global(.accent) { color: var(--accent); }
  :global(.green) { color: var(--green); }
  :global(.blue) { color: var(--blue); }
  :global(.purple) { color: var(--purple); }

  :global(.state-msg) {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  :global(.state-msg h2) {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.375rem;
  }
  :global(.state-msg.error) { color: var(--rose); }

  :global(button) { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }

  /* ── Reduced motion ───────────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* ── Mobile overrides ─────────────────────────────────────────────────── */
  @media (max-width: 800px) {
    .sidebar {
      transform: translateX(-100%);
      width: var(--sidebar-width) !important;
      box-shadow: var(--shadow-lg);
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .main-area {
      margin-left: 0 !important;
    }
    .mobile-header {
      display: flex;
    }
    .mobile-backdrop {
      display: block;
    }
    .page-content {
      padding: 1.25rem 1rem;
    }
    .public-shell {
      padding: 1rem 0.875rem 1.5rem;
    }
    .public-header {
      margin-bottom: 1rem;
    }
    .public-unlock {
      height: 2.25rem;
      padding: 0 0.75rem;
      font-size: 0.8125rem;
    }
    .public-lang {
      min-width: 2.25rem;
      height: 2.25rem;
      padding: 0 0.625rem;
    }

    /* Global mobile font size minimums */
    :global(.mono),
    :global(th),
    :global(td),
    :global(.section-title),
    :global(.group-label),
    :global(.ctrl-label),
    :global(.ctrl-icon) {
      font-size: 0.75rem !important;
    }
    :global(.hero-label),
    :global(.token-label),
    :global(.stat-label) {
      font-size: 0.75rem !important;
    }
    :global(.legend-item),
    :global(.tc-rank) {
      font-size: 0.75rem !important;
    }
  }

  @media (min-width: 801px) {
    .mobile-backdrop { display: none !important; }
  }

  .sync-btn:hover { color: var(--accent); }
</style>
