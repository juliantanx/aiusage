<script lang="ts">
  import { onMount } from 'svelte'

  interface DailyEntry {
    date: string
    tokens: number
    cost: number
  }

  export let data: DailyEntry[] = []
  export let showCost: boolean = false

  // Chart dimensions
  const W = 352
  const H = 140
  const PAD_TOP = 36
  const PAD_BOTTOM = 20
  const PAD_LEFT = 0
  const PAD_RIGHT = 0

  let hoveredIndex: number | null = null
  let mounted = false

  onMount(() => {
    requestAnimationFrame(() => { mounted = true })
  })

  $: values = data.map(d => showCost ? d.cost : d.tokens)
  $: maxVal = Math.max(...values, 1)

  $: chartW = W - PAD_LEFT - PAD_RIGHT
  $: chartH = H - PAD_TOP - PAD_BOTTOM

  function xAt(i: number): number {
    return PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW
  }

  function yAt(val: number): number {
    return PAD_TOP + chartH - (val / maxVal) * chartH
  }

  // Monotone cubic spline (Fritsch-Carlson)
  function buildSplinePath(vals: number[]): string {
    if (vals.length < 2) return ''
    const n = vals.length
    const xs = vals.map((_, i) => xAt(i))
    const ys = vals.map(v => yAt(v))

    if (n === 2) {
      return `M${xs[0]},${ys[0]}L${xs[1]},${ys[1]}`
    }

    const deltas: number[] = []
    const m: number[] = []

    for (let i = 0; i < n - 1; i++) {
      deltas.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
    }

    m.push(deltas[0])
    for (let i = 1; i < n - 1; i++) {
      if (deltas[i - 1] * deltas[i] <= 0) {
        m.push(0)
      } else {
        m.push((deltas[i - 1] + deltas[i]) / 2)
      }
    }
    m.push(deltas[n - 2])

    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(deltas[i]) < 1e-12) {
        m[i] = 0
        m[i + 1] = 0
      } else {
        const alpha = m[i] / deltas[i]
        const beta = m[i + 1] / deltas[i]
        const s = alpha * alpha + beta * beta
        if (s > 9) {
          const tau = 3 / Math.sqrt(s)
          m[i] = tau * alpha * deltas[i]
          m[i + 1] = tau * beta * deltas[i]
        }
      }
    }

    let path = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
    for (let i = 0; i < n - 1; i++) {
      const dx = (xs[i + 1] - xs[i]) / 3
      const cp1x = xs[i] + dx
      const cp1y = ys[i] + m[i] * dx
      const cp2x = xs[i + 1] - dx
      const cp2y = ys[i + 1] - m[i + 1] * dx
      path += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)},${cp2x.toFixed(1)},${cp2y.toFixed(1)},${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`
    }
    return path
  }

  $: linePath = buildSplinePath(values)
  $: areaPath = linePath
    ? `${linePath}L${xAt(values.length - 1).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}L${xAt(0).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}Z`
    : ''

  $: gridLines = [0, maxVal / 2, maxVal]

  function formatTokens(val: number): string {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
    return String(Math.round(val))
  }

  function formatCostVal(val: number): string {
    if (val >= 100) return `$${val.toFixed(0)}`
    if (val >= 1) return `$${val.toFixed(2)}`
    if (val > 0) return `$${val.toFixed(3)}`
    return '$0'
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[d.getMonth()]} ${d.getDate()}`
  }

  function handleMouseMove(e: MouseEvent) {
    const svg = (e.currentTarget as SVGSVGElement)
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    let minDist = Infinity
    let nearest = 0
    for (let i = 0; i < data.length; i++) {
      const dist = Math.abs(xAt(i) - mouseX)
      if (dist < minDist) {
        minDist = dist
        nearest = i
      }
    }
    hoveredIndex = nearest
  }

  function handleMouseLeave() {
    hoveredIndex = null
  }

  // X-axis tick labels
  $: tickIndices = data.length <= 5
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1]

  // Tooltip positioning: rendered as SVG foreignObject so it stays inside the SVG
  function tooltipX(idx: number): number {
    const px = xAt(idx)
    // Clamp so tooltip doesn't overflow edges (tooltip is ~90px wide)
    const halfW = 56
    return Math.min(Math.max(px, halfW), W - halfW)
  }
</script>

