<script lang="ts">
  import { onMount } from 'svelte'
  import { dateRange, formatTokens } from '$lib/stores.js'
  import { fetchTokens, type TokenData } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data: TokenData | null = null
  let error: string | null = null
  let loading = true

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchTokens($dateRange)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  onMount(loadData)
  $: $dateRange, loadData()

  function getMaxTokens(): number {
    if (!data?.data.length) return 0
    return Math.max(...data.data.map(d => d.inputTokens + d.outputTokens + d.thinkingTokens))
  }

  function getBarHeight(tokens: number, max: number): number {
    return max > 0 ? (tokens / max) * 200 : 0
  }
</script>

<svelte:head>
  <title>Tokens - aiusage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data?.data.length}
  <div class="empty">
    <h2>No token data</h2>
    <p>No token usage recorded for this period.</p>
  </div>
{:else}
  <div class="chart-container">
    <h3>Token Usage by Day</h3>
    <div class="chart">
      {#each data.data as day}
        {@const total = day.inputTokens + day.outputTokens + day.thinkingTokens}
        {@const max = getMaxTokens()}
        <div class="bar-group">
          <div class="bars">
            <div
              class="bar input"
              style="height: {getBarHeight(day.inputTokens, max)}px"
              title="Input: {formatTokens(day.inputTokens)}"
            ></div>
            <div
              class="bar output"
              style="height: {getBarHeight(day.outputTokens, max)}px"
              title="Output: {formatTokens(day.outputTokens)}"
            ></div>
            {#if day.thinkingTokens > 0}
              <div
                class="bar thinking"
                style="height: {getBarHeight(day.thinkingTokens, max)}px"
                title="Thinking: {formatTokens(day.thinkingTokens)}"
              ></div>
            {/if}
          </div>
          <div class="label">{day.date.slice(5)}</div>
        </div>
      {/each}
    </div>
    <div class="legend">
      <span class="legend-item"><span class="dot input"></span> Input</span>
      <span class="legend-item"><span class="dot output"></span> Output</span>
      <span class="legend-item"><span class="dot thinking"></span> Thinking</span>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Date</th><th>Input</th><th>Output</th><th>Thinking</th><th>Total</th></tr>
    </thead>
    <tbody>
      {#each data.data as day}
        <tr>
          <td>{day.date}</td>
          <td>{formatTokens(day.inputTokens)}</td>
          <td>{formatTokens(day.outputTokens)}</td>
          <td>{formatTokens(day.thinkingTokens)}</td>
          <td><strong>{formatTokens(day.inputTokens + day.outputTokens + day.thinkingTokens)}</strong></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .loading, .error, .empty {
    text-align: center;
    padding: 3rem;
    color: #666;
  }
  .error { color: #dc3545; }
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
  .bars {
    display: flex;
    gap: 1px;
    align-items: flex-end;
  }
  .bar {
    width: 12px;
    min-height: 2px;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }
  .bar.input { background: #4CAF50; }
  .bar.output { background: #2196F3; }
  .bar.thinking { background: #9C27B0; }
  .label {
    font-size: 0.7rem;
    color: #666;
    margin-top: 4px;
  }
  .legend {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    justify-content: center;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .dot.input { background: #4CAF50; }
  .dot.output { background: #2196F3; }
  .dot.thinking { background: #9C27B0; }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }
  th {
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #666;
  }
</style>
