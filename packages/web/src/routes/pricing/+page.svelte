<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchPricing, updatePricing, deletePricing, recalcPricing } from '$lib/api.js'

  let models = []
  let loading = true
  let error = null
  let editingModel = null
  let editValues = {}
  let recalcStatus = ''

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
    editValues = {
      input: m.price?.input ?? 0,
      output: m.price?.output ?? 0,
      cacheRead: m.price?.cacheRead ?? 0,
      cacheWrite: m.price?.cacheWrite ?? 0,
      thinking: m.price?.thinking ?? 0,
    }
  }

  function cancelEdit() { editingModel = null; editValues = {} }

  async function saveEdit(name) {
    try {
      await updatePricing(name, editValues)
      editingModel = null
      await loadData()
    } catch (e) { alert(e.message) }
  }

  async function resetModel(name) {
    try {
      await deletePricing(name)
      await loadData()
    } catch (e) { alert(e.message) }
  }

  async function handleRecalc() {
    recalcStatus = '...'
    try {
      const r = await recalcPricing()
      recalcStatus = `${$t('pricing.recalcDone')}: ${r.updated}`
      setTimeout(() => { recalcStatus = '' }, 3000)
    } catch (e) { recalcStatus = e.message }
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
  <button class="btn" on:click={handleRecalc}>
    {$t('pricing.recalc')}
    {#if recalcStatus}<span class="recalc-status">{recalcStatus}</span>{/if}
  </button>
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
          </div>
          <div class="edit-fields">
            <label>{$t('pricing.input')}
              <input type="number" step="0.01" bind:value={editValues.input} class="edit-input" />
            </label>
            <label>{$t('pricing.output')}
              <input type="number" step="0.01" bind:value={editValues.output} class="edit-input" />
            </label>
            <label>{$t('pricing.cacheRead')}
              <input type="number" step="0.01" bind:value={editValues.cacheRead} class="edit-input" />
            </label>
            <label>{$t('pricing.cacheWrite')}
              <input type="number" step="0.01" bind:value={editValues.cacheWrite} class="edit-input" />
            </label>
            <label>{$t('pricing.thinking')}
              <input type="number" step="0.01" bind:value={editValues.thinking} class="edit-input" />
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
              <span class="price-val">{m.price ? fmt(m.price.input) : '-'}</span>
            </div>
            <span class="slash">/</span>
            <div class="price-block primary">
              <span class="price-label">{$t('pricing.output')}</span>
              <span class="price-val">{m.price ? fmt(m.price.output) : '-'}</span>
            </div>
          </div>

          <div class="price-row secondary">
            <div class="price-block">
              <span class="price-label">{$t('pricing.cacheRead')}</span>
              <span class="price-val sm">{m.price?.cacheRead != null ? fmt(m.price.cacheRead) : '-'}</span>
            </div>
            <div class="price-block">
              <span class="price-label">{$t('pricing.cacheWrite')}</span>
              <span class="price-val sm">{m.price?.cacheWrite != null ? fmt(m.price.cacheWrite) : '-'}</span>
            </div>
            <div class="price-block">
              <span class="price-label">{$t('pricing.thinking')}</span>
              <span class="price-val sm">{m.price?.thinking != null ? fmt(m.price.thinking) : '-'}</span>
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
    color: var(--text-primary);
  }
  .btn {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .btn:hover { border-color: var(--accent); }
  .recalc-status { margin-left: 0.5rem; color: var(--accent); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
  }

  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    animation: fadeUp 0.3s ease both;
  }
  .card:hover {
    border-color: var(--border-medium);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }
  .card.no-price { opacity: 0.45; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
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
    color: var(--text-primary);
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
    padding-top: 0.15rem;
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
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .price-val {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
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
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .badge.default { background: var(--accent-dim); color: var(--accent); }
  .badge.override { background: #2d1f00; color: #f5a623; }
  .badge.matched { background: #0d2818; color: #4ade80; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .badge.no-price { background: #2d1010; color: #f87171; }

  .btn-sm {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--bg-raised);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .btn-sm:hover { border-color: var(--accent); }
  .btn-sm.save { border-color: var(--accent); color: var(--accent); }
  .btn-sm.reset { border-color: #f87171; color: #f87171; }

  .edit-fields {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
  }
  .edit-fields label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-family: var(--mono);
    font-size: 0.5rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .edit-input {
    font-family: var(--mono);
    font-size: 0.75rem;
    width: 100%;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--bg-raised);
    color: var(--text-primary);
    text-align: right;
  }
  .edit-input:focus { outline: none; box-shadow: 0 0 0 2px var(--accent-dim); }
  .edit-btns { display: flex; gap: 0.5rem; }

  .state-msg { color: var(--text-muted); padding: 2rem; text-align: center; }
  .state-msg.error { color: #f87171; }
  .mono { font-weight: 500; }
</style>
