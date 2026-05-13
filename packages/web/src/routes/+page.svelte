<script>
  import { onMount } from 'svelte'
  import { dateRange, formatNumber, formatCost, formatTokens } from '$lib/stores.js'
  import { fetchSummary, refreshData } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let initialized = false

  async function loadData() {
    if (!initialized) return
    loading = true
    error = null
    try {
      data = await fetchSummary($dateRange)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  onMount(async () => {
    await refreshData().catch(() => {})
    initialized = true
    await loadData()
  })

  $: $dateRange, loadData()
</script>

<svelte:head>
  <title>{$t('overview.title')} — AIUsage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if !data || data.totalTokens === 0}
  <div class="state-msg">
    <h2>{$t('common.noData')}</h2>
    <p>{$t('common.noDataHint')}</p>
  </div>
{:else}
  <div class="hero-stats">
    <div class="hero-card">
      <span class="hero-label">{$t('overview.totalTokens')}</span>
      <span class="hero-value">{formatTokens(data.totalTokens)}</span>
    </div>
    <div class="hero-card accent">
      <span class="hero-label">{$t('overview.totalCost')}</span>
      <span class="hero-value">{formatCost(data.totalCost)}</span>
    </div>
    <div class="hero-card">
      <span class="hero-label">{$t('overview.activeDays')}</span>
      <span class="hero-value">{data.activeDays}</span>
    </div>
    <div class="hero-card">
      <span class="hero-label">{$t('overview.totalSessions')}</span>
      <span class="hero-value">{formatNumber(data.totalSessions || 0)}</span>
    </div>
  </div>

  <div class="token-breakdown">
    <div class="token-item">
      <span class="token-label">{$t('overview.inputTokens')}</span>
      <span class="token-value">{formatTokens(data.inputTokens)}</span>
    </div>
    <div class="token-item">
      <span class="token-label">{$t('overview.outputTokens')}</span>
      <span class="token-value">{formatTokens(data.outputTokens)}</span>
    </div>
    <div class="token-item cache">
      <span class="token-label">{$t('overview.cacheRead')}</span>
      <span class="token-value">{formatTokens(data.cacheReadTokens)}</span>
    </div>
    <div class="token-item cache">
      <span class="token-label">{$t('overview.cacheWrite')}</span>
      <span class="token-value">{formatTokens(data.cacheWriteTokens)}</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="section-title">{$t('overview.byTool')}</div>
      {#if Object.keys(data.byTool).length === 0}
        <p class="muted">{$t('overview.noToolData')}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>{$t('overview.tool')}</th>
              <th>{$t('overview.tokens')}</th>
              <th>{$t('overview.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {#each Object.entries(data.byTool) as [tool, stats]}
              <tr>
                <td class="mono">{tool}</td>
                <td class="mono">{formatTokens(stats.tokens)}</td>
                <td class="mono accent">{formatCost(stats.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <div class="card">
      <div class="section-title">{$t('overview.topToolCalls')}</div>
      {#if data.topToolCalls.length === 0}
        <p class="muted">{$t('overview.noToolCalls')}</p>
      {:else}
        <div class="tc-list">
          {#each data.topToolCalls as tc, i}
            <div class="tc-row" style="animation-delay: {i * 40}ms">
              <span class="tc-rank">#{i + 1}</span>
              <span class="tc-name mono">{tc.name}</span>
              <span class="tc-count mono">{formatNumber(tc.count)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hero-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .hero-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .hero-card:hover {
    border-color: var(--border-medium);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  }
  .hero-card.accent {
    border-color: var(--accent-dim);
    background: linear-gradient(135deg, var(--bg-surface), var(--accent-dim));
  }
  .hero-label {
    font-family: var(--mono);
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .hero-value {
    font-family: var(--mono);
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }
  .hero-card.accent .hero-value {
    color: var(--accent);
    text-shadow: 0 0 20px var(--accent-glow);
  }

  .token-breakdown {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .token-item {
    flex: 1;
    min-width: 120px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .token-item.cache {
    border-color: var(--border-subtle);
    opacity: 0.85;
  }
  .token-label {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .token-value {
    font-family: var(--mono);
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
  }

  .tc-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .tc-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    background: var(--bg-raised);
    transition: background 0.15s;
    animation: fadeUp 0.3s ease both;
  }
  .tc-row:hover {
    background: var(--bg-hover);
  }
  .tc-rank {
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    width: 2rem;
    flex-shrink: 0;
  }
  .tc-name {
    flex: 1;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .tc-count {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 768px) {
    .hero-stats { grid-template-columns: repeat(2, 1fr); }
    .grid-2 { grid-template-columns: 1fr; }
    .token-breakdown { flex-direction: column; }
  }
</style>
