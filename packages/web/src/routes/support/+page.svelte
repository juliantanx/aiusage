<script>
  import { t } from '$lib/i18n.js'
</script>

<svelte:head>
  <title>{$t('support.title')} · AIUsage</title>
</svelte:head>

<div class="page-header">
  <h1>{$t('support.title')}</h1>
  <p>{$t('support.desc')}</p>
</div>

<div class="support-grid">
  <section class="support-section">
    <h2>{$t('support.personal')}</h2>
    <div class="wechat-block">
        <img src="/wechat-support-qr.jpg" alt="WeChat QR" width="160" height="160" />
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
    <h2>{$t('support.groups')}</h2>
    <a class="support-row" href="https://discord.gg/freMjPK478" target="_blank" rel="noopener">
      <span>
        <strong>{$t('support.discord')}</strong>
        <small>{$t('support.discordHint')}</small>
      </span>
      <span class="open-label">{$t('support.open')} ↗</span>
    </a>
    <a class="support-row" href="https://chat.whatsapp.com/JteYkHfbvbcIeRppfCuQa7" target="_blank" rel="noopener">
      <span>
        <strong>{$t('support.whatsapp')}</strong>
        <small>{$t('support.whatsappHint')}</small>
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

  <section class="support-section">
    <h2>{$t('support.social')}</h2>
    <a class="support-row" href="https://www.facebook.com/juliantanx" target="_blank" rel="noopener">
      <span>
        <strong>{$t('support.facebook')}</strong>
        <small>facebook.com/juliantanx</small>
      </span>
      <span class="open-label">{$t('support.open')} ↗</span>
    </a>
  </section>
</div>

<style>
  .support-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    max-width: 980px;
  }

  .support-section {
    background: var(--surface);
    border-radius: 8px;
    padding: 1rem;
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
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: var(--raised);
    border-radius: 8px;
  }

  .wechat-block img {
    width: 160px;
    height: 160px;
    border-radius: 0;
    object-fit: contain;
    background: var(--surface);
  }

  .wechat-block h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.375rem;
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
    padding: 0.75rem;
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
    font-size: 0.6875rem;
    font-weight: 550;
  }

  @media (max-width: 900px) {
    .support-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .wechat-block {
      grid-template-columns: 1fr;
    }
  }
</style>
