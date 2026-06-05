<script>
  import { dateRange, selectedDevice, selectedTool, formatCost } from '$lib/stores.js'
  import { fetchCost } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchCost({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, $selectedTool, loadData()

  function getMaxCost() {
    if (!data?.data.length) return 0
    return Math.max(...data.data.map(d => d.cost))
  }

  function getBarHeight(cost, max) {
    return max > 0 ? (cost / max) * 200 : 0
  }

  function getTotalCost() {
    if (!data?.data.length) return 0
    return data.data.reduce((sum, d) => sum + d.cost, 0)
  }

  function getTopEntries(obj, limit) {
    return Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
  }
</script>

<svelte:head>
  <title>{$t('cost.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('cost.title')}</h1>
  <p>{$t('cost.desc')}</p>
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
{:else if !data?.data.length}
  <div class="state-msg">
    <h2>{$t('cost.noData')}</h2>
    <p>{$t('cost.noDataHint')}</p>
  </div>
{:else}
  <div class="hero-card">
    <span class="hero-label">{$t('cost.totalCost')}</span>
    <span class="hero-value">{formatCost(getTotalCost())}</span>
  </div>

  <div class="card chart-section">
    <div class="section-title">{$t('cost.chartTitle')}</div>
    <div class="chart">
      {#each data.data as day, i}
        {@const max = getMaxCost()}
        <div class="bar-group" style="animation-delay: {i * 30}ms">
          <div
            class="bar"
            style="height: {getBarHeight(day.cost, max)}px"
            title="{formatCost(day.cost)}"
          ></div>
          <div class="label">{day.date.slice(5)}</div>
        </div>
      {/each}
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="section-title">{$t('cost.byTool')}</div>
      {#each getTopEntries(data.byTool, 10) as [tool, cost]}
        <div class="breakdown-row">
          <span class="mono">{tool}</span>
          <span class="mono accent">{formatCost(cost)}</span>
        </div>
      {/each}
    </div>
    <div class="card">
      <div class="section-title">{$t('cost.byModel')}</div>
      {#each getTopEntries(data.byModel, 10) as [model, cost]}
        <div class="breakdown-row">
          <span class="mono">{model}</span>
          <span class="mono accent">{formatCost(cost)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .hero-card {
    display: inline-flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem 2rem;
    margin-bottom: 1.5rem;
  }
  .hero-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .hero-value {
    font-family: var(--mono);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
  }

  .chart-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
  }
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 220px;
    padding: 0 0 16px;
    border-bottom: 1px solid var(--border-subtle);
    overflow-x: auto;
    overflow-y: hidden;
    min-width: 0;
  }
  .bar-group {
    flex: 0 0 auto;
    min-width: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: fade 0.2s ease both;
  }
  .bar {
    width: 14px;
    min-height: 2px;
    background: var(--accent);
    border-radius: 2px 2px 0 0;
    transition: height 0.4s ease;
  }
  .label {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 6px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .breakdown-row {
    display: flex;
    justify-content: space-between;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .breakdown-row:last-child {
    border-bottom: none;
  }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (max-width: 800px) {
    .grid-2 { grid-template-columns: 1fr; }
  }
</style>
