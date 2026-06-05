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

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    if (m === 0) return `${s}s`
    return `${m}m ${s % 60}s`
  }

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchSessions({
        ...$dateRange,
        device: $selectedDevice,
        tool: $selectedTool,
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

  function goToDetail(session) {
    const params = new URLSearchParams()
    if ($selectedTool) params.set('tool', $selectedTool)
    if ($selectedDevice) params.set('device', $selectedDevice)
    const qs = params.toString()
    window.location.href = `/sessions/${encodeURIComponent(session.sessionId)}${qs ? `?${qs}` : ''}`
  }
</script>

<svelte:head>
  <title>{$t('sessions.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('sessions.title')}</h1>
  <p>{$t('sessions.desc')}</p>
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
          <th>{$t('sessions.duration')}</th>
          <th>{$t('sessions.toolCalls')}</th>
          <th>{$t('sessions.input')}</th>
          <th>{$t('sessions.output')}</th>
          <th>{$t('sessions.cost')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.sessions as session}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-interactive-element-to-noninteractive-role -->
          <tr class="clickable" on:click={() => goToDetail(session)}>
            <td class="mono">{formatDate(session.ts)}</td>
            <td>{session.tool}</td>
            <td class="mono model">{session.model}</td>
            <td class="mono muted">{formatDuration(session.duration)}</td>
            <td class="mono">{session.toolCallCount ?? 0}</td>
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
  .clickable {
    cursor: pointer;
  }
  .model {
    font-size: 0.8rem;
    color: var(--text);
  }
  .muted {
    color: var(--text-muted);
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
    background: var(--raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: color 0.2s;
  }
  .pagination button:hover:not(:disabled) {
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
