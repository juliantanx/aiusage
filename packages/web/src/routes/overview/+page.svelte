<script>
  import { onMount } from 'svelte'
  import { dateRange, selectedDevice, selectedTool, formatNumber, formatCost, formatTokens } from '$lib/stores.js'
  import { fetchSummary, refreshData } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let initialized = false

  async function loadData() {
    if (!initialized) return
    loading = true
    error = null
    try {
      data = await fetchSummary({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
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

  $: $dateRange, $selectedDevice, $selectedTool, loadData()
</script>

<svelte:head>
  <title>{$t('overview.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('overview.title')}</h1>
  <p>{$t('overview.desc')}</p>
</div>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
  <ToolSelector />
</div>

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
    <div class="hero-card">
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
    <div class="token-item">
      <span class="token-label">{$t('overview.cacheRead')}</span>
      <span class="token-value">{formatTokens(data.cacheReadTokens)}</span>
    </div>
    <div class="token-item">
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
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: opacity 0.2s;
  }
  .hero-card:hover {
    opacity: 0.9;
  }
  .hero-label {
    font-family: var(--mono);
    font-size: 0.625rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .hero-value {
    font-family: var(--mono);
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
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
    background: var(--surface);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .token-label {
    font-family: var(--mono);
    font-size: 0.625rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .token-value {
    font-family: var(--mono);
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
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
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: var(--raised);
    transition: background 0.15s;
    animation: fade 0.2s ease both;
  }
  .tc-row:hover {
    background: var(--hover);
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
    color: var(--text);
  }
  .tc-count {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
  }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (max-width: 768px) {
    .hero-stats { grid-template-columns: repeat(2, 1fr); }
    .grid-2 { grid-template-columns: 1fr; }
    .token-breakdown { flex-direction: column; }
  }
</style>
