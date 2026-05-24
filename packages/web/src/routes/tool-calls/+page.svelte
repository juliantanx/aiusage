<script>
  import { dateRange, selectedDevice, selectedTool, formatNumber } from '$lib/stores.js'
  import { fetchToolCalls } from '$lib/api.js'
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
      data = await fetchToolCalls({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, $selectedTool, loadData()
</script>

<svelte:head>
  <title>{$t('toolCalls.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('toolCalls.title')}</h1>
  <p>{$t('toolCalls.desc')}</p>
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
{:else if !data?.toolCalls.length}
  <div class="state-msg">
    <h2>{$t('toolCalls.noData')}</h2>
    <p>{$t('toolCalls.noDataHint')}</p>
  </div>
{:else}
  <div class="ranking">
    {#each data.toolCalls as tc, i}
      <div class="row animate-row">
        <span class="rank mono">#{i + 1}</span>
        <span class="name mono">{tc.name}</span>
        <div class="bar-container">
          <div class="bar" style="width: {tc.percentage}%"></div>
        </div>
        <span class="count mono">{formatNumber(tc.count)}</span>
        <span class="pct mono">{tc.percentage.toFixed(1)}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .ranking {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 8rem 1fr 4.5rem 3.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--surface);
    border-radius: 8px;
    transition: background 0.15s;
  }
  .row:hover {
    background: var(--hover);
  }
  .rank {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text);
  }
  .bar-container {
    height: 6px;
    background: var(--raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.6s ease;
  }
  .count {
    text-align: right;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text);
  }
  .pct {
    text-align: right;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .animate-row {
    animation: fadeIn 0.2s ease both;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
