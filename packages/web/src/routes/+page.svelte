<script>
  import { dateRange, formatNumber, formatCost, formatTokens } from '$lib/stores.js'
  import { fetchSummary } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
  let loading = true

  async function loadData() {
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

  $: $dateRange, loadData()
</script>

<svelte:head>
  <title>Overview - aiusage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data || data.totalTokens === 0}
  <div class="empty">
    <h2>No data available</h2>
    <p>Start using AI tools to see statistics here.</p>
  </div>
{:else}
  <div class="stats">
    <div class="stat">
      <h3>Total Tokens</h3>
      <p>{formatTokens(data.totalTokens)}</p>
    </div>
    <div class="stat">
      <h3>Total Cost</h3>
      <p>{formatCost(data.totalCost)}</p>
    </div>
    <div class="stat">
      <h3>Active Days</h3>
      <p>{data.activeDays}</p>
    </div>
  </div>

  <div class="sections">
    <section>
      <h3>By AI Assistant</h3>
      {#if Object.keys(data.byTool).length === 0}
        <p class="muted">No data</p>
      {:else}
        <table>
          <thead>
            <tr><th>Tool</th><th>Tokens</th><th>Cost</th></tr>
          </thead>
          <tbody>
            {#each Object.entries(data.byTool) as [tool, stats]}
              <tr>
                <td>{tool}</td>
                <td>{formatTokens(stats.tokens)}</td>
                <td>{formatCost(stats.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section>
      <h3>Top Tool Calls</h3>
      {#if data.topToolCalls.length === 0}
        <p class="muted">No tool calls recorded</p>
      {:else}
        <div class="tool-calls">
          {#each data.topToolCalls as tc}
            <div class="tc-row">
              <span class="tc-name">{tc.name}</span>
              <span class="tc-count">{formatNumber(tc.count)}</span>
            </div>
          {/each}
        </div>
      {/if}
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
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat {
    background: #f8f9fa;
    padding: 1.25rem;
    border-radius: 8px;
    text-align: center;
  }
  .stat h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.05em;
  }
  .stat p {
    margin: 0.5rem 0 0;
    font-size: 1.75rem;
    font-weight: 700;
  }
  .sections {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
  section h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
  }
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
  .tool-calls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tc-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
  }
  .tc-name { font-weight: 500; }
  .tc-count { color: #007bff; font-weight: 600; }
  .muted { color: #999; font-style: italic; }
</style>
