<script>
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { lang, toggleLang, t } from '$lib/i18n.js'
  import { userPref, resolvedTheme, cycleTheme, initTheme } from '$lib/theme.js'
  import { triggerSync, fetchSyncStatus } from '$lib/api.js'

  const navItems = [
    { path: '/', key: 'nav.overview' },
    { path: '/tokens', key: 'nav.tokens' },
    { path: '/cost', key: 'nav.cost' },
    { path: '/models', key: 'nav.models' },
    { path: '/tool-calls', key: 'nav.toolCalls' },
    { path: '/projects', key: 'nav.projects' },
    { path: '/sessions', key: 'nav.sessions' },
    { path: '/pricing', key: 'nav.pricing' },
  ]

  const themeIcons = {
    system: '◐',
    dark: '●',
    light: '○',
  }

  let syncStatus = null
  let syncing = false
  let syncResult = ''

  async function loadSyncStatus() {
    try {
      const data = await fetchSyncStatus()
      syncStatus = data.status
    } catch {
      syncStatus = null
    }
  }

  async function handleSync() {
    syncing = true
    syncResult = ''
    try {
      const result = await triggerSync()
      if (result.status === 'ok') {
        syncResult = $t('sync.complete')
      } else {
        syncResult = result.error || $t('sync.failed')
      }
      await loadSyncStatus()
    } catch {
      syncResult = $t('sync.failed')
    } finally {
      syncing = false
      setTimeout(() => { syncResult = '' }, 3000)
    }
  }

  function formatSyncTime(ts) {
    if (!ts) return $t('sync.never')
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  onMount(() => {
    initTheme()
    loadSyncStatus()
  })
</script>

<div class="grain"></div>

<div class="app">
  <header>
    <div class="brand">
      <span class="logo">⌘</span>
      <span class="name">AIUsage</span>
    </div>
    <nav>
      {#each navItems as item}
        <a
          href={item.path}
          class:active={$page.url.pathname === item.path}
        >{$t(item.key)}</a>
      {/each}
    </nav>
    <div class="controls">
      <button class="sync-toggle" on:click={handleSync} disabled={syncing} title={syncStatus ? `${$t('sync.lastSync')}: ${formatSyncTime(syncStatus.lastSyncAt)}` : $t('sync.notConfigured')}>
        <span class="sync-icon">{syncing ? '↻' : '⇅'}</span>
        {#if syncing}
          <span class="sync-label">{$t('sync.syncing')}</span>
        {:else if syncResult}
          <span class="sync-label" class:ok={syncResult === $t('sync.complete')} class:err={syncResult === $t('sync.failed')}>{syncResult}</span>
        {:else}
          <span class="sync-label">{$t('sync.trigger')}</span>
        {/if}
      </button>
      <button class="theme-toggle" on:click={cycleTheme} title={$t(`theme.${$userPref}`)}>
        <span class="theme-icon">{themeIcons[$userPref]}</span>
        <span class="theme-label">{$t(`theme.${$userPref}`)}</span>
      </button>
      <button class="lang-toggle" on:click={toggleLang}>
        {$lang === 'en' ? '中文' : 'EN'}
      </button>
    </div>
  </header>

  <main>
    <slot />
  </main>
</div>

<style>
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

  /* ── Dark theme (default) ─────────────────────────── */
  :global(:root),
  :global(:root[data-theme="dark"]) {
    --bg-base: #0b0e14;
    --bg-surface: #111620;
    --bg-raised: #171c28;
    --bg-hover: #1c2333;
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-medium: rgba(255, 255, 255, 0.1);
    --text-primary: #e6edf3;
    --text-secondary: #8b949e;
    --text-muted: #484f58;
    --accent: #f0b429;
    --accent-dim: rgba(240, 180, 41, 0.15);
    --accent-glow: rgba(240, 180, 41, 0.3);
    --green: #2ea66a;
    --green-dim: rgba(46, 166, 106, 0.15);
    --blue: #3b82f6;
    --blue-dim: rgba(59, 130, 246, 0.15);
    --purple: #a78bfa;
    --purple-dim: rgba(167, 139, 250, 0.15);
    --rose: #f43f5e;
    --rose-dim: rgba(244, 63, 94, 0.15);
    --mono: 'JetBrains Mono', monospace;
    --grain-opacity: 0.03;
  }

  /* ── Light theme ──────────────────────────────────── */
  :global(:root[data-theme="light"]) {
    --bg-base: #f4f5f7;
    --bg-surface: #ffffff;
    --bg-raised: #f0f1f3;
    --bg-hover: #e8eaed;
    --border-subtle: rgba(0, 0, 0, 0.07);
    --border-medium: rgba(0, 0, 0, 0.12);
    --text-primary: #1a1d23;
    --text-secondary: #57606a;
    --text-muted: #8b949e;
    --accent: #c78c06;
    --accent-dim: rgba(199, 140, 6, 0.1);
    --accent-glow: rgba(199, 140, 6, 0.15);
    --green: #1a7f4b;
    --green-dim: rgba(26, 127, 75, 0.1);
    --blue: #2563eb;
    --blue-dim: rgba(37, 99, 235, 0.1);
    --purple: #7c3aed;
    --purple-dim: rgba(124, 58, 237, 0.1);
    --rose: #dc2626;
    --rose-dim: rgba(220, 38, 38, 0.1);
    --mono: 'JetBrains Mono', monospace;
    --grain-opacity: 0.015;
  }

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

  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0 2rem;
    height: 56px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
    transition: background 0.3s ease, border-color 0.3s ease;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .logo {
    font-size: 1.25rem;
    color: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow));
    transition: color 0.3s ease;
  }
  .name {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.95rem;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    transition: color 0.3s ease;
  }

  nav {
    display: flex;
    gap: 0.25rem;
    flex: 1;
  }
  nav a {
    text-decoration: none;
    color: var(--text-secondary);
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  nav a:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
  nav a.active {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .sync-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .sync-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 12px var(--accent-dim);
  }
  .sync-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sync-icon {
    font-size: 0.85rem;
    line-height: 1;
  }
  .sync-toggle:disabled .sync-icon {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .sync-label {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .sync-label.ok { color: var(--green); }
  .sync-label.err { color: var(--rose); }

  .theme-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .theme-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 12px var(--accent-dim);
  }
  .theme-icon {
    font-size: 0.85rem;
    line-height: 1;
  }
  .theme-label {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .lang-toggle {
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    letter-spacing: 0.02em;
  }
  .lang-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 12px var(--accent-dim);
  }

  main {
    flex: 1;
    padding: 2rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    animation: fadeUp 0.4s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  :global(.card) {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1.25rem;
    transition: border-color 0.2s ease, background 0.3s ease;
  }
  :global(.card:hover) {
    border-color: var(--border-medium);
  }

  :global(.section-title) {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  :global(table) {
    width: 100%;
    border-collapse: collapse;
  }
  :global(th) {
    font-family: var(--mono);
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  :global(td) {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.85rem;
    color: var(--text-secondary);
    transition: color 0.3s ease;
  }
  :global(tbody tr) {
    transition: background 0.15s ease;
  }
  :global(tbody tr:hover) {
    background: var(--bg-hover);
  }

  :global(.mono) {
    font-family: var(--mono);
  }
  :global(.accent) {
    color: var(--accent);
  }
  :global(.green) {
    color: var(--green);
  }
  :global(.blue) {
    color: var(--blue);
  }
  :global(.purple) {
    color: var(--purple);
  }

  :global(.state-msg) {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  :global(.state-msg h2) {
    font-family: var(--mono);
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }
  :global(.state-msg.error) {
    color: var(--rose);
  }

  :global(button) {
    font-family: 'DM Sans', sans-serif;
  }

  @media (max-width: 768px) {
    header {
      flex-wrap: wrap;
      height: auto;
      padding: 0.75rem 1rem;
      gap: 0.5rem;
    }
    nav {
      order: 3;
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }
    .controls {
      margin-left: auto;
    }
    main {
      padding: 1rem;
    }
  }
</style>
