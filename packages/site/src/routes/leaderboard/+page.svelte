<script>
  import { onMount } from 'svelte'
  import { lang } from '$lib/lang'

  const periods = [
    { key: 'daily', zh: '今日', en: 'Daily' },
    { key: 'weekly', zh: '本周', en: 'Weekly' },
    { key: 'monthly', zh: '本月', en: 'Monthly' },
    { key: 'yearly', zh: '今年', en: 'Yearly' },
    { key: 'all_time', zh: '累计', en: 'All time' }
  ]

  let activePeriod = 'daily'
  let data = null
  let loading = true
  let loadingMore = false
  let error = ''

  $: zh = $lang === 'zh'
  $: rows = data?.entries || []
  $: leaders = rows.slice(0, 3)

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
      const params = new URLSearchParams({ period_type: activePeriod })
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
        <a href="/settings" class="btn secondary">{zh ? '上传状态' : 'Upload status'}</a>
        <a href="/login" class="btn primary">{zh ? '登录上传' : 'Sign in to upload'}</a>
      </div>
    </header>

    <div class="toolbar" aria-label={zh ? '周期选择' : 'Period selector'}>
      {#each periods as p}
        <button class="period-tab" class:active={activePeriod === p.key} on:click={() => switchPeriod(p.key)}>
          {zh ? p.zh : p.en}
        </button>
      {/each}
    </div>

    {#if data?.current_user}
      <div class="me-row">
        <span class="me-rank">#{data.current_user.rank}</span>
        <span class="me-name">{data.current_user.display_name}</span>
        <span class="me-tokens">{formatFullTokens(data.current_user.total_tokens)} tokens</span>
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
            <span class="leader-tokens">{formatTokens(entry.total_tokens)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="table-wrap">
      <div class="table-meta">
        <span>{periodLabel(activePeriod)}</span>
        {#if data?.period_start}
          <span>{zh ? '周期开始' : 'Period start'}: {formatDate(data.period_start)}</span>
        {/if}
        <span>{zh ? '已显示' : 'Showing'} {rows.length}</span>
      </div>

      {#if error}
        <div class="state error">{error}</div>
      {:else if loading}
        <div class="state">{zh ? '加载中...' : 'Loading...'}</div>
      {:else if rows.length === 0}
        <div class="state">{zh ? '暂无公开数据。' : 'No public entries yet.'}</div>
      {:else}
        <div class="lb-table" role="table" aria-label={zh ? 'Token 排行榜' : 'Token leaderboard'}>
          <div class="lb-row header" role="row">
            <span class="col-rank" role="columnheader">#</span>
            <span class="col-user" role="columnheader">{zh ? '用户' : 'User'}</span>
            <span class="col-tokens" role="columnheader">Tokens</span>
            <span class="col-updated" role="columnheader">{zh ? '更新' : 'Updated'}</span>
          </div>
          {#each rows as entry}
            <div class="lb-row" class:top={entry.rank <= 3} role="row">
              <span class="col-rank" role="cell">#{entry.rank}</span>
              <span class="col-user" role="cell">
                {#if entry.avatar_url}
                  <img src={entry.avatar_url} alt="" class="avatar" />
                {:else}
                  <span class="avatar-placeholder">{avatarText(entry.display_name)}</span>
                {/if}
                <span class="user-name">{entry.display_name}</span>
              </span>
              <span class="col-tokens" role="cell" title={formatFullTokens(entry.total_tokens)}>
                {formatTokens(entry.total_tokens)}
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

  @media (max-width: 760px) {
    .lb-page { padding-top: 24px; }
    .lb-header { align-items: flex-start; flex-direction: column; }
    .header-actions { justify-content: flex-start; }
    .leaders { grid-template-columns: 1fr; }
    .table-meta { flex-wrap: wrap; gap: 8px 14px; }
    .lb-row { grid-template-columns: 52px minmax(0, 1fr) 92px; padding: 0 12px; }
    .col-updated { display: none; }
    .me-row { grid-template-columns: 56px 1fr; }
    .me-tokens { grid-column: 2; }
    .role-note { grid-template-columns: 1fr; }
  }
</style>
