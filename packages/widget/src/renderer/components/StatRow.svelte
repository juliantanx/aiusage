<script lang="ts">
  export let label: string
  export let value: string
  export let sub: string = ''
  export let accent: boolean = false
</script>

<div class="row">
  <span class="label">{label}</span>
  <div class="right">
    <span class="value" class:accent>{value}</span>
    {#if sub}
      <span class="sub">{sub}</span>
    {/if}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 6px 0;
  }
  .label {
    font-size: 11px;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .right {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .value {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .value.accent {
    color: var(--accent);
  }
  .sub {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
