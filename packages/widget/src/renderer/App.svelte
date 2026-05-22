<script lang="ts">
  import { onMount } from 'svelte'
  import Header from './components/Header.svelte'
  import StatSection from './components/StatSection.svelte'

  interface WidgetData {
    todayTokens: { total: number; input: number; output: number }
    monthTokens: { total: number }
    topModel: { name: string; share: number } | null
    lastUpdated: number
  }

  let data: WidgetData | null = null
  let loading = true

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  async function refresh() {
    loading = true
    data = await (window as any).widget.getData()
    loading = false
  }

  function close() {
    ;(window as any).widget.hideWindow()
  }

  async function openDashboard() {
    await (window as any).widget.openDashboard()
  }

  onMount(() => {
    refresh()
    ;(window as any).widget.onDataUpdate((d: WidgetData) => {
      data = d
      loading = false
    })
  })

  $: todayStr = data ? formatTokens(data.todayTokens.total) : '—'
  $: todaySubStr = data
    ? `↑${formatTokens(data.todayTokens.input)}  ↓${formatTokens(data.todayTokens.output)}`
    : ''
  $: monthStr = data ? formatTokens(data.monthTokens.total) : '—'
  $: modelStr = data?.topModel?.name ?? '—'
  $: modelSubStr = data?.topModel ? `${data.topModel.share}%` : ''
</script>

<div class="panel" class:loading>
  <Header onRefresh={refresh} onClose={close} />

  <StatSection
    label="TODAY"
    primary={todayStr}
    secondary={todaySubStr}
  />

  <StatSection
    label="THIS MONTH"
    primary={monthStr}
  />

  <StatSection
    label="TOP MODEL"
    primary={modelStr}
    secondary={modelSubStr}
  />

  <div class="footer">
    <button class="open-btn" on:click={openDashboard}>
      Open Full Dashboard →
    </button>
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  :global(:root) {
    --bg: #1a1a1f;
    --bg-hover: rgba(255, 255, 255, 0.06);
    --border: rgba(255, 255, 255, 0.08);
    --text-primary: #f0f0f2;
    --text-muted: rgba(240, 240, 242, 0.45);
    --accent: #6c8eff;
  }
  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #ffffff;
      --bg-hover: rgba(0, 0, 0, 0.05);
      --border: rgba(0, 0, 0, 0.08);
      --text-primary: #0f0f12;
      --text-muted: rgba(15, 15, 18, 0.45);
      --accent: #3b5bdb;
    }
  }
  .panel {
    background: var(--bg);
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: opacity 0.15s;
  }
  .panel.loading {
    opacity: 0.7;
  }
  .footer {
    padding: 10px 14px 14px;
  }
  .open-btn {
    width: 100%;
    padding: 9px 14px;
    border: 1px solid var(--accent);
    border-radius: 7px;
    background: transparent;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    letter-spacing: 0.01em;
  }
  .open-btn:hover {
    background: rgba(108, 142, 255, 0.1);
  }
</style>
