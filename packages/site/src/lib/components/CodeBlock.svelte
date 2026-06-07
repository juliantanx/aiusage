<script>
  export let lang = 'Terminal'
  export let code = ''
  export let copyText = ''
  export let id = ''

  let copied = false

  function copy() {
    const text = copyText || code
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      copied = true
      setTimeout(() => copied = false, 2000)
    })
  }
</script>

<div class="cb" {id}>
  <div class="cb-head">
    <span class="cb-lang">{lang}</span>
    {#if copyText || code}
      <button class="cb-copy" class:copied on:click={copy}>
        {copied ? '✓ copied' : 'copy'}
      </button>
    {/if}
  </div>
  <div class="cb-body">
    <div class="cb-gutter" aria-hidden="true">
      <slot name="lines" />
    </div>
    <pre class="cb-pre"><code>{#if code}{code}{:else}<slot />{/if}</code></pre>
  </div>
</div>

<style>
  .cb {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid oklch(0.22 0.012 85);
    margin: 1rem 0;
    background: oklch(0.145 0.012 85);
    box-shadow:
      0 2px 8px oklch(0 0 0 / 0.08),
      inset 0 1px 0 oklch(1 0 0 / 0.03);
  }

  .cb-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: oklch(0.17 0.013 85);
    border-bottom: 1px solid oklch(0.22 0.012 85);
  }

  .cb-lang {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: oklch(0.48 0.01 85);
  }

  .cb-copy {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(0.55 0.01 85);
    background: oklch(0.2 0.01 85);
    border: 1px solid oklch(0.28 0.01 85);
    border-radius: 4px;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cb-copy:hover {
    color: oklch(0.85 0.01 85);
    border-color: oklch(0.4 0.01 85);
    background: oklch(0.24 0.01 85);
  }

  .cb-copy.copied {
    color: oklch(0.72 0.16 155);
    border-color: oklch(0.45 0.12 155);
  }

  .cb-body {
    display: flex;
    overflow-x: auto;
  }

  .cb-gutter {
    flex-shrink: 0;
    padding: 1.125rem 0;
    padding-left: 1rem;
    padding-right: 0.875rem;
    border-right: 1px solid oklch(0.2 0.01 85);
    user-select: none;
    text-align: right;
    color: oklch(0.35 0.008 85);
    font-family: var(--mono);
    font-size: 0.8125rem;
    line-height: 1.7;
  }

  .cb-gutter :global(span) {
    display: block;
  }

  .cb-pre {
    margin: 0;
    border: none;
    border-radius: 0;
    padding: 1.125rem 1.25rem;
    flex: 1;
    min-width: 0;
    background: transparent;
    font-size: 0.8125rem;
    line-height: 1.7;
  }

  .cb-pre :global(.tk-cmt) { color: oklch(0.48 0.01 85); }
  .cb-pre :global(.tk-kw) { color: oklch(0.7 0.14 300); }
  .cb-pre :global(.tk-str) { color: oklch(0.7 0.16 155); }
  .cb-pre :global(.tk-flg) { color: oklch(0.68 0.12 250); }
</style>
