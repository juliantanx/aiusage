<script>
  import { dateRange, selectedDevice, selectedTool, formatTokens, formatCost, formatDate } from '$lib/stores.js'
  import { fetchSessions } from '$lib/api.js'
  import { t } from '$lib/i18n.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'
  import DeviceSelector from '$lib/components/DeviceSelector.svelte'
  import ToolSelector from '$lib/components/ToolSelector.svelte'

  let data = null
  let error = null
  let loading = true
  let page = 1
  const pageSize = 50

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchSessions({
        ...$dateRange,
        device: $selectedDevice,
        tool: $selectedTool || undefined,
        page,
        pageSize,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
      data = null
    } finally {
      loading = false
    }
  }

  $: $selectedTool, (page = 1)
  $: $dateRange, $selectedDevice, $selectedTool, page, loadData()

  function nextPage() {
    if (data && page * pageSize < data.total) page++
  }

  function prevPage() {
    if (page > 1) page--
  }
</script>

<svelte:head>
  <title>{$t('sessions.title')} — AIUsage</title>
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
{:else if !data?.sessions.length}
  <div class="state-msg">
    <h2>{$t('sessions.noData')}</h2>
    <p>{$t('sessions.noDataHint')}</p>
  </div>
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{$t('sessions.time')}</th>
          <th>{$t('sessions.tool')}</th>
          <th>{$t('sessions.model')}</th>
          <th>{$t('sessions.input')}</th>
          <th>{$t('sessions.output')}</th>
          <th>{$t('sessions.cost')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.sessions as session}
          <tr>
            <td class="mono">{formatDate(session.ts)}</td>
            <td>{session.tool}</td>
            <td class="mono model">{session.model}</td>
            <td class="mono green">{formatTokens(session.inputTokens)}</td>
            <td class="mono blue">{formatTokens(session.outputTokens)}</td>
            <td class="mono accent">{formatCost(session.cost)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pagination">
    <button on:click={prevPage} disabled={page <= 1}>← {$t('common.previous')}</button>
    <span class="page-info mono">{$t('common.page')} {page} {$t('common.of')} {Math.ceil(data.total / pageSize)}</span>
    <button on:click={nextPage} disabled={page * pageSize >= data.total}>{$t('common.next')} →</button>
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
  select {
    padding: 0.4rem 0.65rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.8rem;
    background: var(--bg-raised);
    color: var(--text-secondary);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .model {
    font-size: 0.8rem;
    color: var(--text-primary);
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .pagination button {
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .pagination button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .pagination button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .page-info {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
