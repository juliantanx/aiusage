<script>
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { formatCost, formatTokens } from '$lib/stores.js'
  import { fetchSessionDetail } from '$lib/api.js'
  import { t } from '$lib/i18n.js'

  let data = null
  let error = null
  let loading = true

  function formatDateTime(ts) {
    return new Date(ts).toLocaleString()
  }

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
    if (m === 0) return `${s}s`
    return `${m}m ${s % 60}s`
  }

  function formatRelativeTs(ms) {
    if (ms <= 0) return '+0ms'
    if (ms < 1000) return `+${ms}ms`
    const s = ms / 1000
    return `+${s % 1 === 0 ? s.toFixed(0) : s.toFixed(1)}s`
  }

  function formatGap(ms) {
    const s = Math.round(ms / 1000)
    return `— ${s}s ${$t('sessions.detail.gap')} —`
  }

  function shortSessionId(id) {
    if (!id) return ''
    return id.length > 12 ? id.slice(0, 12) + '…' : id
  }

  function tokenPercent(part, total) {
    if (!total || !part) return 0
    return Math.round((part / total) * 1000) / 10
  }

  onMount(async () => {
    const sessionId = $page.params.sessionId
    const tool = $page.url.searchParams.get('tool') || ''
    const device = $page.url.searchParams.get('device') || ''

    try {
      data = await fetchSessionDetail(sessionId, { tool, device })
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load session'
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>{$t('sessions.detail.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <a class="back-link" href="/sessions">{$t('sessions.detail.back')}</a>
  <h1>{$t('sessions.detail.title')}</h1>
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if data}
  {@const session = data.session}
  {@const records = data.records}
  {@const totalTokens = session.inputTokens + session.outputTokens + (session.cacheReadTokens || 0) + (session.cacheWriteTokens || 0) + (session.thinkingTokens || 0)}

  <!-- ── Header: identity + metrics ────────────────────────────── -->
  <div class="detail-header">
    <div class="identity card">
      <div class="id-row">
        <span class="id-tool">{session.tool}</span>
        <span class="id-model mono">{session.model}</span>
      </div>
      <div class="id-time mono">{formatDateTime(session.firstTs)}</div>
      {#if session.cwd}
        <div class="id-path mono" title={session.cwd}>{session.cwd}</div>
      {/if}
      <div class="id-footer">
        <span class="id-session mono" title={session.sessionId}>{$t('sessions.detail.meta.sessionId')}: {shortSessionId(session.sessionId)}</span>
        <span class="id-duration mono">{formatDuration(session.duration)}</span>
      </div>
    </div>

    <div class="metrics card">
      <div class="metrics-grid">
        <div class="metric-cell">
          <span class="metric-label">{$t('sessions.detail.meta.cost')}</span>
          <span class="metric-value mono accent">{formatCost(session.cost)}</span>
        </div>
        <div class="metric-cell">
          <span class="metric-label">{$t('sessions.detail.meta.totalTokens')}</span>
          <span class="metric-value mono">{formatTokens(totalTokens)}</span>
        </div>
        <div class="metric-cell">
          <span class="metric-label">{$t('sessions.detail.meta.apiCalls')}</span>
          <span class="metric-value mono">{session.recordCount}</span>
        </div>
        <div class="metric-cell">
          <span class="metric-label">{$t('sessions.detail.meta.toolCalls')}</span>
          <span class="metric-value mono">{session.toolCallCount}</span>
        </div>
      </div>

      <div class="token-breakdown">
        <div class="tb-row">
          <span class="tb-label">{$t('sessions.detail.meta.input')}</span>
          <span class="tb-bar"><span class="tb-fill tb-input" style="width:{tokenPercent(session.inputTokens, totalTokens)}%"></span></span>
          <span class="tb-value mono">{formatTokens(session.inputTokens)}</span>
        </div>
        <div class="tb-row">
          <span class="tb-label">{$t('sessions.detail.meta.output')}</span>
          <span class="tb-bar"><span class="tb-fill tb-output" style="width:{tokenPercent(session.outputTokens, totalTokens)}%"></span></span>
          <span class="tb-value mono">{formatTokens(session.outputTokens)}</span>
        </div>
        {#if session.cacheReadTokens}
          <div class="tb-row">
            <span class="tb-label">{$t('sessions.detail.meta.cacheRead')}</span>
            <span class="tb-bar"><span class="tb-fill tb-cache-read" style="width:{tokenPercent(session.cacheReadTokens, totalTokens)}%"></span></span>
            <span class="tb-value mono">{formatTokens(session.cacheReadTokens)}</span>
          </div>
        {/if}
        {#if session.cacheWriteTokens}
          <div class="tb-row">
            <span class="tb-label">{$t('sessions.detail.meta.cacheWrite')}</span>
            <span class="tb-bar"><span class="tb-fill tb-cache-write" style="width:{tokenPercent(session.cacheWriteTokens, totalTokens)}%"></span></span>
            <span class="tb-value mono">{formatTokens(session.cacheWriteTokens)}</span>
          </div>
        {/if}
        {#if session.thinkingTokens}
          <div class="tb-row">
            <span class="tb-label">{$t('sessions.detail.meta.thinking')}</span>
            <span class="tb-bar"><span class="tb-fill tb-thinking" style="width:{tokenPercent(session.thinkingTokens, totalTokens)}%"></span></span>
            <span class="tb-value mono">{formatTokens(session.thinkingTokens)}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ── Timeline ──────────────────────────────────────────────── -->
  <div class="timeline">
    {#each records as record, i}
      {@const recordTotal = record.inputTokens + record.outputTokens + (record.cacheReadTokens || 0) + (record.cacheWriteTokens || 0) + (record.thinkingTokens || 0)}
      {#if i > 0 && record.ts - records[i - 1].ts > 1000}
        <div class="gap-divider">
          <span class="gap-text">{formatGap(record.ts - records[i - 1].ts)}</span>
        </div>
      {/if}

      <div class="record-card card">
        <div class="record-header">
          <div class="record-meta-left">
            <span class="record-index mono">#{i + 1}</span>
            <span class="record-relts mono muted">{formatRelativeTs(record.ts - session.firstTs)}</span>
            <span class="record-model mono">{record.model}</span>
          </div>
          <span class="record-cost mono accent">{formatCost(record.cost)}</span>
        </div>

        <div class="record-tokens">
          <span class="rt-item" title={$t('sessions.detail.meta.input')}>
            <span class="rt-dot rt-input"></span>
            <span class="rt-val mono">{formatTokens(record.inputTokens)}</span>
          </span>
          <span class="rt-item" title={$t('sessions.detail.meta.output')}>
            <span class="rt-dot rt-output"></span>
            <span class="rt-val mono">{formatTokens(record.outputTokens)}</span>
          </span>
          {#if record.cacheReadTokens}
            <span class="rt-item" title={$t('sessions.detail.meta.cacheRead')}>
              <span class="rt-dot rt-cache-read"></span>
              <span class="rt-val mono">{formatTokens(record.cacheReadTokens)}</span>
            </span>
          {/if}
          {#if record.cacheWriteTokens}
            <span class="rt-item" title={$t('sessions.detail.meta.cacheWrite')}>
              <span class="rt-dot rt-cache-write"></span>
              <span class="rt-val mono">{formatTokens(record.cacheWriteTokens)}</span>
            </span>
          {/if}
          {#if record.thinkingTokens}
            <span class="rt-item" title={$t('sessions.detail.meta.thinking')}>
              <span class="rt-dot rt-thinking"></span>
              <span class="rt-val mono">{formatTokens(record.thinkingTokens)}</span>
            </span>
          {/if}
          <span class="rt-total mono muted" title={$t('sessions.detail.meta.totalTokens')}>{formatTokens(recordTotal)}</span>
        </div>

        {#if record.toolCalls && record.toolCalls.length > 0}
          <div class="tool-calls">
            {#each record.toolCalls as tc}
              <div class="tool-call">
                <span class="tc-index mono muted">#{tc.callIndex + 1}</span>
                <span class="tc-name mono">{tc.displayName}</span>
                {#if tc.ts != null}
                  <span class="tc-offset mono muted">{formatRelativeTs(tc.ts - record.ts)}</span>
                {/if}
                {#if tc.type === 'mcp'}
                  <span class="badge badge-mcp">mcp</span>
                {:else if tc.type === 'skill'}
                  <span class="badge badge-skill">skill</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="state-msg">
        <h2>{$t('sessions.noData')}</h2>
        <p>{$t('sessions.noDataHint')}</p>
      </div>
    {/each}
  </div>
{/if}

<style>
  .back-link {
    display: inline-block;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-decoration: none;
    margin-bottom: 0.5rem;
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--accent); }

  /* ── Header: two-column grid ──────────────────────────────── */
  .detail-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  /* Identity card */
  .identity {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
  }
  .id-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .id-tool {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--mono);
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.125rem 0.4rem;
    border-radius: 3px;
  }
  .id-model {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
  }
  .id-time {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  .id-path {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }
  .id-session {
    font-size: 0.6875rem;
    color: var(--text-muted);
  }
  .id-duration {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
  }

  /* Metrics card */
  .metrics {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
  }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .metric-cell {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .metric-label {
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    font-family: var(--mono);
  }
  .metric-value {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }

  /* Token breakdown bars */
  .token-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }
  .tb-row {
    display: grid;
    grid-template-columns: 5.5rem 1fr 4.5rem;
    align-items: center;
    gap: 0.5rem;
  }
  .tb-label {
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    font-family: var(--mono);
    text-align: right;
  }
  .tb-bar {
    height: 6px;
    background: var(--raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .tb-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    min-width: 2px;
  }
  .tb-input { background: var(--chart-input); }
  .tb-output { background: var(--chart-output); }
  .tb-cache-read { background: var(--chart-cache-read); }
  .tb-cache-write { background: var(--chart-cache-write); }
  .tb-thinking { background: var(--chart-thinking); }
  .tb-value {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: right;
  }

  /* ── Timeline ─────────────────────────────────────────────── */
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .gap-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0;
  }
  .gap-text {
    font-family: var(--mono);
    font-size: 0.6875rem;
    color: var(--text-muted);
    background: var(--raised);
    padding: 0.125rem 0.6rem;
    border-radius: 10px;
  }

  /* Record card */
  .record-card {
    padding: 0.625rem 1rem;
  }
  .record-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
  }
  .record-meta-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .record-index {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--text-muted);
    min-width: 1.25rem;
  }
  .record-relts {
    font-size: 0.6875rem;
  }
  .record-model {
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }
  .record-cost {
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* Record token dots */
  .record-tokens {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.375rem;
  }
  .rt-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .rt-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .rt-input { background: var(--chart-input); }
  .rt-output { background: var(--chart-output); }
  .rt-cache-read { background: var(--chart-cache-read); }
  .rt-cache-write { background: var(--chart-cache-write); }
  .rt-thinking { background: var(--chart-thinking); }
  .rt-val {
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }
  .rt-total {
    font-size: 0.6875rem;
    margin-left: auto;
  }

  /* Tool calls */
  .tool-calls {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.375rem;
  }
  .tool-call {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    background: var(--raised);
  }
  .tc-index {
    font-size: 0.6875rem;
    min-width: 1.25rem;
    color: var(--text-muted);
  }
  .tc-name {
    flex: 1;
    font-size: 0.6875rem;
    color: var(--text);
  }
  .tc-offset {
    font-size: 0.6875rem;
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.0625rem 0.3rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-family: var(--mono);
    flex-shrink: 0;
  }
  .badge-mcp {
    background: var(--accent-dim);
    color: var(--accent);
  }
  .badge-skill {
    background: var(--green-dim);
    color: var(--green);
  }

  .muted { color: var(--text-muted); }
  .accent { color: var(--accent); }

  /* ── Responsive ───────────────────────────────────────────── */
  @media (max-width: 800px) {
    .detail-header {
      grid-template-columns: 1fr;
    }
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .tb-row {
      grid-template-columns: 4.5rem 1fr 3.5rem;
    }
    .record-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .record-tokens {
      gap: 0.5rem;
    }
  }
</style>
