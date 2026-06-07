<script lang="ts">
  export let input: number = 0
  export let output: number = 0
  export let cacheRead: number = 0
  export let cacheWrite: number = 0
  export let thinking: number = 0

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  $: total = input + output + cacheRead + cacheWrite + thinking
  $: segments = [
    { label: 'Input', value: input, color: 'var(--chart-input)' },
    { label: 'Output', value: output, color: 'var(--chart-output)' },
    { label: 'Cache R', value: cacheRead, color: 'var(--chart-cache-read)' },
    { label: 'Cache W', value: cacheWrite, color: 'var(--chart-cache-write)' },
    { label: 'Think', value: thinking, color: 'var(--chart-thinking)' },
  ].filter(s => s.value > 0)
</script>

<div class="breakdown">
  {#if total > 0}
    <div class="bar">
      {#each segments as seg}
        <div
          class="segment"
          style="width: {(seg.value / total) * 100}%; background: {seg.color}"
          title="{seg.label}: {fmt(seg.value)}"
        ></div>
      {/each}
    </div>
    <div class="legend">
      {#each segments as seg}
        <div class="legend-item">
          <span class="dot" style="background: {seg.color}"></span>
          <span class="legend-label">{seg.label}</span>
          <span class="legend-value">{fmt(seg.value)}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">No token data</div>
  {/if}
</div>

<style>
  .breakdown {
    padding: 0;
  }
  .bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    gap: 1px;
    margin-bottom: 8px;
  }
  .segment {
    min-width: 3px;
    border-radius: 1px;
  }
  .legend {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 12px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-label {
    font-size: 10px;
    color: var(--text-muted);
    flex: 1;
  }
  .legend-value {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 10px;
    font-weight: 550;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
    padding: 8px 0;
  }
</style>
