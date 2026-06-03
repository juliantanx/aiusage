<script>
  import { onMount, onDestroy } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchPricing, updatePricing, deletePricing } from '$lib/api.js'
  import { recalcStatus, displayCurrency, exchangeRate } from '$lib/stores.js'

  let models = []
  let loading = true
  let error = null
  let editingModel = null
  let editingCurrency = null
  let editValues = {}
  let doneTimer = null
  let viewCurrency = $displayCurrency || 'USD'

  onDestroy(() => { if (doneTimer) clearTimeout(doneTimer) })

  onMount(loadData)

  async function loadData() {
    loading = true
    error = null
    try {
      const data = await fetchPricing()
      models = data.models
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

  async function saveEdit(name) {
    try {
      recalcStatus.set('updating')
      const r = await updatePricing(name, { ...editValues, currency: editingCurrency })
      editingModel = null
      editingCurrency = null
      await loadData()
      if (r.recalculated) markDone()
      else recalcStatus.set('idle')
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  async function resetModel(name) {
    try {
      recalcStatus.set('updating')
      const r = await deletePricing(name)
      await loadData()
      if (r.recalculated) markDone()
      else recalcStatus.set('idle')
    } catch (e) {
      recalcStatus.set('idle')
      alert(e.message)
    }
  }

  function fmt(n) {
    if (n == null) return '-'
    if (n === 0) return '0'
    if (n < 0.01) return n.toFixed(4)
    if (n < 1) return n.toFixed(3)
    return n.toFixed(2)
  }
</script>

<svelte:head>
  <title>{$t('pricing.title')} — AIUsage</title>
</svelte:head>

<div class="header-row">
  <h1 class="page-title">{$t('pricing.title')}</h1>
  <div class="header-right">
    {#if $recalcStatus === 'updating'}
      <span class="toast updating">{$t('pricing.costsUpdating')}</span>
    {:else if $recalcStatus === 'done'}
      <span class="toast done">{$t('pricing.costsUpdated')}</span>
    {/if}
    <div class="currency-toggle">
      <button class="toggle-btn" class:active={viewCurrency === 'USD'} on:click={() => viewCurrency = 'USD'}>USD</button>
      <button class="toggle-btn" class:active={viewCurrency === 'CNY'} on:click={() => viewCurrency = 'CNY'}>CNY</button>
    </div>
  </div>
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if error}
  <div class="state-msg error">{error}</div>
{:else}
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
            {:else if m.isDefault}
              <span class="badge default">{$t('pricing.default')}</span>
            {:else if m.matchedBy}
              <span class="badge matched">{m.matchedBy}</span>
            {:else}
              <span class="badge no-price">{$t('pricing.noPrice')}</span>
            {/if}
            {#if m.currency === 'CNY'}
              <span class="badge cny">CNY</span>
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
  .toast {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .toast.updating { color: var(--text-muted); }
  .toast.done { color: var(--accent); }
  .currency-toggle {
    display: flex;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    overflow: hidden;
  }
  .toggle-btn {
    font-family: var(--mono);
    font-size: 0.6875rem;
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
    font-size: 0.6875rem;
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
    font-size: 0.6875rem;
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

  .btn-sm {
    font-family: var(--mono);
    font-size: 0.6875rem;
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
  .btn-sm.save { border-color: var(--accent); color: var(--accent); }
  .btn-sm.reset { border-color: #f87171; color: #f87171; }

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
    font-size: 0.6875rem;
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
</style>
