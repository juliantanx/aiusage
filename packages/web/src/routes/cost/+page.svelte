<script>
  import { dateRange, formatCost } from '$lib/stores.js'
  import { fetchCost } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
  let loading = true

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchCost($dateRange)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, loadData()

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
  <title>Cost - aiusage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data?.data.length}
  <div class="empty">
    <h2>No cost data</h2>
    <p>No costs recorded for this period.</p>
  </div>
{:else}
  <div class="summary">
    <div class="stat">
      <h3>Total Cost</h3>
      <p>{formatCost(getTotalCost())}</p>
    </div>
  </div>

  <div class="chart-container">
    <h3>Cost by Day</h3>
    <div class="chart">
      {#each data.data as day}
        {@const max = getMaxCost()}
        <div class="bar-group">
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

  <div class="breakdown">
    <section>
      <h3>By AI Assistant</h3>
      {#each getTopEntries(data.byTool, 10) as [tool, cost]}
        <div class="row">
          <span>{tool}</span>
          <span class="cost">{formatCost(cost)}</span>
        </div>
      {/each}
    </section>

    <section>
      <h3>By Model</h3>
      {#each getTopEntries(data.byModel, 10) as [model, cost]}
        <div class="row">
          <span>{model}</span>
          <span class="cost">{formatCost(cost)}</span>
        </div>
      {/each}
    </section>
  </div>
{/if}

<style>
  .loading, .error, .empty {
    text-align: center;
    padding: 3rem;
    color: #666;
  }
  .error { color: #dc3545; }
  .summary {
    margin-bottom: 2rem;
  }
  .stat {
    background: #f8f9fa;
    padding: 1.25rem;
    border-radius: 8px;
    text-align: center;
    display: inline-block;
    min-width: 200px;
  }
  .stat h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #666;
  }
  .stat p {
    margin: 0.5rem 0 0;
    font-size: 1.75rem;
    font-weight: 700;
  }
  .chart-container {
    margin-bottom: 2rem;
  }
  .chart-container h3 {
    margin: 0 0 1rem;
  }
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 220px;
    padding: 0 0 20px;
    border-bottom: 1px solid #eee;
  }
  .bar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bar {
    width: 16px;
    min-height: 2px;
    background: #FF9800;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }
  .label {
    font-size: 0.7rem;
    color: #666;
    margin-top: 4px;
  }
  .breakdown {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
  section h3 {
    margin: 0 0 1rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 0.4rem 0;
    border-bottom: 1px solid #eee;
  }
  .cost {
    font-weight: 600;
    color: #FF9800;
  }
</style>
