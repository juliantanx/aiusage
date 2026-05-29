<script>
  import { onMount } from 'svelte'

  const periods = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
    { key: 'all_time', label: 'All Time' }
  ]

  let activePeriod = 'daily'
  let data = null
  let loading = true
  let error = ''

  function formatTokens(n) {
    const num = Number(n)
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toLocaleString()
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  async function loadLeaderboard(cursor) {
    loading = true
    error = ''
    try {
      const params = new URLSearchParams({ period_type: activePeriod })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/leaderboard?${params}`)
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      data = await res.json()
    } catch {
      error = 'Failed to load leaderboard'
    } finally {
      loading = false
    }
  }

  function switchPeriod(period) {
    activePeriod = period
    loadLeaderboard()
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
  }

  onMount(() => loadLeaderboard())
</script>

<svelte:head>
  <title>Token Leaderboard — AIUsage</title>
</svelte:head>

<div class="lb-page">
  <div class="lb-container">
    <div class="lb-header">
      <h1>Token Leaderboard</h1>
      <p class="lb-subtitle">Community token consumption rankings</p>
    </div>

    <div class="period-tabs">
      {#each periods as p}
        <button class="period-tab" class:active={activePeriod === p.key} on:click={() => switchPeriod(p.key)}>
          {p.label}
        </button>
      {/each}
    </div>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}

    {#if loading && !data}
      <div class="loading">Loading...</div>
    {:else if data}
      {#if data.current_user}
        <div class="your-rank">
          <div class="rank-badge">#{data.current_user.rank}</div>
          <div class="rank-info">
            <span class="rank-name">{data.current_user.display_name}</span>
            <span class="rank-tokens">{formatTokens(data.current_user.total_tokens)} tokens</span>
          </div>
        </div>
      {/if}

      <div class="lb-table">
        <div class="lb-row header">
          <span class="col-rank">#</span>
          <span class="col-user">User</span>
          <span class="col-tokens">Tokens</span>
          <span class="col-updated">Updated</span>
        </div>
        {#each data.entries as entry}
          <div class="lb-row" class:highlight={entry.rank <= 3}>
            <span class="col-rank">
              {#if entry.rank === 1}
                <span class="medal gold">1</span>
              {:else if entry.rank === 2}
                <span class="medal silver">2</span>
              {:else if entry.rank === 3}
                <span class="medal bronze">3</span>
              {:else}
                {entry.rank}
              {/if}
            </span>
            <span class="col-user">
              {#if entry.avatar_url}
                <img src={entry.avatar_url} alt="" class="avatar" />
              {:else}
                <span class="avatar-placeholder">{entry.display_name[0]}</span>
              {/if}
              {entry.display_name}
            </span>
            <span class="col-tokens">{formatTokens(entry.total_tokens)}</span>
            <span class="col-updated">{formatDate(entry.updated_at)}</span>
          </div>
        {:else}
          <div class="empty">No entries yet. Be the first to upload!</div>
        {/each}
      </div>

      {#if data.next_cursor}
        <button class="load-more" on:click={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .lb-page { padding: 2rem 0; }
  .lb-container { width: var(--content-width); margin: 0 auto; max-width: 900px; }
  .lb-header { text-align: center; margin-bottom: 2rem; }
  h1 { font-size: 2rem; font-weight: 700; letter-spacing: -0.025em; }
  .lb-subtitle { color: var(--text-muted); font-size: 1rem; margin-top: 0.5rem; }

  .period-tabs { display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 2rem; flex-wrap: wrap; }
  .period-tab {
    padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600;
    border: 1px solid var(--border-medium); border-radius: 8px;
    background: transparent; color: var(--text-secondary); cursor: pointer;
    transition: all 0.15s;
  }
  .period-tab:hover { border-color: var(--accent); color: var(--text); }
  .period-tab.active { background: var(--accent); color: oklch(0.99 0.002 85); border-color: var(--accent); }

  .your-rank {
    display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
    background: var(--accent-dim); border: 1px solid oklch(0.52 0.14 165 / 0.2);
    border-radius: 10px; margin-bottom: 1.5rem;
  }
  .rank-badge {
    font-family: var(--mono); font-size: 1.5rem; font-weight: 700;
    color: var(--accent); min-width: 3rem; text-align: center;
  }
  .rank-info { display: flex; flex-direction: column; }
  .rank-name { font-weight: 600; }
  .rank-tokens { font-family: var(--mono); font-size: 0.875rem; color: var(--text-secondary); }

  .lb-table { border: 1px solid var(--border-subtle); border-radius: 10px; overflow: hidden; }
  .lb-row {
    display: grid; grid-template-columns: 60px 1fr 140px 140px;
    padding: 0.875rem 1.25rem; align-items: center;
    border-bottom: 1px solid var(--border-subtle);
  }
  .lb-row:last-child { border-bottom: none; }
  .lb-row.header {
    background: var(--raised); font-size: 0.75rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted);
  }
  .lb-row.highlight { background: oklch(0.52 0.14 165 / 0.03); }

  .col-rank { font-family: var(--mono); font-weight: 600; text-align: center; }
  .col-user { display: flex; align-items: center; gap: 0.75rem; font-weight: 500; }
  .col-tokens { font-family: var(--mono); font-weight: 600; text-align: right; }
  .col-updated { font-size: 0.8125rem; color: var(--text-muted); text-align: right; }

  .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
  .avatar-placeholder {
    width: 28px; height: 28px; border-radius: 50%; background: var(--accent-dim);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; color: var(--accent); flex-shrink: 0;
  }

  .medal { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; font-size: 0.8125rem; font-weight: 700; }
  .medal.gold { background: oklch(0.75 0.15 85); color: oklch(0.25 0.05 85); }
  .medal.silver { background: oklch(0.75 0.02 250); color: oklch(0.25 0.02 250); }
  .medal.bronze { background: oklch(0.65 0.12 50); color: oklch(0.25 0.05 50); }

  .empty { padding: 3rem; text-align: center; color: var(--text-muted); }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; text-align: center; }
  .loading { padding: 3rem; text-align: center; color: var(--text-muted); }

  .load-more {
    display: block; margin: 1.5rem auto 0; padding: 0.625rem 2rem;
    font-size: 0.875rem; font-weight: 600; border: 1px solid var(--border-medium);
    border-radius: 8px; background: transparent; color: var(--text-secondary);
    cursor: pointer; transition: all 0.15s;
  }
  .load-more:hover { border-color: var(--accent); color: var(--text); }
  .load-more:disabled { opacity: 0.6; cursor: not-allowed; }

  @media (max-width: 600px) {
    .lb-row { grid-template-columns: 40px 1fr 100px; }
    .col-updated { display: none; }
  }
</style>
