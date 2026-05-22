<script lang="ts">
  export let onRefresh: () => void
  export let onClose: () => void
</script>

<div class="header">
  <span class="logo">⚡ aiusage</span>
  <div class="actions">
    <button class="icon-btn" title="Refresh" on:click={onRefresh}>↻</button>
    <button class="icon-btn" title="Close" on:click={onClose}>✕</button>
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }
  .logo {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }
  .actions {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
  }
  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s, color 0.1s;
    padding: 0;
  }
  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
