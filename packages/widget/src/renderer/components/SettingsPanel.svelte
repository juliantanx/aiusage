<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { t } from '../i18n'
  import type { Locale } from '../i18n'
  import { currencies } from '../../currency'
  import type { CurrencyCode, ExchangeRateState } from '../../currency'

  interface WidgetSettings {
    theme: 'system' | 'light' | 'dark'
    refreshIntervalSec: number
    rangeDays: number
    showCost: boolean
    showHeatmap: boolean
    showTokenBreakdown: boolean
    locale: Locale
    currency: CurrencyCode
  }

  export let settings: WidgetSettings
  export let exchangeRate: ExchangeRateState | null = null

  const dispatch = createEventDispatcher<{ save: WidgetSettings; close: void }>()

  let local = { ...settings }

  $: i18n = t(local.locale ?? 'en')

  function save() {
    dispatch('save', local)
  }

  function formatRate(): string {
    if (!exchangeRate?.rate) return i18n.exchangeRateUnavailable
    return `1 USD = ${exchangeRate.rate.toFixed(4)} CNY`
  }

  function formatRateUpdated(): string {
    if (!exchangeRate?.fetchedAt) return ''
    const d = new Date(exchangeRate.fetchedAt)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return i18n.exchangeRateUpdated(`${hh}:${mm}`)
  }

  function toggle(key: keyof WidgetSettings) {
    if (typeof local[key] === 'boolean') {
      local = { ...local, [key]: !local[key] }
      save()
    }
  }

  const intervals = [
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '5m', value: 300 },
    { label: '10m', value: 600 },
  ]

  const ranges = [
    { label: '7d', value: 7 },
    { label: '14d', value: 14 },
    { label: '30d', value: 30 },
    { label: '60d', value: 60 },
    { label: '90d', value: 90 },
  ]

  $: themes = [
    { label: i18n.themeSystem, value: 'system' as const },
    { label: i18n.themeLight, value: 'light' as const },
    { label: i18n.themeDark, value: 'dark' as const },
  ]

  const locales: Array<{ label: string; value: Locale }> = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
  ]
</script>

<div class="settings">
  <div class="settings-header">
    <span class="settings-title">{i18n.settings}</span>
    <button class="back-btn" on:click={() => dispatch('close')}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M2 2l8 8M10 2l-8 8"/>
      </svg>
    </button>
  </div>

  <div class="section">
    <div class="section-label">{i18n.language}</div>
    <div class="button-group">
      {#each locales as l}
        <button
          class="option-btn"
          class:active={local.locale === l.value}
          on:click={() => { local = { ...local, locale: l.value }; save() }}
        >
          {l.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-label">{i18n.currency}</div>
    <div class="button-group">
      {#each currencies as c}
        <button
          class="option-btn"
          class:active={local.currency === c.code}
          on:click={() => { local = { ...local, currency: c.code }; save() }}
        >
          {c.label}
        </button>
      {/each}
    </div>
    {#if local.currency === 'CNY'}
      <div class="rate-info" class:error={!exchangeRate?.rate}>
        <span>{i18n.exchangeRate}</span>
        <strong>{formatRate()}</strong>
        {#if formatRateUpdated()}
          <small>{formatRateUpdated()}</small>
        {/if}
        {#if exchangeRate?.error}
          <small>{exchangeRate.error}</small>
        {/if}
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="section-label">{i18n.theme}</div>
    <div class="button-group">
      {#each themes as th}
        <button
          class="option-btn"
          class:active={local.theme === th.value}
          on:click={() => { local = { ...local, theme: th.value }; save() }}
        >
          {th.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-label">{i18n.timeRange}</div>
    <div class="button-group">
      {#each ranges as r}
        <button
          class="option-btn"
          class:active={local.rangeDays === r.value}
          on:click={() => { local = { ...local, rangeDays: r.value }; save() }}
        >
          {r.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-label">{i18n.refreshInterval}</div>
    <div class="button-group">
      {#each intervals as int}
        <button
          class="option-btn"
          class:active={local.refreshIntervalSec === int.value}
          on:click={() => { local = { ...local, refreshIntervalSec: int.value }; save() }}
        >
          {int.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-label">{i18n.display}</div>
    <div class="toggles">
      <label class="toggle-row">
        <span>{i18n.showCost}</span>
        <button class="toggle" class:on={local.showCost} on:click={() => toggle('showCost')}>
          <span class="toggle-thumb"></span>
        </button>
      </label>
      <label class="toggle-row">
        <span>{i18n.tokenBreakdownToggle}</span>
        <button class="toggle" class:on={local.showTokenBreakdown} on:click={() => toggle('showTokenBreakdown')}>
          <span class="toggle-thumb"></span>
        </button>
      </label>
      <label class="toggle-row">
        <span>{i18n.activityChart}</span>
        <button class="toggle" class:on={local.showHeatmap} on:click={() => toggle('showHeatmap')}>
          <span class="toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>
</div>

<style>
  .settings {
    padding: 0 14px 14px;
  }
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0 10px;
  }
  .settings-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .back-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .back-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .section {
    margin-bottom: 14px;
  }
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .button-group {
    display: flex;
    gap: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .rate-info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    align-items: baseline;
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 10px;
  }
  .rate-info strong {
    justify-self: end;
    color: var(--text-secondary);
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rate-info small {
    grid-column: 1 / -1;
    justify-self: end;
    font-size: 9px;
    color: var(--text-muted);
  }
  .rate-info.error strong {
    color: var(--text-muted);
  }
  .option-btn {
    flex: 1;
    padding: 6px 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .option-btn:not(:last-child) {
    border-right: 1px solid var(--border);
  }
  .option-btn.active {
    background: var(--accent);
    color: white;
  }
  .option-btn:hover:not(.active) {
    background: var(--bg-hover);
  }
  .toggles {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .toggle {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    border: none;
    background: var(--border);
    cursor: pointer;
    transition: background 0.15s;
    padding: 0;
  }
  .toggle.on {
    background: var(--accent);
  }
  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    transition: transform 0.15s;
    display: block;
  }
  .toggle.on .toggle-thumb {
    transform: translateX(14px);
  }
</style>
