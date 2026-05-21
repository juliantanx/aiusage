<script>
  import { page } from '$app/stores'
  import { onDestroy, onMount } from 'svelte'
  import { lang, toggleLang, t } from '$lib/i18n.js'
  import { userPref, cycleTheme, initTheme } from '$lib/theme.js'
  import { triggerSync, fetchSyncStatus } from '$lib/api.js'

  const NAV_GROUPS = [
    {
      key: 'nav.group.analytics',
      items: [
        { path: '/',           key: 'nav.home',      icon: '⌖' },
        { path: '/overview',   key: 'nav.overview',  icon: '◈' },
        { path: '/tokens',     key: 'nav.tokens',    icon: '◇' },
        { path: '/cost',       key: 'nav.cost',      icon: '$' },
      ]
    },
    {
      key: 'nav.group.data',
      items: [
        { path: '/models',     key: 'nav.models',    icon: '◆' },
        { path: '/tool-calls', key: 'nav.toolCalls', icon: '⚡' },
        { path: '/projects',   key: 'nav.projects',  icon: '◎' },
        { path: '/sessions',   key: 'nav.sessions',  icon: '≡' },
      ]
    },
    {
      key: 'nav.group.manage',
      items: [
        { path: '/pricing',    key: 'nav.pricing',   icon: '¤' },
        { path: '/settings',   key: 'nav.settings',  icon: '◉' },
        { path: '/docs',       key: 'nav.docs',      icon: '◐' },
      ]
    }
  ]

  const SIDEBAR_KEY = 'aiusage-sidebar-collapsed'

  let collapsed = false
  let mobileOpen = false

  const themeIcons = { system: '◐', dark: '●', light: '○' }

  let syncStatus = null
  let syncing = false
  let syncResult = ''
  let syncPollTimer = null

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

  onMount(() => {
    initTheme()
    loadSyncStatus()
    if (typeof window !== 'undefined') {
      collapsed = localStorage.getItem(SIDEBAR_KEY) === 'true'
    }
  })

  onDestroy(() => {
    if (syncPollTimer) clearInterval(syncPollTimer)
  })

  // Close mobile sidebar on navigation
  $: $page, mobileOpen = false
</script>

<div class="grain"></div>

