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

  // Stats
  let stats = { users: 0, flaggedUploads: 0, priceModels: 0, auditLogs: 0 }

  // Uploads
  let snapshots = []

  // Users
  let users = []
  let userTotal = 0
  let userSearch = ''
  let usersLoading = false
  let userPage = 0
  const userPageSize = 20

  // Pricing
  let priceEntries = []
  let originalEntries = {}
  let pricingLoading = false
  let priceSaving = false
  let priceSearch = ''
  let priceCurrency = 'USD'
  let addingModel = false
  let newModel = { model_key: '', input: null, output: null, cache_read: null, cache_write: null, currency: 'USD' }

  // Audit logs
  let auditLogs = []
  let logsLoading = false
  let logFilter = 'all'

  // Config
  let configs = {}
  let configCategories = []
  let configLoading = false
  let configSaving = false
  let configChanged = false
  let configSearch = ''

  $: tabList = [
    { id: 'uploads', label: zh ? '待审核' : 'Flagged', count: stats.flaggedUploads },
    { id: 'users', label: zh ? '用户' : 'Users', count: stats.users },
    { id: 'pricing', label: zh ? '价格表' : 'Pricing', count: stats.priceModels },
    { id: 'logs', label: zh ? '日志' : 'Logs', count: stats.auditLogs },
    { id: 'config', label: zh ? '配置' : 'Config', count: null },
  ]

  onMount(async () => {
    await Promise.all([loadStats(), loadTab(activeTab)])
  })

  async function loadStats() {
    const res = await fetch('/api/admin/stats')
    if (res.ok) stats = await res.json()
  }

  async function loadTab(tab) {
    activeTab = tab
    actionFeedback = ''
    actionError = ''
    if (tab === 'uploads' && snapshots.length === 0) await loadUploads()
    if (tab === 'users' && users.length === 0) await searchUsers(true)
    if (tab === 'pricing' && priceEntries.length === 0) await loadPricing()
    if (tab === 'logs' && auditLogs.length === 0) await loadAuditLogs()
    if (tab === 'config' && Object.keys(configs).length === 0) await loadConfigs()
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

  async function searchUsers(resetPage = true) {
    usersLoading = true
    if (resetPage) userPage = 0
    const params = new URLSearchParams()
    if (userSearch.trim()) params.set('q', userSearch.trim())
    params.set('limit', String(userPageSize))
    params.set('offset', String(userPage * userPageSize))
    const res = await fetch(`/api/admin/users?${params}`)
    if (res.ok) {
      const data = await res.json()
      users = data.users || []
      userTotal = data.total ?? users.length
    }
    usersLoading = false
  }

  $: userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize))

  async function goUserPage(page) {
    userPage = page
    await searchUsers(false)
  }

  async function loadPricing() {
    pricingLoading = true
    const res = await fetch('/api/admin/pricing')
    if (res.ok) {
      priceEntries = (await res.json()).entries || []
      snapshotPriceEntries()
    }
    pricingLoading = false
  }

  function snapshotPriceEntries() {
    originalEntries = {}
    for (const e of priceEntries) {
      originalEntries[e.id] = { input: e.input, output: e.output, cache_read: e.cache_read, cache_write: e.cache_write }
    }
  }

  function updateEntry(id, field, value) {
    priceEntries = priceEntries.map(e =>
      e.id === id ? { ...e, [field]: value === '' ? null : Number(value) } : e
    )
  }

  function isEntryDirty(entry) {
    const orig = originalEntries[entry.id]
    if (!orig) return false
    return String(entry.input) !== String(orig.input)
      || String(entry.output) !== String(orig.output)
      || String(entry.cache_read) !== String(orig.cache_read)
      || String(entry.cache_write) !== String(orig.cache_write)
  }

  $: dirtyEntries = priceEntries.filter(isEntryDirty)
  $: hasPriceChanges = dirtyEntries.length > 0

  async function savePriceChanges() {
    if (priceSaving || dirtyEntries.length === 0) return
    priceSaving = true
    actionError = ''
    actionFeedback = ''
    const updates = dirtyEntries.map(e => ({
      id: e.id,
      input: Number(e.input) || 0,
      output: Number(e.output) || 0,
      cache_read: e.cache_read != null ? Number(e.cache_read) : null,
      cache_write: e.cache_write != null ? Number(e.cache_write) : null,
    }))
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ updates })
      })
      if (res.ok) {
        actionFeedback = zh ? `已保存 ${updates.length} 条价格` : `Saved ${updates.length} price(s)`
        snapshotPriceEntries()
        priceEntries = [...priceEntries]
      } else {
        const data = await res.json().catch(() => ({}))
        actionError = data.error || (zh ? '保存失败' : 'Save failed')
      }
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
    } finally {
      priceSaving = false
    }
  }

  async function addNewModel() {
    if (!newModel.model_key.trim()) return
    actionError = ''
    actionFeedback = ''
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify(newModel)
      })
      if (res.ok) {
        actionFeedback = zh ? `已添加 ${newModel.model_key}` : `Added ${newModel.model_key}`
        newModel = { model_key: '', input: null, output: null, cache_read: null, cache_write: null, currency: 'USD' }
        addingModel = false
        await loadPricing()
      } else {
        const data = await res.json().catch(() => ({}))
        actionError = data.error || (zh ? '添加失败' : 'Add failed')
      }
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
    }
  }

  async function deleteEntry(entry) {
    if (!confirm(zh ? `确认删除模型 ${entry.model_key}？` : `Delete model ${entry.model_key}?`)) return
    actionError = ''
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ entry_id: entry.id, model_key: entry.model_key })
      })
      if (res.ok) {
        priceEntries = priceEntries.filter(e => e.id !== entry.id)
        actionFeedback = zh ? `已删除 ${entry.model_key}` : `Deleted ${entry.model_key}`
      } else {
        const data = await res.json().catch(() => ({}))
        actionError = data.error || (zh ? '删除失败' : 'Delete failed')
      }
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
    }
  }

  $: filteredEntries = priceEntries.filter(e => {
    if (priceCurrency !== 'all' && (e.currency || 'USD') !== priceCurrency) return false
    if (priceSearch.trim() && !e.model_key.toLowerCase().includes(priceSearch.toLowerCase())) return false
    return true
  })

  function formatPrice(v) {
    if (v === null || v === undefined) return ''
    const n = Number(v)
    if (n === 0) return '0'
    if (n < 0.01) return n.toFixed(4)
    return n.toFixed(2)
  }

  async function loadAuditLogs() {
    logsLoading = true
    const res = await fetch('/api/admin/audit-logs')
    if (res.ok) auditLogs = (await res.json()).logs || []
    logsLoading = false
  }

  // Group audit log actions into categories
  const LOG_CATEGORIES = {
    user: ['ban_user', 'unban_user', 'set_role', 'set_cloud_sync'],
    upload: ['approve_snapshot', 'reject_snapshot', 'hide_snapshot'],
    leaderboard: ['hide_metric', 'restore_metric'],
    pricing: ['sync_pricing', 'update_price_entries', 'add_price_entry', 'delete_price_entry'],
    system: ['clear_audit_logs'],
  }

  function getLogCategory(action) {
    for (const [cat, actions] of Object.entries(LOG_CATEGORIES)) {
      if (actions.includes(action)) return cat
    }
    return 'other'
  }

  function getLogCategoryLabel(cat) {
    const labels = {
      user: zh ? '用户管理' : 'User Management',
      upload: zh ? '上传审核' : 'Upload Review',
      leaderboard: zh ? '排行榜' : 'Leaderboard',
      pricing: zh ? '价格管理' : 'Pricing',
      system: zh ? '系统' : 'System',
      other: zh ? '其他' : 'Other',
    }
    return labels[cat] || cat
  }

  $: logCategories = (() => {
    const cats = new Set(['all'])
    for (const log of auditLogs) {
      cats.add(getLogCategory(log.action))
    }
    return [...cats]
  })()

  $: filteredLogs = logFilter === 'all'
    ? auditLogs
    : auditLogs.filter(l => getLogCategory(l.action) === logFilter)

  async function clearLogs() {
    if (!confirm(zh ? '确认清空所有审计日志？此操作不可撤回。' : 'Clear all audit logs? This cannot be undone.')) return
    actionError = ''
    actionFeedback = ''
    try {
      const res = await fetch('/api/admin/audit-logs', {
        method: 'DELETE',
        headers: { 'x-csrf-token': getCsrfToken() },
      })
      if (res.ok) {
        const data = await res.json()
        actionFeedback = zh ? `已清空 ${data.deleted} 条日志` : `Cleared ${data.deleted} log(s)`
        auditLogs = []
        await loadStats()
      } else {
        const data = await res.json().catch(() => ({}))
        actionError = data.error || (zh ? '清空失败' : 'Clear failed')
      }
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
    }
  }

  async function loadConfigs() {
    configLoading = true
    const res = await fetch('/api/admin/config')
    if (res.ok) {
      const data = await res.json()
      configs = data.configs || {}
      configCategories = data.categories || []
    }
    configLoading = false
    configChanged = false
  }

  function setConfigValue(key, value) {
    configs = { ...configs, [key]: { ...configs[key], value } }
    configChanged = true
  }

  async function saveConfigs() {
    if (configSaving) return
    configSaving = true
    actionError = ''
    actionFeedback = ''
    const toSave = {}
    for (const [key, entry] of Object.entries(configs)) {
      toSave[key] = entry.value
    }
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ configs: toSave })
      })
      if (res.ok) {
        actionFeedback = zh ? '配置已保存' : 'Config saved'
        configChanged = false
      } else {
        const data = await res.json().catch(() => ({}))
        actionError = data.error || (zh ? '保存失败' : 'Save failed')
      }
    } catch {
      actionError = zh ? '网络错误' : 'Network error'
    } finally {
      configSaving = false
    }
  }

  function resetConfigToDefault(key) {
    const entry = configs[key]
    if (entry) {
      configs = { ...configs, [key]: { ...entry, value: entry.default } }
      configChanged = true
    }
  }

  // Filter configs by search, respecting category grouping
  $: filteredConfigCategories = configCategories
    .map(cat => {
      const keys = cat.keys.filter(key => {
        const entry = configs[key]
        if (!entry) return false
        if (!configSearch.trim()) return true
        const q = configSearch.toLowerCase()
        return key.toLowerCase().includes(q)
          || (entry.description || '').toLowerCase().includes(q)
          || (entry.description_zh || '').includes(configSearch)
      })
      return { ...cat, keys }
    })
    .filter(cat => cat.keys.length > 0)

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
    if (await doAction(`/api/admin/uploads/${id}/approve`, {}, zh ? '快照已通过' : 'Snapshot approved')) {
      snapshots = snapshots.filter(s => s.id !== id)
      stats = { ...stats, flaggedUploads: Math.max(0, stats.flaggedUploads - 1) }
    }
  }
  async function rejectSnap(id) {
    if (!confirm(zh ? '确认拒绝此快照？此操作不可撤回。' : 'Reject this snapshot? This cannot be undone.')) return
    if (await doAction(`/api/admin/uploads/${id}/reject`, {}, zh ? '快照已拒绝' : 'Snapshot rejected')) {
      snapshots = snapshots.filter(s => s.id !== id)
      stats = { ...stats, flaggedUploads: Math.max(0, stats.flaggedUploads - 1) }
    }
  }
  async function hideSnap(id) {
    if (!confirm(zh ? '确认从排行榜隐藏此快照？' : 'Hide this snapshot from the leaderboard?')) return
    if (await doAction(`/api/admin/uploads/${id}/hide`, {}, zh ? '快照已隐藏' : 'Snapshot hidden')) {
      snapshots = snapshots.filter(s => s.id !== id)
      stats = { ...stats, flaggedUploads: Math.max(0, stats.flaggedUploads - 1) }
    }
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

  async function toggleCloudSync(id, username, currentValue) {
    const enabled = !currentValue
    if (await doAction(`/api/admin/users/${id}/cloud-sync`, { enabled }, zh ? `@${username} Cloud Sync ${enabled ? '已开启' : '已关闭'}` : `@${username} Cloud Sync ${enabled ? 'enabled' : 'disabled'}`))
      await searchUsers()
  }

  // Pricing actions
  async function syncPricing() {
    if (!confirm(zh ? '从 Core 同步最新价格？已有模型会更新，新模型会添加。' : 'Sync latest prices from Core? Existing models will be updated, new ones added.')) return
    if (await doAction('/api/admin/pricing/sync', {}, zh ? '价格已同步' : 'Prices synced'))
      await loadPricing()
  }
  async function recomputeLeaderboard() {
    if (!confirm(zh ? '确认使用当前价格表重算全部排行榜指标？' : 'Recompute all leaderboard metrics using the current price table?')) return
    await doAction('/api/admin/leaderboard/recompute', {}, zh ? '排行榜已重算' : 'Leaderboard recomputed')
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

  function dismissFeedback() {
    actionFeedback = ''
  }
  function dismissError() {
    actionError = ''
  }
</script>

<svelte:head>
  <title>{zh ? '管理后台' : 'Admin'} — AIUsage</title>
</svelte:head>

<div class="admin-page">
  <div class="admin-container">
    <header class="page-header">
      <h1>{zh ? '管理后台' : 'Admin'}</h1>
    </header>

    {#if error}
      <div class="notice notice-error">{error}</div>
    {:else}
      <!-- Tab navigation -->
      <div class="tab-bar" role="tablist">
        {#each tabList as tab}
          <button
            class="tab"
            class:tab-active={activeTab === tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            on:click={() => loadTab(tab.id)}
          >
            <span class="tab-text">{tab.label}</span>
            {#if tab.count !== null}
              <span class="tab-count">{tab.count}</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Feedback notices -->
      {#if actionFeedback}
        <div class="notice notice-success">
          <span>{actionFeedback}</span>
          <button class="notice-dismiss" on:click={dismissFeedback} aria-label="Dismiss">&times;</button>
        </div>
      {/if}
      {#if actionError}
        <div class="notice notice-error">
          <span>{actionError}</span>
          <button class="notice-dismiss" on:click={dismissError} aria-label="Dismiss">&times;</button>
        </div>
      {/if}

      <div class="tab-content">
        <!-- Uploads -->
        {#if activeTab === 'uploads'}
          {#if loading}
            <div class="empty">{zh ? '加载中...' : 'Loading...'}</div>
          {:else if snapshots.length === 0}
            <div class="empty">
              <p class="empty-title">{zh ? '没有待审核的快照' : 'No flagged uploads'}</p>
              <p class="empty-desc">{zh ? '所有上传都已审核完毕。新的可疑上传会出现在这里。' : 'All uploads have been reviewed. Suspicious uploads will appear here.'}</p>
            </div>
          {:else}
            <div class="list">
              {#each snapshots as snap}
                <div class="list-item">
                  <div class="list-item-body">
                    <div class="list-item-top">
                      <span class="list-item-name">{snap.display_name}</span>
                      <span class="badge">{snap.period_type}</span>
                      <span class="mono">{formatTokens(snap.total_tokens)} tokens</span>
                    </div>
                    <div class="list-item-sub">
                      <span>{snap.device_name}</span>
                      {#if snap.reason_code}<span class="sep">{snap.reason_code}</span>{/if}
                      {#if snap.reason_message}<span class="sep">{snap.reason_message}</span>{/if}
                      <span class="sep">{formatDate(snap.created_at)}</span>
                    </div>
                  </div>
                  <div class="list-item-actions">
                    <button class="btn btn-success" on:click={() => approveSnap(snap.id)} disabled={!!actionLoading}>{zh ? '通过' : 'Approve'}</button>
                    <button class="btn btn-danger" on:click={() => rejectSnap(snap.id)} disabled={!!actionLoading}>{zh ? '拒绝' : 'Reject'}</button>
                    <button class="btn btn-ghost" on:click={() => hideSnap(snap.id)} disabled={!!actionLoading}>{zh ? '隐藏' : 'Hide'}</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- Users -->
        {#if activeTab === 'users'}
          <div class="toolbar">
            <div class="search-wrap">
              <input
                type="text"
                class="search-input"
                placeholder={zh ? '搜索用户名、名称或邮箱...' : 'Search username, name, or email...'}
                bind:value={userSearch}
                on:keydown={(e) => e.key === 'Enter' && searchUsers()}
              />
              <button class="btn btn-ghost" on:click={searchUsers} disabled={usersLoading}>
                {usersLoading ? '...' : (zh ? '搜索' : 'Search')}
              </button>
            </div>
            <span class="toolbar-meta mono">{userTotal} {zh ? '用户' : 'users'}</span>
          </div>
          {#if users.length === 0}
            <div class="empty">
              <p class="empty-title">{usersLoading ? (zh ? '加载中...' : 'Loading...') : (zh ? '未找到用户' : 'No users found')}</p>
              {#if !usersLoading}
                <p class="empty-desc">{zh ? '尝试修改搜索条件。' : 'Try adjusting your search terms.'}</p>
              {/if}
            </div>
          {:else}
            <div class="list">
              {#each users as user}
                <div class="list-item">
                  <div class="list-item-body">
                    <div class="list-item-top">
                      <span class="list-item-name">@{user.username}</span>
                      {#if user.display_name}
                        <span class="text-muted">{user.display_name}</span>
                      {/if}
                      <span class="badge" class:badge-success={user.role === 'admin'} class:badge-danger={user.status === 'banned'}>
                        {user.role}{user.status !== 'active' ? ` / ${user.status}` : ''}
                      </span>
                      {#if user.github_starred}
                        <span class="badge badge-star" title={zh ? '已 Star GitHub 仓库' : 'Starred on GitHub'}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
                          <span>Star</span>
                        </span>
                      {/if}
                    </div>
                    <div class="list-item-sub">
                      <span>{user.email}</span>
                      {#if user.github_username}
                        <span class="sep">
                          <svg class="gh-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
                          {user.github_username}
                        </span>
                      {/if}
                      <span class="sep">{zh ? '加入' : 'Joined'} {formatDate(user.created_at)}</span>
                      {#if user.ban_reason}<span class="sep text-danger">{user.ban_reason}</span>{/if}
                    </div>
                  </div>
                  <div class="list-item-actions">
                    <label class="toggle-label" title={zh ? 'Cloud Sync' : 'Cloud Sync'}>
                      <input type="checkbox" checked={user.cloud_sync_enabled} on:change={() => toggleCloudSync(user.id, user.username, user.cloud_sync_enabled)} disabled={!!actionLoading} />
                      <span class="toggle-text">Cloud</span>
                    </label>
                    {#if user.status === 'active'}
                      <button class="btn btn-danger" on:click={() => banUser(user.id, user.username)} disabled={!!actionLoading}>{zh ? '封禁' : 'Ban'}</button>
                    {:else if user.status === 'banned'}
                      <button class="btn btn-success" on:click={() => unbanUser(user.id, user.username)} disabled={!!actionLoading}>{zh ? '解封' : 'Unban'}</button>
                    {/if}
                    <button class="btn btn-ghost btn-role" on:click={() => setRole(user.id, user.username, user.role === 'user' ? 'admin' : 'user')} disabled={!!actionLoading}>
                      {user.role === 'user' ? (zh ? '设为管理员' : 'Make admin') : (zh ? '取消管理' : 'Demote')}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            <!-- Pagination -->
            {#if userTotalPages > 1}
              <div class="pagination">
                <button class="btn btn-ghost btn-xs" on:click={() => goUserPage(userPage - 1)} disabled={userPage === 0 || usersLoading}>&lsaquo;</button>
                <span class="pagination-info mono">{userPage + 1} / {userTotalPages}</span>
                <button class="btn btn-ghost btn-xs" on:click={() => goUserPage(userPage + 1)} disabled={userPage >= userTotalPages - 1 || usersLoading}>&rsaquo;</button>
              </div>
            {/if}
          {/if}
        {/if}

        <!-- Pricing -->
        {#if activeTab === 'pricing'}
          {#if pricingLoading}
            <div class="empty">{zh ? '加载中...' : 'Loading...'}</div>
          {:else if priceEntries.length === 0}
            <div class="empty">
              <p class="empty-title">{zh ? '暂无价格数据' : 'No pricing data'}</p>
              <p class="empty-desc">{zh ? '从 Core 同步以导入模型价格。' : 'Sync from Core to import model prices.'}</p>
              <button class="btn btn-primary" style="margin-top: 0.75rem" on:click={syncPricing} disabled={!!actionLoading}>{zh ? '从 Core 同步' : 'Sync from Core'}</button>
            </div>
          {:else}
            <div class="toolbar">
              <div class="search-wrap">
                <input
                  type="text"
                  class="search-input"
                  placeholder={zh ? '搜索模型...' : 'Search models...'}
                  bind:value={priceSearch}
                />
                <div class="currency-filter">
                  <button class="cur-btn" class:cur-active={priceCurrency === 'all'} on:click={() => priceCurrency = 'all'}>{zh ? '全部' : 'All'}</button>
                  <button class="cur-btn" class:cur-active={priceCurrency === 'USD'} on:click={() => priceCurrency = 'USD'}>USD</button>
                  <button class="cur-btn" class:cur-active={priceCurrency === 'CNY'} on:click={() => priceCurrency = 'CNY'}>CNY</button>
                </div>
              </div>
              <div class="toolbar-actions">
                {#if hasPriceChanges}
                  <button class="btn btn-primary" on:click={savePriceChanges} disabled={priceSaving}>
                    {priceSaving ? '...' : (zh ? `保存 (${dirtyEntries.length})` : `Save (${dirtyEntries.length})`)}
                  </button>
                {/if}
                <button class="btn btn-ghost" on:click={() => { addingModel = !addingModel; if (addingModel) { newModel = { ...newModel, currency: priceCurrency === 'all' ? 'USD' : priceCurrency } } }}>{addingModel ? (zh ? '取消' : 'Cancel') : (zh ? '添加模型' : 'Add model')}</button>
                <button class="btn btn-ghost" on:click={recomputeLeaderboard} disabled={!!actionLoading}>{zh ? '重算排行榜' : 'Recompute'}</button>
                <button class="btn btn-ghost" on:click={syncPricing} disabled={!!actionLoading}>{zh ? '从 Core 同步' : 'Sync from Core'}</button>
              </div>
            </div>

            {#if addingModel}
              <div class="add-model-form">
                <input type="text" class="add-model-input model-key-input" placeholder={zh ? '模型名称' : 'Model key'} bind:value={newModel.model_key} />
                <input type="number" class="add-model-input price-input" placeholder={zh ? '输入价格' : 'Input'} bind:value={newModel.input} step="0.01" />
                <input type="number" class="add-model-input price-input" placeholder={zh ? '输出价格' : 'Output'} bind:value={newModel.output} step="0.01" />
                <input type="number" class="add-model-input price-input" placeholder={zh ? '缓存读取' : 'Cache Read'} bind:value={newModel.cache_read} step="0.001" />
                <input type="number" class="add-model-input price-input" placeholder={zh ? '缓存写入' : 'Cache Write'} bind:value={newModel.cache_write} step="0.001" />
                <select class="add-model-input currency-select" bind:value={newModel.currency}>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
                <button class="btn btn-primary" on:click={addNewModel} disabled={!newModel.model_key.trim()}>{zh ? '添加' : 'Add'}</button>
              </div>
            {/if}

            <div class="price-table-wrap">
              <table class="price-table">
                <thead>
                  <tr>
                    <th class="col-model">{zh ? '模型' : 'Model'}</th>
                    <th class="col-price">{zh ? '输入' : 'Input'}</th>
                    <th class="col-price">{zh ? '输出' : 'Output'}</th>
                    <th class="col-price">{zh ? '缓存读取' : 'Cache Read'}</th>
                    <th class="col-price">{zh ? '缓存写入' : 'Cache Write'}</th>
                    <th class="col-currency">{zh ? '货币' : 'Currency'}</th>
                    <th class="col-del"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredEntries as entry (entry.id)}
                    <tr class:row-dirty={isEntryDirty(entry)}>
                      <td class="mono col-model">{entry.model_key}</td>
                      <td class="col-price"><input type="number" class="cell-input" value={formatPrice(entry.input)} on:change={(e) => updateEntry(entry.id, 'input', e.target.value)} step="0.01" /></td>
                      <td class="col-price"><input type="number" class="cell-input" value={formatPrice(entry.output)} on:change={(e) => updateEntry(entry.id, 'output', e.target.value)} step="0.01" /></td>
                      <td class="col-price"><input type="number" class="cell-input" value={formatPrice(entry.cache_read)} on:change={(e) => updateEntry(entry.id, 'cache_read', e.target.value)} step="0.001" placeholder="-" /></td>
                      <td class="col-price"><input type="number" class="cell-input" value={formatPrice(entry.cache_write)} on:change={(e) => updateEntry(entry.id, 'cache_write', e.target.value)} step="0.001" placeholder="-" /></td>
                      <td class="col-currency text-muted">{entry.currency || 'USD'}</td>
                      <td class="col-del"><button class="btn-delete" on:click={() => deleteEntry(entry)} title={zh ? '删除' : 'Delete'}>&times;</button></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if priceSearch && filteredEntries.length === 0}
              <div class="empty">
                <p class="empty-title">{zh ? '未找到匹配的模型' : 'No matching models'}</p>
              </div>
            {/if}
          {/if}
        {/if}

        <!-- Audit Logs -->
        {#if activeTab === 'logs'}
          <div class="toolbar">
            <div class="log-filter-wrap">
              <button class="cur-btn" class:cur-active={logFilter === 'all'} on:click={() => logFilter = 'all'}>{zh ? '全部' : 'All'}</button>
              {#each logCategories.filter(c => c !== 'all') as cat}
                <button class="cur-btn" class:cur-active={logFilter === cat} on:click={() => logFilter = cat}>{getLogCategoryLabel(cat)}</button>
              {/each}
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" on:click={loadAuditLogs} disabled={logsLoading}>
                {logsLoading ? '...' : (zh ? '刷新' : 'Refresh')}
              </button>
              {#if auditLogs.length > 0}
                <button class="btn btn-danger" on:click={clearLogs} disabled={logsLoading}>{zh ? '清空' : 'Clear'}</button>
              {/if}
            </div>
          </div>
          {#if auditLogs.length === 0}
            <div class="empty">
              <p class="empty-title">{logsLoading ? (zh ? '加载中...' : 'Loading...') : (zh ? '暂无审计日志' : 'No audit logs')}</p>
              {#if !logsLoading}
                <p class="empty-desc">{zh ? '管理操作的记录会出现在这里。' : 'Records of admin actions will appear here.'}</p>
              {/if}
            </div>
          {:else if filteredLogs.length === 0}
            <div class="empty">
              <p class="empty-title">{zh ? '该分类暂无日志' : 'No logs in this category'}</p>
            </div>
          {:else}
            <table class="log-table">
              <thead>
                <tr>
                  <th>{zh ? '操作' : 'Action'}</th>
                  <th>{zh ? '目标' : 'Target'}</th>
                  <th>{zh ? '操作人' : 'By'}</th>
                  <th>{zh ? '原因' : 'Reason'}</th>
                  <th class="col-right">{zh ? '时间' : 'Time'}</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredLogs as log}
                  <tr>
                    <td><span class="badge">{log.action}</span></td>
                    <td class="mono text-muted">{log.target_type}/{log.target_id}</td>
                    <td class="text-muted">{log.admin_display_name}</td>
                    <td class="text-secondary">{log.reason || '-'}</td>
                    <td class="col-right mono text-muted">{formatDate(log.created_at)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}

        <!-- Config -->
        {#if activeTab === 'config'}
          <div class="toolbar">
            <div class="search-wrap">
              <input
                type="text"
                class="search-input"
                placeholder={zh ? '搜索配置项...' : 'Search config...'}
                bind:value={configSearch}
              />
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" on:click={loadConfigs} disabled={configLoading}>
                {configLoading ? '...' : (zh ? '重置' : 'Reset')}
              </button>
              <button class="btn btn-primary" on:click={saveConfigs} disabled={!configChanged || configSaving}>
                {configSaving ? '...' : (zh ? '保存更改' : 'Save Changes')}
              </button>
            </div>
          </div>
          {#if configLoading}
            <div class="empty">{zh ? '加载中...' : 'Loading...'}</div>
          {:else if filteredConfigCategories.length === 0}
            <div class="empty">
              <p class="empty-title">{zh ? '未找到配置' : 'No configs found'}</p>
              <p class="empty-desc">{zh ? '尝试修改搜索条件。' : 'Try adjusting your search terms.'}</p>
            </div>
          {:else}
            <div class="config-list">
              {#each filteredConfigCategories as cat}
                <div class="config-category">
                  <h3 class="config-category-title">{zh ? cat.label_zh : cat.label}</h3>
                  <div class="config-category-items">
                    {#each cat.keys as key}
                      {#if configs[key]}
                        {@const entry = configs[key]}
                        <div class="config-row" class:config-modified={entry.value !== entry.default}>
                          <div class="config-info">
                            {#if (zh ? entry.description_zh : entry.description)}
                              <span class="config-desc">{zh ? entry.description_zh : entry.description}</span>
                            {:else}
                              <code class="config-key">{key}</code>
                            {/if}
                            <span class="config-meta mono">{key} &middot; {zh ? '默认' : 'default'} {entry.default}{#if entry.value !== entry.default}{' '}<button class="config-reset-link" on:click={() => resetConfigToDefault(key)}>{zh ? '恢复' : 'reset'}</button>{/if}</span>
                          </div>
                          <div class="config-control">
                            <input
                              type="number"
                              class="config-input"
                              value={entry.value}
                              on:input={(e) => setConfigValue(key, Number(e.target.value))}
                              step={entry.value % 1 === 0 ? 1 : 0.01}
                            />
                            <span class="config-unit">{(zh ? entry.unit_zh : entry.unit) || ''}</span>
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Page layout ────────────────────────────────────────────────────────── */
  .admin-page {
    padding: 2rem 0 3rem;
  }

  .admin-container {
    width: var(--content-width);
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* ── Tabs ────────────────────────────────────────────────────────────────── */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 1.25rem;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--text-secondary);
  }

  .tab-active {
    color: var(--text);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }

  .tab-count {
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: var(--raised);
    padding: 0.0625rem 0.375rem;
    border-radius: 10px;
    color: var(--text-muted);
  }

  .tab-active .tab-count {
    background: var(--accent-dim);
    color: var(--accent);
  }

  /* ── Notices ─────────────────────────────────────────────────────────────── */
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    margin-bottom: 1rem;
  }

  .notice-success {
    background: oklch(0.58 0.18 155 / 0.07);
    color: var(--green);
  }

  .notice-error {
    background: oklch(0.55 0.22 25 / 0.07);
    color: var(--rose);
  }

  .notice-dismiss {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .notice-dismiss:hover {
    opacity: 1;
  }

  /* ── Tab content ────────────────────────────────────────────────────────── */
  .tab-content {
    min-height: 200px;
  }

  /* ── Empty states ────────────────────────────────────────────────────────── */
  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .empty-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .empty-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.375rem;
  }

  .toolbar-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-left: auto;
  }

  .search-wrap {
    display: flex;
    gap: 0.375rem;
    flex: 1;
    max-width: 360px;
  }

  .search-input {
    flex: 1;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.8125rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  /* ── List items ──────────────────────────────────────────────────────────── */
  .list {
    display: flex;
    flex-direction: column;
  }

  .list-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .list-item:last-child {
    border-bottom: none;
  }

  .list-item-body {
    flex: 1;
    min-width: 0;
  }

  .list-item-top {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .list-item-name {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--text);
  }

  .list-item-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  .list-item-sub .sep::before {
    content: ' \00B7 ';
    margin: 0 0.125rem;
  }

  .list-item-sub .sep:first-child::before {
    content: none;
  }

  .list-item-actions {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    flex-shrink: 0;
    padding-top: 0.125rem;
  }

  /* ── Pagination ───────────────────────────────────────────────────────────── */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 0 0.25rem;
  }

  .pagination-info {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* ── Badges ──────────────────────────────────────────────────────────────── */
  .badge {
    display: inline-block;
    font-family: var(--mono, monospace);
    font-size: 0.625rem;
    font-weight: 600;
    background: var(--raised);
    color: var(--text-muted);
    padding: 0.125rem 0.4rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    vertical-align: baseline;
  }

  .badge-success {
    color: var(--green);
    background: oklch(0.58 0.18 155 / 0.08);
  }

  .badge-danger {
    color: var(--rose);
    background: oklch(0.55 0.22 25 / 0.08);
  }

  .badge-github {
    color: oklch(0.72 0.02 250);
    background: oklch(0.72 0.02 250 / 0.08);
    text-transform: none;
  }

  .badge-star {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: oklch(0.62 0.16 85);
    background: oklch(0.75 0.14 85 / 0.1);
    font-family: var(--mono, monospace);
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    vertical-align: baseline;
  }

  .badge-star svg {
    flex-shrink: 0;
  }

  .gh-icon {
    vertical-align: -1px;
    opacity: 0.6;
    margin-right: 0.125rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .toggle-text { white-space: nowrap; }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3rem 0.625rem;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    border: 1px solid;
    white-space: nowrap;
    line-height: 1.4;
  }

  .btn-primary {
    color: oklch(0.99 0.002 85);
    background: var(--accent);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .btn-success {
    color: var(--green);
    border-color: var(--green);
    background: transparent;
  }

  .btn-success:hover {
    background: oklch(0.58 0.18 155 / 0.06);
  }

  .btn-danger {
    color: var(--rose);
    border-color: var(--rose);
    background: transparent;
  }

  .btn-danger:hover {
    background: oklch(0.55 0.22 25 / 0.06);
  }

  .btn-ghost {
    color: var(--text-muted);
    border-color: var(--border-subtle);
    background: transparent;
  }

  .btn-ghost:hover {
    background: var(--hover);
    color: var(--text-secondary);
  }

  .btn-xs {
    font-size: 0.6875rem;
    padding: 0.125rem 0.4rem;
  }

  .btn-role {
    min-width: 6rem;
    text-align: center;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Price table ──────────────────────────────────────────────────────────── */
  .price-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .price-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    table-layout: fixed;
  }

  .price-table th {
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    padding: 0.5rem 0.5rem;
    border-bottom: 1px solid var(--border-medium);
    white-space: nowrap;
  }

  .price-table td {
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
    color: var(--text);
    white-space: nowrap;
  }

  .price-table .col-model {
    width: auto;
    text-align: left;
  }

  .price-table .col-price {
    width: 120px;
    text-align: right;
  }

  .price-table .col-currency {
    width: 56px;
    text-align: center;
  }

  .price-table .col-del {
    width: 32px;
    text-align: center;
  }

  .price-table tbody tr:last-child td {
    border-bottom: none;
  }

  .price-table tbody tr:hover td {
    background: var(--hover);
  }

  .cell-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.2rem 0.375rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-family: var(--mono, monospace);
    font-size: 0.75rem;
    text-align: right;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
  }

  .cell-input:hover {
    border-color: var(--border-subtle);
  }

  .cell-input:focus {
    border-color: var(--accent);
    background: var(--surface);
  }

  .cell-input::placeholder {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .row-dirty td {
    background: oklch(0.52 0.14 165 / 0.04);
  }

  .btn-delete {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .price-table tbody tr:hover .btn-delete {
    opacity: 0.6;
  }

  .btn-delete:hover {
    opacity: 1 !important;
    color: var(--rose);
  }

  /* ── Add model form ──────────────────────────────────────────────────────── */
  .add-model-form {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    padding: 0.625rem 0.75rem;
    background: var(--raised);
    border-radius: 6px;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .add-model-input {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.75rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .add-model-input:focus {
    border-color: var(--accent);
  }

  .model-key-input {
    width: 200px;
    font-family: var(--mono, monospace);
  }

  .price-input {
    width: 100px;
    font-family: var(--mono, monospace);
    text-align: right;
  }

  .currency-select {
    width: 64px;
  }

  /* ── Currency/log filter ─────────────────────────────────────────────────── */
  .currency-filter,
  .log-filter-wrap {
    display: flex;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .log-filter-wrap {
    flex-wrap: wrap;
  }

  .cur-btn {
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .cur-btn:not(:last-child) {
    border-right: 1px solid var(--border-subtle);
  }

  .cur-btn:hover {
    background: var(--hover);
    color: var(--text-secondary);
  }

  .cur-active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .cur-active:hover {
    background: var(--accent-dim);
    color: var(--accent);
  }

  /* ── Log table ───────────────────────────────────────────────────────────── */
  .log-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .log-table th {
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-medium);
  }

  .log-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
    color: var(--text);
  }

  .log-table tbody tr:last-child td {
    border-bottom: none;
  }

  .log-table tbody tr:hover td {
    background: var(--hover);
  }

  .col-right {
    text-align: right;
  }

  /* ── Config list ─────────────────────────────────────────────────────────── */
  .config-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .config-category-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-medium);
    margin-bottom: 0;
  }

  .config-category-items {
    display: flex;
    flex-direction: column;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle);
    min-height: 2.25rem;
  }

  .config-row:last-child {
    border-bottom: none;
  }

  .config-modified {
    background: oklch(0.52 0.14 165 / 0.03);
    margin: 0 -0.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    border-radius: 4px;
  }

  .config-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .config-key {
    font-family: var(--mono, monospace);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
  }

  .config-desc {
    font-size: 0.8125rem;
    color: var(--text);
    line-height: 1.4;
  }

  .config-meta {
    font-size: 0.6875rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-reset-link {
    background: none;
    border: none;
    color: var(--accent);
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
  }

  .config-reset-link:hover {
    text-decoration-color: var(--accent);
  }

  .config-control {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
    width: 160px;
  }

  .config-input {
    width: 96px;
    flex-shrink: 0;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font-family: var(--mono, monospace);
    font-size: 0.8125rem;
    text-align: right;
    outline: none;
    transition: border-color 0.15s;
  }

  .config-input:focus {
    border-color: var(--accent);
  }

  .config-unit {
    font-family: var(--mono, monospace);
    font-size: 0.6875rem;
    color: var(--text-muted);
    width: 40px;
    text-align: left;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Utility classes ─────────────────────────────────────────────────────── */
  .mono {
    font-family: var(--mono, monospace);
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
  }

  .text-muted {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .text-secondary {
    color: var(--text-secondary);
  }

  .text-danger {
    color: var(--rose);
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .admin-page {
      padding: 1.25rem 0 2rem;
    }

    .tab-bar {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .tab {
      padding: 0.5rem 0.75rem;
      white-space: nowrap;
    }

    .list-item {
      flex-direction: column;
      gap: 0.5rem;
    }

    .list-item-actions {
      padding-top: 0;
    }

    .toolbar {
      flex-wrap: wrap;
    }

    .search-wrap {
      max-width: 100%;
      order: 10;
      width: 100%;
    }

    .config-row {
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .config-control {
      width: 100%;
      justify-content: flex-start;
    }

    .log-table {
      font-size: 0.6875rem;
    }

    .log-table th,
    .log-table td {
      padding: 0.375rem 0.5rem;
    }

    .price-table {
      table-layout: auto;
    }
  }
</style>
