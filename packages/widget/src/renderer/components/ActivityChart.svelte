<script lang="ts">
  import { onMount } from 'svelte'
  import { convertUsdCost, formatCurrency, formatUsdCost } from '../../currency'
  import type { CurrencyCode, ExchangeRateState } from '../../currency'

  interface DailyEntry {
    date: string
    tokens: number
    cost: number
  }

  export let data: DailyEntry[] = []
  export let showCost: boolean = false
  export let locale: 'en' | 'zh' = 'en'
  export let currency: CurrencyCode = 'USD'
  export let exchangeRate: ExchangeRateState | null = null

  // Chart dimensions
  const W = 352
  const H = 126
  const PAD_TOP = 14
  const PAD_BOTTOM = 18
  const PAD_LEFT = 34
  const PAD_RIGHT = 36

  let hoveredIndex: number | null = null
  let mounted = false

  onMount(() => {
    requestAnimationFrame(() => { mounted = true })
  })

  $: tokenValues = data.map(d => d.tokens)
  $: costValues = data.map(d => convertUsdCost(d.cost, currency, exchangeRate) ?? 0)
  $: maxTokens = niceCeil(Math.max(...tokenValues, 1))
  $: maxCost = niceCeil(Math.max(...costValues, 1))

  $: chartW = W - PAD_LEFT - PAD_RIGHT
  $: chartH = H - PAD_TOP - PAD_BOTTOM

  function xAt(i: number): number {
    return PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW
  }

  function yTokenAt(val: number): number {
    return PAD_TOP + chartH - (val / maxTokens) * chartH
  }

  function yCostAt(val: number): number {
    return PAD_TOP + chartH - (val / maxCost) * chartH
  }

  // Monotone cubic spline (Fritsch-Carlson)
  function buildSplinePath(vals: number[], yForValue: (val: number) => number): string {
    if (vals.length < 2) return ''
    const n = vals.length
    const xs = vals.map((_, i) => xAt(i))
    const ys = vals.map(v => yForValue(v))

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

  $: tokenLinePath = buildSplinePath(tokenValues, yTokenAt)
  $: costLinePath = showCost ? buildSplinePath(costValues, yCostAt) : ''
  $: areaPath = tokenLinePath
    ? `${tokenLinePath}L${xAt(tokenValues.length - 1).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}L${xAt(0).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}Z`
    : ''

  $: gridLines = [0, maxTokens / 2, maxTokens]
  $: costGridLines = [0, maxCost / 2, maxCost]

  function niceCeil(val: number): number {
    if (val <= 0) return 1
    const magnitude = Math.pow(10, Math.floor(Math.log10(val)))
    const normalized = val / magnitude
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
    return step * magnitude
  }

  function formatTokens(val: number): string {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
    return String(Math.round(val))
  }

  function formatTokenAxisVal(val: number): string {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
    if (val >= 100_000) return `${Math.round(val / 1_000)}K`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
    return String(Math.round(val))
  }

  function formatCostAxisVal(val: number): string {
    return formatCurrency(val, currency, locale, true)
  }

  function dateFromEntry(dateStr: string): Date {
    return new Date(dateStr + 'T00:00:00')
  }

  function formatDate(dateStr: string): string {
    const d = dateFromEntry(dateStr)
    return new Intl.DateTimeFormat(locale, {
      month: locale === 'zh' ? 'numeric' : 'short',
      day: 'numeric',
    }).format(d)
  }

  function formatTickDate(dateStr: string): string {
    const d = dateFromEntry(dateStr)
    return new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
    }).format(d)
  }

  function formatTooltipCost(val: number): string {
    return formatUsdCost(val, currency, locale, exchangeRate)
  }

  function tooltipWidth(): number {
    return showCost ? 156 : 116
  }

  function tooltipY(idx: number): number {
    const y = yTokenAt(tokenValues[idx] ?? 0) - 30
    return Math.min(Math.max(y, 4), PAD_TOP + chartH - 28)
  }

  function tooltipBoxX(idx: number): number {
    const gap = 8
    const width = tooltipWidth()
    const anchor = xAt(idx)
    const preferred = tooltipPointerSide(idx) === 'right'
      ? anchor - width - gap
      : anchor + gap
    return Math.min(Math.max(preferred, PAD_LEFT), PAD_LEFT + chartW - width)
  }

  function tooltipPointerSide(idx: number): 'left' | 'right' {
    return xAt(idx) > PAD_LEFT + chartW / 2 ? 'right' : 'left'
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
        y1={yTokenAt(gv)}
        x2={PAD_LEFT + chartW}
        y2={yTokenAt(gv)}
        stroke="var(--border)"
        stroke-width="0.5"
        stroke-dasharray={gi === 0 ? 'none' : '2,2'}
      />
      <text
        x={PAD_LEFT - 7}
        y={yTokenAt(gv) + 3}
        text-anchor="end"
        class="y-label"
      >
        {formatTokenAxisVal(gv)}
      </text>
    {/each}

    {#if showCost}
      {#each costGridLines as gv}
        <text
          x={PAD_LEFT + chartW + 7}
          y={yCostAt(gv) + 3}
          text-anchor="start"
          class="y-label y-label-cost"
        >
          {formatCostAxisVal(gv)}
        </text>
      {/each}
    {/if}

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
    {#if costLinePath}
      <path
        d={costLinePath}
        fill="none"
        stroke="var(--chart-cache-read)"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
        clip-path="url(#chartClip)"
        class="line cost-line"
      />
    {/if}

    {#if tokenLinePath}
      <path
        d={tokenLinePath}
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
        cy={yTokenAt(tokenValues[hoveredIndex])}
        r="4"
        fill="var(--bg)"
        stroke="var(--accent)"
        stroke-width="2"
      />
      {#if showCost}
        <circle
          cx={xAt(hoveredIndex)}
          cy={yCostAt(costValues[hoveredIndex])}
          r="3"
          fill="var(--bg)"
          stroke="var(--chart-cache-read)"
          stroke-width="1.5"
        />
      {/if}
    {/if}

    <!-- Tooltip rendered inside SVG as foreignObject -->
    {#if hoveredIndex !== null && data[hoveredIndex]}
      {@const entry = data[hoveredIndex]}
      {@const tipWidth = tooltipWidth()}
      {@const tipX = tooltipBoxX(hoveredIndex)}
      {@const tipY = tooltipY(hoveredIndex)}
      <foreignObject x={tipX} y={tipY} width={tipWidth} height="28" class="tooltip-fo">
        <div
          class="tooltip"
          class:pointer-left={tooltipPointerSide(hoveredIndex) === 'left'}
          class:pointer-right={tooltipPointerSide(hoveredIndex) === 'right'}
          xmlns="http://www.w3.org/1999/xhtml"
        >
          <span class="tooltip-date">{formatDate(entry.date)}</span>
          <span class="tooltip-metric token-dot">{formatTokens(entry.tokens)}</span>
          {#if showCost && entry.cost > 0}
            <span class="tooltip-metric cost-dot">{formatTooltipCost(entry.cost)}</span>
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
          {formatTickDate(data[ti].date)}
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
  .chart-svg .cost-line {
    opacity: 0.75;
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
  .y-label {
    font-size: 7px;
    fill: var(--text-muted);
    opacity: 0.72;
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-variant-numeric: tabular-nums;
  }
  .y-label-cost {
    fill: var(--chart-cache-read);
    opacity: 0.78;
  }
  .tooltip-fo {
    overflow: visible;
    pointer-events: none;
  }
  .tooltip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    box-shadow: 0 4px 10px oklch(0 0 0 / 0.12);
    color: var(--text-primary);
    position: relative;
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, sans-serif;
    pointer-events: none;
    white-space: nowrap;
  }
  .tooltip::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .tooltip.pointer-left::after {
    left: -4px;
    transform: translateY(-50%) rotate(135deg);
  }
  .tooltip.pointer-right::after {
    right: -4px;
    transform: translateY(-50%) rotate(-45deg);
  }
  .tooltip-date,
  .tooltip-metric {
    position: relative;
    z-index: 1;
  }
  .tooltip-date {
    font-size: 9px;
    color: var(--text-secondary);
    line-height: 1;
  }
  .tooltip-metric {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: 'Geist Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .tooltip-metric::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    display: inline-block;
  }
  .cost-dot {
    color: var(--chart-cache-read);
  }
  .cost-dot::before {
    background: var(--chart-cache-read);
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
