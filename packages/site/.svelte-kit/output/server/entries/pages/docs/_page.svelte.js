import { c as create_ssr_component, f as createEventDispatcher, e as escape, d as each, b as add_attribute, a as subscribe, h as add_styles, v as validate_component } from "../../../chunks/ssr.js";
import { l as lang } from "../../../chunks/lang.js";
const css$4 = {
  code: ".toc.svelte-1ikqbmv.svelte-1ikqbmv{padding:0 1rem 0 0;border-right:1px solid var(--border-subtle)}.toc-head.svelte-1ikqbmv.svelte-1ikqbmv{display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem 0.75rem;margin-bottom:0.25rem;border-bottom:1px solid var(--border-subtle)}.toc-head-icon.svelte-1ikqbmv.svelte-1ikqbmv{font-family:var(--mono);font-size:0.8125rem;color:var(--accent);font-weight:700}.toc-head-text.svelte-1ikqbmv.svelte-1ikqbmv{font-family:var(--mono);font-size:0.6875rem;font-weight:550;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}.toc-list.svelte-1ikqbmv.svelte-1ikqbmv{display:flex;flex-direction:column;padding-top:0.5rem}.toc-group.svelte-1ikqbmv.svelte-1ikqbmv{margin-bottom:1px}.toc-l1.svelte-1ikqbmv.svelte-1ikqbmv{display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;font-family:inherit;font-size:0.8125rem;font-weight:500;color:var(--text-muted);padding:0.5rem 0.75rem;border-radius:6px;cursor:pointer;transition:color 0.15s ease, background 0.15s ease;background:transparent;border:none}.toc-l1.svelte-1ikqbmv.svelte-1ikqbmv:hover{color:var(--text);background:var(--hover)}.toc-l1.active.svelte-1ikqbmv.svelte-1ikqbmv{color:var(--text);font-weight:700;background:var(--hover)}.toc-idx.svelte-1ikqbmv.svelte-1ikqbmv{font-family:var(--mono);font-size:0.625rem;font-weight:600;color:var(--text-muted);opacity:0.5;min-width:1.25rem;letter-spacing:0.02em}.toc-l1.active.svelte-1ikqbmv .toc-idx.svelte-1ikqbmv{color:var(--accent);opacity:1}.toc-label.svelte-1ikqbmv.svelte-1ikqbmv{flex:1}.toc-arrow.svelte-1ikqbmv.svelte-1ikqbmv{font-size:0.75rem;color:var(--text-muted);transition:transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;transform:rotate(0deg);display:inline-block;flex-shrink:0}.toc-arrow.open.svelte-1ikqbmv.svelte-1ikqbmv{transform:rotate(90deg)}.toc-children.svelte-1ikqbmv.svelte-1ikqbmv{padding-left:1.5rem;padding-right:0.75rem;margin-bottom:0.25rem;animation:svelte-1ikqbmv-tocFade 0.15s ease-out}@keyframes svelte-1ikqbmv-tocFade{from{opacity:0}to{opacity:1}}.toc-l2.svelte-1ikqbmv.svelte-1ikqbmv{display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;font-family:var(--mono);font-size:0.75rem;color:var(--text-muted);padding:0.35rem 0.5rem;border-radius:4px;cursor:pointer;transition:color 0.15s ease, background 0.15s ease;background:transparent;border:none}.toc-l2.svelte-1ikqbmv.svelte-1ikqbmv:hover{color:var(--text-secondary);background:var(--hover)}.toc-l2.active.svelte-1ikqbmv.svelte-1ikqbmv{color:var(--accent);font-weight:600}.toc-dot.svelte-1ikqbmv.svelte-1ikqbmv{width:4px;height:4px;border-radius:50%;background:var(--border-medium);flex-shrink:0;transition:background 0.15s ease, width 0.15s ease, height 0.15s ease}.toc-dot.active.svelte-1ikqbmv.svelte-1ikqbmv{background:var(--accent);width:6px;height:6px}",
  map: `{"version":3,"file":"TableOfContents.svelte","sources":["TableOfContents.svelte"],"sourcesContent":["<script>\\n  import { createEventDispatcher } from 'svelte'\\n  export let sections = []\\n  export let activeSection = ''\\n  export let expandedSections = new Set()\\n  export let zh = false\\n\\n  const dispatch = createEventDispatcher()\\n\\n  function scrollTo(id) {\\n    dispatch('navigate', { id })\\n  }\\n\\n  function toggleExpand(id) {\\n    dispatch('toggle', { id })\\n  }\\n<\/script>\\n\\n<nav class=\\"toc\\">\\n  <div class=\\"toc-head\\">\\n    <span class=\\"toc-head-icon\\">§</span>\\n    <span class=\\"toc-head-text\\">{zh ? '目录' : 'On this page'}</span>\\n  </div>\\n\\n  <div class=\\"toc-list\\">\\n    {#each sections as s, i}\\n      <div class=\\"toc-group\\">\\n        <button\\n          class=\\"toc-l1\\"\\n          class:active={activeSection === s.id || s.children?.some(c => c.id === activeSection)}\\n          on:click={() => { if (s.children?.length) toggleExpand(s.id); else scrollTo(s.id) }}\\n        >\\n          <span class=\\"toc-idx\\">{String(i + 1).padStart(2, '0')}</span>\\n          <span class=\\"toc-label\\">{zh ? s.zh : s.en}</span>\\n          {#if s.children?.length}\\n            <span class=\\"toc-arrow\\" class:open={expandedSections.has(s.id)}>›</span>\\n          {/if}\\n        </button>\\n\\n        {#if s.children?.length && expandedSections.has(s.id)}\\n          <div class=\\"toc-children\\">\\n            {#each s.children as c}\\n              <button\\n                class=\\"toc-l2\\"\\n                class:active={activeSection === c.id}\\n                on:click={() => scrollTo(c.id)}\\n              >\\n                <span class=\\"toc-dot\\" class:active={activeSection === c.id}></span>\\n                {zh ? c.zh : c.en}\\n              </button>\\n            {/each}\\n          </div>\\n        {/if}\\n      </div>\\n    {/each}\\n  </div>\\n</nav>\\n\\n<style>\\n  .toc {\\n    padding: 0 1rem 0 0;\\n    border-right: 1px solid var(--border-subtle);\\n  }\\n\\n  .toc-head {\\n    display: flex;\\n    align-items: center;\\n    gap: 0.5rem;\\n    padding: 0.5rem 0.75rem 0.75rem;\\n    margin-bottom: 0.25rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n  }\\n\\n  .toc-head-icon {\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    color: var(--accent);\\n    font-weight: 700;\\n  }\\n\\n  .toc-head-text {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 550;\\n    text-transform: uppercase;\\n    letter-spacing: 0.08em;\\n    color: var(--text-muted);\\n  }\\n\\n  .toc-list {\\n    display: flex;\\n    flex-direction: column;\\n    padding-top: 0.5rem;\\n  }\\n\\n  .toc-group {\\n    margin-bottom: 1px;\\n  }\\n\\n  .toc-l1 {\\n    display: flex;\\n    align-items: center;\\n    gap: 0.5rem;\\n    width: 100%;\\n    text-align: left;\\n    font-family: inherit;\\n    font-size: 0.8125rem;\\n    font-weight: 500;\\n    color: var(--text-muted);\\n    padding: 0.5rem 0.75rem;\\n    border-radius: 6px;\\n    cursor: pointer;\\n    transition: color 0.15s ease, background 0.15s ease;\\n    background: transparent;\\n    border: none;\\n  }\\n\\n  .toc-l1:hover {\\n    color: var(--text);\\n    background: var(--hover);\\n  }\\n\\n  .toc-l1.active {\\n    color: var(--text);\\n    font-weight: 700;\\n    background: var(--hover);\\n  }\\n\\n  .toc-idx {\\n    font-family: var(--mono);\\n    font-size: 0.625rem;\\n    font-weight: 600;\\n    color: var(--text-muted);\\n    opacity: 0.5;\\n    min-width: 1.25rem;\\n    letter-spacing: 0.02em;\\n  }\\n\\n  .toc-l1.active .toc-idx {\\n    color: var(--accent);\\n    opacity: 1;\\n  }\\n\\n  .toc-label {\\n    flex: 1;\\n  }\\n\\n  .toc-arrow {\\n    font-size: 0.75rem;\\n    color: var(--text-muted);\\n    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;\\n    transform: rotate(0deg);\\n    display: inline-block;\\n    flex-shrink: 0;\\n  }\\n\\n  .toc-arrow.open {\\n    transform: rotate(90deg);\\n  }\\n\\n  .toc-children {\\n    padding-left: 1.5rem;\\n    padding-right: 0.75rem;\\n    margin-bottom: 0.25rem;\\n    animation: tocFade 0.15s ease-out;\\n  }\\n\\n  @keyframes tocFade {\\n    from { opacity: 0; }\\n    to { opacity: 1; }\\n  }\\n\\n  .toc-l2 {\\n    display: flex;\\n    align-items: center;\\n    gap: 0.5rem;\\n    width: 100%;\\n    text-align: left;\\n    font-family: var(--mono);\\n    font-size: 0.75rem;\\n    color: var(--text-muted);\\n    padding: 0.35rem 0.5rem;\\n    border-radius: 4px;\\n    cursor: pointer;\\n    transition: color 0.15s ease, background 0.15s ease;\\n    background: transparent;\\n    border: none;\\n  }\\n\\n  .toc-l2:hover {\\n    color: var(--text-secondary);\\n    background: var(--hover);\\n  }\\n\\n  .toc-l2.active {\\n    color: var(--accent);\\n    font-weight: 600;\\n  }\\n\\n  .toc-dot {\\n    width: 4px;\\n    height: 4px;\\n    border-radius: 50%;\\n    background: var(--border-medium);\\n    flex-shrink: 0;\\n    transition: background 0.15s ease, width 0.15s ease, height 0.15s ease;\\n  }\\n\\n  .toc-dot.active {\\n    background: var(--accent);\\n    width: 6px;\\n    height: 6px;\\n  }\\n</style>\\n"],"names":[],"mappings":"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"}`
};
const TableOfContents = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { sections = [] } = $$props;
  let { activeSection = "" } = $$props;
  let { expandedSections = /* @__PURE__ */ new Set() } = $$props;
  let { zh = false } = $$props;
  createEventDispatcher();
  if ($$props.sections === void 0 && $$bindings.sections && sections !== void 0) $$bindings.sections(sections);
  if ($$props.activeSection === void 0 && $$bindings.activeSection && activeSection !== void 0) $$bindings.activeSection(activeSection);
  if ($$props.expandedSections === void 0 && $$bindings.expandedSections && expandedSections !== void 0) $$bindings.expandedSections(expandedSections);
  if ($$props.zh === void 0 && $$bindings.zh && zh !== void 0) $$bindings.zh(zh);
  $$result.css.add(css$4);
  return `<nav class="toc svelte-1ikqbmv"><div class="toc-head svelte-1ikqbmv"><span class="toc-head-icon svelte-1ikqbmv" data-svelte-h="svelte-it6fet">§</span> <span class="toc-head-text svelte-1ikqbmv">${escape(zh ? "目录" : "On this page")}</span></div> <div class="toc-list svelte-1ikqbmv">${each(sections, (s, i) => {
    return `<div class="toc-group svelte-1ikqbmv"><button class="${[
      "toc-l1 svelte-1ikqbmv",
      activeSection === s.id || s.children?.some((c) => c.id === activeSection) ? "active" : ""
    ].join(" ").trim()}"><span class="toc-idx svelte-1ikqbmv">${escape(String(i + 1).padStart(2, "0"))}</span> <span class="toc-label svelte-1ikqbmv">${escape(zh ? s.zh : s.en)}</span> ${s.children?.length ? `<span class="${["toc-arrow svelte-1ikqbmv", expandedSections.has(s.id) ? "open" : ""].join(" ").trim()}" data-svelte-h="svelte-tiuete">›</span>` : ``}</button> ${s.children?.length && expandedSections.has(s.id) ? `<div class="toc-children svelte-1ikqbmv">${each(s.children, (c) => {
      return `<button class="${["toc-l2 svelte-1ikqbmv", activeSection === c.id ? "active" : ""].join(" ").trim()}"><span class="${["toc-dot svelte-1ikqbmv", activeSection === c.id ? "active" : ""].join(" ").trim()}"></span> ${escape(zh ? c.zh : c.en)} </button>`;
    })} </div>` : ``} </div>`;
  })}</div> </nav>`;
});
const css$3 = {
  code: ".cb.svelte-1rok2l7{border-radius:10px;overflow:hidden;border:1px solid oklch(0.22 0.012 85);margin:1rem 0;background:oklch(0.145 0.012 85);box-shadow:0 2px 8px oklch(0 0 0 / 0.08),\n      inset 0 1px 0 oklch(1 0 0 / 0.03)}.cb-head.svelte-1rok2l7{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 1rem;background:oklch(0.17 0.013 85);border-bottom:1px solid oklch(0.22 0.012 85)}.cb-lang.svelte-1rok2l7{font-family:var(--mono);font-size:0.6875rem;font-weight:550;text-transform:uppercase;letter-spacing:0.08em;color:oklch(0.48 0.01 85)}.cb-copy.svelte-1rok2l7{font-family:var(--mono);font-size:0.6875rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:oklch(0.55 0.01 85);background:oklch(0.2 0.01 85);border:1px solid oklch(0.28 0.01 85);border-radius:4px;padding:0.2rem 0.55rem;cursor:pointer;transition:all 0.15s ease}.cb-copy.svelte-1rok2l7:hover{color:oklch(0.85 0.01 85);border-color:oklch(0.4 0.01 85);background:oklch(0.24 0.01 85)}.cb-copy.copied.svelte-1rok2l7{color:oklch(0.72 0.16 155);border-color:oklch(0.45 0.12 155)}.cb-body.svelte-1rok2l7{display:flex;overflow-x:auto}.cb-gutter.svelte-1rok2l7{flex-shrink:0;padding:1.125rem 0;padding-left:1rem;padding-right:0.875rem;border-right:1px solid oklch(0.2 0.01 85);user-select:none;text-align:right;color:oklch(0.35 0.008 85);font-family:var(--mono);font-size:0.8125rem;line-height:1.7}.cb-gutter.svelte-1rok2l7 span{display:block}.cb-pre.svelte-1rok2l7{margin:0;border:none;border-radius:0;padding:1.125rem 1.25rem;flex:1;min-width:0;background:transparent;font-size:0.8125rem;line-height:1.7}.cb-pre.svelte-1rok2l7 .tk-cmt{color:oklch(0.48 0.01 85)}.cb-pre.svelte-1rok2l7 .tk-kw{color:oklch(0.7 0.14 300)}.cb-pre.svelte-1rok2l7 .tk-str{color:oklch(0.7 0.16 155)}.cb-pre.svelte-1rok2l7 .tk-flg{color:oklch(0.68 0.12 250)}",
  map: `{"version":3,"file":"CodeBlock.svelte","sources":["CodeBlock.svelte"],"sourcesContent":["<script>\\n  export let lang = 'Terminal'\\n  export let copyText = ''\\n  export let id = ''\\n\\n  let copied = false\\n\\n  function copy() {\\n    if (!copyText) return\\n    navigator.clipboard.writeText(copyText).then(() => {\\n      copied = true\\n      setTimeout(() => copied = false, 2000)\\n    })\\n  }\\n<\/script>\\n\\n<div class=\\"cb\\" {id}>\\n  <div class=\\"cb-head\\">\\n    <span class=\\"cb-lang\\">{lang}</span>\\n    {#if copyText}\\n      <button class=\\"cb-copy\\" class:copied on:click={copy}>\\n        {copied ? '✓ copied' : 'copy'}\\n      </button>\\n    {/if}\\n  </div>\\n  <div class=\\"cb-body\\">\\n    <div class=\\"cb-gutter\\" aria-hidden=\\"true\\">\\n      <slot name=\\"lines\\" />\\n    </div>\\n    <pre class=\\"cb-pre\\"><code><slot /></code></pre>\\n  </div>\\n</div>\\n\\n<style>\\n  .cb {\\n    border-radius: 10px;\\n    overflow: hidden;\\n    border: 1px solid oklch(0.22 0.012 85);\\n    margin: 1rem 0;\\n    background: oklch(0.145 0.012 85);\\n    box-shadow:\\n      0 2px 8px oklch(0 0 0 / 0.08),\\n      inset 0 1px 0 oklch(1 0 0 / 0.03);\\n  }\\n\\n  .cb-head {\\n    display: flex;\\n    align-items: center;\\n    justify-content: space-between;\\n    padding: 0.5rem 1rem;\\n    background: oklch(0.17 0.013 85);\\n    border-bottom: 1px solid oklch(0.22 0.012 85);\\n  }\\n\\n  .cb-lang {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 550;\\n    text-transform: uppercase;\\n    letter-spacing: 0.08em;\\n    color: oklch(0.48 0.01 85);\\n  }\\n\\n  .cb-copy {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 600;\\n    letter-spacing: 0.04em;\\n    text-transform: uppercase;\\n    color: oklch(0.55 0.01 85);\\n    background: oklch(0.2 0.01 85);\\n    border: 1px solid oklch(0.28 0.01 85);\\n    border-radius: 4px;\\n    padding: 0.2rem 0.55rem;\\n    cursor: pointer;\\n    transition: all 0.15s ease;\\n  }\\n\\n  .cb-copy:hover {\\n    color: oklch(0.85 0.01 85);\\n    border-color: oklch(0.4 0.01 85);\\n    background: oklch(0.24 0.01 85);\\n  }\\n\\n  .cb-copy.copied {\\n    color: oklch(0.72 0.16 155);\\n    border-color: oklch(0.45 0.12 155);\\n  }\\n\\n  .cb-body {\\n    display: flex;\\n    overflow-x: auto;\\n  }\\n\\n  .cb-gutter {\\n    flex-shrink: 0;\\n    padding: 1.125rem 0;\\n    padding-left: 1rem;\\n    padding-right: 0.875rem;\\n    border-right: 1px solid oklch(0.2 0.01 85);\\n    user-select: none;\\n    text-align: right;\\n    color: oklch(0.35 0.008 85);\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    line-height: 1.7;\\n  }\\n\\n  .cb-gutter :global(span) {\\n    display: block;\\n  }\\n\\n  .cb-pre {\\n    margin: 0;\\n    border: none;\\n    border-radius: 0;\\n    padding: 1.125rem 1.25rem;\\n    flex: 1;\\n    min-width: 0;\\n    background: transparent;\\n    font-size: 0.8125rem;\\n    line-height: 1.7;\\n  }\\n\\n  .cb-pre :global(.tk-cmt) { color: oklch(0.48 0.01 85); }\\n  .cb-pre :global(.tk-kw) { color: oklch(0.7 0.14 300); }\\n  .cb-pre :global(.tk-str) { color: oklch(0.7 0.16 155); }\\n  .cb-pre :global(.tk-flg) { color: oklch(0.68 0.12 250); }\\n</style>\\n"],"names":[],"mappings":"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"}`
};
const CodeBlock = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { lang: lang2 = "Terminal" } = $$props;
  let { copyText = "" } = $$props;
  let { id = "" } = $$props;
  if ($$props.lang === void 0 && $$bindings.lang && lang2 !== void 0) $$bindings.lang(lang2);
  if ($$props.copyText === void 0 && $$bindings.copyText && copyText !== void 0) $$bindings.copyText(copyText);
  if ($$props.id === void 0 && $$bindings.id && id !== void 0) $$bindings.id(id);
  $$result.css.add(css$3);
  return `<div class="cb svelte-1rok2l7"${add_attribute("id", id, 0)}><div class="cb-head svelte-1rok2l7"><span class="cb-lang svelte-1rok2l7">${escape(lang2)}</span> ${copyText ? `<button class="${["cb-copy svelte-1rok2l7", ""].join(" ").trim()}">${escape("copy")}</button>` : ``}</div> <div class="cb-body svelte-1rok2l7"><div class="cb-gutter svelte-1rok2l7" aria-hidden="true">${slots.lines ? slots.lines({}) : ``}</div> <pre class="cb-pre svelte-1rok2l7"><code>${slots.default ? slots.default({}) : ``}</code></pre></div> </div>`;
});
const css$2 = {
  code: ".callout.svelte-1jsnqim.svelte-1jsnqim{display:flex;gap:0.875rem;align-items:flex-start;padding:1rem 1.25rem;border-radius:8px;margin:1rem 0;font-size:0.9375rem;line-height:1.65;border:1px solid}.callout-mark.svelte-1jsnqim.svelte-1jsnqim{flex-shrink:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-family:var(--mono);font-size:0.6875rem;font-weight:700;margin-top:0.125rem}.callout-body.svelte-1jsnqim.svelte-1jsnqim{flex:1;min-width:0}.info.svelte-1jsnqim.svelte-1jsnqim{border-color:oklch(0.52 0.16 250 / 0.2);background:oklch(0.52 0.16 250 / 0.06);color:var(--blue)}.info.svelte-1jsnqim .callout-mark.svelte-1jsnqim{background:oklch(0.52 0.16 250 / 0.15);color:var(--blue)}.tip.svelte-1jsnqim.svelte-1jsnqim{border-color:oklch(0.52 0.14 165 / 0.2);background:oklch(0.52 0.14 165 / 0.06);color:var(--accent)}.tip.svelte-1jsnqim .callout-mark.svelte-1jsnqim{background:oklch(0.52 0.14 165 / 0.15);color:var(--accent)}.warn.svelte-1jsnqim.svelte-1jsnqim{border-color:oklch(0.55 0.22 25 / 0.2);background:oklch(0.55 0.22 25 / 0.06);color:var(--rose)}.warn.svelte-1jsnqim .callout-mark.svelte-1jsnqim{background:oklch(0.55 0.22 25 / 0.15);color:var(--rose)}",
  map: `{"version":3,"file":"Callout.svelte","sources":["Callout.svelte"],"sourcesContent":["<script>\\n  export let type = 'info' // 'info' | 'tip' | 'warn'\\n<\/script>\\n\\n<div class=\\"callout {type}\\">\\n  <span class=\\"callout-mark\\">\\n    {#if type === 'info'}i{:else if type === 'tip'}✦{:else}!{/if}\\n  </span>\\n  <div class=\\"callout-body\\"><slot /></div>\\n</div>\\n\\n<style>\\n  .callout {\\n    display: flex;\\n    gap: 0.875rem;\\n    align-items: flex-start;\\n    padding: 1rem 1.25rem;\\n    border-radius: 8px;\\n    margin: 1rem 0;\\n    font-size: 0.9375rem;\\n    line-height: 1.65;\\n    border: 1px solid;\\n  }\\n\\n  .callout-mark {\\n    flex-shrink: 0;\\n    width: 20px;\\n    height: 20px;\\n    display: flex;\\n    align-items: center;\\n    justify-content: center;\\n    border-radius: 50%;\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 700;\\n    margin-top: 0.125rem;\\n  }\\n\\n  .callout-body { flex: 1; min-width: 0; }\\n\\n  .info {\\n    border-color: oklch(0.52 0.16 250 / 0.2);\\n    background: oklch(0.52 0.16 250 / 0.06);\\n    color: var(--blue);\\n  }\\n  .info .callout-mark {\\n    background: oklch(0.52 0.16 250 / 0.15);\\n    color: var(--blue);\\n  }\\n\\n  .tip {\\n    border-color: oklch(0.52 0.14 165 / 0.2);\\n    background: oklch(0.52 0.14 165 / 0.06);\\n    color: var(--accent);\\n  }\\n  .tip .callout-mark {\\n    background: oklch(0.52 0.14 165 / 0.15);\\n    color: var(--accent);\\n  }\\n\\n  .warn {\\n    border-color: oklch(0.55 0.22 25 / 0.2);\\n    background: oklch(0.55 0.22 25 / 0.06);\\n    color: var(--rose);\\n  }\\n  .warn .callout-mark {\\n    background: oklch(0.55 0.22 25 / 0.15);\\n    color: var(--rose);\\n  }\\n</style>\\n"],"names":[],"mappings":"AAYE,sCAAS,CACP,OAAO,CAAE,IAAI,CACb,GAAG,CAAE,QAAQ,CACb,WAAW,CAAE,UAAU,CACvB,OAAO,CAAE,IAAI,CAAC,OAAO,CACrB,aAAa,CAAE,GAAG,CAClB,MAAM,CAAE,IAAI,CAAC,CAAC,CACd,SAAS,CAAE,SAAS,CACpB,WAAW,CAAE,IAAI,CACjB,MAAM,CAAE,GAAG,CAAC,KACd,CAEA,2CAAc,CACZ,WAAW,CAAE,CAAC,CACd,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,eAAe,CAAE,MAAM,CACvB,aAAa,CAAE,GAAG,CAClB,WAAW,CAAE,IAAI,MAAM,CAAC,CACxB,SAAS,CAAE,SAAS,CACpB,WAAW,CAAE,GAAG,CAChB,UAAU,CAAE,QACd,CAEA,2CAAc,CAAE,IAAI,CAAE,CAAC,CAAE,SAAS,CAAE,CAAG,CAEvC,mCAAM,CACJ,YAAY,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,GAAG,CAAC,CACxC,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CACvC,KAAK,CAAE,IAAI,MAAM,CACnB,CACA,oBAAK,CAAC,4BAAc,CAClB,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CACvC,KAAK,CAAE,IAAI,MAAM,CACnB,CAEA,kCAAK,CACH,YAAY,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,GAAG,CAAC,CACxC,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CACvC,KAAK,CAAE,IAAI,QAAQ,CACrB,CACA,mBAAI,CAAC,4BAAc,CACjB,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CACvC,KAAK,CAAE,IAAI,QAAQ,CACrB,CAEA,mCAAM,CACJ,YAAY,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC,GAAG,CAAC,CACvC,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC,IAAI,CAAC,CACtC,KAAK,CAAE,IAAI,MAAM,CACnB,CACA,oBAAK,CAAC,4BAAc,CAClB,UAAU,CAAE,MAAM,IAAI,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC,IAAI,CAAC,CACtC,KAAK,CAAE,IAAI,MAAM,CACnB"}`
};
const Callout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { type = "info" } = $$props;
  if ($$props.type === void 0 && $$bindings.type && type !== void 0) $$bindings.type(type);
  $$result.css.add(css$2);
  return `<div class="${"callout " + escape(type, true) + " svelte-1jsnqim"}"><span class="callout-mark svelte-1jsnqim">${type === "info" ? `i` : `${type === "tip" ? `✦` : `!`}`}</span> <div class="callout-body svelte-1jsnqim">${slots.default ? slots.default({}) : ``}</div> </div>`;
});
const css$1 = {
  code: ".dt-wrap.svelte-101mztd.svelte-101mztd{overflow-x:auto;margin:0.75rem 0;border-radius:8px;border:1px solid var(--border-subtle)}.dt.svelte-101mztd.svelte-101mztd{width:100%;border-collapse:collapse;font-size:0.9375rem}.dt.svelte-101mztd th.svelte-101mztd{font-family:var(--mono);font-size:0.6875rem;font-weight:550;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);text-align:left;padding:0.65rem 0.875rem;border-bottom:1px solid var(--border-medium);background:var(--raised);white-space:nowrap}.dt.svelte-101mztd td.svelte-101mztd{padding:0.6rem 0.875rem;border-bottom:1px solid var(--border-subtle);color:var(--text-secondary);vertical-align:top;line-height:1.6}.dt.svelte-101mztd tr:last-child td.svelte-101mztd{border-bottom:none}.dt.svelte-101mztd tr:hover td.svelte-101mztd{background:var(--hover)}.dt.svelte-101mztd td.first.svelte-101mztd{font-family:var(--mono);font-size:0.875rem;color:var(--text);white-space:nowrap}.dt.svelte-101mztd code{font-family:var(--mono);font-size:0.8125rem;background:var(--raised);border-radius:3px;padding:0.1em 0.35em;color:var(--accent)}",
  map: '{"version":3,"file":"DocsTable.svelte","sources":["DocsTable.svelte"],"sourcesContent":["<script>\\n  export let headers = []\\n  export let rows = []\\n<\/script>\\n\\n<div class=\\"dt-wrap\\">\\n  <table class=\\"dt\\">\\n    <thead>\\n      <tr>\\n        {#each headers as h}\\n          <th>{h}</th>\\n        {/each}\\n      </tr>\\n    </thead>\\n    <tbody>\\n      {#each rows as row}\\n        <tr>\\n          {#each row as cell, i}\\n            <td class:first={i === 0}>{@html cell}</td>\\n          {/each}\\n        </tr>\\n      {/each}\\n    </tbody>\\n  </table>\\n</div>\\n\\n<style>\\n  .dt-wrap {\\n    overflow-x: auto;\\n    margin: 0.75rem 0;\\n    border-radius: 8px;\\n    border: 1px solid var(--border-subtle);\\n  }\\n\\n  .dt {\\n    width: 100%;\\n    border-collapse: collapse;\\n    font-size: 0.9375rem;\\n  }\\n\\n  .dt th {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 550;\\n    text-transform: uppercase;\\n    letter-spacing: 0.06em;\\n    color: var(--text-muted);\\n    text-align: left;\\n    padding: 0.65rem 0.875rem;\\n    border-bottom: 1px solid var(--border-medium);\\n    background: var(--raised);\\n    white-space: nowrap;\\n  }\\n\\n  .dt td {\\n    padding: 0.6rem 0.875rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n    color: var(--text-secondary);\\n    vertical-align: top;\\n    line-height: 1.6;\\n  }\\n\\n  .dt tr:last-child td {\\n    border-bottom: none;\\n  }\\n\\n  .dt tr:hover td {\\n    background: var(--hover);\\n  }\\n\\n  .dt td.first {\\n    font-family: var(--mono);\\n    font-size: 0.875rem;\\n    color: var(--text);\\n    white-space: nowrap;\\n  }\\n\\n  .dt :global(code) {\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    background: var(--raised);\\n    border-radius: 3px;\\n    padding: 0.1em 0.35em;\\n    color: var(--accent);\\n  }\\n</style>\\n"],"names":[],"mappings":"AA2BE,sCAAS,CACP,UAAU,CAAE,IAAI,CAChB,MAAM,CAAE,OAAO,CAAC,CAAC,CACjB,aAAa,CAAE,GAAG,CAClB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,eAAe,CACvC,CAEA,iCAAI,CACF,KAAK,CAAE,IAAI,CACX,eAAe,CAAE,QAAQ,CACzB,SAAS,CAAE,SACb,CAEA,kBAAG,CAAC,iBAAG,CACL,WAAW,CAAE,IAAI,MAAM,CAAC,CACxB,SAAS,CAAE,SAAS,CACpB,WAAW,CAAE,GAAG,CAChB,cAAc,CAAE,SAAS,CACzB,cAAc,CAAE,MAAM,CACtB,KAAK,CAAE,IAAI,YAAY,CAAC,CACxB,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,OAAO,CAAC,QAAQ,CACzB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,eAAe,CAAC,CAC7C,UAAU,CAAE,IAAI,QAAQ,CAAC,CACzB,WAAW,CAAE,MACf,CAEA,kBAAG,CAAC,iBAAG,CACL,OAAO,CAAE,MAAM,CAAC,QAAQ,CACxB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,eAAe,CAAC,CAC7C,KAAK,CAAE,IAAI,gBAAgB,CAAC,CAC5B,cAAc,CAAE,GAAG,CACnB,WAAW,CAAE,GACf,CAEA,kBAAG,CAAC,EAAE,WAAW,CAAC,iBAAG,CACnB,aAAa,CAAE,IACjB,CAEA,kBAAG,CAAC,EAAE,MAAM,CAAC,iBAAG,CACd,UAAU,CAAE,IAAI,OAAO,CACzB,CAEA,kBAAG,CAAC,EAAE,qBAAO,CACX,WAAW,CAAE,IAAI,MAAM,CAAC,CACxB,SAAS,CAAE,QAAQ,CACnB,KAAK,CAAE,IAAI,MAAM,CAAC,CAClB,WAAW,CAAE,MACf,CAEA,kBAAG,CAAS,IAAM,CAChB,WAAW,CAAE,IAAI,MAAM,CAAC,CACxB,SAAS,CAAE,SAAS,CACpB,UAAU,CAAE,IAAI,QAAQ,CAAC,CACzB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,KAAK,CAAC,MAAM,CACrB,KAAK,CAAE,IAAI,QAAQ,CACrB"}'
};
const DocsTable = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { headers = [] } = $$props;
  let { rows = [] } = $$props;
  if ($$props.headers === void 0 && $$bindings.headers && headers !== void 0) $$bindings.headers(headers);
  if ($$props.rows === void 0 && $$bindings.rows && rows !== void 0) $$bindings.rows(rows);
  $$result.css.add(css$1);
  return `<div class="dt-wrap svelte-101mztd"><table class="dt svelte-101mztd"><thead><tr>${each(headers, (h) => {
    return `<th class="svelte-101mztd">${escape(h)}</th>`;
  })}</tr></thead> <tbody>${each(rows, (row) => {
    return `<tr>${each(row, (cell, i) => {
      return `<td class="${["svelte-101mztd", i === 0 ? "first" : ""].join(" ").trim()}"><!-- HTML_TAG_START -->${cell}<!-- HTML_TAG_END --></td>`;
    })} </tr>`;
  })}</tbody></table> </div>`;
});
const css = {
  code: ".docs-layout.svelte-1onn39h.svelte-1onn39h{width:var(--content-width);margin:0 auto;padding:2rem 0 4rem;position:relative}.mobile-toc-toggle.svelte-1onn39h.svelte-1onn39h{display:none;align-items:center;gap:0.625rem;width:100%;padding:0.75rem 1rem;background:var(--surface);border:1px solid var(--border-subtle);border-radius:8px;font-family:var(--mono);font-size:0.8125rem;font-weight:550;color:var(--text-secondary);cursor:pointer;margin-bottom:0.5rem}.toc-burger.svelte-1onn39h.svelte-1onn39h{display:flex;flex-direction:column;gap:3px;width:16px}.toc-burger.svelte-1onn39h span.svelte-1onn39h{display:block;height:2px;background:var(--accent);border-radius:1px;transition:all 0.2s ease}.toc-burger.open.svelte-1onn39h span.svelte-1onn39h:nth-child(1){transform:rotate(45deg) translate(3px, 3px)}.toc-burger.open.svelte-1onn39h span.svelte-1onn39h:nth-child(2){opacity:0}.toc-burger.open.svelte-1onn39h span.svelte-1onn39h:nth-child(3){transform:rotate(-45deg) translate(4px, -4px)}.docs-sidebar.svelte-1onn39h.svelte-1onn39h{position:fixed;top:76px;left:calc(50% - var(--content-width) / 2);width:260px;max-height:calc(100vh - 92px);overflow-y:auto;scrollbar-width:thin;transition:transform 0.15s ease}.docs-hero.svelte-1onn39h.svelte-1onn39h{margin-bottom:3rem;padding-bottom:2.5rem;border-bottom:1px solid var(--border-subtle);position:relative}.docs-hero.svelte-1onn39h.svelte-1onn39h::after{content:'';position:absolute;bottom:-1px;left:0;width:80px;height:2px;background:var(--accent)}.hero-eyebrow.svelte-1onn39h.svelte-1onn39h{display:inline-flex;align-items:center;gap:0.5rem;font-family:var(--mono);font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);margin-bottom:0.75rem;padding:0.3rem 0.75rem;background:var(--accent-dim);border-radius:4px}.hero-eyebrow-icon.svelte-1onn39h.svelte-1onn39h{font-size:0.8125rem}.hero-title.svelte-1onn39h.svelte-1onn39h{font-family:'Source Serif 4', 'Georgia', serif;font-size:2.5rem;font-weight:700;letter-spacing:-0.03em;color:var(--text);margin-bottom:0.75rem;line-height:1.15}.hero-sub.svelte-1onn39h.svelte-1onn39h{font-size:1.0625rem;color:var(--text-secondary);line-height:1.7;max-width:640px}.hero-meta.svelte-1onn39h.svelte-1onn39h{display:flex;gap:0.5rem;margin-top:1.25rem;flex-wrap:wrap}.meta-tag.svelte-1onn39h.svelte-1onn39h{font-family:var(--mono);font-size:0.6875rem;font-weight:550;color:var(--text-muted);background:var(--raised);border:1px solid var(--border-subtle);border-radius:4px;padding:0.2rem 0.5rem;letter-spacing:0.02em}.docs-content.svelte-1onn39h.svelte-1onn39h{min-width:0;max-width:85ch;margin-left:290px}section.svelte-1onn39h.svelte-1onn39h{margin-bottom:2.5rem;padding-top:0.25rem;scroll-margin-top:76px}.sec-head.svelte-1onn39h.svelte-1onn39h{display:flex;align-items:baseline;gap:0.875rem;margin-bottom:0.75rem;padding-bottom:0.625rem;border-bottom:1px solid var(--border-subtle)}.sec-idx.svelte-1onn39h.svelte-1onn39h{font-family:var(--mono);font-size:0.75rem;font-weight:700;color:var(--accent);opacity:0.6;letter-spacing:0.02em;flex-shrink:0}section.svelte-1onn39h h2.svelte-1onn39h{font-family:'Source Serif 4', 'Georgia', serif;font-size:1.375rem;font-weight:700;color:var(--text);letter-spacing:-0.02em;margin:0;padding:0;border:none}section.svelte-1onn39h h3.svelte-1onn39h{font-family:'Instrument Sans', sans-serif;font-size:1.0625rem;font-weight:600;color:var(--text);letter-spacing:-0.01em;margin:2rem 0 0.75rem}section.svelte-1onn39h p.svelte-1onn39h{font-size:0.9375rem;color:var(--text-secondary);line-height:1.75;margin-bottom:0.75rem}section.svelte-1onn39h ul.svelte-1onn39h{padding-left:1.25rem;margin-bottom:0.75rem;list-style:none}section.svelte-1onn39h li.svelte-1onn39h{font-size:0.9375rem;color:var(--text-secondary);line-height:1.75;margin-bottom:0.375rem;position:relative;padding-left:0.875rem}section.svelte-1onn39h li.svelte-1onn39h::before{content:'';position:absolute;left:0;top:0.6em;width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:0.4}section.svelte-1onn39h strong.svelte-1onn39h{color:var(--text);font-weight:600}section.svelte-1onn39h code.svelte-1onn39h{font-family:var(--mono);font-size:0.8125rem;background:var(--raised);border:1px solid var(--border-subtle);border-radius:4px;padding:0.1em 0.4em;color:var(--accent)}.doc-shot.svelte-1onn39h.svelte-1onn39h{margin:0;border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow-sm)}.doc-shot.svelte-1onn39h img.svelte-1onn39h{display:block;width:100%;height:auto;background:var(--raised)}.doc-shot.svelte-1onn39h figcaption.svelte-1onn39h{padding:0.75rem 1rem;font-size:0.8125rem;line-height:1.6;color:var(--text-secondary);border-top:1px solid var(--border-subtle);background:var(--raised)}.back-to-top.svelte-1onn39h.svelte-1onn39h{position:fixed;bottom:2rem;right:2rem;z-index:50;width:44px;height:44px;border-radius:50%;background:var(--accent);color:oklch(0.99 0.002 85);border:none;cursor:pointer;font-size:1.125rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px oklch(0 0 0 / 0.15);transition:all 0.2s ease;animation:svelte-1onn39h-fadeIn 0.2s ease-out}.back-to-top.svelte-1onn39h.svelte-1onn39h:hover{background:var(--accent-hover);transform:translateY(-2px);box-shadow:0 4px 16px oklch(0 0 0 / 0.2)}@keyframes svelte-1onn39h-fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width: 800px){.docs-content.svelte-1onn39h.svelte-1onn39h{margin-left:0}.mobile-toc-toggle.svelte-1onn39h.svelte-1onn39h{display:flex}.docs-sidebar.svelte-1onn39h.svelte-1onn39h{display:none;position:static;width:auto;max-height:none;margin-bottom:1rem}.docs-sidebar.mobile-open.svelte-1onn39h.svelte-1onn39h{display:block;background:var(--surface);border:1px solid var(--border-subtle);border-radius:8px;padding:0.5rem}.docs-sidebar.mobile-open.svelte-1onn39h .toc{border-right:none;padding-right:0}.hero-title.svelte-1onn39h.svelte-1onn39h{font-size:1.875rem}}",
  map: `{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script>\\n  import { onMount } from 'svelte'\\n  import { lang } from '$lib/lang'\\n  import TableOfContents from '$lib/components/TableOfContents.svelte'\\n  import CodeBlock from '$lib/components/CodeBlock.svelte'\\n  import Callout from '$lib/components/Callout.svelte'\\n  import DocsTable from '$lib/components/DocsTable.svelte'\\n\\n  $: zh = $lang === 'zh'\\n\\n  const sections = [\\n    { id: 'getting-started', en: 'Getting Started', zh: '快速开始',\\n      children: [\\n        { id: 'install', en: 'Installation', zh: '安装' },\\n        { id: 'parse', en: 'Parse Data', zh: '解析数据' },\\n        { id: 'serve', en: 'Start Dashboard', zh: '启动仪表盘' },\\n        { id: 'pm2', en: 'Background (PM2)', zh: '后台运行 (PM2)' },\\n        { id: 'docker', en: 'Docker', zh: 'Docker 部署' },\\n      ]\\n    },\\n    { id: 'dashboard', en: 'Dashboard', zh: '仪表盘',\\n      children: [\\n        { id: 'dash-elements', en: 'UI Elements', zh: '界面元素' },\\n        { id: 'dash-config', en: 'Display Config', zh: '显示配置' },\\n      ]\\n    },\\n    { id: 'overview', en: 'Overview', zh: '概览',\\n      children: [\\n        { id: 'overview-cards', en: 'Stat Cards', zh: '统计卡片' },\\n        { id: 'overview-breakdown', en: 'Token Breakdown', zh: 'Token 明细' },\\n        { id: 'overview-assistant', en: 'By AI Assistant', zh: '按 AI 助手统计' },\\n      ]\\n    },\\n    { id: 'tokens', en: 'Tokens', zh: 'Token 用量',\\n      children: [\\n        { id: 'tokens-chart', en: 'Daily Bar Chart', zh: '每日柱状图' },\\n        { id: 'tokens-table', en: 'Detail Table', zh: '明细表格' },\\n        { id: 'tokens-types', en: 'Token Types', zh: 'Token 类型说明' },\\n      ]\\n    },\\n    { id: 'cost', en: 'Cost', zh: '费用',\\n      children: [\\n        { id: 'cost-daily', en: 'Daily Cost Chart', zh: '每日费用图' },\\n        { id: 'cost-breakdown', en: 'By Assistant & Model', zh: '按助手与模型分布' },\\n      ]\\n    },\\n    { id: 'models', en: 'Models', zh: '模型', children: [] },\\n    { id: 'tool-calls', en: 'Tool Calls', zh: '工具调用', children: [] },\\n    { id: 'projects', en: 'Projects', zh: '项目', children: [] },\\n    { id: 'sessions', en: 'Sessions', zh: '会话', children: [] },\\n    { id: 'quotas', en: 'Quotas', zh: '配额监控',\\n      children: [\\n        { id: 'quotas-cards', en: 'Quota Cards', zh: '配额卡片' },\\n        { id: 'quotas-tiers', en: 'Tier Bars', zh: '配额条' },\\n      ]\\n    },\\n    { id: 'pricing', en: 'Pricing', zh: '定价', children: [] },\\n    { id: 'settings', en: 'Settings', zh: '设置',\\n      children: [\\n        { id: 'settings-general', en: 'General', zh: '通用' },\\n        { id: 'settings-sources', en: 'Data Sources', zh: '数据源' },\\n        { id: 'settings-data', en: 'Data Management', zh: '数据管理' },\\n      ]\\n    },\\n    { id: 'sync', en: 'Sync', zh: '多设备同步', children: [] },\\n    { id: 'export', en: 'Export', zh: '数据导出', children: [] },\\n    { id: 'widget', en: 'Widget', zh: '桌面小组件', children: [] },\\n    { id: 'cli', en: 'CLI Reference', zh: 'CLI 命令',\\n      children: [\\n        { id: 'cli-parse', en: 'parse', zh: 'parse' },\\n        { id: 'cli-serve', en: 'serve', zh: 'serve' },\\n        { id: 'cli-summary', en: 'summary', zh: 'summary' },\\n        { id: 'cli-export', en: 'export', zh: 'export' },\\n        { id: 'cli-clean', en: 'clean', zh: 'clean' },\\n        { id: 'cli-reset', en: 'reset', zh: 'reset' },\\n        { id: 'cli-other', en: 'Other Commands', zh: '其他命令' },\\n      ]\\n    },\\n  ]\\n\\n  let activeSection = 'getting-started'\\n  let expandedSections = new Set(['getting-started'])\\n  let mobileTocOpen = false\\n  let showBackToTop = false\\n  let sidebarOffset = 0\\n  let scrollLock = null\\n\\n  function getSectionIndex(id) {\\n    for (let i = 0; i < sections.length; i++) {\\n      if (sections[i].id === id) return i\\n      if (sections[i].children?.some(c => c.id === id)) return i\\n    }\\n    return 0\\n  }\\n\\n  function scrollTo(id) {\\n    const el = document.getElementById(id)\\n    if (el) {\\n      activeSection = id\\n      scrollLock = id\\n      const headerOffset = 76\\n      const top = el.getBoundingClientRect().top + window.scrollY\\n      window.scrollTo({ top: top - headerOffset, behavior: 'smooth' })\\n      mobileTocOpen = false\\n      for (const s of sections) {\\n        if (s.id === id || s.children?.some(c => c.id === id)) {\\n          expandedSections.add(s.id)\\n          expandedSections = expandedSections\\n        }\\n      }\\n      setTimeout(() => { scrollLock = null }, 600)\\n    }\\n  }\\n\\n  function handleTocNavigate(e) {\\n    scrollTo(e.detail.id)\\n  }\\n\\n  function handleTocToggle(e) {\\n    const id = e.detail.id\\n    if (expandedSections.has(id)) expandedSections.delete(id)\\n    else expandedSections.add(id)\\n    expandedSections = expandedSections\\n  }\\n\\n  function toggleExpand(id) {\\n    if (expandedSections.has(id)) expandedSections.delete(id)\\n    else expandedSections.add(id)\\n    expandedSections = expandedSections\\n  }\\n\\n  $: allSectionIds = sections.flatMap(s => [s.id, ...(s.children ?? []).map(c => c.id)])\\n\\n  function updateActiveFromScroll() {\\n    showBackToTop = window.scrollY > 400\\n    const footer = document.querySelector('.site-footer')\\n    if (footer) {\\n      const footerTop = footer.getBoundingClientRect().top\\n      const sidebarBottom = 76 + (window.innerHeight - 92)\\n      sidebarOffset = footerTop < sidebarBottom ? sidebarBottom - footerTop : 0\\n    }\\n    if (scrollLock) return\\n    const offset = 90\\n    let best = allSectionIds[0]\\n    for (const id of allSectionIds) {\\n      const el = document.getElementById(id)\\n      if (el && el.getBoundingClientRect().top <= offset) {\\n        best = id\\n      }\\n    }\\n    if (best !== activeSection) {\\n      activeSection = best\\n      for (const s of sections) {\\n        if (s.id === activeSection || s.children?.some(c => c.id === activeSection)) {\\n          expandedSections.add(s.id)\\n        }\\n      }\\n      expandedSections = expandedSections\\n    }\\n  }\\n\\n  onMount(() => {\\n    updateActiveFromScroll()\\n    window.addEventListener('scroll', updateActiveFromScroll, { passive: true })\\n    return () => window.removeEventListener('scroll', updateActiveFromScroll)\\n  })\\n<\/script>\\n\\n<svelte:head>\\n  <title>{zh ? '文档' : 'Documentation'} — AIUsage</title>\\n  <meta name=\\"description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n  <link rel=\\"canonical\\" href=\\"https://aiusage.jtanx.com/docs\\" />\\n  <meta property=\\"og:title\\" content=\\"{zh ? '文档' : 'Documentation'} — AIUsage\\" />\\n  <meta property=\\"og:description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n  <meta property=\\"og:url\\" content=\\"https://aiusage.jtanx.com/docs\\" />\\n  <meta name=\\"twitter:title\\" content=\\"{zh ? '文档' : 'Documentation'} — AIUsage\\" />\\n  <meta name=\\"twitter:description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n\\n  <!-- JSON-LD for Docs page -->\\n  {@html \`<script type=\\"application/ld+json\\">\${JSON.stringify({\\n    '@context': 'https://schema.org',\\n    '@type': 'WebPage',\\n    name: zh ? 'AIUsage 文档' : 'AIUsage Documentation',\\n    description: zh\\n      ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n      : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.',\\n    url: 'https://aiusage.jtanx.com/docs',\\n    isPartOf: {\\n      '@type': 'WebSite',\\n      name: 'AIUsage',\\n      url: 'https://aiusage.jtanx.com'\\n    },\\n    breadcrumb: {\\n      '@type': 'BreadcrumbList',\\n      itemListElement: [\\n        {\\n          '@type': 'ListItem',\\n          position: 1,\\n          name: 'Home',\\n          item: 'https://aiusage.jtanx.com/'\\n        },\\n        {\\n          '@type': 'ListItem',\\n          position: 2,\\n          name: zh ? '文档' : 'Documentation',\\n          item: 'https://aiusage.jtanx.com/docs'\\n        }\\n      ]\\n    }\\n  })}<\/script>\`}\\n</svelte:head>\\n\\n<div class=\\"docs-layout\\">\\n  <button class=\\"mobile-toc-toggle\\" on:click={() => mobileTocOpen = !mobileTocOpen}>\\n    <span class=\\"toc-burger\\" class:open={mobileTocOpen}>\\n      <span></span><span></span><span></span>\\n    </span>\\n    <span>{zh ? '目录' : 'Contents'}</span>\\n  </button>\\n\\n  <aside class=\\"docs-sidebar\\" class:mobile-open={mobileTocOpen} style:transform=\\"translateY(-{sidebarOffset}px)\\">\\n    <TableOfContents\\n      {sections}\\n      {activeSection}\\n      {expandedSections}\\n      {zh}\\n      on:navigate={handleTocNavigate}\\n      on:toggle={handleTocToggle}\\n    />\\n  </aside>\\n\\n  <article class=\\"docs-content\\">\\n    <!-- ── Page Header ──────────────────────────────────────── -->\\n    <header class=\\"docs-hero\\">\\n      <div class=\\"hero-eyebrow\\">\\n        <span class=\\"hero-eyebrow-icon\\">⌘</span>\\n        <span>{zh ? 'AIUsage 参考手册' : 'AIUsage Reference'}</span>\\n      </div>\\n      <h1 class=\\"hero-title\\">{zh ? '文档' : 'Documentation'}</h1>\\n      <p class=\\"hero-sub\\">{zh\\n        ? 'AIUsage 是一款 AI 工具用量统计平台，支持 Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor 等多种 AI 工具的 Token 和费用追踪。'\\n        : 'AIUsage is a local-first usage analytics platform for AI coding tools — tracking tokens, costs, sessions and more across Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, and Cursor.'\\n      }</p>\\n      <div class=\\"hero-meta\\">\\n        <span class=\\"meta-tag\\">{zh ? '开源' : 'Open Source'}</span>\\n        <span class=\\"meta-tag\\">MIT</span>\\n        <span class=\\"meta-tag\\">v1.3.2</span>\\n      </div>\\n    </header>\\n\\n    <!-- ══════ Getting Started ══════ -->\\n    <section id=\\"getting-started\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">01</span>\\n        <h2>{zh ? '快速开始' : 'Getting Started'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>AIUsage 是一个命令行工具，内置 Web 仪表盘。安装完成后，它会解析 AI 工具生成的日志文件，并在本地数据库中追踪用量数据。</p>\\n      {:else}\\n        <p>AIUsage is a CLI tool with a built-in web dashboard. It parses log files generated by AI tools and tracks usage data in a local database.</p>\\n      {/if}\\n    </section>\\n\\n    <section id=\\"install\\">\\n      <h3>{zh ? '安装' : 'Installation'}</h3>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"npm install -g @juliantanx/aiusage\\">\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g <span class=\\"tk-str\\">@juliantanx/aiusage</span>\\n<span class=\\"tk-cmt\\"># or with pnpm</span>\\n<span class=\\"tk-kw\\">pnpm</span> add -g <span class=\\"tk-str\\">@juliantanx/aiusage</span>\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"parse\\">\\n      <h3>{zh ? '解析数据' : 'Parse Data'}</h3>\\n      <p>{zh ? '解析 AI 工具的日志文件，写入本地数据库：' : 'Parse log files from your AI tools into the local database:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage parse\\">\\n        <span slot=\\"lines\\"><span>1</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> parse\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"serve\\">\\n      <h3>{zh ? '启动仪表盘' : 'Start the Dashboard'}</h3>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage serve\\">\\n        <span slot=\\"lines\\"><span>1</span><span>2</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> serve\\n<span class=\\"tk-cmt\\"># Listens on http://localhost:3847 by default</span>\\n      </CodeBlock>\\n      <p>{zh ? '浏览器打开 http://localhost:3847 即可查看仪表盘。' : 'Open http://localhost:3847 in your browser to view the dashboard.'}</p>\\n      <Callout type=\\"info\\">\\n        {zh\\n          ? '首页会按当前时间范围从 API 拉取汇总数据，并根据设置中的轮询间隔自动刷新。需要导入新日志时，可手动运行 aiusage parse，或在设置里启用自动解析间隔。'\\n          : 'The home page loads summary data for the current range and refreshes automatically based on the dashboard poll interval. To import new logs, run aiusage parse manually or enable the auto-parse interval in Settings.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section id=\\"pm2\\">\\n      <h3>{zh ? '后台运行 (PM2)' : 'Running in Background (PM2)'}</h3>\\n      <p>{zh\\n        ? 'aiusage serve 默认在前台运行，关闭终端后服务会终止。如需后台持续运行，请使用 PM2：'\\n        : 'aiusage serve runs in the foreground. To keep it running in the background, use PM2:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'npm install -g pm2\\\\naiusage pm2-start\\\\npm2 startup'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g pm2\\n<span class=\\"tk-kw\\">aiusage</span> pm2-start\\n<span class=\\"tk-kw\\">pm2</span> startup\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"docker\\">\\n      <h3>Docker</h3>\\n      <p>{zh\\n        ? '使用官方 Docker 镜像运行 AIUsage，无需安装 Node.js：'\\n        : 'Run AIUsage with the official Docker image, no Node.js installation required:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'docker run -d \\\\\\\\\\\\n  -p 3847:3847 \\\\\\\\\\\\n  -v ~/.aiusage:/root/.aiusage \\\\\\\\\\\\n  juliantanx/aiusage'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span><span>4</span></span>\\n        <span class=\\"tk-kw\\">docker</span> run -d \\\\\\n  -p 3847:3847 \\\\\\n  -v ~/.aiusage:/root/.aiusage \\\\\\n  juliantanx/aiusage\\n      </CodeBlock>\\n      <Callout type=\\"info\\">\\n        {zh\\n          ? '官方镜像当前提供在 Docker Hub（juliantanx/aiusage），支持 amd64 和 arm64 架构。'\\n          : 'The official image is currently published on Docker Hub (juliantanx/aiusage) with amd64 and arm64 support.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <!-- ══════ Dashboard ══════ -->\\n    <section id=\\"dashboard\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">02</span>\\n        <h2>{zh ? '仪表盘（首页）' : 'Dashboard (Home)'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>首页是实时总览页，包含 LIVE 状态、当前时间范围、时钟、主 Token 计数器、配额预警、自动刷新进度条，以及费用 / 会话 / 活跃天数三项摘要。</p>\\n      {:else}\\n        <p>The home page is a live overview with the current range, clock, main token counter, quota warnings, refresh progress, and summary stats for cost, sessions, and active days.</p>\\n      {/if}\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/dashboard-home.png\\" alt={zh ? 'AIUsage 首页仪表盘截图' : 'AIUsage dashboard home screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '首页展示实时累计 Token、刷新倒计时和配额预警。' : 'Home page showing live token totals, refresh countdown, and quota warnings.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"dash-elements\\">\\n      <h3>{zh ? '界面元素' : 'UI Elements'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '实时计数器' : 'Live counter'}</strong> — {zh ? '显示总 Token 数，支持动画计数效果' : 'Shows total tokens with a count-up animation'}</li>\\n        <li><strong>{zh ? '子统计' : 'Sub-stats'}</strong> — {zh ? '分别展示输入、输出与缓存总量（缓存读写合并显示）' : 'Shows input, output, and combined cache totals'}</li>\\n        <li><strong>{zh ? '范围与时钟' : 'Range and clock'}</strong> — {zh ? '顶部显示当前时间范围、实时时钟和 LIVE 状态' : 'Top bar shows the active range, live clock, and LIVE indicator'}</li>\\n        <li><strong>{zh ? '费用 / 会话 / 活跃天数' : 'Cost / Sessions / Active Days'}</strong> — {zh ? '三个摘要统计块' : 'Three summary stat blocks'}</li>\\n        <li><strong>{zh ? 'Token 构成条' : 'Token composition bar'}</strong> — {zh ? '按比例显示输入、输出、缓存读写分布' : 'Proportional breakdown of input, output, cache read, and cache write'}</li>\\n        <li><strong>{zh ? '刷新进度条' : 'Refresh progress bar'}</strong> — {zh ? '显示下次自动刷新的倒计时，并可手动立即刷新' : 'Shows countdown to next refresh and allows manual refresh'}</li>\\n        <li><strong>{zh ? '配额预警' : 'Quota warnings'}</strong> — {zh ? '当 Claude Code / Codex 配额层级达到 80% 以上时会在首页顶部提示' : 'Shows warning banners when Claude Code or Codex quota tiers reach 80%+'}</li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"dash-config\\">\\n      <h3>{zh ? '显示配置' : 'Display Config'}</h3>\\n      <p>{zh ? '点击右上角的齿轮按钮可打开显示配置面板：' : 'Click the gear button to open the display config panel:'}</p>\\n      <ul>\\n        <li><strong>{zh ? '时间范围' : 'Time range'}</strong> — {zh ? '全部 / 今天 / 本周 / 本月 / 近 30 天' : 'All Time / Today / This Week / This Month / Last 30d'}</li>\\n        <li><strong>{zh ? '数字格式' : 'Number format'}</strong> — {zh ? '精确（1,234,567）或简写（1.2K / 1.2M）' : 'Exact numbers or abbreviated format (1.2K / 1.2M)'}</li>\\n        <li><strong>{zh ? '刷新说明' : 'Refresh info'}</strong> — {zh ? '面板底部会显示当前轮询间隔，并可跳转到 Settings 修改 dashboard poll interval' : 'The panel shows the current poll interval and links to Settings to change the dashboard poll interval'}</li>\\n      </ul>\\n    </section>\\n\\n    <!-- ══════ Overview ══════ -->\\n    <section id=\\"overview\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">03</span>\\n        <h2>{zh ? '概览' : 'Overview'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>概览页展示聚合统计摘要，并支持按日期范围、设备和 AI 工具筛选。这里也是查看按工具聚合和 Top Tool Calls / MCP 服务调用的入口。</p>\\n      {:else}\\n        <p>The Overview page shows aggregated stats with filters for date range, device, and AI tool. It also summarizes usage by tool and highlights top tool calls or MCP servers.</p>\\n      {/if}\\n      <Callout type=\\"tip\\">\\n        {zh\\n          ? '顶部三个筛选器（Date Range、Device、Tool）会同步影响 Overview、Tokens、Cost、Models、Tool Calls、Projects 和 Sessions 页面。'\\n          : 'The Date Range, Device, and Tool filters are shared across Overview, Tokens, Cost, Models, Tool Calls, Projects, and Sessions.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/overview.png\\" alt={zh ? 'AIUsage 概览页截图' : 'AIUsage overview page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '概览页包含统计卡片、Token 明细、按工具汇总，以及 Top Tool Calls / MCP 标签页。' : 'Overview includes stat cards, token breakdown, by-tool totals, and the Top Tool Calls / MCP tabs.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"overview-cards\\">\\n      <h3>{zh ? '统计卡片' : 'Stat Cards'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '总 Token' : 'Total Tokens'}</strong> — {zh ? '所有类型 Token 的合计' : 'Sum of all token types'}</li>\\n        <li><strong>{zh ? '总费用' : 'Total Cost'}</strong> — {zh ? '基于定价表计算的估算费用' : 'Estimated cost based on the pricing table'}</li>\\n        <li><strong>{zh ? '活跃天数' : 'Active Days'}</strong> — {zh ? '有记录的天数' : 'Number of days with recorded usage'}</li>\\n        <li><strong>{zh ? '会话数' : 'Sessions'}</strong> — {zh ? '独立会话的总数' : 'Total number of distinct sessions'}</li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"overview-breakdown\\">\\n      <h3>{zh ? 'Token 明细' : 'Token Breakdown'}</h3>\\n      <p>{zh ? '在卡片下方展示输入、输出、缓存读取、缓存写入的分项数据。' : 'Below the cards: input, output, cache read, and cache write token counts shown individually.'}</p>\\n    </section>\\n\\n    <section id=\\"overview-assistant\\">\\n      <h3>{zh ? '按 AI 助手统计' : 'By AI Assistant'}</h3>\\n      <p>{zh\\n        ? '按使用的 AI 工具（claude-code、codex 等）分组，显示各工具的 Token 数和费用。列出调用次数最多的工具（如 Bash、Read、Edit 等）。'\\n        : 'Usage grouped by AI tool (claude-code, codex, etc.) showing tokens and cost per tool. Most-called tool names ranked by invocation count.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Tokens ══════ -->\\n    <section id=\\"tokens\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">04</span>\\n        <h2>{zh ? 'Token 用量' : 'Tokens'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '页面支持两种图表模式：Breakdown 会按输入、输出、缓存读取、缓存写入、思考 Token 分开展示；Total 会将一天内所有 Token 合并成单柱。'\\n        : 'The page supports two chart modes: Breakdown splits input, output, cache read, cache write, and thinking tokens; Total combines each day into a single bar.'\\n      }</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/tokens.png\\" alt={zh ? 'AIUsage Token 页面截图' : 'AIUsage tokens page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? 'Token 页面支持 Breakdown / Total 两种视图，并在表格中列出每天各类 Token。' : 'Tokens page with Breakdown / Total modes and the daily token table.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"tokens-chart\\">\\n      <h3>{zh ? '每日柱状图' : 'Daily Bar Chart'}</h3>\\n      <p>{zh\\n        ? '每组柱子展示同一天内的各类 Token（输入、输出、缓存读取、缓存写入、思考 Token），悬停可查看具体数值。'\\n        : 'Each bar group shows the token types for one day (input, output, cache read, cache write, thinking). Hover to see exact counts.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"tokens-table\\">\\n      <h3>{zh ? '明细表格' : 'Detail Table'}</h3>\\n      <p>{zh\\n        ? '表格列出每天各类型的 Token 数量及合计，支持横向滚动查看较长时间范围的数据。'\\n        : 'A table below lists per-day counts for each token type plus a daily total. Scroll horizontally for longer date ranges.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"tokens-types\\">\\n      <h3>{zh ? 'Token 类型说明' : 'Token Types'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '输入' : 'Input'}</strong> — {zh ? '发送给模型的提示 Token' : 'Prompt tokens sent to the model'}</li>\\n        <li><strong>{zh ? '输出' : 'Output'}</strong> — {zh ? '模型生成的回复 Token' : 'Tokens generated by the model'}</li>\\n        <li><strong>{zh ? '缓存读取' : 'Cache Read'}</strong> — {zh ? '从缓存中命中并读取的 Token（计费更低）' : 'Tokens read from cache (billed at a lower rate)'}</li>\\n        <li><strong>{zh ? '缓存写入' : 'Cache Write'}</strong> — {zh ? '写入缓存的 Token' : 'Tokens written to the cache'}</li>\\n        <li><strong>{zh ? '思考' : 'Thinking'}</strong> — {zh ? '扩展思考功能使用的 Token' : 'Tokens used by Extended Thinking mode'}</li>\\n      </ul>\\n    </section>\\n\\n    <!-- ══════ Cost ══════ -->\\n    <section id=\\"cost\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">05</span>\\n        <h2>{zh ? '费用' : 'Cost'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '费用页面展示总费用卡片、每日费用柱状图，以及按工具和按模型的前 10 名费用排行。'\\n        : 'The Cost page shows a total cost card, a daily cost bar chart, and top-10 cost breakdowns by tool and by model.'\\n      }</p>\\n      <Callout type=\\"warn\\">\\n        {zh\\n          ? '费用为估算值，基于「定价」页面中的每百万 Token 价格计算。若你修改了定价，请手动执行重新计算费用。'\\n          : 'Costs are estimates based on the per-million-token pricing table. If you change pricing, run the cost recalculation step manually.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/cost.png\\" alt={zh ? 'AIUsage 费用页面截图' : 'AIUsage cost page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '费用页显示总费用、每日费用走势，以及按工具 / 模型的费用排行。' : 'Cost page showing total cost, daily trend, and ranked breakdowns by tool and model.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"cost-daily\\">\\n      <h3>{zh ? '每日费用图' : 'Daily Cost Chart'}</h3>\\n      <p>{zh ? '柱状图展示每天的费用，悬停可查看当日金额。' : 'A bar chart showing per-day costs. Hover to view exact amounts.'}</p>\\n    </section>\\n\\n    <section id=\\"cost-breakdown\\">\\n      <h3>{zh ? '按助手与模型分布' : 'By Assistant & Model'}</h3>\\n      <p>{zh\\n        ? '不同工具（Claude Code、Codex 等）的费用排名。不同模型（claude-sonnet-4-5、gpt-4o 等）的费用排名。'\\n        : 'Ranked list of costs per tool (Claude Code, Codex, etc.) and per model (e.g. claude-sonnet-4-5, gpt-4o).'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Models ══════ -->\\n    <section id=\\"models\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">06</span>\\n        <h2>{zh ? '模型' : 'Models'}</h2>\\n      </div>\\n      <p>{zh ? '模型页面按总 Token 使用量排序，展示模型 ID、提供商、调用次数、总 Token，以及占比进度条。' : 'The Models page ranks models by total token usage and shows model ID, provider, call count, total tokens, and share bars.'}</p>\\n      <ul>\\n        <li><strong>{zh ? '模型' : 'Model'}</strong> — {zh ? '模型 ID（如 claude-sonnet-4-6）' : 'Model ID (e.g. claude-sonnet-4-6)'}</li>\\n        <li><strong>{zh ? '提供商' : 'Provider'}</strong> — {zh ? '服务提供商（Anthropic、OpenAI 等）' : 'Service provider (Anthropic, OpenAI, etc.)'}</li>\\n        <li><strong>{zh ? '调用次数' : 'Calls'}</strong> — {zh ? '该模型被调用的次数' : 'Number of times invoked'}</li>\\n        <li><strong>{zh ? 'Token' : 'Tokens'}</strong> — {zh ? '该模型消耗的 Token 总量' : 'Total tokens consumed'}</li>\\n        <li><strong>{zh ? '占比' : 'Share'}</strong> — {zh ? '在当前筛选结果中的占比（含进度条）' : 'Percentage within the current filtered dataset (with progress bar)'}</li>\\n      </ul>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/models.png\\" alt={zh ? 'AIUsage 模型页面截图' : 'AIUsage models page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '模型页用表格和进度条展示各模型的调用量与 Token 占比。' : 'Models page uses a table and share bars to compare model usage.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <!-- ══════ Tool Calls ══════ -->\\n    <section id=\\"tool-calls\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">07</span>\\n        <h2>{zh ? '工具调用' : 'Tool Calls'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '工具调用页面展示会话内工具调用频次排行，可切换查看全部、builtin、mcp、skill 三种类型。Qoder 和 Cursor 当前不会产出工具调用数据，因此切换到这两类工具时页面会显示提示。'\\n        : 'The Tool Calls page ranks tool usage within sessions and supports All, builtin, mcp, and skill tabs. Qoder and Cursor currently do not emit tool-call data, so the page shows a notice when filtered to those tools.'\\n      }</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/tool-calls.png\\" alt={zh ? 'AIUsage 工具调用页面截图' : 'AIUsage tool calls page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '工具调用页支持类型切换，并用排行条展示调用占比。' : 'Tool Calls page with type tabs and ranked percentage bars.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <!-- ══════ Projects ══════ -->\\n    <section id=\\"projects\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">08</span>\\n        <h2>{zh ? '项目' : 'Projects'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '项目页面按项目目录汇总 Token 和费用，并显示项目名、完整路径、占比条、Token 总量、费用与百分比。适合快速找出最耗资源的仓库。'\\n        : 'The Projects page aggregates usage by project directory and shows project name, full path, share bar, total tokens, cost, and percentage so you can spot the most expensive repos quickly.'\\n      }</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/projects.png\\" alt={zh ? 'AIUsage 项目页面截图' : 'AIUsage projects page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '项目页按目录聚合，适合定位最耗 Token / 费用的代码仓库。' : 'Projects page grouped by directory to identify the most expensive repos.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <!-- ══════ Sessions ══════ -->\\n    <section id=\\"sessions\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">09</span>\\n        <h2>{zh ? '会话' : 'Sessions'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '会话页面按分页展示会话列表（每页 50 条），点击任意一行可进入详情页。列表列包含时间、工具、模型、持续时长、工具调用次数、输入 / 输出 Token 与费用。'\\n        : 'The Sessions page lists sessions 50 per page. Click any row to open the detail view. Columns include time, tool, model, duration, tool-call count, input/output tokens, and cost.'\\n      }</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/sessions.png\\" alt={zh ? 'AIUsage 会话列表页截图' : 'AIUsage sessions list page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '会话列表支持分页，并可点击进入单个会话详情。' : 'Session list with pagination and clickable rows for detail view.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/session-detail.png\\" alt={zh ? 'AIUsage 会话详情页截图' : 'AIUsage session detail page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '会话详情页按时间线展示 API records、tool calls 和记录间隔。' : 'Session detail page showing the timeline of API records, tool calls, and gaps between records.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <!-- ══════ Quotas ══════ -->\\n    <section id=\\"quotas\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">10</span>\\n        <h2>{zh ? '配额监控' : 'Quotas'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '配额页面当前主要覆盖 Claude Code 和 Codex。页面会把有凭证的工具显示为卡片，没有本地凭证的工具则放到下方的 inactive 列表中。'\\n        : 'The Quotas page currently focuses on tools with local quota credentials, mainly Claude Code and Codex. Tools with credentials appear as cards, while tools without credentials are listed in an inactive section below.'\\n      }</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/quotas.png\\" alt={zh ? 'AIUsage 配额页面截图' : 'AIUsage quotas page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '配额页用卡片显示各层级利用率、颜色状态和重置倒计时。' : 'Quota cards show utilization, color state, and reset countdowns.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"quotas-cards\\">\\n      <h3>{zh ? '配额卡片' : 'Quota Cards'}</h3>\\n      <p>{zh\\n        ? '每个已配置凭证的工具会显示最后更新时间，以及当前查询状态：正常显示 tiers、凭证过期、解析失败、查询失败、或暂无 tiers。未配置凭证的工具会显示在底部 inactive 列表中。'\\n        : 'Each configured tool shows the last query time and one of several states: normal tier display, expired credentials, parse error, query failure, or no tiers. Tools without credentials appear in the inactive list at the bottom.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"quotas-tiers\\">\\n      <h3>{zh ? '配额条' : 'Tier Bars'}</h3>\\n      <p>{zh\\n        ? '每个配额层级（如 5h、7d）显示一个进度条，颜色表示使用率：绿色（<70%）、橙色（70-90%）、红色（>90%）。显示重置倒计时。'\\n        : 'Each quota tier (e.g. 5h, 7d) shows a progress bar. Color indicates utilization: green (<70%), orange (70-90%), red (>90%). Reset countdown shown.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Pricing ══════ -->\\n    <section id=\\"pricing\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">11</span>\\n        <h2>{zh ? '定价' : 'Pricing'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '定价页面按模型显示卡片，可直接编辑 input / output / cache read / cache write 的每百万 Token 单价。状态标签可能是 Default、Override、自定义前缀匹配，或 No pricing；部分模型还会显示 CNY 标签。'\\n        : 'The Pricing page shows one card per model and lets you edit per-million-token rates for input, output, cache read, and cache write. Status badges may indicate Default, Override, prefix match, or No pricing, and some models also carry a CNY badge.'\\n      }</p>\\n      <Callout type=\\"warn\\">\\n        {zh\\n          ? '点击「重新计算费用」会批量更新数据库中历史记录的费用字段，请在确认定价无误后再执行。'\\n          : 'Clicking Recalculate Costs updates historical cost fields in the database, so only run it after you confirm the pricing table is correct.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/pricing.png\\" alt={zh ? 'AIUsage 定价页面截图' : 'AIUsage pricing page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '定价页支持逐模型编辑费率，并通过标签区分默认价、自定义价和无定价模型。' : 'Pricing page with editable per-model rates and badges for default, override, and missing pricing.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <!-- ══════ Settings ══════ -->\\n    <section id=\\"settings\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">12</span>\\n        <h2>{zh ? '设置' : 'Settings'}</h2>\\n      </div>\\n      <p>{zh ? '设置页按模块分区，当前包含 General、Data Sources、Sync、Data、Currency 五个区域，每个区域独立保存。' : 'The Settings page is split into independent sections: General, Data Sources, Sync, Data, and Currency. Each section saves separately.'}</p>\\n    </section>\\n\\n    <section>\\n      <figure class=\\"doc-shot\\">\\n        <img src=\\"/screenshots/settings.png\\" alt={zh ? 'AIUsage 设置页面截图' : 'AIUsage settings page screenshot'} loading=\\"lazy\\" />\\n        <figcaption>{zh ? '设置页包含通用配置、日志路径、同步凭证、数据保留和货币显示设置。' : 'Settings page with general config, source paths, sync credentials, data retention, and currency display settings.'}</figcaption>\\n      </figure>\\n    </section>\\n\\n    <section id=\\"settings-general\\">\\n      <h3>{zh ? '通用' : 'General'}</h3>\\n      <DocsTable\\n        headers={zh ? ['字段', '说明'] : ['Field', 'Description']}\\n        rows={[\\n          [zh ? '设备别名' : 'Device Alias', zh ? '可选的当前设备名称，留空则使用主机名' : 'Optional device name, defaults to hostname'],\\n          [zh ? '每周起始日' : 'Week Starts On', zh ? '「本周」时间范围的起始天（周日或周一 ISO）' : 'Starting day for \\"This Week\\" range (Sunday or Monday ISO)'],\\n          [zh ? '仪表盘轮询间隔' : 'Dashboard Poll Interval', zh ? '首页自动刷新的间隔（毫秒）' : 'Auto-refresh interval for the home dashboard in milliseconds'],\\n          [zh ? '自动解析间隔' : 'Auto-Parse Interval', zh ? '后台自动触发解析的间隔（毫秒），设为 0 或留空可关闭' : 'Background parse interval in milliseconds; use 0 or empty to disable'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"settings-sources\\">\\n      <h3>{zh ? '数据源' : 'Data Sources'}</h3>\\n      <p>{zh ? '为每种 AI 工具指定自定义日志目录路径。留空则使用默认路径：' : 'Specify custom log directory paths for each AI tool. Leave blank for defaults:'}</p>\\n      <ul>\\n        <li><strong>Claude Code</strong> — <code>~/.claude/projects</code></li>\\n        <li><strong>Codex</strong> — <code>~/.codex/sessions</code></li>\\n        <li><strong>OpenClaw</strong> — <code>~/.openclaw/agents</code></li>\\n        <li><strong>OpenCode</strong> — {zh ? '平台相关的 SQLite 数据库路径' : 'platform-specific SQLite database path'}</li>\\n        <li><strong>Hermes</strong> — <code>~/.hermes/state.db</code></li>\\n        <li><strong>Qoder</strong> — <code>~/.qoder/logs/sessions</code> + {zh ? '平台相关的' : 'platform-specific'} <code>local.db</code></li>\\n        <li><strong>Cursor</strong> — {zh ? '平台相关的' : 'platform-specific'} <code>state.vscdb</code></li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"settings-data\\">\\n      <h3>{zh ? '数据管理' : 'Data Management'}</h3>\\n      <p><strong>{zh ? '本地数据保留天数' : 'Local Data Retention (days)'}</strong> — {zh\\n        ? '用于配置后续清理策略。设为 0 或留空则表示永久保留；设置页面本身不会立即删除数据。'\\n        : 'Controls future cleanup policy. Set to 0 or leave empty to keep data forever; changing this setting does not immediately delete records.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Sync ══════ -->\\n    <section id=\\"sync\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">13</span>\\n        <h2>{zh ? '多设备同步' : 'Sync'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '同步功能会把本机数据上传到远端，再拉取其他设备的数据并合并。你可以通过侧边栏 Sync 按钮手动触发，也可以先用 init 命令或设置页完成后端配置。'\\n        : 'Sync uploads this device’s data, pulls data from other devices, and merges the results. You can trigger it from the sidebar Sync button after configuring the backend via init or the Settings page.'\\n      }</p>\\n      <ul>\\n        <li><strong>GitHub</strong> — {zh ? '推送到 GitHub 仓库' : 'Push to a GitHub repository'}</li>\\n        <li><strong>S3 / {zh ? '兼容存储' : 'Compatible'}</strong> — {zh ? '推送到 Amazon S3 或任何 S3 兼容存储（Cloudflare R2、MinIO 等）' : 'Push to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, etc.)'}</li>\\n      </ul>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage sync\\">\\n        <span slot=\\"lines\\"><span>1</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> sync\\n      </CodeBlock>\\n    </section>\\n\\n    <!-- ══════ Export ══════ -->\\n    <section id=\\"export\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">14</span>\\n        <h2>{zh ? '数据导出' : 'Export'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到已有的数据管道和报表系统。'\\n        : 'Export usage data as CSV, JSON, or NDJSON for integration with existing data pipelines and reporting.'\\n      }</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'aiusage export --format csv -o usage.csv\\\\naiusage export --format json -o usage.json\\\\naiusage export --format ndjson'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> export --format csv -o usage.csv\\n<span class=\\"tk-kw\\">aiusage</span> export --format json -o usage.json\\n<span class=\\"tk-kw\\">aiusage</span> export --format ndjson\\n      </CodeBlock>\\n    </section>\\n\\n    <!-- ══════ Widget ══════ -->\\n    <section id=\\"widget\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">15</span>\\n        <h2>{zh ? '桌面小组件' : 'Widget'}</h2>\\n      </div>\\n      <p>{zh\\n        ? 'Widget 是独立发布的 Electron 托盘应用。CLI 中的 aiusage widget 命令会尝试启动已安装的 aiusage-widget；如果尚未安装，会提示先安装对应包。'\\n        : 'Widget is a separately published Electron tray app. The aiusage widget CLI command tries to launch an installed aiusage-widget binary; if it is missing, the CLI asks you to install the package first.'\\n      }</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'npm install -g @juliantanx/aiusage-widget\\\\naiusage widget'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g <span class=\\"tk-str\\">@juliantanx/aiusage-widget</span>\\n<span class=\\"tk-kw\\">aiusage</span> widget\\n      </CodeBlock>\\n      <p>{zh\\n        ? 'Widget 与 CLI 共用同一个本地数据库，因此通常需要先运行 aiusage parse 导入数据。'\\n        : 'The widget reads the same local database as the CLI, so you typically need to run aiusage parse first.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ CLI Reference ══════ -->\\n    <section id=\\"cli\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">16</span>\\n        <h2>{zh ? 'CLI 命令参考' : 'CLI Reference'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '所有 CLI 命令均通过 aiusage <command> 调用；不带子命令时会输出 summary。当前内置的主要命令包括 summary、status、parse、serve、export、clean、reset、recalc、init、sync、widget、pm2-setup 和 pm2-start。'\\n        : 'All CLI commands are invoked as aiusage <command>; running aiusage without a subcommand prints the summary. Main built-ins currently include summary, status, parse, serve, export, clean, reset, recalc, init, sync, widget, pm2-setup, and pm2-start.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"cli-parse\\">\\n      <h3><code>parse</code> — {zh ? '解析日志' : 'Parse Logs'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--tool &lt;tool&gt;</code>', zh ? '只解析指定工具' : 'Only parse specific tool: claude-code, codex, openclaw, opencode, hermes, qoder, cursor'],\\n          ['<code>--progress</code>', zh ? '显示实时进度条（仅 TTY）' : 'Show real-time progress bar (TTY only)'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-serve\\">\\n      <h3><code>serve</code> — {zh ? '启动仪表盘' : 'Start Dashboard'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}\\n        rows={[\\n          ['<code>-p, --port &lt;port&gt;</code>', zh ? '端口号' : 'Port number', '<code>3847</code>'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-summary\\">\\n      <h3><code>summary</code> — {zh ? '终端摘要' : 'Terminal Summary'}</h3>\\n      <p>{zh ? '默认命令。输出总 Token、总费用、记录数；当存在数据时还会显示按工具汇总，默认入口还会附带 Top Tool Calls。' : 'This is the default command. It prints total tokens, total cost, and record count; when data exists it also shows a by-tool summary, and the root command additionally prints Top Tool Calls.'}</p>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--week</code>', zh ? '查看本周数据' : 'Show this week'],\\n          ['<code>--month</code>', zh ? '查看本月数据' : 'Show this month'],\\n          ['<code>--from &lt;date&gt;</code>', zh ? '开始日期（YYYY-MM-DD）' : 'Start date (YYYY-MM-DD)'],\\n          ['<code>--to &lt;date&gt;</code>', zh ? '结束日期（YYYY-MM-DD）' : 'End date (YYYY-MM-DD)'],\\n          ['<code>--device &lt;id&gt;</code>', zh ? '按设备实例 ID 筛选' : 'Filter by device instance ID'],\\n          ['<code>--tool &lt;tool&gt;</code>', zh ? '按工具类型筛选' : 'Filter by tool type'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-export\\">\\n      <h3><code>export</code> — {zh ? '导出数据' : 'Export Data'}</h3>\\n      <p>{zh ? '导出命令当前要求显式指定格式，可输出到文件，也可直接打印到 stdout。' : 'The export command currently requires an explicit format and can write either to a file or to stdout.'}</p>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '必填'] : ['Option', 'Description', 'Required']}\\n        rows={[\\n          ['<code>--format &lt;f&gt;</code>', 'csv, json, ndjson', zh ? '是' : 'Yes'],\\n          ['<code>--range &lt;range&gt;</code>', zh ? '时间范围（day | week | month）' : 'Time range (day | week | month)', zh ? '否' : 'No'],\\n          ['<code>--from &lt;date&gt;</code>', zh ? '开始日期（YYYY-MM-DD）' : 'Start date (YYYY-MM-DD)', zh ? '否' : 'No'],\\n          ['<code>--to &lt;date&gt;</code>', zh ? '结束日期（YYYY-MM-DD）' : 'End date (YYYY-MM-DD)', zh ? '否' : 'No'],\\n          ['<code>-o, --output &lt;f&gt;</code>', zh ? '输出文件路径（默认 stdout）' : 'Output file path (default: stdout)', zh ? '否' : 'No'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-clean\\">\\n      <h3><code>clean</code> — {zh ? '清理旧数据' : 'Clean Old Data'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}\\n        rows={[\\n          ['<code>--before &lt;dur&gt;</code>', zh ? '删除此时间之前的数据（如 30d、180d）' : 'Delete data older than this (e.g. 30d, 180d)', '<code>180d</code>'],\\n          ['<code>--remote</code>', zh ? '同时清理远端同步数据' : 'Also clean remote synced data', '-'],\\n          ['<code>--all-devices</code>', zh ? '配合 --remote 清理所有设备' : 'Clean all devices together with --remote', '-'],\\n          ['<code>--yes</code>', zh ? '跳过确认' : 'Skip confirmation', '-'],\\n          ['<code>--approve-delete</code>', zh ? '批准删除权限升级' : 'Approve delete permission upgrade', '-'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-reset\\">\\n      <h3><code>reset</code> — {zh ? '重置所有数据' : 'Reset All Data'}</h3>\\n      <p>{zh\\n        ? '删除所有已解析的记录、工具调用、同步数据和水位线。原始日志文件不受影响。'\\n        : 'Delete all parsed records, tool calls, synced data, and the parse watermark. Source log files are not affected.'\\n      }</p>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--yes</code>', zh ? '跳过确认提示（必须指定才会执行）' : 'Skip confirmation prompt (required to execute)'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-other\\">\\n      <h3>{zh ? '其他命令' : 'Other Commands'}</h3>\\n      <DocsTable\\n        headers={zh ? ['命令', '说明'] : ['Command', 'Description']}\\n        rows={[\\n          ['<code>status</code>', zh ? '显示版本号、设备名称、数据库路径、schema 版本、对象数量、记录数、数据库大小及同步状态' : 'Show version, device name, DB path, schema version, object counts, record count, DB size, and sync status'],\\n          ['<code>sync</code>', zh ? '与远程后端执行推送 / 拉取 / 合并同步' : 'Push, pull, and merge data with the remote backend'],\\n          ['<code>recalc</code>', zh ? '按最新定价重新计算费用' : 'Recalculate costs with latest pricing'],\\n          ['<code>init</code>', zh ? '初始化同步后端（支持 GitHub / S3）' : 'Initialize sync backend (GitHub or S3)'],\\n          ['<code>widget</code>', zh ? '启动桌面托盘 Widget' : 'Launch the desktop tray widget'],\\n          ['<code>pm2-setup</code>', zh ? '生成 PM2 ecosystem.config.cjs' : 'Generate PM2 ecosystem.config.cjs'],\\n          ['<code>pm2-start</code>', zh ? '生成配置并启动 PM2 后台服务' : 'Generate config and start PM2 background services'],\\n        ]}\\n      />\\n    </section>\\n  </article>\\n\\n  {#if showBackToTop}\\n    <button class=\\"back-to-top\\" on:click={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label=\\"Back to top\\">\\n      ↑\\n    </button>\\n  {/if}\\n</div>\\n\\n<style>\\n  /* ── Layout ──────────────────────────────────────────────── */\\n  .docs-layout {\\n    width: var(--content-width);\\n    margin: 0 auto;\\n    padding: 2rem 0 4rem;\\n    position: relative;\\n  }\\n\\n  /* ── Mobile TOC ──────────────────────────────────────────── */\\n  .mobile-toc-toggle {\\n    display: none;\\n    align-items: center;\\n    gap: 0.625rem;\\n    width: 100%;\\n    padding: 0.75rem 1rem;\\n    background: var(--surface);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 8px;\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    font-weight: 550;\\n    color: var(--text-secondary);\\n    cursor: pointer;\\n    margin-bottom: 0.5rem;\\n  }\\n\\n  .toc-burger {\\n    display: flex;\\n    flex-direction: column;\\n    gap: 3px;\\n    width: 16px;\\n  }\\n\\n  .toc-burger span {\\n    display: block;\\n    height: 2px;\\n    background: var(--accent);\\n    border-radius: 1px;\\n    transition: all 0.2s ease;\\n  }\\n\\n  .toc-burger.open span:nth-child(1) {\\n    transform: rotate(45deg) translate(3px, 3px);\\n  }\\n  .toc-burger.open span:nth-child(2) {\\n    opacity: 0;\\n  }\\n  .toc-burger.open span:nth-child(3) {\\n    transform: rotate(-45deg) translate(4px, -4px);\\n  }\\n\\n  /* ── Sidebar ─────────────────────────────────────────────── */\\n  .docs-sidebar {\\n    position: fixed;\\n    top: 76px;\\n    left: calc(50% - var(--content-width) / 2);\\n    width: 260px;\\n    max-height: calc(100vh - 92px);\\n    overflow-y: auto;\\n    scrollbar-width: thin;\\n    transition: transform 0.15s ease;\\n  }\\n\\n  /* ── Hero ────────────────────────────────────────────────── */\\n  .docs-hero {\\n    margin-bottom: 3rem;\\n    padding-bottom: 2.5rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n    position: relative;\\n  }\\n\\n  .docs-hero::after {\\n    content: '';\\n    position: absolute;\\n    bottom: -1px;\\n    left: 0;\\n    width: 80px;\\n    height: 2px;\\n    background: var(--accent);\\n  }\\n\\n  .hero-eyebrow {\\n    display: inline-flex;\\n    align-items: center;\\n    gap: 0.5rem;\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 600;\\n    text-transform: uppercase;\\n    letter-spacing: 0.1em;\\n    color: var(--accent);\\n    margin-bottom: 0.75rem;\\n    padding: 0.3rem 0.75rem;\\n    background: var(--accent-dim);\\n    border-radius: 4px;\\n  }\\n\\n  .hero-eyebrow-icon {\\n    font-size: 0.8125rem;\\n  }\\n\\n  .hero-title {\\n    font-family: 'Source Serif 4', 'Georgia', serif;\\n    font-size: 2.5rem;\\n    font-weight: 700;\\n    letter-spacing: -0.03em;\\n    color: var(--text);\\n    margin-bottom: 0.75rem;\\n    line-height: 1.15;\\n  }\\n\\n  .hero-sub {\\n    font-size: 1.0625rem;\\n    color: var(--text-secondary);\\n    line-height: 1.7;\\n    max-width: 640px;\\n  }\\n\\n  .hero-meta {\\n    display: flex;\\n    gap: 0.5rem;\\n    margin-top: 1.25rem;\\n    flex-wrap: wrap;\\n  }\\n\\n  .meta-tag {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 550;\\n    color: var(--text-muted);\\n    background: var(--raised);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 4px;\\n    padding: 0.2rem 0.5rem;\\n    letter-spacing: 0.02em;\\n  }\\n\\n  /* ── Content ─────────────────────────────────────────────── */\\n  .docs-content {\\n    min-width: 0;\\n    max-width: 85ch;\\n    margin-left: 290px;\\n  }\\n\\n  /* ── Section heads ───────────────────────────────────────── */\\n  section {\\n    margin-bottom: 2.5rem;\\n    padding-top: 0.25rem;\\n    scroll-margin-top: 76px;\\n  }\\n\\n  .sec-head {\\n    display: flex;\\n    align-items: baseline;\\n    gap: 0.875rem;\\n    margin-bottom: 0.75rem;\\n    padding-bottom: 0.625rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n  }\\n\\n  .sec-idx {\\n    font-family: var(--mono);\\n    font-size: 0.75rem;\\n    font-weight: 700;\\n    color: var(--accent);\\n    opacity: 0.6;\\n    letter-spacing: 0.02em;\\n    flex-shrink: 0;\\n  }\\n\\n  section h2 {\\n    font-family: 'Source Serif 4', 'Georgia', serif;\\n    font-size: 1.375rem;\\n    font-weight: 700;\\n    color: var(--text);\\n    letter-spacing: -0.02em;\\n    margin: 0;\\n    padding: 0;\\n    border: none;\\n  }\\n\\n  section h3 {\\n    font-family: 'Instrument Sans', sans-serif;\\n    font-size: 1.0625rem;\\n    font-weight: 600;\\n    color: var(--text);\\n    letter-spacing: -0.01em;\\n    margin: 2rem 0 0.75rem;\\n  }\\n\\n  section p {\\n    font-size: 0.9375rem;\\n    color: var(--text-secondary);\\n    line-height: 1.75;\\n    margin-bottom: 0.75rem;\\n  }\\n\\n  section ul {\\n    padding-left: 1.25rem;\\n    margin-bottom: 0.75rem;\\n    list-style: none;\\n  }\\n\\n  section li {\\n    font-size: 0.9375rem;\\n    color: var(--text-secondary);\\n    line-height: 1.75;\\n    margin-bottom: 0.375rem;\\n    position: relative;\\n    padding-left: 0.875rem;\\n  }\\n\\n  section li::before {\\n    content: '';\\n    position: absolute;\\n    left: 0;\\n    top: 0.6em;\\n    width: 4px;\\n    height: 4px;\\n    border-radius: 50%;\\n    background: var(--accent);\\n    opacity: 0.4;\\n  }\\n\\n  section strong {\\n    color: var(--text);\\n    font-weight: 600;\\n  }\\n\\n  section code {\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    background: var(--raised);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 4px;\\n    padding: 0.1em 0.4em;\\n    color: var(--accent);\\n  }\\n\\n  .doc-shot {\\n    margin: 0;\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 12px;\\n    overflow: hidden;\\n    background: var(--surface);\\n    box-shadow: var(--shadow-sm);\\n  }\\n\\n  .doc-shot img {\\n    display: block;\\n    width: 100%;\\n    height: auto;\\n    background: var(--raised);\\n  }\\n\\n  .doc-shot figcaption {\\n    padding: 0.75rem 1rem;\\n    font-size: 0.8125rem;\\n    line-height: 1.6;\\n    color: var(--text-secondary);\\n    border-top: 1px solid var(--border-subtle);\\n    background: var(--raised);\\n  }\\n\\n  /* ── Back to top ─────────────────────────────────────────── */\\n  .back-to-top {\\n    position: fixed;\\n    bottom: 2rem;\\n    right: 2rem;\\n    z-index: 50;\\n    width: 44px;\\n    height: 44px;\\n    border-radius: 50%;\\n    background: var(--accent);\\n    color: oklch(0.99 0.002 85);\\n    border: none;\\n    cursor: pointer;\\n    font-size: 1.125rem;\\n    display: flex;\\n    align-items: center;\\n    justify-content: center;\\n    box-shadow: 0 2px 12px oklch(0 0 0 / 0.15);\\n    transition: all 0.2s ease;\\n    animation: fadeIn 0.2s ease-out;\\n  }\\n\\n  .back-to-top:hover {\\n    background: var(--accent-hover);\\n    transform: translateY(-2px);\\n    box-shadow: 0 4px 16px oklch(0 0 0 / 0.2);\\n  }\\n\\n  @keyframes fadeIn {\\n    from { opacity: 0; transform: translateY(8px); }\\n    to { opacity: 1; transform: translateY(0); }\\n  }\\n\\n  /* ── Responsive ──────────────────────────────────────────── */\\n  @media (max-width: 800px) {\\n    .docs-content {\\n      margin-left: 0;\\n    }\\n\\n    .mobile-toc-toggle {\\n      display: flex;\\n    }\\n\\n    .docs-sidebar {\\n      display: none;\\n      position: static;\\n      width: auto;\\n      max-height: none;\\n      margin-bottom: 1rem;\\n    }\\n\\n    .docs-sidebar.mobile-open {\\n      display: block;\\n      background: var(--surface);\\n      border: 1px solid var(--border-subtle);\\n      border-radius: 8px;\\n      padding: 0.5rem;\\n    }\\n\\n    .docs-sidebar.mobile-open :global(.toc) {\\n      border-right: none;\\n      padding-right: 0;\\n    }\\n\\n    .hero-title {\\n      font-size: 1.875rem;\\n    }\\n  }\\n</style>\\n"],"names":[],"mappings":"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"}`
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let zh;
  let $lang, $$unsubscribe_lang;
  $$unsubscribe_lang = subscribe(lang, (value) => $lang = value);
  const sections = [
    {
      id: "getting-started",
      en: "Getting Started",
      zh: "快速开始",
      children: [
        {
          id: "install",
          en: "Installation",
          zh: "安装"
        },
        {
          id: "parse",
          en: "Parse Data",
          zh: "解析数据"
        },
        {
          id: "serve",
          en: "Start Dashboard",
          zh: "启动仪表盘"
        },
        {
          id: "pm2",
          en: "Background (PM2)",
          zh: "后台运行 (PM2)"
        },
        {
          id: "docker",
          en: "Docker",
          zh: "Docker 部署"
        }
      ]
    },
    {
      id: "dashboard",
      en: "Dashboard",
      zh: "仪表盘",
      children: [
        {
          id: "dash-elements",
          en: "UI Elements",
          zh: "界面元素"
        },
        {
          id: "dash-config",
          en: "Display Config",
          zh: "显示配置"
        }
      ]
    },
    {
      id: "overview",
      en: "Overview",
      zh: "概览",
      children: [
        {
          id: "overview-cards",
          en: "Stat Cards",
          zh: "统计卡片"
        },
        {
          id: "overview-breakdown",
          en: "Token Breakdown",
          zh: "Token 明细"
        },
        {
          id: "overview-assistant",
          en: "By AI Assistant",
          zh: "按 AI 助手统计"
        }
      ]
    },
    {
      id: "tokens",
      en: "Tokens",
      zh: "Token 用量",
      children: [
        {
          id: "tokens-chart",
          en: "Daily Bar Chart",
          zh: "每日柱状图"
        },
        {
          id: "tokens-table",
          en: "Detail Table",
          zh: "明细表格"
        },
        {
          id: "tokens-types",
          en: "Token Types",
          zh: "Token 类型说明"
        }
      ]
    },
    {
      id: "cost",
      en: "Cost",
      zh: "费用",
      children: [
        {
          id: "cost-daily",
          en: "Daily Cost Chart",
          zh: "每日费用图"
        },
        {
          id: "cost-breakdown",
          en: "By Assistant & Model",
          zh: "按助手与模型分布"
        }
      ]
    },
    {
      id: "models",
      en: "Models",
      zh: "模型",
      children: []
    },
    {
      id: "tool-calls",
      en: "Tool Calls",
      zh: "工具调用",
      children: []
    },
    {
      id: "projects",
      en: "Projects",
      zh: "项目",
      children: []
    },
    {
      id: "sessions",
      en: "Sessions",
      zh: "会话",
      children: []
    },
    {
      id: "quotas",
      en: "Quotas",
      zh: "配额监控",
      children: [
        {
          id: "quotas-cards",
          en: "Quota Cards",
          zh: "配额卡片"
        },
        {
          id: "quotas-tiers",
          en: "Tier Bars",
          zh: "配额条"
        }
      ]
    },
    {
      id: "pricing",
      en: "Pricing",
      zh: "定价",
      children: []
    },
    {
      id: "settings",
      en: "Settings",
      zh: "设置",
      children: [
        {
          id: "settings-general",
          en: "General",
          zh: "通用"
        },
        {
          id: "settings-sources",
          en: "Data Sources",
          zh: "数据源"
        },
        {
          id: "settings-data",
          en: "Data Management",
          zh: "数据管理"
        }
      ]
    },
    {
      id: "sync",
      en: "Sync",
      zh: "多设备同步",
      children: []
    },
    {
      id: "export",
      en: "Export",
      zh: "数据导出",
      children: []
    },
    {
      id: "widget",
      en: "Widget",
      zh: "桌面小组件",
      children: []
    },
    {
      id: "cli",
      en: "CLI Reference",
      zh: "CLI 命令",
      children: [
        {
          id: "cli-parse",
          en: "parse",
          zh: "parse"
        },
        {
          id: "cli-serve",
          en: "serve",
          zh: "serve"
        },
        {
          id: "cli-summary",
          en: "summary",
          zh: "summary"
        },
        {
          id: "cli-export",
          en: "export",
          zh: "export"
        },
        {
          id: "cli-clean",
          en: "clean",
          zh: "clean"
        },
        {
          id: "cli-reset",
          en: "reset",
          zh: "reset"
        },
        {
          id: "cli-other",
          en: "Other Commands",
          zh: "其他命令"
        }
      ]
    }
  ];
  let activeSection = "getting-started";
  let expandedSections = /* @__PURE__ */ new Set(["getting-started"]);
  let sidebarOffset = 0;
  $$result.css.add(css);
  zh = $lang === "zh";
  sections.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]);
  $$unsubscribe_lang();
  return `${$$result.head += `<!-- HEAD_svelte-fy32ad_START -->${$$result.title = `<title>${escape(zh ? "文档" : "Documentation")} — AIUsage</title>`, ""}<meta name="description"${add_attribute(
    "content",
    zh ? "AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。" : "AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.",
    0
  )}><link rel="canonical" href="https://aiusage.jtanx.com/docs"><meta property="og:title" content="${escape(zh ? "文档" : "Documentation", true) + " — AIUsage"}"><meta property="og:description"${add_attribute(
    "content",
    zh ? "AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。" : "AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.",
    0
  )}><meta property="og:url" content="https://aiusage.jtanx.com/docs"><meta name="twitter:title" content="${escape(zh ? "文档" : "Documentation", true) + " — AIUsage"}"><meta name="twitter:description"${add_attribute(
    "content",
    zh ? "AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。" : "AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.",
    0
  )}><!-- HTML_TAG_START -->${`<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: zh ? "AIUsage 文档" : "AIUsage Documentation",
    description: zh ? "AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。" : "AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.",
    url: "https://aiusage.jtanx.com/docs",
    isPartOf: {
      "@type": "WebSite",
      name: "AIUsage",
      url: "https://aiusage.jtanx.com"
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://aiusage.jtanx.com/"
        },
        {
          "@type": "ListItem",
          position: 2,
          name: zh ? "文档" : "Documentation",
          item: "https://aiusage.jtanx.com/docs"
        }
      ]
    }
  })}<\/script>`}<!-- HTML_TAG_END --><!-- HEAD_svelte-fy32ad_END -->`, ""} <div class="docs-layout svelte-1onn39h"><button class="mobile-toc-toggle svelte-1onn39h"><span class="${["toc-burger svelte-1onn39h", ""].join(" ").trim()}" data-svelte-h="svelte-6yzuhb"><span class="svelte-1onn39h"></span><span class="svelte-1onn39h"></span><span class="svelte-1onn39h"></span></span> <span>${escape(zh ? "目录" : "Contents")}</span></button> <aside class="${["docs-sidebar svelte-1onn39h", ""].join(" ").trim()}"${add_styles({
    "transform": `translateY(-${sidebarOffset}px)`
  })}>${validate_component(TableOfContents, "TableOfContents").$$render(
    $$result,
    {
      sections,
      activeSection,
      expandedSections,
      zh
    },
    {},
    {}
  )}</aside> <article class="docs-content svelte-1onn39h"> <header class="docs-hero svelte-1onn39h"><div class="hero-eyebrow svelte-1onn39h"><span class="hero-eyebrow-icon svelte-1onn39h" data-svelte-h="svelte-1qf64yp">⌘</span> <span>${escape(zh ? "AIUsage 参考手册" : "AIUsage Reference")}</span></div> <h1 class="hero-title svelte-1onn39h">${escape(zh ? "文档" : "Documentation")}</h1> <p class="hero-sub svelte-1onn39h">${escape(zh ? "AIUsage 是一款 AI 工具用量统计平台，支持 Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor 等多种 AI 工具的 Token 和费用追踪。" : "AIUsage is a local-first usage analytics platform for AI coding tools — tracking tokens, costs, sessions and more across Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, and Cursor.")}</p> <div class="hero-meta svelte-1onn39h"><span class="meta-tag svelte-1onn39h">${escape(zh ? "开源" : "Open Source")}</span> <span class="meta-tag svelte-1onn39h" data-svelte-h="svelte-klcsvz">MIT</span> <span class="meta-tag svelte-1onn39h" data-svelte-h="svelte-5yz3mj">v1.3.2</span></div></header>  <section id="getting-started" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-s0tx6t">01</span> <h2 class="svelte-1onn39h">${escape(zh ? "快速开始" : "Getting Started")}</h2></div> ${zh ? `<p class="svelte-1onn39h" data-svelte-h="svelte-1spn8ro">AIUsage 是一个命令行工具，内置 Web 仪表盘。安装完成后，它会解析 AI 工具生成的日志文件，并在本地数据库中追踪用量数据。</p>` : `<p class="svelte-1onn39h" data-svelte-h="svelte-ma1yho">AIUsage is a CLI tool with a built-in web dashboard. It parses log files generated by AI tools and tracks usage data in a local database.</p>`}</section> <section id="install" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "安装" : "Installation")}</h3> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "npm install -g @juliantanx/aiusage"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-m82xdz"><span>1</span><span>2</span><span>3</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-1ulrmys">npm</span> install -g <span class="tk-str" data-svelte-h="svelte-3wz3q2">@juliantanx/aiusage</span> <span class="tk-cmt" data-svelte-h="svelte-1oagxjs"># or with pnpm</span> <span class="tk-kw" data-svelte-h="svelte-fd4zc2">pnpm</span> add -g <span class="tk-str" data-svelte-h="svelte-3wz3q2">@juliantanx/aiusage</span>`;
      }
    }
  )}</section> <section id="parse" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "解析数据" : "Parse Data")}</h3> <p class="svelte-1onn39h">${escape(zh ? "解析 AI 工具的日志文件，写入本地数据库：" : "Parse log files from your AI tools into the local database:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "aiusage parse"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-1e9262g"><span>1</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> parse`;
      }
    }
  )}</section> <section id="serve" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "启动仪表盘" : "Start the Dashboard")}</h3> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "aiusage serve"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-1xa9ohv"><span>1</span><span>2</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> serve
<span class="tk-cmt" data-svelte-h="svelte-4q57wm"># Listens on http://localhost:3847 by default</span>`;
      }
    }
  )} <p class="svelte-1onn39h">${escape(zh ? "浏览器打开 http://localhost:3847 即可查看仪表盘。" : "Open http://localhost:3847 in your browser to view the dashboard.")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "info" }, {}, {
    default: () => {
      return `${escape(zh ? "首页会按当前时间范围从 API 拉取汇总数据，并根据设置中的轮询间隔自动刷新。需要导入新日志时，可手动运行 aiusage parse，或在设置里启用自动解析间隔。" : "The home page loads summary data for the current range and refreshes automatically based on the dashboard poll interval. To import new logs, run aiusage parse manually or enable the auto-parse interval in Settings.")}`;
    }
  })}</section> <section id="pm2" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "后台运行 (PM2)" : "Running in Background (PM2)")}</h3> <p class="svelte-1onn39h">${escape(zh ? "aiusage serve 默认在前台运行，关闭终端后服务会终止。如需后台持续运行，请使用 PM2：" : "aiusage serve runs in the foreground. To keep it running in the background, use PM2:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "npm install -g pm2\naiusage pm2-start\npm2 startup"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-m82xdz"><span>1</span><span>2</span><span>3</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-1ulrmys">npm</span> install -g pm2
<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> pm2-start
<span class="tk-kw" data-svelte-h="svelte-14wdfzm">pm2</span> startup`;
      }
    }
  )}</section> <section id="docker" class="svelte-1onn39h"><h3 class="svelte-1onn39h" data-svelte-h="svelte-1jtsdwc">Docker</h3> <p class="svelte-1onn39h">${escape(zh ? "使用官方 Docker 镜像运行 AIUsage，无需安装 Node.js：" : "Run AIUsage with the official Docker image, no Node.js installation required:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "docker run -d \\\n  -p 3847:3847 \\\n  -v ~/.aiusage:/root/.aiusage \\\n  juliantanx/aiusage"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-wnu0ji"><span>1</span><span>2</span><span>3</span><span>4</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-1apjpyz">docker</span> run -d \\
  -p 3847:3847 \\
  -v ~/.aiusage:/root/.aiusage \\
  juliantanx/aiusage`;
      }
    }
  )} ${validate_component(Callout, "Callout").$$render($$result, { type: "info" }, {}, {
    default: () => {
      return `${escape(zh ? "官方镜像当前提供在 Docker Hub（juliantanx/aiusage），支持 amd64 和 arm64 架构。" : "The official image is currently published on Docker Hub (juliantanx/aiusage) with amd64 and arm64 support.")}`;
    }
  })}</section>  <section id="dashboard" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-ej0w90">02</span> <h2 class="svelte-1onn39h">${escape(zh ? "仪表盘（首页）" : "Dashboard (Home)")}</h2></div> ${zh ? `<p class="svelte-1onn39h" data-svelte-h="svelte-tvrz97">首页是实时总览页，包含 LIVE 状态、当前时间范围、时钟、主 Token 计数器、配额预警、自动刷新进度条，以及费用 / 会话 / 活跃天数三项摘要。</p>` : `<p class="svelte-1onn39h" data-svelte-h="svelte-hzef9w">The home page is a live overview with the current range, clock, main token counter, quota warnings, refresh progress, and summary stats for cost, sessions, and active days.</p>`}</section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/dashboard-home.png"${add_attribute(
    "alt",
    zh ? "AIUsage 首页仪表盘截图" : "AIUsage dashboard home screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "首页展示实时累计 Token、刷新倒计时和配额预警。" : "Home page showing live token totals, refresh countdown, and quota warnings.")}</figcaption></figure></section> <section id="dash-elements" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "界面元素" : "UI Elements")}</h3> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "实时计数器" : "Live counter")}</strong> — ${escape(zh ? "显示总 Token 数，支持动画计数效果" : "Shows total tokens with a count-up animation")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "子统计" : "Sub-stats")}</strong> — ${escape(zh ? "分别展示输入、输出与缓存总量（缓存读写合并显示）" : "Shows input, output, and combined cache totals")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "范围与时钟" : "Range and clock")}</strong> — ${escape(zh ? "顶部显示当前时间范围、实时时钟和 LIVE 状态" : "Top bar shows the active range, live clock, and LIVE indicator")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "费用 / 会话 / 活跃天数" : "Cost / Sessions / Active Days")}</strong> — ${escape(zh ? "三个摘要统计块" : "Three summary stat blocks")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "Token 构成条" : "Token composition bar")}</strong> — ${escape(zh ? "按比例显示输入、输出、缓存读写分布" : "Proportional breakdown of input, output, cache read, and cache write")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "刷新进度条" : "Refresh progress bar")}</strong> — ${escape(zh ? "显示下次自动刷新的倒计时，并可手动立即刷新" : "Shows countdown to next refresh and allows manual refresh")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "配额预警" : "Quota warnings")}</strong> — ${escape(zh ? "当 Claude Code / Codex 配额层级达到 80% 以上时会在首页顶部提示" : "Shows warning banners when Claude Code or Codex quota tiers reach 80%+")}</li></ul></section> <section id="dash-config" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "显示配置" : "Display Config")}</h3> <p class="svelte-1onn39h">${escape(zh ? "点击右上角的齿轮按钮可打开显示配置面板：" : "Click the gear button to open the display config panel:")}</p> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "时间范围" : "Time range")}</strong> — ${escape(zh ? "全部 / 今天 / 本周 / 本月 / 近 30 天" : "All Time / Today / This Week / This Month / Last 30d")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "数字格式" : "Number format")}</strong> — ${escape(zh ? "精确（1,234,567）或简写（1.2K / 1.2M）" : "Exact numbers or abbreviated format (1.2K / 1.2M)")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "刷新说明" : "Refresh info")}</strong> — ${escape(zh ? "面板底部会显示当前轮询间隔，并可跳转到 Settings 修改 dashboard poll interval" : "The panel shows the current poll interval and links to Settings to change the dashboard poll interval")}</li></ul></section>  <section id="overview" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-x63qwb">03</span> <h2 class="svelte-1onn39h">${escape(zh ? "概览" : "Overview")}</h2></div> ${zh ? `<p class="svelte-1onn39h" data-svelte-h="svelte-1jezomn">概览页展示聚合统计摘要，并支持按日期范围、设备和 AI 工具筛选。这里也是查看按工具聚合和 Top Tool Calls / MCP 服务调用的入口。</p>` : `<p class="svelte-1onn39h" data-svelte-h="svelte-zkdls6">The Overview page shows aggregated stats with filters for date range, device, and AI tool. It also summarizes usage by tool and highlights top tool calls or MCP servers.</p>`} ${validate_component(Callout, "Callout").$$render($$result, { type: "tip" }, {}, {
    default: () => {
      return `${escape(zh ? "顶部三个筛选器（Date Range、Device、Tool）会同步影响 Overview、Tokens、Cost、Models、Tool Calls、Projects 和 Sessions 页面。" : "The Date Range, Device, and Tool filters are shared across Overview, Tokens, Cost, Models, Tool Calls, Projects, and Sessions.")}`;
    }
  })}</section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/overview.png"${add_attribute(
    "alt",
    zh ? "AIUsage 概览页截图" : "AIUsage overview page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "概览页包含统计卡片、Token 明细、按工具汇总，以及 Top Tool Calls / MCP 标签页。" : "Overview includes stat cards, token breakdown, by-tool totals, and the Top Tool Calls / MCP tabs.")}</figcaption></figure></section> <section id="overview-cards" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "统计卡片" : "Stat Cards")}</h3> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "总 Token" : "Total Tokens")}</strong> — ${escape(zh ? "所有类型 Token 的合计" : "Sum of all token types")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "总费用" : "Total Cost")}</strong> — ${escape(zh ? "基于定价表计算的估算费用" : "Estimated cost based on the pricing table")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "活跃天数" : "Active Days")}</strong> — ${escape(zh ? "有记录的天数" : "Number of days with recorded usage")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "会话数" : "Sessions")}</strong> — ${escape(zh ? "独立会话的总数" : "Total number of distinct sessions")}</li></ul></section> <section id="overview-breakdown" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "Token 明细" : "Token Breakdown")}</h3> <p class="svelte-1onn39h">${escape(zh ? "在卡片下方展示输入、输出、缓存读取、缓存写入的分项数据。" : "Below the cards: input, output, cache read, and cache write token counts shown individually.")}</p></section> <section id="overview-assistant" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "按 AI 助手统计" : "By AI Assistant")}</h3> <p class="svelte-1onn39h">${escape(zh ? "按使用的 AI 工具（claude-code、codex 等）分组，显示各工具的 Token 数和费用。列出调用次数最多的工具（如 Bash、Read、Edit 等）。" : "Usage grouped by AI tool (claude-code, codex, etc.) showing tokens and cost per tool. Most-called tool names ranked by invocation count.")}</p></section>  <section id="tokens" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-eqftoy">04</span> <h2 class="svelte-1onn39h">${escape(zh ? "Token 用量" : "Tokens")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "页面支持两种图表模式：Breakdown 会按输入、输出、缓存读取、缓存写入、思考 Token 分开展示；Total 会将一天内所有 Token 合并成单柱。" : "The page supports two chart modes: Breakdown splits input, output, cache read, cache write, and thinking tokens; Total combines each day into a single bar.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/tokens.png"${add_attribute(
    "alt",
    zh ? "AIUsage Token 页面截图" : "AIUsage tokens page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "Token 页面支持 Breakdown / Total 两种视图，并在表格中列出每天各类 Token。" : "Tokens page with Breakdown / Total modes and the daily token table.")}</figcaption></figure></section> <section id="tokens-chart" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "每日柱状图" : "Daily Bar Chart")}</h3> <p class="svelte-1onn39h">${escape(zh ? "每组柱子展示同一天内的各类 Token（输入、输出、缓存读取、缓存写入、思考 Token），悬停可查看具体数值。" : "Each bar group shows the token types for one day (input, output, cache read, cache write, thinking). Hover to see exact counts.")}</p></section> <section id="tokens-table" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "明细表格" : "Detail Table")}</h3> <p class="svelte-1onn39h">${escape(zh ? "表格列出每天各类型的 Token 数量及合计，支持横向滚动查看较长时间范围的数据。" : "A table below lists per-day counts for each token type plus a daily total. Scroll horizontally for longer date ranges.")}</p></section> <section id="tokens-types" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "Token 类型说明" : "Token Types")}</h3> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "输入" : "Input")}</strong> — ${escape(zh ? "发送给模型的提示 Token" : "Prompt tokens sent to the model")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "输出" : "Output")}</strong> — ${escape(zh ? "模型生成的回复 Token" : "Tokens generated by the model")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "缓存读取" : "Cache Read")}</strong> — ${escape(zh ? "从缓存中命中并读取的 Token（计费更低）" : "Tokens read from cache (billed at a lower rate)")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "缓存写入" : "Cache Write")}</strong> — ${escape(zh ? "写入缓存的 Token" : "Tokens written to the cache")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "思考" : "Thinking")}</strong> — ${escape(zh ? "扩展思考功能使用的 Token" : "Tokens used by Extended Thinking mode")}</li></ul></section>  <section id="cost" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-1qiidux">05</span> <h2 class="svelte-1onn39h">${escape(zh ? "费用" : "Cost")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "费用页面展示总费用卡片、每日费用柱状图，以及按工具和按模型的前 10 名费用排行。" : "The Cost page shows a total cost card, a daily cost bar chart, and top-10 cost breakdowns by tool and by model.")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "warn" }, {}, {
    default: () => {
      return `${escape(zh ? "费用为估算值，基于「定价」页面中的每百万 Token 价格计算。若你修改了定价，请手动执行重新计算费用。" : "Costs are estimates based on the per-million-token pricing table. If you change pricing, run the cost recalculation step manually.")}`;
    }
  })}</section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/cost.png"${add_attribute("alt", zh ? "AIUsage 费用页面截图" : "AIUsage cost page screenshot", 0)} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "费用页显示总费用、每日费用走势，以及按工具 / 模型的费用排行。" : "Cost page showing total cost, daily trend, and ranked breakdowns by tool and model.")}</figcaption></figure></section> <section id="cost-daily" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "每日费用图" : "Daily Cost Chart")}</h3> <p class="svelte-1onn39h">${escape(zh ? "柱状图展示每天的费用，悬停可查看当日金额。" : "A bar chart showing per-day costs. Hover to view exact amounts.")}</p></section> <section id="cost-breakdown" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "按助手与模型分布" : "By Assistant & Model")}</h3> <p class="svelte-1onn39h">${escape(zh ? "不同工具（Claude Code、Codex 等）的费用排名。不同模型（claude-sonnet-4-5、gpt-4o 等）的费用排名。" : "Ranked list of costs per tool (Claude Code, Codex, etc.) and per model (e.g. claude-sonnet-4-5, gpt-4o).")}</p></section>  <section id="models" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-3ncl7c">06</span> <h2 class="svelte-1onn39h">${escape(zh ? "模型" : "Models")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "模型页面按总 Token 使用量排序，展示模型 ID、提供商、调用次数、总 Token，以及占比进度条。" : "The Models page ranks models by total token usage and shows model ID, provider, call count, total tokens, and share bars.")}</p> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "模型" : "Model")}</strong> — ${escape(zh ? "模型 ID（如 claude-sonnet-4-6）" : "Model ID (e.g. claude-sonnet-4-6)")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "提供商" : "Provider")}</strong> — ${escape(zh ? "服务提供商（Anthropic、OpenAI 等）" : "Service provider (Anthropic, OpenAI, etc.)")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "调用次数" : "Calls")}</strong> — ${escape(zh ? "该模型被调用的次数" : "Number of times invoked")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "Token" : "Tokens")}</strong> — ${escape(zh ? "该模型消耗的 Token 总量" : "Total tokens consumed")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "占比" : "Share")}</strong> — ${escape(zh ? "在当前筛选结果中的占比（含进度条）" : "Percentage within the current filtered dataset (with progress bar)")}</li></ul></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/models.png"${add_attribute("alt", zh ? "AIUsage 模型页面截图" : "AIUsage models page screenshot", 0)} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "模型页用表格和进度条展示各模型的调用量与 Token 占比。" : "Models page uses a table and share bars to compare model usage.")}</figcaption></figure></section>  <section id="tool-calls" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-1tm93tb">07</span> <h2 class="svelte-1onn39h">${escape(zh ? "工具调用" : "Tool Calls")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "工具调用页面展示会话内工具调用频次排行，可切换查看全部、builtin、mcp、skill 三种类型。Qoder 和 Cursor 当前不会产出工具调用数据，因此切换到这两类工具时页面会显示提示。" : "The Tool Calls page ranks tool usage within sessions and supports All, builtin, mcp, and skill tabs. Qoder and Cursor currently do not emit tool-call data, so the page shows a notice when filtered to those tools.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/tool-calls.png"${add_attribute(
    "alt",
    zh ? "AIUsage 工具调用页面截图" : "AIUsage tool calls page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "工具调用页支持类型切换，并用排行条展示调用占比。" : "Tool Calls page with type tabs and ranked percentage bars.")}</figcaption></figure></section>  <section id="projects" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-dztzc6">08</span> <h2 class="svelte-1onn39h">${escape(zh ? "项目" : "Projects")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "项目页面按项目目录汇总 Token 和费用，并显示项目名、完整路径、占比条、Token 总量、费用与百分比。适合快速找出最耗资源的仓库。" : "The Projects page aggregates usage by project directory and shows project name, full path, share bar, total tokens, cost, and percentage so you can spot the most expensive repos quickly.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/projects.png"${add_attribute(
    "alt",
    zh ? "AIUsage 项目页面截图" : "AIUsage projects page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "项目页按目录聚合，适合定位最耗 Token / 费用的代码仓库。" : "Projects page grouped by directory to identify the most expensive repos.")}</figcaption></figure></section>  <section id="sessions" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-1i4jo0d">09</span> <h2 class="svelte-1onn39h">${escape(zh ? "会话" : "Sessions")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "会话页面按分页展示会话列表（每页 50 条），点击任意一行可进入详情页。列表列包含时间、工具、模型、持续时长、工具调用次数、输入 / 输出 Token 与费用。" : "The Sessions page lists sessions 50 per page. Click any row to open the detail view. Columns include time, tool, model, duration, tool-call count, input/output tokens, and cost.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/sessions.png"${add_attribute(
    "alt",
    zh ? "AIUsage 会话列表页截图" : "AIUsage sessions list page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "会话列表支持分页，并可点击进入单个会话详情。" : "Session list with pagination and clickable rows for detail view.")}</figcaption></figure></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/session-detail.png"${add_attribute(
    "alt",
    zh ? "AIUsage 会话详情页截图" : "AIUsage session detail page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "会话详情页按时间线展示 API records、tool calls 和记录间隔。" : "Session detail page showing the timeline of API records, tool calls, and gaps between records.")}</figcaption></figure></section>  <section id="quotas" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-d29gxb">10</span> <h2 class="svelte-1onn39h">${escape(zh ? "配额监控" : "Quotas")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "配额页面当前主要覆盖 Claude Code 和 Codex。页面会把有凭证的工具显示为卡片，没有本地凭证的工具则放到下方的 inactive 列表中。" : "The Quotas page currently focuses on tools with local quota credentials, mainly Claude Code and Codex. Tools with credentials appear as cards, while tools without credentials are listed in an inactive section below.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/quotas.png"${add_attribute("alt", zh ? "AIUsage 配额页面截图" : "AIUsage quotas page screenshot", 0)} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "配额页用卡片显示各层级利用率、颜色状态和重置倒计时。" : "Quota cards show utilization, color state, and reset countdowns.")}</figcaption></figure></section> <section id="quotas-cards" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "配额卡片" : "Quota Cards")}</h3> <p class="svelte-1onn39h">${escape(zh ? "每个已配置凭证的工具会显示最后更新时间，以及当前查询状态：正常显示 tiers、凭证过期、解析失败、查询失败、或暂无 tiers。未配置凭证的工具会显示在底部 inactive 列表中。" : "Each configured tool shows the last query time and one of several states: normal tier display, expired credentials, parse error, query failure, or no tiers. Tools without credentials appear in the inactive list at the bottom.")}</p></section> <section id="quotas-tiers" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "配额条" : "Tier Bars")}</h3> <p class="svelte-1onn39h">${escape(zh ? "每个配额层级（如 5h、7d）显示一个进度条，颜色表示使用率：绿色（<70%）、橙色（70-90%）、红色（>90%）。显示重置倒计时。" : "Each quota tier (e.g. 5h, 7d) shows a progress bar. Color indicates utilization: green (<70%), orange (70-90%), red (>90%). Reset countdown shown.")}</p></section>  <section id="pricing" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-akjihw">11</span> <h2 class="svelte-1onn39h">${escape(zh ? "定价" : "Pricing")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "定价页面按模型显示卡片，可直接编辑 input / output / cache read / cache write 的每百万 Token 单价。状态标签可能是 Default、Override、自定义前缀匹配，或 No pricing；部分模型还会显示 CNY 标签。" : "The Pricing page shows one card per model and lets you edit per-million-token rates for input, output, cache read, and cache write. Status badges may indicate Default, Override, prefix match, or No pricing, and some models also carry a CNY badge.")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "warn" }, {}, {
    default: () => {
      return `${escape(zh ? "点击「重新计算费用」会批量更新数据库中历史记录的费用字段，请在确认定价无误后再执行。" : "Clicking Recalculate Costs updates historical cost fields in the database, so only run it after you confirm the pricing table is correct.")}`;
    }
  })}</section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/pricing.png"${add_attribute(
    "alt",
    zh ? "AIUsage 定价页面截图" : "AIUsage pricing page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "定价页支持逐模型编辑费率，并通过标签区分默认价、自定义价和无定价模型。" : "Pricing page with editable per-model rates and badges for default, override, and missing pricing.")}</figcaption></figure></section>  <section id="settings" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-1ifd411">12</span> <h2 class="svelte-1onn39h">${escape(zh ? "设置" : "Settings")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "设置页按模块分区，当前包含 General、Data Sources、Sync、Data、Currency 五个区域，每个区域独立保存。" : "The Settings page is split into independent sections: General, Data Sources, Sync, Data, and Currency. Each section saves separately.")}</p></section> <section class="svelte-1onn39h"><figure class="doc-shot svelte-1onn39h"><img src="/screenshots/settings.png"${add_attribute(
    "alt",
    zh ? "AIUsage 设置页面截图" : "AIUsage settings page screenshot",
    0
  )} loading="lazy" class="svelte-1onn39h"> <figcaption class="svelte-1onn39h">${escape(zh ? "设置页包含通用配置、日志路径、同步凭证、数据保留和货币显示设置。" : "Settings page with general config, source paths, sync credentials, data retention, and currency display settings.")}</figcaption></figure></section> <section id="settings-general" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "通用" : "General")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["字段", "说明"] : ["Field", "Description"],
      rows: [
        [
          zh ? "设备别名" : "Device Alias",
          zh ? "可选的当前设备名称，留空则使用主机名" : "Optional device name, defaults to hostname"
        ],
        [
          zh ? "每周起始日" : "Week Starts On",
          zh ? "「本周」时间范围的起始天（周日或周一 ISO）" : 'Starting day for "This Week" range (Sunday or Monday ISO)'
        ],
        [
          zh ? "仪表盘轮询间隔" : "Dashboard Poll Interval",
          zh ? "首页自动刷新的间隔（毫秒）" : "Auto-refresh interval for the home dashboard in milliseconds"
        ],
        [
          zh ? "自动解析间隔" : "Auto-Parse Interval",
          zh ? "后台自动触发解析的间隔（毫秒），设为 0 或留空可关闭" : "Background parse interval in milliseconds; use 0 or empty to disable"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="settings-sources" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "数据源" : "Data Sources")}</h3> <p class="svelte-1onn39h">${escape(zh ? "为每种 AI 工具指定自定义日志目录路径。留空则使用默认路径：" : "Specify custom log directory paths for each AI tool. Leave blank for defaults:")}</p> <ul class="svelte-1onn39h"><li class="svelte-1onn39h" data-svelte-h="svelte-6alzqn"><strong class="svelte-1onn39h">Claude Code</strong> — <code class="svelte-1onn39h">~/.claude/projects</code></li> <li class="svelte-1onn39h" data-svelte-h="svelte-iittsr"><strong class="svelte-1onn39h">Codex</strong> — <code class="svelte-1onn39h">~/.codex/sessions</code></li> <li class="svelte-1onn39h" data-svelte-h="svelte-12kf3u6"><strong class="svelte-1onn39h">OpenClaw</strong> — <code class="svelte-1onn39h">~/.openclaw/agents</code></li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h" data-svelte-h="svelte-1kc14mh">OpenCode</strong> — ${escape(zh ? "平台相关的 SQLite 数据库路径" : "platform-specific SQLite database path")}</li> <li class="svelte-1onn39h" data-svelte-h="svelte-4l30bd"><strong class="svelte-1onn39h">Hermes</strong> — <code class="svelte-1onn39h">~/.hermes/state.db</code></li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h" data-svelte-h="svelte-fwpd2b">Qoder</strong> — <code class="svelte-1onn39h" data-svelte-h="svelte-1mcd4p8">~/.qoder/logs/sessions</code> + ${escape(zh ? "平台相关的" : "platform-specific")} <code class="svelte-1onn39h" data-svelte-h="svelte-1ay2l8p">local.db</code></li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h" data-svelte-h="svelte-1mx44ue">Cursor</strong> — ${escape(zh ? "平台相关的" : "platform-specific")} <code class="svelte-1onn39h" data-svelte-h="svelte-1cpe06d">state.vscdb</code></li></ul></section> <section id="settings-data" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "数据管理" : "Data Management")}</h3> <p class="svelte-1onn39h"><strong class="svelte-1onn39h">${escape(zh ? "本地数据保留天数" : "Local Data Retention (days)")}</strong> — ${escape(zh ? "用于配置后续清理策略。设为 0 或留空则表示永久保留；设置页面本身不会立即删除数据。" : "Controls future cleanup policy. Set to 0 or leave empty to keep data forever; changing this setting does not immediately delete records.")}</p></section>  <section id="sync" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-uijv0q">13</span> <h2 class="svelte-1onn39h">${escape(zh ? "多设备同步" : "Sync")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "同步功能会把本机数据上传到远端，再拉取其他设备的数据并合并。你可以通过侧边栏 Sync 按钮手动触发，也可以先用 init 命令或设置页完成后端配置。" : "Sync uploads this device’s data, pulls data from other devices, and merges the results. You can trigger it from the sidebar Sync button after configuring the backend via init or the Settings page.")}</p> <ul class="svelte-1onn39h"><li class="svelte-1onn39h"><strong class="svelte-1onn39h" data-svelte-h="svelte-115wlxv">GitHub</strong> — ${escape(zh ? "推送到 GitHub 仓库" : "Push to a GitHub repository")}</li> <li class="svelte-1onn39h"><strong class="svelte-1onn39h">S3 / ${escape(zh ? "兼容存储" : "Compatible")}</strong> — ${escape(zh ? "推送到 Amazon S3 或任何 S3 兼容存储（Cloudflare R2、MinIO 等）" : "Push to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, etc.)")}</li></ul> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "aiusage sync"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-1e9262g"><span>1</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> sync`;
      }
    }
  )}</section>  <section id="export" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-1iw8ez7">14</span> <h2 class="svelte-1onn39h">${escape(zh ? "数据导出" : "Export")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到已有的数据管道和报表系统。" : "Export usage data as CSV, JSON, or NDJSON for integration with existing data pipelines and reporting.")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "aiusage export --format csv -o usage.csv\naiusage export --format json -o usage.json\naiusage export --format ndjson"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-m82xdz"><span>1</span><span>2</span><span>3</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> export --format csv -o usage.csv
