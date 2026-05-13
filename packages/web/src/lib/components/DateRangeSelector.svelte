<script>
  import { dateRange, setRange, setCustomRange } from '../stores.js'

  let customFrom = ''
  let customTo = ''

  function handleRangeChange(range) {
    setRange(range)
  }

  function handleCustomRange() {
    if (customFrom && customTo) {
      setCustomRange(customFrom, customTo)
    }
  }
</script>

<div class="date-range">
  <button
    class:active={$dateRange.range === 'day' && !$dateRange.from}
    on:click={() => handleRangeChange('day')}
  >Today</button>
  <button
    class:active={$dateRange.range === 'week'}
    on:click={() => handleRangeChange('week')}
  >This Week</button>
  <button
    class:active={$dateRange.range === 'month'}
    on:click={() => handleRangeChange('month')}
  >This Month</button>
  <div class="custom">
    <input type="date" bind:value={customFrom} placeholder="From" />
    <input type="date" bind:value={customTo} placeholder="To" />
    <button on:click={handleCustomRange} disabled={!customFrom || !customTo}>Apply</button>
  </div>
</div>

<style>
  .date-range {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  button {
    padding: 0.4rem 0.8rem;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  button.active {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .custom {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    margin-left: 0.5rem;
  }
  input {
    padding: 0.35rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.875rem;
  }
</style>
