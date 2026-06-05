<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { lang } from '$lib/lang'

  const periods = [
    { key: 'daily', zh: '今日', en: 'Daily' },
    { key: 'weekly', zh: '本周', en: 'Weekly' },
    { key: 'monthly', zh: '本月', en: 'Monthly' },
    { key: 'yearly', zh: '今年', en: 'Yearly' },
    { key: 'all_time', zh: '累计', en: 'All time' }
  ]

  const metrics = [
    { key: 'tokens', zh: 'Token', en: 'Tokens' },
    { key: 'cost', zh: '费用', en: 'Cost' }
  ]

  const scopes = [
    { key: 'all', zh: '总榜', en: 'Overall' },
    { key: 'tool', zh: '工具', en: 'Tool' },
    { key: 'model', zh: '模型', en: 'Model' }
  ]

  let activePeriod = 'daily'
  let activeMetric = 'tokens'
  let activeScope = 'all'
  let selectedTool = ''
  let selectedModel = ''
  let activePeriodStart = ''
  let data = null
  let loading = true
  let loadingMore = false
  let error = ''

  let availableTools = []
  let availableModels = []
  let chipsExpanded = false

  $: zh = $lang === 'zh'
  $: user = $page.data.user
  $: rows = data?.entries || []
  $: valueLabel = activeMetric === 'cost' ? (zh ? '费用' : 'Cost') : 'Tokens'
  $: secondaryValueLabel = activeMetric === 'cost' ? 'Tokens' : (zh ? '费用' : 'Cost')
  $: topValue = rows.length > 0 ? numericValue(rows[0]) : 0
  $: activeChips = activeScope === 'tool' ? availableTools : activeScope === 'model' ? availableModels : []
  $: selectedChip = activeScope === 'tool' ? selectedTool : activeScope === 'model' ? selectedModel : ''
  $: visibleChips = chipsExpanded ? activeChips : activeChips.slice(0, 12)
  $: hasMoreChips = activeChips.length > 12
  $: canGoNext = activePeriod !== 'all_time' && activePeriodStart && activePeriodStart < getCurrentPeriodStart(activePeriod)

  function getCurrentPeriodStart(periodType) {
    const now = new Date()
    switch (periodType) {
      case 'daily':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
      case 'weekly': {
        const day = now.getUTCDay()
        const diff = day === 0 ? 6 : day - 1
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)).toISOString()
      }
      case 'monthly':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      case 'yearly':
        return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
      case 'all_time':
        return '1970-01-01T00:00:00.000Z'
      default:
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    }
  }

  function shiftPeriodStart(periodStart, periodType, direction) {
    const d = new Date(periodStart)
    switch (periodType) {
      case 'daily':
        d.setUTCDate(d.getUTCDate() + direction)
        break
      case 'weekly':
        d.setUTCDate(d.getUTCDate() + direction * 7)
        break
      case 'monthly':
        d.setUTCMonth(d.getUTCMonth() + direction)
        break
      case 'yearly':
        d.setUTCFullYear(d.getUTCFullYear() + direction)
        break
    }
    return d.toISOString()
  }

  function formatPeriodLabel(periodStart, periodType) {
    const d = new Date(periodStart)
    if (!Number.isFinite(d.getTime())) return ''
    const locale = zh ? 'zh-CN' : 'en-US'
    switch (periodType) {
      case 'daily':
        return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      case 'weekly': {
        const end = new Date(d)
        end.setUTCDate(end.getUTCDate() + 6)
        const fmt = { month: 'short', day: 'numeric', timeZone: 'UTC' }
        return `${d.toLocaleDateString(locale, fmt)} – ${end.toLocaleDateString(locale, fmt)}`
      }
      case 'monthly':
        return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' })
      case 'yearly':
        return d.toLocaleDateString(locale, { year: 'numeric', timeZone: 'UTC' })
      default:
        return ''
    }
  }

  function syncUrl() {
    const params = new URLSearchParams()
    if (activePeriod !== 'daily') params.set('period', activePeriod)
    if (activeMetric !== 'tokens') params.set('metric', activeMetric)
    if (activeScope !== 'all') params.set('scope', activeScope)
    if (activeScope === 'tool' && selectedTool) params.set('tool', selectedTool)
    if (activeScope === 'model' && selectedModel) params.set('model', selectedModel)
    const currentStart = getCurrentPeriodStart(activePeriod)
    if (activePeriodStart && activePeriodStart !== currentStart) params.set('period_start', activePeriodStart)
    const qs = params.toString()
    goto(`/leaderboard${qs ? '?' + qs : ''}`, { replaceState: true, keepFocus: true, noScroll: true })
  }

  function periodLabel(key) {
    const period = periods.find(p => p.key === key)
    return zh ? period?.zh : period?.en
  }

  function formatFullTokens(n) {
    const num = Number(n)
    return Number.isFinite(num) ? num.toLocaleString() : '0'
  }

  function formatCost(n) {
    const num = Number(n)
    return Number.isFinite(num) ? '$' + num.toFixed(4) : '$0.0000'
  }

  function formatFullValue(entry) {
    return activeMetric === 'cost' ? formatCost(entry.total_cost_usd) : formatFullTokens(entry.total_tokens)
  }

  function formatSecondaryValue(entry) {
    return activeMetric === 'cost' ? formatFullTokens(entry.total_tokens) : formatCost(entry.total_cost_usd)
  }

  function numericValue(entry) {
    const n = Number(activeMetric === 'cost' ? entry.total_cost_usd : entry.total_tokens)
    return Number.isFinite(n) ? n : 0
  }

  function shareOfTop(entry) {
    if (!topValue) return 0
    return Math.max(0, Math.min(100, numericValue(entry) / topValue * 100))
  }

  function scopeValue(entry) {
    if (entry.scope_type === 'tool') return entry.tool || '-'
    if (entry.scope_type === 'model') return entry.model || '-'
    return zh ? '全部' : 'All'
  }

  function formatDate(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString(zh ? 'zh-CN' : undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function avatarText(name) {
    return (name || 'A').trim().charAt(0).toUpperCase()
  }

  function defaultChipFor(scope) {
    if (scope === 'tool') return availableTools[0] || ''
    if (scope === 'model') return availableModels[0] || ''
    return ''
  }

  function ensureScopeSelection(scope) {
    if (scope === 'tool') {
      if (!selectedTool || !availableTools.includes(selectedTool)) {
        selectedTool = defaultChipFor('tool')
      }
      selectedModel = ''
    } else if (scope === 'model') {
      if (!selectedModel || !availableModels.includes(selectedModel)) {
        selectedModel = defaultChipFor('model')
      }
      selectedTool = ''
    } else {
      selectedTool = ''
      selectedModel = ''
    }
  }

  async function loadFilters() {
    try {
      const params = new URLSearchParams({
        period_type: activePeriod,
        metric: activeMetric
      })
      if (activePeriodStart) params.set('period_start', activePeriodStart)
      const res = await fetch(`/api/leaderboard/filters?${params}`)
      if (res.ok) {
        const data = await res.json()
        availableTools = data.tools || []
        availableModels = data.models || []
        ensureScopeSelection(activeScope)
      }
    } catch { /* ignore */ }
  }

  async function loadLeaderboard(cursor) {
    const isMore = Boolean(cursor)
    if (isMore) {
      loadingMore = true
    } else {
      loading = true
      data = null
    }
    error = ''

    try {
      const params = new URLSearchParams({
        period_type: activePeriod,
        metric: activeMetric,
        scope: activeScope
      })
      if (activePeriodStart) params.set('period_start', activePeriodStart)
      if (activeScope === 'tool' && selectedTool) params.set('tool', selectedTool)
      if (activeScope === 'model' && selectedModel) params.set('model', selectedModel)
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/leaderboard?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const next = await res.json()
      data = isMore && data
        ? { ...next, entries: [...data.entries, ...next.entries] }
        : next
    } catch {
      error = zh ? '排行榜暂时无法加载。' : 'Leaderboard is temporarily unavailable.'
    } finally {
      loading = false
      loadingMore = false
    }
  }

  function switchPeriod(period) {
    if (activePeriod === period || loading) return
    activePeriod = period
    activePeriodStart = getCurrentPeriodStart(period)
    syncUrl()
    loadFilters().then(() => loadLeaderboard())
  }

  function switchMetric(metric) {
    if (activeMetric === metric || loading) return
    activeMetric = metric
    syncUrl()
    loadFilters().then(() => loadLeaderboard())
  }

  async function switchScope(scope) {
    if (activeScope === scope) return
    activeScope = scope
    chipsExpanded = false
    ensureScopeSelection(scope)
    if ((scope === 'tool' && !selectedTool) || (scope === 'model' && !selectedModel)) {
      await loadFilters()
    }
    ensureScopeSelection(scope)
    syncUrl()
    loadLeaderboard()
  }

  function selectChip(value) {
    if (activeScope === 'tool') {
      selectedTool = value
    } else if (activeScope === 'model') {
      selectedModel = value
    }
    syncUrl()
    loadLeaderboard()
  }

  function goToPeriod(direction) {
    if (activePeriod === 'all_time') return
    if (direction === 1 && !canGoNext) return
    activePeriodStart = shiftPeriodStart(activePeriodStart, activePeriod, direction)
    const currentStart = getCurrentPeriodStart(activePeriod)
    if (activePeriodStart > currentStart) activePeriodStart = currentStart
    syncUrl()
    loadFilters().then(() => loadLeaderboard())
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
  }

  onMount(() => {
    const params = $page.url.searchParams
    const periodParam = params.get('period')
    const metricParam = params.get('metric')
    const scopeParam = params.get('scope')
    const toolParam = params.get('tool')
    const modelParam = params.get('model')
    const periodStartParam = params.get('period_start')

    if (periodParam && ['daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(periodParam)) {
      activePeriod = periodParam
    }
    if (metricParam && ['tokens', 'cost'].includes(metricParam)) {
      activeMetric = metricParam
    }
    if (scopeParam && ['all', 'tool', 'model'].includes(scopeParam)) {
      activeScope = scopeParam
    }
    if (toolParam) selectedTool = toolParam
    if (modelParam) selectedModel = modelParam
    activePeriodStart = periodStartParam || getCurrentPeriodStart(activePeriod)

    loadFilters()
    loadLeaderboard()
  })
</script>

<svelte:head>
  <title>{zh ? '公开排行榜' : 'Public Leaderboard'} - AIUsage</title>
</svelte:head>

<section class="lb-page">
  <div class="lb-container">
    <div class="ranking-controls">
      <div class="control-row primary">
        <div class="toolbar" aria-label={zh ? '周期选择' : 'Period'}>
          {#each periods as p}
            <button class="pill" class:active={activePeriod === p.key} on:click={() => switchPeriod(p.key)}>
              {zh ? p.zh : p.en}
            </button>
          {/each}
        </div>

        {#if activePeriod !== 'all_time'}
          <div class="period-nav">
            <button class="nav-arrow" on:click={() => goToPeriod(-1)} aria-label={zh ? '上一周期' : 'Previous period'}>←</button>
            <span class="period-label">{formatPeriodLabel(activePeriodStart, activePeriod)}</span>
            <button class="nav-arrow" on:click={() => goToPeriod(1)} disabled={!canGoNext} aria-label={zh ? '下一周期' : 'Next period'}>→</button>
          </div>
        {/if}
      </div>

      <div class="control-row">
        <div class="toolbar compact" aria-label={zh ? '指标选择' : 'Metric'}>
          {#each metrics as m}
            <button class="pill" class:active={activeMetric === m.key} on:click={() => switchMetric(m.key)}>
              {zh ? m.zh : m.en}
            </button>
          {/each}
        </div>

        <div class="toolbar compact" aria-label={zh ? '范围选择' : 'Scope'}>
          {#each scopes as s}
            <button class="pill" class:active={activeScope === s.key} on:click={() => switchScope(s.key)}>
              {zh ? s.zh : s.en}
            </button>
          {/each}
        </div>
      </div>

      {#if activeChips.length > 0}
        <div class="chip-bar" class:expanded={chipsExpanded}>
          {#each visibleChips as chip}
            <button class="chip" class:selected={selectedChip === chip} on:click={() => selectChip(chip)}>
              {chip}
            </button>
          {/each}
          {#if hasMoreChips}
            <button class="chip-toggle" on:click={() => chipsExpanded = !chipsExpanded}>
              {chipsExpanded ? (zh ? '收起' : 'Less') : `+${activeChips.length - 12}`}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if data?.current_user}
      <div class="me-row">
        <span class="me-label">{zh ? '我的排名' : 'My rank'}</span>
        <span class="me-rank">#{data.current_user.rank}</span>
        <span class="me-name">{data.current_user.display_name}</span>
        <span class="me-tokens">{formatFullValue(data.current_user)} {activeMetric === 'tokens' ? 'tokens' : ''}</span>
      </div>
    {/if}

    <div class="table-wrap">
      <div class="table-meta">
        <span>{periodLabel(activePeriod)}</span>
        <span>{valueLabel}</span>
        <span>{scopes.find(s => s.key === activeScope)?.[zh ? 'zh' : 'en']}{selectedChip ? `: ${selectedChip}` : ''}</span>
        <span>{zh ? '已显示' : 'Showing'} {rows.length}</span>
      </div>

      {#if error}
        <div class="state error">
          {error}
          <button class="retry-btn" on:click={() => loadLeaderboard()}>{zh ? '重试' : 'Retry'}</button>
        </div>
      {:else if loading}
        <div class="state">{zh ? '加载中...' : 'Loading...'}</div>
      {:else if rows.length === 0}
        <div class="state empty-guide">
          <p>{zh ? '暂无公开数据。' : 'No public entries yet.'}</p>
          <p class="guide-text">{zh
            ? '安装 CLI 并上传你的使用数据即可上榜：'
            : 'Install the CLI and upload your usage to join:'}</p>
          <code class="guide-cmd">npx @juliantanx/aiusage login && npx @juliantanx/aiusage upload</code>
        </div>
      {:else}
        <div class="lb-table" role="table" aria-label={zh ? 'Token 排行榜' : 'Token leaderboard'}>
          <div class="lb-row header" class:has-scope={activeScope !== 'all'} role="row">
            <span class="col-rank" role="columnheader">#</span>
            <span class="col-user" role="columnheader">{zh ? '用户' : 'User'}</span>
            {#if activeScope !== 'all'}
              <span class="col-scope" role="columnheader">{activeScope === 'tool' ? (zh ? '工具' : 'Tool') : (zh ? '模型' : 'Model')}</span>
            {/if}
            <span class="col-tokens" role="columnheader">{valueLabel}</span>
            <span class="col-secondary" role="columnheader">{secondaryValueLabel}</span>
            <span class="col-share" role="columnheader">{zh ? '较第一名' : 'vs #1'}</span>
            <span class="col-updated" role="columnheader">{zh ? '更新' : 'Updated'}</span>
          </div>
          {#each rows as entry}
            <div class="lb-row" class:top={entry.rank <= 3} class:has-scope={activeScope !== 'all'} role="row">
              <span class="col-rank" role="cell">#{entry.rank}</span>
              <span class="col-user" role="cell">
                {#if entry.avatar_url}
                  <img src={entry.avatar_url} alt="" class="avatar" />
                {:else}
                  <span class="avatar-placeholder">{avatarText(entry.display_name)}</span>
                {/if}
                <span class="user-name">{entry.display_name}</span>
              </span>
              {#if activeScope !== 'all'}
                <span class="col-scope" role="cell" title={scopeValue(entry)}>{scopeValue(entry)}</span>
              {/if}
              <span class="col-tokens" role="cell">
                {formatFullValue(entry)}
              </span>
              <span class="col-secondary" role="cell">{formatSecondaryValue(entry)}</span>
              <span class="col-share" role="cell" aria-label={`${shareOfTop(entry).toFixed(1)}%`}>
                <span class="share-track" aria-hidden="true">
                  <span class="share-fill" style={`width: ${shareOfTop(entry)}%`}></span>
                </span>
                <span class="share-text">{shareOfTop(entry).toFixed(1)}%</span>
              </span>
              <span class="col-updated" role="cell">{formatDate(entry.updated_at)}</span>
            </div>
          {/each}
        </div>

        {#if data.next_cursor}
          <button class="load-more" on:click={loadMore} disabled={loadingMore}>
            {loadingMore ? (zh ? '加载中...' : 'Loading...') : (zh ? '加载更多' : 'Load more')}
          </button>
        {/if}
      {/if}
    </div>

    <div class="role-note">
      <div>
        <strong>CLI</strong>
        <span>{zh ? '负责本地统计、登录授权和提交公开总量。' : 'handles local stats, authorization, and total-token submissions.'}</span>
      </div>
      <div>
        <strong>{zh ? '站点' : 'Site'}</strong>
        <span>{zh ? '负责公开浏览、账号资料、设备和审核状态。' : 'handles public browsing, profile, devices, and review status.'}</span>
      </div>
    </div>
  </div>
</section>

<style>
  .lb-page { padding: 16px 0 48px; }
  .lb-container { width: min(calc(100vw - 32px), 1280px); margin: 0 auto; }

  .ranking-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .control-row.primary {
    justify-content: space-between;
  }
  .toolbar {
    display: flex;
    gap: 4px;
    width: fit-content;
    max-width: 100%;
    padding: 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--raised);
    overflow-x: auto;
  }
  .toolbar.compact { padding: 3px; }
  .pill {
    min-height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .pill:hover { background: var(--surface); color: var(--text); }
  .pill.active { background: var(--surface); color: var(--accent); box-shadow: inset 0 0 0 1px var(--border-subtle); }

  .period-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .nav-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .nav-arrow:hover:not(:disabled) { background: var(--raised); color: var(--text); }
  .nav-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
  .period-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
    min-width: 120px;
    text-align: center;
  }

  .chip-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 60px;
    overflow: hidden;
    transition: max-height 0.2s ease-out;
  }
  .chip-bar.expanded { max-height: none; }
  .chip {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }
  .chip:hover { background: var(--hover); color: var(--text); border-color: var(--border-medium); }
  .chip.selected { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); font-weight: 600; }
  .chip-toggle {
    height: 28px;
    padding: 0 10px;
    border: 1px dashed var(--border-medium);
    border-radius: 14px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .chip-toggle:hover { color: var(--text); border-color: var(--text-muted); }

  .me-row {
    display: grid;
    grid-template-columns: auto 72px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--accent-dim);
    color: var(--text);
  }
  .me-label {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
  .me-rank, .me-tokens { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .me-rank { color: var(--accent); font-weight: 750; }
  .me-name { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .me-tokens { color: var(--text-secondary); font-size: 0.8125rem; }

  .table-wrap {
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
  }

  .table-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .lb-row {
    display: grid;
    grid-template-columns: 64px minmax(180px, 1fr) minmax(128px, 160px) minmax(104px, 132px) minmax(116px, 140px) minmax(116px, 140px);
    align-items: center;
    column-gap: 12px;
    min-height: 42px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .lb-row.has-scope { grid-template-columns: 64px minmax(150px, 1fr) minmax(150px, 240px) minmax(128px, 160px) minmax(104px, 132px) minmax(116px, 140px) minmax(116px, 140px); }
  .lb-row:last-child { border-bottom: 0; }
  .lb-row:not(.header):hover { background: var(--raised); }
  .lb-row.top { background: oklch(0.55 0.12 175 / 0.035); }
  .lb-row.header {
    min-height: 34px;
    background: var(--raised);
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .col-rank, .col-tokens, .col-secondary, .col-share { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .col-rank { color: var(--text-secondary); font-weight: 650; }
  .col-user { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 600; }
  .user-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-scope { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.8125rem; }
  .col-tokens { text-align: right; font-weight: 650; }
  .col-secondary { color: var(--text-secondary); text-align: right; font-size: 0.8125rem; }
  .col-share {
    display: grid;
    grid-template-columns: minmax(56px, 1fr) 44px;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .col-updated { color: var(--text-muted); text-align: right; font-size: 0.8125rem; }

  .lb-row.header .col-share {
    display: block;
  }

  .share-track {
    height: 4px;
    border-radius: 999px;
    background: var(--raised);
    overflow: hidden;
  }
  .share-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }
  .share-text { text-align: right; }

  .avatar, .avatar-placeholder {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .avatar { object-fit: cover; }
  .avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--raised);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 750;
  }

  .state {
    padding: 40px 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .state.error { color: var(--rose); background: oklch(0.55 0.22 25 / 0.06); }
  .empty-guide { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .guide-text { font-size: 0.8125rem; }
  .guide-cmd { font-family: var(--mono); font-size: 0.8125rem; background: var(--raised); padding: 0.5rem 1rem; border-radius: 6px; color: var(--accent); user-select: all; }

  .load-more {
    display: block;
    margin: 12px auto;
    min-height: 32px;
    padding: 0 16px;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 650;
    cursor: pointer;
  }
  .load-more:hover { color: var(--text); background: var(--raised); }
  .load-more:disabled { opacity: 0.6; cursor: not-allowed; }

  .role-note {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  .role-note div {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    background: var(--raised);
  }
  .role-note strong { color: var(--text); }
  .retry-btn { margin-top: 0.5rem; padding: 0.375rem 1rem; border: 1px solid var(--border-medium); border-radius: 6px; background: var(--surface); color: var(--text-primary); font-weight: 600; font-size: 0.8125rem; cursor: pointer; }
  .retry-btn:hover { background: var(--hover); }

  @media (max-width: 760px) {
    .lb-page { padding-top: 16px; }
    .control-row { flex-direction: column; align-items: stretch; }
    .control-row.primary { justify-content: flex-start; }
    .toolbar { width: 100%; }
    .period-nav { justify-content: space-between; }
    .chip-bar { max-height: 60px; }
    .table-meta { flex-wrap: wrap; gap: 8px 14px; }
    .lb-row { grid-template-columns: 52px minmax(0, 1fr) 104px; padding: 0 12px; }
    .lb-row.has-scope { grid-template-columns: 52px minmax(0, 1fr) 104px; }
    .col-scope { display: none; }
    .col-secondary { display: none; }
    .col-share { display: none; }
    .lb-row.header .col-share { display: none; }
    .col-updated { display: none; }
    .me-row { grid-template-columns: 1fr auto; gap: 6px 10px; }
    .me-label { grid-column: 1 / -1; }
    .me-rank { grid-column: 1; }
    .me-name { grid-column: 2; text-align: right; }
    .me-tokens { grid-column: 1 / -1; }
    .role-note { grid-template-columns: 1fr; }
  }
</style>
