<script>
  import { onMount, onDestroy } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import { fetchSummary, refreshData as triggerRefresh, fetchConfig } from '$lib/api.js'
  import { t } from '$lib/i18n.js'

  // ── Display config (localStorage, homepage-only) ──────────────────────────
  const DISPLAY_KEY = 'aiusage-home-display'

  // Values must match what the API accepts for range param
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

  // ── Global refresh interval (from Settings → dashboardPollInterval) ───────
  let globalRefreshMs = 30000

  // ── fmtMain is reactive so Svelte re-evaluates when display.precision changes
  $: fmtMain = (n) => {
    const r = Math.round(n)
    if (display.precision === 'abbr') {
      if (r >= 1_000_000_000) return (r / 1_000_000_000).toFixed(3) + 'B'
      if (r >= 1_000_000)     return (r / 1_000_000).toFixed(3) + 'M'
      if (r >= 1_000)         return (r / 1_000).toFixed(1) + 'K'
    }
    return r.toLocaleString()
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  let data       = null
  let error      = null
  let loading    = true
  let refreshing = false
  let barsReady  = false

  const tTokens   = tweened(0, { duration: 2600, easing: cubicOut })
  const tCost     = tweened(0, { duration: 2300, easing: cubicOut })
  const tSessions = tweened(0, { duration: 1900, easing: cubicOut })
  const tDays     = tweened(0, { duration: 1600, easing: cubicOut })

  // Fetch and apply data; fast=true uses short tween (for refresh, not initial load)
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

  // Full cold load: reset counters to 0 first
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

  // Silent refresh: no reset, fast tween from current value
  async function silentRefresh() {
    refreshing = true
    await fetchAndApply(true)
    refreshing = false
  }

  // ── Refresh cycle (interval from global Settings) ─────────────────────────
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

  // ── Clock & pulse ─────────────────────────────────────────────────────────
  let now         = new Date()
  let clockTimer  = null
  let pulseActive = false
  let pulseTimer  = null

  onMount(async () => {
    display = loadDisplay()
    clockTimer = setInterval(() => { now = new Date() }, 1000)
    pulseTimer = setInterval(() => {
      pulseActive = true
      setTimeout(() => { pulseActive = false }, 800)
    }, 4500)

    // Read refresh interval from global config
    try {
      const cfg = await fetchConfig()
      if (cfg?.dashboardPollInterval) globalRefreshMs = cfg.dashboardPollInterval
    } catch {}

    await triggerRefresh().catch(() => {})
    await loadData()
    startRefreshCycle()
  })

  onDestroy(() => {
    clearInterval(clockTimer)
    clearInterval(countdownTimer)
    clearInterval(pulseTimer)
    clearTimeout(refreshTimeout)
  })

  // ── Derived ───────────────────────────────────────────────────────────────
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

  function fmtCost(n) {
    return n < 0.01 ? '$' + n.toFixed(4) : '$' + n.toFixed(2)
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
  <title>AIUsage — Live Counter</title>
</svelte:head>

<!-- ── Config overlay ──────────────────────────────────────────────────────── -->
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
        <a href="/settings" class="settings-link" on:click={() => showConfig = false}>{$t('nav.settings')} ↗</a>
        &nbsp;·&nbsp; {refreshSecs}{$t('home.seconds')}
      </span>
    </div>
  </div>
{/if}

<!-- ── Top bar ──────────────────────────────────────────────────────────────── -->
<div class="top-bar">
  <div class="live-wrap" class:pulse={pulseActive}>
    <span class="live-dot"></span>
    <span class="live-label">LIVE</span>
  </div>

  <div class="range-badge">{$t(rangeKey)}</div>

  <div class="clock-block">
    <span class="clock-time">{timeStr}</span>
    <span class="clock-date">{dateStr}</span>
  </div>

  <button class="cfg-btn" on:click={() => showConfig = !showConfig} title={$t('home.cfgTitle')}>
    <span class="cfg-icon">⚙</span>
  </button>
</div>

<!-- ── Main content ─────────────────────────────────────────────────────────── -->
{#if loading}
  <div class="splash-loading">
    <div class="splash-spinner"></div>
    <span class="splash-text">{$t('common.loading')}</span>
  </div>
{:else if error}
  <div class="splash-error">
    <span class="err-code">ERR</span>
    <span class="err-msg">{error}</span>
    <button class="retry-btn" on:click={manualRefresh}>{$t('home.refreshBtn')}</button>
  </div>
{:else if !data || data.totalTokens === 0}
  <div class="splash-empty">
    <span class="empty-icon">◌</span>
    <span class="empty-title">{$t('common.noData')}</span>
    <span class="empty-hint">{$t('common.noDataHint')}</span>
  </div>
{:else}

  <!-- ── Counter ─────────────────────────────────────────────────────────── -->
  <section class="counter-section" class:pulsing={pulseActive}>
    <div class="grid-bg"></div>
    <div class="counter-glow"></div>
    <div class="scan-line"></div>

    <div class="counter-eyebrow">
      <span class="eyebrow-line"></span>
      <span class="eyebrow-text">{$t('home.counterLabel')}</span>
      <span class="eyebrow-line"></span>
    </div>

    <div class="counter-number" class:refreshing>
      {fmtMain($tTokens)}
    </div>

    <div class="counter-sub">
      <div class="sub-chip">
        <span class="sub-arrow">↑</span>
        <span class="sub-lbl">{$t('home.input')}</span>
        <span class="sub-val">{fmtShort(data.inputTokens)}</span>
      </div>
      <div class="sub-sep"></div>
      <div class="sub-chip">
        <span class="sub-arrow">↓</span>
        <span class="sub-lbl">{$t('home.output')}</span>
        <span class="sub-val">{fmtShort(data.outputTokens)}</span>
      </div>
      <div class="sub-sep"></div>
      <div class="sub-chip">
        <span class="sub-arrow">⟳</span>
        <span class="sub-lbl">{$t('home.cache')}</span>
        <span class="sub-val">{fmtShort((data.cacheReadTokens||0)+(data.cacheWriteTokens||0))}</span>
      </div>
    </div>

    <!-- Refresh progress bar -->
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

  <!-- ── Secondary stats ─────────────────────────────────────────────────── -->
  <div class="stats-strip">
    <div class="stat-block stat-cost">
      <div class="stat-icon-wrap">$</div>
      <div class="stat-info">
        <span class="stat-lbl">{$t('overview.totalCost')}</span>
        <span class="stat-val cost-val">{fmtCost($tCost)}</span>
      </div>
    </div>
    <div class="strip-divider"></div>
    <div class="stat-block stat-sess">
      <div class="stat-icon-wrap">◎</div>
      <div class="stat-info">
        <span class="stat-lbl">{$t('overview.totalSessions')}</span>
        <span class="stat-val sess-val">{Math.round($tSessions).toLocaleString()}</span>
      </div>
    </div>
    <div class="strip-divider"></div>
    <div class="stat-block stat-days">
      <div class="stat-icon-wrap">◈</div>
      <div class="stat-info">
        <span class="stat-lbl">{$t('overview.activeDays')}</span>
        <span class="stat-val days-val">{Math.round($tDays).toLocaleString()}</span>
      </div>
    </div>
  </div>

  <!-- ── Token composition bar ────────────────────────────────────────────── -->
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
      <span class="leg leg-i">■ {$t('home.input')}</span>
      <span class="leg leg-o">■ {$t('home.output')}</span>
      <span class="leg leg-cr">■ Cache Read</span>
      <span class="leg leg-cw">■ Cache Write</span>
    </div>
  </div>

{/if}

<style>
  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .top-bar {
    display: flex; align-items: center; gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 0.55rem 0.9rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
  }

  .live-wrap {
    display: flex; align-items: center; gap: 0.45rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid rgba(46,166,106,0.3);
    border-radius: 4px;
    background: rgba(46,166,106,0.07);
    flex-shrink: 0;
  }
  .live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    animation: livePulse 2.4s ease-in-out infinite;
  }
  .live-wrap.pulse .live-dot { animation: liveBurst 0.5s ease; }
  .live-label {
    font-family: var(--mono); font-size: 0.58rem; font-weight: 700;
    letter-spacing: 0.2em; color: var(--green);
  }

  @keyframes livePulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(46,166,106,.5); }
    50%      { box-shadow: 0 0 0 4px rgba(46,166,106,0); }
  }
  @keyframes liveBurst {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.7); box-shadow: 0 0 8px var(--green); }
    100% { transform: scale(1); }
  }

  .range-badge {
    font-family: var(--mono); font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent);
    border: 1px solid var(--accent-dim); border-radius: 4px;
    padding: 0.2rem 0.55rem; background: var(--accent-dim);
  }

  .clock-block {
    display: flex; flex-direction: column; align-items: flex-start;
    margin-left: auto; gap: 0.05rem;
  }
  .clock-time {
    font-family: var(--mono); font-size: 0.88rem; font-weight: 700;
    letter-spacing: 0.05em; color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .clock-date {
    font-family: var(--mono); font-size: 0.54rem; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted);
  }

  .cfg-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px;
    border: 1px solid var(--border-medium); border-radius: 6px;
    background: var(--bg-raised); color: var(--text-muted);
    cursor: pointer; transition: border-color .15s, color .15s; flex-shrink: 0;
  }
  .cfg-btn:hover { border-color: var(--accent); color: var(--accent); }
  .cfg-icon { font-size: 0.85rem; line-height: 1; }

  /* ── Counter ─────────────────────────────────────────────────────────── */
  .counter-section {
    position: relative; display: flex; flex-direction: column; align-items: center;
    padding: 3rem 2rem 1.75rem; margin-bottom: 1rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle); border-radius: 14px;
    overflow: hidden; transition: border-color .4s;
  }
  .counter-section.pulsing { border-color: rgba(240,180,41,.22); }

  .counter-section::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent) 50%, transparent);
    opacity: .65;
  }

  .grid-bg {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, rgba(240,180,41,.12) 1px, transparent 1px);
    background-size: 28px 28px; opacity: .45;
  }
  .counter-glow {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 560px; height: 260px;
    background: radial-gradient(ellipse, rgba(240,180,41,.07) 0%, transparent 65%);
    pointer-events: none;
  }
  .scan-line {
    position: absolute; top: 0; bottom: 0; left: -50%; width: 35%;
    background: linear-gradient(90deg, transparent, rgba(240,180,41,.04), transparent);
    animation: scanPass 6s linear infinite; pointer-events: none;
  }
  @keyframes scanPass {
    0%   { left: -40%; }
    100% { left: 140%; }
  }

  .counter-eyebrow {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 1rem; margin-bottom: 1.1rem;
  }
  .eyebrow-line {
    display: block; height: 1px; width: 60px;
    background: linear-gradient(90deg, transparent, var(--border-medium));
  }
  .eyebrow-line:last-child { transform: scaleX(-1); }
  .eyebrow-text {
    font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase; color: var(--text-muted);
  }

  .counter-number {
    position: relative; z-index: 1;
    font-family: var(--mono);
    font-size: clamp(2.8rem, 6.5vw, 5.5rem);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 30px rgba(240,180,41,.38), 0 0 90px rgba(240,180,41,.13);
    font-variant-numeric: tabular-nums;
    transition: opacity .3s, text-shadow .5s;
  }
  .counter-number.refreshing { opacity: .5; }
  .counter-section.pulsing .counter-number {
    text-shadow: 0 0 50px rgba(240,180,41,.55), 0 0 130px rgba(240,180,41,.22);
  }

  .counter-sub {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 1.75rem; margin-top: 1.4rem;
  }
  .sub-chip { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
  .sub-arrow { font-size: .65rem; color: var(--text-muted); line-height: 1; }
  .sub-lbl {
    font-family: var(--mono); font-size: .5rem; font-weight: 700;
    letter-spacing: .15em; text-transform: uppercase; color: var(--text-muted);
  }
  .sub-val {
    font-family: var(--mono); font-size: .82rem; font-weight: 600;
    color: var(--text-secondary); font-variant-numeric: tabular-nums;
  }
  .sub-sep { width: 1px; height: 28px; background: var(--border-subtle); margin-top: .3rem; }

  .refresh-bar-track {
    position: relative; z-index: 1;
    width: 100%; height: 2px;
    background: var(--border-subtle); border-radius: 1px;
    margin-top: 2rem; overflow: hidden;
  }
  .refresh-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-dim), var(--accent));
    border-radius: 1px;
    transition: width 1s linear;
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .refresh-meta {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: .75rem; margin-top: .5rem;
    font-family: var(--mono); font-size: .56rem; font-weight: 600;
    letter-spacing: .08em; color: var(--text-muted);
  }
  .refreshing-label { color: var(--accent); }
  .now-btn {
    margin-left: auto; padding: .15rem .5rem;
    border: 1px solid var(--border-medium); border-radius: 4px;
    background: transparent; font-family: var(--mono);
    font-size: .55rem; font-weight: 600; letter-spacing: .06em; color: var(--text-muted);
    cursor: pointer; transition: border-color .15s, color .15s;
  }
  .now-btn:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Stats strip ─────────────────────────────────────────────────────── */
  .stats-strip {
    display: flex; align-items: stretch;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px; margin-bottom: 1rem; overflow: hidden;
  }
  .stat-block {
    flex: 1; display: flex; align-items: center; gap: .9rem;
    padding: 1.1rem 1.4rem; position: relative; transition: background .15s;
  }
  .stat-block::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  }
  .stat-block:hover { background: var(--bg-raised); }

  .stat-cost::before   { background: var(--green); }
  .stat-sess::before   { background: var(--blue); }
  .stat-days::before   { background: var(--purple); }

  .strip-divider { width: 1px; background: var(--border-subtle); margin: .75rem 0; }

  .stat-icon-wrap {
    font-family: var(--mono); font-size: 1.4rem; line-height: 1; opacity: .22; flex-shrink: 0;
  }
  .stat-cost .stat-icon-wrap  { color: var(--green); }
  .stat-sess .stat-icon-wrap  { color: var(--blue); }
  .stat-days .stat-icon-wrap  { color: var(--purple); }

  .stat-info { display: flex; flex-direction: column; gap: .22rem; }
  .stat-lbl {
    font-family: var(--mono); font-size: .56rem; font-weight: 700;
    letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted);
  }
  .stat-val {
    font-family: var(--mono); font-size: 1.75rem; font-weight: 700;
    letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums;
  }
  .cost-val { color: var(--green);  text-shadow: 0 0 18px rgba(46,166,106,.25); }
  .sess-val { color: var(--blue);   text-shadow: 0 0 18px rgba(59,130,246,.25); }
  .days-val { color: var(--purple); text-shadow: 0 0 18px rgba(167,139,250,.25); }

  /* ── Composition bar ─────────────────────────────────────────────────── */
  .comp-wrap { margin-bottom: .5rem; }
  .comp-bar {
    display: flex; height: 26px; border-radius: 6px; overflow: hidden;
    border: 1px solid var(--border-subtle); background: var(--bg-raised);
  }
  .seg {
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; min-width: 0;
    transition: width 1.5s cubic-bezier(.25,.46,.45,.94);
  }
  .seg-lbl {
    font-family: var(--mono); font-size: .5rem; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; padding: 0 4px;
  }
  .seg-input  { background: rgba(240,180,41,.2);  border-right: 1px solid var(--bg-base); }
  .seg-output { background: rgba(59,130,246,.18); border-right: 1px solid var(--bg-base); }
  .seg-cr     { background: rgba(167,139,250,.17);border-right: 1px solid var(--bg-base); }
  .seg-cw     { background: rgba(46,166,106,.17); }
  .seg-input  .seg-lbl { color: var(--accent); }
  .seg-output .seg-lbl { color: var(--blue); }
  .seg-cr     .seg-lbl { color: var(--purple); }
  .seg-cw     .seg-lbl { color: var(--green); }

  .comp-legend {
    display: flex; gap: 1.25rem; margin-top: .45rem; padding: 0 .2rem; flex-wrap: wrap;
  }
  .leg {
    font-family: var(--mono); font-size: .54rem; font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase;
  }
  .leg-i  { color: var(--accent); }
  .leg-o  { color: var(--blue); }
  .leg-cr { color: var(--purple); }
  .leg-cw { color: var(--green); }

  /* ── Config panel ────────────────────────────────────────────────────── */
  .overlay-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(7,10,16,.6); backdrop-filter: blur(4px);
    animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .config-panel {
    position: fixed; z-index: 201;
    top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(400px, 90vw);
    background: var(--bg-surface);
    border: 1px solid var(--border-medium); border-radius: 12px;
    padding: 1.5rem;
    animation: panelIn .2s cubic-bezier(.34,1.56,.64,1);
    box-shadow: 0 24px 80px rgba(0,0,0,.5);
  }
  @keyframes panelIn {
    from { opacity: 0; transform: translate(-50%,-46%); }
    to   { opacity: 1; transform: translate(-50%,-50%); }
  }

  .cfg-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.25rem;
  }
  .cfg-title {
    font-family: var(--mono); font-size: .65rem; font-weight: 700;
    letter-spacing: .2em; color: var(--text-muted);
  }
  .cfg-close {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--border-medium); border-radius: 4px;
    background: transparent; color: var(--text-muted);
    font-size: .7rem; cursor: pointer; transition: border-color .15s, color .15s;
  }
  .cfg-close:hover { border-color: var(--rose); color: var(--rose); }

  .cfg-section { margin-bottom: 1.1rem; }
  .cfg-label {
    font-family: var(--mono); font-size: .58rem; font-weight: 700;
    letter-spacing: .15em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: .5rem;
  }
  .cfg-pills { display: flex; gap: .4rem; flex-wrap: wrap; }
  .pill {
    padding: .3rem .75rem;
    border: 1px solid var(--border-medium); border-radius: 5px;
    background: var(--bg-raised); font-family: var(--mono);
    font-size: .7rem; font-weight: 600; color: var(--text-secondary);
    cursor: pointer; transition: border-color .15s, color .15s, background .15s;
    white-space: nowrap;
  }
  .pill:hover { border-color: var(--accent); color: var(--accent); }
  .pill.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .pill-eg { opacity: .5; font-size: .6rem; margin-left: .3rem; }

  .cfg-refresh-info {
    margin-top: .75rem;
    padding: .6rem .75rem;
    border: 1px solid var(--border-subtle); border-radius: 6px;
    background: var(--bg-raised);
  }
  .refresh-info-text {
    font-family: var(--mono); font-size: .6rem; font-weight: 600;
    letter-spacing: .04em; color: var(--text-muted);
  }
  .settings-link {
    color: var(--accent); text-decoration: none;
  }
  .settings-link:hover { text-decoration: underline; }

  /* ── Splash states ───────────────────────────────────────────────────── */
  .splash-loading, .splash-error, .splash-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 1rem; min-height: 320px; text-align: center;
  }
  .splash-spinner {
    width: 32px; height: 32px;
    border: 2px solid var(--border-subtle); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .splash-text {
    font-family: var(--mono); font-size: .65rem; font-weight: 700;
    letter-spacing: .25em; color: var(--text-muted);
    animation: blink 1.2s ease infinite;
  }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

  .err-code { font-family: var(--mono); font-size: 2rem; font-weight: 800; color: var(--rose); }
  .err-msg  { font-family: var(--mono); font-size: .8rem; color: var(--text-muted); }
  .retry-btn {
    margin-top: .5rem; padding: .4rem 1.2rem;
    border: 1px solid var(--rose); border-radius: 6px;
    background: transparent; font-family: var(--mono);
    font-size: .7rem; font-weight: 700; color: var(--rose); cursor: pointer;
    transition: background .15s;
  }
  .retry-btn:hover { background: rgba(244,63,94,.1); }

  .empty-icon { font-size: 2.5rem; color: var(--text-muted); }
  .empty-title {
    font-family: var(--mono); font-size: .9rem; font-weight: 700;
    letter-spacing: .2em; color: var(--text-secondary);
  }
  .empty-hint { font-family: var(--mono); font-size: .72rem; color: var(--text-muted); }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 680px) {
    .counter-section { padding: 2.5rem 1rem 1.5rem; }
    .counter-sub { gap: 1rem; }
    .stats-strip { flex-direction: column; }
    .strip-divider { width: auto; height: 1px; margin: 0 1rem; }
    .top-bar { flex-wrap: wrap; gap: .6rem; }
    .clock-block { margin-left: 0; }
  }
</style>
