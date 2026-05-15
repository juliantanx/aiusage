<script>
  import { selectedTool, setTool } from '../stores.js'
  import { t } from '../i18n.js'

  const tools = ['claude-code', 'codex', 'openclaw', 'opencode']

  function handleChange(e) {
    setTool(e.target.value)
  }
</script>

<div class="tool-selector">
  <select value={$selectedTool} on:change={handleChange} title={$t('tool.allTools')}>
    <option value="">{$t('tool.allTools')}</option>
    {#each tools as tool}
      <option value={tool}>{tool}</option>
    {/each}
  </select>
</div>

<style>
  .tool-selector {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  select {
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
  select:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
