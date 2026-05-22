<script lang="ts">
  export let label: string
  export let primary: string
  export let secondary: string = ''
</script>

<div class="section">
  <div class="section-label">{label}</div>
  <div class="values">
    <span class="primary">{primary}</span>
    {#if secondary}
      <span class="secondary">{secondary}</span>
    {/if}
  </div>
</div>

<style>
  .section {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .values {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .primary {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .secondary {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
