<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'
  $: user = $page.data.user

  let devices = []
  let uploads = []
  let loading = true
  let error = ''

  const periodOrder = ['daily', 'weekly', 'monthly', 'yearly', 'all_time']

  $: groupedUploads = (() => {
    const groups = new Map()
    for (const snap of uploads) {
      const key = snap.period_type
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(snap)
    }
    return periodOrder.filter(p => groups.has(p)).map(p => ({ type: p, items: groups.get(p) }))
  })()

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  onMount(async () => {
    if (!user) {
      loading = false
      return
    }

    try {
      const [devRes, uploadRes] = await Promise.all([
        fetch('/api/me/devices'),
        fetch('/api/me/leaderboard/uploads')
      ])

      if (!devRes.ok || !uploadRes.ok) {
        throw new Error('failed')
      }

      const [devData, uploadData] = await Promise.all([
        devRes.json(),
        uploadRes.json()
      ])
      devices = devData.devices
      uploads = uploadData.snapshots
    } catch {
      error = zh ? '上传状态暂时无法加载。' : 'Upload status is temporarily unavailable.'
    } finally {
      loading = false
    }
  })

  async function revokeDevice(id) {
    if (!confirm(zh ? '确定要撤销此设备？此操作不可撤回。' : 'Revoke this device? This cannot be undone.')) return

    const res = await fetch(`/api/me/devices/${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': getCsrfToken() }
    })
    if (res.ok) {
      devices = devices.map(d => d.id === id ? { ...d, status: 'revoked', revoked_at: new Date().toISOString() } : d)
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(zh ? 'zh-CN' : undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function periodLabel(type) {
    const labels = {
      daily: zh ? '今日' : 'Daily',
      weekly: zh ? '本周' : 'Weekly',
      monthly: zh ? '本月' : 'Monthly',
      yearly: zh ? '今年' : 'Yearly',
      all_time: zh ? '累计' : 'All time'
    }
    return labels[type] || type
  }
</script>

<svelte:head>
  <title>{zh ? '上传状态' : 'Upload Status'} — AIUsage</title>
</svelte:head>

<div class="uploads-page">
  <div class="uploads-container">
    {#if !user}
      <section class="empty-panel">
        <h2>{zh ? '需要登录' : 'Sign in required'}</h2>
        <p>{zh ? '登录后可以查看你的设备授权和上传历史。' : 'Sign in to view your device authorizations and upload history.'}</p>
        <a href="/login" class="btn primary">{zh ? '登录' : 'Sign in'}</a>
      </section>
    {:else if error}
      <div class="state error">{error}</div>
    {:else if loading}
      <div class="state">{zh ? '加载中...' : 'Loading...'}</div>
    {:else}
      <section class="uploads-section">
        <h2>{zh ? '已授权设备' : 'Authorized Devices'}</h2>
        <p class="section-desc">{zh ? '这些设备可以向公开排行榜提交聚合 Token 总量。' : 'These devices can submit aggregate token totals to the public leaderboard.'}</p>

        {#if devices.length === 0}
          <p class="muted">{zh ? '暂无已授权设备。运行' : 'No devices authorized yet. Run'} <code>npx @juliantanx/aiusage login</code> {zh ? '来授权设备。' : 'to authorize a device.'}</p>
        {:else}
          <div class="device-list">
            {#each devices as device}
              <div class="device-card" class:revoked={device.status === 'revoked'}>
                <div class="device-main">
                  <div>
                    <strong>{device.name}</strong>
                    <div class="device-meta">
                      <span>{zh ? '创建于' : 'Created'}: {formatDate(device.created_at)}</span>
                      {#if device.last_used_at}
                        <span>{zh ? '最后上传' : 'Last upload'}: {formatDate(device.last_used_at)}</span>
                      {/if}
                      {#if device.revoked_at}
                        <span>{zh ? '撤销于' : 'Revoked'}: {formatDate(device.revoked_at)}</span>
                      {/if}
                    </div>
                  </div>
                  <span class="device-status" class:active={device.status === 'active'} class:revoked-status={device.status === 'revoked'}>
                    {device.status === 'active' ? (zh ? '活跃' : 'active') : (zh ? '已撤销' : 'revoked')}
                  </span>
                </div>
                {#if device.status === 'active'}
                  <button class="btn-revoke" on:click={() => revokeDevice(device.id)}>{zh ? '撤销设备' : 'Revoke device'}</button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="uploads-section">
        <h2>{zh ? '上传历史' : 'Upload History'}</h2>
        <p class="section-desc">{zh ? '最近 100 条上传快照及其审核状态。' : 'The latest 100 upload snapshots and review states.'}</p>

        {#if uploads.length === 0}
          <p class="muted">{zh ? '暂无上传记录。运行' : 'No uploads yet. Run'} <code>npx @juliantanx/aiusage upload</code> {zh ? '提交快照。' : 'to submit snapshots.'}</p>
        {:else}
          {#each groupedUploads as group}
            <div class="period-group">
              <h3 class="period-group-title">{periodLabel(group.type)}</h3>
              <div class="upload-list">
                {#each group.items as snap}
                  <div class="upload-row">
                    <span class="upload-tokens">{Number(snap.total_tokens).toLocaleString()} tokens</span>
                    <span class="upload-device">{snap.device_name}</span>
                    <span class="upload-date">{formatDate(snap.created_at)}</span>
                    <span class="upload-status status-{snap.status}">{snap.status}</span>
                    {#if snap.reason_message}
                      <span class="upload-reason">{snap.reason_message}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .uploads-page { padding: 24px 0 64px; }
  .uploads-container { width: min(var(--content-width), 960px); margin: 0 auto; }
  .uploads-section { margin-bottom: 40px; }
  .uploads-section h2, .empty-panel h2 { margin: 0 0 6px; font-size: 1.125rem; font-weight: 650; }
  .section-desc, .muted, .empty-panel p { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
  .section-desc { margin: 0 0 16px; }
  .muted { margin: 0; }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 0 12px; border-radius: 6px; font-size: 0.8125rem; font-weight: 650; text-decoration: none; }
  .btn.primary { background: var(--accent); color: oklch(0.99 0.002 85); }
  .btn.secondary { border: 1px solid var(--border-medium); color: var(--text-secondary); background: transparent; }
  .empty-panel, .state { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 20px; }
  .empty-panel .btn { margin-top: 8px; }
  .state { color: var(--text-muted); font-size: 0.875rem; }
  .state.error { color: var(--rose); background: oklch(0.55 0.22 25 / 0.08); }
  .device-list { display: flex; flex-direction: column; gap: 12px; }
  .device-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; }
  .device-card.revoked { opacity: 0.64; }
  .device-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .device-meta { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 6px; color: var(--text-muted); font-size: 0.8125rem; }
  .device-status, .upload-status { flex-shrink: 0; font-size: 0.75rem; font-weight: 650; padding: 0.2rem 0.6rem; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .device-status.active, .status-accepted { background: var(--green-dim); color: var(--green); }
  .device-status.revoked-status, .status-rejected { background: var(--rose-dim); color: var(--rose); }
  .status-flagged { background: var(--amber-dim); color: var(--amber); }
  .btn-revoke { margin-top: 14px; font-size: 0.8125rem; font-weight: 650; color: var(--rose); background: transparent; border: 1px solid var(--rose); border-radius: 6px; padding: 0.375rem 0.875rem; cursor: pointer; transition: background 0.15s; }
  .btn-revoke:hover { background: var(--rose-dim); }
  .period-group { margin-bottom: 24px; }
  .period-group:last-child { margin-bottom: 0; }
  .period-group-title { font-size: 0.875rem; font-weight: 650; color: var(--text-secondary); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); }
  .upload-list { display: flex; flex-direction: column; gap: 8px; }
  .upload-row { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(120px, 0.8fr) minmax(150px, 0.9fr) auto; align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; font-size: 0.875rem; }
  .upload-tokens { font-family: var(--mono); }
  .upload-device, .upload-date, .upload-reason { color: var(--text-muted); font-size: 0.8125rem; }
  .upload-reason { grid-column: 2 / -1; }
  code { font-family: var(--mono); font-size: 0.8125rem; }

  @media (max-width: 760px) {
    .upload-row { grid-template-columns: 1fr auto; }
    .upload-tokens, .upload-device, .upload-date, .upload-reason { grid-column: 1 / -1; }
  }
</style>
