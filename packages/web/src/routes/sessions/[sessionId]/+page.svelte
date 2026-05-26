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

  <div class="meta-bar card">
    <div class="meta-item">
      <span class="meta-label mono">{formatDateTime(session.firstTs)}</span>
      <span class="meta-sub">{session.tool}</span>
    </div>
    <div class="meta-divider"></div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.model')}</span>
      <span class="meta-val mono">{session.model}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.duration')}</span>
      <span class="meta-val mono">{formatDuration(session.duration)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.tokens')}</span>
      <span class="meta-val mono">{formatTokens(session.inputTokens + session.outputTokens)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.cost')}</span>
      <span class="meta-val mono accent">{formatCost(session.cost)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.apiCalls')}</span>
      <span class="meta-val mono">{session.recordCount}</span>
    </div>
    <div class="meta-item">
      <span class="meta-key">{$t('sessions.detail.meta.toolCalls')}</span>
      <span class="meta-val mono">{session.toolCallCount}</span>
    </div>
  </div>

  <div class="timeline">
    {#each records as record, i}
      {#if i > 0 && record.ts - records[i - 1].ts > 1000}
        <div class="gap-divider">
          <span class="gap-text">{formatGap(record.ts - records[i - 1].ts)}</span>
        </div>
      {/if}

      <div class="record-card card">
        <div class="record-header">
          <div class="record-meta-left">
            <span class="record-label mono">{$t('sessions.detail.record')} #{i + 1}</span>
            <span class="record-relts mono muted">{formatRelativeTs(record.ts - session.firstTs)}</span>
          </div>
          <div class="record-meta-right">
            <span class="record-model mono">{record.model}</span>
            <span class="record-tokens mono">
              <span class="green">{formatTokens(record.inputTokens)}</span>
              <span class="sep">/</span>
              <span class="blue">{formatTokens(record.outputTokens)}</span>
            </span>
            <span class="record-cost mono accent">{formatCost(record.cost)}</span>
          </div>
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
        {:else}
          <div class="no-tool-calls muted">{$t('sessions.detail.noToolCalls')}</div>
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
  .back-link:hover {
    color: var(--accent);
  }

  .meta-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }
  .meta-divider {
    width: 1px;
    height: 2rem;
    background: var(--border-subtle);
    flex-shrink: 0;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .meta-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }
  .meta-sub {
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .meta-key {
    font-size: 0.625rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    font-family: var(--mono);
  }
  .meta-val {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .gap-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0;
  }
  .gap-text {
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    background: var(--surface);
    padding: 0.2rem 0.75rem;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
  }

  .record-card {
    padding: 0.85rem 1.25rem;
  }
  .record-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .record-meta-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .record-meta-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .record-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .record-relts {
    font-size: 0.75rem;
  }
  .record-model {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .record-tokens {
    font-size: 0.8rem;
  }
  .sep {
    color: var(--text-muted);
    margin: 0 0.1rem;
  }
  .record-cost {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .tool-calls {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.6rem;
  }
  .tool-call {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    background: var(--raised);
  }
  .tc-index {
    font-size: 0.65rem;
    min-width: 1.5rem;
    color: var(--text-muted);
  }
  .tc-name {
    flex: 1;
    font-size: 0.78rem;
    color: var(--text);
  }
  .tc-offset {
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-family: var(--mono);
    flex-shrink: 0;
  }
  .badge-mcp {
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .badge-skill {
    background: color-mix(in srgb, var(--green) 15%, transparent);
    color: var(--green);
    border: 1px solid var(--green);
  }

  .no-tool-calls {
    font-size: 0.78rem;
    font-style: italic;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }

  .muted { color: var(--text-muted); }
  .accent { color: var(--accent); }
  .green { color: var(--green); }
  .blue { color: var(--blue); }

  @media (max-width: 600px) {
    .meta-bar { flex-direction: column; align-items: flex-start; }
    .meta-divider { display: none; }
    .record-header { flex-direction: column; align-items: flex-start; }
    .record-meta-right { flex-wrap: wrap; }
  }
</style>
