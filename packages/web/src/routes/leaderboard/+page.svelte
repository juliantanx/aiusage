<script>
  import { onDestroy, onMount } from 'svelte'
  import {
    completeLeaderboardAuth,
    fetchConfig,
    fetchLeaderboardAuthStatus,
    logoutLeaderboardAuth,
    saveConfig,
    startLeaderboardAuth,
    uploadLeaderboardData,
  } from '$lib/api.js'
  import { t } from '$lib/i18n.js'

  let siteUrl = 'https://aiusage.jtanx.com'
  let authLoading = true
  let authBusy = false
  let authError = ''
  let authStatus = { loggedIn: false, uploads: [] }
  let authRequest = null
  let authPollTimer = null
  let uploadBusy = false
  let uploadResult = null
  let uploadSuccessMsg = ''
  let uploadSuccessTimer = null
  let autoUploadEnabled = false
  let autoUploadInterval = '604800000'
  let autoUploadSaving = false
  const defaultAutoUploadInterval = 604800000

  const autoUploadIntervals = [
    { value: '86400000', labelKey: 'leaderboard.autoUploadIntervals.daily' },
    { value: '604800000', labelKey: 'leaderboard.autoUploadIntervals.weekly' },
    { value: '2592000000', labelKey: 'leaderboard.autoUploadIntervals.monthly' },
  ]

  $: recentUpload = authStatus?.uploads?.[0] || null
  $: accountName = authStatus?.user?.display_name || authStatus?.user?.username || ''
  $: accountInitial = (accountName || 'A').charAt(0).toUpperCase()
  $: readableDeviceName = authStatus?.deviceName || (authStatus?.loggedIn ? $t('leaderboard.authorizedDevice') : '')
  $: latestUploadTime = recentUpload?.created_at || null
  $: nextUploadTime = autoUploadEnabled && latestUploadTime
    ? new Date(new Date(latestUploadTime).getTime() + Number(autoUploadInterval || defaultAutoUploadInterval))
    : null
  $: selectedIntervalLabel = autoUploadIntervals.find(option => option.value === autoUploadInterval)?.labelKey || 'leaderboard.autoUploadIntervals.weekly'

  function formatFullTokens(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n.toLocaleString() : '0'
  }

  function formatDate(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function formatUploadStatus(upload) {
    if (!upload) return $t('leaderboard.noUploads')
    return `${upload.period_type} · ${upload.status}`
  }

  async function loadAuthStatus() {
    authLoading = true
    authError = ''
    try {
      authStatus = await fetchLeaderboardAuthStatus()
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to load auth status'
    } finally {
      authLoading = false
    }
  }

  function clearAuthPoll() {
    if (authPollTimer) {
      clearInterval(authPollTimer)
      authPollTimer = null
    }
  }

  async function beginLogin() {
    authBusy = true
    authError = ''
    try {
      const started = await startLeaderboardAuth()
      if (started.alreadyLoggedIn) {
        await loadAuthStatus()
        return
      }

      authRequest = started
      window.open(started.verification_url, '_blank', 'noopener')
      clearAuthPoll()
      authPollTimer = setInterval(pollLogin, Math.max(2, Number(started.interval || 5)) * 1000)
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to start authorization'
    } finally {
      authBusy = false
    }
  }

  async function pollLogin() {
    if (!authRequest?.device_request_id) return
    try {
      const result = await completeLeaderboardAuth(authRequest.device_request_id)
      if (result?.pending) return
      clearAuthPoll()
      authRequest = null
      await loadAuthStatus()
    } catch (e) {
      clearAuthPoll()
      authError = e instanceof Error ? e.message : 'Authorization failed'
    }
  }

  async function logout() {
    authBusy = true
    authError = ''
    try {
      await logoutLeaderboardAuth()
      await saveConfig({ leaderboardAutoUpload: false })
      autoUploadEnabled = false
      clearAuthPoll()
      authRequest = null
      await loadAuthStatus()
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Logout failed'
    } finally {
      authBusy = false
    }
  }

  async function uploadNow() {
    uploadBusy = true
    authError = ''
    uploadResult = null
    uploadSuccessMsg = ''
    if (uploadSuccessTimer) { clearTimeout(uploadSuccessTimer); uploadSuccessTimer = null }
    try {
      uploadResult = await uploadLeaderboardData()
      await loadAuthStatus()
      uploadSuccessMsg = $t('leaderboard.uploadSuccess')
      uploadSuccessTimer = setTimeout(() => { uploadSuccessMsg = '' }, 3000)
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Upload failed'
    } finally {
      uploadBusy = false
    }
  }

  async function updateAutoUpload(enabled = autoUploadEnabled, interval = autoUploadInterval) {
    autoUploadSaving = true
    authError = ''
    try {
      await saveConfig({
        leaderboardAutoUpload: enabled,
        leaderboardUploadInterval: Number(interval) || defaultAutoUploadInterval,
      })
      autoUploadEnabled = enabled
      autoUploadInterval = interval
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to update auto upload'
    } finally {
      autoUploadSaving = false
    }
  }

  onMount(async () => {
    const config = await fetchConfig().catch(() => null)
    if (config?.siteUrl) siteUrl = config.siteUrl
    if (config) {
      autoUploadEnabled = config.leaderboardAutoUpload === true
      autoUploadInterval = String(config.leaderboardUploadInterval || defaultAutoUploadInterval)
    }
    await loadAuthStatus()
  })

  onDestroy(() => {
    clearAuthPoll()
    if (uploadSuccessTimer) { clearTimeout(uploadSuccessTimer); uploadSuccessTimer = null }
  })
</script>

<svelte:head>
  <title>{$t('leaderboard.title')} — AIUsage</title>
</svelte:head>

<div class="page-header leaderboard-header">
  <div>
    <h1>{$t('leaderboard.title')}</h1>
    <p>{$t('leaderboard.desc')}</p>
  </div>
  <a class="site-link" href="{siteUrl}/leaderboard" target="_blank" rel="noopener">
    {$t('leaderboard.openSite')} ↗
  </a>
</div>

<section class="card status-card">
  {#if authLoading}
    <div class="state-msg">{$t('common.loading')}</div>
  {:else}
    <div class="status-grid">
      <div class="status-item">
        <span>{$t('leaderboard.account')}</span>
        {#if authStatus.loggedIn}
          <div class="account-line">
            {#if authStatus.user?.avatar_url}
              <img class="account-avatar" src={authStatus.user.avatar_url} alt="" width="28" height="28" />
            {:else}
              <span class="account-avatar fallback">{accountInitial}</span>
            {/if}
            <span class="account-copy">
              <strong>{accountName || $t('leaderboard.loggedIn')}</strong>
              {#if authStatus.user?.username && authStatus.user.username !== accountName}
                <small>@{authStatus.user.username}</small>
              {/if}
            </span>
          </div>
        {:else}
          <strong>{$t('leaderboard.notLoggedIn')}</strong>
        {/if}
      </div>
      <div class="status-item">
        <span>{$t('leaderboard.device')}</span>
        <strong title={authStatus.deviceId || ''}>{authStatus.loggedIn ? readableDeviceName : '-'}</strong>
      </div>
      <div class="status-item">
        <span>{$t('leaderboard.authorizedAt')}</span>
        <strong>{authStatus.loggedIn ? formatDate(authStatus.obtainedAt) : '-'}</strong>
      </div>
      <div class="status-item">
        <span>{$t('leaderboard.uploadStatus')}</span>
        <strong>{formatUploadStatus(recentUpload)}</strong>
        <small>{latestUploadTime ? formatDate(latestUploadTime) : $t('leaderboard.noUploadTime')}</small>
      </div>
      <div class="status-item">
        <span>{$t('leaderboard.nextUpload')}</span>
        <strong>{autoUploadEnabled ? (nextUploadTime ? formatDate(nextUploadTime) : $t('leaderboard.afterFirstUpload')) : $t('leaderboard.autoUploadOff')}</strong>
        <small>{autoUploadEnabled ? $t(selectedIntervalLabel) : $t('leaderboard.enableAutoUploadHint')}</small>
      </div>
    </div>
  {/if}
</section>

<section class="card local-panel">
  <div class="local-header">
    <div class="section-title">{$t('leaderboard.authTitle')}</div>
    <div class="local-actions">
      {#if authStatus.loggedIn}
        <button class="primary-action" on:click={uploadNow} disabled={uploadBusy || authLoading}>
          {uploadBusy ? $t('leaderboard.uploading') : $t('leaderboard.uploadInWeb')}
        </button>
        <button class="text-action" on:click={logout} disabled={authBusy || uploadBusy}>
          {$t('leaderboard.logout')}
        </button>
      {:else}
        <button class="primary-action" on:click={beginLogin} disabled={authBusy || authLoading}>
          {authBusy ? $t('leaderboard.authorizing') : $t('leaderboard.loginInWeb')}
        </button>
      {/if}
    </div>
  </div>

  {#if uploadSuccessMsg}
    <div class="upload-toast">{uploadSuccessMsg}</div>
  {/if}

  {#if !authLoading}
    <div class="auth-panel" class:logged-in={authStatus.loggedIn}>
      <span class="status-dot"></span>
      <div>
        <div class="auth-title">
          {authStatus.loggedIn ? (accountName || $t('leaderboard.loggedIn')) : $t('leaderboard.notLoggedIn')}
        </div>
        {#if authStatus.loggedIn}
          <div class="auth-meta">{readableDeviceName}</div>
        {:else}
          <div class="auth-meta">{$t('leaderboard.webLoginHint')}</div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="auto-upload-row">
    <label class="toggle-row">
      <input
        type="checkbox"
        checked={autoUploadEnabled}
        disabled={!authStatus.loggedIn || autoUploadSaving || authLoading}
        on:change={(event) => updateAutoUpload(event.currentTarget.checked)}
      />
      <span class="switch" aria-hidden="true"></span>
      <span>
        <strong>{$t('leaderboard.autoUpload')}</strong>
        <small>{authStatus.loggedIn ? $t('leaderboard.autoUploadHint') : $t('leaderboard.autoUploadRequiresLogin')}</small>
      </span>
    </label>
    <label class="interval-control">
      <span>{$t('leaderboard.uploadEvery')}</span>
      <select
        bind:value={autoUploadInterval}
        disabled={!authStatus.loggedIn || !autoUploadEnabled || autoUploadSaving}
        on:change={(event) => updateAutoUpload(autoUploadEnabled, event.currentTarget.value)}
      >
        {#each autoUploadIntervals as option}
          <option value={option.value}>{$t(option.labelKey)}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="auto-upload-meta">
    <div>
      <span>{$t('leaderboard.nextUpload')}</span>
      <strong>{autoUploadEnabled ? (nextUploadTime ? formatDate(nextUploadTime) : $t('leaderboard.afterFirstUpload')) : $t('leaderboard.autoUploadOff')}</strong>
    </div>
    <div>
      <span>{$t('leaderboard.uploadLimits')}</span>
      <strong>{$t('leaderboard.uploadLimitsSummary')}</strong>
    </div>
  </div>

  {#if recentUpload}
    <div class="upload-status">
      <span>{$t('leaderboard.lastUpload')}</span>
      <strong>{formatUploadStatus(recentUpload)}</strong>
      <span>{formatFullTokens(recentUpload.total_tokens)} tokens · {formatDate(recentUpload.created_at)}</span>
    </div>
  {/if}

  {#if authRequest}
    <div class="verify-box">
      <span>{$t('leaderboard.verifyCode')}</span>
      <strong class="mono">{authRequest.user_code}</strong>
      <a href={authRequest.verification_url} target="_blank" rel="noopener">
        {$t('leaderboard.openVerify')}
      </a>
    </div>
  {/if}

  {#if authError}
    <div class="state-msg error compact">{authError}</div>
  {/if}
</section>

<p class="privacy-note">{$t('leaderboard.privacy')}</p>

<style>
  .leaderboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }

  .site-link {
    min-height: 32px;
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .site-link:hover {
    color: var(--text);
    background: var(--raised);
  }

  .status-card {
    margin-bottom: 1rem;
    padding: 1rem 1.25rem;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .status-item {
    min-width: 0;
    padding: 0.75rem;
    border-radius: 6px;
    background: var(--raised);
  }

  .status-item span {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
  }

  .status-item strong {
    display: block;
    color: var(--text);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-item small {
    display: block;
    min-width: 0;
    margin-top: 0.25rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    overflow: hidden;
    line-height: 1.35;
  }

  .account-line {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .account-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
  }

  .account-avatar.fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 800;
  }

  .account-copy {
    min-width: 0;
    display: grid;
    gap: 0.125rem;
  }

  .account-copy small {
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Local panel (auth + upload) ─────────────────────────────────────── */
  .local-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 1rem 1.25rem;
  }

  .local-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .local-header .section-title {
    margin-bottom: 0;
  }

  .local-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .auth-panel,
  .verify-box,
  .upload-status {
    font-size: 0.8125rem;
  }

  .auth-panel {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }

  .auth-panel.logged-in .status-dot {
    background: var(--green);
  }

  .auth-title {
    color: var(--text);
    font-weight: 600;
  }

  .auth-meta {
    min-width: 0;
    margin-left: 0.5rem;
    color: var(--text-muted);
    line-height: 1.45;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .auto-upload-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0 0;
    border-top: 1px solid var(--border-subtle);
  }

  .auto-upload-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--border-subtle);
  }

  .auto-upload-meta div {
    min-width: 0;
    padding: 0.75rem;
    border-radius: 6px;
    background: var(--raised);
  }

  .auto-upload-meta span {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
  }

  .auto-upload-meta strong {
    display: block;
    color: var(--text);
    font-size: 0.8125rem;
    font-weight: 650;
    line-height: 1.45;
  }

  .toggle-row {
    display: flex;
    gap: 0.625rem;
    align-items: center;
    min-width: 0;
    cursor: pointer;
  }

  .toggle-row input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch {
    position: relative;
    width: 34px;
    height: 20px;
    border: 1px solid var(--border-medium);
    border-radius: 999px;
    background: var(--raised);
    transition: background 160ms ease, border-color 160ms ease;
    flex-shrink: 0;
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-secondary);
    transition: transform 160ms ease, background 160ms ease;
  }

  .toggle-row input:checked + .switch {
    border-color: var(--accent);
    background: var(--accent);
  }

  .toggle-row input:checked + .switch::after {
    background: oklch(0.99 0.002 175);
    transform: translateX(14px);
  }

  .toggle-row input:focus-visible + .switch {
    outline: 2px solid color-mix(in oklab, var(--accent) 40%, transparent);
    outline-offset: 2px;
  }

  .toggle-row input:disabled + .switch {
    opacity: 0.45;
  }

  .toggle-row strong {
    display: block;
    color: var(--text);
    font-size: 0.8125rem;
  }

  .toggle-row small {
    display: block;
    margin-top: 0.125rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .interval-control {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .interval-control select {
    min-height: 32px;
    padding: 0 1.875rem 0 0.625rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-secondary);
    font: inherit;
    cursor: pointer;
  }

  .interval-control select:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .upload-status,
  .verify-box {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
    border-radius: 6px;
    background: var(--raised);
    color: var(--text-muted);
  }

  .upload-status strong,
  .verify-box strong {
    color: var(--text);
  }

  .upload-toast {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: var(--green-dim);
    color: var(--green);
    font-size: 0.8125rem;
    font-weight: 600;
    animation: fadeIn 0.15s ease;
  }

  .verify-box a {
    width: fit-content;
    color: var(--accent);
    font-weight: 650;
    text-decoration: none;
  }

  .primary-action {
    min-width: 128px;
    min-height: 36px;
    padding: 0 0.875rem;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: white;
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
  }

  .text-action {
    min-height: 32px;
    padding: 0 0.5rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 650;
    cursor: pointer;
  }

  .text-action:hover {
    color: var(--text-secondary);
    background: var(--raised);
  }

  .primary-action:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  .text-action:disabled {
    cursor: progress;
    opacity: 0.55;
  }

  .compact {
    padding: 0.625rem 0;
  }

  /* ── Privacy footer ──────────────────────────────────────────────────── */
  .privacy-note {
    margin: 0;
    padding: 0.5rem 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  /* ── Mobile ──────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .leaderboard-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .status-grid {
      grid-template-columns: 1fr;
    }

    .local-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .local-actions {
      width: 100%;
    }

    .primary-action {
      width: 100%;
    }

    .auth-panel {
      flex-wrap: wrap;
    }

    .auto-upload-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .auto-upload-meta {
      grid-template-columns: 1fr;
    }

    .interval-control {
      justify-content: space-between;
      width: 100%;
    }

  }
</style>