<div class="chart-wrapper">
  <svg
    viewBox="0 0 {W} {H}"
    width="100%"
    height={H}
    class="chart-svg"
    class:mounted
    on:mousemove={handleMouseMove}
    on:mouseleave={handleMouseLeave}
    role="img"
    aria-label="Token usage trend chart"
  >
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.2" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
      </linearGradient>
      <clipPath id="chartClip">
        <rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} />
      </clipPath>
    </defs>

    <!-- Grid lines -->
    {#each gridLines as gv, gi}
      <line
        x1={PAD_LEFT}
        y1={yAt(gv)}
        x2={PAD_LEFT + chartW}
        y2={yAt(gv)}
        stroke="var(--border)"
        stroke-width="0.5"
        stroke-dasharray={gi === 0 ? 'none' : '2,2'}
      />
    {/each}

    <!-- Area fill -->
    {#if areaPath}
      <path
        d={areaPath}
        fill="url(#areaGrad)"
        clip-path="url(#chartClip)"
        class="area"
      />
    {/if}

    <!-- Line -->
    {#if linePath}
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        clip-path="url(#chartClip)"
        class="line"
      />
    {/if}

    <!-- Hover vertical line -->
    {#if hoveredIndex !== null}
      <line
        x1={xAt(hoveredIndex)}
        y1={PAD_TOP}
        x2={xAt(hoveredIndex)}
        y2={PAD_TOP + chartH}
        stroke="var(--text-muted)"
        stroke-width="0.5"
        stroke-dasharray="2,2"
      />
    {/if}

    <!-- Data point on hover -->
    {#if hoveredIndex !== null}
      <circle
        cx={xAt(hoveredIndex)}
        cy={yAt(values[hoveredIndex])}
        r="4"
        fill="var(--bg)"
        stroke="var(--accent)"
        stroke-width="2"
      />
    {/if}

    <!-- Tooltip rendered inside SVG as foreignObject -->
    {#if hoveredIndex !== null && data[hoveredIndex]}
      {@const entry = data[hoveredIndex]}
      {@const tx = tooltipX(hoveredIndex)}
      <foreignObject x={tx - 56} y="0" width="112" height={PAD_TOP} class="tooltip-fo">
        <div class="tooltip" xmlns="http://www.w3.org/1999/xhtml">
          <span class="tooltip-date">{formatDate(entry.date)}</span>
          <span class="tooltip-value">{formatTokens(entry.tokens)}</span>
          {#if showCost && entry.cost > 0}
            <span class="tooltip-cost">{formatCostVal(entry.cost)}</span>
          {/if}
        </div>
      </foreignObject>
    {/if}

    <!-- X-axis tick labels -->
    {#each tickIndices as ti}
      {#if data[ti]}
        <text
          x={xAt(ti)}
          y={H - 2}
          text-anchor="middle"
          class="tick-label"
        >
          {data[ti].date.slice(5)}
        </text>
      {/if}
    {/each}
  </svg>
</div>

<style>
  .chart-wrapper {
    position: relative;
    user-select: none;
  }
  .chart-svg {
    display: block;
    cursor: crosshair;
    overflow: visible;
  }
  .chart-svg .line {
    stroke-dasharray: 2000;
    stroke-dashoffset: 2000;
    transition: stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .chart-svg.mounted .line {
    stroke-dashoffset: 0;
  }
  .chart-svg .area {
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
  }
  .chart-svg.mounted .area {
    opacity: 1;
  }
  .tick-label {
    font-size: 8px;
    fill: var(--text-muted);
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-variant-numeric: tabular-nums;
  }
  .tooltip-fo {
    overflow: visible;
    pointer-events: none;
  }
  .tooltip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    pointer-events: none;
    white-space: nowrap;
  }
  .tooltip :global(.tooltip-date) {
    font-size: 9px;
    color: var(--text-secondary);
    font-family: 'Inter', -apple-system, sans-serif;
    line-height: 1.1;
  }
  .tooltip :global(.tooltip-value) {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .tooltip :global(.tooltip-cost) {
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 9px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  @media (prefers-reduced-motion: reduce) {
    .chart-svg .line {
      stroke-dasharray: none;
      stroke-dashoffset: 0;
      transition: none;
    }
    .chart-svg .area {
      opacity: 1;
      transition: none;
    }
  }
</style>
