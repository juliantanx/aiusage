<script lang="ts">
  import { onMount } from 'svelte'
  import { dateRange, formatTokens, formatCost, formatDate } from '$lib/stores.js'
  import { fetchSessions, type SessionData } from '$lib/api.js'
  import DateRangeSelector from '$lib/components/DateRangeSelector.svelte'

  let data: SessionData | null = null
  let error: string | null = null
  let loading = true
  let selectedTool = ''
  let page = 1
  const pageSize = 50

  async function loadData() {
    loading = true
    error = null
    try {
      data = await fetchSessions({
        ...$dateRange,
        tool: selectedTool || undefined,
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

  onMount(loadData)
  $: $dateRange, selectedTool, page, loadData()

  function handleToolChange(e: Event) {
    selectedTool = (e.target as HTMLSelectElement).value
    page = 1
  }

  function nextPage() {
    if (data && page * pageSize < data.total) page++
  }

  function prevPage() {
    if (page > 1) page--
  }
</script>

<svelte:head>
  <title>Sessions - aiusage</title>
</svelte:head>

<DateRangeSelector />

<div class="filters">
  <label>
    AI Assistant:
    <select on:change={handleToolChange}>
      <option value="">All</option>
      <option value="claude-code">Claude Code</option>
      <option value="codex">Codex</option>
      <option value="openclaw">OpenClaw</option>
    </select>
  </label>
</div>

{#if loading}
  <div class="loading">Loading...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if !data?.sessions.length}
  <div class="empty">
    <h2>No sessions</h2>
    <p>No sessions recorded for this period.</p>
  </div>
{:else}
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Tool</th>
        <th>Model</th>
        <th>Input</th>
        <th>Output</th>
        <th>Cost</th>
      </tr>
    </thead>
    <tbody>
      {#each data.sessions as session}
        <tr>
          <td>{formatDate(session.ts)}</td>
          <td>{session.tool}</td>
          <td class="model">{session.model}</td>
          <td>{formatTokens(session.inputTokens)}</td>
          <td>{formatTokens(session.outputTokens)}</td>
          <td>{formatCost(session.cost)}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="pagination">
    <button on:click={prevPage} disabled={page <= 1}>Previous</button>
    <span>Page {page} of {Math.ceil(data.total / pageSize)}</span>
    <button on:click={nextPage} disabled={page * pageSize >= data.total}>Next</button>
  </div>
{/if}

<style>
  .loading, .error, .empty {
    text-align: center;
    padding: 3rem;
    color: #666;
  }
  .error { color: #dc3545; }
  .filters {
    margin-bottom: 1rem;
  }
  label {
    font-size: 0.875rem;
  }
  select {
    padding: 0.35rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-left: 0.25rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }
  th {
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #666;
  }
  .model {
    font-family: monospace;
    font-size: 0.875rem;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
    font-size: 0.875rem;
  }
  button {
    padding: 0.4rem 0.8rem;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
