<script>
  import { page } from '$app/stores'
  import { lang } from '$lib/lang'

  $: zh = $lang === 'zh'
  const initialProfile = $page.data.profile
  $: me = $page.data.profile

  let editUsername = initialProfile?.username || ''
  let editDisplayName = initialProfile?.display_name || ''
  let avatarUploading = false
  let avatarPreviewSrc = initialProfile?.avatar_url || ''
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

  let lbVisibility = initialProfile?.leaderboard_visibility || 'public'
  let lbAnonymous = initialProfile?.leaderboard_anonymous || false
  let lbMsg = ''
  let lbError = ''
  let lbSaving = false
  $: identities = $page.data.identities || []
  $: hasGithub = identities.some(i => i.provider === 'github')

  let activeSection = 'profile'

  $: COOLDOWN_DAYS = $page.data.usernameCooldownDays ?? 30

  $: settingsSections = [
    {
      id: 'profile',
      title: zh ? '个人资料' : 'Profile',
      desc: zh ? '头像、用户名和公开显示名称。' : 'Avatar, username, and public display name.'
    },
    {
      id: 'password',
      title: me?.has_password ? (zh ? '修改密码' : 'Change Password') : (zh ? '设置密码' : 'Set Password'),
      desc: zh ? '账号登录凭据。' : 'Account sign-in credentials.'
    },
    {
      id: 'accounts',
      title: zh ? '关联账号' : 'Linked Accounts',
      desc: zh ? '管理已关联的第三方账号。' : 'Manage linked third-party accounts.'
    },
    {
      id: 'leaderboard',
      title: zh ? '排行榜设置' : 'Leaderboard',
      desc: zh ? '公开可见性和匿名展示。' : 'Public visibility and anonymous display.'
    }
  ]

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

  async function handleLeaderboardSave() {
    lbMsg = ''
    lbError = ''
    lbSaving = true
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({
          leaderboard_visibility: lbVisibility,
          leaderboard_anonymous: lbAnonymous
        })
      })
      const data = await res.json()
      if (res.ok) {
        lbMsg = zh ? '榜单设置已更新' : 'Leaderboard settings updated'
        me = { ...me, leaderboard_visibility: data.leaderboard_visibility, leaderboard_anonymous: data.leaderboard_anonymous }
      } else {
        lbError = data.error || (zh ? '更新失败' : 'Failed to update')
      }
    } catch {
      lbError = getError('network_error')
    } finally {
      lbSaving = false
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
    <div class="settings-header">
      <h1>{zh ? '设置' : 'Settings'}</h1>
      <p>{zh ? '管理账号资料、安全和排行榜展示方式。' : 'Manage account profile, security, and leaderboard display.'}</p>
    </div>

    {#if $page.url.searchParams.get('bound')}
      <div class="success-msg">{zh ? '已成功关联' : 'Successfully linked'} {$page.url.searchParams.get('bound')} {zh ? '账号' : 'account'}!</div>
    {/if}

    <div class="settings-shell">
      <aside class="settings-menu" aria-label={zh ? '设置分类' : 'Settings sections'}>
        {#each settingsSections as item}
          <button
            type="button"
            class:active={activeSection === item.id}
            aria-current={activeSection === item.id ? 'page' : undefined}
            on:click={() => activeSection = item.id}
          >
            <span>{item.title}</span>
            <small>{item.desc}</small>
          </button>
        {/each}
      </aside>

      <div class="settings-panel">
        {#if activeSection === 'profile'}
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

            <form class="settings-form" on:submit|preventDefault={handleProfileSave}>
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
                <input id="profile-email" type="email" value={me?.email || ''} disabled />
                <span class="field-hint">{zh ? '邮箱暂不支持修改。' : 'Email cannot be changed yet.'}</span>
              </div>
              <button type="submit" class="btn-primary" disabled={profileSaving}>
                {profileSaving ? (zh ? '保存中...' : 'Saving...') : (zh ? '保存资料' : 'Save Profile')}
              </button>
            </form>
          </section>
        {:else if activeSection === 'password'}
          <section class="settings-section">
            <h2>{me?.has_password ? (zh ? '修改密码' : 'Change Password') : (zh ? '设置密码' : 'Set Password')}</h2>
            <p class="section-desc">
              {me?.has_password
                ? (zh ? '更新你的账号密码。' : 'Update your account password.')
                : (zh ? '设置密码后可使用用户名或邮箱登录。' : 'Set a password so you can also sign in with your username or email.')}
            </p>

            {#if pwMsg}
              <div class="success-msg">{pwMsg}</div>
            {/if}
            {#if pwError}
              <div class="error-msg">{pwError}</div>
            {/if}

            <form class="settings-form" on:submit|preventDefault={handlePasswordSave}>
              {#if me?.has_password}
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
                {pwSaving ? (zh ? '保存中...' : 'Saving...') : me?.has_password ? (zh ? '更新密码' : 'Update Password') : (zh ? '设置密码' : 'Set Password')}
              </button>
            </form>
          </section>
        {:else if activeSection === 'accounts'}
          <section class="settings-section">
            <h2>{zh ? '关联账号' : 'Linked Accounts'}</h2>
            <p class="section-desc">{zh ? '查看和管理已关联的第三方登录账号。' : 'View and manage linked third-party login accounts.'}</p>

            {#if identities.length > 0}
              <div class="linked-accounts-list">
                {#each identities as identity}
                  <div class="linked-account-item">
                    <span class="linked-provider">{identity.provider === 'github' ? 'GitHub' : identity.provider === 'linux_do' ? 'Linux.do' : identity.provider}</span>
                    <span class="linked-username">{identity.username || '—'}</span>
                    {#if identity.email}
                      <span class="linked-email text-muted">{identity.email}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-muted" style="font-size: 0.875rem;">{zh ? '暂无关联账号。' : 'No linked accounts yet.'}</p>
            {/if}

            {#if !hasGithub}
              <div style="margin-top: 1rem;">
                <a href="/api/oauth/github/start" class="btn-primary" style="display: inline-block; text-decoration: none;">
                  {zh ? '绑定 GitHub' : 'Bind GitHub'}
                </a>
                <span class="field-hint" style="margin-top: 0.5rem;">
                  {zh ? '绑定 GitHub 后可使用 Cloud Sync 功能。' : 'Bind GitHub to use Cloud Sync.'}
                </span>
              </div>
            {/if}
          </section>
        {:else}
          <section class="settings-section">
            <h2>{zh ? '排行榜设置' : 'Leaderboard Settings'}</h2>
            <p class="section-desc">{zh ? '控制你在公开排行榜上的显示方式。' : 'Control how you appear on the public leaderboard.'}</p>

            {#if lbMsg}
              <div class="success-msg">{lbMsg}</div>
            {/if}
            {#if lbError}
              <div class="error-msg">{lbError}</div>
            {/if}

            <form class="settings-form" on:submit|preventDefault={handleLeaderboardSave}>
              <div class="field">
                <label for="lb-visibility">{zh ? '排行榜可见性' : 'Leaderboard Visibility'}</label>
                <select id="lb-visibility" bind:value={lbVisibility}>
                  <option value="public">{zh ? '公开' : 'Public'}</option>
                  <option value="private">{zh ? '不参与排行' : 'Private (hidden from leaderboard)'}</option>
                </select>
                <span class="field-hint">{zh ? '设为私有后，你的数据将不会出现在公开排行榜上。' : 'When set to private, your data will not appear on the public leaderboard.'}</span>
              </div>
              <div class="field">
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={lbAnonymous} />
                  <span>{zh ? '匿名参与排行榜' : 'Participate anonymously'}</span>
                </label>
                <span class="field-hint">{zh ? '开启后，排行榜将隐藏你的用户名和头像。' : 'When enabled, your username and avatar will be hidden on the leaderboard.'}</span>
              </div>
              <button type="submit" class="btn-primary" disabled={lbSaving}>
                {lbSaving ? (zh ? '保存中...' : 'Saving...') : (zh ? '保存设置' : 'Save Settings')}
              </button>
            </form>
          </section>
        {/if}
      </div>
    </div>

  </div>
</div>

<style>
  .settings-page { padding: 2rem 0 4rem; }
  .settings-container { width: var(--content-width); margin: 0 auto; max-width: 1040px; }
  .settings-header { margin-bottom: 1.5rem; }
  h1 { font-size: 2rem; font-weight: 700; margin: 0 0 0.375rem; }
  .settings-header p { margin: 0; color: var(--text-muted); font-size: 0.875rem; }
  .settings-shell {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }
  .settings-menu {
    position: sticky;
    top: 88px;
    display: grid;
    gap: 0.375rem;
    padding: 0.375rem;
    border-radius: 8px;
    background: var(--raised);
  }
  .settings-menu button {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    padding: 0.75rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
  }
  .settings-menu button:hover {
    background: var(--surface);
    color: var(--text);
  }
  .settings-menu button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--border-subtle);
  }
  .settings-menu span {
    font-size: 0.875rem;
    font-weight: 650;
  }
  .settings-menu small {
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.35;
  }
  .settings-panel {
    min-width: 0;
    padding: 1.25rem;
    border-radius: 8px;
    background: var(--surface);
  }
  .settings-section { margin: 0; }
  .settings-section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  .section-desc { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
  .success-msg { background: var(--green-dim); color: var(--green); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .error-msg { background: oklch(0.55 0.22 25 / 0.08); color: var(--rose); padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .settings-form { max-width: 440px; }
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
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
  .field { margin-bottom: 1rem; }
  .field label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-secondary); }
  .field input, .field select { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.15s; }
  .field input:focus, .field select:focus { border-color: var(--accent); }
  .btn-primary { padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; color: oklch(0.99 0.002 85); background: var(--accent); border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .linked-accounts-list { display: grid; gap: 0.5rem; margin-bottom: 1rem; }
  .linked-account-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; border-radius: 6px; background: var(--bg); border: 1px solid var(--border-subtle); font-size: 0.875rem; }
  .linked-provider { font-weight: 600; min-width: 80px; }
  .linked-username { color: var(--text); }
  .linked-email { font-size: 0.8125rem; }
  .text-muted { color: var(--text-muted); }

  @media (max-width: 760px) {
    .settings-page { padding-top: 1rem; }
    .settings-shell { grid-template-columns: 1fr; gap: 1rem; }
    .settings-menu {
      position: static;
      display: flex;
      overflow-x: auto;
      padding: 0.25rem;
    }
    .settings-menu button {
      min-width: 0;
      flex: 1 1 0;
      padding: 0.625rem 0.5rem;
      text-align: center;
    }
    .settings-menu small {
      display: none;
    }
    .settings-panel { padding: 1rem; }
    .profile-avatar-section {
      align-items: flex-start;
    }
  }
</style>
