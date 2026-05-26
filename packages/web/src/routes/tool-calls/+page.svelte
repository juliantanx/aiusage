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
  let selectedType = null // null = all

  const TYPES = [
    { key: null,       label: () => $t('toolCalls.typeAll') },
    { key: 'builtin',  label: () => $t('toolCalls.typeBuiltin') },
    { key: 'mcp',      label: () => $t('toolCalls.typeMcp') },
    { key: 'skill',    label: () => $t('toolCalls.typeSkill') },
  ]

  const NO_TOOL_CALL_TOOLS = new Set(['qoder', 'cursor'])
  $: showNoToolCallNotice = NO_TOOL_CALL_TOOLS.has($selectedTool)

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchToolCalls({
        ...$dateRange,
        device: $selectedDevice,
        tool: $selectedTool,
        toolType: selectedType,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $dateRange, $selectedDevice, $selectedTool, selectedType, loadData()
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

{#if showNoToolCallNotice}
  <div class="info-notice">
    {$t('toolCalls.noToolCallData')}
  </div>
{/if}

<div class="type-tabs">
  {#each TYPES as type}
    <button
      class="tab"
      class:active={selectedType === type.key}
      on:click={() => { selectedType = type.key }}
    >
      {type.label()}
    </button>
  {/each}
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
        <span class="name mono">
          {tc.displayName}
          {#if tc.type === 'mcp'}
            <span class="badge badge-mcp">{$t('toolCalls.badgeMcp')}</span>
          {:else if tc.type === 'skill'}
            <span class="badge badge-skill">{$t('toolCalls.badgeSkill')}</span>
          {/if}
        </span>
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
  .type-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .tab {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    font-family: var(--mono);
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .tab:hover {
    color: var(--text);
    background: var(--hover);
  }
  .tab.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: var(--accent);
    font-weight: 600;
  }

  .info-notice {
    padding: 0.6rem 0.9rem;
    margin-bottom: 1rem;
    background: var(--blue-dim);
    color: var(--blue);
    border: 1px solid var(--blue-dim);
    border-radius: 8px;
    font-size: 0.8rem;
  }

  .ranking {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 1fr 1fr 4.5rem 3.5rem;
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
    display: flex;
    align-items: center;
    gap: 0.4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .badge-mcp {
    background: var(--blue-dim);
    color: var(--blue);
  }
  .badge-skill {
    background: var(--purple-dim);
    color: var(--purple);
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
