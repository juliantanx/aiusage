<script lang="ts">
  import { onMount } from 'svelte'
  import Header from './components/Header.svelte'
  import StatRow from './components/StatRow.svelte'
  import TokenBreakdown from './components/TokenBreakdown.svelte'
  import ActivityChart from './components/ActivityChart.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import { t } from './i18n'
  import type { Locale } from './i18n'

  interface TodayTokens {
    total: number; input: number; output: number
    cacheRead: number; cacheWrite: number; thinking: number
  }
  interface DailyEntry { date: string; tokens: number; cost: number }
  interface WidgetData {
    todayTokens: TodayTokens
    todayCost: number
    rangeTokens: { total: number }
    rangeCost: number
    rangeDays: number
    topModel: { name: string; share: number } | null
    topTool: { name: string; share: number } | null
    dailyHistory: DailyEntry[]
    sessionCountToday: number
    lastUpdated: number
  }
  interface WidgetSettings {
    theme: 'system' | 'light' | 'dark'
    refreshIntervalSec: number
    rangeDays: number
    showCost: boolean
    showHeatmap: boolean
    showTokenBreakdown: boolean
  }

  let data: WidgetData | null = null
  let settings: WidgetSettings | null = null
  let loading = true
  let showSettings = false

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  function formatCost(n: number): string {
    if (n >= 100) return `$${n.toFixed(0)}`
    if (n >= 1) return `$${n.toFixed(2)}`
    if (n > 0) return `$${n.toFixed(3)}`
    return '$0'
  }

  function formatModelName(name: string): string {
    return name
      .replace(/^(claude-|gpt-|gemini-|deepseek-|qwen-)/i, '')
      .replace(/-\d{8}$/, '')
  }

  $: locale = (settings?.locale ?? 'en') as Locale
  $: i18n = t(locale)

  function rangeLabel(days: number): string {
    return i18n.lastNDays(days)
  }

  function formatSyncTime(ts: number): string {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return i18n.syncedAt(`${hh}:${mm}`)
  }

  async function refresh() {
    loading = true
    data = await (window as any).widget.getData()
    loading = false
  }

  function close() {
    ;(window as any).widget.hideWindow()
  }

  async function doLoadSettings() {
    settings = await (window as any).widget.getSettings()
  }

  async function saveSettings(e: CustomEvent<WidgetSettings>) {
    settings = await (window as any).widget.saveSettings(e.detail)
    // Re-fetch data since rangeDays may have changed
    refresh()
  }

  onMount(() => {
    refresh()
    doLoadSettings()
    ;(window as any).widget.onDataUpdate((d: WidgetData) => {
      data = d
      loading = false
    })
  })

  $: todayStr = data ? formatTokens(data.todayTokens.total) : '--'
  $: rangeStr = data ? formatTokens(data.rangeTokens.total) : '--'
  $: todayCostStr = data ? formatCost(data.todayCost) : '--'
  $: rangeCostStr = data ? formatCost(data.rangeCost) : '--'
  $: rangeLabelStr = data ? rangeLabel(data.rangeDays) : i18n.lastNDays(30)
  $: modelStr = data?.topModel ? formatModelName(data.topModel.name) : '--'
  $: modelSubStr = data?.topModel ? `${data.topModel.share}%` : ''
  $: toolStr = data?.topTool?.name ?? '--'
  $: toolSubStr = data?.topTool ? `${data.topTool.share}%` : ''
  $: sessionStr = data ? String(data.sessionCountToday) : '--'
  $: updatedStr = data ? formatSyncTime(data.lastUpdated) : ''
</script>

