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
</script>

<div class="device-selector">
  <select
    value={$selectedDevice}
    on:change={handleChange}
    disabled={loading}
  >
    <option value="">{$t('device.allDevices')}</option>
    {#each devices as d}
      <option value={d.deviceInstanceId}>{d.device} ({d.recordCount})</option>
    {/each}
  </select>
</div>

<style>
  .device-selector {
    display: inline-flex;
    align-items: center;
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
