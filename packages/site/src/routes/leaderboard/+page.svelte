<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
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
  $: leaders = rows.slice(0, 3)
  $: valueLabel = activeMetric === 'cost' ? (zh ? '费用' : 'Cost') : 'Tokens'
  $: activeChips = activeScope === 'tool' ? availableTools : activeScope === 'model' ? availableModels : []
  $: selectedChip = activeScope === 'tool' ? selectedTool : activeScope === 'model' ? selectedModel : ''
  $: visibleChips = chipsExpanded ? activeChips : activeChips.slice(0, 12)
  $: hasMoreChips = activeChips.length > 12

  function periodLabel(key) {
    const period = periods.find(p => p.key === key)
    return zh ? period?.zh : period?.en
  }

  function formatTokens(n) {
    const num = Number(n)
    if (!Number.isFinite(num)) return '0'
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toLocaleString()
  }

  function formatFullTokens(n) {
    const num = Number(n)
    return Number.isFinite(num) ? num.toLocaleString() : '0'
  }

  function formatCost(n) {
    const num = Number(n)
    return Number.isFinite(num) ? '$' + num.toFixed(4) : '$0.0000'
  }

  function formatValue(entry) {
    return activeMetric === 'cost' ? formatCost(entry.total_cost_usd) : formatTokens(entry.total_tokens)
  }

  function formatFullValue(entry) {
    return activeMetric === 'cost' ? formatCost(entry.total_cost_usd) : formatFullTokens(entry.total_tokens)
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
    loadFilters().then(() => loadLeaderboard())
  }

  function switchMetric(metric) {
    if (activeMetric === metric || loading) return
    activeMetric = metric
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
    loadLeaderboard()
  }

  function selectChip(value) {
    if (activeScope === 'tool') {
      selectedTool = value
    } else if (activeScope === 'model') {
      selectedModel = value
    }
    loadLeaderboard()
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
  }

  onMount(() => {
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
      <div class="toolbar" aria-label={zh ? '周期选择' : 'Period'}>
        {#each periods as p}
          <button class="pill" class:active={activePeriod === p.key} on:click={() => switchPeriod(p.key)}>
            {zh ? p.zh : p.en}
          </button>
        {/each}
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
        <span class="me-rank">#{data.current_user.rank}</span>
        <span class="me-name">{data.current_user.display_name}</span>
        <span class="me-tokens">{formatFullValue(data.current_user)} {activeMetric === 'tokens' ? 'tokens' : ''}</span>
      </div>
    {/if}

    {#if leaders.length > 0}
      <div class="leaders" aria-label={zh ? '前三名' : 'Top three'}>
        {#each leaders as entry}
          <div class="leader">
            <span class="leader-rank">#{entry.rank}</span>
            {#if entry.avatar_url}
              <img src={entry.avatar_url} alt="" class="leader-avatar" />
            {:else}
              <span class="leader-avatar placeholder">{avatarText(entry.display_name)}</span>
            {/if}
            <span class="leader-name">{entry.display_name}</span>
            <span class="leader-tokens">{formatValue(entry)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="table-wrap">
      <div class="table-meta">
        <span>{periodLabel(activePeriod)}</span>
        <span>{valueLabel}</span>
        <span>{scopes.find(s => s.key === activeScope)?.[zh ? 'zh' : 'en']}{selectedChip ? `: ${selectedChip}` : ''}</span>
        {#if data?.period_start}
          <span>{zh ? '周期开始' : 'Period start'}: {formatDate(data.period_start)}</span>
        {/if}
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
              <span class="col-tokens" role="cell" title={formatFullValue(entry)}>
                {formatValue(entry)}
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
  .lb-page { padding: 24px 0 64px; }
  .lb-container { width: min(var(--content-width), 1040px); margin: 0 auto; }

  .ranking-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
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

  .chip-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 72px;
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
    grid-template-columns: 72px 1fr auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--accent-dim);
    color: var(--text);
  }
  .me-rank, .me-tokens { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .me-rank { color: var(--accent); font-weight: 750; }
  .me-name { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .me-tokens { color: var(--text-secondary); font-size: 0.8125rem; }

  .leaders {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 20px;
  }
  .leader {
    display: grid;
    grid-template-columns: auto 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 12px;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border-subtle);
  }
  .leader-rank { font-family: var(--mono); color: var(--text-muted); font-size: 0.8125rem; }
  .leader-avatar, .leader-avatar.placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }
  .leader-avatar.placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--raised);
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 750;
  }
  .leader-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
  .leader-tokens { font-family: var(--mono); font-size: 0.8125rem; color: var(--text-secondary); }

  .table-wrap {
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
  }

  .table-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .lb-row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 144px 144px;
    align-items: center;
    min-height: 48px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .lb-row.has-scope { grid-template-columns: 72px minmax(0, 1fr) minmax(140px, 220px) 144px 144px; }
  .lb-row:last-child { border-bottom: 0; }
  .lb-row:not(.header):hover { background: var(--raised); }
  .lb-row.top { background: oklch(0.55 0.12 175 / 0.035); }
  .lb-row.header {
    min-height: 40px;
    background: var(--raised);
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .col-rank, .col-tokens { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .col-rank { color: var(--text-secondary); font-weight: 650; }
  .col-user { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 600; }
  .user-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-scope { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.8125rem; }
  .col-tokens { text-align: right; font-weight: 650; }
  .col-updated { color: var(--text-muted); text-align: right; font-size: 0.8125rem; }

  .avatar, .avatar-placeholder {
    width: 28px;
    height: 28px;
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
  .state.error { color: var(--rose); background: oklch(0.55 0.22 25 / 0.06); }
  .empty-guide { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .guide-text { font-size: 0.8125rem; }
  .guide-cmd { font-family: var(--mono); font-size: 0.8125rem; background: var(--raised); padding: 0.5rem 1rem; border-radius: 6px; color: var(--accent); user-select: all; }

  .load-more {
    display: block;
    margin: 16px auto;
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
  .retry-btn { margin-top: 0.5rem; padding: 0.375rem 1rem; border: 1px solid var(--border-medium); border-radius: 6px; background: var(--surface); color: var(--text-primary); font-weight: 600; font-size: 0.8125rem; cursor: pointer; }
  .retry-btn:hover { background: var(--hover); }

  @media (max-width: 760px) {
    .lb-page { padding-top: 16px; }
    .leaders { grid-template-columns: 1fr; }
    .control-row { flex-direction: column; align-items: stretch; }
    .toolbar { width: 100%; }
    .chip-bar { max-height: 60px; }
    .table-meta { flex-wrap: wrap; gap: 8px 14px; }
    .lb-row { grid-template-columns: 52px minmax(0, 1fr) 92px; padding: 0 12px; }
    .lb-row.has-scope { grid-template-columns: 52px minmax(0, 1fr) 92px; }
    .col-scope { display: none; }
    .col-updated { display: none; }
    .me-row { grid-template-columns: 56px 1fr; }
    .me-tokens { grid-column: 2; }
    .role-note { grid-template-columns: 1fr; }
  }
</style>