<div class="panel" class:loading>
  <Header
    onRefresh={refresh}
    onClose={close}
    onToggleSettings={() => { showSettings = !showSettings }}
  />

  {#if showSettings && settings}
    <SettingsPanel
      {settings}
      on:save={saveSettings}
      on:close={() => { showSettings = false }}
    />
  {:else}
    <div class="content">
      <!-- Primary metrics -->
      <div class="section">
        <div class="metric-grid">
          <div class="metric">
            <span class="metric-label">{i18n.today}</span>
            <span class="metric-value">{todayStr}</span>
            {#if settings?.showCost}
              <span class="metric-cost">{todayCostStr}</span>
            {/if}
          </div>
          <div class="metric">
            <span class="metric-label">{rangeLabelStr}</span>
            <span class="metric-value">{rangeStr}</span>
            {#if settings?.showCost}
              <span class="metric-cost">{rangeCostStr}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Token breakdown -->
      {#if settings?.showTokenBreakdown && data}
        <div class="section">
          <div class="section-title">{i18n.tokenBreakdownToday}</div>
          <TokenBreakdown
            input={data.todayTokens.input}
            output={data.todayTokens.output}
            cacheRead={data.todayTokens.cacheRead}
            cacheWrite={data.todayTokens.cacheWrite}
            thinking={data.todayTokens.thinking}
          />
        </div>
      {/if}

      <!-- Activity chart -->
      {#if settings?.showHeatmap && data}
        <div class="section">
          <div class="section-title">{i18n.trend}</div>
          <ActivityChart data={data.dailyHistory} showCost={settings?.showCost ?? false} />
        </div>
      {/if}

      <!-- Details -->
      <div class="section details">
        <StatRow label={i18n.topModel} value={modelStr} sub={modelSubStr} />
        <StatRow label={i18n.topTool} value={toolStr} sub={toolSubStr} />
        <StatRow label={i18n.sessions} value={sessionStr} />
      </div>

      <!-- Footer with sync time -->
      <div class="footer">
        <span class="updated">{updatedStr}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    background: transparent;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  :global(:root) {
    --bg: oklch(0.985 0.004 175);
    --surface: oklch(0.995 0.003 175);
    --bg-hover: oklch(0.955 0.008 175);
    --border: oklch(0.92 0.008 175);
    --border-medium: oklch(0.87 0.01 175);
    --text-primary: oklch(0.18 0.012 175);
    --text-secondary: oklch(0.42 0.015 175);
    --text-muted: oklch(0.6 0.012 175);
    --accent: oklch(0.55 0.12 175);
    --chart-input: oklch(0.65 0.14 175);
    --chart-output: oklch(0.6 0.15 250);
    --chart-cache-read: oklch(0.7 0.1 65);
    --chart-cache-write: oklch(0.65 0.12 310);
    --chart-thinking: oklch(0.6 0.16 300);
    --shadow: 0 1px 3px oklch(0 0 0 / 0.08), 0 8px 24px oklch(0 0 0 / 0.06);
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: oklch(0.18 0.008 175);
      --surface: oklch(0.22 0.006 175);
      --bg-hover: oklch(0.26 0.01 175);
      --border: oklch(0.3 0.01 175);
      --border-medium: oklch(0.35 0.012 175);
      --text-primary: oklch(0.94 0.006 175);
      --text-secondary: oklch(0.76 0.01 175);
      --text-muted: oklch(0.58 0.008 175);
      --accent: oklch(0.65 0.12 175);
      --chart-input: oklch(0.65 0.14 175);
      --chart-output: oklch(0.6 0.15 250);
      --chart-cache-read: oklch(0.7 0.1 65);
      --chart-cache-write: oklch(0.65 0.12 310);
      --chart-thinking: oklch(0.6 0.16 300);
      --shadow: 0 1px 3px oklch(0 0 0 / 0.3), 0 8px 24px oklch(0 0 0 / 0.25);
    }
  }
  .panel {
    background: var(--bg);
    border-radius: 10px;
    border: 1px solid var(--border);
    overflow: hidden;
    width: 380px;
    box-shadow: var(--shadow);
    transition: opacity 0.15s;
  }
  .panel.loading {
    opacity: 0.7;
  }
  .content {
    padding: 0 14px 10px;
  }
  .section {
    padding: 8px 0;
  }
  .section:not(:last-child):not(.details) {
    border-bottom: 1px solid var(--border);
  }
  .section-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .metric-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .metric-value {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .metric-cost {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 11px;
    font-weight: 550;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .details {
    padding: 4px 0;
  }
  .footer {
    padding: 4px 0 2px;
    text-align: right;
  }
  .updated {
    font-size: 9px;
    color: var(--text-muted);
  }
</style>
