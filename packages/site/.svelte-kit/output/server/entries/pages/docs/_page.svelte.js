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
  code: ".docs-layout.svelte-zs40yn.svelte-zs40yn{width:var(--content-width);margin:0 auto;padding:2rem 0 4rem;position:relative}.mobile-toc-toggle.svelte-zs40yn.svelte-zs40yn{display:none;align-items:center;gap:0.625rem;width:100%;padding:0.75rem 1rem;background:var(--surface);border:1px solid var(--border-subtle);border-radius:8px;font-family:var(--mono);font-size:0.8125rem;font-weight:550;color:var(--text-secondary);cursor:pointer;margin-bottom:0.5rem}.toc-burger.svelte-zs40yn.svelte-zs40yn{display:flex;flex-direction:column;gap:3px;width:16px}.toc-burger.svelte-zs40yn span.svelte-zs40yn{display:block;height:2px;background:var(--accent);border-radius:1px;transition:all 0.2s ease}.toc-burger.open.svelte-zs40yn span.svelte-zs40yn:nth-child(1){transform:rotate(45deg) translate(3px, 3px)}.toc-burger.open.svelte-zs40yn span.svelte-zs40yn:nth-child(2){opacity:0}.toc-burger.open.svelte-zs40yn span.svelte-zs40yn:nth-child(3){transform:rotate(-45deg) translate(4px, -4px)}.docs-sidebar.svelte-zs40yn.svelte-zs40yn{position:fixed;top:76px;left:calc(50% - var(--content-width) / 2);width:260px;max-height:calc(100vh - 92px);overflow-y:auto;scrollbar-width:thin;transition:transform 0.15s ease}.docs-hero.svelte-zs40yn.svelte-zs40yn{margin-bottom:3rem;padding-bottom:2.5rem;border-bottom:1px solid var(--border-subtle);position:relative}.docs-hero.svelte-zs40yn.svelte-zs40yn::after{content:'';position:absolute;bottom:-1px;left:0;width:80px;height:2px;background:var(--accent)}.hero-eyebrow.svelte-zs40yn.svelte-zs40yn{display:inline-flex;align-items:center;gap:0.5rem;font-family:var(--mono);font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);margin-bottom:0.75rem;padding:0.3rem 0.75rem;background:var(--accent-dim);border-radius:4px}.hero-eyebrow-icon.svelte-zs40yn.svelte-zs40yn{font-size:0.8125rem}.hero-title.svelte-zs40yn.svelte-zs40yn{font-family:'Source Serif 4', 'Georgia', serif;font-size:2.5rem;font-weight:700;letter-spacing:-0.03em;color:var(--text);margin-bottom:0.75rem;line-height:1.15}.hero-sub.svelte-zs40yn.svelte-zs40yn{font-size:1.0625rem;color:var(--text-secondary);line-height:1.7;max-width:640px}.hero-meta.svelte-zs40yn.svelte-zs40yn{display:flex;gap:0.5rem;margin-top:1.25rem;flex-wrap:wrap}.meta-tag.svelte-zs40yn.svelte-zs40yn{font-family:var(--mono);font-size:0.6875rem;font-weight:550;color:var(--text-muted);background:var(--raised);border:1px solid var(--border-subtle);border-radius:4px;padding:0.2rem 0.5rem;letter-spacing:0.02em}.docs-content.svelte-zs40yn.svelte-zs40yn{min-width:0;max-width:85ch;margin-left:290px}section.svelte-zs40yn.svelte-zs40yn{margin-bottom:2.5rem;padding-top:0.25rem;scroll-margin-top:76px}.sec-head.svelte-zs40yn.svelte-zs40yn{display:flex;align-items:baseline;gap:0.875rem;margin-bottom:0.75rem;padding-bottom:0.625rem;border-bottom:1px solid var(--border-subtle)}.sec-idx.svelte-zs40yn.svelte-zs40yn{font-family:var(--mono);font-size:0.75rem;font-weight:700;color:var(--accent);opacity:0.6;letter-spacing:0.02em;flex-shrink:0}section.svelte-zs40yn h2.svelte-zs40yn{font-family:'Source Serif 4', 'Georgia', serif;font-size:1.375rem;font-weight:700;color:var(--text);letter-spacing:-0.02em;margin:0;padding:0;border:none}section.svelte-zs40yn h3.svelte-zs40yn{font-family:'Instrument Sans', sans-serif;font-size:1.0625rem;font-weight:600;color:var(--text);letter-spacing:-0.01em;margin:2rem 0 0.75rem}section.svelte-zs40yn p.svelte-zs40yn{font-size:0.9375rem;color:var(--text-secondary);line-height:1.75;margin-bottom:0.75rem}section.svelte-zs40yn ul.svelte-zs40yn{padding-left:1.25rem;margin-bottom:0.75rem;list-style:none}section.svelte-zs40yn li.svelte-zs40yn{font-size:0.9375rem;color:var(--text-secondary);line-height:1.75;margin-bottom:0.375rem;position:relative;padding-left:0.875rem}section.svelte-zs40yn li.svelte-zs40yn::before{content:'';position:absolute;left:0;top:0.6em;width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:0.4}section.svelte-zs40yn strong.svelte-zs40yn{color:var(--text);font-weight:600}section.svelte-zs40yn code.svelte-zs40yn{font-family:var(--mono);font-size:0.8125rem;background:var(--raised);border:1px solid var(--border-subtle);border-radius:4px;padding:0.1em 0.4em;color:var(--accent)}.back-to-top.svelte-zs40yn.svelte-zs40yn{position:fixed;bottom:2rem;right:2rem;z-index:50;width:44px;height:44px;border-radius:50%;background:var(--accent);color:oklch(0.99 0.002 85);border:none;cursor:pointer;font-size:1.125rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px oklch(0 0 0 / 0.15);transition:all 0.2s ease;animation:svelte-zs40yn-fadeIn 0.2s ease-out}.back-to-top.svelte-zs40yn.svelte-zs40yn:hover{background:var(--accent-hover);transform:translateY(-2px);box-shadow:0 4px 16px oklch(0 0 0 / 0.2)}@keyframes svelte-zs40yn-fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width: 800px){.docs-content.svelte-zs40yn.svelte-zs40yn{margin-left:0}.mobile-toc-toggle.svelte-zs40yn.svelte-zs40yn{display:flex}.docs-sidebar.svelte-zs40yn.svelte-zs40yn{display:none;position:static;width:auto;max-height:none;margin-bottom:1rem}.docs-sidebar.mobile-open.svelte-zs40yn.svelte-zs40yn{display:block;background:var(--surface);border:1px solid var(--border-subtle);border-radius:8px;padding:0.5rem}.docs-sidebar.mobile-open.svelte-zs40yn .toc{border-right:none;padding-right:0}.hero-title.svelte-zs40yn.svelte-zs40yn{font-size:1.875rem}}",
  map: `{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script>\\n  import { onMount } from 'svelte'\\n  import { lang } from '$lib/lang'\\n  import TableOfContents from '$lib/components/TableOfContents.svelte'\\n  import CodeBlock from '$lib/components/CodeBlock.svelte'\\n  import Callout from '$lib/components/Callout.svelte'\\n  import DocsTable from '$lib/components/DocsTable.svelte'\\n\\n  $: zh = $lang === 'zh'\\n\\n  const sections = [\\n    { id: 'getting-started', en: 'Getting Started', zh: '快速开始',\\n      children: [\\n        { id: 'install', en: 'Installation', zh: '安装' },\\n        { id: 'parse', en: 'Parse Data', zh: '解析数据' },\\n        { id: 'serve', en: 'Start Dashboard', zh: '启动仪表盘' },\\n        { id: 'pm2', en: 'Background (PM2)', zh: '后台运行 (PM2)' },\\n        { id: 'docker', en: 'Docker', zh: 'Docker 部署' },\\n      ]\\n    },\\n    { id: 'dashboard', en: 'Dashboard', zh: '仪表盘',\\n      children: [\\n        { id: 'dash-elements', en: 'UI Elements', zh: '界面元素' },\\n        { id: 'dash-config', en: 'Display Config', zh: '显示配置' },\\n      ]\\n    },\\n    { id: 'overview', en: 'Overview', zh: '概览',\\n      children: [\\n        { id: 'overview-cards', en: 'Stat Cards', zh: '统计卡片' },\\n        { id: 'overview-breakdown', en: 'Token Breakdown', zh: 'Token 明细' },\\n        { id: 'overview-assistant', en: 'By AI Assistant', zh: '按 AI 助手统计' },\\n      ]\\n    },\\n    { id: 'tokens', en: 'Tokens', zh: 'Token 用量',\\n      children: [\\n        { id: 'tokens-chart', en: 'Daily Bar Chart', zh: '每日柱状图' },\\n        { id: 'tokens-table', en: 'Detail Table', zh: '明细表格' },\\n        { id: 'tokens-types', en: 'Token Types', zh: 'Token 类型说明' },\\n      ]\\n    },\\n    { id: 'cost', en: 'Cost', zh: '费用',\\n      children: [\\n        { id: 'cost-daily', en: 'Daily Cost Chart', zh: '每日费用图' },\\n        { id: 'cost-breakdown', en: 'By Assistant & Model', zh: '按助手与模型分布' },\\n      ]\\n    },\\n    { id: 'models', en: 'Models', zh: '模型', children: [] },\\n    { id: 'tool-calls', en: 'Tool Calls', zh: '工具调用', children: [] },\\n    { id: 'projects', en: 'Projects', zh: '项目', children: [] },\\n    { id: 'sessions', en: 'Sessions', zh: '会话', children: [] },\\n    { id: 'quotas', en: 'Quotas', zh: '配额监控',\\n      children: [\\n        { id: 'quotas-cards', en: 'Quota Cards', zh: '配额卡片' },\\n        { id: 'quotas-tiers', en: 'Tier Bars', zh: '配额条' },\\n      ]\\n    },\\n    { id: 'pricing', en: 'Pricing', zh: '定价', children: [] },\\n    { id: 'settings', en: 'Settings', zh: '设置',\\n      children: [\\n        { id: 'settings-general', en: 'General', zh: '通用' },\\n        { id: 'settings-sources', en: 'Data Sources', zh: '数据源' },\\n        { id: 'settings-data', en: 'Data Management', zh: '数据管理' },\\n      ]\\n    },\\n    { id: 'sync', en: 'Sync', zh: '多设备同步', children: [] },\\n    { id: 'export', en: 'Export', zh: '数据导出', children: [] },\\n    { id: 'widget', en: 'Widget', zh: '桌面小组件', children: [] },\\n    { id: 'cli', en: 'CLI Reference', zh: 'CLI 命令',\\n      children: [\\n        { id: 'cli-parse', en: 'parse', zh: 'parse' },\\n        { id: 'cli-serve', en: 'serve', zh: 'serve' },\\n        { id: 'cli-summary', en: 'summary', zh: 'summary' },\\n        { id: 'cli-export', en: 'export', zh: 'export' },\\n        { id: 'cli-clean', en: 'clean', zh: 'clean' },\\n        { id: 'cli-reset', en: 'reset', zh: 'reset' },\\n        { id: 'cli-other', en: 'Other Commands', zh: '其他命令' },\\n      ]\\n    },\\n  ]\\n\\n  let activeSection = 'getting-started'\\n  let expandedSections = new Set(['getting-started'])\\n  let mobileTocOpen = false\\n  let showBackToTop = false\\n  let sidebarOffset = 0\\n  let scrollLock = null\\n\\n  function getSectionIndex(id) {\\n    for (let i = 0; i < sections.length; i++) {\\n      if (sections[i].id === id) return i\\n      if (sections[i].children?.some(c => c.id === id)) return i\\n    }\\n    return 0\\n  }\\n\\n  function scrollTo(id) {\\n    const el = document.getElementById(id)\\n    if (el) {\\n      activeSection = id\\n      scrollLock = id\\n      const headerOffset = 76\\n      const top = el.getBoundingClientRect().top + window.scrollY\\n      window.scrollTo({ top: top - headerOffset, behavior: 'smooth' })\\n      mobileTocOpen = false\\n      for (const s of sections) {\\n        if (s.id === id || s.children?.some(c => c.id === id)) {\\n          expandedSections.add(s.id)\\n          expandedSections = expandedSections\\n        }\\n      }\\n      setTimeout(() => { scrollLock = null }, 600)\\n    }\\n  }\\n\\n  function handleTocNavigate(e) {\\n    scrollTo(e.detail.id)\\n  }\\n\\n  function handleTocToggle(e) {\\n    const id = e.detail.id\\n    if (expandedSections.has(id)) expandedSections.delete(id)\\n    else expandedSections.add(id)\\n    expandedSections = expandedSections\\n  }\\n\\n  function toggleExpand(id) {\\n    if (expandedSections.has(id)) expandedSections.delete(id)\\n    else expandedSections.add(id)\\n    expandedSections = expandedSections\\n  }\\n\\n  $: allSectionIds = sections.flatMap(s => [s.id, ...(s.children ?? []).map(c => c.id)])\\n\\n  function updateActiveFromScroll() {\\n    showBackToTop = window.scrollY > 400\\n    const footer = document.querySelector('.site-footer')\\n    if (footer) {\\n      const footerTop = footer.getBoundingClientRect().top\\n      const sidebarBottom = 76 + (window.innerHeight - 92)\\n      sidebarOffset = footerTop < sidebarBottom ? sidebarBottom - footerTop : 0\\n    }\\n    if (scrollLock) return\\n    const offset = 90\\n    let best = allSectionIds[0]\\n    for (const id of allSectionIds) {\\n      const el = document.getElementById(id)\\n      if (el && el.getBoundingClientRect().top <= offset) {\\n        best = id\\n      }\\n    }\\n    if (best !== activeSection) {\\n      activeSection = best\\n      for (const s of sections) {\\n        if (s.id === activeSection || s.children?.some(c => c.id === activeSection)) {\\n          expandedSections.add(s.id)\\n        }\\n      }\\n      expandedSections = expandedSections\\n    }\\n  }\\n\\n  onMount(() => {\\n    updateActiveFromScroll()\\n    window.addEventListener('scroll', updateActiveFromScroll, { passive: true })\\n    return () => window.removeEventListener('scroll', updateActiveFromScroll)\\n  })\\n<\/script>\\n\\n<svelte:head>\\n  <title>{zh ? '文档' : 'Documentation'} — AIUsage</title>\\n  <meta name=\\"description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n  <link rel=\\"canonical\\" href=\\"https://aiusage.jtanx.com/docs\\" />\\n  <meta property=\\"og:title\\" content=\\"{zh ? '文档' : 'Documentation'} — AIUsage\\" />\\n  <meta property=\\"og:description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n  <meta property=\\"og:url\\" content=\\"https://aiusage.jtanx.com/docs\\" />\\n  <meta name=\\"twitter:title\\" content=\\"{zh ? '文档' : 'Documentation'} — AIUsage\\" />\\n  <meta name=\\"twitter:description\\" content={zh\\n    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'\\n  } />\\n\\n  <!-- JSON-LD for Docs page -->\\n  {@html \`<script type=\\"application/ld+json\\">\${JSON.stringify({\\n    '@context': 'https://schema.org',\\n    '@type': 'WebPage',\\n    name: zh ? 'AIUsage 文档' : 'AIUsage Documentation',\\n    description: zh\\n      ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'\\n      : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.',\\n    url: 'https://aiusage.jtanx.com/docs',\\n    isPartOf: {\\n      '@type': 'WebSite',\\n      name: 'AIUsage',\\n      url: 'https://aiusage.jtanx.com'\\n    },\\n    breadcrumb: {\\n      '@type': 'BreadcrumbList',\\n      itemListElement: [\\n        {\\n          '@type': 'ListItem',\\n          position: 1,\\n          name: 'Home',\\n          item: 'https://aiusage.jtanx.com/'\\n        },\\n        {\\n          '@type': 'ListItem',\\n          position: 2,\\n          name: zh ? '文档' : 'Documentation',\\n          item: 'https://aiusage.jtanx.com/docs'\\n        }\\n      ]\\n    }\\n  })}<\/script>\`}\\n</svelte:head>\\n\\n<div class=\\"docs-layout\\">\\n  <button class=\\"mobile-toc-toggle\\" on:click={() => mobileTocOpen = !mobileTocOpen}>\\n    <span class=\\"toc-burger\\" class:open={mobileTocOpen}>\\n      <span></span><span></span><span></span>\\n    </span>\\n    <span>{zh ? '目录' : 'Contents'}</span>\\n  </button>\\n\\n  <aside class=\\"docs-sidebar\\" class:mobile-open={mobileTocOpen} style:transform=\\"translateY(-{sidebarOffset}px)\\">\\n    <TableOfContents\\n      {sections}\\n      {activeSection}\\n      {expandedSections}\\n      {zh}\\n      on:navigate={handleTocNavigate}\\n      on:toggle={handleTocToggle}\\n    />\\n  </aside>\\n\\n  <article class=\\"docs-content\\">\\n    <!-- ── Page Header ──────────────────────────────────────── -->\\n    <header class=\\"docs-hero\\">\\n      <div class=\\"hero-eyebrow\\">\\n        <span class=\\"hero-eyebrow-icon\\">⌘</span>\\n        <span>{zh ? 'AIUsage 参考手册' : 'AIUsage Reference'}</span>\\n      </div>\\n      <h1 class=\\"hero-title\\">{zh ? '文档' : 'Documentation'}</h1>\\n      <p class=\\"hero-sub\\">{zh\\n        ? 'AIUsage 是一款 AI 工具用量统计平台，支持 Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor 等多种 AI 工具的 Token 和费用追踪。'\\n        : 'AIUsage is a local-first usage analytics platform for AI coding tools — tracking tokens, costs, sessions and more across Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, and Cursor.'\\n      }</p>\\n      <div class=\\"hero-meta\\">\\n        <span class=\\"meta-tag\\">{zh ? '开源' : 'Open Source'}</span>\\n        <span class=\\"meta-tag\\">MIT</span>\\n        <span class=\\"meta-tag\\">v1.3.1</span>\\n      </div>\\n    </header>\\n\\n    <!-- ══════ Getting Started ══════ -->\\n    <section id=\\"getting-started\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">01</span>\\n        <h2>{zh ? '快速开始' : 'Getting Started'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>AIUsage 是一个命令行工具，内置 Web 仪表盘。安装完成后，它会解析 AI 工具生成的日志文件，并在本地数据库中追踪用量数据。</p>\\n      {:else}\\n        <p>AIUsage is a CLI tool with a built-in web dashboard. It parses log files generated by AI tools and tracks usage data in a local database.</p>\\n      {/if}\\n    </section>\\n\\n    <section id=\\"install\\">\\n      <h3>{zh ? '安装' : 'Installation'}</h3>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"npm install -g @juliantanx/aiusage\\">\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g <span class=\\"tk-str\\">@juliantanx/aiusage</span>\\n<span class=\\"tk-cmt\\"># or with pnpm</span>\\n<span class=\\"tk-kw\\">pnpm</span> add -g <span class=\\"tk-str\\">@juliantanx/aiusage</span>\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"parse\\">\\n      <h3>{zh ? '解析数据' : 'Parse Data'}</h3>\\n      <p>{zh ? '解析 AI 工具的日志文件，写入本地数据库：' : 'Parse log files from your AI tools into the local database:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage parse\\">\\n        <span slot=\\"lines\\"><span>1</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> parse\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"serve\\">\\n      <h3>{zh ? '启动仪表盘' : 'Start the Dashboard'}</h3>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage serve\\">\\n        <span slot=\\"lines\\"><span>1</span><span>2</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> serve\\n<span class=\\"tk-cmt\\"># Listens on http://localhost:3847 by default</span>\\n      </CodeBlock>\\n      <p>{zh ? '浏览器打开 http://localhost:3847 即可查看仪表盘。' : 'Open http://localhost:3847 in your browser to view the dashboard.'}</p>\\n      <Callout type=\\"info\\">\\n        {zh\\n          ? '仪表盘首页在浏览器首次加载时会自动触发一次解析。您也可以在 Settings 页面配置自动定期解析。'\\n          : 'The dashboard home page triggers a parse automatically on first load. You can also configure automatic periodic parsing in Settings.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section id=\\"pm2\\">\\n      <h3>{zh ? '后台运行 (PM2)' : 'Running in Background (PM2)'}</h3>\\n      <p>{zh\\n        ? 'aiusage serve 默认在前台运行，关闭终端后服务会终止。如需后台持续运行，请使用 PM2：'\\n        : 'aiusage serve runs in the foreground. To keep it running in the background, use PM2:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'npm install -g pm2\\\\naiusage pm2-start\\\\npm2 startup'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g pm2\\n<span class=\\"tk-kw\\">aiusage</span> pm2-start\\n<span class=\\"tk-kw\\">pm2</span> startup\\n      </CodeBlock>\\n    </section>\\n\\n    <section id=\\"docker\\">\\n      <h3>Docker</h3>\\n      <p>{zh\\n        ? '使用官方 Docker 镜像运行 AIUsage，无需安装 Node.js：'\\n        : 'Run AIUsage with the official Docker image, no Node.js installation required:'}</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'docker run -d \\\\\\\\\\\\n  -p 3847:3847 \\\\\\\\\\\\n  -v ~/.aiusage:/root/.aiusage \\\\\\\\\\\\n  juliantanx/aiusage'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span><span>4</span></span>\\n        <span class=\\"tk-kw\\">docker</span> run -d \\\\\\n  -p 3847:3847 \\\\\\n  -v ~/.aiusage:/root/.aiusage \\\\\\n  juliantanx/aiusage\\n      </CodeBlock>\\n      <Callout type=\\"info\\">\\n        {zh\\n          ? '镜像在 Docker Hub (juliantanx/aiusage) 和 GitHub Container Registry (ghcr.io/juliantanx/aiusage) 均可获取。支持 amd64 和 arm64 架构。'\\n          : 'Available on Docker Hub (juliantanx/aiusage) and GitHub Container Registry (ghcr.io/juliantanx/aiusage). Supports amd64 and arm64 architectures.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <!-- ══════ Dashboard ══════ -->\\n    <section id=\\"dashboard\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">02</span>\\n        <h2>{zh ? '仪表盘（首页）' : 'Dashboard (Home)'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>首页是一个实时 Token 计数器，显示所选时间范围内的累计用量，并每隔一段时间自动刷新。</p>\\n      {:else}\\n        <p>The home page is a live token counter showing cumulative usage for the selected time range, auto-refreshing at a configurable interval.</p>\\n      {/if}\\n    </section>\\n\\n    <section id=\\"dash-elements\\">\\n      <h3>{zh ? '界面元素' : 'UI Elements'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '实时计数器' : 'Live counter'}</strong> — {zh ? '显示总 Token 数，支持动画计数效果' : 'Total token count with animated count-up effect'}</li>\\n        <li><strong>{zh ? '子统计' : 'Sub-stats'}</strong> — {zh ? '分别展示输入、输出和缓存 Token' : 'Input, output, and cache tokens shown separately'}</li>\\n        <li><strong>{zh ? '费用 / 会话 / 活跃天数' : 'Cost / Sessions / Active Days'}</strong> — {zh ? '三个辅助统计卡片' : 'Three secondary stat cards'}</li>\\n        <li><strong>{zh ? 'Token 构成条' : 'Token composition bar'}</strong> — {zh ? '按比例显示输入、输出、缓存读写的分布' : 'Proportional breakdown of input, output, cache read/write'}</li>\\n        <li><strong>{zh ? '刷新进度条' : 'Refresh progress bar'}</strong> — {zh ? '显示下次自动刷新的倒计时' : 'Countdown until next auto-refresh'}</li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"dash-config\\">\\n      <h3>{zh ? '显示配置' : 'Display Config'}</h3>\\n      <p>{zh ? '点击右上角的齿轮按钮可打开显示配置面板：' : 'Click the gear button to open the display config panel:'}</p>\\n      <ul>\\n        <li><strong>{zh ? '时间范围' : 'Time range'}</strong> — {zh ? '今天 / 本周 / 本月 / 近 30 天 / 全部' : 'Today / This Week / This Month / Last 30d / All Time'}</li>\\n        <li><strong>{zh ? '数字格式' : 'Number format'}</strong> — {zh ? '精确（1,234,567）或简短（1.2M）' : 'Exact (1,234,567) or abbreviated (1.2M)'}</li>\\n      </ul>\\n    </section>\\n\\n    <!-- ══════ Overview ══════ -->\\n    <section id=\\"overview\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">03</span>\\n        <h2>{zh ? '概览' : 'Overview'}</h2>\\n      </div>\\n      {#if zh}\\n        <p>概览页展示带筛选条件的聚合统计摘要，是了解整体用量的起点。</p>\\n      {:else}\\n        <p>The Overview page shows aggregated usage stats with filters — your go-to starting point for understanding overall usage.</p>\\n      {/if}\\n      <Callout type=\\"tip\\">\\n        {zh\\n          ? '使用页面顶部的筛选栏可以按日期范围、设备、AI 助手进行过滤，所有数据页面均支持这些筛选条件。'\\n          : 'Use the filter bar at the top to narrow by date range, device, and AI assistant — all data pages share these filters.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section id=\\"overview-cards\\">\\n      <h3>{zh ? '统计卡片' : 'Stat Cards'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '总 Token' : 'Total Tokens'}</strong> — {zh ? '所有类型 Token 的合计' : 'Sum of all token types'}</li>\\n        <li><strong>{zh ? '总费用' : 'Total Cost'}</strong> — {zh ? '基于定价表计算的估算费用' : 'Estimated cost based on the pricing table'}</li>\\n        <li><strong>{zh ? '活跃天数' : 'Active Days'}</strong> — {zh ? '有记录的天数' : 'Number of days with recorded usage'}</li>\\n        <li><strong>{zh ? '会话数' : 'Sessions'}</strong> — {zh ? '独立会话的总数' : 'Total number of distinct sessions'}</li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"overview-breakdown\\">\\n      <h3>{zh ? 'Token 明细' : 'Token Breakdown'}</h3>\\n      <p>{zh ? '在卡片下方展示输入、输出、缓存读取、缓存写入的分项数据。' : 'Below the cards: input, output, cache read, and cache write token counts shown individually.'}</p>\\n    </section>\\n\\n    <section id=\\"overview-assistant\\">\\n      <h3>{zh ? '按 AI 助手统计' : 'By AI Assistant'}</h3>\\n      <p>{zh\\n        ? '按使用的 AI 工具（claude-code、codex 等）分组，显示各工具的 Token 数和费用。列出调用次数最多的工具（如 Bash、Read、Edit 等）。'\\n        : 'Usage grouped by AI tool (claude-code, codex, etc.) showing tokens and cost per tool. Most-called tool names ranked by invocation count.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Tokens ══════ -->\\n    <section id=\\"tokens\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">04</span>\\n        <h2>{zh ? 'Token 用量' : 'Tokens'}</h2>\\n      </div>\\n      <p>{zh\\n        ? 'Token 页面以每日图表和明细表格的形式展示 Token 消耗趋势。'\\n        : 'The Tokens page visualizes daily token consumption with a bar chart and a detail table.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"tokens-chart\\">\\n      <h3>{zh ? '每日柱状图' : 'Daily Bar Chart'}</h3>\\n      <p>{zh\\n        ? '每组柱子展示同一天内的各类 Token（输入、输出、缓存读取、缓存写入、思考 Token），悬停可查看具体数值。'\\n        : 'Each bar group shows the token types for one day (input, output, cache read, cache write, thinking). Hover to see exact counts.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"tokens-table\\">\\n      <h3>{zh ? '明细表格' : 'Detail Table'}</h3>\\n      <p>{zh\\n        ? '表格列出每天各类型的 Token 数量及合计，支持横向滚动查看较长时间范围的数据。'\\n        : 'A table below lists per-day counts for each token type plus a daily total. Scroll horizontally for longer date ranges.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"tokens-types\\">\\n      <h3>{zh ? 'Token 类型说明' : 'Token Types'}</h3>\\n      <ul>\\n        <li><strong>{zh ? '输入' : 'Input'}</strong> — {zh ? '发送给模型的提示 Token' : 'Prompt tokens sent to the model'}</li>\\n        <li><strong>{zh ? '输出' : 'Output'}</strong> — {zh ? '模型生成的回复 Token' : 'Tokens generated by the model'}</li>\\n        <li><strong>{zh ? '缓存读取' : 'Cache Read'}</strong> — {zh ? '从缓存中命中并读取的 Token（计费更低）' : 'Tokens read from cache (billed at a lower rate)'}</li>\\n        <li><strong>{zh ? '缓存写入' : 'Cache Write'}</strong> — {zh ? '写入缓存的 Token' : 'Tokens written to the cache'}</li>\\n        <li><strong>{zh ? '思考' : 'Thinking'}</strong> — {zh ? '扩展思考功能使用的 Token' : 'Tokens used by Extended Thinking mode'}</li>\\n      </ul>\\n    </section>\\n\\n    <!-- ══════ Cost ══════ -->\\n    <section id=\\"cost\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">05</span>\\n        <h2>{zh ? '费用' : 'Cost'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '费用页面展示每日费用走势及按 AI 助手、模型的费用分布。'\\n        : 'The Cost page shows daily spending trends and a breakdown by AI assistant and model.'\\n      }</p>\\n      <Callout type=\\"warn\\">\\n        {zh\\n          ? '费用为估算值，基于「定价」页面中配置的每百万 Token 单价计算。如发现费用偏差，请在「定价」页面检查并修正价格。'\\n          : 'Costs are estimates calculated using per-million-token prices from the Pricing page. If costs look wrong, review and update prices there.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <section id=\\"cost-daily\\">\\n      <h3>{zh ? '每日费用图' : 'Daily Cost Chart'}</h3>\\n      <p>{zh ? '柱状图展示每天的费用，悬停可查看当日金额。' : 'A bar chart showing per-day costs. Hover to view exact amounts.'}</p>\\n    </section>\\n\\n    <section id=\\"cost-breakdown\\">\\n      <h3>{zh ? '按助手与模型分布' : 'By Assistant & Model'}</h3>\\n      <p>{zh\\n        ? '不同工具（Claude Code、Codex 等）的费用排名。不同模型（claude-sonnet-4-5、gpt-4o 等）的费用排名。'\\n        : 'Ranked list of costs per tool (Claude Code, Codex, etc.) and per model (e.g. claude-sonnet-4-5, gpt-4o).'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Models ══════ -->\\n    <section id=\\"models\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">06</span>\\n        <h2>{zh ? '模型' : 'Models'}</h2>\\n      </div>\\n      <p>{zh ? '模型页面展示各 AI 模型的使用量排名，帮助了解哪些模型被频繁调用。' : 'The Models page ranks AI model usage to show which models are used most.'}</p>\\n      <ul>\\n        <li><strong>{zh ? '模型' : 'Model'}</strong> — {zh ? '模型 ID（如 claude-sonnet-4-6）' : 'Model ID (e.g. claude-sonnet-4-6)'}</li>\\n        <li><strong>{zh ? '提供商' : 'Provider'}</strong> — {zh ? '服务提供商（Anthropic、OpenAI 等）' : 'Service provider (Anthropic, OpenAI, etc.)'}</li>\\n        <li><strong>{zh ? '调用次数' : 'Calls'}</strong> — {zh ? '该模型被调用的次数' : 'Number of times invoked'}</li>\\n        <li><strong>{zh ? 'Token' : 'Tokens'}</strong> — {zh ? '该模型消耗的 Token 总量' : 'Total tokens consumed'}</li>\\n        <li><strong>{zh ? '占比' : 'Share'}</strong> — {zh ? '在所有 Token 中的占比（含进度条）' : 'Percentage of total tokens (with progress bar)'}</li>\\n      </ul>\\n    </section>\\n\\n    <!-- ══════ Tool Calls ══════ -->\\n    <section id=\\"tool-calls\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">07</span>\\n        <h2>{zh ? '工具调用' : 'Tool Calls'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '工具调用页面展示 AI 助手在会话中调用各工具的频次排名。工具调用是 AI 助手执行的具体操作，例如 Bash（运行命令）、Read（读取文件）、Edit（修改文件）等。'\\n        : 'The Tool Calls page ranks how frequently each tool was invoked. Tool calls are specific actions — e.g. Bash (run commands), Read (read files), Edit (modify files).'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Projects ══════ -->\\n    <section id=\\"projects\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">08</span>\\n        <h2>{zh ? '项目' : 'Projects'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '项目页面按项目目录展示 Token 用量和费用排名，帮助了解哪些代码库消耗了最多资源。项目名称来自 AI 工具日志中记录的工作目录路径。'\\n        : 'The Projects page ranks token usage and cost by project directory. Project names come from the working directory path recorded in AI tool logs.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Sessions ══════ -->\\n    <section id=\\"sessions\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">09</span>\\n        <h2>{zh ? '会话' : 'Sessions'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '会话页面展示每一条会话记录的详细日志，每页显示 50 条，支持翻页。包含时间、工具、模型、输入/输出 Token、费用等列。'\\n        : 'The Sessions page shows a detailed log of every recorded session, paginated at 50 per page. Columns include time, tool, model, input/output tokens, and cost.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Quotas ══════ -->\\n    <section id=\\"quotas\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">10</span>\\n        <h2>{zh ? '配额监控' : 'Quotas'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '配额页面实时监控 Claude Code、Codex 等工具的速率限制配额。自动从本地凭证中读取配额信息。'\\n        : 'The Quotas page monitors rate limit quotas for Claude Code, Codex, and more. Quota info is read automatically from local credentials.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"quotas-cards\\">\\n      <h3>{zh ? '配额卡片' : 'Quota Cards'}</h3>\\n      <p>{zh\\n        ? '每个已配置凭证的工具显示一张卡片，包含工具名称、最后更新时间、配额状态。未配置凭证的工具会显示在底部的非活跃列表中。'\\n        : 'Each tool with configured credentials shows a card with tool name, last update time, and quota status. Tools without credentials appear in an inactive list at the bottom.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"quotas-tiers\\">\\n      <h3>{zh ? '配额条' : 'Tier Bars'}</h3>\\n      <p>{zh\\n        ? '每个配额层级（如 5h、7d）显示一个进度条，颜色表示使用率：绿色（<70%）、橙色（70-90%）、红色（>90%）。显示重置倒计时。'\\n        : 'Each quota tier (e.g. 5h, 7d) shows a progress bar. Color indicates utilization: green (<70%), orange (70-90%), red (>90%). Reset countdown shown.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Pricing ══════ -->\\n    <section id=\\"pricing\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">11</span>\\n        <h2>{zh ? '定价' : 'Pricing'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '定价页面用于管理各模型的每百万 Token 单价，用于计算整个仪表盘的费用估算。每个模型显示一张卡片，包含模型名、输入/输出费率、缓存费率、状态标签（默认/自定义/前缀匹配/无定价）。'\\n        : 'The Pricing page manages per-million-token rates for each model. Each model card shows: name, input/output rates, cache rates, and status badge (Default/Custom/Prefix match/No pricing).'\\n      }</p>\\n      <Callout type=\\"warn\\">\\n        {zh\\n          ? '修改价格后点击「重新计算费用」会不可逆地更新数据库中所有历史会话的费用字段。'\\n          : 'After changing prices, clicking \\"Recalculate Costs\\" irreversibly updates the cost field for all sessions in the database.'\\n        }\\n      </Callout>\\n    </section>\\n\\n    <!-- ══════ Settings ══════ -->\\n    <section id=\\"settings\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">12</span>\\n        <h2>{zh ? '设置' : 'Settings'}</h2>\\n      </div>\\n      <p>{zh ? '设置页面按模块分区，每个区域独立保存。' : 'The Settings page is divided into sections, each saved independently.'}</p>\\n    </section>\\n\\n    <section id=\\"settings-general\\">\\n      <h3>{zh ? '通用' : 'General'}</h3>\\n      <DocsTable\\n        headers={zh ? ['字段', '说明'] : ['Field', 'Description']}\\n        rows={[\\n          [zh ? '设备别名' : 'Device Alias', zh ? '可选的当前设备名称，留空则使用主机名' : 'Optional device name, defaults to hostname'],\\n          [zh ? '每周起始日' : 'Week Starts On', zh ? '「本周」时间范围的起始天（周日或周一 ISO）' : 'Starting day for \\"This Week\\" range (Sunday or Monday ISO)'],\\n          [zh ? '仪表盘轮询间隔' : 'Dashboard Poll Interval', zh ? '首页自动刷新的间隔（毫秒，默认 30000）' : 'Auto-refresh interval in ms (default: 30000)'],\\n          [zh ? '自动解析间隔' : 'Auto-Parse Interval', zh ? '后台自动触发解析的间隔（毫秒）。设为 0 则禁用' : 'Background parse interval in ms. Set 0 to disable'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"settings-sources\\">\\n      <h3>{zh ? '数据源' : 'Data Sources'}</h3>\\n      <p>{zh ? '为每种 AI 工具指定自定义日志目录路径。留空则使用默认路径：' : 'Specify custom log directory paths for each AI tool. Leave blank for defaults:'}</p>\\n      <ul>\\n        <li><strong>Claude Code</strong> — <code>~/.claude/projects</code></li>\\n        <li><strong>Codex</strong> — <code>~/.codex/sessions</code></li>\\n        <li><strong>OpenClaw</strong> — <code>~/.openclaw/agents</code></li>\\n        <li><strong>OpenCode</strong> — {zh ? '平台相关的 SQLite 数据库路径' : 'platform-specific SQLite database path'}</li>\\n        <li><strong>Hermes</strong> — <code>~/.hermes/state.db</code></li>\\n        <li><strong>Qoder</strong> — <code>~/.qoder/logs/sessions</code> + {zh ? '平台相关的' : 'platform-specific'} <code>local.db</code></li>\\n        <li><strong>Cursor</strong> — {zh ? '平台相关的' : 'platform-specific'} <code>state.vscdb</code></li>\\n      </ul>\\n    </section>\\n\\n    <section id=\\"settings-data\\">\\n      <h3>{zh ? '数据管理' : 'Data Management'}</h3>\\n      <p><strong>{zh ? '本地数据保留天数' : 'Local Data Retention (days)'}</strong> — {zh\\n        ? '超过此天数的旧数据将被清理。设为 0 或留空则永久保留。'\\n        : 'Data older than this will be cleaned up. Set to 0 or leave empty to keep forever.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ Sync ══════ -->\\n    <section id=\\"sync\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">13</span>\\n        <h2>{zh ? '多设备同步' : 'Sync'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '同步功能将本设备的数据推送到远程存储，并从远程拉取其他设备的数据，实现多台设备之间的用量统计共享。'\\n        : 'Sync pushes this device\\\\'s data to remote storage and pulls other devices\\\\' data, sharing usage stats across machines.'\\n      }</p>\\n      <ul>\\n        <li><strong>GitHub</strong> — {zh ? '推送到 GitHub 仓库' : 'Push to a GitHub repository'}</li>\\n        <li><strong>S3 / {zh ? '兼容存储' : 'Compatible'}</strong> — {zh ? '推送到 Amazon S3 或任何 S3 兼容存储（Cloudflare R2、MinIO 等）' : 'Push to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, etc.)'}</li>\\n      </ul>\\n      <CodeBlock lang=\\"Terminal\\" copyText=\\"aiusage sync\\">\\n        <span slot=\\"lines\\"><span>1</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> sync\\n      </CodeBlock>\\n    </section>\\n\\n    <!-- ══════ Export ══════ -->\\n    <section id=\\"export\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">14</span>\\n        <h2>{zh ? '数据导出' : 'Export'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到已有的数据管道和报表系统。'\\n        : 'Export usage data as CSV, JSON, or NDJSON for integration with existing data pipelines and reporting.'\\n      }</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'aiusage export --format csv -o usage.csv\\\\naiusage export --format json -o usage.json\\\\naiusage export --format ndjson'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span><span>3</span></span>\\n        <span class=\\"tk-kw\\">aiusage</span> export --format csv -o usage.csv\\n<span class=\\"tk-kw\\">aiusage</span> export --format json -o usage.json\\n<span class=\\"tk-kw\\">aiusage</span> export --format ndjson\\n      </CodeBlock>\\n    </section>\\n\\n    <!-- ══════ Widget ══════ -->\\n    <section id=\\"widget\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">15</span>\\n        <h2>{zh ? '桌面小组件' : 'Widget'}</h2>\\n      </div>\\n      <p>{zh\\n        ? 'AIUsage Widget 是一个 Electron 系统托盘应用，在系统托盘中显示 Token 用量摘要，无需打开浏览器即可快速查看。'\\n        : 'AIUsage Widget is an Electron system tray app that shows token usage summaries in your system tray — no browser needed.'\\n      }</p>\\n      <CodeBlock lang=\\"Terminal\\" copyText={'npm install -g @juliantanx/aiusage-widget\\\\naiusage-widget'}>\\n        <span slot=\\"lines\\"><span>1</span><span>2</span></span>\\n        <span class=\\"tk-kw\\">npm</span> install -g <span class=\\"tk-str\\">@juliantanx/aiusage-widget</span>\\n<span class=\\"tk-kw\\">aiusage-widget</span>\\n      </CodeBlock>\\n      <p>{zh\\n        ? 'Widget 读取与 CLI 相同的本地数据库，因此需要先运行 aiusage parse 解析数据。'\\n        : 'Widget reads the same local database as the CLI, so you need to run aiusage parse first.'\\n      }</p>\\n    </section>\\n\\n    <!-- ══════ CLI Reference ══════ -->\\n    <section id=\\"cli\\">\\n      <div class=\\"sec-head\\">\\n        <span class=\\"sec-idx\\">16</span>\\n        <h2>{zh ? 'CLI 命令参考' : 'CLI Reference'}</h2>\\n      </div>\\n      <p>{zh\\n        ? '所有 CLI 命令均通过 aiusage <command> 调用。不带子命令时等同于 aiusage summary。'\\n        : 'All CLI commands are invoked as aiusage <command>. Running without a subcommand is equivalent to aiusage summary.'\\n      }</p>\\n    </section>\\n\\n    <section id=\\"cli-parse\\">\\n      <h3><code>parse</code> — {zh ? '解析日志' : 'Parse Logs'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--tool &lt;tool&gt;</code>', zh ? '只解析指定工具' : 'Only parse specific tool: claude-code, codex, openclaw, opencode, hermes, qoder, cursor'],\\n          ['<code>--progress</code>', zh ? '显示实时进度条（仅 TTY）' : 'Show real-time progress bar (TTY only)'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-serve\\">\\n      <h3><code>serve</code> — {zh ? '启动仪表盘' : 'Start Dashboard'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}\\n        rows={[\\n          ['<code>-p, --port &lt;port&gt;</code>', zh ? '端口号' : 'Port number', '<code>3847</code>'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-summary\\">\\n      <h3><code>summary</code> — {zh ? '终端摘要' : 'Terminal Summary'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--device &lt;id&gt;</code>', zh ? '按设备实例 ID 筛选' : 'Filter by device instance ID'],\\n          ['<code>--tool &lt;tool&gt;</code>', zh ? '按工具类型筛选' : 'Filter by tool type'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-export\\">\\n      <h3><code>export</code> — {zh ? '导出数据' : 'Export Data'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '必填'] : ['Option', 'Description', 'Required']}\\n        rows={[\\n          ['<code>--format &lt;f&gt;</code>', 'csv, json, ndjson', zh ? '是' : 'Yes'],\\n          ['<code>-o, --output &lt;f&gt;</code>', zh ? '输出文件路径（默认 stdout）' : 'Output file path (default: stdout)', zh ? '否' : 'No'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-clean\\">\\n      <h3><code>clean</code> — {zh ? '清理旧数据' : 'Clean Old Data'}</h3>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}\\n        rows={[\\n          ['<code>--before &lt;dur&gt;</code>', zh ? '删除此时间之前的数据（如 30d、180d）' : 'Delete data older than this (e.g. 30d, 180d)', '<code>180d</code>'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-reset\\">\\n      <h3><code>reset</code> — {zh ? '重置所有数据' : 'Reset All Data'}</h3>\\n      <p>{zh\\n        ? '删除所有已解析的记录、工具调用、同步数据和水位线。原始日志文件不受影响。'\\n        : 'Delete all parsed records, tool calls, synced data, and the parse watermark. Source log files are not affected.'\\n      }</p>\\n      <DocsTable\\n        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}\\n        rows={[\\n          ['<code>--yes</code>', zh ? '跳过确认提示（必须指定才会执行）' : 'Skip confirmation prompt (required to execute)'],\\n        ]}\\n      />\\n    </section>\\n\\n    <section id=\\"cli-other\\">\\n      <h3>{zh ? '其他命令' : 'Other Commands'}</h3>\\n      <DocsTable\\n        headers={zh ? ['命令', '说明'] : ['Command', 'Description']}\\n        rows={[\\n          ['<code>status</code>', zh ? '显示版本号、设备名称、数据库路径、schema 版本、记录数、数据库大小及同步状态' : 'Show version, device name, DB path, schema version, record count, DB size, and sync status'],\\n          ['<code>sync</code>', zh ? '与远程后端双向同步数据' : 'Push and pull data with remote backend'],\\n          ['<code>recalc</code>', zh ? '按最新定价重新计算费用' : 'Recalculate costs with latest pricing'],\\n          ['<code>init</code>', zh ? '配置同步后端（--backend, --repo, --token, --bucket, --endpoint 等）' : 'Configure sync backend (--backend, --repo, --token, --bucket, --endpoint, etc.)'],\\n        ]}\\n      />\\n    </section>\\n  </article>\\n\\n  {#if showBackToTop}\\n    <button class=\\"back-to-top\\" on:click={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label=\\"Back to top\\">\\n      ↑\\n    </button>\\n  {/if}\\n</div>\\n\\n<style>\\n  /* ── Layout ──────────────────────────────────────────────── */\\n  .docs-layout {\\n    width: var(--content-width);\\n    margin: 0 auto;\\n    padding: 2rem 0 4rem;\\n    position: relative;\\n  }\\n\\n  /* ── Mobile TOC ──────────────────────────────────────────── */\\n  .mobile-toc-toggle {\\n    display: none;\\n    align-items: center;\\n    gap: 0.625rem;\\n    width: 100%;\\n    padding: 0.75rem 1rem;\\n    background: var(--surface);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 8px;\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    font-weight: 550;\\n    color: var(--text-secondary);\\n    cursor: pointer;\\n    margin-bottom: 0.5rem;\\n  }\\n\\n  .toc-burger {\\n    display: flex;\\n    flex-direction: column;\\n    gap: 3px;\\n    width: 16px;\\n  }\\n\\n  .toc-burger span {\\n    display: block;\\n    height: 2px;\\n    background: var(--accent);\\n    border-radius: 1px;\\n    transition: all 0.2s ease;\\n  }\\n\\n  .toc-burger.open span:nth-child(1) {\\n    transform: rotate(45deg) translate(3px, 3px);\\n  }\\n  .toc-burger.open span:nth-child(2) {\\n    opacity: 0;\\n  }\\n  .toc-burger.open span:nth-child(3) {\\n    transform: rotate(-45deg) translate(4px, -4px);\\n  }\\n\\n  /* ── Sidebar ─────────────────────────────────────────────── */\\n  .docs-sidebar {\\n    position: fixed;\\n    top: 76px;\\n    left: calc(50% - var(--content-width) / 2);\\n    width: 260px;\\n    max-height: calc(100vh - 92px);\\n    overflow-y: auto;\\n    scrollbar-width: thin;\\n    transition: transform 0.15s ease;\\n  }\\n\\n  /* ── Hero ────────────────────────────────────────────────── */\\n  .docs-hero {\\n    margin-bottom: 3rem;\\n    padding-bottom: 2.5rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n    position: relative;\\n  }\\n\\n  .docs-hero::after {\\n    content: '';\\n    position: absolute;\\n    bottom: -1px;\\n    left: 0;\\n    width: 80px;\\n    height: 2px;\\n    background: var(--accent);\\n  }\\n\\n  .hero-eyebrow {\\n    display: inline-flex;\\n    align-items: center;\\n    gap: 0.5rem;\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 600;\\n    text-transform: uppercase;\\n    letter-spacing: 0.1em;\\n    color: var(--accent);\\n    margin-bottom: 0.75rem;\\n    padding: 0.3rem 0.75rem;\\n    background: var(--accent-dim);\\n    border-radius: 4px;\\n  }\\n\\n  .hero-eyebrow-icon {\\n    font-size: 0.8125rem;\\n  }\\n\\n  .hero-title {\\n    font-family: 'Source Serif 4', 'Georgia', serif;\\n    font-size: 2.5rem;\\n    font-weight: 700;\\n    letter-spacing: -0.03em;\\n    color: var(--text);\\n    margin-bottom: 0.75rem;\\n    line-height: 1.15;\\n  }\\n\\n  .hero-sub {\\n    font-size: 1.0625rem;\\n    color: var(--text-secondary);\\n    line-height: 1.7;\\n    max-width: 640px;\\n  }\\n\\n  .hero-meta {\\n    display: flex;\\n    gap: 0.5rem;\\n    margin-top: 1.25rem;\\n    flex-wrap: wrap;\\n  }\\n\\n  .meta-tag {\\n    font-family: var(--mono);\\n    font-size: 0.6875rem;\\n    font-weight: 550;\\n    color: var(--text-muted);\\n    background: var(--raised);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 4px;\\n    padding: 0.2rem 0.5rem;\\n    letter-spacing: 0.02em;\\n  }\\n\\n  /* ── Content ─────────────────────────────────────────────── */\\n  .docs-content {\\n    min-width: 0;\\n    max-width: 85ch;\\n    margin-left: 290px;\\n  }\\n\\n  /* ── Section heads ───────────────────────────────────────── */\\n  section {\\n    margin-bottom: 2.5rem;\\n    padding-top: 0.25rem;\\n    scroll-margin-top: 76px;\\n  }\\n\\n  .sec-head {\\n    display: flex;\\n    align-items: baseline;\\n    gap: 0.875rem;\\n    margin-bottom: 0.75rem;\\n    padding-bottom: 0.625rem;\\n    border-bottom: 1px solid var(--border-subtle);\\n  }\\n\\n  .sec-idx {\\n    font-family: var(--mono);\\n    font-size: 0.75rem;\\n    font-weight: 700;\\n    color: var(--accent);\\n    opacity: 0.6;\\n    letter-spacing: 0.02em;\\n    flex-shrink: 0;\\n  }\\n\\n  section h2 {\\n    font-family: 'Source Serif 4', 'Georgia', serif;\\n    font-size: 1.375rem;\\n    font-weight: 700;\\n    color: var(--text);\\n    letter-spacing: -0.02em;\\n    margin: 0;\\n    padding: 0;\\n    border: none;\\n  }\\n\\n  section h3 {\\n    font-family: 'Instrument Sans', sans-serif;\\n    font-size: 1.0625rem;\\n    font-weight: 600;\\n    color: var(--text);\\n    letter-spacing: -0.01em;\\n    margin: 2rem 0 0.75rem;\\n  }\\n\\n  section p {\\n    font-size: 0.9375rem;\\n    color: var(--text-secondary);\\n    line-height: 1.75;\\n    margin-bottom: 0.75rem;\\n  }\\n\\n  section ul {\\n    padding-left: 1.25rem;\\n    margin-bottom: 0.75rem;\\n    list-style: none;\\n  }\\n\\n  section li {\\n    font-size: 0.9375rem;\\n    color: var(--text-secondary);\\n    line-height: 1.75;\\n    margin-bottom: 0.375rem;\\n    position: relative;\\n    padding-left: 0.875rem;\\n  }\\n\\n  section li::before {\\n    content: '';\\n    position: absolute;\\n    left: 0;\\n    top: 0.6em;\\n    width: 4px;\\n    height: 4px;\\n    border-radius: 50%;\\n    background: var(--accent);\\n    opacity: 0.4;\\n  }\\n\\n  section strong {\\n    color: var(--text);\\n    font-weight: 600;\\n  }\\n\\n  section code {\\n    font-family: var(--mono);\\n    font-size: 0.8125rem;\\n    background: var(--raised);\\n    border: 1px solid var(--border-subtle);\\n    border-radius: 4px;\\n    padding: 0.1em 0.4em;\\n    color: var(--accent);\\n  }\\n\\n  /* ── Back to top ─────────────────────────────────────────── */\\n  .back-to-top {\\n    position: fixed;\\n    bottom: 2rem;\\n    right: 2rem;\\n    z-index: 50;\\n    width: 44px;\\n    height: 44px;\\n    border-radius: 50%;\\n    background: var(--accent);\\n    color: oklch(0.99 0.002 85);\\n    border: none;\\n    cursor: pointer;\\n    font-size: 1.125rem;\\n    display: flex;\\n    align-items: center;\\n    justify-content: center;\\n    box-shadow: 0 2px 12px oklch(0 0 0 / 0.15);\\n    transition: all 0.2s ease;\\n    animation: fadeIn 0.2s ease-out;\\n  }\\n\\n  .back-to-top:hover {\\n    background: var(--accent-hover);\\n    transform: translateY(-2px);\\n    box-shadow: 0 4px 16px oklch(0 0 0 / 0.2);\\n  }\\n\\n  @keyframes fadeIn {\\n    from { opacity: 0; transform: translateY(8px); }\\n    to { opacity: 1; transform: translateY(0); }\\n  }\\n\\n  /* ── Responsive ──────────────────────────────────────────── */\\n  @media (max-width: 800px) {\\n    .docs-content {\\n      margin-left: 0;\\n    }\\n\\n    .mobile-toc-toggle {\\n      display: flex;\\n    }\\n\\n    .docs-sidebar {\\n      display: none;\\n      position: static;\\n      width: auto;\\n      max-height: none;\\n      margin-bottom: 1rem;\\n    }\\n\\n    .docs-sidebar.mobile-open {\\n      display: block;\\n      background: var(--surface);\\n      border: 1px solid var(--border-subtle);\\n      border-radius: 8px;\\n      padding: 0.5rem;\\n    }\\n\\n    .docs-sidebar.mobile-open :global(.toc) {\\n      border-right: none;\\n      padding-right: 0;\\n    }\\n\\n    .hero-title {\\n      font-size: 1.875rem;\\n    }\\n  }\\n</style>\\n"],"names":[],"mappings":"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"}`
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
  })}<\/script>`}<!-- HTML_TAG_END --><!-- HEAD_svelte-fy32ad_END -->`, ""} <div class="docs-layout svelte-zs40yn"><button class="mobile-toc-toggle svelte-zs40yn"><span class="${["toc-burger svelte-zs40yn", ""].join(" ").trim()}" data-svelte-h="svelte-6yzuhb"><span class="svelte-zs40yn"></span><span class="svelte-zs40yn"></span><span class="svelte-zs40yn"></span></span> <span>${escape(zh ? "目录" : "Contents")}</span></button> <aside class="${["docs-sidebar svelte-zs40yn", ""].join(" ").trim()}"${add_styles({
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
  )}</aside> <article class="docs-content svelte-zs40yn"> <header class="docs-hero svelte-zs40yn"><div class="hero-eyebrow svelte-zs40yn"><span class="hero-eyebrow-icon svelte-zs40yn" data-svelte-h="svelte-1qf64yp">⌘</span> <span>${escape(zh ? "AIUsage 参考手册" : "AIUsage Reference")}</span></div> <h1 class="hero-title svelte-zs40yn">${escape(zh ? "文档" : "Documentation")}</h1> <p class="hero-sub svelte-zs40yn">${escape(zh ? "AIUsage 是一款 AI 工具用量统计平台，支持 Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor 等多种 AI 工具的 Token 和费用追踪。" : "AIUsage is a local-first usage analytics platform for AI coding tools — tracking tokens, costs, sessions and more across Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, and Cursor.")}</p> <div class="hero-meta svelte-zs40yn"><span class="meta-tag svelte-zs40yn">${escape(zh ? "开源" : "Open Source")}</span> <span class="meta-tag svelte-zs40yn" data-svelte-h="svelte-klcsvz">MIT</span> <span class="meta-tag svelte-zs40yn" data-svelte-h="svelte-7lvups">v1.3.1</span></div></header>  <section id="getting-started" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-s0tx6t">01</span> <h2 class="svelte-zs40yn">${escape(zh ? "快速开始" : "Getting Started")}</h2></div> ${zh ? `<p class="svelte-zs40yn" data-svelte-h="svelte-1spn8ro">AIUsage 是一个命令行工具，内置 Web 仪表盘。安装完成后，它会解析 AI 工具生成的日志文件，并在本地数据库中追踪用量数据。</p>` : `<p class="svelte-zs40yn" data-svelte-h="svelte-ma1yho">AIUsage is a CLI tool with a built-in web dashboard. It parses log files generated by AI tools and tracks usage data in a local database.</p>`}</section> <section id="install" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "安装" : "Installation")}</h3> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )}</section> <section id="parse" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "解析数据" : "Parse Data")}</h3> <p class="svelte-zs40yn">${escape(zh ? "解析 AI 工具的日志文件，写入本地数据库：" : "Parse log files from your AI tools into the local database:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )}</section> <section id="serve" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "启动仪表盘" : "Start the Dashboard")}</h3> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )} <p class="svelte-zs40yn">${escape(zh ? "浏览器打开 http://localhost:3847 即可查看仪表盘。" : "Open http://localhost:3847 in your browser to view the dashboard.")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "info" }, {}, {
    default: () => {
      return `${escape(zh ? "仪表盘首页在浏览器首次加载时会自动触发一次解析。您也可以在 Settings 页面配置自动定期解析。" : "The dashboard home page triggers a parse automatically on first load. You can also configure automatic periodic parsing in Settings.")}`;
    }
  })}</section> <section id="pm2" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "后台运行 (PM2)" : "Running in Background (PM2)")}</h3> <p class="svelte-zs40yn">${escape(zh ? "aiusage serve 默认在前台运行，关闭终端后服务会终止。如需后台持续运行，请使用 PM2：" : "aiusage serve runs in the foreground. To keep it running in the background, use PM2:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )}</section> <section id="docker" class="svelte-zs40yn"><h3 class="svelte-zs40yn" data-svelte-h="svelte-1jtsdwc">Docker</h3> <p class="svelte-zs40yn">${escape(zh ? "使用官方 Docker 镜像运行 AIUsage，无需安装 Node.js：" : "Run AIUsage with the official Docker image, no Node.js installation required:")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
      return `${escape(zh ? "镜像在 Docker Hub (juliantanx/aiusage) 和 GitHub Container Registry (ghcr.io/juliantanx/aiusage) 均可获取。支持 amd64 和 arm64 架构。" : "Available on Docker Hub (juliantanx/aiusage) and GitHub Container Registry (ghcr.io/juliantanx/aiusage). Supports amd64 and arm64 architectures.")}`;
    }
  })}</section>  <section id="dashboard" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-ej0w90">02</span> <h2 class="svelte-zs40yn">${escape(zh ? "仪表盘（首页）" : "Dashboard (Home)")}</h2></div> ${zh ? `<p class="svelte-zs40yn" data-svelte-h="svelte-1j1c89h">首页是一个实时 Token 计数器，显示所选时间范围内的累计用量，并每隔一段时间自动刷新。</p>` : `<p class="svelte-zs40yn" data-svelte-h="svelte-80jl20">The home page is a live token counter showing cumulative usage for the selected time range, auto-refreshing at a configurable interval.</p>`}</section> <section id="dash-elements" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "界面元素" : "UI Elements")}</h3> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "实时计数器" : "Live counter")}</strong> — ${escape(zh ? "显示总 Token 数，支持动画计数效果" : "Total token count with animated count-up effect")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "子统计" : "Sub-stats")}</strong> — ${escape(zh ? "分别展示输入、输出和缓存 Token" : "Input, output, and cache tokens shown separately")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "费用 / 会话 / 活跃天数" : "Cost / Sessions / Active Days")}</strong> — ${escape(zh ? "三个辅助统计卡片" : "Three secondary stat cards")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "Token 构成条" : "Token composition bar")}</strong> — ${escape(zh ? "按比例显示输入、输出、缓存读写的分布" : "Proportional breakdown of input, output, cache read/write")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "刷新进度条" : "Refresh progress bar")}</strong> — ${escape(zh ? "显示下次自动刷新的倒计时" : "Countdown until next auto-refresh")}</li></ul></section> <section id="dash-config" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "显示配置" : "Display Config")}</h3> <p class="svelte-zs40yn">${escape(zh ? "点击右上角的齿轮按钮可打开显示配置面板：" : "Click the gear button to open the display config panel:")}</p> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "时间范围" : "Time range")}</strong> — ${escape(zh ? "今天 / 本周 / 本月 / 近 30 天 / 全部" : "Today / This Week / This Month / Last 30d / All Time")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "数字格式" : "Number format")}</strong> — ${escape(zh ? "精确（1,234,567）或简短（1.2M）" : "Exact (1,234,567) or abbreviated (1.2M)")}</li></ul></section>  <section id="overview" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-x63qwb">03</span> <h2 class="svelte-zs40yn">${escape(zh ? "概览" : "Overview")}</h2></div> ${zh ? `<p class="svelte-zs40yn" data-svelte-h="svelte-1p9unzw">概览页展示带筛选条件的聚合统计摘要，是了解整体用量的起点。</p>` : `<p class="svelte-zs40yn" data-svelte-h="svelte-2ullw1">The Overview page shows aggregated usage stats with filters — your go-to starting point for understanding overall usage.</p>`} ${validate_component(Callout, "Callout").$$render($$result, { type: "tip" }, {}, {
    default: () => {
      return `${escape(zh ? "使用页面顶部的筛选栏可以按日期范围、设备、AI 助手进行过滤，所有数据页面均支持这些筛选条件。" : "Use the filter bar at the top to narrow by date range, device, and AI assistant — all data pages share these filters.")}`;
    }
  })}</section> <section id="overview-cards" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "统计卡片" : "Stat Cards")}</h3> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "总 Token" : "Total Tokens")}</strong> — ${escape(zh ? "所有类型 Token 的合计" : "Sum of all token types")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "总费用" : "Total Cost")}</strong> — ${escape(zh ? "基于定价表计算的估算费用" : "Estimated cost based on the pricing table")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "活跃天数" : "Active Days")}</strong> — ${escape(zh ? "有记录的天数" : "Number of days with recorded usage")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "会话数" : "Sessions")}</strong> — ${escape(zh ? "独立会话的总数" : "Total number of distinct sessions")}</li></ul></section> <section id="overview-breakdown" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "Token 明细" : "Token Breakdown")}</h3> <p class="svelte-zs40yn">${escape(zh ? "在卡片下方展示输入、输出、缓存读取、缓存写入的分项数据。" : "Below the cards: input, output, cache read, and cache write token counts shown individually.")}</p></section> <section id="overview-assistant" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "按 AI 助手统计" : "By AI Assistant")}</h3> <p class="svelte-zs40yn">${escape(zh ? "按使用的 AI 工具（claude-code、codex 等）分组，显示各工具的 Token 数和费用。列出调用次数最多的工具（如 Bash、Read、Edit 等）。" : "Usage grouped by AI tool (claude-code, codex, etc.) showing tokens and cost per tool. Most-called tool names ranked by invocation count.")}</p></section>  <section id="tokens" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-eqftoy">04</span> <h2 class="svelte-zs40yn">${escape(zh ? "Token 用量" : "Tokens")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "Token 页面以每日图表和明细表格的形式展示 Token 消耗趋势。" : "The Tokens page visualizes daily token consumption with a bar chart and a detail table.")}</p></section> <section id="tokens-chart" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "每日柱状图" : "Daily Bar Chart")}</h3> <p class="svelte-zs40yn">${escape(zh ? "每组柱子展示同一天内的各类 Token（输入、输出、缓存读取、缓存写入、思考 Token），悬停可查看具体数值。" : "Each bar group shows the token types for one day (input, output, cache read, cache write, thinking). Hover to see exact counts.")}</p></section> <section id="tokens-table" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "明细表格" : "Detail Table")}</h3> <p class="svelte-zs40yn">${escape(zh ? "表格列出每天各类型的 Token 数量及合计，支持横向滚动查看较长时间范围的数据。" : "A table below lists per-day counts for each token type plus a daily total. Scroll horizontally for longer date ranges.")}</p></section> <section id="tokens-types" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "Token 类型说明" : "Token Types")}</h3> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "输入" : "Input")}</strong> — ${escape(zh ? "发送给模型的提示 Token" : "Prompt tokens sent to the model")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "输出" : "Output")}</strong> — ${escape(zh ? "模型生成的回复 Token" : "Tokens generated by the model")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "缓存读取" : "Cache Read")}</strong> — ${escape(zh ? "从缓存中命中并读取的 Token（计费更低）" : "Tokens read from cache (billed at a lower rate)")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "缓存写入" : "Cache Write")}</strong> — ${escape(zh ? "写入缓存的 Token" : "Tokens written to the cache")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "思考" : "Thinking")}</strong> — ${escape(zh ? "扩展思考功能使用的 Token" : "Tokens used by Extended Thinking mode")}</li></ul></section>  <section id="cost" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-1qiidux">05</span> <h2 class="svelte-zs40yn">${escape(zh ? "费用" : "Cost")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "费用页面展示每日费用走势及按 AI 助手、模型的费用分布。" : "The Cost page shows daily spending trends and a breakdown by AI assistant and model.")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "warn" }, {}, {
    default: () => {
      return `${escape(zh ? "费用为估算值，基于「定价」页面中配置的每百万 Token 单价计算。如发现费用偏差，请在「定价」页面检查并修正价格。" : "Costs are estimates calculated using per-million-token prices from the Pricing page. If costs look wrong, review and update prices there.")}`;
    }
  })}</section> <section id="cost-daily" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "每日费用图" : "Daily Cost Chart")}</h3> <p class="svelte-zs40yn">${escape(zh ? "柱状图展示每天的费用，悬停可查看当日金额。" : "A bar chart showing per-day costs. Hover to view exact amounts.")}</p></section> <section id="cost-breakdown" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "按助手与模型分布" : "By Assistant & Model")}</h3> <p class="svelte-zs40yn">${escape(zh ? "不同工具（Claude Code、Codex 等）的费用排名。不同模型（claude-sonnet-4-5、gpt-4o 等）的费用排名。" : "Ranked list of costs per tool (Claude Code, Codex, etc.) and per model (e.g. claude-sonnet-4-5, gpt-4o).")}</p></section>  <section id="models" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-3ncl7c">06</span> <h2 class="svelte-zs40yn">${escape(zh ? "模型" : "Models")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "模型页面展示各 AI 模型的使用量排名，帮助了解哪些模型被频繁调用。" : "The Models page ranks AI model usage to show which models are used most.")}</p> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "模型" : "Model")}</strong> — ${escape(zh ? "模型 ID（如 claude-sonnet-4-6）" : "Model ID (e.g. claude-sonnet-4-6)")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "提供商" : "Provider")}</strong> — ${escape(zh ? "服务提供商（Anthropic、OpenAI 等）" : "Service provider (Anthropic, OpenAI, etc.)")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "调用次数" : "Calls")}</strong> — ${escape(zh ? "该模型被调用的次数" : "Number of times invoked")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "Token" : "Tokens")}</strong> — ${escape(zh ? "该模型消耗的 Token 总量" : "Total tokens consumed")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "占比" : "Share")}</strong> — ${escape(zh ? "在所有 Token 中的占比（含进度条）" : "Percentage of total tokens (with progress bar)")}</li></ul></section>  <section id="tool-calls" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-1tm93tb">07</span> <h2 class="svelte-zs40yn">${escape(zh ? "工具调用" : "Tool Calls")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "工具调用页面展示 AI 助手在会话中调用各工具的频次排名。工具调用是 AI 助手执行的具体操作，例如 Bash（运行命令）、Read（读取文件）、Edit（修改文件）等。" : "The Tool Calls page ranks how frequently each tool was invoked. Tool calls are specific actions — e.g. Bash (run commands), Read (read files), Edit (modify files).")}</p></section>  <section id="projects" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-dztzc6">08</span> <h2 class="svelte-zs40yn">${escape(zh ? "项目" : "Projects")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "项目页面按项目目录展示 Token 用量和费用排名，帮助了解哪些代码库消耗了最多资源。项目名称来自 AI 工具日志中记录的工作目录路径。" : "The Projects page ranks token usage and cost by project directory. Project names come from the working directory path recorded in AI tool logs.")}</p></section>  <section id="sessions" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-1i4jo0d">09</span> <h2 class="svelte-zs40yn">${escape(zh ? "会话" : "Sessions")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "会话页面展示每一条会话记录的详细日志，每页显示 50 条，支持翻页。包含时间、工具、模型、输入/输出 Token、费用等列。" : "The Sessions page shows a detailed log of every recorded session, paginated at 50 per page. Columns include time, tool, model, input/output tokens, and cost.")}</p></section>  <section id="quotas" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-d29gxb">10</span> <h2 class="svelte-zs40yn">${escape(zh ? "配额监控" : "Quotas")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "配额页面实时监控 Claude Code、Codex 等工具的速率限制配额。自动从本地凭证中读取配额信息。" : "The Quotas page monitors rate limit quotas for Claude Code, Codex, and more. Quota info is read automatically from local credentials.")}</p></section> <section id="quotas-cards" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "配额卡片" : "Quota Cards")}</h3> <p class="svelte-zs40yn">${escape(zh ? "每个已配置凭证的工具显示一张卡片，包含工具名称、最后更新时间、配额状态。未配置凭证的工具会显示在底部的非活跃列表中。" : "Each tool with configured credentials shows a card with tool name, last update time, and quota status. Tools without credentials appear in an inactive list at the bottom.")}</p></section> <section id="quotas-tiers" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "配额条" : "Tier Bars")}</h3> <p class="svelte-zs40yn">${escape(zh ? "每个配额层级（如 5h、7d）显示一个进度条，颜色表示使用率：绿色（<70%）、橙色（70-90%）、红色（>90%）。显示重置倒计时。" : "Each quota tier (e.g. 5h, 7d) shows a progress bar. Color indicates utilization: green (<70%), orange (70-90%), red (>90%). Reset countdown shown.")}</p></section>  <section id="pricing" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-akjihw">11</span> <h2 class="svelte-zs40yn">${escape(zh ? "定价" : "Pricing")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "定价页面用于管理各模型的每百万 Token 单价，用于计算整个仪表盘的费用估算。每个模型显示一张卡片，包含模型名、输入/输出费率、缓存费率、状态标签（默认/自定义/前缀匹配/无定价）。" : "The Pricing page manages per-million-token rates for each model. Each model card shows: name, input/output rates, cache rates, and status badge (Default/Custom/Prefix match/No pricing).")}</p> ${validate_component(Callout, "Callout").$$render($$result, { type: "warn" }, {}, {
    default: () => {
      return `${escape(zh ? "修改价格后点击「重新计算费用」会不可逆地更新数据库中所有历史会话的费用字段。" : 'After changing prices, clicking "Recalculate Costs" irreversibly updates the cost field for all sessions in the database.')}`;
    }
  })}</section>  <section id="settings" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-1ifd411">12</span> <h2 class="svelte-zs40yn">${escape(zh ? "设置" : "Settings")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "设置页面按模块分区，每个区域独立保存。" : "The Settings page is divided into sections, each saved independently.")}</p></section> <section id="settings-general" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "通用" : "General")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
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
          zh ? "首页自动刷新的间隔（毫秒，默认 30000）" : "Auto-refresh interval in ms (default: 30000)"
        ],
        [
          zh ? "自动解析间隔" : "Auto-Parse Interval",
          zh ? "后台自动触发解析的间隔（毫秒）。设为 0 则禁用" : "Background parse interval in ms. Set 0 to disable"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="settings-sources" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "数据源" : "Data Sources")}</h3> <p class="svelte-zs40yn">${escape(zh ? "为每种 AI 工具指定自定义日志目录路径。留空则使用默认路径：" : "Specify custom log directory paths for each AI tool. Leave blank for defaults:")}</p> <ul class="svelte-zs40yn"><li class="svelte-zs40yn" data-svelte-h="svelte-6alzqn"><strong class="svelte-zs40yn">Claude Code</strong> — <code class="svelte-zs40yn">~/.claude/projects</code></li> <li class="svelte-zs40yn" data-svelte-h="svelte-iittsr"><strong class="svelte-zs40yn">Codex</strong> — <code class="svelte-zs40yn">~/.codex/sessions</code></li> <li class="svelte-zs40yn" data-svelte-h="svelte-12kf3u6"><strong class="svelte-zs40yn">OpenClaw</strong> — <code class="svelte-zs40yn">~/.openclaw/agents</code></li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn" data-svelte-h="svelte-1kc14mh">OpenCode</strong> — ${escape(zh ? "平台相关的 SQLite 数据库路径" : "platform-specific SQLite database path")}</li> <li class="svelte-zs40yn" data-svelte-h="svelte-4l30bd"><strong class="svelte-zs40yn">Hermes</strong> — <code class="svelte-zs40yn">~/.hermes/state.db</code></li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn" data-svelte-h="svelte-fwpd2b">Qoder</strong> — <code class="svelte-zs40yn" data-svelte-h="svelte-1mcd4p8">~/.qoder/logs/sessions</code> + ${escape(zh ? "平台相关的" : "platform-specific")} <code class="svelte-zs40yn" data-svelte-h="svelte-1ay2l8p">local.db</code></li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn" data-svelte-h="svelte-1mx44ue">Cursor</strong> — ${escape(zh ? "平台相关的" : "platform-specific")} <code class="svelte-zs40yn" data-svelte-h="svelte-1cpe06d">state.vscdb</code></li></ul></section> <section id="settings-data" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "数据管理" : "Data Management")}</h3> <p class="svelte-zs40yn"><strong class="svelte-zs40yn">${escape(zh ? "本地数据保留天数" : "Local Data Retention (days)")}</strong> — ${escape(zh ? "超过此天数的旧数据将被清理。设为 0 或留空则永久保留。" : "Data older than this will be cleaned up. Set to 0 or leave empty to keep forever.")}</p></section>  <section id="sync" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-uijv0q">13</span> <h2 class="svelte-zs40yn">${escape(zh ? "多设备同步" : "Sync")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "同步功能将本设备的数据推送到远程存储，并从远程拉取其他设备的数据，实现多台设备之间的用量统计共享。" : "Sync pushes this device's data to remote storage and pulls other devices' data, sharing usage stats across machines.")}</p> <ul class="svelte-zs40yn"><li class="svelte-zs40yn"><strong class="svelte-zs40yn" data-svelte-h="svelte-115wlxv">GitHub</strong> — ${escape(zh ? "推送到 GitHub 仓库" : "Push to a GitHub repository")}</li> <li class="svelte-zs40yn"><strong class="svelte-zs40yn">S3 / ${escape(zh ? "兼容存储" : "Compatible")}</strong> — ${escape(zh ? "推送到 Amazon S3 或任何 S3 兼容存储（Cloudflare R2、MinIO 等）" : "Push to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, etc.)")}</li></ul> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )}</section>  <section id="export" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-1iw8ez7">14</span> <h2 class="svelte-zs40yn">${escape(zh ? "数据导出" : "Export")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到已有的数据管道和报表系统。" : "Export usage data as CSV, JSON, or NDJSON for integration with existing data pipelines and reporting.")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
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
  )}</section>  <section id="widget" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-w6iw6w">15</span> <h2 class="svelte-zs40yn">${escape(zh ? "桌面小组件" : "Widget")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "AIUsage Widget 是一个 Electron 系统托盘应用，在系统托盘中显示 Token 用量摘要，无需打开浏览器即可快速查看。" : "AIUsage Widget is an Electron system tray app that shows token usage summaries in your system tray — no browser needed.")}</p> ${validate_component(CodeBlock, "CodeBlock").$$render(
    $$result,
    {
      lang: "Terminal",
      copyText: "npm install -g @juliantanx/aiusage-widget\naiusage-widget"
    },
    {},
    {
      lines: () => {
        return `<span slot="lines" data-svelte-h="svelte-1xa9ohv"><span>1</span><span>2</span></span>`;
      },
      default: () => {
        return `<span class="tk-kw" data-svelte-h="svelte-1ulrmys">npm</span> install -g <span class="tk-str" data-svelte-h="svelte-135vgkb">@juliantanx/aiusage-widget</span> <span class="tk-kw" data-svelte-h="svelte-1y64nf3">aiusage-widget</span>`;
      }
    }
  )} <p class="svelte-zs40yn">${escape(zh ? "Widget 读取与 CLI 相同的本地数据库，因此需要先运行 aiusage parse 解析数据。" : "Widget reads the same local database as the CLI, so you need to run aiusage parse first.")}</p></section>  <section id="cli" class="svelte-zs40yn"><div class="sec-head svelte-zs40yn"><span class="sec-idx svelte-zs40yn" data-svelte-h="svelte-oxw3ux">16</span> <h2 class="svelte-zs40yn">${escape(zh ? "CLI 命令参考" : "CLI Reference")}</h2></div> <p class="svelte-zs40yn">${escape(zh ? "所有 CLI 命令均通过 aiusage <command> 调用。不带子命令时等同于 aiusage summary。" : "All CLI commands are invoked as aiusage <command>. Running without a subcommand is equivalent to aiusage summary.")}</p></section> <section id="cli-parse" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-ros23b">parse</code> — ${escape(zh ? "解析日志" : "Parse Logs")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
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
  )}</section> <section id="cli-serve" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-13wwq9n">serve</code> — ${escape(zh ? "启动仪表盘" : "Start Dashboard")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
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
  )}</section> <section id="cli-summary" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-wc241e">summary</code> — ${escape(zh ? "终端摘要" : "Terminal Summary")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明"] : ["Option", "Description"],
      rows: [
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
  )}</section> <section id="cli-export" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-rj268m">export</code> — ${escape(zh ? "导出数据" : "Export Data")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明", "必填"] : ["Option", "Description", "Required"],
      rows: [
        ["<code>--format &lt;f&gt;</code>", "csv, json, ndjson", zh ? "是" : "Yes"],
        [
          "<code>-o, --output &lt;f&gt;</code>",
          zh ? "输出文件路径（默认 stdout）" : "Output file path (default: stdout)",
          zh ? "否" : "No"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-clean" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-1vcpuqx">clean</code> — ${escape(zh ? "清理旧数据" : "Clean Old Data")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["选项", "说明", "默认"] : ["Option", "Description", "Default"],
      rows: [
        [
          "<code>--before &lt;dur&gt;</code>",
          zh ? "删除此时间之前的数据（如 30d、180d）" : "Delete data older than this (e.g. 30d, 180d)",
          "<code>180d</code>"
        ]
      ]
    },
    {},
    {}
  )}</section> <section id="cli-reset" class="svelte-zs40yn"><h3 class="svelte-zs40yn"><code class="svelte-zs40yn" data-svelte-h="svelte-k3e17b">reset</code> — ${escape(zh ? "重置所有数据" : "Reset All Data")}</h3> <p class="svelte-zs40yn">${escape(zh ? "删除所有已解析的记录、工具调用、同步数据和水位线。原始日志文件不受影响。" : "Delete all parsed records, tool calls, synced data, and the parse watermark. Source log files are not affected.")}</p> ${validate_component(DocsTable, "DocsTable").$$render(
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
  )}</section> <section id="cli-other" class="svelte-zs40yn"><h3 class="svelte-zs40yn">${escape(zh ? "其他命令" : "Other Commands")}</h3> ${validate_component(DocsTable, "DocsTable").$$render(
    $$result,
    {
      headers: zh ? ["命令", "说明"] : ["Command", "Description"],
      rows: [
        [
          "<code>status</code>",
          zh ? "显示版本号、设备名称、数据库路径、schema 版本、记录数、数据库大小及同步状态" : "Show version, device name, DB path, schema version, record count, DB size, and sync status"
        ],
        [
          "<code>sync</code>",
          zh ? "与远程后端双向同步数据" : "Push and pull data with remote backend"
        ],
        [
          "<code>recalc</code>",
          zh ? "按最新定价重新计算费用" : "Recalculate costs with latest pricing"
        ],
        [
          "<code>init</code>",
          zh ? "配置同步后端（--backend, --repo, --token, --bucket, --endpoint 等）" : "Configure sync backend (--backend, --repo, --token, --bucket, --endpoint, etc.)"
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
