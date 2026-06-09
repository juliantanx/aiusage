<script>
  import { onMount, onDestroy } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchPricing, updatePricing, deletePricing, syncPricing, bindPricingAlias, unbindPricingAlias, recalcPricing, fetchPricingRecalcStatus } from '$lib/api.js'
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
  let localBindings = []
  let aliasSelections = {}
  let aliasQueries = {}
  let modelSearch = ''
  let aliasPanelExpanded = false
  let autoBindingsExpanded = false
  let manualBindingsExpanded = false
  let openAliasSearch = null
  let bindingAlias = null
  let unbindingAlias = null
  let needsRecalc = false
  let needsRecalcSince = null
  let activeRecalcStartedAt = null
  let recalcPanelDismissed = false
  let recalcProgress = { state: 'idle', total: 0, processed: 0, updated: 0, skipped: 0, error: null }
  let recalcTimer = null
  let recalcRefreshTimer = null
  let recalcWaitToken = 0
  let recalcPanelState = 'idle'

  onDestroy(() => {
    recalcWaitToken += 1
    if (doneTimer) clearTimeout(doneTimer)
    if (recalcTimer) clearInterval(recalcTimer)
    if (recalcRefreshTimer) clearTimeout(recalcRefreshTimer)
  })

  onMount(async () => {
    await loadData()
    await refreshRecalcStatus()
  })

  async function loadData({ showLoading = true } = {}) {
    if (showLoading) loading = true
    error = null
    try {
      const data = await fetchPricing()
      models = data.models || []
      registry = data.registry || null
      targets = data.targets || []
      localBindings = data.localBindings || []
      const nextSelections = {}
      const nextQueries = {}
      for (const binding of localBindings) {
        if (!binding.modelKey) continue
        nextSelections[binding.model] = binding.modelKey
        const target = (data.targets || []).find((item) => item.model === binding.modelKey)
        nextQueries[binding.model] = target ? formatTarget(target) : binding.modelKey
      }
      aliasSelections = nextSelections
      aliasQueries = nextQueries
      if (!localBindings.length) aliasPanelExpanded = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      if (showLoading) loading = false
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
    if (doneTimer) clearTimeout(doneTimer)
    recalcStatus.set('done')
    doneTimer = setTimeout(() => { recalcStatus.set('idle') }, 3000)
  }

  function markNeedsRecalc(since = Date.now()) {
    if (doneTimer) {
      clearTimeout(doneTimer)
      doneTimer = null
    }
    needsRecalc = true
    needsRecalcSince = since
    recalcPanelDismissed = false
    recalcStatus.set('idle')
  }

  function applyNeedsRecalcResult(result) {
    if (result?.needsRecalc) markNeedsRecalc(result.needsRecalcSince ?? Date.now())
  }

  function applyServerRecalcRequirement(status) {
    if (!status || typeof status.needsRecalc !== 'boolean') return false
    if (status.needsRecalc) {
      markNeedsRecalc(status.needsRecalcSince ?? Date.now())
    } else {
      needsRecalc = false
      needsRecalcSince = null
      activeRecalcStartedAt = null
    }
    return true
  }

  function applyRecalcStatus(status) {
    recalcProgress = status || { state: 'idle', total: 0, processed: 0, updated: 0, skipped: 0, error: null }
    const hasServerRecalcRequirement = applyServerRecalcRequirement(recalcProgress)
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
      const doneCoversPendingChange = hasServerRecalcRequirement
        ? !needsRecalc
        : !needsRecalc || (activeRecalcStartedAt != null && activeRecalcStartedAt >= needsRecalcSince)
      if (doneCoversPendingChange) {
        needsRecalc = false
        needsRecalcSince = null
        activeRecalcStartedAt = null
        recalcPanelDismissed = false
        markDone()
      } else {
        recalcStatus.set('idle')
      }
    } else if (recalcProgress.state === 'error') {
      recalcPanelDismissed = false
      recalcStatus.set('idle')
    } else {
      recalcStatus.set('idle')
    }
  }

  function dismissRecalcPanel() {
    recalcPanelDismissed = true
    if (!needsRecalc && (recalcProgress.state === 'done' || recalcProgress.state === 'error')) {
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

  function isActiveRecalcStatus(status) {
    return status?.state === 'queued' || status?.state === 'running'
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function waitForRecalcCompletion(token) {
    for (let attempt = 0; attempt < 180 && token === recalcWaitToken; attempt += 1) {
      await sleep(attempt < 5 ? 250 : 700)
      if (token !== recalcWaitToken) return
      const status = await fetchPricingRecalcStatus()
      applyRecalcStatus(status)
      if (!isActiveRecalcStatus(status)) return
    }
  }

  function refreshRecalcStatusSoon() {
    if (recalcRefreshTimer) clearTimeout(recalcRefreshTimer)
    recalcRefreshTimer = setTimeout(() => {
      recalcRefreshTimer = null
      void refreshRecalcStatus()
    }, 100)
  }

  async function startRecalcCosts() {
    try {
      const recalcRequestedAt = Date.now()
      recalcPanelDismissed = false
      recalcStatus.set('updating')
      const r = await recalcPricing()
      const status = r.status || r
      if (r.accepted !== false) activeRecalcStartedAt = status.startedAt ?? recalcRequestedAt
      recalcWaitToken += 1
      const waitToken = recalcWaitToken
      applyRecalcStatus(status)
      if (isActiveRecalcStatus(status)) {
        await waitForRecalcCompletion(waitToken)
      } else {
        await refreshRecalcStatus()
      }
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function saveEdit(name) {
    try {
      const result = await updatePricing(name, { ...editValues, currency: editingCurrency })
      editingModel = null
      editingCurrency = null
      await loadData({ showLoading: false })
      applyNeedsRecalcResult(result)
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function resetModel(name) {
    try {
      const result = await deletePricing(name)
      await loadData({ showLoading: false })
      applyNeedsRecalcResult(result)
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
      applyNeedsRecalcResult(r)
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    } finally {
      syncingPrices = false
    }
  }

  async function bindAlias(alias, selectedModelKey = resolvedAliasModelKey(alias)) {
    const modelKey = selectedModelKey
    if (!modelKey) return
    const target = targets.find((item) => item.model === modelKey)
    try {
      bindingAlias = alias
      const result = await bindPricingAlias(alias, modelKey)
      applyNeedsRecalcResult(result)
      localBindings = localBindings.map((binding) => binding.model === alias
        ? { ...binding, modelKey, origin: 'user', source: 'manual', matchType: 'alias', hasPrice: true }
        : binding)
      aliasSelections = { ...aliasSelections, [alias]: modelKey }
      aliasQueries = { ...aliasQueries, [alias]: target ? formatTarget(target) : modelKey }
      bindingAlias = null
      await loadData({ showLoading: false })
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    } finally {
      bindingAlias = null
    }
  }

  async function unbindAlias(alias) {
    try {
      unbindingAlias = alias
      const result = await unbindPricingAlias(alias)
      applyNeedsRecalcResult(result)
      localBindings = localBindings.map((binding) => binding.model === alias
        ? { ...binding, modelKey: null, origin: null, source: null, matchType: null, hasPrice: false }
        : binding)
      aliasSelections = { ...aliasSelections, [alias]: '' }
      aliasQueries = { ...aliasQueries, [alias]: '' }
      unbindingAlias = null
      await loadData({ showLoading: false })
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    } finally {
      unbindingAlias = null
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
    if (m.source === 'litellm') {
      return m.sourceModelId && m.sourceModelId !== m.model ? m.sourceModelId : ''
    }
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
    const binding = localBindings.find((item) => item.model === alias)
    if (binding && !canChangeBinding(binding)) return
    aliasQueries = { ...aliasQueries, [alias]: aliasSearchValue(alias) }
    openAliasSearch = alias
  }

  function updateAliasQuery(alias, value) {
    const binding = localBindings.find((item) => item.model === alias)
    if (binding && !canChangeBinding(binding)) return
    aliasQueries = { ...aliasQueries, [alias]: value }
    aliasSelections = { ...aliasSelections, [alias]: '' }
    openAliasSearch = alias
  }

  function toggleAliasPanel() {
    aliasPanelExpanded = !aliasPanelExpanded
    if (!aliasPanelExpanded) openAliasSearch = null
  }

  function toggleAutoBindings() {
    autoBindingsExpanded = !autoBindingsExpanded
  }

  function toggleManualBindings() {
    manualBindingsExpanded = !manualBindingsExpanded
    if (!manualBindingsExpanded) openAliasSearch = null
  }

  function selectAliasTarget(alias, target) {
    aliasSelections = { ...aliasSelections, [alias]: target.model }
    aliasQueries = { ...aliasQueries, [alias]: formatTarget(target) }
    openAliasSearch = null
  }

  function resolveAliasModelKey(selected, queryValue) {
    if (selected) return selected
    const query = (queryValue || '').trim().toLowerCase()
    if (!query) return ''
    const target = targets.find((item) => {
      return item.model.toLowerCase() === query || formatTarget(item).toLowerCase() === query
    })
    return target?.model || ''
  }

  function resolvedAliasModelKey(alias) {
    return resolveAliasModelKey(aliasSelections[alias], aliasQueries[alias])
  }

  function selectedAliasLabel(alias) {
    const selected = targets.find((target) => target.model === aliasSelections[alias])
    return selected ? formatTarget(selected) : ''
  }

  function bindingLabel(binding) {
    if (!binding.hasPrice || !binding.modelKey) return $t('pricing.noPrice')
    if (binding.bindingType === 'custom') return $t('pricing.customPricing')
    if (binding.bindingType === 'manual') return $t('pricing.manualBinding')
    if (binding.matchType === 'alias') return $t('pricing.autoBinding')
    if (binding.matchType === 'prefix') return $t('pricing.prefixBinding')
    return $t('pricing.exactBinding')
  }

  function isManualAliasBinding(binding) {
    return Boolean(binding.hasManualBinding)
  }

  function canChangeBinding(binding) {
    return binding.bindingType === 'none' || binding.hasManualBinding
  }

  function isAutomaticBinding(binding) {
    return binding.bindingType === 'automatic'
  }

  function hasChangedAliasSelection(alias, binding) {
    const modelKey = resolvedAliasModelKey(alias)
    return Boolean(modelKey && modelKey !== binding.modelKey)
  }

  function hasChangedAliasModelKey(modelKey, binding) {
    return Boolean(modelKey && modelKey !== binding.modelKey)
  }

  function aliasActionDisabled(alias, binding, modelKey = resolvedAliasModelKey(alias)) {
    if (bindingAlias === alias || unbindingAlias === alias) return true
    if (!canChangeBinding(binding) || isAutomaticBinding(binding)) return true
    if (isManualAliasBinding(binding) && !hasChangedAliasModelKey(modelKey, binding)) return false
    return !modelKey || modelKey === binding.modelKey
  }

  function aliasActionLabel(alias, binding, modelKey = resolvedAliasModelKey(alias)) {
    if (unbindingAlias === alias) return $t('pricing.unbindingAlias')
    if (isManualAliasBinding(binding) && !hasChangedAliasModelKey(modelKey, binding)) return $t('pricing.unbindAlias')
    return bindButtonLabel(alias, modelKey)
  }

  function runAliasAction(alias, binding, modelKey = resolvedAliasModelKey(alias)) {
    if (isAutomaticBinding(binding)) return
    if (!canChangeBinding(binding)) return
    if (isManualAliasBinding(binding) && !hasChangedAliasModelKey(modelKey, binding)) {
      return unbindAlias(alias)
    }
    return bindAlias(alias, modelKey)
  }

  function bindButtonLabel(alias, modelKey = resolvedAliasModelKey(alias)) {
    if (bindingAlias === alias) return $t('pricing.bindingAlias')
    const current = localBindings.find((binding) => binding.model === alias)
    if (current?.modelKey && current.modelKey !== modelKey) return $t('pricing.updateBinding')
    return $t('pricing.bindAlias')
  }

  function modelMatchesSearch(model, search) {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [
      model.model,
      model.provider,
      model.source,
      model.sourceModelId,
      model.matchedBy,
      model.origin,
      model.currency,
    ].some((value) => String(value || '').toLowerCase().includes(q))
  }

  $: syncSummaryText = syncSummary
    ? $t('pricing.syncSummary')
      .replace('{added}', syncSummary.added ?? 0)
      .replace('{updated}', syncSummary.updated ?? 0)
      .replace('{unresolved}', syncSummary.dryRun?.unresolved?.length ?? 0)
    : ''
  $: pricingRegistryEmpty = !loading && !error && registry?.totalPrices === 0
  $: unresolvedModels = registry?.unresolvedLocalModels || []
  $: localBindingRows = localBindings || []
  $: automaticBindingRows = localBindingRows.filter((binding) => isAutomaticBinding(binding))
  $: manualBindingRows = localBindingRows.filter((binding) => !isAutomaticBinding(binding))
  $: visibleModels = models.filter((model) => modelMatchesSearch(model, modelSearch))
  $: showUnresolvedPanel = !pricingRegistryEmpty && localBindingRows.length > 0 && targets.length > 0
  $: {
    const state = recalcProgress.state
    const pendingRecalc = needsRecalc
    if (state === 'queued' || state === 'running') recalcPanelState = state
    else if (state === 'error') recalcPanelState = 'error'
    else if (state === 'done' && !pendingRecalc) recalcPanelState = 'done'
    else if (pendingRecalc) recalcPanelState = 'needed'
    else recalcPanelState = 'idle'
  }
  $: recalcProgressPct = recalcProgress.total > 0 ? Math.min(100, Math.round((recalcProgress.processed / recalcProgress.total) * 100)) : 0
  $: recalcActive = recalcPanelState === 'queued' || recalcPanelState === 'running'
  $: showRecalcPanel = !recalcPanelDismissed && recalcPanelState !== 'idle'
  $: recalcSummaryText = recalcProgress.state === 'done'
    ? $t('pricing.recalcSummary')
      .replace('{updated}', recalcProgress.updated ?? 0)
      .replace('{skipped}', recalcProgress.skipped ?? 0)
    : recalcProgress.error || ''
  $: recalcTitleText = recalcPanelState === 'queued' ? $t('pricing.recalcQueued')
    : recalcPanelState === 'running' ? $t('pricing.recalcRunning').replace('{processed}', recalcProgress.processed ?? 0).replace('{total}', recalcProgress.total ?? 0)
    : recalcPanelState === 'needed' ? $t('pricing.recalcNeeded')
    : recalcPanelState === 'error' ? $t('pricing.recalcFailed')
    : recalcPanelState === 'done' ? $t('pricing.recalcDone')
    : ''
  $: recalcBodyText = recalcPanelState === 'queued' ? (
      (recalcProgress.queueRunning || Math.max(0, (recalcProgress.queuePending ?? 1) - 1) > 0)
        ? $t('pricing.recalcQueuedBehindWrites').replace('{count}', Math.max(0, (recalcProgress.queuePending ?? 1) - 1))
        : $t('pricing.recalcQueuedBody')
    )
    : recalcPanelState === 'running' ? $t('pricing.recalcRunningBody')
    : recalcPanelState === 'needed' ? $t('pricing.recalcNeededBody')
    : recalcPanelState === 'error' ? (recalcProgress.error || $t('pricing.recalcFailedBody'))
    : recalcPanelState === 'done' ? recalcSummaryText
    : ''
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
  <div class="recalc-panel" class:active={recalcActive} class:done={recalcPanelState === 'done'} class:error={recalcPanelState === 'error'}>
    <div class="recalc-head">
      <div class="recalc-status">
        <span class="recalc-dot" aria-hidden="true"></span>
        <div class="recalc-copy">
          <span class="recalc-label mono">{recalcTitleText}</span>
          {#if recalcBodyText}
            <span class="recalc-summary">{recalcBodyText}</span>
          {/if}
        </div>
      </div>
      <div class="recalc-actions">
        {#if !recalcActive && (recalcPanelState === 'needed' || recalcPanelState === 'error')}
          <button class="btn-sm primary" type="button" on:click={startRecalcCosts} disabled={pricingRegistryEmpty}>
            {$t('pricing.recalcNow')}
          </button>
        {/if}
        {#if !recalcActive}
          <button class="recalc-close" type="button" on:click={dismissRecalcPanel} aria-label="Close">×</button>
        {/if}
      </div>
    </div>
    {#if recalcActive}
      <div class="recalc-track" aria-hidden="true">
        <span class="recalc-bar" style="width: {Math.max(4, recalcProgressPct)}%"></span>
      </div>
    {/if}
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
          <h2>{$t('pricing.bindingsTitle')}</h2>
          <p>{$t('pricing.bindingsBody').replace('{count}', localBindingRows.length).replace('{unresolved}', unresolvedModels.length)}</p>
        </div>
        <button
          class="btn-sm alias-toggle"
          type="button"
          aria-expanded={aliasPanelExpanded}
          on:click={toggleAliasPanel}
        >
          {aliasPanelExpanded ? $t('pricing.collapseUnresolved') : $t('pricing.expandUnresolved')}
        </button>
      </div>
      {#if aliasPanelExpanded}
        <div class="alias-list">
          {#if automaticBindingRows.length}
            <div class="alias-section">
              <div class="alias-section-head">
                <button class="section-toggle" type="button" aria-expanded={autoBindingsExpanded} on:click={toggleAutoBindings}>
                  <span aria-hidden="true">{autoBindingsExpanded ? '−' : '+'}</span>
                  <h3>{$t('pricing.autoBindingsTitle')}</h3>
                </button>
                <span class="mono">{automaticBindingRows.length}</span>
              </div>
              {#if autoBindingsExpanded}
                {#each automaticBindingRows as binding (binding.model)}
                  {@const alias = binding.model}
                  {@const aliasQuery = aliasQueries[alias] ?? selectedAliasLabel(alias)}
                  <div class="alias-row auto">
                    <div class="alias-meta">
                      <span class="alias-model mono">{alias}</span>
                      <span class="alias-state">{bindingLabel(binding)}</span>
                    </div>
                    <div class="alias-combobox">
                      <input
                        class="alias-search"
                        value={aliasQuery}
                        placeholder={$t('pricing.aliasSearch')}
                        aria-label={$t('pricing.aliasTarget')}
                        disabled
                      />
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}

          {#if manualBindingRows.length}
            <div class="alias-section">
              <div class="alias-section-head">
                <button class="section-toggle" type="button" aria-expanded={manualBindingsExpanded} on:click={toggleManualBindings}>
                  <span aria-hidden="true">{manualBindingsExpanded ? '−' : '+'}</span>
                  <h3>{$t('pricing.manualBindingsTitle')}</h3>
                </button>
                <span class="mono">{manualBindingRows.length}</span>
              </div>
              {#if manualBindingsExpanded}
                {#each manualBindingRows as binding (binding.model)}
                  {@const alias = binding.model}
                  {@const aliasSelected = aliasSelections[alias]}
                  {@const aliasQuery = aliasQueries[alias] ?? selectedAliasLabel(alias)}
                  {@const aliasModelKey = resolveAliasModelKey(aliasSelected, aliasQuery)}
                  {@const aliasChanged = hasChangedAliasModelKey(aliasModelKey, binding)}
                  <div class="alias-row">
                    <div class="alias-meta">
                      <span class="alias-model mono">{alias}</span>
                      <span class="alias-state" class:unresolved={!binding.hasPrice}>{bindingLabel(binding)}</span>
                    </div>
                    <div class="alias-combobox">
                      <input
                        class="alias-search"
                        value={aliasQuery}
                        placeholder={$t('pricing.aliasSearch')}
                        aria-label={$t('pricing.aliasTarget')}
                        disabled={!canChangeBinding(binding)}
                        on:focus={() => openAliasOptions(alias)}
                        on:blur={() => setTimeout(() => {
                          if (openAliasSearch === alias) openAliasSearch = null
                        }, 100)}
                        on:input={(event) => updateAliasQuery(alias, event.currentTarget.value)}
                      />
                      {#if openAliasSearch === alias}
                        <div class="alias-options" role="listbox">
                          {#each filteredTargets(aliasQueries[alias] ?? '') as target}
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
                    {#if canChangeBinding(binding)}
                      <div class="alias-actions">
                        <button class="btn-sm" class:save={!isManualAliasBinding(binding) || aliasChanged} class:reset={isManualAliasBinding(binding) && !aliasChanged} on:click={() => runAliasAction(alias, binding, aliasModelKey)} disabled={aliasActionDisabled(alias, binding, aliasModelKey)}>
                          {aliasActionLabel(alias, binding, aliasModelKey)}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <div class="pricing-toolbar">
    <label class="model-filter">
      <span>{$t('pricing.modelSearch')}</span>
      <input
        class="model-filter-input"
        type="search"
        bind:value={modelSearch}
        placeholder={$t('pricing.modelSearchPlaceholder')}
        aria-label={$t('pricing.modelSearch')}
      />
    </label>
    <span class="pricing-count mono">{$t('pricing.modelSearchCount').replace('{shown}', visibleModels.length).replace('{total}', models.length)}</span>
  </div>

  {#if visibleModels.length === 0}
    <div class="state-msg">{$t('pricing.modelSearchEmpty')}</div>
  {:else}
  <div class="grid">
    {#each visibleModels as m, i}
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
              <span class="badge override">{m.hasSyncedBaseline ? $t('pricing.syncedOverride') : $t('pricing.override')}</span>
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
    background: var(--accent-dim);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    margin: -0.5rem 0 1rem;
    padding: 0.85rem 1rem;
  }
  .recalc-panel.active,
  .recalc-panel.done {
    background: var(--surface);
  }
  .recalc-panel.error {
    border-color: var(--rose);
    background: var(--badge-noprice-bg);
  }
  .recalc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .recalc-status {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    min-width: 0;
  }
  .recalc-dot {
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    margin-top: 0.38rem;
    border-radius: 999px;
    background: var(--accent);
  }
  .recalc-panel.done .recalc-dot {
    background: var(--green);
  }
  .recalc-panel.error .recalc-dot {
    background: var(--rose);
  }
  .recalc-copy {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    min-width: 0;
  }
  .recalc-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }
  .recalc-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
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
    font-size: 0.78rem;
    line-height: 1.45;
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

  .pricing-toolbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .model-filter {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: min(420px, 100%);
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .model-filter-input {
    height: 32px;
    width: 100%;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    font-family: var(--mono);
    font-size: 0.75rem;
    padding: 0 0.55rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .model-filter-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .pricing-count {
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
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
  }
  .alias-list { margin-top: 0.75rem; }
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
  .alias-toggle {
    flex-shrink: 0;
  }
  .alias-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.75rem;
  }
  .alias-section {
    display: flex;
    flex-direction: column;
  }
  .alias-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 28px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .alias-section-head h3 {
    margin: 0;
    color: var(--text-secondary);
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .alias-section-head span {
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  .section-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
  }
  .section-toggle span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 0.75rem;
  }
  .section-toggle:hover h3,
  .section-toggle:focus h3 {
    color: var(--text);
  }
  .section-toggle:focus {
    outline: none;
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
  .alias-row.auto {
    grid-template-columns: minmax(0, 1.2fr) minmax(220px, 1fr);
  }
  .alias-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.35rem;
  }
  .alias-meta {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .alias-model {
    color: var(--text);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .alias-state {
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  .alias-state.unresolved {
    color: var(--rose);
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
  .alias-search:disabled {
    cursor: not-allowed;
    opacity: 0.7;
    color: var(--text-muted);
  }
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
    .pricing-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 0.5rem;
    }
    .pricing-count {
      white-space: normal;
    }
    .alias-head {
      align-items: stretch;
      flex-direction: column;
    }
    .alias-toggle {
      align-self: flex-start;
    }
    .alias-row {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 0.5rem;
      padding: 0.75rem 0;
    }
    .alias-combobox {
      width: 100%;
    }
    .alias-actions {
      justify-content: flex-start;
    }
    .recalc-copy {
      align-items: flex-start;
      gap: 0.25rem;
    }
    .recalc-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .recalc-actions {
      width: 100%;
      justify-content: space-between;
    }
    .recalc-summary {
      text-align: left;
    }
  }
</style>
