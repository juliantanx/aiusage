<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.js'
  import { fetchConfig, saveConfig, fetchCredential, notifySettingsUpdated } from '$lib/api.js'

  let loading = true
  let loadError = null

  // Form data — all strings for simplicity, coerced on save
  let general = { device: '', weekStart: 1, dashboardPollInterval: '', parseInterval: '' }
  let sources = { 'claude-code': '', codex: '', openclaw: '', opencode: '' }
  let syncData = { backend: '', repo: '', bucket: '', prefix: '', endpoint: '', region: '', credentialRef: '' }
  let credentialValue = ''
  let credentialIsSet = false
  let credentialVisible = false
  let credentialLoading = false
  let lastCredentialRef = ''
  let dataSection = { retentionDays: '' }
  let effectiveDeviceName = ''

  // Per-section save state
  let generalSaving = false; let generalError = ''; let generalSaved = false
  let sourcesSaving = false; let sourcesError = ''; let sourcesSaved = false
  let syncSaving = false;    let syncError = '';    let syncSaved = false
  let dataSaving = false;    let dataError = '';    let dataSaved = false

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
      }
      syncData = {
        backend: cfg.sync?.backend ?? '',
        repo: cfg.sync?.repo ?? '',
        bucket: cfg.sync?.bucket ?? '',
        prefix: cfg.sync?.prefix ?? '',
        endpoint: cfg.sync?.endpoint ?? '',
        region: cfg.sync?.region ?? '',
        credentialRef: cfg.sync?.credentialRef ?? '',
      }
      credentialIsSet = !!(cfg.sync?.credentialRef && cfg.credentialKeys?.includes(cfg.sync.credentialRef))
      lastCredentialRef = cfg.sync?.credentialRef ?? ''
      dataSection = { retentionDays: cfg.retentionDays != null ? String(cfg.retentionDays) : '' }
      effectiveDeviceName = cfg.device || 'hostname'
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
      effectiveDeviceName = general.device || 'hostname'
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
    maybeResetCredentialForRefChange()
    syncSaving = true; syncError = ''
    try {
      const payload = { sync: syncData.backend ? { ...syncData } : null }
      if (credentialValue && syncData.credentialRef) {
        payload.credentials = { [syncData.credentialRef]: credentialValue }
      }
      await saveConfig(payload)
      syncSaved = true
      credentialIsSet = !!syncData.credentialRef
      lastCredentialRef = syncData.credentialRef ?? ''
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

  function resetCredentialReveal() {
    credentialValue = ''
    credentialVisible = false
    credentialLoading = false
  }

  function maybeResetCredentialForRefChange() {
    if (syncData.credentialRef !== lastCredentialRef) {
      lastCredentialRef = syncData.credentialRef
      resetCredentialReveal()
    }
  }

  async function toggleCredentialVisibility() {
    syncError = ''

    if (!syncData.credentialRef) return

    if (credentialVisible) {
      credentialVisible = false
      return
    }

    if (credentialValue) {
      credentialVisible = true
      return
    }

    credentialLoading = true
    try {
      const data = await fetchCredential(syncData.credentialRef)
      credentialValue = data.value ?? ''
      credentialVisible = true
      credentialIsSet = !!credentialValue
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Failed to load credential'
    } finally {
      credentialLoading = false
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
          <div class="field-hint">{$t('settings.deviceHint')}</div>
          <input id="field-device" type="text" bind:value={general.device} class="field-input" placeholder="hostname" />
          <div class="field-hint">Effective device name: {effectiveDeviceName}</div>
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
      <div class="group-title">{$t('settings.sources')}</div>
      <div class="fields">
        {#each [['claude-code', 'Claude Code'], ['codex', 'Codex'], ['openclaw', 'OpenClaw'], ['opencode', 'OpenCode']] as [key, label]}
          <div class="field full">
            <label class="field-label" for="field-source-{key}">{label}</label>
            <div class="field-hint">{$t('settings.sourcePath')}</div>
            <input id="field-source-{key}" type="text" bind:value={sources[key]} class="field-input mono" placeholder="~/.claude/projects" />
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
          <select id="field-sync-backend" bind:value={syncData.backend} class="field-input">
            <option value="">{$t('settings.syncBackendNone')}</option>
            <option value="github">GitHub</option>
            <option value="s3">S3 / Compatible</option>
          </select>
        </div>
        {#if syncData.backend === 'github'}
          <div class="field">
            <label class="field-label" for="field-sync-repo">{$t('settings.syncRepo')}</label>
            <input id="field-sync-repo" type="text" bind:value={syncData.repo} class="field-input mono" placeholder="owner/repo" />
          </div>
        {/if}
        {#if syncData.backend === 's3'}
          <div class="field">
            <label class="field-label" for="field-sync-bucket">{$t('settings.syncBucket')}</label>
            <input id="field-sync-bucket" type="text" bind:value={syncData.bucket} class="field-input mono" placeholder="my-bucket" />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-endpoint">{$t('settings.syncEndpoint')}</label>
            <input id="field-sync-endpoint" type="text" bind:value={syncData.endpoint} class="field-input mono" placeholder="https://s3.amazonaws.com" />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-region">{$t('settings.syncRegion')}</label>
            <input id="field-sync-region" type="text" bind:value={syncData.region} class="field-input mono" placeholder="us-east-1" />
          </div>
        {/if}
        {#if syncData.backend}
          <div class="field">
            <label class="field-label" for="field-sync-prefix">{$t('settings.syncPrefix')}</label>
            <input id="field-sync-prefix" type="text" bind:value={syncData.prefix} class="field-input mono" placeholder="aiusage/" />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-credential-ref">{$t('settings.syncCredentialRef')}</label>
            <input id="field-sync-credential-ref" type="text" bind:value={syncData.credentialRef} class="field-input mono" placeholder="GITHUB_TOKEN" on:input={maybeResetCredentialForRefChange} />
          </div>
          <div class="field">
            <label class="field-label" for="field-sync-credential-value">{$t('settings.syncCredentialValue')}</label>
            <div class="credential-row">
              <input
                id="field-sync-credential-value"
                type={credentialVisible ? 'text' : 'password'}
                value={credentialValue}
                on:input={e => credentialValue = e.target.value}
                class="field-input mono"
                placeholder={credentialIsSet ? $t('settings.credentialSet') : $t('settings.credentialNotSet')}
              />
              <button
                type="button"
                class="btn-secondary"
                on:click={toggleCredentialVisibility}
                disabled={!syncData.credentialRef || credentialLoading}
              >
                {#if credentialLoading}
                  ...
                {:else if credentialVisible}
                  {$t('settings.hideCredential')}
                {:else}
                  {$t('settings.showCredential')}
                {/if}
              </button>
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
    </div>

    <!-- Data -->
    <div class="card">
      <div class="group-title">{$t('settings.data')}</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="field-retention-days">{$t('settings.retentionDays')}</label>
          <div class="field-hint">{$t('settings.retentionHint')}</div>
          <input id="field-retention-days" type="number" bind:value={dataSection.retentionDays} class="field-input" placeholder="0" min="0" />
        </div>
      </div>
      {#if dataError}<p class="section-error">{dataError}</p>{/if}
      <div class="section-footer">
        <button class="btn-save" class:saved={dataSaved} on:click={saveData} disabled={dataSaving}>
          {btnLabel(dataSaving, dataSaved, $t('settings.save'), $t('settings.saved'))}
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
    color: var(--text-primary);
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 1.25rem;
    transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--border-medium); }

  .group-title {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 1rem;
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
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }
  .field-hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: -0.1rem;
  }

  .field-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    padding: 0.45rem 0.65rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--text-primary);
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
  }
  .field-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-dim);
  }
  .field-input.mono { font-family: var(--mono); font-size: 0.8rem; }

  select.field-input { cursor: pointer; }

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
    background: var(--accent-dim);
    color: var(--accent);
    cursor: pointer;
    transition: all 0.15s;
    min-width: 72px;
  }
  .btn-save:hover:not(:disabled) {
    background: var(--accent);
    color: #000;
  }
  .btn-save:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-save.saved {
    border-color: var(--green);
    background: var(--green-dim);
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

  .btn-secondary {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-secondary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
