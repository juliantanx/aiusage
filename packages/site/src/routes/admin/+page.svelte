<script>
  import { onMount } from 'svelte'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  let activeTab = 'uploads'
  let loading = true
  let error = ''
  let actionFeedback = ''
  let actionError = ''
  let actionLoading = ''

  // Uploads
  let snapshots = []

  // Users
  let users = []
  let userSearch = ''
  let usersLoading = false

  // Pricing
  let priceTables = []
  let pricingLoading = false

  // Audit logs
  let auditLogs = []
  let logsLoading = false

  onMount(() => loadTab(activeTab))

  async function loadTab(tab) {
    activeTab = tab
    actionFeedback = ''
    actionError = ''
    if (tab === 'uploads' && snapshots.length === 0) await loadUploads()
    if (tab === 'users' && users.length === 0) await searchUsers()
    if (tab === 'pricing' && priceTables.length === 0) await loadPricing()
    if (tab === 'logs' && auditLogs.length === 0) await loadAuditLogs()
  }

  async function loadUploads() {
    loading = true
    const res = await fetch('/api/admin/uploads')
    if (res.status === 403 || res.status === 401) {
      error = res.status === 403
        ? (zh ? '无权访问，需要管理员权限。' : 'Access denied. Admin role required.')
        : (zh ? '请先登录。' : 'Please log in.')
      loading = false
      return
    }
    if (res.ok) snapshots = (await res.json()).snapshots || []
    loading = false
  }

  async function searchUsers() {
    usersLoading = true
    const q = userSearch.trim() ? `?q=${encodeURIComponent(userSearch.trim())}` : ''
    const res = await fetch(`/api/admin/users${q}`)
    if (res.ok) users = (await res.json()).users || []
    usersLoading = false
  }

  async function loadPricing() {
    pricingLoading = true
    const res = await fetch('/api/admin/pricing')
    if (res.ok) priceTables = (await res.json()).tables || []
    pricingLoading = false
  }

  async function loadAuditLogs() {
    logsLoading = true
    const res = await fetch('/api/admin/audit-logs')
    if (res.ok) auditLogs = (await res.json()).logs || []
    logsLoading = false
  }

  async function doAction(url, body = {}, successMsg = 'Done') {
    if (actionLoading) return false
    actionLoading = url
    actionError = ''
    actionFeedback = ''
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        actionFeedback = successMsg
        return true
      }
      const data = await res.json().catch(() => ({}))
      actionError = data.error || (zh ? '操作失败' : 'Operation failed')
      return false
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
      return false
    } finally {
      actionLoading = ''
    }
  }

  // Upload actions
  async function approveSnap(id) {
    if (await doAction(`/api/admin/uploads/${id}/approve`, {}, zh ? '快照已通过' : 'Snapshot approved'))
      snapshots = snapshots.filter(s => s.id !== id)
  }
  async function rejectSnap(id) {
    if (!confirm(zh ? '确认拒绝此快照？此操作不可撤回。' : 'Reject this snapshot? This cannot be undone.')) return
    if (await doAction(`/api/admin/uploads/${id}/reject`, {}, zh ? '快照已拒绝' : 'Snapshot rejected'))
      snapshots = snapshots.filter(s => s.id !== id)
  }
  async function hideSnap(id) {
    if (!confirm(zh ? '确认从排行榜隐藏此快照？' : 'Hide this snapshot from the leaderboard?')) return
    if (await doAction(`/api/admin/uploads/${id}/hide`, {}, zh ? '快照已隐藏' : 'Snapshot hidden'))
      snapshots = snapshots.filter(s => s.id !== id)
  }

  // User actions
  async function banUser(id, username) {
    const reason = prompt(zh ? `封禁 @${username} 的原因：` : `Reason for banning @${username}:`)
    if (!reason) return
    if (await doAction(`/api/admin/users/${id}/ban`, { reason }, zh ? `@${username} 已封禁` : `@${username} banned`))
      await searchUsers()
  }
  async function unbanUser(id, username) {
    if (await doAction(`/api/admin/users/${id}/unban`, {}, zh ? `@${username} 已解封` : `@${username} unbanned`))
      await searchUsers()
  }
  async function setRole(id, username, role) {
    if (!confirm(zh ? `确认将 @${username} 的角色改为 ${role}？` : `Change @${username}'s role to ${role}?`)) return
    if (await doAction(`/api/admin/users/${id}/role`, { role }, zh ? `@${username} 角色已设为 ${role}` : `@${username} role set to ${role}`))
      await searchUsers()
  }

  // Pricing actions
  async function seedPricing() {
    const version = prompt(zh ? '版本名称（例如 core_v2）：' : 'Version name (e.g. core_v2):')
    if (!version) return
    if (await doAction('/api/admin/pricing/seed', { version }, zh ? `价格表 "${version}" 已生成` : `Price table "${version}" seeded`))
      await loadPricing()
  }
  async function recomputeLeaderboard() {
    if (!confirm(zh ? '确认使用当前已发布价格表重算全部排行榜指标？' : 'Recompute all leaderboard metrics using the current published price table?')) return
    if (await doAction('/api/admin/leaderboard/recompute', {}, zh ? '排行榜已重算' : 'Leaderboard recomputed'))
      await loadPricing()
  }
  async function publishTable(id) {
    if (await doAction(`/api/admin/pricing/${id}/publish`, {}, zh ? '价格表已发布' : 'Price table published'))
      await loadPricing()
  }
  async function archiveTable(id) {
    if (!confirm(zh ? '确认归档此价格表？归档后不会再用于计算。' : 'Archive this price table? It will no longer be used for calculations.')) return
    if (await doAction(`/api/admin/pricing/${id}/archive`, {}, zh ? '价格表已归档' : 'Price table archived'))
      await loadPricing()
  }

  function formatTokens(n) {
    const num = Number(n)
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
    return num.toLocaleString()
  }

  function formatDate(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<svelte:head>
  <title>{zh ? '管理后台' : 'Admin'} — AIUsage</title>
</svelte:head>

<div class="admin-page">
  <div class="admin-container">
    <h1>{zh ? '管理后台' : 'Admin Dashboard'}</h1>

    {#if error}
      <div class="error-msg">{error}</div>
    {:else}
      <nav class="admin-tabs">
        <button class:active={activeTab === 'uploads'} on:click={() => loadTab('uploads')}>{zh ? '上传审核' : 'Uploads'}</button>
        <button class:active={activeTab === 'users'} on:click={() => loadTab('users')}>{zh ? '用户' : 'Users'}</button>
        <button class:active={activeTab === 'pricing'} on:click={() => loadTab('pricing')}>{zh ? '价格' : 'Pricing'}</button>
        <button class:active={activeTab === 'logs'} on:click={() => loadTab('logs')}>{zh ? '审计日志' : 'Audit Logs'}</button>
      </nav>

      {#if actionFeedback}
        <div class="success-msg">{actionFeedback}</div>
      {/if}
      {#if actionError}
        <div class="error-msg">{actionError}</div>
      {/if}

      <!-- Uploads Tab -->
      {#if activeTab === 'uploads'}
        <section class="admin-section">
          <h2>{zh ? '待审核上传' : 'Flagged Uploads'} ({snapshots.length})</h2>
          {#if loading}
            <p class="muted">{zh ? '加载中...' : 'Loading...'}</p>
          {:else if snapshots.length === 0}
            <p class="muted">{zh ? '暂无待审核上传。' : 'No flagged uploads pending review.'}</p>
          {:else}
            <div class="card-list">
              {#each snapshots as snap}
                <div class="card">
                  <div class="card-header">
                    <strong>{snap.display_name}</strong>
                    <span class="badge">{snap.period_type}</span>
                    <span class="mono accent">{formatTokens(snap.total_tokens)} tokens</span>
                  </div>
                  <div class="card-meta">
                    <span>{zh ? '设备' : 'Device'}: {snap.device_name}</span>
                    {#if snap.reason_code}<span>{zh ? '代码' : 'Code'}: {snap.reason_code}</span>{/if}
                    {#if snap.reason_message}<span>{snap.reason_message}</span>{/if}
                    <span>{formatDate(snap.created_at)}</span>
                  </div>
                  <div class="card-actions">
                    <button class="btn-approve" on:click={() => approveSnap(snap.id)} disabled={!!actionLoading}>{zh ? '通过' : 'Approve'}</button>
                    <button class="btn-reject" on:click={() => rejectSnap(snap.id)} disabled={!!actionLoading}>{zh ? '拒绝' : 'Reject'}</button>
                    <button class="btn-muted" on:click={() => hideSnap(snap.id)} disabled={!!actionLoading}>{zh ? '隐藏' : 'Hide'}</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Users Tab -->
      {#if activeTab === 'users'}
        <section class="admin-section">
          <h2>{zh ? '用户管理' : 'User Management'}</h2>
          <div class="search-bar">
            <input type="text" placeholder={zh ? '按用户名、名称或邮箱搜索用户...' : 'Search users by username, name, or email...'} bind:value={userSearch} on:keydown={(e) => e.key === 'Enter' && searchUsers()} />
            <button on:click={searchUsers} disabled={usersLoading}>{usersLoading ? (zh ? '搜索中...' : 'Searching...') : (zh ? '搜索' : 'Search')}</button>
          </div>
          {#if users.length === 0}
            <p class="muted">{usersLoading ? (zh ? '加载中...' : 'Loading...') : (zh ? '未找到用户。' : 'No users found.')}</p>
          {:else}
            <div class="card-list">
              {#each users as user}
                <div class="card">
                  <div class="card-header">
                    <strong>@{user.username}</strong>
                    <span class="muted-text">{user.display_name}</span>
                    <span class="badge" class:badge-warn={user.status === 'banned'} class:badge-ok={user.role === 'admin'}>{user.role}{user.status !== 'active' ? ` / ${user.status}` : ''}</span>
                  </div>
                  <div class="card-meta">
                    <span>{user.email}</span>
                    <span>{zh ? '加入时间' : 'Joined'} {formatDate(user.created_at)}</span>
                    {#if user.ban_reason}<span class="warn">{zh ? '原因' : 'Reason'}: {user.ban_reason}</span>{/if}
                  </div>
                  <div class="card-actions">
                    {#if user.status === 'active'}
                      <button class="btn-reject" on:click={() => banUser(user.id, user.username)} disabled={!!actionLoading}>{zh ? '封禁' : 'Ban'}</button>
                    {:else if user.status === 'banned'}
                      <button class="btn-approve" on:click={() => unbanUser(user.id, user.username)} disabled={!!actionLoading}>{zh ? '解封' : 'Unban'}</button>
                    {/if}
                    {#if user.role === 'user'}
                      <button class="btn-muted" on:click={() => setRole(user.id, user.username, 'admin')} disabled={!!actionLoading}>{zh ? '设为管理员' : 'Make Admin'}</button>
                    {:else if user.role === 'admin'}
                      <button class="btn-muted" on:click={() => setRole(user.id, user.username, 'user')} disabled={!!actionLoading}>{zh ? '移除管理员' : 'Remove Admin'}</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Pricing Tab -->
      {#if activeTab === 'pricing'}
        <section class="admin-section">
          <div class="section-header">
            <h2>{zh ? '官方价格表' : 'Official Price Tables'}</h2>
            <div style="display: flex; gap: 0.5rem">
              <button class="btn-muted" on:click={recomputeLeaderboard} disabled={!!actionLoading}>{zh ? '重算排行榜' : 'Recompute Leaderboard'}</button>
              <button class="btn-approve" on:click={seedPricing} disabled={!!actionLoading}>{zh ? '从 Core 生成' : 'Seed from Core'}</button>
            </div>
          </div>
          {#if pricingLoading}
            <p class="muted">{zh ? '加载中...' : 'Loading...'}</p>
          {:else if priceTables.length === 0}
            <p class="muted">{zh ? '暂无价格表。可从 core pricing 生成一份。' : 'No price tables. Seed from core pricing to create one.'}</p>
          {:else}
            <div class="card-list">
              {#each priceTables as pt}
                <div class="card">
                  <div class="card-header">
                    <strong>{pt.version}</strong>
                    <span class="badge" class:badge-ok={pt.status === 'published'} class:badge-warn={pt.status === 'draft'} class:badge-dim={pt.status === 'archived'}>{pt.status}</span>
                    <span class="muted-text">{pt.entry_count} {zh ? '条目' : 'entries'}</span>
                  </div>
                  <div class="card-meta">
                    <span>{zh ? '来源' : 'Source'}: {pt.source}</span>
                    <span>{zh ? '创建于' : 'Created'} {formatDate(pt.created_at)}</span>
                    {#if pt.published_at}<span>{zh ? '发布于' : 'Published'} {formatDate(pt.published_at)}</span>{/if}
                  </div>
                  <div class="card-actions">
                    {#if pt.status === 'draft'}
                      <button class="btn-approve" on:click={() => publishTable(pt.id)} disabled={!!actionLoading}>{zh ? '发布' : 'Publish'}</button>
                    {/if}
                    {#if pt.status !== 'archived'}
                      <button class="btn-muted" on:click={() => archiveTable(pt.id)} disabled={!!actionLoading}>{zh ? '归档' : 'Archive'}</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Audit Logs Tab -->
      {#if activeTab === 'logs'}
        <section class="admin-section">
          <h2>{zh ? '审计日志' : 'Audit Logs'}</h2>
          <button class="btn-muted" on:click={loadAuditLogs} disabled={logsLoading} style="margin-bottom: 1rem">
            {logsLoading ? (zh ? '加载中...' : 'Loading...') : (zh ? '刷新' : 'Refresh')}
          </button>
          {#if auditLogs.length === 0}
            <p class="muted">{logsLoading ? (zh ? '加载中...' : 'Loading...') : (zh ? '暂无审计日志。' : 'No audit logs found.')}</p>
          {:else}
            <div class="log-list">
              {#each auditLogs as log}
                <div class="log-entry">
                  <span class="log-action badge">{log.action}</span>
                  <span class="log-target">{log.target_type}/{log.target_id}</span>
                  <span class="muted-text">{log.admin_display_name}</span>
                  {#if log.reason}<span class="log-reason">{log.reason}</span>{/if}
                  <span class="log-time">{formatDate(log.created_at)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  .admin-page { padding: 2rem 0; }
  .admin-container { width: var(--content-width); margin: 0 auto; max-width: 1000px; }
  h1 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
  h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  .muted { color: var(--text-muted); }
  .muted-text { color: var(--text-muted); font-size: 0.875rem; }
  .mono { font-family: var(--mono); }
  .accent { color: var(--accent); font-weight: 600; }
  .warn { color: var(--rose); }

  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .success-msg { background: oklch(0.55 0.22 145 / 0.08); color: var(--green); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }

  .admin-tabs { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0; }
  .admin-tabs button { background: none; border: none; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .admin-tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .admin-tabs button:hover { color: var(--text-primary); }

  .admin-section { margin-bottom: 2rem; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }

  .card-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 1rem 1.25rem; }
  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.75rem; }
  .card-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .badge { font-family: var(--mono); font-size: 0.7rem; font-weight: 600; background: var(--raised); padding: 0.15rem 0.5rem; border-radius: 4px; text-transform: uppercase; }
  .badge-ok { color: var(--green); background: oklch(0.55 0.22 145 / 0.08); }
  .badge-warn { color: var(--rose); background: oklch(0.55 0.22 25 / 0.08); }
  .badge-dim { color: var(--text-muted); }

  .btn-approve, .btn-reject, .btn-muted { font-size: 0.8125rem; font-weight: 600; padding: 0.375rem 0.875rem; border-radius: 6px; cursor: pointer; transition: all 0.15s; border: 1px solid; }
  .btn-approve { color: var(--green); border-color: var(--green); background: transparent; }
  .btn-approve:hover { background: var(--green-dim); }
  .btn-reject { color: var(--rose); border-color: var(--rose); background: transparent; }
  .btn-reject:hover { background: oklch(0.55 0.22 25 / 0.06); }
  .btn-muted { color: var(--text-muted); border-color: var(--border-medium); background: transparent; }
  .btn-muted:hover { background: var(--hover); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .search-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .search-bar input { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--border-medium); border-radius: 6px; background: var(--surface); color: var(--text-primary); font-size: 0.875rem; }
  .search-bar button { padding: 0.5rem 1rem; border: 1px solid var(--border-medium); border-radius: 6px; background: var(--surface); color: var(--text-primary); font-weight: 600; font-size: 0.875rem; cursor: pointer; }

  .log-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .log-entry { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); font-size: 0.8125rem; flex-wrap: wrap; }
  .log-action { flex-shrink: 0; }
  .log-target { font-family: var(--mono); font-size: 0.75rem; color: var(--text-muted); max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log-reason { color: var(--text-secondary); font-style: italic; }
  .log-time { color: var(--text-muted); margin-left: auto; font-size: 0.75rem; }
</style>
