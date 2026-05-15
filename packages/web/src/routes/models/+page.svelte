<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens, formatNumber } from '$lib/stores.js'
  import { fetchModels } from '$lib/api.js'
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
      data = await fetchModels({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
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
  <title>{$t('models.title')} — AIUsage</title>
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
{:else if !data?.models.length}
  <div class="state-msg">
    <h2>{$t('models.noData')}</h2>
    <p>{$t('models.noDataHint')}</p>
  </div>
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{$t('models.model')}</th>
          <th>{$t('models.provider')}</th>
          <th>{$t('models.calls')}</th>
          <th>{$t('models.tokens')}</th>
          <th>{$t('models.share')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.models as model, i}
          <tr style="animation-delay: {i * 40}ms" class="animate-row">
            <td class="mono model-name">{model.model}</td>
            <td style="color: var(--text-muted)">{model.provider}</td>
            <td class="mono">{formatNumber(model.callCount)}</td>
            <td class="mono">{formatTokens(model.totalTokens)}</td>
            <td>
              <div class="bar-cell">
                <div class="bar-track">
                  <div class="bar-fill" style="width: {model.percentage}%"></div>
                </div>
                <span class="mono pct">{model.percentage.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
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
  .model-name {
    font-weight: 600;
    color: var(--text-primary);
  }
  .bar-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar-track {
    flex: 1;
    height: 6px;
    background: var(--bg-raised);
    border-radius: 3px;
    overflow: hidden;
    max-width: 120px;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.6s ease;
    box-shadow: 0 0 6px var(--accent-dim);
  }
  .pct {
    font-size: 0.75rem;
    color: var(--text-muted);
    min-width: 3rem;
    text-align: right;
  }

  .animate-row {
    animation: fadeUp 0.3s ease both;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
