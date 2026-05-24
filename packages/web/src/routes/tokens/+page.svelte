<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens } from '$lib/stores.js'
  import { fetchTokens } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let chartMode = 'breakdown' // 'breakdown' | 'total'

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchTokens({ ...$dateRange, device: $selectedDevice, tool: $selectedTool })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, $selectedTool, loadData()

  function getTotal(d) {
    return d.inputTokens + d.outputTokens + (d.cacheReadTokens || 0) + (d.cacheWriteTokens || 0) + (d.thinkingTokens || 0)
  }

  function getMaxTokens() {
    if (!data?.data.length) return 0
    return Math.max(...data.data.map(d => getTotal(d)))
  }

  function getBarHeight(tokens, max) {
    return max > 0 ? (tokens / max) * 200 : 0
  }
</script>

<svelte:head>
  <title>{$t('tokens.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('tokens.title')}</h1>
  <p>{$t('tokens.desc')}</p>
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
    <h2>{$t('tokens.noData')}</h2>
    <p>{$t('tokens.noDataHint')}</p>
  </div>
{:else}
  <div class="card chart-section">
    <div class="chart-header">
      <div class="section-title">{$t('tokens.chartTitle')}</div>
      <div class="mode-toggle">
        <button
          class="mode-btn"
          class:active={chartMode === 'breakdown'}
          on:click={() => chartMode = 'breakdown'}
        >{$t('tokens.modeBreakdown')}</button>
        <button
          class="mode-btn"
          class:active={chartMode === 'total'}
          on:click={() => chartMode = 'total'}
        >{$t('tokens.modeTotal')}</button>
      </div>
    </div>
    <div class="chart">
      {#each data.data as day, i}
        {@const max = getMaxTokens()}
        <div class="bar-group" style="animation-delay: {i * 30}ms">
          <div class="bars">
            {#if chartMode === 'total'}
              <div
                class="bar total-bar"
                style="height: {getBarHeight(getTotal(day), max)}px"
                title="{$t('tokens.total')}: {formatTokens(getTotal(day))}"
              ></div>
            {:else}
              <div
                class="bar input"
                style="height: {getBarHeight(day.inputTokens, max)}px"
                title="{$t('tokens.input')}: {formatTokens(day.inputTokens)}"
              ></div>
              <div
                class="bar output"
                style="height: {getBarHeight(day.outputTokens, max)}px"
                title="{$t('tokens.output')}: {formatTokens(day.outputTokens)}"
              ></div>
              {#if (day.cacheReadTokens || 0) > 0}
                <div
                  class="bar cache-read"
                  style="height: {getBarHeight(day.cacheReadTokens, max)}px"
                  title="{$t('tokens.cacheRead')}: {formatTokens(day.cacheReadTokens)}"
                ></div>
              {/if}
              {#if (day.cacheWriteTokens || 0) > 0}
                <div
                  class="bar cache-write"
                  style="height: {getBarHeight(day.cacheWriteTokens, max)}px"
                  title="{$t('tokens.cacheWrite')}: {formatTokens(day.cacheWriteTokens)}"
                ></div>
              {/if}
              {#if day.thinkingTokens > 0}
                <div
                  class="bar thinking"
                  style="height: {getBarHeight(day.thinkingTokens, max)}px"
                  title="{$t('tokens.thinking')}: {formatTokens(day.thinkingTokens)}"
                ></div>
              {/if}
            {/if}
          </div>
          <div class="label">{day.date.slice(5)}</div>
        </div>
      {/each}
    </div>
    {#if chartMode === 'breakdown'}
      <div class="legend">
        <span class="legend-item"><span class="dot input"></span> {$t('tokens.input')}</span>
        <span class="legend-item"><span class="dot output"></span> {$t('tokens.output')}</span>
        <span class="legend-item"><span class="dot cache-read"></span> {$t('tokens.cacheRead')}</span>
        <span class="legend-item"><span class="dot cache-write"></span> {$t('tokens.cacheWrite')}</span>
        <span class="legend-item"><span class="dot thinking"></span> {$t('tokens.thinking')}</span>
      </div>
    {:else}
      <div class="legend">
        <span class="legend-item"><span class="dot total-bar"></span> {$t('tokens.total')}</span>
      </div>
    {/if}
  </div>

  <div class="card" style="margin-top: 1rem;">
    <table>
      <thead>
        <tr>
          <th>{$t('tokens.date')}</th>
          <th>{$t('tokens.input')}</th>
          <th>{$t('tokens.output')}</th>
          <th>{$t('tokens.cacheRead')}</th>
          <th>{$t('tokens.cacheWrite')}</th>
          <th>{$t('tokens.thinking')}</th>
          <th>{$t('tokens.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.data as day}
          <tr>
            <td class="mono">{day.date}</td>
            <td class="mono" style="color:var(--chart-input)">{formatTokens(day.inputTokens)}</td>
            <td class="mono" style="color:var(--chart-output)">{formatTokens(day.outputTokens)}</td>
            <td class="mono" style="color:var(--chart-cache-read)">{formatTokens(day.cacheReadTokens || 0)}</td>
            <td class="mono" style="color:var(--chart-cache-write)">{formatTokens(day.cacheWriteTokens || 0)}</td>
            <td class="mono" style="color:var(--chart-thinking)">{formatTokens(day.thinkingTokens || 0)}</td>
            <td class="mono" style="color:var(--text); font-weight:600">
              {formatTokens(getTotal(day))}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .chart-section {
    padding-bottom: 1.5rem;
  }
  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .chart-header .section-title {
    margin-bottom: 0;
  }
  .mode-toggle {
    display: flex;
    gap: 2px;
    background: var(--raised);
    border-radius: 6px;
    padding: 2px;
  }
  .mode-btn {
    font-family: var(--mono);
    font-size: 0.62rem;
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
  .mode-btn:hover {
    color: var(--text-secondary);
  }
  .mode-btn.active {
    background: var(--surface);
    color: var(--text);
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
  }
  .bar-group {
    flex: 0 0 auto;
    min-width: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: fade 0.2s ease both;
  }
  .bars {
    display: flex;
    gap: 1px;
    align-items: flex-end;
  }
  .bar {
    width: 10px;
    min-height: 2px;
    border-radius: 2px 2px 0 0;
    transition: height 0.4s ease;
  }
  .bar.input { background: var(--chart-input); }
  .bar.output { background: var(--chart-output); }
  .bar.cache-read { background: var(--chart-cache-read); }
  .bar.cache-write { background: var(--chart-cache-write); }
  .bar.thinking { background: var(--chart-thinking); }
  .bar.total-bar { background: var(--chart-total); width: 14px; }
  .label {
    font-family: var(--mono);
    font-size: 0.6rem;
    color: var(--text-muted);
    margin-top: 6px;
  }
  .legend {
    display: flex;
    gap: 1.25rem;
    margin-top: 1rem;
    justify-content: center;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .dot.input { background: var(--chart-input); }
  .dot.output { background: var(--chart-output); }
  .dot.cache-read { background: var(--chart-cache-read); }
  .dot.cache-write { background: var(--chart-cache-write); }
  .dot.thinking { background: var(--chart-thinking); }
  .dot.total-bar { background: var(--chart-total); }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
