<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'

  let devices = []
  let uploads = []
  let loading = true
  let me = null
  let currentPassword = ''
  let newPassword = ''
  let confirmPassword = ''
  let pwMsg = ''
  let pwError = ''
  let pwSaving = false

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  onMount(async () => {
    const [meRes, devRes, uploadRes] = await Promise.all([
      fetch('/api/me'),
      fetch('/api/me/devices'),
      fetch('/api/me/leaderboard/uploads')
    ])
    if (meRes.ok) {
      me = await meRes.json()
    }
    if (devRes.ok) {
      const data = await devRes.json()
      devices = data.devices
    }
    if (uploadRes.ok) {
      const data = await uploadRes.json()
      uploads = data.snapshots
    }
    loading = false
  })

  async function handlePasswordSave() {
    pwMsg = ''
    pwError = ''
    if (newPassword !== confirmPassword) {
      pwError = 'Passwords do not match'
      return
    }
    pwSaving = true
    try {
      const res = await fetch('/api/me/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({
          current_password: me?.has_password ? currentPassword : undefined,
          new_password: newPassword
        })
      })
      const data = await res.json()
      if (res.ok) {
        pwMsg = 'Password updated successfully'
        currentPassword = ''
        newPassword = ''
        confirmPassword = ''
        if (me) me = { ...me, has_password: true }
      } else {
        pwError = data.error || 'Failed to update password'
      }
    } catch {
      pwError = 'Network error'
    } finally {
      pwSaving = false
    }
  }

  async function revokeDevice(id) {
    if (!confirm('Revoke this device? This cannot be undone.')) return
    const res = await fetch(`/api/me/devices/${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': getCsrfToken() }
    })
    if (res.ok) {
      devices = devices.map(d => d.id === id ? { ...d, status: 'revoked', revoked_at: new Date().toISOString() } : d)
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<svelte:head>
  <title>Settings — AIUsage</title>
</svelte:head>

<div class="settings-page">
  <div class="settings-container">
    <h1>Settings</h1>

    {#if $page.url.searchParams.get('bound')}
      <div class="success-msg">Successfully linked {$page.url.searchParams.get('bound')} account!</div>
    {/if}

    {#if me}
      <section class="settings-section">
        <h2>{me.has_password ? 'Change Password' : 'Set Password'}</h2>
        <p class="section-desc">
          {me.has_password
            ? 'Update your account password.'
            : 'Set a password so you can also sign in with your username or email.'}
        </p>

        {#if pwMsg}
          <div class="success-msg">{pwMsg}</div>
        {/if}
        {#if pwError}
          <div class="error-msg">{pwError}</div>
        {/if}

        <form class="pw-form" on:submit|preventDefault={handlePasswordSave}>
          {#if me.has_password}
            <div class="field">
              <label for="current-pw">Current Password</label>
              <input id="current-pw" type="password" bind:value={currentPassword} required autocomplete="current-password" />
            </div>
          {/if}
          <div class="field">
            <label for="new-pw">New Password</label>
            <input id="new-pw" type="password" bind:value={newPassword} required minlength="8" autocomplete="new-password" />
          </div>
          <div class="field">
            <label for="confirm-pw">Confirm Password</label>
            <input id="confirm-pw" type="password" bind:value={confirmPassword} required minlength="8" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn-primary" disabled={pwSaving}>
            {pwSaving ? 'Saving...' : me.has_password ? 'Update Password' : 'Set Password'}
          </button>
        </form>
      </section>
    {/if}

    <section class="settings-section">
      <h2>Authorized Devices</h2>
      <p class="section-desc">Devices authorized to upload token data to the leaderboard.</p>

      {#if loading}
        <p class="muted">Loading...</p>
      {:else if devices.length === 0}
        <p class="muted">No devices authorized yet. Run <code>aiusage leaderboard login</code> to authorize a device.</p>
      {:else}
        <div class="device-list">
          {#each devices as device}
            <div class="device-card" class:revoked={device.status === 'revoked'}>
              <div class="device-info">
                <strong>{device.name}</strong>
                <span class="device-status" class:active={device.status === 'active'} class:revoked-status={device.status === 'revoked'}>
                  {device.status}
                </span>
              </div>
              <div class="device-meta">
                <span>Created: {formatDate(device.created_at)}</span>
                {#if device.last_used_at}
                  <span>Last upload: {formatDate(device.last_used_at)}</span>
                {/if}
                {#if device.revoked_at}
                  <span>Revoked: {formatDate(device.revoked_at)}</span>
                {/if}
              </div>
              {#if device.status === 'active'}
                <button class="btn-revoke" on:click={() => revokeDevice(device.id)}>Revoke</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="settings-section">
      <h2>Upload History</h2>
      <p class="section-desc">Your recent upload status and review results.</p>

      {#if uploads.length === 0}
        <p class="muted">No uploads yet.</p>
      {:else}
        <div class="upload-list">
          {#each uploads as snap}
            <div class="upload-row">
              <span class="upload-period">{snap.period_type}</span>
              <span class="upload-tokens">{Number(snap.total_tokens).toLocaleString()} tokens</span>
              <span class="upload-status status-{snap.status}">{snap.status}</span>
              {#if snap.reason_message}
                <span class="upload-reason">{snap.reason_message}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .settings-page { padding: 2rem 0; }
  .settings-container { width: var(--content-width); margin: 0 auto; max-width: 800px; }
  h1 { font-size: 2rem; font-weight: 700; margin-bottom: 2rem; }
  .settings-section { margin-bottom: 3rem; }
  .settings-section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  .section-desc { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
  .muted { color: var(--text-muted); font-size: 0.875rem; }
  .success-msg { background: var(--green-dim); color: var(--green); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1.5rem; }

  .device-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .device-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1rem 1.25rem; }
  .device-card.revoked { opacity: 0.6; }
  .device-info { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .device-status { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .device-status.active { background: var(--green-dim); color: var(--green); }
  .device-status.revoked-status { background: var(--rose-dim); color: var(--rose); }
  .device-meta { display: flex; gap: 1.5rem; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.75rem; }
  .btn-revoke { font-size: 0.8125rem; font-weight: 600; color: var(--rose); background: transparent; border: 1px solid var(--rose); border-radius: 6px; padding: 0.375rem 0.875rem; cursor: pointer; transition: all 0.15s; }
  .btn-revoke:hover { background: var(--rose-dim); }

  .upload-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .upload-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; font-size: 0.875rem; }
  .upload-period { font-weight: 600; min-width: 80px; }
  .upload-tokens { font-family: var(--mono); flex: 1; }
  .upload-status { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 4px; text-transform: uppercase; }
  .status-accepted { background: var(--green-dim); color: var(--green); }
  .status-flagged { background: var(--amber-dim); color: var(--amber); }
  .status-rejected { background: var(--rose-dim); color: var(--rose); }
  .upload-reason { font-size: 0.75rem; color: var(--text-muted); }

  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .pw-form { max-width: 400px; }
  .field { margin-bottom: 1rem; }
  .field label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-secondary); }
  .field input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.15s; }
  .field input:focus { border-color: var(--accent); }
  .btn-primary { padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
