<script>
  import { dateRange, formatNumber } from '$lib/stores.js'
  import { fetchToolCalls } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
  let loading = true

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchToolCalls($dateRange)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, loadData()
</script>

<svelte:head>
  <title>Tool Calls - aiusage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data?.toolCalls.length}
  <div class="empty">
    <h2>No tool call data</h2>
    <p>No tool calls recorded for this period.</p>
  </div>
{:else}
  <div class="ranking">
    {#each data.toolCalls as tc, i}
      <div class="row">
        <span class="rank">#{i + 1}</span>
        <span class="name">{tc.name}</span>
        <div class="bar-container">
          <div class="bar" style="width: {tc.percentage}%"></div>
        </div>
        <span class="count">{formatNumber(tc.count)}</span>
        <span class="pct">{tc.percentage.toFixed(1)}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .loading, .error, .empty {
    text-align: center;
    padding: 3rem;
    color: #666;
  }
  .error { color: #dc3545; }
  .ranking {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 8rem 1fr 4rem 3.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 6px;
  }
  .rank {
    color: #666;
    font-size: 0.875rem;
  }
  .name {
    font-weight: 600;
    font-family: monospace;
  }
  .bar-container {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: #007bff;
    border-radius: 4px;
    transition: width 0.3s;
  }
  .count {
    text-align: right;
    font-weight: 600;
  }
  .pct {
    text-align: right;
    color: #666;
    font-size: 0.875rem;
  }
</style>
