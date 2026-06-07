<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { lang } from '$lib/lang'

  const periods = [
    { key: 'last_30_days', zh: '近 30 天', en: 'Last 30 days' },
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

  let activePeriod = 'last_30_days'
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
  $: podiumEntries = rows.slice(0, 3)
  $: tableEntries = rows.slice(3)
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
      case 'last_30_days':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString()
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
      case 'last_30_days':
        d.setUTCDate(d.getUTCDate() + direction * 30)
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
      case 'last_30_days': {
        const end = new Date(d)
        end.setUTCDate(end.getUTCDate() + 29)
        const fmt = { month: 'short', day: 'numeric', timeZone: 'UTC' }
        return `${d.toLocaleDateString(locale, fmt)} - ${end.toLocaleDateString(locale, fmt)}`
      }
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
    if (activePeriod !== 'last_30_days') params.set('period', activePeriod)
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

    if (periodParam && ['last_30_days', 'daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(periodParam)) {
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
        <span class="me-user">
          {#if data.current_user.avatar_url}
            <img src={data.current_user.avatar_url} alt="" class="avatar" />
          {:else}
            <span class="avatar-placeholder">{avatarText(data.current_user.display_name)}</span>
          {/if}
          <span class="me-name">{data.current_user.display_name}</span>
        </span>
        <span class="me-stat">
          <small>{valueLabel}</small>
          <strong>{formatFullValue(data.current_user)}</strong>
        </span>
        <span class="me-stat secondary">
          <small>{secondaryValueLabel}</small>
          <strong>{formatSecondaryValue(data.current_user)}</strong>
        </span>
        <span class="me-stat compact-stat">
          <small>{zh ? '较第一名' : 'vs #1'}</small>
          <strong>{shareOfTop(data.current_user).toFixed(1)}%</strong>
        </span>
        <span class="me-stat updated">
          <small>{zh ? '更新' : 'Updated'}</small>
          <strong>{formatDate(data.current_user.updated_at)}</strong>
        </span>
      </div>
    {/if}

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
      <!-- Podium: Top 3 -->
      <div class="podium-section">
        <div class="podium-meta">
          <span>{periodLabel(activePeriod)}</span>
          <span class="sep">·</span>
          <span>{valueLabel}</span>
          <span class="sep">·</span>
          <span>{scopes.find(s => s.key === activeScope)?.[zh ? 'zh' : 'en']}{selectedChip ? `: ${selectedChip}` : ''}</span>
        </div>

        <div class="podium">
          {#if podiumEntries.length >= 2}
            <div class="podium-card second" style="animation-delay: 120ms">
              <div class="podium-badge silver">2</div>
              <div class="podium-identity">
                <div class="podium-avatar-wrap">
                  {#if podiumEntries[1].avatar_url}
                    <img src={podiumEntries[1].avatar_url} alt="" class="podium-avatar" />
                  {:else}
                    <span class="podium-avatar-fallback">{avatarText(podiumEntries[1].display_name)}</span>
                  {/if}
                </div>
                <div class="podium-name">{podiumEntries[1].display_name}</div>
              </div>
              <div class="podium-value">{formatFullValue(podiumEntries[1])}</div>
              <div class="podium-secondary">{formatSecondaryValue(podiumEntries[1])}</div>
              <div class="podium-bar-wrap">
                <div class="podium-bar silver-bar" style={`width: ${shareOfTop(podiumEntries[1])}%`}></div>
              </div>
              <div class="podium-share">{shareOfTop(podiumEntries[1]).toFixed(1)}% {zh ? 'of #1' : 'of #1'}</div>
              <div class="podium-updated">{formatDate(podiumEntries[1].updated_at)}</div>
            </div>
          {/if}

          {#if podiumEntries.length >= 1}
            <div class="podium-card first" style="animation-delay: 0ms">
              <div class="podium-crown" aria-hidden="true">👑</div>
              <div class="podium-badge gold">1</div>
              <div class="podium-identity">
                <div class="podium-avatar-wrap">
                  {#if podiumEntries[0].avatar_url}
                    <img src={podiumEntries[0].avatar_url} alt="" class="podium-avatar" />
                  {:else}
                    <span class="podium-avatar-fallback">{avatarText(podiumEntries[0].display_name)}</span>
                  {/if}
                </div>
                <div class="podium-name">{podiumEntries[0].display_name}</div>
              </div>
              <div class="podium-value">{formatFullValue(podiumEntries[0])}</div>
              <div class="podium-secondary">{formatSecondaryValue(podiumEntries[0])}</div>
              <div class="podium-bar-wrap">
                <div class="podium-bar gold-bar" style="width: 100%"></div>
              </div>
              <div class="podium-share">100%</div>
              <div class="podium-updated">{formatDate(podiumEntries[0].updated_at)}</div>
            </div>
          {/if}

          {#if podiumEntries.length >= 3}
            <div class="podium-card third" style="animation-delay: 240ms">
              <div class="podium-badge bronze">3</div>
              <div class="podium-identity">
                <div class="podium-avatar-wrap">
                  {#if podiumEntries[2].avatar_url}
                    <img src={podiumEntries[2].avatar_url} alt="" class="podium-avatar" />
                  {:else}
                    <span class="podium-avatar-fallback">{avatarText(podiumEntries[2].display_name)}</span>
                  {/if}
                </div>
                <div class="podium-name">{podiumEntries[2].display_name}</div>
              </div>
              <div class="podium-value">{formatFullValue(podiumEntries[2])}</div>
              <div class="podium-secondary">{formatSecondaryValue(podiumEntries[2])}</div>
              <div class="podium-bar-wrap">
                <div class="podium-bar bronze-bar" style={`width: ${shareOfTop(podiumEntries[2])}%`}></div>
              </div>
              <div class="podium-share">{shareOfTop(podiumEntries[2]).toFixed(1)}% {zh ? 'of #1' : 'of #1'}</div>
              <div class="podium-updated">{formatDate(podiumEntries[2].updated_at)}</div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Ranked list: #4+ -->
      {#if tableEntries.length > 0}
        <div class="table-wrap">
          <div class="table-meta">
            <span>{zh ? '已显示' : 'Showing'} {rows.length} {zh ? '位' : ''}</span>
          </div>

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
            {#each tableEntries as entry, i}
              <div class="lb-row" class:has-scope={activeScope !== 'all'} role="row" style="animation-delay: {i * 25}ms">
                <span class="col-rank" role="cell">
                  <span class="rank-num">#{entry.rank}</span>
                </span>
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
                <span class="col-tokens" role="cell">{formatFullValue(entry)}</span>
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
        </div>
      {/if}
    {/if}

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

  /* ── Controls ─────────────────────────────────────────────────────── */
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
  .control-row.primary { justify-content: space-between; }
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
    transition: background 0.15s ease-out, color 0.15s ease-out;
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
    transition: background 0.15s ease-out, color 0.15s ease-out;
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

  /* ── My rank row ──────────────────────────────────────────────────── */
  .me-row {
    display: grid;
    grid-template-columns: auto 64px minmax(160px, 1fr) minmax(130px, auto) minmax(104px, auto) minmax(76px, auto) minmax(110px, auto);
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: 10px;
    background: var(--accent-dim);
    border: 1px solid oklch(0.52 0.14 165 / 0.15);
    color: var(--text);
  }
  .me-label {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .me-rank, .me-stat strong { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .me-rank { color: var(--accent); font-weight: 800; font-size: 1rem; }
  .me-user { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
  .me-name { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .me-stat { display: grid; gap: 2px; justify-items: end; min-width: 0; }
  .me-stat small { color: var(--text-muted); font-size: 0.6875rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  .me-stat strong { color: var(--text); font-size: 0.8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .me-stat.secondary strong, .me-stat.updated strong { color: var(--text-secondary); font-weight: 600; }

  /* ── Podium ───────────────────────────────────────────────────────── */
  .podium-section {
    margin-bottom: 20px;
  }
  .podium-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .podium-meta .sep { opacity: 0.4; }

  .podium {
    display: grid;
    grid-template-columns: 1fr 1.15fr 1fr;
    gap: 12px;
    align-items: end;
  }

  .podium-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 20px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    position: relative;
    animation: podium-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes podium-rise {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .podium-card.first {
    border-color: oklch(0.72 0.14 85 / 0.4);
    background: oklch(0.72 0.14 85 / 0.04);
    padding-top: 28px;
    order: 2;
  }
  .podium-card.second {
    order: 1;
  }
  .podium-card.third {
    order: 3;
  }

  .podium-crown {
    position: absolute;
    top: -14px;
    font-size: 1.25rem;
    line-height: 1;
    filter: drop-shadow(0 2px 4px oklch(0.72 0.14 85 / 0.3));
    animation: crown-bob 2s ease-in-out infinite;
  }

  @keyframes crown-bob {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-3px) rotate(3deg); }
  }

  .podium-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-weight: 800;
    margin-bottom: 10px;
    box-shadow: 0 2px 6px oklch(0 0 0 / 0.1);
  }
  .podium-badge.gold {
    background: oklch(0.78 0.14 85);
    color: oklch(0.25 0.06 85);
  }
  .podium-badge.silver {
    background: oklch(0.82 0.02 250);
    color: oklch(0.3 0.02 250);
  }
  .podium-badge.bronze {
    background: oklch(0.72 0.12 55);
    color: oklch(0.28 0.06 55);
  }

  .podium-identity {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 10px;
    width: 100%;
    min-width: 0;
  }
  .podium-avatar-wrap {
    flex-shrink: 0;
  }
  .podium-avatar, .podium-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    object-fit: cover;
  }
  .podium-card.first .podium-avatar,
  .podium-card.first .podium-avatar-fallback {
    width: 44px;
    height: 44px;
    font-size: 1.125rem;
    font-weight: 800;
  }
  .podium-card.second .podium-avatar,
  .podium-card.second .podium-avatar-fallback,
  .podium-card.third .podium-avatar,
  .podium-card.third .podium-avatar-fallback {
    width: 36px;
    height: 36px;
    font-size: 0.9375rem;
    font-weight: 750;
  }
  .podium-avatar-fallback {
    background: var(--raised);
    color: var(--accent);
  }

  .podium-name {
    font-weight: 700;
    font-size: 0.875rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .podium-card.first .podium-name { font-size: 1rem; }

  .podium-value {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    font-size: 0.9375rem;
    color: var(--text);
    margin-bottom: 2px;
  }
  .podium-card.first .podium-value { font-size: 1.0625rem; }

  .podium-secondary {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .podium-bar-wrap {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--raised);
    overflow: hidden;
    margin-bottom: 6px;
  }
  .podium-bar {
    height: 100%;
    border-radius: inherit;
    transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .gold-bar { background: oklch(0.72 0.14 85); }
  .silver-bar { background: oklch(0.72 0.02 250); }
  .bronze-bar { background: oklch(0.68 0.12 55); }

  .podium-share {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.02em;
  }

  .podium-updated {
    margin-top: 6px;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  /* ── Table ────────────────────────────────────────────────────────── */
  .table-wrap {
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
  }

  .table-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  @keyframes row-enter {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .lb-table .lb-row:not(.header) {
    animation: row-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .lb-row {
    display: grid;
    grid-template-columns: 64px minmax(180px, 1fr) minmax(128px, 160px) minmax(104px, 132px) minmax(116px, 140px) minmax(116px, 140px);
    align-items: center;
    column-gap: 12px;
    min-height: 44px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .lb-row.has-scope { grid-template-columns: 64px minmax(150px, 1fr) minmax(150px, 240px) minmax(128px, 160px) minmax(104px, 132px) minmax(116px, 140px) minmax(116px, 140px); }
  .lb-row:last-child { border-bottom: 0; }
  .lb-row:not(.header):hover { background: var(--hover); }
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
  .col-rank { color: var(--text-muted); font-weight: 650; }
  .rank-num { font-size: 0.8125rem; }
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

  .lb-row.header .col-share { display: block; }

  .share-track {
    height: 6px;
    border-radius: 999px;
    background: var(--raised);
    overflow: hidden;
  }
  .share-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .share-text { text-align: right; font-weight: 600; }

  .avatar, .avatar-placeholder {
    width: 26px;
    height: 26px;
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
    padding: 48px 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .state.error { color: var(--rose); background: oklch(0.55 0.22 25 / 0.06); border-radius: 10px; }
  .empty-guide { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .guide-text { font-size: 0.8125rem; }
  .guide-cmd { font-family: var(--mono); font-size: 0.8125rem; background: var(--raised); padding: 0.5rem 1rem; border-radius: 6px; color: var(--accent); user-select: all; }

  .load-more {
    display: block;
    margin: 14px auto;
    min-height: 34px;
    padding: 0 20px;
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 650;
    cursor: pointer;
    transition: background 0.15s ease-out, color 0.15s ease-out;
  }
  .load-more:hover { color: var(--text); background: var(--raised); }
  .load-more:disabled { opacity: 0.6; cursor: not-allowed; }

  .role-note {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 16px;
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
  .retry-btn { margin-top: 0.5rem; padding: 0.375rem 1rem; border: 1px solid var(--border-medium); border-radius: 6px; background: var(--surface); color: var(--text); font-weight: 600; font-size: 0.8125rem; cursor: pointer; }
  .retry-btn:hover { background: var(--hover); }

  /* ── Responsive ───────────────────────────────────────────────────── */
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
    .me-row { grid-template-columns: 1fr auto; gap: 8px 10px; }
    .me-label { grid-column: 1 / -1; }
    .me-rank { grid-column: 1; }
    .me-user { grid-column: 1 / -1; }
    .me-stat { justify-items: start; }
    .me-stat.updated { display: none; }
    .role-note { grid-template-columns: 1fr; }

    .podium {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .podium-card.first { order: 0; }
    .podium-card.second { order: 1; }
    .podium-card.third { order: 2; }
  }

  @media (prefers-reduced-motion: reduce) {
    .podium-card,
    .lb-table .lb-row:not(.header) {
      animation: none;
    }
    .podium-crown {
      animation: none;
    }
    .podium-bar,
    .share-fill {
      transition: none;
    }
  }
</style>
