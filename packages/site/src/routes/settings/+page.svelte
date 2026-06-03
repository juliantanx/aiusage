<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'

  let devices = []
  let uploads = []
  let loading = true
  let me = null
  let editUsername = ''
  let editDisplayName = ''
  let avatarUploading = false
  let avatarPreviewSrc = ''
  let fileInput
  let profileMsg = ''
  let profileError = ''
  let profileSaving = false

  let currentPassword = ''
  let newPassword = ''
  let confirmPassword = ''
  let pwMsg = ''
  let pwError = ''
  let pwSaving = false

  const COOLDOWN_DAYS = 30

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
  }

  $: usernameCanChange = (() => {
    if (!me?.username_changed_at) return true
    const cooldownEnd = new Date(new Date(me.username_changed_at).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    return cooldownEnd <= new Date()
  })()

  $: usernameCooldownDate = (() => {
    if (!me?.username_changed_at) return null
    const cooldownEnd = new Date(new Date(me.username_changed_at).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    return cooldownEnd > new Date() ? cooldownEnd : null
  })()

  const errorMessages = {
    username_length: { zh: '用户名需要 3-32 个字符', en: 'Username must be 3-32 characters' },
    username_format: { zh: '用户名只能包含字母、数字、连字符和下划线', en: 'Username can only contain letters, numbers, hyphens, and underscores' },
    username_taken: { zh: '该用户名已被使用', en: 'Username is already taken' },
    username_reserved: { zh: '该用户名暂时被保留', en: 'Username is temporarily reserved' },
    username_cooldown: { zh: '用户名修改冷却中', en: 'Username change is in cooldown' },
    display_name_length: { zh: '显示名称需要 1-64 个字符', en: 'Display name must be 1-64 characters' },
    network_error: { zh: '网络错误', en: 'Network error' },
    passwords_mismatch: { zh: '两次输入的密码不一致', en: 'Passwords do not match' },
  }

  function getError(key) {
    const msg = errorMessages[key]
    return msg ? (zh ? msg.zh : msg.en) : key
  }

  onMount(async () => {
    const [meRes, devRes, uploadRes] = await Promise.all([
      fetch('/api/me'),
      fetch('/api/me/devices'),
      fetch('/api/me/leaderboard/uploads')
    ])
    if (meRes.ok) {
      me = await meRes.json()
      editUsername = me.username || ''
      editDisplayName = me.display_name || ''
      avatarPreviewSrc = me.avatar_url || ''
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

  function triggerFileSelect() {
    fileInput?.click()
  }

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      profileError = zh ? '文件太大（最大 5MB）' : 'File too large (max 5MB)'
      return
    }

    avatarPreviewSrc = URL.createObjectURL(file)
    avatarUploading = true
    profileError = ''

    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await fetch('/api/me/avatar', {
        method: 'POST',
        headers: { 'x-csrf-token': getCsrfToken() },
        body: formData
      })
      const data = await res.json()
      if (res.ok) {
        avatarPreviewSrc = data.avatar_url
        me = { ...me, avatar_url: data.avatar_url }
        profileMsg = zh ? '头像已更新' : 'Avatar updated'
      } else {
        avatarPreviewSrc = me?.avatar_url || ''
        profileError = data.error || (zh ? '上传失败' : 'Failed to upload avatar')
      }
    } catch {
      avatarPreviewSrc = me?.avatar_url || ''
      profileError = getError('network_error')
    } finally {
      avatarUploading = false
      if (fileInput) fileInput.value = ''
    }
  }

  async function handleAvatarRemove() {
    avatarUploading = true
    profileError = ''
    try {
      const res = await fetch('/api/me/avatar', {
        method: 'DELETE',
        headers: { 'x-csrf-token': getCsrfToken() }
      })
      if (res.ok) {
        avatarPreviewSrc = ''
        me = { ...me, avatar_url: null }
        profileMsg = zh ? '头像已移除' : 'Avatar removed'
      }
    } catch {
      profileError = getError('network_error')
    } finally {
      avatarUploading = false
    }
  }

  async function handleProfileSave() {
    profileMsg = ''
    profileError = ''
    profileSaving = true
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({
          username: editUsername,
          display_name: editDisplayName
        })
      })
      const data = await res.json()
      if (res.ok) {
        profileMsg = zh ? '资料已更新' : 'Profile updated'
        me = { ...me, username: data.username, display_name: data.display_name, username_changed_at: data.username_changed_at }
      } else {
        profileError = getError(data.error_key || data.error)
      }
    } catch {
      profileError = getError('network_error')
    } finally {
      profileSaving = false
    }
  }

  async function handlePasswordSave() {
    pwMsg = ''
    pwError = ''
    if (newPassword !== confirmPassword) {
      pwError = getError('passwords_mismatch')
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
        pwMsg = zh ? '密码已更新' : 'Password updated successfully'
        currentPassword = ''
        newPassword = ''
        confirmPassword = ''
        if (me) me = { ...me, has_password: true }
      } else {
        pwError = data.error || (zh ? '更新失败' : 'Failed to update password')
      }
    } catch {
      pwError = getError('network_error')
    } finally {
      pwSaving = false
    }
  }

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
    return new Date(iso).toLocaleDateString(zh ? 'zh-CN' : undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<svelte:head>
  <title>{zh ? '设置' : 'Settings'} — AIUsage</title>
</svelte:head>

<div class="settings-page">
  <div class="settings-container">
    <h1>{zh ? '设置' : 'Settings'}</h1>

    {#if $page.url.searchParams.get('bound')}
      <div class="success-msg">{zh ? '已成功关联' : 'Successfully linked'} {$page.url.searchParams.get('bound')} {zh ? '账号' : 'account'}!</div>
    {/if}

    {#if me}
      <section class="settings-section">
        <h2>{zh ? '个人资料' : 'Profile'}</h2>
        <p class="section-desc">{zh ? '更新你的公开资料信息。' : 'Update your public profile information.'}</p>

        {#if profileMsg}
          <div class="success-msg">{profileMsg}</div>
        {/if}
        {#if profileError}
          <div class="error-msg">{profileError}</div>
        {/if}

        <div class="profile-avatar-section">
          <div class="avatar-preview" class:uploading={avatarUploading}>
            {#if avatarPreviewSrc}
              <img src={avatarPreviewSrc} alt="Avatar" />
            {:else}
              <span class="avatar-placeholder">{(editDisplayName || editUsername || '?')[0].toUpperCase()}</span>
            {/if}
            {#if avatarUploading}
              <div class="avatar-spinner"></div>
            {/if}
          </div>
          <div class="avatar-actions">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" bind:this={fileInput} on:change={handleAvatarSelect} hidden />
            <button type="button" class="btn-secondary" on:click={triggerFileSelect} disabled={avatarUploading}>
              {avatarPreviewSrc ? (zh ? '更换' : 'Change') : (zh ? '上传' : 'Upload')}
            </button>
            {#if avatarPreviewSrc}
              <button type="button" class="btn-text-danger" on:click={handleAvatarRemove} disabled={avatarUploading}>
                {zh ? '移除' : 'Remove'}
              </button>
            {/if}
            <span class="avatar-hint">{zh ? 'JPEG、PNG、WebP 或 GIF，最大 5MB。' : 'JPEG, PNG, WebP, or GIF. Max 5MB.'}</span>
          </div>
        </div>

        <form class="profile-form" on:submit|preventDefault={handleProfileSave}>
          <div class="field">
            <label for="edit-username">{zh ? '用户名' : 'Username'}</label>
            <input id="edit-username" type="text" bind:value={editUsername} required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]+" disabled={!usernameCanChange} />
            {#if usernameCooldownDate}
              <span class="field-hint field-hint-warn">
                {zh
                  ? `用户名每 ${COOLDOWN_DAYS} 天只能修改一次，${formatDate(usernameCooldownDate.toISOString())} 后可再次修改。`
                  : `Username can only be changed once every ${COOLDOWN_DAYS} days. Available after ${formatDate(usernameCooldownDate.toISOString())}.`}
              </span>
            {:else}
              <span class="field-hint">
                {zh
                  ? `修改后旧用户名将被保留 ${COOLDOWN_DAYS} 天，期间他人无法使用。`
                  : `After changing, your old username will be reserved for ${COOLDOWN_DAYS} days.`}
              </span>
            {/if}
          </div>
          <div class="field">
            <label for="edit-display-name">{zh ? '显示名称' : 'Display Name'}</label>
            <input id="edit-display-name" type="text" bind:value={editDisplayName} required minlength="1" maxlength="64" />
          </div>
          <div class="field">
            <label for="profile-email">{zh ? '邮箱' : 'Email'}</label>
            <input id="profile-email" type="email" value={me.email} disabled />
            <span class="field-hint">{zh ? '邮箱暂不支持修改。' : 'Email cannot be changed yet.'}</span>
          </div>
          <button type="submit" class="btn-primary" disabled={profileSaving}>
            {profileSaving ? (zh ? '保存中...' : 'Saving...') : (zh ? '保存资料' : 'Save Profile')}
          </button>
        </form>
      </section>

      <section class="settings-section">
        <h2>{me.has_password ? (zh ? '修改密码' : 'Change Password') : (zh ? '设置密码' : 'Set Password')}</h2>
        <p class="section-desc">
          {me.has_password
            ? (zh ? '更新你的账号密码。' : 'Update your account password.')
            : (zh ? '设置密码后可使用用户名或邮箱登录。' : 'Set a password so you can also sign in with your username or email.')}
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
              <label for="current-pw">{zh ? '当前密码' : 'Current Password'}</label>
              <input id="current-pw" type="password" bind:value={currentPassword} required autocomplete="current-password" />
            </div>
          {/if}
          <div class="field">
            <label for="new-pw">{zh ? '新密码' : 'New Password'}</label>
            <input id="new-pw" type="password" bind:value={newPassword} required minlength="8" autocomplete="new-password" />
          </div>
          <div class="field">
            <label for="confirm-pw">{zh ? '确认密码' : 'Confirm Password'}</label>
            <input id="confirm-pw" type="password" bind:value={confirmPassword} required minlength="8" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn-primary" disabled={pwSaving}>
            {pwSaving ? (zh ? '保存中...' : 'Saving...') : me.has_password ? (zh ? '更新密码' : 'Update Password') : (zh ? '设置密码' : 'Set Password')}
          </button>
        </form>
      </section>
    {/if}

    <section class="settings-section">
      <h2>{zh ? '已授权设备' : 'Authorized Devices'}</h2>
      <p class="section-desc">{zh ? '已授权上传 Token 数据到排行榜的设备。' : 'Devices authorized to upload token data to the leaderboard.'}</p>

      {#if loading}
        <p class="muted">{zh ? '加载中...' : 'Loading...'}</p>
      {:else if devices.length === 0}
        <p class="muted">{zh ? '暂无已授权设备。运行' : 'No devices authorized yet. Run'} <code>aiusage login</code> {zh ? '来授权设备。' : 'to authorize a device.'}</p>
      {:else}
        <div class="device-list">
          {#each devices as device}
            <div class="device-card" class:revoked={device.status === 'revoked'}>
              <div class="device-info">
                <strong>{device.name}</strong>
                <span class="device-status" class:active={device.status === 'active'} class:revoked-status={device.status === 'revoked'}>
                  {device.status === 'active' ? (zh ? '活跃' : 'active') : (zh ? '已撤销' : 'revoked')}
                </span>
              </div>
              <div class="device-meta">
                <span>{zh ? '创建于' : 'Created'}: {formatDate(device.created_at)}</span>
                {#if device.last_used_at}
                  <span>{zh ? '最后上传' : 'Last upload'}: {formatDate(device.last_used_at)}</span>
                {/if}
                {#if device.revoked_at}
                  <span>{zh ? '撤销于' : 'Revoked'}: {formatDate(device.revoked_at)}</span>
                {/if}
              </div>
              {#if device.status === 'active'}
                <button class="btn-revoke" on:click={() => revokeDevice(device.id)}>{zh ? '撤销' : 'Revoke'}</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="settings-section">
      <h2>{zh ? '上传历史' : 'Upload History'}</h2>
      <p class="section-desc">{zh ? '你的近期上传状态和审核结果。' : 'Your recent upload status and review results.'}</p>

      {#if uploads.length === 0}
        <p class="muted">{zh ? '暂无上传记录。' : 'No uploads yet.'}</p>
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
  .profile-form { max-width: 400px; }
  .profile-avatar-section { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .avatar-preview { position: relative; width: 72px; height: 72px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; }
  .avatar-preview.uploading { opacity: 0.5; }
  .avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-placeholder { font-size: 1.5rem; font-weight: 700; color: var(--text-muted); }
  .avatar-spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .avatar-spinner::after { content: ''; width: 24px; height: 24px; border: 2px solid var(--text-muted); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .avatar-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .avatar-hint { display: block; width: 100%; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }
  .btn-secondary { padding: 0.375rem 0.875rem; font-size: 0.8125rem; font-weight: 600; color: var(--text); background: var(--surface); border: 1px solid var(--border-medium); border-radius: 6px; cursor: pointer; transition: background 0.15s; }
  .btn-secondary:hover { background: var(--hover); }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-text-danger { padding: 0.375rem 0.5rem; font-size: 0.8125rem; font-weight: 600; color: var(--rose); background: none; border: none; cursor: pointer; }
  .btn-text-danger:hover { text-decoration: underline; }
  .btn-text-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .field-hint { display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }
  .field-hint-warn { color: var(--amber); }
  .field input:disabled { opacity: 0.5; cursor: not-allowed; }
  .pw-form { max-width: 400px; }
  .field { margin-bottom: 1rem; }
  .field label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-secondary); }
  .field input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.15s; }
  .field input:focus { border-color: var(--accent); }
  .btn-primary { padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
