<script>
  import { onMount } from 'svelte'
  import { selectedDevice, setDevice } from '../stores.js'
  import { t } from '../i18n.js'

  let devices = []
  let loading = true

  onMount(async () => {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      devices = data.devices || []
    } catch {
      devices = []
    } finally {
      loading = false
    }
  })

  function handleChange(e) {
    setDevice(e.target.value)
  }

  function formatLabel(d) {
    // e.g. "Windows DESKTOP-ID9N81U (10174)" or "macOS MacBook-Pro (816)"
    const parts = []
    if (d.platform) {
      parts.push(d.platform)
    } else {
      parts.push('Unknown')
    }
    parts.push(d.displayName)
    parts.push(`(${d.recordCount})`)
    return parts.join(' ')
  }

  function getTooltip(d) {
    const lines = [`Name: ${d.displayName}`]
    if (d.platform) lines.push(`Platform: ${d.platform}`)
    lines.push(`Records: ${d.recordCount}`)
    lines.push(`ID: ${d.deviceInstanceId}`)
    return lines.join('\n')
  }

  $: selectedInfo = devices.find(d => d.deviceInstanceId === $selectedDevice)
</script>

<div class="device-selector">
  <select
    value={$selectedDevice}
    on:change={handleChange}
    disabled={loading}
    title={selectedInfo ? getTooltip(selectedInfo) : $t('device.allDevices')}
  >
    <option value="">{$t('device.allDevices')}</option>
    {#each devices as d}
      <option value={d.deviceInstanceId} title={getTooltip(d)}>{formatLabel(d)}</option>
    {/each}
  </select>
</div>

<style>
  .device-selector {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  select {
    padding: 0.38rem 0.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.78rem;
    background: var(--bg-raised);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    appearance: auto;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
  }
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
