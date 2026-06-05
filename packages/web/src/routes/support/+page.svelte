<script>
  import { t } from '$lib/i18n.js'

  let qrOpen = false

  function openQr() {
    qrOpen = true
  }

  function closeQr() {
    qrOpen = false
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && qrOpen) closeQr()
  }

  function handleScrimClick(e) {
    if (e.target === e.currentTarget) closeQr()
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<svelte:head>
  <title>{$t('support.title')} · AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('support.title')}</h1>
  <p>{$t('support.desc')}</p>
</div>

<div class="support-layout">
  <section class="support-section wechat-section">
    <h2>{$t('support.personal')}</h2>
    <div class="wechat-block">
      <button class="qr-trigger" on:click={openQr} aria-label={$t('support.qrExpand')}>
        <img src="/wechat-support-qr.jpg" alt="WeChat QR" width="180" height="180" />
      </button>
      <div>
        <h3>{$t('support.wechat')}</h3>
        <p>{$t('support.wechatHint')}</p>
      </div>
    </div>
    <a class="support-row" href="mailto:hi@jtanx.com">
      <span>
        <strong>{$t('support.email')}</strong>
        <small>hi@jtanx.com</small>
      </span>
      <span class="open-label">{$t('support.open')} ↗</span>
    </a>
  </section>

  <section class="support-section">
    <h2>{$t('support.community')}</h2>
    <a class="support-row" href="https://discord.gg/freMjPK478" target="_blank" rel="noopener">
      <span>
        <strong>{$t('support.discord')}</strong>
        <small>{$t('support.discordHint')}</small>
      </span>
      <span class="open-label">{$t('support.open')} ↗</span>
    </a>
    <a class="support-row" href="https://t.me/+DWaxtoPB7CY2Yjc1" target="_blank" rel="noopener">
      <span>
        <strong>{$t('support.telegram')}</strong>
        <small>{$t('support.telegramHint')}</small>
      </span>
      <span class="open-label">{$t('support.open')} ↗</span>
    </a>
  </section>
</div>

{#if qrOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="qr-overlay" role="dialog" aria-modal="true" aria-label={$t('support.wechat')} on:click={handleScrimClick}>
    <div class="qr-card">
      <img src="/wechat-support-qr.jpg" alt="WeChat QR" width="280" height="280" />
      <p class="qr-card-hint">{$t('support.qrScanHint')}</p>
      <button class="qr-close" on:click={closeQr} aria-label="Close">&times;</button>
    </div>
  </div>
{/if}

<style>
  .support-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .support-section {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem;
  }

  .support-section h2 {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .wechat-block {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.25rem;
    background: var(--raised);
    border-radius: 8px;
  }

  .qr-trigger {
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    transition: opacity 0.15s;
  }

  .qr-trigger:hover {
    opacity: 0.8;
  }

  .qr-trigger img {
    display: block;
    width: 180px;
    height: 180px;
    object-fit: contain;
    background: var(--surface);
    border-radius: 4px;
  }

  .wechat-block h3 {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.25rem;
  }

  .wechat-block p {
    color: var(--text-secondary);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  .support-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0.75rem;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    transition: background 0.12s;
  }

  .support-row:hover {
    background: var(--hover);
  }

  .support-row strong {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.125rem;
  }

  .support-row small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.35;
  }

  .open-label {
    flex-shrink: 0;
    color: var(--accent);
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 550;
  }

  /* ── QR Lightbox ──────────────────────────────────────────────────────── */
  .qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    background: oklch(0 0 0 / 0.35);
  }

  .qr-card {
    position: relative;
    background: var(--surface);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    box-shadow: 0 4px 8px oklch(0 0 0 / 0.06), 0 12px 32px oklch(0 0 0 / 0.04);
  }

  .qr-card img {
    display: block;
    width: 280px;
    height: 280px;
    object-fit: contain;
    border-radius: 4px;
  }

  .qr-card-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    text-align: center;
  }

  .qr-close {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    transition: color 0.12s;
  }

  .qr-close:hover {
    color: var(--text);
  }

  @media (max-width: 640px) {
    .support-layout {
      grid-template-columns: 1fr;
    }

    .wechat-block {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
