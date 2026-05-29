<script>
  import { onMount } from 'svelte'

  let snapshots = []
  let loading = true
  let error = ''

  onMount(async () => {
    const res = await fetch('/api/admin/uploads')
    if (res.status === 403) {
      error = 'Access denied. Admin role required.'
      loading = false
      return
    }
    if (res.ok) {
      const data = await res.json()
      snapshots = data.snapshots
    }
    loading = false
  })

  async function approve(id) {
    const res = await fetch(`/api/admin/uploads/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (res.ok) snapshots = snapshots.filter(s => s.id !== id)
  }

  async function reject(id) {
    const res = await fetch(`/api/admin/uploads/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (res.ok) snapshots = snapshots.filter(s => s.id !== id)
  }

  async function hide(id) {
    const res = await fetch(`/api/admin/uploads/${id}/hide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (res.ok) snapshots = snapshots.filter(s => s.id !== id)
  }

  function formatTokens(n) {
    const num = Number(n)
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toLocaleString()
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<svelte:head>
  <title>Admin — AIUsage</title>
</svelte:head>

<div class="admin-page">
  <div class="admin-container">
    <h1>Admin Dashboard</h1>

    {#if error}
      <div class="error-msg">{error}</div>
    {:else if loading}
      <p class="muted">Loading...</p>
    {:else}
      <section class="admin-section">
        <h2>Flagged Uploads ({snapshots.length})</h2>
        <p class="section-desc">Uploads flagged for review. Approve to make them public, reject to discard, or hide to keep private.</p>

        {#if snapshots.length === 0}
          <p class="muted">No flagged uploads pending review.</p>
        {:else}
          <div class="snapshot-list">
            {#each snapshots as snap}
              <div class="snapshot-card">
                <div class="snap-header">
                  <strong>{snap.display_name}</strong>
                  <span class="snap-period">{snap.period_type}</span>
                  <span class="snap-tokens">{formatTokens(snap.total_tokens)} tokens</span>
                </div>
                <div class="snap-meta">
                  <span>Device: {snap.device_name}</span>
                  <span>Code: {snap.reason_code}</span>
                  <span>{snap.reason_message}</span>
                  <span>{formatDate(snap.created_at)}</span>
                </div>
                <div class="snap-actions">
                  <button class="btn-approve" on:click={() => approve(snap.id)}>Approve</button>
                  <button class="btn-reject" on:click={() => reject(snap.id)}>Reject</button>
                  <button class="btn-hide" on:click={() => hide(snap.id)}>Hide</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .admin-page { padding: 2rem 0; }
  .admin-container { width: var(--content-width); margin: 0 auto; max-width: 1000px; }
  h1 { font-size: 2rem; font-weight: 700; margin-bottom: 2rem; }
  .admin-section { margin-bottom: 3rem; }
  .admin-section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  .section-desc { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
  .muted { color: var(--text-muted); }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }

  .snapshot-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .snapshot-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1rem 1.25rem; }
  .snap-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
  .snap-period { font-family: var(--mono); font-size: 0.75rem; font-weight: 600; background: var(--raised); padding: 0.2rem 0.5rem; border-radius: 4px; }
  .snap-tokens { font-family: var(--mono); font-weight: 600; color: var(--accent); }
  .snap-meta { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.75rem; }
  .snap-actions { display: flex; gap: 0.5rem; }
  .btn-approve, .btn-reject, .btn-hide { font-size: 0.8125rem; font-weight: 600; padding: 0.375rem 0.875rem; border-radius: 6px; cursor: pointer; transition: all 0.15s; border: 1px solid; }
  .btn-approve { color: var(--green); border-color: var(--green); background: transparent; }
  .btn-approve:hover { background: var(--green-dim); }
  .btn-reject { color: var(--rose); border-color: var(--rose); background: transparent; }
  .btn-reject:hover { background: var(--rose-dim); }
  .btn-hide { color: var(--text-muted); border-color: var(--border-medium); background: transparent; }
  .btn-hide:hover { background: var(--hover); }
</style>
