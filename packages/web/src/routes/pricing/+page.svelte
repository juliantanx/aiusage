<script>
  import { onMount, onDestroy } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchPricing, updatePricing, deletePricing, syncPricing, bindPricingAlias, recalcPricing, fetchPricingRecalcStatus } from '$lib/api.js'
  import { recalcStatus, displayCurrency, exchangeRate } from '$lib/stores.js'

  let models = []
  let loading = true
  let error = null
  let editingModel = null
  let editingCurrency = null
  let editValues = {}
  let doneTimer = null
  let viewCurrency = $displayCurrency || 'USD'
  let syncingPrices = false
  let syncSummary = null
  let registry = null
  let targets = []
  let aliasSelections = {}
  let aliasQueries = {}
  let openAliasSearch = null
  let bindingAlias = null
  let needsRecalc = false
  let recalcPanelDismissed = false
  let recalcProgress = { state: 'idle', total: 0, processed: 0, updated: 0, skipped: 0, error: null }
  let recalcTimer = null

  onDestroy(() => {
    if (doneTimer) clearTimeout(doneTimer)
    if (recalcTimer) clearInterval(recalcTimer)
  })

  onMount(async () => {
    await loadData()
    await refreshRecalcStatus()
  })

  async function loadData() {
    loading = true
    error = null
    try {
      const data = await fetchPricing()
      models = data.models || []
      registry = data.registry || null
      targets = data.targets || []
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  }

  function startEdit(m) {
    editingModel = m.model
    const from = m.currency || 'USD'
    editingCurrency = viewCurrency
    editValues = {
      input: convertPrice(m.price?.input ?? 0, from, viewCurrency) ?? 0,
      output: convertPrice(m.price?.output ?? 0, from, viewCurrency) ?? 0,
      cacheRead: convertPrice(m.price?.cacheRead ?? 0, from, viewCurrency) ?? 0,
      cacheWrite: convertPrice(m.price?.cacheWrite ?? 0, from, viewCurrency) ?? 0,
    }
  }

  function cancelEdit() { editingModel = null; editingCurrency = null; editValues = {} }

  function currencySymbol(c) { return c === 'CNY' ? '¥' : '$' }

  function convertPrice(value, fromCurrency, toCurrency) {
    if (value == null || fromCurrency === toCurrency) return value
    return fromCurrency === 'CNY' ? value * $exchangeRate : value / $exchangeRate
  }

  function fmtPrice(value, fromCurrency, toCurrency) {
    const converted = convertPrice(value, fromCurrency, toCurrency)
    return converted != null ? `${currencySymbol(toCurrency)}${fmt(converted)}` : '-'
  }

  function markDone() {
    recalcStatus.set('done')
    doneTimer = setTimeout(() => { recalcStatus.set('idle') }, 3000)
  }

  function markNeedsRecalc() {
    needsRecalc = true
    recalcPanelDismissed = false
    recalcStatus.set('idle')
  }

  function applyRecalcStatus(status) {
    recalcProgress = status || { state: 'idle', total: 0, processed: 0, updated: 0, skipped: 0, error: null }
    if (recalcProgress.state === 'queued' || recalcProgress.state === 'running') {
      recalcPanelDismissed = false
      recalcStatus.set('updating')
      startRecalcPolling()
      return
    }
    if (recalcTimer) {
      clearInterval(recalcTimer)
      recalcTimer = null
    }
    if (recalcProgress.state === 'done') {
      needsRecalc = false
      recalcPanelDismissed = false
      markDone()
    } else if (recalcProgress.state === 'error') {
      recalcPanelDismissed = false
      recalcStatus.set('idle')
    } else {
      recalcStatus.set('idle')
    }
  }

  function dismissRecalcPanel() {
    needsRecalc = false
    recalcPanelDismissed = true
    if (recalcProgress.state === 'done' || recalcProgress.state === 'error') {
      recalcProgress = { state: 'idle', total: 0, processed: 0, updated: 0, skipped: 0, error: null }
      recalcStatus.set('idle')
    }
  }

  async function refreshRecalcStatus() {
    try {
      applyRecalcStatus(await fetchPricingRecalcStatus())
    } catch {
      if (recalcTimer) {
        clearInterval(recalcTimer)
        recalcTimer = null
      }
      recalcStatus.set('idle')
    }
  }

  function startRecalcPolling() {
    if (recalcTimer) return
    recalcTimer = setInterval(refreshRecalcStatus, 700)
  }

  async function startRecalcCosts() {
    try {
      recalcStatus.set('updating')
      const r = await recalcPricing()
      applyRecalcStatus(r.status || r)
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function saveEdit(name) {
    try {
      await updatePricing(name, { ...editValues, currency: editingCurrency })
      editingModel = null
      editingCurrency = null
      await loadData()
      markNeedsRecalc()
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function resetModel(name) {
    try {
      await deletePricing(name)
      await loadData()
      markNeedsRecalc()
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function syncPrices() {
    try {
      syncingPrices = true
      const r = await syncPricing()
      syncSummary = r.summary || null
      await loadData()
      markNeedsRecalc()
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    } finally {
      syncingPrices = false
    }
  }

  async function bindAlias(alias) {
    const modelKey = aliasSelections[alias]
    if (!modelKey) return
    try {
      bindingAlias = alias
      await bindPricingAlias(alias, modelKey)
      await loadData()
      markNeedsRecalc()
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    } finally {
      bindingAlias = null
    }
  }

  function fmt(n) {
    if (n == null) return '-'
    if (n === 0) return '0'
    if (n < 0.01) return n.toFixed(4)
    if (n < 1) return n.toFixed(3)
    return n.toFixed(2)
  }

  function formatSource(m) {
    if (!m.source) return ''
    return m.sourceModelId && m.sourceModelId !== m.model ? `${m.source}: ${m.sourceModelId}` : m.source
  }

  function formatTarget(target) {
    const provider = target.provider ? `${target.provider} / ` : ''
    return `${provider}${target.model}`
  }

  function targetMatches(target, query) {
    const q = (query || '').trim().toLowerCase()
    if (!q) return true
    return [target.model, target.provider, formatTarget(target)].some((value) => String(value || '').toLowerCase().includes(q))
  }

  function filteredTargets(query) {
    return targets.filter((target) => targetMatches(target, query)).slice(0, 30)
  }

  function aliasSearchValue(alias) {
    return aliasQueries[alias] ?? selectedAliasLabel(alias)
  }

  function openAliasOptions(alias) {
    aliasQueries = { ...aliasQueries, [alias]: aliasSearchValue(alias) }
    openAliasSearch = alias
  }

  function updateAliasQuery(alias, value) {
    aliasQueries = { ...aliasQueries, [alias]: value }
    aliasSelections = { ...aliasSelections, [alias]: '' }
    openAliasSearch = alias
  }

  function selectAliasTarget(alias, target) {
    aliasSelections = { ...aliasSelections, [alias]: target.model }
    aliasQueries = { ...aliasQueries, [alias]: formatTarget(target) }
    openAliasSearch = null
  }

  function selectedAliasLabel(alias) {
    const selected = targets.find((target) => target.model === aliasSelections[alias])
    return selected ? formatTarget(selected) : ''
  }

  function recalcProgressLabel() {
    if (recalcProgress.state === 'queued') return $t('pricing.recalcQueued')
    if (recalcProgress.state === 'running') {
      return $t('pricing.recalcRunning')
        .replace('{processed}', recalcProgress.processed ?? 0)
        .replace('{total}', recalcProgress.total ?? 0)
    }
    if (recalcProgress.state === 'done') return $t('pricing.recalcDone')
    if (recalcProgress.state === 'error') return $t('pricing.recalcFailed')
    return needsRecalc ? $t('pricing.recalcNeeded') : ''
  }

  $: syncSummaryText = syncSummary
    ? $t('pricing.syncSummary')
      .replace('{added}', syncSummary.added ?? 0)
      .replace('{updated}', syncSummary.updated ?? 0)
      .replace('{unresolved}', syncSummary.dryRun?.unresolved?.length ?? 0)
    : ''
  $: pricingRegistryEmpty = !loading && !error && registry?.totalPrices === 0
  $: unresolvedModels = registry?.unresolvedLocalModels || []
  $: showUnresolvedPanel = !pricingRegistryEmpty && unresolvedModels.length > 0 && targets.length > 0
  $: recalcProgressPct = recalcProgress.total > 0 ? Math.min(100, Math.round((recalcProgress.processed / recalcProgress.total) * 100)) : 0
  $: recalcActive = recalcProgress.state === 'queued' || recalcProgress.state === 'running'
  $: showRecalcPanel = !recalcPanelDismissed && (needsRecalc || recalcActive || recalcProgress.state === 'done' || recalcProgress.state === 'error')
  $: recalcSummaryText = recalcProgress.state === 'done'
    ? $t('pricing.recalcSummary')
      .replace('{updated}', recalcProgress.updated ?? 0)
      .replace('{skipped}', recalcProgress.skipped ?? 0)
    : recalcProgress.error || ''
</script>

<svelte:head>
  <title>{$t('pricing.title')} — AIUsage</title>
</svelte:head>

<div class="header-row">
  <h1 class="page-title">{$t('pricing.title')}</h1>
  <div class="header-right">
    <button class="btn-sm primary" on:click={startRecalcCosts} disabled={recalcActive || pricingRegistryEmpty}>
      {recalcActive ? $t('pricing.costsUpdating') : $t('pricing.recalc')}
    </button>
    <button class="btn-sm sync-btn" on:click={syncPrices} disabled={syncingPrices}>
      {syncingPrices ? $t('pricing.syncingPrices') : $t('pricing.syncPrices')}
    </button>
    <div class="currency-toggle">
      <button class="toggle-btn" class:active={viewCurrency === 'USD'} on:click={() => viewCurrency = 'USD'}>USD</button>
      <button class="toggle-btn" class:active={viewCurrency === 'CNY'} on:click={() => viewCurrency = 'CNY'}>CNY</button>
    </div>
  </div>
</div>

{#if syncSummaryText}
  <div class="sync-summary mono">{syncSummaryText}</div>
{/if}

{#if showRecalcPanel}
  <div class="recalc-panel" class:error={recalcProgress.state === 'error'}>
    <div class="recalc-head">
      <div class="recalc-copy">
        <span class="recalc-label mono">{recalcProgressLabel()}</span>
        {#if recalcSummaryText}
          <span class="recalc-summary mono">{recalcSummaryText}</span>
        {/if}
      </div>
      {#if !recalcActive}
        <button class="recalc-close" type="button" on:click={dismissRecalcPanel} aria-label="Close">×</button>
      {/if}
    </div>
    <div class="recalc-track" aria-hidden="true">
      <span class="recalc-bar" style="width: {recalcActive ? Math.max(4, recalcProgressPct) : recalcProgress.state === 'done' ? 100 : 0}%"></span>
    </div>
  </div>
{/if}

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else if pricingRegistryEmpty}
  <section class="empty-pricing">
    <div class="empty-copy">
      <h2>{$t('pricing.emptyTitle')}</h2>
      <p>{$t('pricing.emptyBody')}</p>
    </div>
    <button class="btn-sm primary" on:click={syncPrices} disabled={syncingPrices}>
      {syncingPrices ? $t('pricing.syncingPrices') : $t('pricing.emptySync')}
    </button>
  </section>
{:else}
  {#if showUnresolvedPanel}
    <section class="alias-panel">
      <div class="alias-head">
        <div>
          <h2>{$t('pricing.unresolvedTitle')}</h2>
          <p>{$t('pricing.unresolvedBody').replace('{count}', unresolvedModels.length)}</p>
        </div>
      </div>
      <div class="alias-list">
        {#each unresolvedModels as alias (alias)}
          {@const aliasQuery = aliasQueries[alias] ?? selectedAliasLabel(alias)}
          <div class="alias-row">
            <span class="alias-model mono">{alias}</span>
            <div class="alias-combobox">
              <input
                class="alias-search"
                value={aliasQuery}
                placeholder={$t('pricing.aliasSearch')}
                aria-label={$t('pricing.aliasTarget')}
                on:focus={() => openAliasOptions(alias)}
                on:blur={() => setTimeout(() => {
                  if (openAliasSearch === alias) openAliasSearch = null
                }, 100)}
                on:input={(event) => updateAliasQuery(alias, event.currentTarget.value)}
              />
              {#if openAliasSearch === alias}
                <div class="alias-options" role="listbox">
                  {#each filteredTargets(aliasQuery) as target}
                    <button type="button" class="alias-option" on:mousedown|preventDefault={() => selectAliasTarget(alias, target)}>
                      <span class="alias-option-model mono">{target.model}</span>
                      {#if target.provider}
                        <span class="alias-option-provider">{target.provider}</span>
                      {/if}
                    </button>
                  {:else}
                    <span class="alias-empty">{$t('pricing.aliasNoResults')}</span>
                  {/each}
                </div>
              {/if}
            </div>
            <button class="btn-sm save" on:click={() => bindAlias(alias)} disabled={!aliasSelections[alias] || bindingAlias === alias}>
              {bindingAlias === alias ? $t('pricing.bindingAlias') : $t('pricing.bindAlias')}
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <div class="grid">
    {#each models as m, i}
      {@const editing = editingModel === m.model}
      <div class="card" class:no-price={!m.price && !m.matchedBy} style="animation-delay: {i * 25}ms">
        {#if editing}
          <div class="card-head">
            <span class="model-name mono">{m.model}</span>
            <span class="badge" class:cny={editingCurrency === 'CNY'} class:default={editingCurrency !== 'CNY'}>
              {editingCurrency} ({currencySymbol(editingCurrency)})
            </span>
          </div>
          <div class="edit-fields">
            <label>{$t('pricing.input')} ({currencySymbol(editingCurrency)}/1M)
              <input type="number" step="0.01" bind:value={editValues.input} class="edit-input" />
            </label>
            <label>{$t('pricing.output')} ({currencySymbol(editingCurrency)}/1M)
              <input type="number" step="0.01" bind:value={editValues.output} class="edit-input" />
            </label>
            <label>{$t('pricing.cacheRead')} ({currencySymbol(editingCurrency)}/1M)
              <input type="number" step="0.01" bind:value={editValues.cacheRead} class="edit-input" />
            </label>
            <label>{$t('pricing.cacheWrite')} ({currencySymbol(editingCurrency)}/1M)
              <input type="number" step="0.01" bind:value={editValues.cacheWrite} class="edit-input" />
            </label>
          </div>
          <div class="edit-btns">
            <button class="btn-sm save" on:click={() => saveEdit(m.model)}>{$t('pricing.save')}</button>
            <button class="btn-sm" on:click={cancelEdit}>{$t('pricing.cancel')}</button>
          </div>
        {:else}
          <div class="card-head">
            <span class="model-name mono">{m.model}</span>
            <div class="card-btns">
              <button class="btn-sm" on:click={() => startEdit(m)}>{$t('pricing.edit')}</button>
              {#if m.isOverride}
                <button class="btn-sm reset" on:click={() => resetModel(m.model)}>{$t('pricing.reset')}</button>
              {/if}
            </div>
          </div>

          <div class="price-row">
            <div class="price-block primary">
              <span class="price-label">{$t('pricing.input')}</span>
              <span class="price-val">{m.price ? fmtPrice(m.price.input, m.currency, viewCurrency) : '-'}</span>
            </div>
            <span class="slash">/</span>
            <div class="price-block primary">
              <span class="price-label">{$t('pricing.output')}</span>
              <span class="price-val">{m.price ? fmtPrice(m.price.output, m.currency, viewCurrency) : '-'}</span>
            </div>
          </div>

          <div class="price-row secondary">
            <div class="price-block">
              <span class="price-label">{$t('pricing.cacheRead')}</span>
              <span class="price-val sm">{m.price?.cacheRead != null ? fmtPrice(m.price.cacheRead, m.currency, viewCurrency) : '-'}</span>
            </div>
            <div class="price-block">
              <span class="price-label">{$t('pricing.cacheWrite')}</span>
              <span class="price-val sm">{m.price?.cacheWrite != null ? fmtPrice(m.price.cacheWrite, m.currency, viewCurrency) : '-'}</span>
            </div>
          </div>

          <div class="card-footer">
            {#if m.isOverride}
              <span class="badge override">{$t('pricing.override')}</span>
            {:else if m.isBuiltin || m.isDefault}
              <span class="badge default">{$t('pricing.default')}</span>
            {:else if m.matchedBy}
              <span class="badge matched">{m.matchedBy}</span>
            {:else}
              <span class="badge no-price">{$t('pricing.noPrice')}</span>
            {/if}
            {#if m.currency === 'CNY'}
              <span class="badge cny">CNY</span>
            {/if}
            {#if formatSource(m)}
              <span class="badge source">{formatSource(m)}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }
  .page-title {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .sync-summary {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin: -0.75rem 0 1rem;
  }
  .recalc-panel {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    margin: -0.5rem 0 1rem;
    padding: 0.75rem 1rem;
  }
  .recalc-panel.error {
    border-color: var(--rose);
  }
  .recalc-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .recalc-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }
  .recalc-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    margin: -0.25rem -0.35rem 0 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }
  .recalc-close:hover,
  .recalc-close:focus {
    outline: none;
    background: var(--raised);
    color: var(--text);
  }
  .recalc-label {
    color: var(--text);
    font-size: 0.75rem;
  }
  .recalc-summary {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: right;
  }
  .recalc-panel.error .recalc-label,
  .recalc-panel.error .recalc-summary {
    color: var(--rose);
  }
  .recalc-track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--raised);
  }
  .recalc-bar {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.2s ease-out;
  }
  .currency-toggle {
    display: flex;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    overflow: hidden;
  }
  .toggle-btn {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .toggle-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }
  .toggle-btn:not(.active):hover {
    color: var(--text);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
  }

  .empty-pricing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }

  .alias-panel {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    margin-bottom: 1rem;
    padding: 1rem 1.25rem;
  }
  .alias-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .alias-head h2 {
    margin: 0 0 0.25rem;
    font-family: var(--mono);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
  }
  .alias-head p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .alias-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border-subtle);
  }
  .alias-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(220px, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 44px;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .alias-row:last-child { border-bottom: none; }
  .alias-model {
    color: var(--text);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .alias-combobox {
    position: relative;
    min-width: 0;
  }
  .alias-search {
    height: 32px;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    font-family: var(--mono);
    font-size: 0.75rem;
    padding: 0 0.5rem;
  }
  .alias-search:focus { outline: none; border-color: var(--accent); }
  .alias-options {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 220px;
    overflow-y: auto;
    padding: 0.25rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 1px 3px oklch(0 0 0 / 0.08), 0 4px 12px oklch(0 0 0 / 0.04);
  }
  .alias-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: 30px;
    padding: 0.35rem 0.45rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .alias-option:hover,
  .alias-option:focus {
    outline: none;
    background: var(--raised);
  }
  .alias-option-model {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
  }
  .alias-option-provider {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  .alias-empty {
    display: block;
    padding: 0.45rem 0.5rem;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .empty-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 64ch;
  }
  .empty-copy h2 {
    margin: 0;
    font-family: var(--mono);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
  }
  .empty-copy p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    transition: background 0.2s;
    animation: fadeIn 0.2s ease both;
  }
  .card.no-price { opacity: 0.45; }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .model-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
    word-break: break-all;
    line-height: 1.4;
  }
  .card-btns {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .price-row.secondary {
    gap: 1rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.5rem;
  }
  .price-block {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  .price-block.primary { flex: 1; }
  .slash {
    font-family: var(--mono);
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 0 0.15rem;
    align-self: flex-end;
    margin-bottom: 0.1rem;
  }
  .price-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .price-val {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .price-val.sm {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .badge.default { background: var(--accent-dim); color: var(--accent); }
  .badge.override { background: var(--badge-override-bg); color: var(--badge-override-fg); }
  .badge.matched { background: var(--badge-matched-bg); color: var(--badge-matched-fg); max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .badge.no-price { background: var(--badge-noprice-bg); color: var(--badge-noprice-fg); }
  .badge.cny { background: var(--purple-dim); color: var(--purple); }
  .badge.source {
    background: var(--raised);
    color: var(--text-muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: none;
  }

  .btn-sm {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--raised);
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .btn-sm:hover { border-color: var(--accent); color: var(--accent); }
  .btn-sm:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-sm:disabled:hover { border-color: var(--border-subtle); color: var(--text); }
  .btn-sm.save { border-color: var(--accent); color: var(--accent); }
  .btn-sm.primary { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .btn-sm.reset { border-color: #f87171; color: #f87171; }
  .sync-btn { height: 32px; }

  .edit-fields {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  .edit-fields label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .edit-input {
    font-family: var(--mono);
    font-size: 0.75rem;
    width: 100%;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    text-align: right;
    height: 32px;
  }
  .edit-input:focus { outline: none; border-color: var(--accent); }
  .edit-btns { display: flex; gap: 0.5rem; }

  .state-msg { color: var(--text-muted); padding: 2rem; text-align: center; }
  .state-msg.error { color: var(--rose); }
  .mono { font-weight: 500; }

  @media (max-width: 640px) {
    .header-row,
    .empty-pricing {
      align-items: flex-start;
      flex-direction: column;
    }
    .header-right { flex-wrap: wrap; }
    .alias-row {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 0.5rem;
      padding: 0.75rem 0;
    }
    .alias-combobox {
      width: 100%;
    }
    .recalc-copy {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }
    .recalc-summary {
      text-align: left;
    }
  }
</style>
