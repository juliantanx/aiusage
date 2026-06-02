<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchConfig, saveConfig, fetchCredential, notifySettingsUpdated, refreshExchangeRate } from '$lib/api.js'
  import { displayCurrency, exchangeRate } from '$lib/stores.js'

  let loading = true
  let loadError = null

  // Form data — all strings for simplicity, coerced on save
  let general = { device: '', weekStart: 1, dashboardPollInterval: '', parseInterval: '' }
  let sources = { 'claude-code': '', codex: '', openclaw: '', opencode: '', hermes: '', qoder: '', 'qoder-db': '', cursor: '', 'kilocode-db': '' }
  let currentPlatform = ''
  let defaultPaths = {}
  let currentHostname = ''

  const PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

  // Sync form — credentialRef is derived automatically, never user-editable
  let syncData = { backend: '', repo: '', bucket: '', prefix: '', endpoint: '', region: '' }

  // GitHub credential state
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

  let dataSection = { retentionDays: '' }
  let effectiveDeviceName = ''

  // Currency settings
  // exchangeRate field stores USD→CNY (e.g. 7.30) for user display
  // Config stores CNY→USD (e.g. 0.137) internally
  let currency = { displayCurrency: 'USD', exchangeRate: '' }
  let cachedRate = 0.137 // CNY→USD, internal direction
  let cachedRateFetchedAt = null
  let rateRefreshing = false

  $: cachedRateUsdToCny = cachedRate ? (1 / cachedRate).toFixed(2) : ''
  $: rateLastUpdated = cachedRateFetchedAt
    ? new Date(cachedRateFetchedAt).toLocaleString()
    : null

  // Per-section save state
  let generalSaving = false; let generalError = ''; let generalSaved = false
  let sourcesSaving = false; let sourcesError = ''; let sourcesSaved = false
  let syncSaving = false;    let syncError = '';    let syncSaved = false
  let dataSaving = false;    let dataError = '';    let dataSaved = false
  let currencySaving = false; let currencyError = ''; let currencySaved = false

  // Credential key derivation — must match sync.ts createBackend()
  function ghKey(repo)    { return `github/${repo}/token` }
  function s3AkidKey(bucket) { return `s3/${bucket}/accessKeyId` }
  function s3SakKey(bucket)  { return `s3/${bucket}/secretAccessKey` }

  function resetAllCredentialState() {
    ghToken = ''; ghTokenVisible = false; ghTokenLoading = false; ghTokenIsSet = false
    s3AkidValue = ''; s3AkidVisible = false; s3AkidLoading = false; s3AkidIsSet = false
    s3SakValue = ''; s3SakVisible = false; s3SakLoading = false; s3SakIsSet = false
  }

  function onBackendChange() {
    resetAllCredentialState()
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
      const cfg = await fetchConfig()
      general = {
        device: cfg.device ?? '',
        weekStart: cfg.weekStart ?? 1,
        dashboardPollInterval: cfg.dashboardPollInterval != null ? String(cfg.dashboardPollInterval) : '',
        parseInterval: cfg.parseInterval != null ? String(cfg.parseInterval) : '',
      }
      sources = {
        'claude-code': cfg.sources?.['claude-code'] ?? '',
        codex: cfg.sources?.codex ?? '',
        openclaw: cfg.sources?.openclaw ?? '',
        opencode: cfg.sources?.opencode ?? '',
        hermes: cfg.sources?.hermes ?? '',
        qoder: cfg.sources?.qoder ?? '',
        'qoder-db': cfg.sources?.['qoder-db'] ?? '',
        cursor: cfg.sources?.cursor ?? '',
        'kilocode-db': cfg.sources?.['kilocode-db'] ?? '',
      }
      currentPlatform = cfg.platform ?? ''
      defaultPaths = cfg.defaultPaths ?? {}
      currentHostname = cfg.hostname ?? ''
      syncData = {
        backend: cfg.sync?.backend ?? '',
        repo: cfg.sync?.repo ?? '',
        bucket: cfg.sync?.bucket ?? '',
        prefix: cfg.sync?.prefix ?? '',
        endpoint: cfg.sync?.endpoint ?? '',
        region: cfg.sync?.region ?? '',
      }
      prevBackend = syncData.backend
      prevRepo = syncData.repo
      prevBucket = syncData.bucket

      const keys = cfg.credentialKeys ?? []
      // Check both the structured key (new UI) and credentialRef (old init command)
      const oldRef = cfg.sync?.credentialRef ?? ''
      ghTokenIsSet = !!(syncData.repo && (keys.includes(ghKey(syncData.repo)) || (oldRef && keys.includes(oldRef))))
      s3AkidIsSet  = !!(syncData.bucket && keys.includes(s3AkidKey(syncData.bucket)))
      s3SakIsSet   = !!(syncData.bucket && keys.includes(s3SakKey(syncData.bucket)))

      dataSection = { retentionDays: cfg.retentionDays != null ? String(cfg.retentionDays) : '' }
      effectiveDeviceName = cfg.device || currentHostname || 'hostname'

      // Load currency settings
      currency.displayCurrency = cfg.displayCurrency || 'USD'
      if (cfg.exchangeRateCache?.CNY_USD) {
        cachedRate = cfg.exchangeRateCache.CNY_USD
        cachedRateFetchedAt = cfg.exchangeRateCache.fetchedAt
      }
      // Show user-facing USD→CNY rate (invert stored CNY→USD)
      if (cfg.exchangeRate) {
        currency.exchangeRate = (1 / cfg.exchangeRate).toFixed(4)
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  async function saveGeneral() {
    generalSaving = true; generalError = ''
    try {
      await saveConfig({
        device: general.device || null,
        weekStart: Number(general.weekStart),
        dashboardPollInterval: general.dashboardPollInterval ? Number(general.dashboardPollInterval) : null,
        parseInterval: general.parseInterval ? Number(general.parseInterval) : null,
      })
      notifySettingsUpdated({
        dashboardPollInterval: general.dashboardPollInterval ? Number(general.dashboardPollInterval) : null,
        device: general.device || null,
        parseInterval: general.parseInterval ? Number(general.parseInterval) : null,
      })
      effectiveDeviceName = general.device || currentHostname || 'hostname'
      generalSaved = true
      setTimeout(() => { generalSaved = false }, 2000)
    } catch (e) {
      generalError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      generalSaving = false
    }
  }

  async function saveSources() {
    sourcesSaving = true; sourcesError = ''
    try {
      await saveConfig({ sources })
      sourcesSaved = true
      setTimeout(() => { sourcesSaved = false }, 2000)
    } catch (e) {
      sourcesError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      sourcesSaving = false
    }
  }

  async function saveSync() {
    syncSaving = true; syncError = ''
    try {
      // Build the sync config payload with auto-derived credentialRef
      let syncPayload = null
      if (syncData.backend === 'github' && syncData.repo) {
        syncPayload = {
          backend: 'github',
          repo: syncData.repo,
          credentialRef: ghKey(syncData.repo),
        }
      } else if (syncData.backend === 's3' && syncData.bucket) {
        syncPayload = {
          backend: 's3',
          bucket: syncData.bucket,
          prefix: syncData.prefix || null,
          endpoint: syncData.endpoint || null,
          region: syncData.region || null,
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

      const payload = { sync: syncPayload }
      if (Object.keys(credentials).length > 0) payload.credentials = credentials

      await saveConfig(payload)

      // Update isSet flags and clear entered values (don't expose creds in memory longer than needed)
      if (syncData.backend === 'github') {
        if (ghToken) { ghTokenIsSet = true; ghToken = ''; ghTokenVisible = false }
      } else if (syncData.backend === 's3') {
        if (s3AkidValue) { s3AkidIsSet = true; s3AkidValue = ''; s3AkidVisible = false }
        if (s3SakValue)  { s3SakIsSet  = true; s3SakValue  = ''; s3SakVisible  = false }
      }

      prevBackend = syncData.backend
      prevRepo    = syncData.repo
      prevBucket  = syncData.bucket

      syncSaved = true
      setTimeout(() => { syncSaved = false }, 2000)
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      syncSaving = false
    }
  }

  async function saveData() {
    dataSaving = true; dataError = ''
    try {
      await saveConfig({
        retentionDays: dataSection.retentionDays ? Number(dataSection.retentionDays) : null,
      })
      dataSaved = true
      setTimeout(() => { dataSaved = false }, 2000)
    } catch (e) {
      dataError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      dataSaving = false
    }
  }

  async function saveCurrency() {
    currencySaving = true; currencyError = ''
    try {
      // Convert user-facing USD→CNY to internal CNY→USD
      const userRate = currency.exchangeRate ? Number(currency.exchangeRate) : 0
      const internalRate = userRate > 0 ? 1 / userRate : null
      await saveConfig({
        displayCurrency: currency.displayCurrency,
        exchangeRate: internalRate,
      })
      displayCurrency.set(currency.displayCurrency)
      if (internalRate) {
        exchangeRate.set(internalRate)
      } else {
        // Use cached rate
        exchangeRate.set(cachedRate)
      }
      currencySaved = true
      setTimeout(() => { currencySaved = false }, 2000)
    } catch (e) {
      currencyError = e instanceof Error ? e.message : 'Save failed'
    } finally {
      currencySaving = false
    }
  }

  async function handleRefreshRate() {
    rateRefreshing = true
    try {
      const result = await refreshExchangeRate()
      cachedRate = result.rate
      cachedRateFetchedAt = result.fetchedAt
      // Update store if no manual override
      if (!currency.exchangeRate) {
        exchangeRate.set(result.rate)
      }
    } catch (e) {
      currencyError = e instanceof Error ? e.message : 'Refresh failed'
    } finally {
      rateRefreshing = false
    }
  }

  // Per-credential toggle helpers
  async function toggleGhToken() {
    syncError = ''
    if (!syncData.repo) return
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
    if (!syncData.bucket) return
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
    if (!syncData.bucket) return
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

  function btnLabel(saving, saved, t_save, t_saved) {
    if (saving) return '...'
    if (saved) return t_saved
    return t_save
  }
</script>

<svelte:head>
  <title>{$t('settings.title')} — AIUsage</title>
</svelte:head>

<div class="header-row">
  <h1 class="page-title">{$t('settings.title')}</h1>
</div>

{#if loading}
  <div class="state-msg">{$t('common.loading')}</div>
{:else if loadError}
  <div class="state-msg error">{loadError}</div>
{:else}
  <div class="sections">

    <!-- General -->
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
          <label class="field-label" for="field-poll-interval">{$t('settings.pollInterval')}</label>
          <input id="field-poll-interval" type="number" bind:value={general.dashboardPollInterval} class="field-input" placeholder="e.g. 30000" min="1000" />
        </div>
        <div class="field">
          <label class="field-label" for="field-parse-interval">{$t('settings.parseInterval')}</label>
          <input id="field-parse-interval" type="number" bind:value={general.parseInterval} class="field-input" placeholder="e.g. 5000" min="1000" />
        </div>
      </div>
      {#if generalError}<p class="section-error">{generalError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={generalSaved} on:click={saveGeneral} disabled={generalSaving}>
          {btnLabel(generalSaving, generalSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

    <!-- Sources -->
    <div class="card">
      <div class="group-title-row">
        <span class="group-title">{$t('settings.sources')}</span>
        {#if currentPlatform}
          <span class="platform-badge">{PLATFORM_LABEL[currentPlatform] ?? currentPlatform}</span>
        {/if}
      </div>
      <div class="fields">
        {#each [['claude-code', 'Claude Code'], ['codex', 'Codex'], ['openclaw', 'OpenClaw'], ['opencode', 'OpenCode'], ['hermes', 'Hermes'], ['qoder', 'Qoder (sessions dir)'], ['qoder-db', 'Qoder (local.db)'], ['cursor', 'Cursor'], ['kilocode-db', 'Kilo (kilo.db)']] as [key, label]}
          <div class="field full">
            <label class="field-label" for="field-source-{key}">{label}</label>
            <div class="field-hint">{$t('settings.sourcePath')}</div>
            <input id="field-source-{key}" type="text" bind:value={sources[key]} class="field-input mono" placeholder={defaultPaths[key] ?? ''} />
          </div>
        {/each}
      </div>
      {#if sourcesError}<p class="section-error">{sourcesError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={sourcesSaved} on:click={saveSources} disabled={sourcesSaving}>
          {btnLabel(sourcesSaving, sourcesSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

    <!-- Sync -->
    <div class="card">
      <div class="group-title">{$t('settings.sync')}</div>
      <div class="field-hint">{$t('settings.syncHint')}</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="field-sync-backend">{$t('settings.syncBackend')}</label>
          <select id="field-sync-backend" bind:value={syncData.backend} class="field-input" on:change={onBackendChange}>
            <option value="">{$t('settings.syncBackendNone')}</option>
            <option value="github">GitHub</option>
            <option value="s3">S3 / Compatible</option>
          </select>
        </div>

        {#if syncData.backend === 'github'}
          <div class="field">
            <label class="field-label" for="field-sync-repo">{$t('settings.syncRepo')}</label>
            <input id="field-sync-repo" type="text" bind:value={syncData.repo} class="field-input mono"
              placeholder="owner/repo" on:input={onRepoChange} />
          </div>
          {#if syncData.repo}
            <div class="field full">
              <label class="field-label" for="field-gh-token">GitHub Token</label>
              <div class="field-hint">Stored as <code class="key-hint">{ghKey(syncData.repo)}</code></div>
              <div class="credential-row">
                <input id="field-gh-token" type={ghTokenVisible ? 'text' : 'password'}
                  value={ghToken} on:input={e => ghToken = e.target.value}
                  class="field-input mono" autocomplete="new-password"
                  placeholder={ghTokenIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
                <button type="button" class="btn-ghost" on:click={toggleGhToken}
                  disabled={ghTokenLoading}>
                  {#if ghTokenLoading}...{:else if ghTokenVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
                </button>
              </div>
            </div>
          {/if}
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
            <input id="field-sync-region" type="text" bind:value={syncData.region} class="field-input mono" placeholder="us-east-1" />
          </div>
          {#if syncData.bucket}
            <div class="field full">
              <label class="field-label" for="field-s3-akid">Access Key ID</label>
              <div class="field-hint">Stored as <code class="key-hint">{s3AkidKey(syncData.bucket)}</code></div>
              <div class="credential-row">
                <input id="field-s3-akid" type={s3AkidVisible ? 'text' : 'password'}
                  value={s3AkidValue} on:input={e => s3AkidValue = e.target.value}
                  class="field-input mono" autocomplete="new-password"
                  placeholder={s3AkidIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
                <button type="button" class="btn-ghost" on:click={toggleS3Akid}
                  disabled={s3AkidLoading}>
                  {#if s3AkidLoading}...{:else if s3AkidVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
                </button>
              </div>
            </div>
            <div class="field full">
              <label class="field-label" for="field-s3-sak">Secret Access Key</label>
              <div class="field-hint">Stored as <code class="key-hint">{s3SakKey(syncData.bucket)}</code></div>
              <div class="credential-row">
                <input id="field-s3-sak" type={s3SakVisible ? 'text' : 'password'}
                  value={s3SakValue} on:input={e => s3SakValue = e.target.value}
                  class="field-input mono" autocomplete="new-password"
                  placeholder={s3SakIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')} />
                <button type="button" class="btn-ghost" on:click={toggleS3Sak}
                  disabled={s3SakLoading}>
                  {#if s3SakLoading}...{:else if s3SakVisible}{$t('settings.hideCredential')}{:else}{$t('settings.showCredential')}{/if}
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
      {#if syncError}<p class="section-error">{syncError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={syncSaved} on:click={saveSync} disabled={syncSaving}>
          {btnLabel(syncSaving, syncSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

    <!-- Data -->
    <div class="card">
      <div class="group-title">{$t('settings.data')}</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="field-retention-days">{$t('settings.retentionDays')}</label>
          <div class="field-hint">{$t('settings.retentionHint')}</div>
          <input id="field-retention-days" type="number" bind:value={dataSection.retentionDays} class="field-input" placeholder={$t('settings.retentionPlaceholder')} min="0" />
        </div>
      </div>
      {#if dataError}<p class="section-error">{dataError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={dataSaved} on:click={saveData} disabled={dataSaving}>
          {btnLabel(dataSaving, dataSaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

    <!-- Currency -->
    <div class="card">
      <div class="group-title">{$t('settings.currency')}</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="field-display-currency">{$t('settings.displayCurrency')}</label>
          <select id="field-display-currency" bind:value={currency.displayCurrency} class="field-input">
            <option value="USD">USD ($)</option>
            <option value="CNY">CNY (¥)</option>
          </select>
        </div>
        {#if currency.displayCurrency === 'CNY'}
          <div class="field">
            <label class="field-label" for="field-exchange-rate">
              {$t('settings.exchangeRate')} (1 USD = ? CNY)
            </label>
            <div class="rate-row">
              <input id="field-exchange-rate" type="number" step="0.01" min="0"
                bind:value={currency.exchangeRate} class="field-input"
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
      {#if currencyError}<p class="section-error">{currencyError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={currencySaved} on:click={saveCurrency} disabled={currencySaving}>
          {btnLabel(currencySaving, currencySaved, $t('settings.save'), $t('settings.saved'))}
        </button>
      </div>
    </div>

  </div>
{/if}

<style>
  .header-row {
    display: flex;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .page-title {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem;
    transition: background 0.2s;
  }

  .group-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .group-title {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .group-title-row .group-title {
    margin-bottom: 0;
  }

  .platform-badge {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    background: var(--accent-dim);
    color: var(--accent);
    letter-spacing: 0.04em;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
  }

  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  .field.full { grid-column: 1 / -1; }

  .field-label {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }
  .field-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: -0.1rem;
  }

  .key-hint {
    font-family: var(--mono);
    font-size: 0.7rem;
    background: var(--raised);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .field-input {
    font-family: 'Instrument Sans', sans-serif;
    font-size: 0.85rem;
    padding: 0 0.65rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    transition: border-color 0.2s;
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
    margin-top: 0.75rem;
    font-size: 0.8rem;
    color: var(--rose);
  }

  .section-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-subtle);
  }

  .btn-save {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.45rem 1.1rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: var(--surface);
    cursor: pointer;
    transition: background 0.2s;
    min-width: 72px;
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

  .state-msg { color: var(--text-muted); padding: 2rem; text-align: center; }
  .state-msg.error { color: var(--rose); }

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
    padding: 0.45rem 0.9rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s;
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
    font-size: 0.6875rem;
    margin-left: 0.25rem;
  }
</style>
