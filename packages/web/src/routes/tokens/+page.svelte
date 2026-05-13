<script>
  import { dateRange, formatTokens } from '$lib/stores.js'
  import { fetchTokens } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data = null
  let error = null
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

  $: $dateRange, loadData()

  function getMaxTokens() {
    if (!data?.data.length) return 0
    return Math.max(...data.data.map(d => d.inputTokens + d.outputTokens + (d.cacheReadTokens || 0) + (d.cacheWriteTokens || 0) + d.thinkingTokens))
  }

  function getBarHeight(tokens, max) {
    return max > 0 ? (tokens / max) * 200 : 0
  }
</script>

<svelte:head>
  <title>{$t('tokens.title')} — AIUsage</title>
</svelte:head>

<DateRangeSelector />

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
    <div class="section-title">{$t('tokens.chartTitle')}</div>
    <div class="chart">
      {#each data.data as day, i}
        {@const max = getMaxTokens()}
        <div class="bar-group" style="animation-delay: {i * 30}ms">
          <div class="bars">
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
          </div>
          <div class="label">{day.date.slice(5)}</div>
        </div>
      {/each}
    </div>
    <div class="legend">
      <span class="legend-item"><span class="dot input"></span> {$t('tokens.input')}</span>
      <span class="legend-item"><span class="dot output"></span> {$t('tokens.output')}</span>
      <span class="legend-item"><span class="dot cache-read"></span> {$t('tokens.cacheRead')}</span>
      <span class="legend-item"><span class="dot cache-write"></span> {$t('tokens.cacheWrite')}</span>
      <span class="legend-item"><span class="dot thinking"></span> {$t('tokens.thinking')}</span>
    </div>
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
          <th>{$t('tokens.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.data as day}
          <tr>
            <td class="mono">{day.date}</td>
            <td class="mono green">{formatTokens(day.inputTokens)}</td>
            <td class="mono blue">{formatTokens(day.outputTokens)}</td>
            <td class="mono cache-color">{formatTokens(day.cacheReadTokens || 0)}</td>
            <td class="mono cache-color">{formatTokens(day.cacheWriteTokens || 0)}</td>
            <td class="mono" style="color:var(--text-primary); font-weight:600">
              {formatTokens(day.inputTokens + day.outputTokens + (day.cacheReadTokens || 0) + (day.cacheWriteTokens || 0) + day.thinkingTokens)}
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
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 220px;
    padding: 0 0 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .bar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: fadeUp 0.3s ease both;
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
  .bar.input { background: var(--green); }
  .bar.output { background: var(--blue); }
  .bar.cache-read { background: #d4a574; }
  .bar.cache-write { background: #a0845e; }
  .bar.thinking { background: var(--purple); }
  .cache-color { color: #d4a574; }
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
  .dot.input { background: var(--green); }
  .dot.output { background: var(--blue); }
  .dot.cache-read { background: #d4a574; }
  .dot.cache-write { background: #a0845e; }
  .dot.thinking { background: var(--purple); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
