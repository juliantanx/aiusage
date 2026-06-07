<script>
  import { onMount, onDestroy } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchConfig, saveConfig, fetchCredential, fetchDetectedTools, importKelivoBackup, notifySettingsUpdated, refreshExchangeRate, fetchSyncStatus, triggerSync } from '$lib/api.js'
  import { displayCurrency, exchangeRate } from '$lib/stores.js'
  import { splitSettingsSources } from '$lib/settings-sources.js'

  let loading = true
  let loadError = null

  // Unified form state for General + Data + Currency
  let general = {
    device: '', weekStart: 1, refreshInterval: '',
    retentionDays: '',
    displayCurrency: 'USD', exchangeRate: '',
  }
  let detectedTools = []
  let showNotFound = false
  let currentPlatform = ''
  let currentHostname = ''
  let kelivoFileInput
  let kelivoImporting = false
  let kelivoImportError = ''
  let kelivoImportedCount = null
  let kelivoAddedCount = null

  const PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

  $: sourceGroups = splitSettingsSources(detectedTools)
  $: manualImportTools = sourceGroups.manualImportTools
  $: activeTools = sourceGroups.activeDetectedTools
  $: notFoundTools = sourceGroups.notFoundDetectedTools

  // Sync form — credentialRef is derived automatically, never user-editable
  let syncData = { backend: '', repo: '', bucket: '', prefix: '', endpoint: '', region: 'auto' }
  let cloudLoggedIn = false
  let autoSyncEnabled = false
  let syncIntervalMinutes = '30'

  // Sync status
  let syncStatusData = null
  let syncRunning = false
  let syncPollTimer = null

  $: currentSyncTarget = syncData.backend === 'cloud'
    ? 'cloud'
    : syncData.backend === 'github' && syncData.repo
      ? `github:${syncData.repo}`
      : syncData.backend === 's3' && syncData.bucket
        ? `s3:${syncData.bucket}`
        : ''
  $: displayedSyncStatus = !syncStatusData?.lastSyncTarget || !currentSyncTarget || syncStatusData.lastSyncTarget === currentSyncTarget
    ? syncStatusData
    : null

  // GitHub credential state
  let credentialKeys = []
  let ghToken = ''
  let ghTokenVisible = false
  let ghTokenLoading = false
  let ghTokenIsSet = false

  // S3 credential state — two separate credentials required by sync.ts
  let s3AkidValue = ''
  let s3AkidVisible = false
  let s3AkidLoading = false
  let s3AkidIsSet = false
  let s3SakValue = ''
  let s3SakVisible = false
  let s3SakLoading = false
  let s3SakIsSet = false

  // Track previous values to detect changes that invalidate cached credential reveals
  let prevBackend = ''
  let prevRepo = ''
  let prevBucket = ''

  let effectiveDeviceName = ''

  // Exchange rate cache
  let cachedRate = 0.137 // CNY→USD, internal direction
  let cachedRateFetchedAt = null
  let rateRefreshing = false

  $: cachedRateUsdToCny = cachedRate ? (1 / cachedRate).toFixed(2) : ''
  $: rateLastUpdated = cachedRateFetchedAt
    ? new Date(cachedRateFetchedAt).toLocaleString()
    : null
  $: kelivoTool = detectedTools.find(tool => tool.sourceKey === 'kelivo')
  $: kelivoLastImportedAt = typeof kelivoTool?.lastImportedAt === 'number'
    ? new Date(kelivoTool.lastImportedAt)
    : null
  $: kelivoStatus = kelivoLastImportedAt
    ? `${$t('settings.lastImported')} ${kelivoLastImportedAt.toLocaleString()}`
    : $t('settings.neverImported')

  // Per-section save state
  let generalSaving = false; let generalError = ''; let generalSaved = false
  let syncSaving = false;    let syncError = '';    let syncSaved = false
  let savedSyncSnapshot = ''
  $: syncDirty = JSON.stringify({
    backend: syncData.backend || '',
    repo: syncData.repo.trim(),
    bucket: syncData.bucket.trim(),
    prefix: syncData.prefix.trim(),
    endpoint: syncData.endpoint.trim(),
    region: syncData.region.trim(),
    autoSyncEnabled,
    syncIntervalMinutes: autoSyncEnabled ? String(syncIntervalMinutes) : '',
    ghTokenPending: Boolean(ghToken),
    s3AkidPending: Boolean(s3AkidValue),
    s3SakPending: Boolean(s3SakValue),
  }) !== savedSyncSnapshot

  // Credential key derivation — must match sync.ts createBackend()
  function ghKey(repo)    { return `github/${repo}/token` }
  function s3AkidKey(bucket) { return `s3/${bucket}/accessKeyId` }
  function s3SakKey(bucket)  { return `s3/${bucket}/secretAccessKey` }
  function hasCredentialKey(key) { return credentialKeys.includes(key) }
  function inferGithubRepoFromKeys(keys) {
    const key = keys.find(k => /^github\/[^/]+\/[^/]+\/token$/.test(k))
    return key ? key.replace(/^github\//, '').replace(/\/token$/, '') : ''
  }
  function inferS3BucketFromKeys(keys) {
    const key = keys.find(k => /^s3\/[^/]+\/accessKeyId$/.test(k))
    return key ? key.replace(/^s3\//, '').replace(/\/accessKeyId$/, '') : ''
  }
  function syncSnapshot() {
    return JSON.stringify({
      backend: syncData.backend || '',
      repo: syncData.repo.trim(),
      bucket: syncData.bucket.trim(),
      prefix: syncData.prefix.trim(),
      endpoint: syncData.endpoint.trim(),
      region: syncData.region.trim(),
      autoSyncEnabled,
      syncIntervalMinutes: autoSyncEnabled ? String(syncIntervalMinutes) : '',
      ghTokenPending: Boolean(ghToken),
      s3AkidPending: Boolean(s3AkidValue),
      s3SakPending: Boolean(s3SakValue),
    })
  }

  function resetAllCredentialState() {
    ghToken = ''; ghTokenVisible = false; ghTokenLoading = false; ghTokenIsSet = false
    s3AkidValue = ''; s3AkidVisible = false; s3AkidLoading = false; s3AkidIsSet = false
    s3SakValue = ''; s3SakVisible = false; s3SakLoading = false; s3SakIsSet = false
  }

  function onBackendChange() {
    if (syncData.backend === 'github' && !syncData.repo) {
      syncData.repo = inferGithubRepoFromKeys(credentialKeys)
    }
    if (syncData.backend === 's3' && !syncData.bucket) {
      syncData.bucket = inferS3BucketFromKeys(credentialKeys)
    }
    ghToken = ''; ghTokenVisible = false; ghTokenLoading = false
    s3AkidValue = ''; s3AkidVisible = false; s3AkidLoading = false
    s3SakValue = ''; s3SakVisible = false; s3SakLoading = false
    ghTokenIsSet = !!(syncData.repo && hasCredentialKey(ghKey(syncData.repo)))
    s3AkidIsSet = !!(syncData.bucket && hasCredentialKey(s3AkidKey(syncData.bucket)))
    s3SakIsSet = !!(syncData.bucket && hasCredentialKey(s3SakKey(syncData.bucket)))
    if (syncData.backend === 's3' && !syncData.region) syncData.region = 'auto'
    prevBackend = syncData.backend
    prevRepo = syncData.repo
    prevBucket = syncData.bucket
  }

  function onRepoChange() {
    if (syncData.repo !== prevRepo) {
      ghToken = ''; ghTokenVisible = false; ghTokenLoading = false; ghTokenIsSet = false
      prevRepo = syncData.repo
    }
  }

  function onBucketChange() {
    if (syncData.bucket !== prevBucket) {
      s3AkidValue = ''; s3AkidVisible = false; s3AkidLoading = false; s3AkidIsSet = false
      s3SakValue = ''; s3SakVisible = false; s3SakLoading = false; s3SakIsSet = false
      prevBucket = syncData.bucket
    }
  }

  onMount(async () => {
    try {
      const [cfg, toolsResult] = await Promise.all([fetchConfig(), fetchDetectedTools()])
      general = {
        device: cfg.device ?? '',
        weekStart: cfg.weekStart ?? 1,
        refreshInterval: cfg.refreshInterval != null ? String(cfg.refreshInterval) : '',
        retentionDays: cfg.retentionDays != null ? String(cfg.retentionDays) : '',
        displayCurrency: cfg.displayCurrency || 'USD',
        exchangeRate: cfg.exchangeRate ? (1 / cfg.exchangeRate).toFixed(4) : '',
      }
      detectedTools = toolsResult.tools ?? []
      currentPlatform = cfg.platform ?? ''
      currentHostname = cfg.hostname ?? ''
      const keys = cfg.credentialKeys ?? []
      credentialKeys = keys
      const inferredGithubRepo = inferGithubRepoFromKeys(keys)
      const inferredS3Bucket = inferS3BucketFromKeys(keys)
      syncData = {
        backend: cfg.sync?.backend ?? (inferredGithubRepo ? 'github' : ''),
        repo: cfg.sync?.repo ?? inferredGithubRepo,
        bucket: cfg.sync?.bucket ?? inferredS3Bucket,
        prefix: cfg.sync?.prefix ?? '',
        endpoint: cfg.sync?.endpoint ?? '',
        region: cfg.sync?.backend === 's3' ? (cfg.sync?.region ?? 'auto') : (cfg.sync?.region ?? ''),
      }
      prevBackend = syncData.backend
      prevRepo = syncData.repo
      prevBucket = syncData.bucket
      cloudLoggedIn = Boolean(cfg.loggedIn)

      const si = cfg.syncInterval
      if (si && si > 0) {
        autoSyncEnabled = true
        syncIntervalMinutes = String(Math.round(si / 60000))
      }

      // Check both the structured key (new UI) and credentialRef (old init command)
      const oldRef = cfg.sync?.credentialRef ?? ''
      ghTokenIsSet = !!(syncData.repo && (keys.includes(ghKey(syncData.repo)) || (oldRef && keys.includes(oldRef))))
      s3AkidIsSet  = !!(syncData.bucket && keys.includes(s3AkidKey(syncData.bucket)))
      s3SakIsSet   = !!(syncData.bucket && keys.includes(s3SakKey(syncData.bucket)))
      savedSyncSnapshot = syncSnapshot()

      effectiveDeviceName = cfg.device || currentHostname || 'hostname'

      if (cfg.exchangeRateCache?.CNY_USD) {
        cachedRate = cfg.exchangeRateCache.CNY_USD
        cachedRateFetchedAt = cfg.exchangeRateCache.fetchedAt
      }

      loadSyncStatusData()
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  async function loadSyncStatusData() {
    try {
      const data = await fetchSyncStatus()
      syncStatusData = data.status
      syncRunning = Boolean(syncStatusData?.isRunning)
    } catch {
      syncStatusData = null
    }
  }

  async function handleSyncFromSettings() {
    syncRunning = true
    try {
      await triggerSync()
      startSyncPolling()
    } catch {
      syncRunning = false
      await loadSyncStatusData()
    }
  }

  function startSyncPolling() {
    stopSyncPolling()
    syncPollTimer = setInterval(async () => {
      await loadSyncStatusData()
      if (!syncStatusData?.isRunning) {
        stopSyncPolling()
        syncRunning = false
      }
    }, 800)
  }

  function stopSyncPolling() {
    if (syncPollTimer) {
      clearInterval(syncPollTimer)
      syncPollTimer = null
    }
  }

  function formatSyncTime(ts) {
    if (!ts) return $t('settings.syncNever')
    const d = new Date(ts)
    return d.toLocaleString()
  }

  async function saveGeneral() {
    generalSaving = true; generalError = ''
    try {
      // Convert user-facing USD→CNY to internal CNY→USD
      const userRate = general.exchangeRate ? Number(general.exchangeRate) : 0
      const internalRate = userRate > 0 ? 1 / userRate : null

      await saveConfig({
        device: general.device || null,
        weekStart: Number(general.weekStart),
        refreshInterval: general.refreshInterval ? Number(general.refreshInterval) : null,
        retentionDays: general.retentionDays ? Number(general.retentionDays) : null,
        displayCurrency: general.displayCurrency,
        exchangeRate: internalRate,
      })
      notifySettingsUpdated({
        refreshInterval: general.refreshInterval ? Number(general.refreshInterval) : null,
        device: general.device || null,
      })
      effectiveDeviceName = general.device || currentHostname || 'hostname'
      displayCurrency.set(general.displayCurrency)
      if (internalRate) {
        exchangeRate.set(internalRate)
      } else {
        exchangeRate.set(cachedRate)
      }
      generalSaved = true
      setTimeout(() => { generalSaved = false }, 2000)
    } catch (e) {
      generalError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      generalSaving = false
    }
  }

  async function saveSync() {
    syncSaving = true; syncError = ''
    try {
      syncData.repo = syncData.repo.trim()
      syncData.bucket = syncData.bucket.trim()
      syncData.prefix = syncData.prefix.trim()
      syncData.endpoint = syncData.endpoint.trim()
      syncData.region = syncData.region.trim()

      if (syncData.backend === 'github') {
        if (!syncData.repo) throw new Error($t('settings.syncRepoRequired'))
        if (!/^[^/\s]+\/[^/\s]+$/.test(syncData.repo)) throw new Error($t('settings.syncRepoInvalid'))
        if (!ghToken && !ghTokenIsSet) throw new Error($t('settings.syncGithubTokenRequired'))
      } else if (syncData.backend === 's3') {
        if (!syncData.bucket) throw new Error($t('settings.syncBucketRequired'))
        if (!s3AkidValue && !s3AkidIsSet) throw new Error($t('settings.syncS3AccessKeyRequired'))
        if (!s3SakValue && !s3SakIsSet) throw new Error($t('settings.syncS3SecretKeyRequired'))
      }

      // Build the sync config payload with auto-derived credentialRef
      let syncPayload = null
      if (syncData.backend === 'cloud') {
        syncPayload = { backend: 'cloud' }
      } else if (syncData.backend === 'github' && syncData.repo) {
        syncPayload = {
          backend: 'github',
          repo: syncData.repo,
          credentialRef: ghKey(syncData.repo),
        }
      } else if (syncData.backend === 's3' && syncData.bucket) {
        syncPayload = {
          backend: 's3',
          bucket: syncData.bucket,
          prefix: syncData.prefix || '',
          endpoint: syncData.endpoint || '',
          region: syncData.region || 'auto',
          credentialRef: s3AkidKey(syncData.bucket),
        }
      }

      // Build credentials — use the same keys sync.ts reads
      const credentials = {}
      if (syncData.backend === 'github' && syncData.repo && ghToken) {
        credentials[ghKey(syncData.repo)] = ghToken
      }
      if (syncData.backend === 's3' && syncData.bucket) {
        if (s3AkidValue) credentials[s3AkidKey(syncData.bucket)] = s3AkidValue
        if (s3SakValue)  credentials[s3SakKey(syncData.bucket)]  = s3SakValue
      }

      const syncIntervalMs = autoSyncEnabled && syncIntervalMinutes
        ? Number(syncIntervalMinutes) * 60000
        : null

      const payload = { sync: syncPayload, syncInterval: syncIntervalMs }
      if (Object.keys(credentials).length > 0) payload.credentials = credentials

      await saveConfig(payload)

      // Update isSet flags and clear entered values (don't expose creds in memory longer than needed)
      if (syncData.backend === 'github') {
        if (ghToken) {
          credentialKeys = Array.from(new Set([...credentialKeys, ghKey(syncData.repo)]))
          ghTokenIsSet = true; ghToken = ''; ghTokenVisible = false
        }
      } else if (syncData.backend === 's3') {
        if (s3AkidValue) {
          credentialKeys = Array.from(new Set([...credentialKeys, s3AkidKey(syncData.bucket)]))
          s3AkidIsSet = true; s3AkidValue = ''; s3AkidVisible = false
        }
        if (s3SakValue) {
          credentialKeys = Array.from(new Set([...credentialKeys, s3SakKey(syncData.bucket)]))
          s3SakIsSet  = true; s3SakValue  = ''; s3SakVisible  = false
        }
      }

      prevBackend = syncData.backend
      prevRepo    = syncData.repo
      prevBucket  = syncData.bucket

      savedSyncSnapshot = syncSnapshot()
      syncSaved = true
      setTimeout(() => { syncSaved = false }, 2000)
      await loadSyncStatusData()
      return true
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Save failed'
      return false
    } finally {
      syncSaving = false
    }
  }

  async function handleRefreshRate() {
    rateRefreshing = true
    try {
      const result = await refreshExchangeRate()
      cachedRate = result.rate
      cachedRateFetchedAt = result.fetchedAt
      // Update store if no manual override
      if (!general.exchangeRate) {
        exchangeRate.set(result.rate)
      }
    } catch (e) {
      generalError = e instanceof Error ? e.message : 'Refresh failed'
    } finally {
      rateRefreshing = false
    }
  }

  function triggerKelivoImport() {
    kelivoImportError = ''
    kelivoFileInput?.click()
  }

  function mergeKelivoImportMetadata(tools, result) {
    if (typeof result?.lastImportedAt !== 'number') return tools
    return tools.map((tool) => tool.sourceKey === 'kelivo'
      ? { ...tool, lastImportedAt: result.lastImportedAt }
      : tool)
  }

  async function handleKelivoFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.name !== 'chats.json' && !file.name.toLowerCase().endsWith('.zip')) {
      kelivoImportError = $t('settings.kelivoInvalidFile')
      return
    }

    kelivoImporting = true
    kelivoImportError = ''
    kelivoImportedCount = null
    kelivoAddedCount = null
    try {
      const result = await importKelivoBackup(file)
      kelivoImportedCount = result.imported ?? 0
      kelivoAddedCount = result.added ?? null
      let nextTools = detectedTools
      try {
        const toolsResult = await fetchDetectedTools()
        nextTools = toolsResult.tools ?? detectedTools
      } catch {}
      detectedTools = mergeKelivoImportMetadata(nextTools, result)
      notifySettingsUpdated({ importedTool: 'kelivo' })
    } catch (e) {
      kelivoImportError = e instanceof Error ? e.message : $t('settings.kelivoImportFailed')
    } finally {
      kelivoImporting = false
    }
  }

  // Per-credential toggle helpers
  async function toggleGhToken() {
    syncError = ''
    syncData.repo = syncData.repo.trim()
    if (!syncData.repo) {
      syncError = $t('settings.syncRepoRequired')
      return
    }
    if (ghTokenVisible) { ghTokenVisible = false; return }
    if (ghToken) { ghTokenVisible = true; return }
    ghTokenLoading = true
    try {
      const data = await fetchCredential(ghKey(syncData.repo))
      ghToken = data.value ?? ''
      ghTokenVisible = true
      ghTokenIsSet = !!ghToken
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Failed to load credential'
    } finally {
      ghTokenLoading = false
    }
  }

  async function toggleS3Akid() {
    syncError = ''
    syncData.bucket = syncData.bucket.trim()
    if (!syncData.bucket) {
      syncError = $t('settings.syncBucketRequired')
      return
    }
    if (s3AkidVisible) { s3AkidVisible = false; return }
    if (s3AkidValue) { s3AkidVisible = true; return }
    s3AkidLoading = true
    try {
      const data = await fetchCredential(s3AkidKey(syncData.bucket))
      s3AkidValue = data.value ?? ''
      s3AkidVisible = true
      s3AkidIsSet = !!s3AkidValue
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Failed to load credential'
    } finally {
      s3AkidLoading = false
    }
  }

  async function toggleS3Sak() {
    syncError = ''
    syncData.bucket = syncData.bucket.trim()
    if (!syncData.bucket) {
      syncError = $t('settings.syncBucketRequired')
      return
    }
    if (s3SakVisible) { s3SakVisible = false; return }
    if (s3SakValue) { s3SakVisible = true; return }
    s3SakLoading = true
    try {
      const data = await fetchCredential(s3SakKey(syncData.bucket))
      s3SakValue = data.value ?? ''
      s3SakVisible = true
      s3SakIsSet = !!s3SakValue
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Failed to load credential'
    } finally {
      s3SakLoading = false
    }
  }

  onDestroy(() => {
    stopSyncPolling()
  })

  function btnLabel(saving, saved, t_save, t_saved) {
    if (saving) return '...'
    if (saved) return t_saved
    return t_save
  }
</script>

<svelte:head>
  <title>{$t('settings.title')} — AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('settings.title')}</h1>
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if loadError}
  <div class="state-msg error">{loadError}</div>
{:else}
  <div class="sections">

    <!-- General (merged: general + data + currency) -->
    <div class="card">
      <div class="group-title">{$t('settings.general')}</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="field-device">{$t('settings.device')}</label>
          <input id="field-device" type="text" bind:value={general.device} class="field-input" placeholder={currentHostname || 'hostname'} />
          <div class="field-hint">{$t('settings.deviceHint')}</div>
        </div>
        <div class="field">
          <label class="field-label" for="field-week-start">{$t('settings.weekStart')}</label>
          <select id="field-week-start" bind:value={general.weekStart} class="field-input">
            <option value={0}>{$t('settings.weekStartSunday')}</option>
            <option value={1}>{$t('settings.weekStartMonday')}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="field-refresh-interval">{$t('settings.refreshInterval')}</label>
          <input id="field-refresh-interval" type="number" bind:value={general.refreshInterval} class="field-input" placeholder="e.g. 30000" min="1000" />
        </div>
        <div class="field">
          <label class="field-label" for="field-retention-days">{$t('settings.retentionDays')}</label>
          <input id="field-retention-days" type="number" bind:value={general.retentionDays} class="field-input" placeholder={$t('settings.retentionPlaceholder')} min="0" />
          <div class="field-hint">{$t('settings.retentionHint')}</div>
        </div>
        <div class="field">
          <label class="field-label" for="field-display-currency">{$t('settings.displayCurrency')}</label>
          <select id="field-display-currency" bind:value={general.displayCurrency} class="field-input">
            <option value="USD">USD ($)</option>
            <option value="CNY">CNY (¥)</option>
          </select>
        </div>
        {#if general.displayCurrency === 'CNY'}
          <div class="field">
            <label class="field-label" for="field-exchange-rate">
              {$t('settings.exchangeRate')} (1 USD = ? CNY)
            </label>
            <div class="rate-row">
              <input id="field-exchange-rate" type="number" step="0.01" min="0"
                bind:value={general.exchangeRate} class="field-input"
                placeholder="Auto: {cachedRateUsdToCny}" />
              <button type="button" class="btn-ghost" on:click={handleRefreshRate}
                disabled={rateRefreshing}>
                {rateRefreshing ? '...' : $t('settings.refreshRate')}
              </button>
            </div>
            <div class="field-hint">
              {$t('settings.exchangeRateHint')}
              {#if rateLastUpdated}
                <span class="rate-time">{$t('settings.rateLastUpdated')}: {rateLastUpdated}</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      {#if generalError}<p class="section-error">{generalError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={generalSaved} on:click={saveGeneral} disabled={generalSaving}>
          {btnLabel(generalSaving, generalSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

    <!-- Data Sources -->
    <div class="card">
      <div class="group-title-row">
        <span class="group-title">{$t('settings.dataSources')}</span>
        {#if currentPlatform}
          <span class="platform-badge">{PLATFORM_LABEL[currentPlatform] ?? currentPlatform}</span>
        {/if}
      </div>

      {#if manualImportTools.length}
        <div class="source-group">
          <div class="source-subtitle">{$t('settings.manualImports')}</div>
          <div class="field-hint">{$t('settings.manualImportsHint')}</div>
          <input class="file-input" type="file" accept=".zip,.json,application/zip,application/json" bind:this={kelivoFileInput} on:change={handleKelivoFileChange} />
          <div class="detected-tools-list">
            {#each manualImportTools as tool}
              <div class="detected-tool">
                <div class="detected-tool-header">
                  <span class="status-dot" class:green={tool.status === 'found'} class:gray={tool.status === 'not_found'}></span>
                  <span class="detected-tool-name">{tool.label}</span>
                  <span class="detected-tool-status">
                    {#if tool.sourceKey === 'kelivo'}
                      {kelivoStatus}
                    {:else}
                      {$t('settings.notConfigured')}
                    {/if}
                  </span>
                </div>
                {#if tool.sourceKey === 'kelivo'}
                  <div class="source-actions">
                    <button type="button" class="btn-ghost import-btn" on:click={triggerKelivoImport} disabled={kelivoImporting}>
                      {kelivoImporting ? '...' : $t('settings.importBackup')}
                    </button>
                    {#if kelivoImportedCount !== null}
                      <span class="source-result">
                        {$t('settings.imported')} {kelivoImportedCount} {$t('settings.records')}
                        {#if kelivoAddedCount !== null}
                          · {$t('settings.added')} {kelivoAddedCount} {$t('settings.records')}
                        {/if}
                      </span>
                    {/if}
                  </div>
                  {#if kelivoImportError}<p class="section-error compact">{kelivoImportError}</p>{/if}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="source-group">
        <div class="source-subtitle">{$t('settings.detectedTools')}</div>
        <div class="field-hint">{$t('settings.detectedToolsHint')}</div>
        <div class="detected-tools-list">
          {#each activeTools as tool}
            <div class="detected-tool">
              <div class="detected-tool-header">
                <span class="status-dot" class:green={tool.status === 'found'} class:yellow={tool.status === 'empty'}></span>
                <span class="detected-tool-name">{tool.label}</span>
                <span class="detected-tool-status">
                  {#if tool.status === 'found'}
                    {$t('settings.toolFound')} · {tool.fileCount} {$t('settings.toolFiles')}
                  {:else}
                    {$t('settings.toolEmpty')}
                  {/if}
                </span>
              </div>
              {#if tool.paths?.length}
                {#each tool.paths as path}
                  <div class="detected-tool-path">{path}</div>
                {/each}
              {:else if tool.path}
                <div class="detected-tool-path">{tool.path}</div>
              {/if}
            </div>
          {/each}
          {#if notFoundTools.length}
            <button class="not-found-toggle" on:click={() => showNotFound = !showNotFound}>
              <span class="not-found-chevron" class:open={showNotFound}>&#9654;</span>
              {$t('settings.toolNotFound')} ({notFoundTools.length})
            </button>
            {#if showNotFound}
              {#each notFoundTools as tool}
                <div class="detected-tool not-found">
                  <div class="detected-tool-header">
                    <span class="status-dot gray"></span>
                    <span class="detected-tool-name">{tool.label}</span>
                  </div>
                  {#if tool.path}
                    <div class="detected-tool-path">{tool.path}</div>
                  {/if}
                </div>
              {/each}
            {/if}
          {/if}
        </div>
      </div>
    </div>

    <!-- Sync -->
    <div class="card sync-card">
      <div class="group-title">{$t('settings.sync')}</div>
      <div class="fields">
        <div class="field full">
          <label class="field-label" for="field-sync-backend">{$t('settings.syncBackend')}</label>
          <select id="field-sync-backend" bind:value={syncData.backend} class="field-input" on:change={onBackendChange}>
            <option value="">{$t('settings.syncBackendNone')}</option>
            <option value="cloud">AIUsage Cloud</option>
            <option value="github">GitHub</option>
            <option value="s3">S3 / Compatible</option>
          </select>
          <div class="field-hint">
            {#if syncData.backend === 'cloud'}
              {$t('settings.syncBackendCloudDesc')}
            {:else if syncData.backend === 'github'}
              {$t('settings.syncBackendGithubDesc')}
            {:else if syncData.backend === 's3'}
              {$t('settings.syncBackendS3Desc')}
            {:else}
              {$t('settings.syncBackendNoneDesc')}
            {/if}
          </div>
        </div>

        {#if syncData.backend === 'cloud'}
          <div class="field full">
            <div class="cloud-setup">
              <div class="cloud-setup-title">{$t('settings.syncCloudSetup')}</div>
              <div class="cloud-steps">
                <div class="cloud-step">
                  <span class="cloud-step-num">1</span>
                  <div class="cloud-step-body">
                    <span class="cloud-step-label">
                      <a href="https://aiusage.jtanx.com/settings#accounts" target="_blank" rel="noopener noreferrer" class="cloud-step-link">{$t('settings.syncCloudStep1')}</a>
                    </span>
                  </div>
                </div>
                <div class="cloud-step">
                  <span class="cloud-step-num">2</span>
                  <div class="cloud-step-body">
                    <span class="cloud-step-label">
                      <a href="https://github.com/juliantanx/aiusage" target="_blank" rel="noopener noreferrer" class="cloud-step-link">{$t('settings.syncCloudStep2')}</a>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="cloud-status" class:logged-in={cloudLoggedIn}>
              {#if cloudLoggedIn}
                <span class="status-dot ok"></span>
                <span>{$t('settings.cloudLoggedIn')}</span>
              {:else}
                <span class="status-dot"></span>
                <span>{$t('settings.cloudNotLoggedIn')}</span>
              {/if}
            </div>
          </div>
        {/if}

        {#if syncData.backend === 'github'}
          <div class="field">
            <label class="field-label" for="field-sync-repo">{$t('settings.syncRepo')}</label>
            <input id="field-sync-repo" type="text" bind:value={syncData.repo} class="field-input mono"
              placeholder="owner/repo" on:input={onRepoChange} />
          </div>
          <div class="field full">
            <label class="field-label" for="field-gh-token">GitHub Token</label>
            <div class="field-hint">
              {$t('settings.credentialStoredAs')}
              <code class="key-hint">{syncData.repo ? ghKey(syncData.repo) : 'github/owner/repo/token'}</code>
            </div>
            <div class="credential-row">
              <input id="field-gh-token" type={ghTokenVisible ? 'text' : 'password'}
                value={ghToken} on:input={e => ghToken = e.target.value}
                class="field-input mono" autocomplete="new-password"
                placeholder={ghTokenIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
              <button type="button" class="btn-ghost" on:click={toggleGhToken}
                disabled={ghTokenLoading || !syncData.repo}>
                {#if ghTokenLoading}...{:else if ghTokenVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
              </button>
            </div>
          </div>
        {/if}

        {#if syncData.backend === 's3'}
          <div class="field">
            <label class="field-label" for="field-sync-bucket">{$t('settings.syncBucket')}</label>
            <input id="field-sync-bucket" type="text" bind:value={syncData.bucket} class="field-input mono"
              placeholder="my-bucket" on:input={onBucketChange} />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-prefix">{$t('settings.syncPrefix')}</label>
            <input id="field-sync-prefix" type="text" bind:value={syncData.prefix} class="field-input mono" placeholder="aiusage/" />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-endpoint">{$t('settings.syncEndpoint')}</label>
            <input id="field-sync-endpoint" type="text" bind:value={syncData.endpoint} class="field-input mono" placeholder="https://s3.amazonaws.com" />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-region">{$t('settings.syncRegion')}</label>
            <input id="field-sync-region" type="text" bind:value={syncData.region} class="field-input mono" placeholder="auto" />
          </div>
          <div class="field full">
            <label class="field-label" for="field-s3-akid">Access Key ID</label>
            <div class="field-hint">
              {$t('settings.credentialStoredAs')}
              <code class="key-hint">{syncData.bucket ? s3AkidKey(syncData.bucket) : 's3/my-bucket/accessKeyId'}</code>
            </div>
            <div class="credential-row">
              <input id="field-s3-akid" type={s3AkidVisible ? 'text' : 'password'}
                value={s3AkidValue} on:input={e => s3AkidValue = e.target.value}
                class="field-input mono" autocomplete="new-password"
                placeholder={s3AkidIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
              <button type="button" class="btn-ghost" on:click={toggleS3Akid}
                disabled={s3AkidLoading || !syncData.bucket}>
                {#if s3AkidLoading}...{:else if s3AkidVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
              </button>
            </div>
          </div>
          <div class="field full">
            <label class="field-label" for="field-s3-sak">Secret Access Key</label>
            <div class="field-hint">
              {$t('settings.credentialStoredAs')}
              <code class="key-hint">{syncData.bucket ? s3SakKey(syncData.bucket) : 's3/my-bucket/secretAccessKey'}</code>
            </div>
            <div class="credential-row">
              <input id="field-s3-sak" type={s3SakVisible ? 'text' : 'password'}
                value={s3SakValue} on:input={e => s3SakValue = e.target.value}
                class="field-input mono" autocomplete="new-password"
                placeholder={s3SakIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
              <button type="button" class="btn-ghost" on:click={toggleS3Sak}
                disabled={s3SakLoading || !syncData.bucket}>
                {#if s3SakLoading}...{:else if s3SakVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
              </button>
            </div>
          </div>
        {/if}
        {#if syncData.backend}
          <div class="field full">
            <div class="auto-sync-toggle-row">
              <label class="toggle-row">
                <input type="checkbox" bind:checked={autoSyncEnabled} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>{$t('settings.autoSync')}</strong>
                </span>
              </label>
              {#if autoSyncEnabled}
                <label class="interval-control">
                  <span>{$t('settings.syncFrequency')}</span>
                  <select bind:value={syncIntervalMinutes}>
                    <option value="5">5 {$t('settings.syncMinutes')}</option>
                    <option value="15">15 {$t('settings.syncMinutes')}</option>
                    <option value="30">30 {$t('settings.syncMinutes')}</option>
                    <option value="60">1 {$t('settings.syncHour')}</option>
                    <option value="120">2 {$t('settings.syncHours')}</option>
                    <option value="360">6 {$t('settings.syncHours')}</option>
                    <option value="720">12 {$t('settings.syncHours')}</option>
                    <option value="1440">24 {$t('settings.syncHours')}</option>
                  </select>
                </label>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      {#if syncError}<p class="section-error">{syncError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={syncSaved} on:click={saveSync} disabled={syncSaving}>
          {btnLabel(syncSaving, syncSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>

      {#if syncData.backend}
        <div class="sync-status-section">
          <div class="group-title">{$t('settings.syncStatus')}</div>
          <div class="sync-status-grid">
            <div class="sync-status-item">
              <span class="sync-status-label">{$t('settings.syncLastSync')}</span>
              <span class="sync-status-value mono">{formatSyncTime(displayedSyncStatus?.lastSyncAt)}</span>
            </div>
            {#if syncStatusData?.nextSyncAt}
              <div class="sync-status-item">
                <span class="sync-status-label">{$t('settings.syncNextSync')}</span>
                <span class="sync-status-value mono">{formatSyncTime(syncStatusData.nextSyncAt)}</span>
              </div>
            {/if}
            <div class="sync-status-item">
              <span class="sync-status-label">{$t('settings.syncStatusLabel')}</span>
              <span class="sync-status-value" class:ok={displayedSyncStatus?.lastSyncStatus === 'ok'} class:err={displayedSyncStatus?.lastSyncStatus === 'failed'}>
                {#if syncRunning}
                  {syncStatusData?.phase ? $t(`sync.phase.${syncStatusData.phase}`) : $t('sync.syncing')}
                {:else if displayedSyncStatus?.lastSyncStatus === 'ok'}
                  {$t('sync.complete')}
                {:else if displayedSyncStatus?.lastSyncStatus}
                  {$t('sync.failed')}
                {:else}
                  —
                {/if}
              </span>
            </div>
            {#if displayedSyncStatus?.lastSyncPulled != null && displayedSyncStatus?.lastSyncStatus === 'ok'}
              <div class="sync-status-item">
                <span class="sync-status-label">{$t('settings.syncPulled')}</span>
                <span class="sync-status-value mono">{displayedSyncStatus.lastSyncPulled}</span>
              </div>
              <div class="sync-status-item">
                <span class="sync-status-label">{$t('settings.syncUploaded')}</span>
                <span class="sync-status-value mono">{displayedSyncStatus.lastSyncUploaded ?? 0}</span>
              </div>
            {/if}
            {#if displayedSyncStatus?.lastSyncError && displayedSyncStatus?.lastSyncStatus !== 'ok'}
              <div class="sync-status-item full">
                <span class="sync-status-label">{$t('settings.syncError')}</span>
                <span class="sync-status-value err">
                  {#if displayedSyncStatus.lastSyncError.includes('star') || displayedSyncStatus.lastSyncError.includes('Star') || displayedSyncStatus.lastSyncError.includes('STAR_REQUIRED')}
                    {$t('settings.syncStarRequired')}
                    <a href="https://github.com/juliantanx/aiusage" target="_blank" rel="noopener noreferrer" class="cloud-step-link">{$t('settings.syncCloudStep2')}</a>
                  {:else if displayedSyncStatus.lastSyncError.includes('bind') || displayedSyncStatus.lastSyncError.includes('GitHub') || displayedSyncStatus.lastSyncError.includes('GITHUB_BINDING')}
                    {$t('settings.syncGithubBindingRequired')}
                    <a href="https://aiusage.jtanx.com/settings#accounts" target="_blank" rel="noopener noreferrer" class="cloud-step-link">{$t('settings.syncCloudStep1')}</a>
                  {:else}
                    {displayedSyncStatus.lastSyncError}
                  {/if}
                </span>
              </div>
            {/if}
            {#if displayedSyncStatus?.lastSyncDurationMs != null && displayedSyncStatus?.lastSyncStatus === 'ok'}
              <div class="sync-status-item">
                <span class="sync-status-label">{$t('settings.syncDuration')}</span>
                <span class="sync-status-value mono">{(displayedSyncStatus.lastSyncDurationMs / 1000).toFixed(1)}s</span>
              </div>
            {/if}
            {#if displayedSyncStatus?.lastSyncPulled != null && displayedSyncStatus?.lastSyncStatus === 'ok'}
              <div class="sync-status-hint">{$t('settings.syncCountHint')}</div>
            {/if}
          </div>
          <div class="sync-action">
            {#if syncDirty && !syncRunning}
              <div class="sync-unsaved-warn">{$t('settings.syncUnsavedHint')}</div>
            {/if}
            <button class="btn-sync" on:click={handleSyncFromSettings} disabled={syncRunning || syncSaving || syncDirty}>
              {#if syncRunning}
                {syncStatusData?.phase ? $t(`sync.phase.${syncStatusData.phase}`) : $t('sync.syncing')}
                {#if syncStatusData?.pulledCount || syncStatusData?.uploadedCount}
                  <span class="sync-progress-counts">
                    {#if syncStatusData.pulledCount}↓{syncStatusData.pulledCount}{/if}
                    {#if syncStatusData.uploadedCount}↑{syncStatusData.uploadedCount}{/if}
                  </span>
                {/if}
              {:else}
                {syncSaving ? '...' : $t('settings.syncNow')}
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>

  </div>
{/if}

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: none;
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .sync-card { order: -1; }

  .group-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .group-title {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .group-title-row .group-title {
    margin-bottom: 0;
  }

  .platform-badge {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    background: var(--accent-dim);
    color: var(--accent);
    letter-spacing: 0.04em;
  }

  .source-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .source-group + .source-group {
    margin-top: 1rem;
    padding-top: 0.875rem;
    border-top: 1px solid var(--border-subtle);
  }

  .source-subtitle {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .field.full { grid-column: 1 / -1; }

  .field-label {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }
  .field-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .key-hint {
    font-family: var(--mono);
    font-size: 0.75rem;
    background: var(--raised);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .field-input {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 0.85rem;
    padding: 0 0.65rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    transition: border-color 0.15s;
    width: 100%;
    height: 32px;
  }
  .field-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .field-input.mono { font-family: var(--mono); font-size: 0.8rem; }

  select.field-input { cursor: pointer; appearance: auto; }

  .section-error {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--rose);
  }
  .section-error.compact { margin: 0.5rem 0 0 1.25rem; }

  .section-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--border-subtle);
  }

  .btn-save {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 1rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: var(--surface);
    cursor: pointer;
    transition: background 0.15s;
    min-width: 64px;
  }
  .btn-save:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .btn-save:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-save.saved {
    border-color: var(--green);
    background: transparent;
    color: var(--green);
  }

  .sync-status-section {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-subtle);
  }
  .sync-status-section .group-title {
    margin-bottom: 0.5rem;
  }
  .sync-status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.375rem 1.5rem;
  }
  .sync-status-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .sync-status-item.full {
    grid-column: 1 / -1;
  }
  .sync-status-label {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .sync-status-hint {
    grid-column: 1 / -1;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding-top: 0.125rem;
  }
  .sync-status-value {
    font-size: 0.8125rem;
    color: var(--text);
    text-align: right;
  }
  .sync-status-value.ok { color: var(--green); }
  .sync-status-value.err { color: var(--rose); }
  .sync-action {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }
  .sync-unsaved-warn {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--amber, #f59e0b);
    background: color-mix(in oklab, var(--amber, #f59e0b) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--amber, #f59e0b) 25%, transparent);
    border-radius: 6px;
    padding: 0.375rem 0.625rem;
  }
  .btn-sync {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 1rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn-sync:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn-sync:disabled { opacity: 0.55; cursor: not-allowed; }

  .sync-progress-counts {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
    margin-left: 0.25rem;
  }

  .auto-sync-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
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

  .toggle-row strong {
    display: block;
    color: var(--text);
    font-size: 0.8125rem;
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

  .state-msg { color: var(--text-muted); padding: 2rem; text-align: center; }
  .state-msg.error { color: var(--rose); }

  .cloud-setup {
    background: var(--raised);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    margin-bottom: 0.75rem;
  }
  .cloud-setup-title {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.625rem;
  }
  .cloud-steps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .cloud-step {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }
  .cloud-step-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--border-medium);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
    margin-top: 0.0625rem;
  }
  .cloud-step-body {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .cloud-step-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text);
  }
  .cloud-step-link {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .cloud-step-link:hover {
    text-decoration: underline;
  }
  .cloud-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    padding: 0.5rem 0;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .status-dot.ok {
    background: var(--green);
  }

  .credential-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .credential-row .field-input {
    flex: 1;
  }

  .btn-ghost {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s;
  }

  .btn-ghost:hover {
    color: var(--accent);
  }

  .btn-ghost:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .rate-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .rate-row .field-input { flex: 1; }

  .rate-time {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  .detected-tools-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .detected-tool {
    padding: 0.5rem 0.625rem;
    border-radius: 6px;
    background: var(--raised);
    border: 1px solid var(--border-subtle);
  }

  .detected-tool-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.green { background: var(--green); }
  .status-dot.yellow { background: var(--amber, #f59e0b); }
  .status-dot.gray { background: var(--text-muted); opacity: 0.4; }

  .detected-tool-name {
    font-family: var(--mono);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
  }

  .detected-tool-status {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-left: auto;
  }

  .not-found-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    color: var(--text-muted);
    background: none;
    border: none;
    padding: 0.375rem 0.25rem;
    cursor: pointer;
    transition: color 0.12s;
  }
  .not-found-toggle:hover {
    color: var(--text-secondary);
  }

  .not-found-chevron {
    font-size: 0.5rem;
    transition: transform 0.15s;
    display: inline-block;
  }
  .not-found-chevron.open {
    transform: rotate(90deg);
  }

  .detected-tool.not-found {
    opacity: 0.6;
  }

  .detected-tool-path {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.2rem;
    margin-left: 1.25rem;
    word-break: break-all;
  }

  .file-input { display: none; }

  .source-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
    margin-left: 1.25rem;
  }

  .import-btn {
    padding-left: 0;
  }

  .source-result {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--green);
  }

  @media (max-width: 640px) {
    .fields {
      grid-template-columns: 1fr;
    }
    .detected-tool-header,
    .source-actions {
      align-items: flex-start;
    }
    .detected-tool-status {
      margin-left: 0;
    }
    .detected-tool-header {
      flex-wrap: wrap;
    }
    .source-actions {
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
