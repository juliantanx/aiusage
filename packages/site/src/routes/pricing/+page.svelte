<script>
  import { onMount } from 'svelte'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'

  let entries = []
  let loading = true
  let search = ''
  let currency = 'all'

  $: filtered = entries.filter(e => {
    if (search) {
      const q = search.toLowerCase()
      if (!e.model_key.toLowerCase().includes(q) && !(e.source_model_id || '').toLowerCase().includes(q)) return false
    }
    if (currency !== 'all' && e.currency !== currency) return false
    return true
  })

  function originLabel(entry) {
    return entry.origin === 'user' ? (zh ? '自定义' : 'Custom') : (zh ? '内置' : 'Builtin')
  }

  function sourceLabel(entry) {
    if (entry.source === 'manual') return zh ? '手动' : 'Manual'
    if (entry.source === 'litellm') return 'LiteLLM'
    if (entry.source === 'legacy') return zh ? '旧表' : 'Legacy'
    return entry.source || '-'
  }

  function formatPrice(v) {
    if (v == null) return '-'
    return Number(v).toFixed(v < 0.01 ? 4 : 2)
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/pricing')
      if (res.ok) {
        const data = await res.json()
        entries = data.entries || []
      }
    } catch {}
    loading = false
  })
</script>

<svelte:head>
  <title>{zh ? '价格表' : 'Pricing'} — AIUsage</title>
</svelte:head>

<div class="pricing-page">
  <div class="page-header">
    <h1>{zh ? '模型价格表' : 'Model Pricing'}</h1>
    <p class="page-desc">{zh ? 'AIUsage 当前使用的模型价格估算，用于费用估算和排行榜计算。' : 'Current model price estimates used by AIUsage for cost estimation and leaderboard calculations.'}</p>
  </div>

  {#if loading}
    <div class="empty">{zh ? '加载中...' : 'Loading...'}</div>
  {:else if entries.length === 0}
    <div class="empty">
      <p>{zh ? '暂无价格数据' : 'No pricing data available'}</p>
    </div>
  {:else}
    <div class="toolbar">
      <div class="search-wrap">
        <input
          type="text"
          class="search-input"
          placeholder={zh ? '搜索模型...' : 'Search models...'}
          bind:value={search}
        />
        <div class="currency-filter">
          <button class="cur-btn" class:cur-active={currency === 'all'} on:click={() => currency = 'all'}>{zh ? '全部' : 'All'}</button>
          <button class="cur-btn" class:cur-active={currency === 'USD'} on:click={() => currency = 'USD'}>USD</button>
          <button class="cur-btn" class:cur-active={currency === 'CNY'} on:click={() => currency = 'CNY'}>CNY</button>
        </div>
      </div>
      <span class="entry-count">{filtered.length} {zh ? '个模型' : 'models'}</span>
    </div>

    <div class="price-table-wrap">
      <table class="price-table">
        <thead>
          <tr>
            <th class="col-model">{zh ? '模型' : 'Model'}</th>
            <th class="col-price">{zh ? '输入' : 'Input'}</th>
            <th class="col-price">{zh ? '输出' : 'Output'}</th>
            <th class="col-price">{zh ? '缓存读取' : 'Cache Read'}</th>
            <th class="col-price">{zh ? '缓存写入' : 'Cache Write'}</th>
            <th class="col-currency">{zh ? '货币' : 'Currency'}</th>
            <th class="col-source">{zh ? '来源' : 'Source'}</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as entry}
            <tr>
              <td class="col-model">
                <span class="model-key">{entry.model_key}</span>
                <span class="badge" class:badge-custom={entry.origin === 'user'}>{originLabel(entry)}</span>
                {#if entry.source_model_id && entry.source_model_id !== entry.model_key}
                  <div class="source-id">{entry.source_model_id}</div>
                {/if}
              </td>
              <td class="col-price">{formatPrice(entry.input)}</td>
              <td class="col-price">{formatPrice(entry.output)}</td>
              <td class="col-price">{formatPrice(entry.cache_read)}</td>
              <td class="col-price">{formatPrice(entry.cache_write)}</td>
              <td class="col-currency">{entry.currency || 'USD'}</td>
              <td class="col-source">{sourceLabel(entry)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if search && filtered.length === 0}
      <div class="empty">
        <p>{zh ? '未找到匹配的模型' : 'No matching models'}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .pricing-page {
    width: var(--content-width);
    margin: 0 auto;
    padding: 2.5rem 0 3rem;
  }

  .page-header {
    margin-bottom: 1.5rem;
  }
  .page-header h1 {
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 0.375rem;
  }
  .page-desc {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex: 1;
    min-width: 200px;
  }
  .search-input {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-size: 0.8125rem;
    background: var(--surface);
    color: var(--text);
    height: 32px;
    box-sizing: border-box;
    flex: 1;
    max-width: 280px;
    transition: border-color 150ms ease-out;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .currency-filter {
    display: flex;
    gap: 2px;
  }
  .cur-btn {
    padding: 0 0.625rem;
    border: 1px solid var(--border-subtle);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    background: var(--surface);
    color: var(--text-secondary);
    height: 32px;
    transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
  }
  .cur-btn:first-child { border-radius: 6px 0 0 6px; }
  .cur-btn:last-child { border-radius: 0 6px 6px 0; }
  .cur-btn:not(:first-child) { margin-left: -1px; }
  .cur-btn:hover { background: var(--hover); }
  .cur-active {
    background: var(--accent-dim);
    color: var(--accent);
    border-color: var(--accent);
    position: relative;
    z-index: 1;
  }
  .entry-count {
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .price-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--surface);
  }
  .price-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    table-layout: fixed;
  }

  .price-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.6875rem;
    font-weight: 550;
    color: var(--text-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .price-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid oklch(0.94 0.005 85);
    vertical-align: top;
  }
  .price-table tbody tr:last-child td { border-bottom: none; }
  .price-table tbody tr:hover td { background: var(--hover); }

  .col-model { width: auto; min-width: 280px; }
  th.col-price { text-align: right; }
  td.col-price {
    text-align: right;
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    white-space: nowrap;
  }
  th.col-currency,
  td.col-currency {
    width: 64px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  th.col-source,
  td.col-source {
    width: 80px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .model-key {
    font-family: var(--mono);
    font-size: 0.8125rem;
    word-break: break-all;
  }
  .badge {
    display: inline-block;
    font-family: var(--mono);
    font-size: 0.5625rem;
    font-weight: 600;
    background: var(--raised);
    color: var(--text-muted);
    padding: 0.0625rem 0.3rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    vertical-align: middle;
    margin-left: 0.375rem;
    flex-shrink: 0;
  }
  .badge-custom {
    color: var(--accent);
    background: var(--accent-dim);
  }
  .source-id {
    margin-top: 0.125rem;
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 0.6875rem;
    word-break: break-all;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .pricing-page { padding: 1.5rem 1rem 2rem; }
    .price-table { table-layout: auto; }
    .col-model { min-width: 180px; }
  }
</style>