<!-- Mobile overlay backdrop -->
{#if mobileOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="mobile-backdrop" on:click={toggleMobile}></div>
{/if}

<div class="app" class:collapsed>

  <!-- ── Sidebar ──────────────────────────────────────────────────────────── -->
  <aside class="sidebar" class:open={mobileOpen}>
    <div class="sidebar-inner">

      <!-- Brand -->
      <a href="/" class="brand">
        <span class="brand-logo">⌘</span>
        {#if !collapsed}
          <span class="brand-name">AIUsage</span>
        {/if}
      </a>

      <!-- Nav groups -->
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
                <span class="nav-icon">{item.icon}</span>
                {#if !collapsed}
                  <span class="nav-label">{$t(item.key)}</span>
                {/if}
                {#if $page.url.pathname === item.path}
                  <span class="active-dot"></span>
                {/if}
              </a>
            {/each}
          </div>
        {/each}
      </nav>

      <!-- Footer controls -->
      <div class="sidebar-footer">
        <!-- Sync -->
        <button
          class="ctrl-btn sync-btn"
          on:click={handleSync}
          disabled={syncing}
          title={syncStatus
            ? `${$t('sync.lastSync')}: ${formatSyncTime(syncStatus.lastSyncAt)}`
            : $t('sync.notConfigured')}
        >
          <span class="ctrl-icon" class:spinning={syncing}>{syncing ? '↻' : '⇅'}</span>
          {#if !collapsed}
            <span class="ctrl-label" class:ok={syncResult === $t('sync.complete')} class:err={syncResult === $t('sync.failed')}>
              {syncResult || $t('sync.trigger')}
            </span>
          {/if}
        </button>

        <!-- Theme -->
        <button class="ctrl-btn" on:click={cycleTheme} title={$t(`theme.${$userPref}`)}>
          <span class="ctrl-icon">{themeIcons[$userPref]}</span>
          {#if !collapsed}
            <span class="ctrl-label">{$t(`theme.${$userPref}`)}</span>
          {/if}
        </button>

        <!-- Language -->
        <button class="ctrl-btn" on:click={toggleLang} title={$lang === 'en' ? '中文' : 'EN'}>
          <span class="ctrl-icon lang-icon">{$lang === 'en' ? '中' : 'EN'}</span>
          {#if !collapsed}
            <span class="ctrl-label">{$lang === 'en' ? '中文' : 'English'}</span>
          {/if}
        </button>

        <!-- Collapse toggle -->
        <button class="ctrl-btn collapse-btn" on:click={toggleSidebar} title={collapsed ? 'Expand' : 'Collapse'}>
          <span class="ctrl-icon">{collapsed ? '›' : '‹'}</span>
          {#if !collapsed}
            <span class="ctrl-label">{$t('nav.collapse')}</span>
          {/if}
        </button>
      </div>

    </div>
  </aside>

  <!-- ── Main area ─────────────────────────────────────────────────────────── -->
  <div class="main-area">

    <!-- Mobile top bar -->
    <header class="mobile-header">
      <button class="hamburger" on:click={toggleMobile}>
        <span></span><span></span><span></span>
      </button>
      <a href="/" class="brand brand-mobile">
        <span class="brand-logo">⌘</span>
        <span class="brand-name">AIUsage</span>
      </a>
      <div class="mobile-controls">
        <button class="ctrl-btn" on:click={cycleTheme}>
          <span class="ctrl-icon">{themeIcons[$userPref]}</span>
        </button>
        <button class="ctrl-btn" on:click={toggleLang}>
          <span class="ctrl-icon lang-icon">{$lang === 'en' ? '中' : 'EN'}</span>
        </button>
      </div>
    </header>

    <!-- Page content -->
    <main class="page-content">
      <slot />
    </main>

  </div>

</div>

<style>
  /* ── Reset & base ─────────────────────────────────────────────────────── */
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  :global(body) {
    font-family: 'DM Sans', sans-serif;
    background: var(--bg-base);
    color: var(--text-primary);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* ── Dark theme ───────────────────────────────────────────────────────── */
  :global(:root),
  :global(:root[data-theme="dark"]) {
    --bg-base:         #0c0f17;
    --bg-surface:      #12161f;
    --bg-raised:       #181d2a;
    --bg-hover:        #1e2436;
    --sidebar-bg:      #0e111a;
    --border-subtle:   rgba(255,255,255,0.06);
    --border-medium:   rgba(255,255,255,0.11);
    --text-primary:    #e4ecf4;
    --text-secondary:  #8b96a8;
    --text-muted:      #474f5c;
    --accent:          #f0b429;
    --accent-dim:      rgba(240,180,41,0.12);
    --accent-glow:     rgba(240,180,41,0.28);
    --green:           #2ea66a;
    --green-dim:       rgba(46,166,106,0.13);
    --blue:            #3b82f6;
    --blue-dim:        rgba(59,130,246,0.13);
    --purple:          #a78bfa;
    --purple-dim:      rgba(167,139,250,0.13);
    --rose:            #f43f5e;
    --rose-dim:        rgba(244,63,94,0.13);
    --badge-override-bg:  rgba(240,140,30,0.15);
    --badge-override-fg:  #f5a623;
    --badge-matched-bg:   rgba(46,166,106,0.13);
    --badge-matched-fg:   #4ade80;
    --badge-noprice-bg:   rgba(244,63,94,0.13);
    --badge-noprice-fg:   #f87171;
    --mono:            'JetBrains Mono', monospace;
    --grain-opacity:   0.025;
    --sidebar-width:   224px;
    --sidebar-collapsed: 60px;
  }

  /* ── Light theme ──────────────────────────────────────────────────────── */
  :global(:root[data-theme="light"]) {
    --bg-base:         #f0f2f5;
    --bg-surface:      #ffffff;
    --bg-raised:       #f5f6f8;
    --bg-hover:        #eceef1;
    --sidebar-bg:      #f8f9fb;
    --border-subtle:   rgba(0,0,0,0.07);
    --border-medium:   rgba(0,0,0,0.13);
    --text-primary:    #1a1d23;
    --text-secondary:  #525968;
    --text-muted:      #9ba3af;
    --accent:          #c27d05;
    --accent-dim:      rgba(194,125,5,0.10);
    --accent-glow:     rgba(194,125,5,0.16);
    --green:           #1a7f4b;
    --green-dim:       rgba(26,127,75,0.10);
    --blue:            #2563eb;
    --blue-dim:        rgba(37,99,235,0.10);
    --purple:          #7c3aed;
    --purple-dim:      rgba(124,58,237,0.10);
    --rose:            #dc2626;
    --rose-dim:        rgba(220,38,38,0.10);
    --badge-override-bg:  rgba(194,125,5,0.12);
    --badge-override-fg:  #c27d05;
    --badge-matched-bg:   rgba(26,127,75,0.12);
    --badge-matched-fg:   #1a7f4b;
    --badge-noprice-bg:   rgba(220,38,38,0.10);
    --badge-noprice-fg:   #dc2626;
    --mono:            'JetBrains Mono', monospace;
    --grain-opacity:   0.010;
    --sidebar-width:   224px;
    --sidebar-collapsed: 60px;
  }

  /* ── Grain overlay ────────────────────────────────────────────────────── */
  .grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    opacity: var(--grain-opacity);
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 128px;
  }

  /* ── App shell ────────────────────────────────────────────────────────── */
  .app {
    display: flex;
    min-height: 100vh;
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  .sidebar {
    width: var(--sidebar-width);
    min-height: 100vh;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border-subtle);
    position: fixed;
    top: 0;
    left: 0;
    z-index: 200;
    transition: width 0.22s cubic-bezier(.4,0,.2,1);
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
    gap: 0.6rem;
    padding: 1.1rem 1rem 0.9rem;
    text-decoration: none;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .brand-logo {
    font-size: 1.15rem;
    color: var(--accent);
    filter: drop-shadow(0 0 5px var(--accent-glow));
    flex-shrink: 0;
    width: 24px;
    text-align: center;
    transition: color 0.3s;
  }
  .brand-name {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    transition: color 0.3s;
  }
  .brand-mobile {
    border-bottom: none;
    padding: 0;
  }

  /* Nav */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.75rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .nav-group {
    margin-bottom: 0.25rem;
  }

  .group-label {
    font-family: var(--mono);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.6rem 1rem 0.3rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.48rem 1rem;
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-weight: 500;
    border-left: 2px solid transparent;
    transition: color 0.14s, background 0.14s, border-color 0.14s;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
  }
  .nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
  .nav-item.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-left-color: var(--accent);
    font-weight: 600;
  }

  .nav-icon {
    font-family: var(--mono);
    font-size: 0.85rem;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    line-height: 1;
  }
  .nav-label {
    flex: 1;
    min-width: 0;
  }
  .active-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    box-shadow: 0 0 6px var(--accent-glow);
  }

  /* Sidebar footer */
  .sidebar-footer {
    padding: 0.6rem 0;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.42rem 1rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.14s, background 0.14s;
    white-space: nowrap;
    overflow: hidden;
    width: 100%;
    text-align: left;
  }
  .ctrl-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
  .ctrl-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ctrl-icon {
    font-family: var(--mono);
    font-size: 0.85rem;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    line-height: 1;
  }
  .lang-icon {
    font-size: 0.65rem;
    font-weight: 700;
  }
  .ctrl-label {
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 600;
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

  .collapse-btn { margin-top: 0.15rem; }

  /* ── Main area ────────────────────────────────────────────────────────── */
  .main-area {
    flex: 1;
    margin-left: var(--sidebar-width);
    transition: margin-left 0.22s cubic-bezier(.4,0,.2,1);
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
    padding: 0.65rem 1rem;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .hamburger span {
    display: block;
    width: 18px;
    height: 2px;
    background: var(--text-secondary);
    border-radius: 1px;
    transition: background 0.15s;
  }
  .hamburger:hover span { background: var(--text-primary); }

  .mobile-controls {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
  }
  .mobile-controls .ctrl-btn {
    padding: 0.3rem 0.5rem;
    width: auto;
  }

  /* Page content */
  .page-content {
    flex: 1;
    padding: 2rem 2.5rem;
    max-width: 1100px;
    width: 100%;
    animation: fadeUp 0.35s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(7px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Mobile backdrop */
  .mobile-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(3px);
    z-index: 190;
  }

  /* ── Global design tokens ─────────────────────────────────────────────── */
  :global(.card) {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1.25rem;
    transition: border-color 0.18s, background 0.3s;
  }
  :global(.card:hover) {
    border-color: var(--border-medium);
  }

  :global(.section-title) {
    font-family: var(--mono);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 0.8rem;
  }

  :global(.page-header) {
    margin-bottom: 1.75rem;
  }
  :global(.page-header h1) {
    font-family: var(--mono);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    margin-bottom: 0.3rem;
  }
  :global(.page-header p) {
    font-size: 0.82rem;
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
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    padding: 0.65rem 0.9rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
  }

  :global(table) {
    width: 100%;
    border-collapse: collapse;
  }
  :global(th) {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  :global(td) {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.84rem;
    color: var(--text-secondary);
    transition: color 0.3s;
  }
  :global(tbody tr) {
    transition: background 0.14s;
  }
  :global(tbody tr:hover) {
    background: var(--bg-hover);
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
    font-size: 0.88rem;
  }
  :global(.state-msg h2) {
    font-family: var(--mono);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }
  :global(.state-msg.error) { color: var(--rose); }

  :global(button) { font-family: 'DM Sans', sans-serif; }

  /* ── Mobile overrides ─────────────────────────────────────────────────── */
  @media (max-width: 800px) {
    .sidebar {
      transform: translateX(-100%);
      width: var(--sidebar-width) !important;
      box-shadow: 4px 0 24px rgba(0,0,0,0.3);
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
  }

  @media (min-width: 801px) {
    .mobile-backdrop { display: none !important; }
  }

  /* ── Sync btn accents ─────────────────────────────────────────────────── */
  .sync-btn:hover { color: var(--accent); }
</style>
