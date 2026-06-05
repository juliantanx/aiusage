<script>
  import { onDestroy, onMount } from 'svelte'
  import {
    completeLeaderboardAuth,
    fetchConfig,
    fetchLeaderboard,
    fetchLeaderboardAuthStatus,
    logoutLeaderboardAuth,
    saveConfig,
    startLeaderboardAuth,
    uploadLeaderboardData,
  } from '$lib/api.js'
  import { t } from '$lib/i18n.js'

  const periods = ['daily', 'weekly', 'monthly', 'yearly', 'all_time']

  let activePeriod = 'daily'
  let activePeriodStart = ''
  let siteUrl = 'https://aiusage.jtanx.com'
  let data = null
  let loading = true
  let loadingMore = false
  let error = ''
  let authLoading = true
  let authBusy = false
  let authError = ''
  let authStatus = { loggedIn: false, uploads: [] }
  let authRequest = null
  let authPollTimer = null
  let uploadBusy = false
  let uploadResult = null
  let autoUploadEnabled = false
  let autoUploadInterval = '86400000'
  let autoUploadSaving = false

  const autoUploadIntervals = [
    { value: '43200000', labelKey: 'leaderboard.autoUploadIntervals.twelveHours' },
    { value: '86400000', labelKey: 'leaderboard.autoUploadIntervals.daily' },
    { value: '604800000', labelKey: 'leaderboard.autoUploadIntervals.weekly' },
  ]

  $: rows = data?.entries || []
  $: leaders = rows.slice(0, 3)
  $: canGoNext = activePeriod !== 'all_time' && activePeriodStart && activePeriodStart < getCurrentPeriodStart(activePeriod)
  $: recentUpload = authStatus?.uploads?.[0] || null
  $: uploadSummary = uploadResult?.response?.snapshots
    ? {
        accepted: uploadResult.response.snapshots.filter(s => s.status === 'accepted').length,
        flagged: uploadResult.response.snapshots.filter(s => s.status === 'flagged').length,
        rejected: uploadResult.response.snapshots.filter(s => s.status === 'rejected').length,
      }
    : null

  function getCurrentPeriodStart(periodType) {
    const now = new Date()
    switch (periodType) {
      case 'daily':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
      case 'weekly': {
        const day = now.getUTCDay()
        const diff = day === 0 ? 6 : day - 1
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)).toISOString()
      }
      case 'monthly':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      case 'yearly':
        return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
      case 'all_time':
        return '1970-01-01T00:00:00.000Z'
      default:
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    }
  }

  function shiftPeriodStart(periodStart, periodType, direction) {
    const d = new Date(periodStart)
    switch (periodType) {
      case 'daily':
        d.setUTCDate(d.getUTCDate() + direction)
        break
      case 'weekly':
        d.setUTCDate(d.getUTCDate() + direction * 7)
        break
      case 'monthly':
        d.setUTCMonth(d.getUTCMonth() + direction)
        break
      case 'yearly':
        d.setUTCFullYear(d.getUTCFullYear() + direction)
        break
    }
    return d.toISOString()
  }

  function formatPeriodLabel(periodStart, periodType) {
    const d = new Date(periodStart)
    if (!Number.isFinite(d.getTime())) return ''
    switch (periodType) {
      case 'daily':
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      case 'weekly': {
        const end = new Date(d)
        end.setUTCDate(end.getUTCDate() + 6)
        const fmt = { month: 'short', day: 'numeric', timeZone: 'UTC' }
        return `${d.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`
      }
      case 'monthly':
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' })
      case 'yearly':
        return d.toLocaleDateString(undefined, { year: 'numeric', timeZone: 'UTC' })
      default:
        return ''
    }
  }

  function syncUrl() {
    const params = new URLSearchParams(window.location.search)
    if (activePeriod !== 'daily') params.set('period', activePeriod)
    else params.delete('period')
    const currentStart = getCurrentPeriodStart(activePeriod)
    if (activePeriodStart && activePeriodStart !== currentStart) params.set('period_start', activePeriodStart)
    else params.delete('period_start')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? '?' + qs : ''}`)
  }

  function formatFullTokens(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n.toLocaleString() : '0'
  }

  function formatDate(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function avatarText(name) {
    return (name || 'A').trim().charAt(0).toUpperCase()
  }

  async function loadLeaderboard(cursor) {
    const more = Boolean(cursor)
    if (more) loadingMore = true
    else {
      loading = true
      data = null
    }
    error = ''

    try {
      const next = await fetchLeaderboard(siteUrl, {
        period_type: activePeriod,
        period_start: activePeriodStart || undefined,
        cursor,
      })
      data = more && data
        ? { ...next, entries: [...data.entries, ...next.entries] }
        : next
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load leaderboard'
    } finally {
      loading = false
      loadingMore = false
    }
  }

  function switchPeriod(period) {
    if (period === activePeriod || loading) return
    activePeriod = period
    activePeriodStart = getCurrentPeriodStart(period)
    syncUrl()
    loadLeaderboard()
  }

  function goToPeriod(direction) {
    if (activePeriod === 'all_time') return
    if (direction === 1 && !canGoNext) return
    activePeriodStart = shiftPeriodStart(activePeriodStart, activePeriod, direction)
    const currentStart = getCurrentPeriodStart(activePeriod)
    if (activePeriodStart > currentStart) activePeriodStart = currentStart
    syncUrl()
    loadLeaderboard()
  }

  function loadMore() {
    if (data?.next_cursor) loadLeaderboard(data.next_cursor)
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
    try {
      uploadResult = await uploadLeaderboardData()
      await Promise.all([loadAuthStatus(), loadLeaderboard()])
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
        leaderboardUploadInterval: Number(interval) || 86400000,
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
    const params = new URLSearchParams(window.location.search)
    const periodParam = params.get('period')
    const periodStartParam = params.get('period_start')
    if (periodParam && ['daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(periodParam)) {
      activePeriod = periodParam
    }
    activePeriodStart = periodStartParam || getCurrentPeriodStart(activePeriod)

    const config = await fetchConfig().catch(() => null)
    if (config?.siteUrl) siteUrl = config.siteUrl
    if (config) {
      autoUploadEnabled = config.leaderboardAutoUpload === true
      autoUploadInterval = String(config.leaderboardUploadInterval || 86400000)
    }
    await Promise.all([loadLeaderboard(), loadAuthStatus()])
  })

  onDestroy(clearAuthPoll)
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

<div class="period-tabs" aria-label={$t('leaderboard.period')}>
  {#each periods as period}
    <button class="period-tab" class:active={activePeriod === period} on:click={() => switchPeriod(period)}>
      {$t(`leaderboard.periods.${period}`)}
    </button>
  {/each}
</div>

{#if activePeriod !== 'all_time'}
  <div class="period-nav">
    <button class="nav-arrow" on:click={() => goToPeriod(-1)}>←</button>
    <span class="period-label">{formatPeriodLabel(activePeriodStart, activePeriod)}</span>
    <button class="nav-arrow" on:click={() => goToPeriod(1)} disabled={!canGoNext}>→</button>
  </div>
{/if}

{#if leaders.length > 0}
  <div class="leaders">
    {#each leaders as entry}
      <div class="leader">
        <span class="leader-rank">#{entry.rank}</span>
        {#if entry.avatar_url}
          <img src={entry.avatar_url} alt="" class="leader-avatar" />
        {:else}
          <span class="leader-avatar placeholder">{avatarText(entry.display_name)}</span>
        {/if}
        <span class="leader-name">{entry.display_name}</span>
        <span class="leader-tokens mono">{formatFullTokens(entry.total_tokens)}</span>
      </div>
    {/each}
  </div>
{/if}

<section class="card leaderboard-card">
  <div class="table-meta">
    <span>{$t(`leaderboard.periods.${activePeriod}`)}</span>
    <span>{$t('leaderboard.showing')} {rows.length}</span>
  </div>

  {#if error}
    <div class="state-msg error">{error}</div>
  {:else if loading}
    <div class="state-msg">{$t('common.loading')}</div>
  {:else if rows.length === 0}
    <div class="state-msg">{$t('leaderboard.noEntries')}</div>
  {:else}
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{$t('leaderboard.user')}</th>
            <th class="num">Tokens</th>
            <th class="num updated">{$t('leaderboard.updated')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as entry}
            <tr class:top={entry.rank <= 3}>
              <td class="mono muted-rank">#{entry.rank}</td>
              <td>
                <span class="user-cell">
                  {#if entry.avatar_url}
                    <img src={entry.avatar_url} alt="" class="avatar" />
                  {:else}
                    <span class="avatar placeholder">{avatarText(entry.display_name)}</span>
                  {/if}
                  <span class="user-name">{entry.display_name}</span>
                </span>
              </td>
              <td class="mono num">{formatFullTokens(entry.total_tokens)}</td>
              <td class="num updated">{formatDate(entry.updated_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if data.next_cursor}
      <button class="load-more" on:click={loadMore} disabled={loadingMore}>
        {loadingMore ? $t('leaderboard.loadingMore') : $t('leaderboard.loadMore')}
      </button>
    {/if}
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

  {#if !authLoading}
    <div class="auth-panel" class:logged-in={authStatus.loggedIn}>
      <span class="status-dot"></span>
      <div>
        <div class="auth-title">
          {authStatus.loggedIn ? $t('leaderboard.loggedIn') : $t('leaderboard.notLoggedIn')}
        </div>
        {#if authStatus.loggedIn}
          <div class="auth-meta mono">{authStatus.deviceId}</div>
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

  {#if recentUpload}
    <div class="upload-status">
      <span>{$t('leaderboard.lastUpload')}</span>
      <strong>{recentUpload.period_type} · {recentUpload.status}</strong>
      <span>{formatFullTokens(recentUpload.total_tokens)} tokens</span>
    </div>
  {/if}

  {#if uploadSummary}
    <div class="upload-status result">
      <span>{$t('leaderboard.uploadResult')}</span>
      <strong>{uploadSummary.accepted} / {uploadSummary.flagged} / {uploadSummary.rejected}</strong>
      <span>{$t('leaderboard.uploadResultHint')}</span>
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

  .period-tabs {
    display: flex;
    gap: 0.25rem;
    width: fit-content;
    max-width: 100%;
    margin-bottom: 1rem;
    padding: 0.25rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--surface);
    overflow-x: auto;
  }

  .period-tab {
    min-height: 30px;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }

  .period-tab:hover {
    color: var(--text);
    background: var(--raised);
  }

  .period-tab.active {
    color: var(--accent);
    background: var(--accent-dim);
  }

  /* ── Period navigation ───────────────────────────────────────────────── */
  .period-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .nav-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .nav-arrow:hover:not(:disabled) {
    background: var(--raised);
    color: var(--text);
  }

  .nav-arrow:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .period-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
    min-width: 120px;
    text-align: center;
  }

  /* ── Leaders podium ──────────────────────────────────────────────────── */
  .leaders {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .leader {
    display: grid;
    grid-template-columns: auto 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
    min-height: 56px;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--surface);
  }

  .leader-rank,
  .leader-tokens {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .leader-avatar,
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .leader-avatar {
    width: 32px;
    height: 32px;
  }

  .placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--raised);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 750;
  }

  .leader-name,
  .user-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  /* ── Leaderboard table ───────────────────────────────────────────────── */
  .leaderboard-card {
    padding: 0;
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  .table-meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .table-scroll {
    overflow-x: auto;
  }

  th,
  td {
    white-space: nowrap;
  }

  .num {
    text-align: right;
  }

  .muted-rank {
    color: var(--text-muted);
    font-weight: 650;
  }

  tr.top {
    background: color-mix(in oklab, var(--accent) 6%, transparent);
  }

  .user-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .load-more {
    display: block;
    margin: 1rem auto;
    min-height: 32px;
    padding: 0 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-weight: 650;
    cursor: pointer;
  }

  .load-more:hover {
    color: var(--text);
    background: var(--raised);
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

    .leaders {
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

    .interval-control {
      justify-content: space-between;
      width: 100%;
    }

    .updated {
      display: none;
    }
  }
</style>
