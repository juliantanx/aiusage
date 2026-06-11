<script>
  import { onMount, onDestroy } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import { fetchSummary, refreshData as triggerRefresh, fetchConfig, fetchQuotas, SETTINGS_UPDATED_EVENT } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import { formatCost, displayCurrency, exchangeRate } from '$lib/stores.js'

  const DISPLAY_KEY = 'aiusage-home-display'

  const RANGE_OPTIONS = [
    { tKey: 'range.allTime', value: 'all' },
    { tKey: 'range.today',   value: 'day' },
    { tKey: 'range.week',    value: 'week' },
    { tKey: 'range.month',   value: 'month' },
    { tKey: 'range.last30',  value: 'last30' },
  ]

  function defaultDisplay() {
    return { range: 'all', precision: 'exact' }
  }

  function loadDisplay() {
    if (typeof window === 'undefined') return defaultDisplay()
    try { return { ...defaultDisplay(), ...JSON.parse(localStorage.getItem(DISPLAY_KEY) || '{}') } }
    catch { return defaultDisplay() }
  }

  function saveDisplay(d) {
    if (typeof window !== 'undefined') localStorage.setItem(DISPLAY_KEY, JSON.stringify(d))
  }

  let display = defaultDisplay()
  let showConfig = false

  let globalRefreshMs = 30000

  $: fmtMain = (n) => {
    const r = Math.round(n)
    if (display.precision === 'abbr') {
      if (r >= 1_000_000_000) return (r / 1_000_000_000).toFixed(3) + 'B'
      if (r >= 1_000_000)     return (r / 1_000_000).toFixed(3) + 'M'
      if (r >= 1_000)         return (r / 1_000).toFixed(1) + 'K'
    }
    return r.toLocaleString()
  }

  let data       = null
  let error      = null
  let loading    = true
  let refreshing = false
  let barsReady  = false

  const tTokens   = tweened(0, { duration: 2600, easing: cubicOut })
  const tCost     = tweened(0, { duration: 2300, easing: cubicOut })
  const tSessions = tweened(0, { duration: 1900, easing: cubicOut })
  const tDays     = tweened(0, { duration: 1600, easing: cubicOut })

  async function fetchAndApply(fast = false) {
    const d = fast ? 500 : 2600
    error = null
    try {
      const newData = await fetchSummary({ range: display.range })
      if (newData) {
        data = newData
        tTokens.set(newData.totalTokens,       { duration: d })
        tCost.set(newData.totalCost,           { duration: Math.round(d * 0.88) })
        tSessions.set(newData.totalSessions || 0, { duration: Math.round(d * 0.73) })
        tDays.set(newData.activeDays,          { duration: Math.round(d * 0.62) })
        barsReady = false
        setTimeout(() => { barsReady = true }, fast ? 80 : 400)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load'
      data = null
    }
  }

  async function loadData() {
    loading = true
    tTokens.set(0, { duration: 0 })
    tCost.set(0,   { duration: 0 })
    tSessions.set(0, { duration: 0 })
    tDays.set(0,   { duration: 0 })
    barsReady = false
    await fetchAndApply(false)
    loading = false
  }

  async function silentRefresh() {
    refreshing = true
    await fetchAndApply(true)
    refreshing = false
  }

  let countdown      = 0
  let countdownTimer = null
  let refreshTimeout = null

  function startRefreshCycle() {
    clearInterval(countdownTimer)
    clearTimeout(refreshTimeout)
    const secs = Math.round(globalRefreshMs / 1000)
    if (!secs) { countdown = 0; return }
    countdown = secs
    countdownTimer = setInterval(() => { countdown = Math.max(0, countdown - 1) }, 1000)
    refreshTimeout = setTimeout(() => {
      silentRefresh().then(startRefreshCycle)
    }, globalRefreshMs)
  }

  function manualRefresh() {
    clearInterval(countdownTimer)
    clearTimeout(refreshTimeout)
    silentRefresh().then(() => startRefreshCycle())
  }

  function handleSettingsUpdated(event) {
    globalRefreshMs = event?.detail?.refreshInterval ?? 30000
    startRefreshCycle()
  }

  let now         = new Date()
  let clockTimer  = null

  onMount(async () => {
    display = loadDisplay()
    clockTimer = setInterval(() => { now = new Date() }, 1000)

    try {
      const cfg = await fetchConfig()
      if (cfg?.refreshInterval) globalRefreshMs = cfg.refreshInterval
    } catch {}

    await triggerRefresh().catch(() => {})
    await Promise.all([loadData(), loadQuotaWarnings()])
    startRefreshCycle()

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
  })

  onDestroy(() => {
    clearInterval(clockTimer)
    clearInterval(countdownTimer)
    clearTimeout(refreshTimeout)
    if (typeof window !== 'undefined') {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    }
  })

  $: timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  $: dateStr  = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

  $: tokenParts    = data ? (data.inputTokens||0)+(data.outputTokens||0)+(data.cacheReadTokens||0)+(data.cacheWriteTokens||0) : 0
  $: inputPct      = tokenParts > 0 ? (data.inputTokens     / tokenParts) * 100 : 0
  $: outputPct     = tokenParts > 0 ? (data.outputTokens    / tokenParts) * 100 : 0
  $: cacheReadPct  = tokenParts > 0 ? (data.cacheReadTokens / tokenParts) * 100 : 0
  $: cacheWritePct = tokenParts > 0 ? (data.cacheWriteTokens/ tokenParts) * 100 : 0

  $: refreshSecs  = Math.round(globalRefreshMs / 1000)
  $: refreshPct   = refreshSecs > 0 ? (1 - countdown / refreshSecs) * 100 : 0
  $: rangeKey     = RANGE_OPTIONS.find(r => r.value === display.range)?.tKey ?? 'range.allTime'

  // Reactive cost formatting — depends on $displayCurrency and $exchangeRate so it re-evaluates on currency change
  $: formattedCost = (() => { void $displayCurrency; void $exchangeRate; return formatCost($tCost) })()

  // Quota warning: load once on mount, show banner when any tier >= 80%
  let quotaWarnings = []

  async function loadQuotaWarnings() {
    try {
      const result = await fetchQuotas()
      const warnings = []
      for (const quota of result?.quotas ?? []) {
        if (!quota.success) continue
        for (const tier of quota.tiers ?? []) {
          if (tier.utilization >= 80) {
            warnings.push({ tool: quota.tool, tier: tier.name, utilization: Math.round(tier.utilization) })
          }
        }
      }
      quotaWarnings = warnings
    } catch {
      // Quota warnings are non-critical — silently ignore errors
    }
  }

  const TOOL_SHORT = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
  }
  const TIER_SHORT = {
    five_hour: '5h',
    seven_day: '7d',
    seven_day_opus: '7d Opus',
    seven_day_sonnet: '7d Sonnet',
    seven_day_omelette: '7d Design',
    weekly_limit: 'weekly',
  }

  function warningColor(pct) {
    return pct >= 90 ? 'red' : 'orange'
  }

  function fmtShort(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
    return n.toLocaleString()
  }

  function setRange(v) {
    display = { ...display, range: v }
    saveDisplay(display)
    loadData().then(() => startRefreshCycle())
  }

  function setPrecision(v) {
    display = { ...display, precision: v }
    saveDisplay(display)
  }
