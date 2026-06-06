<script lang="ts">
  export let onRefresh: () => void
  export let onClose: () => void
  export let onToggleSettings: () => void
</script>

<div class="header">
  <span class="logo">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 64 64" style="display:block;border-radius:3px">
      <rect width="64" height="64" rx="14" fill="oklch(0.55 0.12 175)"/>
      <rect x="10" y="38" width="12" height="16" rx="3" fill="white"/>
      <rect x="26" y="26" width="12" height="28" rx="3" fill="white"/>
      <rect x="42" y="14" width="12" height="40" rx="3" fill="white"/>
    </svg>
    aiusage
  </span>
  <div class="actions">
    <button class="icon-btn" title="Refresh" on:click={onRefresh}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M2.5 8a5.5 5.5 0 0 1 9.36-3.93"/>
        <path d="M13.5 8a5.5 5.5 0 0 1-9.36 3.93"/>
        <path d="M12 1.5v3h-3"/>
        <path d="M4 11.5v3h3"/>
      </svg>
    </button>
    <button class="icon-btn" title="Settings" on:click={onToggleSettings}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
    <button class="icon-btn" title="Close" on:click={onClose}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M2 2l8 8M10 2l-8 8"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    -webkit-app-region: drag;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.02em;
  }
  .actions {
    display: flex;
    gap: 2px;
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
