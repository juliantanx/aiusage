<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens, formatNumber, formatCost } from '$lib/stores.js'
  import { fetchModels } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let chartMode = 'tokens'

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

  $: sortedModels = [...(data?.models || [])].sort((a, b) => {
    if (chartMode === 'cost') return b.totalCost - a.totalCost
    return b.totalTokens - a.totalTokens
  })

  $: maxMetricValue = sortedModels.length
    ? Math.max(...sortedModels.map(model => chartMode === 'cost' ? model.totalCost : model.totalTokens))
    : 0

  function getChartValue(model) {
    return chartMode === 'cost' ? model.totalCost : model.totalTokens
  }

  function getChartWidth(model) {
    const value = getChartValue(model)
    return maxMetricValue > 0 ? (value / maxMetricValue) * 100 : 0
  }

  function formatChartValue(model) {
    return chartMode === 'cost' ? formatCost(model.totalCost) : formatTokens(model.totalTokens)
  }

  function formatPercentage(value) {
    return `${Number(value || 0).toFixed(1)}%`
  }

  function getStackedSegments(model) {
    const max = maxMetricValue || 1
    return [
      { cls: 'seg-input',    w: (model.inputTokens || 0) / max * 100 },
      { cls: 'seg-output',   w: (model.outputTokens || 0) / max * 100 },
      { cls: 'seg-cr',       w: (model.cacheReadTokens || 0) / max * 100 },
      { cls: 'seg-cw',       w: (model.cacheWriteTokens || 0) / max * 100 },
      { cls: 'seg-thinking', w: (model.thinkingTokens || 0) / max * 100 },
    ]
  }

</script>

<svelte:head>
  <title>{$t('models.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('models.title')}</h1>
  <p>{$t('models.desc')}</p>
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
{:else if !data?.models.length}
  <div class="state-msg">
    <h2>{$t('models.noData')}</h2>
    <p>{$t('models.noDataHint')}</p>
  </div>
{:else}
  <div class="card">
    <div class="chart-header">
      <div class="section-title">{$t('models.chartTitle')}</div>
      <div class="mode-toggle" role="group" aria-label={$t('models.chartTitle')}>
        <button
          class="mode-btn"
          class:active={chartMode === 'tokens'}
          aria-pressed={chartMode === 'tokens'}
          on:click={() => chartMode = 'tokens'}
        >{$t('models.modeTokens')}</button>
        <button
          class="mode-btn"
          class:active={chartMode === 'cost'}
          aria-pressed={chartMode === 'cost'}
          on:click={() => chartMode = 'cost'}
        >{$t('models.modeCost')}</button>
      </div>
    </div>

    {#if chartMode === 'tokens'}
      <div class="comp-legend">
        <span class="leg leg-i">{$t('models.input')}</span>
        <span class="leg leg-o">{$t('models.output')}</span>
        <span class="leg leg-cr">{$t('models.cacheRead')}</span>
        <span class="leg leg-cw">{$t('models.cacheWrite')}</span>
        <span class="leg leg-thinking">{$t('models.thinking')}</span>
      </div>
    {/if}

    <div class="model-list">
      {#each sortedModels as model, i (model.model)}
        <div class="model-row animate-row" style="animation-delay: {i * 30}ms">
          <div class="model-meta">
            <span class="mono model-name">{model.model}</span>
            <span class="model-provider">{model.provider}</span>
          </div>

          <div class="bar-area">
            <div class="bar-track">
              {#if chartMode === 'tokens'}
                {#each getStackedSegments(model) as seg}
                  <div class="stack-seg {seg.cls}" style="width: {seg.w}%"></div>
                {/each}
              {:else}
                <div class="ranking-bar-fill" style="width: {getChartWidth(model)}%"></div>
              {/if}
            </div>
            <span class="mono bar-value">{formatChartValue(model)}</span>
            {#if chartMode === 'tokens'}
              <div class="token-breakdown">
                <span class="mono leg-i">{formatTokens(model.inputTokens)}</span>
                <span class="mono leg-o">{formatTokens(model.outputTokens)}</span>
                {#if model.cacheReadTokens}
                  <span class="mono leg-cr">{formatTokens(model.cacheReadTokens)}</span>
                {/if}
                {#if model.cacheWriteTokens}
                  <span class="mono leg-cw">{formatTokens(model.cacheWriteTokens)}</span>
                {/if}
                {#if model.thinkingTokens}
                  <span class="mono leg-thinking">{formatTokens(model.thinkingTokens)}</span>
                {/if}
              </div>
            {/if}
          </div>

          <div class="model-stats">
            <span class="stat-item">
              <span class="stat-label">{$t('models.cost')}</span>
              <span class="mono stat-value">{formatCost(model.totalCost)}</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">{$t('models.calls')}</span>
              <span class="mono stat-value">{formatNumber(model.callCount)}</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">{$t('models.share')}</span>
              <span class="mono stat-value">{formatPercentage(model.percentage)}</span>
            </span>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* ── Header ── */
  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .chart-header .section-title { margin-bottom: 0; }
  .mode-toggle {
    display: flex;
    gap: 2px;
    background: var(--raised);
    border-radius: 6px;
    padding: 2px;
  }
  .mode-btn {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 0.22rem 0.65rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.14s, color 0.14s;
  }
  .mode-btn:hover { color: var(--text-secondary); }
  .mode-btn.active { background: var(--surface); color: var(--text); }

  /* ── Legend ── */
  .comp-legend {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .leg {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .leg::before { content: '■'; margin-right: 0.25rem; font-size: 0.5rem; }
  .leg-i        { color: var(--chart-input); }
  .leg-o        { color: var(--chart-output); }
  .leg-cr       { color: var(--chart-cache-read); }
  .leg-cw       { color: var(--chart-cache-write); }
  .leg-thinking { color: var(--chart-thinking, #dc2626); }

  /* ── Model rows ── */
  .model-list {
    display: flex;
    flex-direction: column;
  }
  .model-row {
    display: grid;
    grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto;
    gap: 1rem 1.5rem;
    align-items: center;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  }
  .model-row:last-child { border-bottom: none; }

  .model-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .model-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-provider {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  /* ── Bar area ── */
  .bar-area {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 0.2rem 0.75rem;
    align-items: center;
    min-width: 0;
  }
  .bar-track {
    display: flex;
    height: 8px;
    background: var(--raised);
    border-radius: 999px;
    overflow: hidden;
    min-width: 0;
  }
  .bar-value {
    font-size: 0.8125rem;
    color: var(--text);
    white-space: nowrap;
    text-align: right;
  }
  .token-breakdown {
    grid-column: 1 / -1;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .token-breakdown span { font-size: 0.7rem; }

  .ranking-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.4s ease;
  }
  .stack-seg {
    height: 100%;
    flex-shrink: 0;
    transition: width 0.4s ease;
  }
  .seg-input    { background: var(--chart-input); }
  .seg-output   { background: var(--chart-output); }
  .seg-cr       { background: var(--chart-cache-read); }
  .seg-cw       { background: var(--chart-cache-write); }
  .seg-thinking { background: var(--chart-thinking, #dc2626); }

  /* ── Stats ── */
  .model-stats {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-end;
  }
  .stat-item {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .stat-label {
    font-size: 0.6875rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-value {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .animate-row {
    animation: fadeIn 0.2s ease both;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (max-width: 800px) {
    .chart-header { flex-direction: column; align-items: stretch; }
    .mode-toggle { width: fit-content; }
    .model-row {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
    }
    .bar-area { grid-column: 1 / -1; }
    .model-stats { flex-direction: row; gap: 0.75rem; align-items: center; }
  }
</style>
