<script>
  import { onMount } from 'svelte'
  import { fetchConfig, fetchLeaderboard } from '$lib/api.js'
  import { formatTokens } from '$lib/stores.js'
  import { t } from '$lib/i18n.js'

  const periods = ['daily', 'weekly', 'monthly', 'yearly', 'all_time']

  let activePeriod = 'daily'
  let siteUrl = 'https://aiusage.jtanx.com'
  let data = null
  let loading = true
  let loadingMore = false
  let error = ''
  let copied = ''

  $: rows = data?.entries || []
  $: leaders = rows.slice(0, 3)

  function formatFullTokens(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n.toLocaleString() : '0'
  }

  function formatDate(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function avatarText(name) {
    return (name || 'A').trim().charAt(0).toUpperCase()
  }

  async function loadLeaderboard(cursor) {
    const more = Boolean(cursor)
    if (more) loadingMore = true
    else {
      loading = true
      data = null
    }
    error = ''

    try {
      const next = await fetchLeaderboard(siteUrl, {
        period_type: activePeriod,
        cursor,
      })
      data = more && data
        ? { ...next, entries: [...data.entries, ...next.entries] }
        : next
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load leaderboard'
    } finally {
      loading = false
      loadingMore = false
    }
  }

  function switchPeriod(period) {
    if (period === activePeriod || loading) return
    activePeriod = period
    loadLeaderboard()
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
  }

  async function copyCommand(command) {
    try {
      await navigator.clipboard.writeText(command)
      copied = command
      setTimeout(() => {
        if (copied === command) copied = ''
      }, 1600)
    } catch {}
  }

  onMount(async () => {
    const config = await fetchConfig().catch(() => null)
    if (config?.siteUrl) siteUrl = config.siteUrl
    await loadLeaderboard()
  })
</script>

<svelte:head>
  <title>{$t('leaderboard.title')} — AIUsage</title>
</svelte:head>

<div class="page-header leaderboard-header">
  <div>
    <span class="eyebrow">{$t('leaderboard.publicView')}</span>
    <h1>{$t('leaderboard.title')}</h1>
    <p>{$t('leaderboard.desc')}</p>
  </div>
  <a class="site-link" href="{siteUrl}/leaderboard" target="_blank" rel="noopener">
    {$t('leaderboard.openSite')} ↗
  </a>
</div>

<div class="period-tabs" aria-label={$t('leaderboard.period')}>
  {#each periods as period}
    <button class="period-tab" class:active={activePeriod === period} on:click={() => switchPeriod(period)}>
      {$t(`leaderboard.periods.${period}`)}
    </button>
  {/each}
</div>

{#if leaders.length > 0}
  <div class="leaders">
    {#each leaders as entry}
      <div class="leader">
        <span class="leader-rank">#{entry.rank}</span>
        {#if entry.avatar_url}
          <img src={entry.avatar_url} alt="" class="leader-avatar" />
        {:else}
          <span class="leader-avatar placeholder">{avatarText(entry.display_name)}</span>
        {/if}
        <span class="leader-name">{entry.display_name}</span>
        <span class="leader-tokens mono">{formatTokens(Number(entry.total_tokens))}</span>
      </div>
    {/each}
  </div>
{/if}

<div class="content-grid">
  <section class="card leaderboard-card">
    <div class="table-meta">
      <span>{$t(`leaderboard.periods.${activePeriod}`)}</span>
      {#if data?.period_start}
        <span>{$t('leaderboard.periodStart')}: {formatDate(data.period_start)}</span>
      {/if}
      <span>{$t('leaderboard.showing')} {rows.length}</span>
    </div>

    {#if error}
      <div class="state-msg error">{error}</div>
    {:else if loading}
      <div class="state-msg">{$t('common.loading')}</div>
    {:else if rows.length === 0}
      <div class="state-msg">{$t('leaderboard.noEntries')}</div>
    {:else}
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{$t('leaderboard.user')}</th>
              <th class="num">Tokens</th>
              <th class="num updated">{$t('leaderboard.updated')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as entry}
              <tr class:top={entry.rank <= 3}>
                <td class="mono muted-rank">#{entry.rank}</td>
                <td>
                  <span class="user-cell">
                    {#if entry.avatar_url}
                      <img src={entry.avatar_url} alt="" class="avatar" />
                    {:else}
                      <span class="avatar placeholder">{avatarText(entry.display_name)}</span>
                    {/if}
                    <span class="user-name">{entry.display_name}</span>
                  </span>
                </td>
                <td class="mono num" title={formatFullTokens(entry.total_tokens)}>{formatTokens(Number(entry.total_tokens))}</td>
                <td class="num updated">{formatDate(entry.updated_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if data.next_cursor}
        <button class="load-more" on:click={loadMore} disabled={loadingMore}>
          {loadingMore ? $t('leaderboard.loadingMore') : $t('leaderboard.loadMore')}
        </button>
      {/if}
    {/if}
  </section>

  <aside class="card guide-card">
    <div class="section-title">{$t('leaderboard.uploadNote')}</div>
    <div class="command-list">
      <div class="command-row">
        <span>{$t('leaderboard.loginCommand')}</span>
        <button on:click={() => copyCommand('aiusage login')}>
          {copied === 'aiusage login' ? $t('leaderboard.copied') : $t('leaderboard.copy')}
        </button>
        <code>aiusage login</code>
      </div>
      <div class="command-row">
        <span>{$t('leaderboard.uploadCommand')}</span>
        <button on:click={() => copyCommand('aiusage upload')}>
          {copied === 'aiusage upload' ? $t('leaderboard.copied') : $t('leaderboard.copy')}
        </button>
        <code>aiusage upload</code>
      </div>
    </div>
    <p class="privacy-copy">{$t('leaderboard.privacy')}</p>
  </aside>
</div>

<style>
  .leaderboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }

  .eyebrow {
    display: block;
    margin-bottom: 0.35rem;
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .site-link {
    min-height: 32px;
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .site-link:hover {
    color: var(--text);
    background: var(--surface);
  }

  .period-tabs {
    display: flex;
    gap: 0.25rem;
    width: fit-content;
    max-width: 100%;
    margin-bottom: 1rem;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    overflow-x: auto;
  }

  .period-tab {
    min-height: 30px;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }

  .period-tab:hover,
  .period-tab.active {
    color: var(--accent);
    background: var(--bg);
  }

  .leaders {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .leader {
    display: grid;
    grid-template-columns: auto 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
    min-height: 56px;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--surface);
  }

  .leader-rank,
  .leader-tokens {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .leader-avatar,
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .leader-avatar {
    width: 32px;
    height: 32px;
  }

  .placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 750;
  }

  .leader-name,
  .user-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1rem;
    align-items: start;
  }

  .leaderboard-card {
    padding: 0;
    overflow: hidden;
  }

  .table-meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .table-scroll {
    overflow-x: auto;
  }

  th,
  td {
    white-space: nowrap;
  }

  .num {
    text-align: right;
  }

  .muted-rank {
    color: var(--text-muted);
    font-weight: 650;
  }

  tr.top {
    background: color-mix(in oklab, var(--accent) 6%, transparent);
  }

  .user-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .load-more {
    display: block;
    margin: 1rem auto;
    min-height: 32px;
    padding: 0 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-weight: 650;
    cursor: pointer;
  }

  .load-more:hover {
    color: var(--text);
    background: var(--bg);
  }

  .guide-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .command-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .command-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
  }

  .command-row span {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 650;
  }

  .command-row button {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .command-row code {
    grid-column: 1 / -1;
    padding: 0.625rem;
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    overflow-x: auto;
  }

  .privacy-copy {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  @media (max-width: 900px) {
    .leaderboard-header,
    .content-grid {
      grid-template-columns: 1fr;
    }

    .leaderboard-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .leaders {
      grid-template-columns: 1fr;
    }

    .updated {
      display: none;
    }
  }
</style>
