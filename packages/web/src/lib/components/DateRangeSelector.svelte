<script>
  import { dateRange, setRange, setCustomRange } from '../stores.js'
  import { t, lang } from '../i18n.js'

  let showMonthPicker = false
  let showCustom = false
  let customFrom = ''
  let customTo = ''
  let selectedMonth = ''

  // Generate last 12 months
  function getMonths() {
    const months = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push(value)
    }
    return months
  }

  const months = getMonths()

  function handleRangeChange(range) {
    setRange(range)
    showCustom = false
    showMonthPicker = false
    selectedMonth = ''
  }

  function handleMonthSelect(e) {
    const val = e.target.value
    if (!val) return
    selectedMonth = val
    const [y, m] = val.split('-').map(Number)
    const from = `${val}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${val}-${String(lastDay).padStart(2, '0')}`
    setCustomRange(from, to)
    showCustom = false
  }

  function handleCustomRange() {
    if (customFrom && customTo) {
      setCustomRange(customFrom, customTo)
      selectedMonth = ''
    }
  }

  // Use reactive variables so Svelte tracks store dependency in class:active directives
  $: activeDay = !selectedMonth && $dateRange.range === 'day' && !$dateRange.from
  $: activeWeek = !selectedMonth && $dateRange.range === 'week' && !$dateRange.from
  $: activeMonth = !selectedMonth && $dateRange.range === 'month' && !$dateRange.from
  $: activeLast30 = !selectedMonth && $dateRange.range === 'last30' && !$dateRange.from
  $: activeAll = !selectedMonth && $dateRange.range === 'all' && !$dateRange.from
  $: activeCustom = showCustom || ($dateRange.from && !selectedMonth)

  function formatMonthLabel(val) {
    const [y, m] = val.split('-')
    const monthNames = {
      en: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      zh: ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    }
    const names = monthNames[$lang] || monthNames.en
    return `${y} ${names[parseInt(m)]}`
  }
</script>

<div class="date-range">
  <button class:active={activeDay} on:click={() => handleRangeChange('day')}>
    {$t('range.today')}
  </button>
  <button class:active={activeWeek} on:click={() => handleRangeChange('week')}>
    {$t('range.week')}
  </button>
  <button class:active={activeMonth} on:click={() => handleRangeChange('month')}>
    {$t('range.month')}
  </button>
  <button class:active={activeLast30} on:click={() => handleRangeChange('last30')}>
    {$t('range.last30')}
  </button>
  <button class:active={activeAll} on:click={() => handleRangeChange('all')}>
    {$t('range.allTime')}
  </button>

  <div class="sep">|</div>

  <select
    class="month-select"
    class:active={!!selectedMonth}
    bind:value={selectedMonth}
    on:change={handleMonthSelect}
  >
    <option value="">{$t('range.pickMonth')}</option>
    {#key $lang}
      {#each months as m}
        <option value={m}>{formatMonthLabel(m)}</option>
      {/each}
    {/key}
  </select>

  <button
    class="custom-toggle"
    class:active={activeCustom}
    on:click={() => { showCustom = !showCustom; showMonthPicker = false }}
    title="Custom range"
  >⊞</button>

  {#if showCustom}
    <div class="custom">
      <input type="date" bind:value={customFrom} />
      <span class="arrow">→</span>
      <input type="date" bind:value={customTo} />
      <button class="apply" on:click={handleCustomRange} disabled={!customFrom || !customTo}>
        {$t('common.apply')}
      </button>
    </div>
  {/if}
</div>

<style>
  .date-range {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  button {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-raised);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 500;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  button:hover {
    border-color: var(--border-medium);
    color: var(--text-primary);
  }
  button.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .sep {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin: 0 0.15rem;
    opacity: 0.4;
  }
  .month-select {
    padding: 0.38rem 0.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.78rem;
    background: var(--bg-raised);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    appearance: auto;
  }
  .month-select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .month-select.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }
  .custom-toggle {
    font-family: var(--mono);
    font-size: 0.9rem;
    padding: 0.32rem 0.5rem;
  }
  .custom {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-left: 0.15rem;
    animation: fadeUp 0.2s ease;
  }
  .arrow {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  input {
    padding: 0.38rem 0.55rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-size: 0.78rem;
    font-family: var(--mono);
    background: var(--bg-raised);
    color: var(--text-secondary);
    color-scheme: dark;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .apply {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