<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> export --format json -o usage.json
<span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> export --format ndjson`;
      }
    }
  )}</section>  <section id="widget" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-w6iw6w">15</span> <h2 class="svelte-1onn39h">${escape(zh ? "桌面小组件" : "Widget")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "Widget 是独立发布的 Electron 托盘应用。CLI 中的 aiusage widget 命令会尝试启动已安装的 aiusage-widget；如果尚未安装，会提示先安装对应包。" : "Widget is a separately published Electron tray app. The aiusage widget CLI command tries to launch an installed aiusage-widget binary; if it is missing, the CLI asks you to install the package first.")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "npm install -g @juliantanx/aiusage-widget\naiusage widget"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-1xa9ohv"><span>1</span><span>2</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-1ulrmys">npm</span> install -g <span class="tk-str" data-svelte-h="svelte-135vgkb">@juliantanx/aiusage-widget</span> <span class="tk-kw" data-svelte-h="svelte-tbokww">aiusage</span> widget`;
      }
    }
  )} <p class="svelte-1onn39h">${escape(zh ? "Widget 与 CLI 共用同一个本地数据库，因此通常需要先运行 aiusage parse 导入数据。" : "The widget reads the same local database as the CLI, so you typically need to run aiusage parse first.")}</p></section>  <section id="cli" class="svelte-1onn39h"><div class="sec-head svelte-1onn39h"><span class="sec-idx svelte-1onn39h" data-svelte-h="svelte-oxw3ux">16</span> <h2 class="svelte-1onn39h">${escape(zh ? "CLI 命令参考" : "CLI Reference")}</h2></div> <p class="svelte-1onn39h">${escape(zh ? "所有 CLI 命令均通过 aiusage <command> 调用；不带子命令时会输出 summary。当前内置的主要命令包括 summary、status、parse、serve、export、clean、reset、recalc、init、sync、widget、pm2-setup 和 pm2-start。" : "All CLI commands are invoked as aiusage <command>; running aiusage without a subcommand prints the summary. Main built-ins currently include summary, status, parse, serve, export, clean, reset, recalc, init, sync, widget, pm2-setup, and pm2-start.")}</p></section> <section id="cli-parse" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-ros23b">parse</code> — ${escape(zh ? "解析日志" : "Parse Logs")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明"] : ["Option", "Description"],
      rows: [
        [
          "<code>--tool &lt;tool&gt;</code>",
          zh ? "只解析指定工具" : "Only parse specific tool: claude-code, codex, openclaw, opencode, hermes, qoder, cursor"
        ],
        [
          "<code>--progress</code>",
          zh ? "显示实时进度条（仅 TTY）" : "Show real-time progress bar (TTY only)"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-serve" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-13wwq9n">serve</code> — ${escape(zh ? "启动仪表盘" : "Start Dashboard")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明", "默认"] : ["Option", "Description", "Default"],
      rows: [
        [
          "<code>-p, --port &lt;port&gt;</code>",
          zh ? "端口号" : "Port number",
          "<code>3847</code>"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-summary" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-wc241e">summary</code> — ${escape(zh ? "终端摘要" : "Terminal Summary")}</h3> <p class="svelte-1onn39h">${escape(zh ? "默认命令。输出总 Token、总费用、记录数；当存在数据时还会显示按工具汇总，默认入口还会附带 Top Tool Calls。" : "This is the default command. It prints total tokens, total cost, and record count; when data exists it also shows a by-tool summary, and the root command additionally prints Top Tool Calls.")}</p> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明"] : ["Option", "Description"],
      rows: [
        ["<code>--week</code>", zh ? "查看本周数据" : "Show this week"],
        ["<code>--month</code>", zh ? "查看本月数据" : "Show this month"],
        [
          "<code>--from &lt;date&gt;</code>",
          zh ? "开始日期（YYYY-MM-DD）" : "Start date (YYYY-MM-DD)"
        ],
        [
          "<code>--to &lt;date&gt;</code>",
          zh ? "结束日期（YYYY-MM-DD）" : "End date (YYYY-MM-DD)"
        ],
        [
          "<code>--device &lt;id&gt;</code>",
          zh ? "按设备实例 ID 筛选" : "Filter by device instance ID"
        ],
        [
          "<code>--tool &lt;tool&gt;</code>",
          zh ? "按工具类型筛选" : "Filter by tool type"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-export" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-rj268m">export</code> — ${escape(zh ? "导出数据" : "Export Data")}</h3> <p class="svelte-1onn39h">${escape(zh ? "导出命令当前要求显式指定格式，可输出到文件，也可直接打印到 stdout。" : "The export command currently requires an explicit format and can write either to a file or to stdout.")}</p> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明", "必填"] : ["Option", "Description", "Required"],
      rows: [
        ["<code>--format &lt;f&gt;</code>", "csv, json, ndjson", zh ? "是" : "Yes"],
        [
          "<code>--range &lt;range&gt;</code>",
          zh ? "时间范围（day | week | month）" : "Time range (day | week | month)",
          zh ? "否" : "No"
        ],
        [
          "<code>--from &lt;date&gt;</code>",
          zh ? "开始日期（YYYY-MM-DD）" : "Start date (YYYY-MM-DD)",
          zh ? "否" : "No"
        ],
        [
          "<code>--to &lt;date&gt;</code>",
          zh ? "结束日期（YYYY-MM-DD）" : "End date (YYYY-MM-DD)",
          zh ? "否" : "No"
        ],
        [
          "<code>-o, --output &lt;f&gt;</code>",
          zh ? "输出文件路径（默认 stdout）" : "Output file path (default: stdout)",
          zh ? "否" : "No"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-clean" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-1vcpuqx">clean</code> — ${escape(zh ? "清理旧数据" : "Clean Old Data")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明", "默认"] : ["Option", "Description", "Default"],
      rows: [
        [
          "<code>--before &lt;dur&gt;</code>",
          zh ? "删除此时间之前的数据（如 30d、180d）" : "Delete data older than this (e.g. 30d, 180d)",
          "<code>180d</code>"
        ],
        [
          "<code>--remote</code>",
          zh ? "同时清理远端同步数据" : "Also clean remote synced data",
          "-"
        ],
        [
          "<code>--all-devices</code>",
          zh ? "配合 --remote 清理所有设备" : "Clean all devices together with --remote",
          "-"
        ],
        ["<code>--yes</code>", zh ? "跳过确认" : "Skip confirmation", "-"],
        [
          "<code>--approve-delete</code>",
          zh ? "批准删除权限升级" : "Approve delete permission upgrade",
          "-"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-reset" class="svelte-1onn39h"><h3 class="svelte-1onn39h"><code class="svelte-1onn39h" data-svelte-h="svelte-k3e17b">reset</code> — ${escape(zh ? "重置所有数据" : "Reset All Data")}</h3> <p class="svelte-1onn39h">${escape(zh ? "删除所有已解析的记录、工具调用、同步数据和水位线。原始日志文件不受影响。" : "Delete all parsed records, tool calls, synced data, and the parse watermark. Source log files are not affected.")}</p> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明"] : ["Option", "Description"],
      rows: [
        [
          "<code>--yes</code>",
          zh ? "跳过确认提示（必须指定才会执行）" : "Skip confirmation prompt (required to execute)"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-other" class="svelte-1onn39h"><h3 class="svelte-1onn39h">${escape(zh ? "其他命令" : "Other Commands")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["命令", "说明"] : ["Command", "Description"],
      rows: [
        [
          "<code>status</code>",
          zh ? "显示版本号、设备名称、数据库路径、schema 版本、对象数量、记录数、数据库大小及同步状态" : "Show version, device name, DB path, schema version, object counts, record count, DB size, and sync status"
        ],
        [
          "<code>sync</code>",
          zh ? "与远程后端执行推送 / 拉取 / 合并同步" : "Push, pull, and merge data with the remote backend"
        ],
        [
          "<code>recalc</code>",
          zh ? "按最新定价重新计算费用" : "Recalculate costs with latest pricing"
        ],
        [
          "<code>init</code>",
          zh ? "初始化同步后端（支持 GitHub / S3）" : "Initialize sync backend (GitHub or S3)"
        ],
        [
          "<code>widget</code>",
          zh ? "启动桌面托盘 Widget" : "Launch the desktop tray widget"
        ],
        [
          "<code>pm2-setup</code>",
          zh ? "生成 PM2 ecosystem.config.cjs" : "Generate PM2 ecosystem.config.cjs"
        ],
        [
          "<code>pm2-start</code>",
          zh ? "生成配置并启动 PM2 后台服务" : "Generate config and start PM2 background services"
        ]
      ]
    },
    {},
    {}
  )}</section></article> ${``} </div>`;
});
export {
  Page as default
};
