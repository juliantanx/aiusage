<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens, formatCost, formatNumber } from '$lib/stores.js'
  import { fetchProjects } from '$lib/api.js'
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
      data = await fetchProjects({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
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
  <title>{$t('projects.title')} — AIUsage</title>
</svelte:head>

<div class="filter-bar">
  <DateRangeSelector />
  <DeviceSelector />
  <ToolSelector />
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if !data?.projects.length}
  <div class="state-msg">
    <h2>{$t('projects.noData')}</h2>
    <p>{$t('projects.noDataHint')}</p>
  </div>
{:else}
  <div class="ranking">
    {#each data.projects as proj, i}
      <div class="row" style="animation-delay: {i * 35}ms">
        <span class="rank mono">#{i + 1}</span>
        <span class="name mono">{proj.name}</span>
        <div class="bar-container">
          <div class="bar" style="width: {proj.percentage}%"></div>
        </div>
        <span class="tokens mono">{formatTokens(proj.tokens)}</span>
        <span class="cost mono accent">{formatCost(proj.cost)}</span>
        <span class="pct mono">{proj.percentage.toFixed(1)}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .ranking {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 10rem 1fr 5.5rem 4.5rem 3.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    transition: border-color 0.15s, background 0.15s;
    animation: fadeUp 0.3s ease both;
  }
  .row:hover {
    border-color: var(--border-medium);
    background: var(--bg-raised);
  }
  .rank {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-container {
    height: 6px;
    background: var(--bg-raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.6s ease;
    box-shadow: 0 0 6px var(--accent-dim);
  }
  .tokens {
    text-align: right;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .cost {
    text-align: right;
    font-size: 0.8rem;
  }
  .pct {
    text-align: right;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
