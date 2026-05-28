<script lang="ts">
  export let onRefresh: () => void
  export let onClose: () => void
</script>

<div class="header">
  <span class="logo">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 64 64" style="display:block;border-radius:4px">
      <rect width="64" height="64" rx="14" fill="#0d9488"/>
      <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
      <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
      <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
    </svg>
    aiusage
  </span>
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
    display: flex;
    align-items: center;
    gap: 6px;
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
