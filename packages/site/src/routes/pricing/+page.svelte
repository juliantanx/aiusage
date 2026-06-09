<script>
  import { onMount } from 'svelte'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'

  let entries = []
  let loading = true
  let search = ''
  let currency = 'all'

  $: filtered = entries.filter(e => {
    if (search && !e.model_key.toLowerCase().includes(search.toLowerCase())) return false
    if (currency !== 'all' && e.currency !== currency) return false
    return true
  })

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
    <p class="page-desc">{zh ? 'AIUsage 使用的官方模型价格，用于费用估算和排行榜计算。' : 'Official model prices used by AIUsage for cost estimation and leaderboard calculations.'}</p>
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
      <div class="entry-count">{filtered.length} {zh ? '个模型' : 'models'}</div>
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
          </tr>
        </thead>
        <tbody>
          {#each filtered as entry}
            <tr>
              <td class="mono col-model">{entry.model_key}</td>
              <td class="col-price mono">{formatPrice(entry.input)}</td>
              <td class="col-price mono">{formatPrice(entry.output)}</td>
              <td class="col-price mono">{formatPrice(entry.cache_read)}</td>
              <td class="col-price mono">{formatPrice(entry.cache_write)}</td>
              <td class="col-currency text-muted">{entry.currency || 'USD'}</td>
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
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  .page-header {
    margin-bottom: 1.5rem;
  }
  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
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
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 200px;
  }
  .search-input {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.8125rem;
    background: var(--bg);
    color: var(--text);
    flex: 1;
    max-width: 240px;
  }
  .currency-filter {
    display: flex;
    gap: 0.25rem;
  }
  .cur-btn {
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    background: var(--bg);
    color: var(--text-secondary);
  }
  .cur-btn:hover { background: var(--hover); }
  .cur-active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
  .entry-count {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  .price-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .price-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .price-table th {
    text-align: left;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--surface);
  }
  .price-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-dim, var(--border));
  }
  .price-table tbody tr:last-child td { border-bottom: none; }
  .price-table tbody tr:hover { background: var(--hover); }
  .col-model { min-width: 200px; }
  .col-price { min-width: 80px; text-align: right; }
  .col-currency { min-width: 60px; }
  .mono { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.8125rem; }
  .text-muted { color: var(--text-secondary); }
  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-secondary);
  }
</style>