</script>

<svelte:head>
  <title>AIUsage</title>
</svelte:head>

{#if showConfig}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="overlay-backdrop" on:click={() => showConfig = false}></div>
  <div class="config-panel" role="dialog">
    <div class="cfg-header">
      <span class="cfg-title">{$t('home.cfgTitle')}</span>
      <button class="cfg-close" on:click={() => showConfig = false}>✕</button>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">{$t('home.timeRange')}</div>
      <div class="cfg-pills">
        {#each RANGE_OPTIONS as opt}
          <button class="pill" class:active={display.range === opt.value} on:click={() => setRange(opt.value)}>
            {$t(opt.tKey)}
          </button>
        {/each}
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">{$t('home.numFormat')}</div>
      <div class="cfg-pills">
        <button class="pill" class:active={display.precision === 'exact'} on:click={() => setPrecision('exact')}>
          {$t('home.numExact')} <span class="pill-eg">{$t('home.numExactEx')}</span>
        </button>
        <button class="pill" class:active={display.precision === 'abbr'} on:click={() => setPrecision('abbr')}>
          {$t('home.numShort')} <span class="pill-eg">{$t('home.numShortEx')}</span>
        </button>
      </div>
    </div>

    <div class="cfg-refresh-info">
      <span class="refresh-info-text">
        {$t('home.refreshInfo')}
        <a href="/settings" class="settings-link" on:click={() => showConfig = false}>{$t('nav.settings')}</a>
        · {refreshSecs}{$t('home.seconds')}
      </span>
    </div>
  </div>
{/if}

<div class="top-bar">
  <div class="live-indicator">
    <span class="live-dot"></span>
    <span class="live-label">LIVE</span>
  </div>

  <span class="range-badge">{$t(rangeKey)}</span>

  <div class="clock-block">
    <span class="clock-time">{timeStr}</span>
    <span class="clock-date">{dateStr}</span>
  </div>

  <button class="cfg-btn" on:click={() => showConfig = !showConfig} title={$t('home.cfgTitle')}>
    ⚙
  </button>
</div>

{#if quotaWarnings.length > 0}
  <div class="quota-warning-list">
    {#each quotaWarnings as w (w.tool + w.tier)}
      {@const color = warningColor(w.utilization)}
      <div class="quota-warning" class:quota-red={color === 'red'} class:quota-orange={color === 'orange'}>
        <span class="warn-icon">{color === 'red' ? '▲' : '△'}</span>
        <span class="warn-text">
          <strong>{TOOL_SHORT[w.tool] ?? w.tool}</strong>
          {TIER_SHORT[w.tier] ?? w.tier}
          {$t('home.quotaWarningDesc')}: <strong>{w.utilization}%</strong>
        </span>
        <a href="/quotas" class="warn-link">{$t('home.quotaWarningLink')} →</a>
      </div>
    {/each}
  </div>
{/if}

{#if loading}
  <div class="splash-loading">
    <span class="splash-text">{$t('common.loading')}</span>
  </div>
{:else if error}
  <div class="splash-error">
    <span class="err-msg">{error}</span>
    <button class="retry-btn" on:click={manualRefresh}>{$t('home.refreshBtn')}</button>
  </div>
{:else if !data || data.totalTokens === 0}
  <div class="splash-empty">
    <span class="empty-title">{$t('common.noData')}</span>
    <span class="empty-hint">{$t('common.noDataHint')}</span>
  </div>
{:else}

  <section class="counter-section">
    <div class="counter-label">{$t('home.counterLabel')}</div>

    <div class="counter-number" class:refreshing>
      {fmtMain($tTokens)}
    </div>

    <div class="counter-sub">
      <div class="sub-item">
        <span class="sub-label">{$t('home.input')}</span>
        <span class="sub-value">{fmtShort(data.inputTokens)}</span>
      </div>
      <div class="sub-divider"></div>
      <div class="sub-item">
        <span class="sub-label">{$t('home.output')}</span>
        <span class="sub-value">{fmtShort(data.outputTokens)}</span>
      </div>
      <div class="sub-divider"></div>
      <div class="sub-item">
        <span class="sub-label">{$t('home.cache')}</span>
        <span class="sub-value">{fmtShort((data.cacheReadTokens||0)+(data.cacheWriteTokens||0))}</span>
      </div>
    </div>

    <div class="refresh-bar-track">
      {#if refreshSecs > 0}
        <div class="refresh-bar-fill" style="width: {refreshPct}%"></div>
      {/if}
    </div>
    <div class="refresh-meta">
      {#if refreshSecs > 0}
        {#if countdown > 0}
          <span>{$t('home.nextRefresh')} {countdown}{$t('home.seconds')}</span>
        {:else}
          <span class="refreshing-label">{$t('home.refreshing')}</span>
        {/if}
      {:else}
        <span>{$t('home.manualMode')}</span>
      {/if}
      <button class="now-btn" on:click={manualRefresh}>
        {refreshSecs > 0 ? $t('home.refreshNow') : $t('home.refreshBtn')}
      </button>
    </div>
  </section>

  <div class="stats-strip">
    <div class="stat-block">
      <span class="stat-label">{$t('overview.totalCost')}</span>
      <span class="stat-value stat-cost">{formattedCost}</span>
    </div>
    <div class="stat-block">
      <span class="stat-label">{$t('overview.totalSessions')}</span>
      <span class="stat-value">{Math.round($tSessions).toLocaleString()}</span>
    </div>
    <div class="stat-block">
      <span class="stat-label">{$t('overview.activeDays')}</span>
      <span class="stat-value">{Math.round($tDays).toLocaleString()}</span>
    </div>
  </div>

  <div class="comp-wrap">
    <div class="comp-bar">
      <div class="seg seg-input"  style="width:{barsReady ? inputPct     : 0}%" title="{$t('home.input')} {inputPct.toFixed(1)}%">
        {#if inputPct > 9}<span class="seg-lbl">{$t('home.input')} {inputPct.toFixed(0)}%</span>{/if}
      </div>
      <div class="seg seg-output" style="width:{barsReady ? outputPct    : 0}%" title="{$t('home.output')} {outputPct.toFixed(1)}%">
        {#if outputPct > 9}<span class="seg-lbl">{$t('home.output')} {outputPct.toFixed(0)}%</span>{/if}
      </div>
      <div class="seg seg-cr"     style="width:{barsReady ? cacheReadPct : 0}%" title="Cache R {cacheReadPct.toFixed(1)}%">
        {#if cacheReadPct > 9}<span class="seg-lbl">Cache R {cacheReadPct.toFixed(0)}%</span>{/if}
      </div>
      <div class="seg seg-cw"     style="width:{barsReady ? cacheWritePct: 0}%" title="Cache W {cacheWritePct.toFixed(1)}%">
        {#if cacheWritePct > 9}<span class="seg-lbl">Cache W {cacheWritePct.toFixed(0)}%</span>{/if}
      </div>
    </div>
    <div class="comp-legend">
      <span class="leg leg-i">{$t('home.input')}</span>
      <span class="leg leg-o">{$t('home.output')}</span>
      <span class="leg leg-cr">Cache Read</span>
      <span class="leg leg-cw">Cache Write</span>
    </div>
  </div>

{/if}

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--raised);
    border-radius: 8px;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    background: var(--green-dim);
    flex-shrink: 0;
  }
  .live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--green);
  }
  .live-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.1em;
    color: var(--green);
  }

  .range-badge {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-dim);
    border-radius: 4px;
    padding: 0.125rem 0.5rem;
  }

  .clock-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-left: auto;
    gap: 0;
  }
  .clock-time {
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .clock-date {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .cfg-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.12s;
    flex-shrink: 0;
    font-size: 0.8rem;
  }
  .cfg-btn:hover { color: var(--text); }

  /* ── Counter ─────────────────────────────────────────────────────────── */
  .counter-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.5rem 2rem 1.5rem;
    margin-bottom: 1rem;
    background: var(--surface);
    border-radius: 12px;
  }

  .counter-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .counter-number {
    font-family: var(--mono);
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    transition: opacity 0.2s;
  }
  .counter-number.refreshing { opacity: 0.5; }

  .counter-sub {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-top: 1.25rem;
  }
  .sub-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }
  .sub-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .sub-value {
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .sub-divider {
    width: 1px;
    height: 24px;
    background: var(--border-subtle);
  }

  .refresh-bar-track {
    width: 100%;
    height: 2px;
    background: var(--border-subtle);
    border-radius: 1px;
    margin-top: 1.5rem;
    overflow: hidden;
  }
  .refresh-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 1px;
    transition: width 1s linear;
  }
  .refresh-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.375rem;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-muted);
    width: 100%;
  }
  .refreshing-label { color: var(--accent); }
  .now-btn {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: transparent;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .now-btn:hover { color: var(--text); border-color: var(--border-medium); }

  /* ── Stats strip ─────────────────────────────────────────────────────── */
  .stats-strip {
    display: flex;
    background: var(--surface);
    border-radius: 8px;
    margin-bottom: 1rem;
    overflow: hidden;
  }
  .stat-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem 1.25rem;
    transition: background 0.1s;
  }
  .stat-block:not(:last-child) {
    border-right: 1px solid var(--border-subtle);
  }
  .stat-block:hover { background: var(--raised); }
  .stat-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .stat-value {
    font-family: var(--mono);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .stat-cost { color: var(--accent); }

  /* ── Composition bar ─────────────────────────────────────────────────── */
  .comp-wrap { margin-bottom: 0.5rem; }
  .comp-bar {
    display: flex;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--raised);
  }
  .seg {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
    transition: width 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  .seg-lbl {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    padding: 0 4px;
    color: var(--surface);
  }
  .seg-input  { background: var(--chart-input); }
  .seg-output { background: var(--chart-output); }
  .seg-cr     { background: var(--chart-cache-read); }
  .seg-cw     { background: var(--chart-cache-write); }

  .comp-legend {
    display: flex;
    gap: 1rem;
    margin-top: 0.375rem;
    flex-wrap: wrap;
  }
  .leg {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .leg::before {
    content: '■';
    margin-right: 0.25rem;
    font-size: 0.5rem;
  }
  .leg-i  { color: var(--chart-input); }
  .leg-o  { color: var(--chart-output); }
  .leg-cr { color: var(--chart-cache-read); }
  .leg-cw { color: var(--chart-cache-write); }
  .leg-i::before  { color: var(--chart-input); }
  .leg-o::before  { color: var(--chart-output); }
  .leg-cr::before { color: var(--chart-cache-read); }
  .leg-cw::before { color: var(--chart-cache-write); }

  /* ── Config panel ────────────────────────────────────────────────────── */
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--overlay);
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .config-panel {
    position: fixed;
    z-index: 201;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(400px, 90vw);
    background: var(--surface);
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: var(--shadow-lg);
  }

  .cfg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .cfg-title {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .cfg-close {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.12s;
  }
  .cfg-close:hover { color: var(--rose); }

  .cfg-section { margin-bottom: 1rem; }
  .cfg-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.375rem;
  }
  .cfg-pills { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .pill {
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: transparent;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
    white-space: nowrap;
  }
  .pill:hover { border-color: var(--accent); color: var(--accent); }
  .pill.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .pill-eg { opacity: 0.5; font-size: 0.75rem; margin-left: 0.25rem; }

  .cfg-refresh-info {
    margin-top: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: 6px;
    background: var(--raised);
  }
  .refresh-info-text {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-muted);
  }
  .settings-link {
    color: var(--accent);
    text-decoration: none;
  }
  .settings-link:hover { text-decoration: underline; }

  /* ── Quota warning banner ────────────────────────────────────────────── */
  .quota-warning-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .quota-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    border-radius: 7px;
    font-size: 0.8rem;
    border: 1px solid transparent;
  }

  .quota-orange {
    background: oklch(0.97 0.03 60);
    border-color: oklch(0.87 0.08 60);
    color: oklch(0.45 0.14 55);
  }
  :global(:root[data-theme="dark"]) .quota-orange {
    background: oklch(0.2 0.04 55);
    border-color: oklch(0.35 0.1 55);
    color: oklch(0.78 0.14 60);
  }

  .quota-red {
    background: var(--rose-dim);
    border-color: oklch(0.7 0.12 25);
    color: var(--rose);
  }

  .warn-icon {
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .warn-text {
    flex: 1;
    min-width: 0;
  }

  .warn-link {
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
    color: inherit;
    opacity: 0.8;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .warn-link:hover { opacity: 1; text-decoration: underline; }

  /* ── Splash states ───────────────────────────────────────────────────── */
  .splash-loading, .splash-error, .splash-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 320px;
    text-align: center;
  }
  .splash-text {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .err-msg { font-size: 0.8125rem; color: var(--text-muted); }
  .retry-btn {
    margin-top: 0.25rem;
    padding: 0.375rem 1rem;
    border: 1px solid var(--rose);
    border-radius: 6px;
    background: transparent;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--rose);
    cursor: pointer;
    transition: background 0.12s;
  }
  .retry-btn:hover { background: var(--rose-dim); }

  .empty-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .empty-hint { font-size: 0.8125rem; color: var(--text-muted); }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 800px) {
    .counter-section { padding: 2rem 1rem 1.25rem; }
    .counter-sub { gap: 1rem; }
    .stats-strip { flex-direction: column; }
    .stat-block:not(:last-child) { border-right: none; border-bottom: 1px solid var(--border-subtle); }
    .top-bar {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 0.5rem;
    }
    .clock-block {
      margin-left: 0;
      align-items: flex-end;
      justify-self: end;
    }
    .cfg-btn { justify-self: end; }
  }
</style>
