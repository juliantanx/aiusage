<script>
  import { dateRange, selectedDevice, selectedTool, setTool } from '../stores.js'
  import { fetchTools } from '../api.js'
  import { t } from '../i18n.js'

  let tools = []
  let loading = true

  async function loadTools() {
    loading = true
    try {
      const params = { ...$dateRange, device: $selectedDevice }
      const data = await fetchTools(params)
      tools = data.tools || []
    } catch {
      tools = []
    } finally {
      loading = false
    }
  }

  // Load on mount and reload when date range or device changes
  $: $dateRange, $selectedDevice, loadTools()

  // Clear selection if the selected tool no longer has data
  $: if (!loading && $selectedTool && !tools.some(t => t.tool === $selectedTool)) {
    setTool('')
  }

  function toggle(tool) {
    setTool($selectedTool === tool ? '' : tool)
  }
</script>

{#if !loading && tools.length > 0}
  <div class="tool-toggles">
    {#each tools as t}
      <button
        class="tool-btn"
        class:active={$selectedTool === t.tool}
        on:click={() => toggle(t.tool)}
        title="{t.tool} ({t.sessionCount})"
      >
        {t.tool}
        <span class="tool-count">{t.sessionCount}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .tool-toggles {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
    height: 32px;
    white-space: nowrap;
  }
  .tool-btn:hover {
    color: var(--text);
    background: var(--hover);
  }
  .tool-btn.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: var(--accent);
    font-weight: 600;
  }
  .tool-count {
    font-size: 0.6875rem;
    font-weight: 550;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .tool-btn.active .tool-count {
    color: var(--accent);
    opacity: 0.7;
  }
</style>
