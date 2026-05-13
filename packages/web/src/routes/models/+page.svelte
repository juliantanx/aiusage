<script>
  import { dateRange, formatTokens, formatNumber } from '$lib/stores.js'
  import { fetchModels } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
  let loading = true

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchModels($dateRange)
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
  <title>Models - aiusage</title>
</svelte:head>

<DateRangeSelector />

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data?.models.length}
  <div class="empty">
    <h2>No model data</h2>
    <p>No model usage recorded for this period.</p>
  </div>
{:else}
  <table>
    <thead>
      <tr>
        <th>Model</th>
        <th>Provider</th>
        <th>Calls</th>
        <th>Tokens</th>
        <th>Share</th>
      </tr>
    </thead>
    <tbody>
      {#each data.models as model}
        <tr>
          <td class="model-name">{model.model}</td>
          <td class="provider">{model.provider}</td>
          <td>{formatNumber(model.callCount)}</td>
          <td>{formatTokens(model.totalTokens)}</td>
          <td>
            <div class="bar-container">
              <div class="bar" style="width: {model.percentage}%"></div>
              <span>{model.percentage.toFixed(1)}%</span>
            </div>
          </td>
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
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.75rem 0.5rem;
    border-bottom: 1px solid #eee;
  }
  th {
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #666;
  }
  .model-name {
    font-weight: 600;
    font-family: monospace;
  }
  .provider {
    color: #666;
  }
  .bar-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar {
    height: 8px;
    background: #007bff;
    border-radius: 4px;
    min-width: 4px;
  }
</style>
