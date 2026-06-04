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
    { key: 'model', zh: '模型', en: 'Model' },
    { key: 'tool_model', zh: '工具 + 模型', en: 'Tool + model' }
  ]

  let activePeriod = 'daily'
  let activeMetric = 'tokens'
  let activeScope = 'all'
  let toolFilter = ''
  let modelFilter = ''
  let data = null
  let loading = true
  let loadingMore = false
  let error = ''

  $: zh = $lang === 'zh'
  $: user = $page.data.user
  $: rows = data?.entries || []
  $: leaders = rows.slice(0, 3)
  $: valueLabel = activeMetric === 'cost' ? (zh ? '费用' : 'Cost') : 'Tokens'

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
    if (entry.scope_type === 'tool_model') return `${entry.tool || '-'} / ${entry.model || '-'}`
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
      if ((activeScope === 'tool' || activeScope === 'tool_model') && toolFilter.trim()) params.set('tool', toolFilter.trim())
      if ((activeScope === 'model' || activeScope === 'tool_model') && modelFilter.trim()) params.set('model', modelFilter.trim())
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
    loadLeaderboard()
  }

  function reloadRanking() {
    loadLeaderboard()
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
  }

  onMount(() => loadLeaderboard())
</script>

<svelte:head>
  <title>{zh ? '公开排行榜' : 'Public Leaderboard'} - AIUsage</title>
</svelte:head>

<section class="lb-page">
  <div class="lb-container">
    <header class="lb-header">
      <div>
        <p class="eyebrow">{zh ? '公开浏览' : 'Public view'}</p>
        <h1>{zh ? 'AIUsage 排行榜' : 'AIUsage Leaderboard'}</h1>
      </div>
      <div class="header-actions">
        {#if user}
          <a href="/uploads" class="btn secondary">{zh ? '上传状态' : 'Upload status'}</a>
        {:else}
          <a href="/login" class="btn primary">{zh ? '登录上传' : 'Sign in to upload'}</a>
        {/if}
      </div>
    </header>

    <div class="ranking-controls">
      <div class="toolbar" aria-label={zh ? '周期选择' : 'Period selector'}>
        {#each periods as p}
          <button class="period-tab" class:active={activePeriod === p.key} on:click={() => switchPeriod(p.key)}>
            {zh ? p.zh : p.en}
          </button>
        {/each}
      </div>

      <label class="control">
        <span>{zh ? '指标' : 'Metric'}</span>
        <select bind:value={activeMetric} on:change={reloadRanking}>
          {#each metrics as metric}
            <option value={metric.key}>{zh ? metric.zh : metric.en}</option>
          {/each}
        </select>
      </label>

      <label class="control">
        <span>{zh ? '范围' : 'Scope'}</span>
        <select bind:value={activeScope} on:change={reloadRanking}>
          {#each scopes as scope}
            <option value={scope.key}>{zh ? scope.zh : scope.en}</option>
          {/each}
        </select>
      </label>

      {#if activeScope === 'tool' || activeScope === 'tool_model'}
        <label class="control filter">
          <span>{zh ? '工具' : 'Tool'}</span>
          <input bind:value={toolFilter} on:change={reloadRanking} placeholder={zh ? '可选' : 'Optional'} />
        </label>
      {/if}

      {#if activeScope === 'model' || activeScope === 'tool_model'}
        <label class="control filter">
          <span>{zh ? '模型' : 'Model'}</span>
          <input bind:value={modelFilter} on:change={reloadRanking} placeholder={zh ? '可选' : 'Optional'} />
        </label>
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
        <span>{scopes.find(s => s.key === activeScope)?.[zh ? 'zh' : 'en']}</span>
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
          <code class="guide-cmd">npx aiusage login && npx aiusage upload</code>
        </div>
      {:else}
        <div class="lb-table" role="table" aria-label={zh ? 'Token 排行榜' : 'Token leaderboard'}>
          <div class="lb-row header" class:has-scope={activeScope !== 'all'} role="row">
            <span class="col-rank" role="columnheader">#</span>
            <span class="col-user" role="columnheader">{zh ? '用户' : 'User'}</span>
            {#if activeScope !== 'all'}
              <span class="col-scope" role="columnheader">{zh ? '范围' : 'Scope'}</span>
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
        <strong>{zh ? 'CLI' : 'CLI'}</strong>
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
  .lb-page { padding: 40px 0 64px; }
  .lb-container { width: min(var(--content-width), 1040px); margin: 0 auto; }

  .lb-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .header-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 650;
    text-decoration: none;
  }
  .btn.primary { background: var(--accent); color: oklch(0.99 0.002 85); }
  .btn.secondary { border: 1px solid var(--border-medium); color: var(--text-secondary); background: transparent; }

  .toolbar {
    display: flex;
    gap: 4px;
    width: fit-content;
    max-width: 100%;
    padding: 4px;
    margin-bottom: 20px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--raised);
    overflow-x: auto;
  }

  .ranking-controls {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .ranking-controls .toolbar { margin-bottom: 0; }
  .control {
    display: grid;
    gap: 4px;
    min-width: 120px;
  }
  .control.filter { min-width: 170px; }
  .control span {
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .control select,
  .control input {
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.8125rem;
  }
  .control select:focus,
  .control input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .period-tab {
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
  .period-tab:hover { background: var(--surface); color: var(--text); }
  .period-tab.active { background: var(--surface); color: var(--accent); box-shadow: inset 0 0 0 1px var(--border-subtle); }

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
    .lb-page { padding-top: 24px; }
    .lb-header { align-items: flex-start; flex-direction: column; }
    .header-actions { justify-content: flex-start; }
    .leaders { grid-template-columns: 1fr; }
    .ranking-controls { align-items: stretch; }
    .toolbar { width: 100%; }
    .control, .control.filter { min-width: min(100%, 160px); flex: 1 1 150px; }
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
