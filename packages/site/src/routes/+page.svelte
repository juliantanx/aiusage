<script>
  import { lang } from '$lib/lang'
  import { onMount } from 'svelte'

  $: zh = $lang === 'zh'

  // GitHub repo stats — fetched live; if the request fails the card still
  // renders, just without a number (no flaky shields.io dependency).
  let ghStats = { stars: null, forks: null, issues: null }
  const fmtCount = (n) =>
    n == null ? '' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)

  onMount(async () => {
    try {
      const res = await fetch('https://api.github.com/repos/juliantanx/aiusage')
      if (res.ok) {
        const d = await res.json()
        ghStats = { stars: d.stargazers_count, forks: d.forks_count, issues: d.open_issues_count }
      }
    } catch {
      /* leave nulls — card shows label only */
    }
  })

  onMount(() => {
    const els = document.querySelectorAll('.reveal')
    // Mark as JS-ready so CSS can hide them for animation
    els.forEach(el => el.classList.add('js-ready'))

    // Small delay so browser paints the hidden state before observing
    requestAnimationFrame(() => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed')
            observer.unobserve(e.target)
          }
        })
      }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' })

      els.forEach(el => observer.observe(el))
    })

    return () => { /* observer cleaned up by GC */ }
  })

  const tools = [
    { name: 'Claude Code', color: 'var(--accent)',  svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.37 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.291 5.946Z"/></svg>' },
    { name: 'Codex',       color: 'var(--blue)',    svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.12 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z"/></svg>' },
    { name: 'OpenClaw',    color: 'var(--purple)',  svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 8.5l-8-5-8 5v7l8 5 8-5v-7z" opacity=".7"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4.5 8.5l8 5 8-5M12.5 13.5v7"/></svg>' },
    { name: 'OpenCode',    color: 'var(--green)',   svg: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6L3 12l6 6"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 6l6 6-6 6"/></svg>' },
    { name: 'Hermes',      color: 'var(--amber)',   svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 9.5l-4.5 5M9.5 9.5L15 15"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>' },
    { name: 'Qoder',       color: 'var(--rose)',    svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" opacity=".1"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3M13 15h3"/></svg>' },
    { name: 'Cursor',      color: 'var(--blue)',    svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/></svg>' },
    { name: 'Copilot',     color: 'var(--green)',   svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"/></svg>' },
    { name: 'KiloCode',    color: 'var(--purple)',  svg: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6L3 12l6 6M15 6l6 6-6 6"/></svg>' },
    { name: 'Kelivo',      color: 'var(--rose)',    svg: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3" fill="currentColor" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5"/></svg>' },
    { name: 'Gemini CLI',  color: 'var(--blue)',    svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/></svg>' },
    { name: 'Kimi Code',   color: 'var(--accent)',  svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".1"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 9l3 3 3-3M9 15l3-3 3 3"/></svg>' },
    { name: 'CodeBuddy',   color: 'var(--green)',   svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="currentColor" opacity=".15"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M16 7l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" opacity=".5"/></svg>' },
    { name: 'Kiro',        color: 'var(--amber)',   svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.763 10.036q.002.446.088.71c.064.176.144.368.256.576c.04.063.056.127.056.183q.002.12-.152.24l-.503.335a.4.4 0 0 1-.208.072q-.12-.002-.239-.112a2.5 2.5 0 0 1-.287-.375a6 6 0 0 1-.248-.471q-.934 1.101-2.347 1.101c-.67 0-1.205-.191-1.596-.574q-.588-.575-.59-1.533c0-.678.239-1.23.726-1.644c.487-.415 1.133-.623 1.955-.623c.272 0 .551.024.846.064c.296.04.6.104.918.176v-.583q-.001-.909-.375-1.277c-.255-.248-.686-.367-1.3-.367c-.28 0-.568.031-.863.103q-.443.106-.862.272a2 2 0 0 1-.28.104a.5.5 0 0 1-.127.023q-.168.002-.168-.247v-.391c0-.128.016-.224.056-.28a.6.6 0 0 1 .224-.167a4.6 4.6 0 0 1 1.005-.36a4.8 4.8 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647q.66.645.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144a1.8 1.8 0 0 0 .758-.51a1.3 1.3 0 0 0 .272-.512c.047-.191.08-.423.08-.694v-.335a7 7 0 0 0-.735-.136a6 6 0 0 0-.75-.048c-.535 0-.926.104-1.19.32c-.263.215-.39.518-.39.917c0 .375.095.655.295.846c.191.2.47.296.838.296m6.41.862c-.144 0-.24-.024-.304-.08c-.064-.048-.12-.16-.168-.311L7.586 5.55a1.4 1.4 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783q.227-.001.31.08c.065.048.113.16.16.312l1.342 5.284l1.245-5.284q.058-.24.151-.312a.55.55 0 0 1 .32-.08h.638c.152 0 .256.025.32.08c.063.048.12.16.151.312l1.261 5.348l1.381-5.348q.074-.24.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2c0 .04-.009.08-.017.128a1 1 0 0 1-.056.2l-1.923 6.17q-.072.24-.168.311a.5.5 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08c-.063-.056-.119-.16-.15-.32l-1.238-5.148l-1.23 5.14c-.04.16-.087.264-.15.32c-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143c-.399-.096-.71-.2-.918-.32c-.128-.071-.215-.151-.247-.223a.6.6 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247q.072 0 .144.024c.048.016.12.048.2.08q.408.181.878.279c.319.064.63.096.95.096c.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758a.78.78 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.9 1.9 0 0 1-.4-1.158q0-.502.216-.886c.144-.255.335-.479.575-.654c.24-.184.51-.32.83-.415c.32-.096.655-.136 1.006-.136c.175 0 .359.008.535.032c.183.024.35.056.518.088q.24.058.455.127q.216.072.336.144a.7.7 0 0 1 .24.2a.43.43 0 0 1 .071.263v.375q-.002.254-.184.256a.8.8 0 0 1-.303-.096a3.65 3.65 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223s-.375.383-.375.71c0 .224.08.416.24.567c.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767s.367.702.367 1.117c0 .343-.072.655-.207.926a2.2 2.2 0 0 1-.583.703c-.248.2-.543.343-.886.447c-.36.111-.734.167-1.142.167m1.509 3.88c-2.626 1.94-6.442 2.969-9.722 2.969c-4.598 0-8.74-1.7-11.87-4.526c-.247-.223-.024-.527.272-.351c3.384 1.963 7.559 3.153 11.877 3.153c2.914 0 6.114-.607 9.06-1.852c.439-.2.814.287.383.607m1.094-1.246c-.336-.43-2.22-.207-3.074-.103c-.255.032-.295-.192-.063-.36c1.5-1.053 3.967-.75 4.254-.399c.287.36-.08 2.826-1.485 4.007c-.215.184-.423.088-.327-.151c.32-.79 1.03-2.57.695-2.994"/></svg>' },
    { name: 'Grok Build',  color: 'var(--rose)',    svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M.045 18.02q.107-.174.348-.022q5.455 3.165 11.87 3.166q4.278-.001 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13c.226-.088.39-.046.525.13c.12.174.09.336-.12.48c-.256.19-.6.41-1.006.654q-1.867 1.113-4.185 1.726a17.6 17.6 0 0 1-10.951-.577a17.9 17.9 0 0 1-5.43-3.35q-.15-.113-.151-.22c0-.047.021-.09.051-.13zm6.565-6.218q0-1.507.743-2.577c.495-.71 1.17-1.25 2.04-1.615c.796-.335 1.756-.575 2.912-.72c.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875c-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46c-.35.27-.575.63-.675 1.096c-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39c0-.046.007-.09.022-.15q.372-1.935 1.82-2.88c.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29c.135.15.27.3.405.48c.12.165.224.314.283.45c.075.134.15.33.195.57c.06.254.105.42.135.51c.03.104.062.3.076.615c.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036q.157.471.315.674l.51.674q.136.204.136.36q0 .181-.18.314c-1.2 1.05-1.86 1.62-1.963 1.71q-.247.203-.63.045a6 6 0 0 1-.526-.496l-.31-.347a9 9 0 0 1-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665c-.494.15-1.093.227-1.83.227c-1.11 0-2.04-.343-2.76-1.034c-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438q-.001.848.425 1.364c.285.34.675.512 1.155.512c.045 0 .106-.007.195-.02c.09-.016.134-.023.166-.023c.614-.16 1.08-.553 1.424-1.178c.165-.28.285-.58.36-.91c.09-.32.12-.59.135-.8c.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18c-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17q.544-.365 1.05-.5a8 8 0 0 1 1.612-.24c.14-.012.28 0 .41.03c.65.06 1.05.168 1.172.33c.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8q-.418 1.034-1.156 1.68q-.11.09-.197.09c-.03 0-.06 0-.09-.012c-.09-.044-.107-.12-.064-.24c.54-1.26.806-2.143.806-2.64c0-.15-.03-.27-.087-.344c-.145-.166-.55-.257-1.224-.257q-.364 0-.87.046c-.363.045-.7.09-1 .135q-.134 0-.18-.044c-.03-.03-.036-.047-.02-.077c0-.017.006-.03.02-.063v-.06z"/></svg>' },
    { name: 'Antigravity',  color: 'var(--purple)', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".08"/><path fill="none" stroke="currentColor" stroke-width="2" d="M12 3v18"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18" opacity=".5"/></svg>' },
    { name: 'Roo Code',    color: 'var(--green)',   svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".1"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 15c1 1.5 2.5 2 4 2s3-.5 4-2"/><circle cx="8.5" cy="9.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="9.5" r="1.2" fill="currentColor"/></svg>' },
    { name: 'Zed',         color: 'var(--blue)',    svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.25 1.5a.75.75 0 0 0-.75.75v16.5H0V2.25A2.25 2.25 0 0 1 2.25 0h20.095c1.002 0 1.504 1.212.795 1.92L10.764 14.298h3.486V12.75h1.5v1.922a1.125 1.125 0 0 1-1.125 1.125H9.264l-2.578 2.578h11.689V9h1.5v9.375a1.5 1.5 0 0 1-1.5 1.5H5.185L2.562 22.5H21.75a.75.75 0 0 0 .75-.75V5.25H24v16.5A2.25 2.25 0 0 1 21.75 24H1.655C.653 24 .151 22.788.86 22.08L13.19 9.75H9.75v1.5h-1.5V9.375A1.125 1.125 0 0 1 9.375 8.25h5.314l2.625-2.625H5.625V15h-1.5V5.625a1.5 1.5 0 0 1 1.5-1.5h13.19L21.438 1.5z"/></svg>' },
    { name: 'Goose',       color: 'var(--amber)',   svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 4c-2 0-4 2-4 4 0 1.5.8 2.8 2 3.5C5 13 4 15 4 17c0 2.5 2.5 3 4 3h8c1.5 0 4-.5 4-3 0-2-1-4-2-5.5 1.2-.7 2-2 2-3.5 0-2-2-4-4-4-1.5 0-2.8.8-3.5 2C11.8 4.8 10.5 4 8 4z" opacity=".2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M8 4c-2 0-4 2-4 4 0 1.5.8 2.8 2 3.5C5 13 4 15 4 17c0 2.5 2.5 3 4 3h8c1.5 0 4-.5 4-3 0-2-1-4-2-5.5 1.2-.7 2-2 2-3.5 0-2-2-4-4-4-1.5 0-2.8.8-3.5 2C11.8 4.8 10.5 4 8 4z"/><circle cx="9.5" cy="9" r="1" fill="currentColor"/><circle cx="14.5" cy="9" r="1" fill="currentColor"/></svg>' },
    { name: 'oh-my-pi',    color: 'var(--accent)',  svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".1"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 16.5c0-5 2-10 4-10s4 5 4 10"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 8h6"/></svg>' },
    { name: 'pi',          color: 'var(--rose)',    svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M7 8h8"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 8v10M15 8c1 3 2 6 2 8"/></svg>' },
    { name: 'Craft',       color: 'var(--purple)',  svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7v10l10 5 10-5V7L12 2z" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2L2 7v10l10 5 10-5V7L12 2z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M2 7l10 5 10-5M12 12v10"/></svg>' },
    { name: 'Droid',       color: 'var(--green)',   svg: '<svg viewBox="0 0 24 24"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity=".12"/><path fill="none" stroke="currentColor" stroke-width="2" d="M6 10h12M6 14h12M6 18h12M9 8V6a3 3 0 0 1 6 0v2"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/></svg>' },
    { name: 'ZCode',       color: 'var(--amber)',   svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18v2H6.5L21 18v2H3v-2h14.5L3 6V4z" opacity=".8"/></svg>' },
  ]

  const features = [
    {
      id: 'tokens', icon: '◇', color: 'var(--accent)',
      zhTitle: 'Token 用量追踪', enTitle: 'Token Usage Tracking',
      zhDesc: '每日柱状图展示输入、输出、缓存读写、思考 Token 的消耗趋势。按类型分项统计，精确到每一次 API 调用。',
      enDesc: 'Daily bar charts showing input, output, cache read/write, and thinking token consumption. Precise to every API call.',
    },
    {
      id: 'cost', icon: '$', color: 'var(--green)',
      zhTitle: '费用估算与分析', enTitle: 'Cost Estimation & Analysis',
      zhDesc: '基于可配置的定价表自动计算费用。按 AI 工具、模型、项目维度分析开支，告别账单惊喜。',
      enDesc: 'Automatic cost calculation from configurable pricing. Analyze spend by tool, model, and project. No billing surprises.',
    },
    {
      id: 'models', icon: '◆', color: 'var(--purple)',
      zhTitle: '模型使用排名', enTitle: 'Model Usage Ranking',
      zhDesc: '哪些模型被频繁调用？每个模型消耗了多少 Token？一目了然的排名表，帮你优化模型选择策略。',
      enDesc: 'Which models are called most? How many tokens each? Clear ranking tables help optimize model selection.',
    },
    {
      id: 'tools', icon: '⚡', color: 'var(--amber)',
      zhTitle: '工具调用分析', enTitle: 'Tool Call Analytics',
      zhDesc: 'AI 助手最常执行什么操作？Bash、Read、Edit 的调用频次排名，揭示 AI 的工作模式。',
      enDesc: 'What operations does AI perform most? Bash, Read, Edit frequency rankings reveal work patterns.',
    },
    {
      id: 'projects', icon: '◎', color: 'var(--blue)',
      zhTitle: '项目维度统计', enTitle: 'Project-Level Stats',
      zhDesc: '按代码仓库分组统计用量和费用。哪个项目消耗最多资源？数据驱动的资源分配决策。',
      enDesc: 'Usage and cost grouped by repository. Which project consumes the most? Data-driven allocation.',
    },
    {
      id: 'quotas', icon: '▣', color: 'var(--rose)',
      zhTitle: '配额监控', enTitle: 'Quota Monitoring',
      zhDesc: '实时监控 Claude Code、Codex、Copilot 等工具的速率限制配额。查看使用率百分比和重置倒计时。',
      enDesc: 'Real-time rate limit quota monitoring for Claude Code, Codex, Copilot, and more. View utilization and reset countdowns.',
    },
    {
      id: 'sync', icon: '⇅', color: 'var(--green)',
      zhTitle: '多设备同步', enTitle: 'Multi-Device Sync',
      zhDesc: '通过 GitHub 或 S3 兼容存储在多台设备之间同步用量数据。办公室、家里、出差，数据始终一致。',
      enDesc: 'Sync across devices via GitHub or S3-compatible storage. Office, home, travel — data always consistent.',
    },
    {
      id: 'export', icon: '↗', color: 'var(--purple)',
      zhTitle: '数据导出', enTitle: 'Data Export',
      zhDesc: '将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到你已有的数据管道和报表系统。',
      enDesc: 'Export usage data as CSV, JSON, or NDJSON for integration with your existing data pipelines and reporting.',
    },
  ]

  let copied = false
  function copyInstall() {
    navigator.clipboard.writeText('npm install -g @juliantanx/aiusage').then(() => {
      copied = true
      setTimeout(() => copied = false, 2000)
    })
  }
</script>

<svelte:head>
  <!-- WebSite Schema with SearchAction for sitelinks -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AIUsage',
    alternateName: 'AIUsage — AI Coding Usage Analytics',
    url: 'https://aiusage.jtanx.com/',
    inLanguage: zh ? 'zh-CN' : 'en',
    description: zh
      ? '追踪 Claude Code、Codex、Copilot、Cursor 等 AI 编程工具的 Token 用量、费用和使用模式。'
      : 'Track token consumption, costs, and usage patterns across Claude Code, Codex, Copilot, Cursor, and more.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://aiusage.jtanx.com/docs?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  })}</script>`}

  <!-- FAQ Schema for rich results -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: zh ? 'AIUsage 是什么？' : 'What is AIUsage?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? 'AIUsage 是一个本地优先的 AI 工具用量分析平台，支持追踪 Claude Code、Codex、Copilot、Cursor、Kelivo 等 20+ 种 AI 工具的 Token 用量、费用和使用模式。数据存储在本地，不经过任何第三方服务器。'
            : 'AIUsage is a local-first AI usage analytics platform that tracks token consumption, costs, and usage patterns across 20+ AI tools including Claude Code, Codex, Copilot, Cursor, and Kelivo. Data stays on your machine — no third-party servers.'
        }
      },
      {
        '@type': 'Question',
        name: zh ? 'AIUsage 支持哪些 AI 工具？' : 'Which AI tools does AIUsage support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? 'AIUsage 支持 20+ 种 AI 工具：Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor、Copilot、KiloCode、Kelivo、Gemini CLI、Kimi Code、CodeBuddy、Kiro、Grok Build、Antigravity、Roo Code、Zed、ZCode、Goose、oh-my-pi、pi、Craft、Droid。'
            : 'AIUsage supports 20+ AI tools: Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, Cursor, Copilot, KiloCode, Kelivo, Gemini CLI, Kimi Code, CodeBuddy, Kiro, Grok Build, Antigravity, Roo Code, Zed, ZCode, Goose, oh-my-pi, pi, Craft, and Droid.'
        }
      },
      {
        '@type': 'Question',
        name: zh ? 'AIUsage 是免费的吗？' : 'Is AIUsage free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? '是的，AIUsage 是完全免费的开源项目，采用 MIT 许可证。'
            : 'Yes, AIUsage is completely free and open source under the MIT license.'
        }
      },
      {
        '@type': 'Question',
        name: zh ? '如何安装 AIUsage？' : 'How to install AIUsage?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? '通过 npm 全局安装：npm install -g @juliantanx/aiusage，然后运行 aiusage serve 启动仪表盘（会自动解析数据）。'
            : 'Install globally via npm: npm install -g @juliantanx/aiusage, then run aiusage serve to start the dashboard (data is parsed automatically).'
        }
      },
      {
        '@type': 'Question',
        name: zh ? 'AIUsage 的数据存储在哪里？' : 'Where does AIUsage store data?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? '所有数据存储在本地的 SQLite 数据库中，不会上传到任何云端服务器。支持通过 GitHub 或 S3 兼容存储进行可选的多设备同步。'
            : 'All data is stored in a local SQLite database and never uploaded to any cloud server. Optional multi-device sync is available via GitHub or S3-compatible storage.'
        }
      }
    ]
  })}</script>`}
</svelte:head>

<!-- ═══════ HERO ═══════ -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <div class="hero-label">
        {zh ? '本地优先 · 隐私至上' : 'Local-first · Privacy-respecting'}
      </div>
      <h1 class="hero-headline">
        {zh
          ? '你的 AI 编程工具，究竟花了多少钱？'
          : 'How much are your AI coding tools actually costing you?'}
      </h1>
      <p class="hero-sub">
        {zh
          ? 'AIUsage 追踪 Claude Code、Codex、Copilot、Cursor、Kelivo 等 20+ 种 AI 工具的 Token 用量和费用。数据存储在本地，不经过任何第三方服务器。'
          : 'AIUsage tracks token consumption and costs across 20+ AI tools. Data stays on your machine — no third-party servers.'}
      </p>
      <div class="hero-install">
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">Terminal</span>
            <button class="copy-btn" on:click={copyInstall}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre><code><span class="tk-cmt">{zh ? '# 安装并启动' : '# Install & start'}</span>
<span class="tk-kw">npm</span> install -g <span class="tk-str">@juliantanx/aiusage</span>
<span class="tk-kw">aiusage</span> serve</code></pre>
        </div>
      </div>
      <div class="hero-actions">
        <a href="/docs" class="btn-primary">{zh ? '阅读文档' : 'Read the Docs'}</a>
        <a href="https://github.com/juliantanx/aiusage" class="btn-ghost" target="_blank" rel="noopener">GitHub</a>
        <a href="https://hub.docker.com/r/juliantanx/aiusage" class="btn-ghost" target="_blank" rel="noopener">Docker</a>
      </div>
    </div>
    <div class="hero-visual">
      <div class="dash-preview">
        <div class="dash-header">
          <span class="dash-dot"></span><span class="dash-dot"></span><span class="dash-dot"></span>
          <span class="dash-url">localhost:3847</span>
        </div>
        <div class="dash-body">
          <div class="dash-counter">
            <div class="counter-value">12,847,392</div>
            <div class="counter-label">{zh ? '总 Token 数' : 'Total Tokens'}</div>
          </div>
          <div class="dash-sub-stats">
            <div class="sub-stat"><span class="sub-val" style="color:var(--accent)">4.2M</span><span class="sub-label">{zh ? '输入' : 'Input'}</span></div>
            <div class="sub-stat"><span class="sub-val" style="color:var(--blue)">3.1M</span><span class="sub-label">{zh ? '输出' : 'Output'}</span></div>
            <div class="sub-stat"><span class="sub-val" style="color:var(--amber)">5.5M</span><span class="sub-label">{zh ? '缓存' : 'Cache'}</span></div>
          </div>
          <div class="dash-bar">
            <div class="bar-seg" style="width:33%;background:var(--accent)"></div>
            <div class="bar-seg" style="width:24%;background:var(--blue)"></div>
            <div class="bar-seg" style="width:43%;background:var(--amber)"></div>
          </div>
          <div class="dash-chart">
            {#each [65,45,80,55,90,70,85,50,75,95,60,88] as h, i}
              <div class="chart-bar" style="height:{h}%;animation-delay:{i*60}ms"></div>
            {/each}
          </div>
          <div class="dash-cards">
            <div class="dash-card"><span class="card-val" style="color:var(--green)">$47.20</span><span class="card-label">{zh ? '总费用' : 'Total Cost'}</span></div>
            <div class="dash-card"><span class="card-val">156</span><span class="card-label">{zh ? '会话数' : 'Sessions'}</span></div>
            <div class="dash-card"><span class="card-val">23</span><span class="card-label">{zh ? '活跃天数' : 'Active Days'}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ TOOLS STRIP ═══════ -->
<section class="tools-section">
  <div class="section-inner">
    <p class="tools-label">{zh ? '支持 20+ 种 AI 工具' : 'Supports 20+ AI tools'}</p>
    <div class="tools-strip">
      {#each tools as tool}
        <div class="tool-chip">
          <span class="tool-icon" style="color:{tool.color}">{@html tool.svg}</span>
          <span class="tool-name">{tool.name}</span>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ═══════ FEATURES ═══════ -->
<section class="features-section reveal">
  <div class="section-inner">
    <div class="section-header">
      <h2>{zh ? '你需要的所有数据，都在一个仪表盘里' : 'All the data you need, in one dashboard'}</h2>
      <p>{zh
        ? '不用在多个工具之间来回切换。AIUsage 将所有 AI 编程工具的用量数据聚合到一起。'
        : 'Stop switching between tools. AIUsage aggregates usage data from all your AI coding tools in one place.'}</p>
    </div>
    <div class="features-grid">
      {#each features as f}
        <div class="feature-card">
          <div class="feature-icon" style="color:{f.color}">{f.icon}</div>
          <h3>{zh ? f.zhTitle : f.enTitle}</h3>
          <p>{zh ? f.zhDesc : f.enDesc}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ═══════ HOW IT WORKS ═══════ -->
<section class="how-section reveal">
  <div class="section-inner">
    <div class="section-header">
      <h2>{zh ? '工作原理' : 'How It Works'}</h2>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">01</div>
        <h3>{zh ? '安装 CLI 工具' : 'Install the CLI'}</h3>
        <p>{zh ? '通过 npm 或 pnpm 全局安装 AIUsage。轻量的命令行工具，不常驻后台。' : 'Install globally via npm or pnpm. Lightweight CLI, no background daemon.'}</p>
      </div>
      <div class="step-connector"></div>
      <div class="step">
        <div class="step-num">02</div>
        <h3>{zh ? '启动仪表盘' : 'Start the Dashboard'}</h3>
        <p>{zh ? '运行 aiusage serve，自动解析日志并启动 Web 仪表盘，所有数据一目了然。' : 'Run aiusage serve to auto-parse logs and start the web dashboard — all data at a glance.'}</p>
      </div>
      <div class="step-connector"></div>
      <div class="step">
        <div class="step-num">03</div>
        <h3>{zh ? '查看数据' : 'View Your Data'}</h3>
        <p>{zh ? '浏览器打开 localhost:3847，查看 token 用量、费用明细和会话历史。' : 'Open localhost:3847 to explore token usage, cost breakdowns, and session history.'}</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ WHY LOCAL-FIRST ═══════ -->
<section class="why-section reveal">
  <div class="section-inner">
    <div class="why-grid">
      <div class="why-left">
        <h2 class="section-label">{zh ? '为什么选择本地优先？' : 'Why Local-First?'}</h2>
      </div>
      <div class="why-right">
        <div class="why-point">
          <span class="pt-icon" style="color:var(--accent)">●</span>
          <div>
            <strong>{zh ? '数据不出本机' : 'Data Never Leaves Your Machine'}</strong>
            <p>{zh ? '所有日志解析和数据存储都在本地完成。SQLite 数据库文件就在你的硬盘上。' : 'All parsing and storage happens locally. The SQLite database lives on your disk.'}</p>
          </div>
        </div>
        <div class="why-point">
          <span class="pt-icon" style="color:var(--green)">●</span>
          <div>
            <strong>{zh ? '零依赖服务' : 'Zero Server Dependencies'}</strong>
            <p>{zh ? '不需要注册账号，不需要 API Key，不需要云服务。装好就能用。' : 'No accounts, no API keys, no cloud services. Install and use immediately.'}</p>
          </div>
        </div>
        <div class="why-point">
          <span class="pt-icon" style="color:var(--blue)">●</span>
          <div>
            <strong>{zh ? '可选的多设备同步' : 'Optional Multi-Device Sync'}</strong>
            <p>{zh ? '通过你自己的 GitHub 仓库或 S3 存储同步，数据始终在你的控制下。' : 'Sync via your own GitHub repo or S3 storage — data always under your control.'}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ QUICK START ═══════ -->
<section class="quickstart-section reveal">
  <div class="section-inner">
    <div class="qs-grid">
      <div class="qs-steps">
        <h2>{zh ? '快速开始' : 'Quick Start'}</h2>
        <p class="qs-intro">{zh ? '三个命令，五分钟内完成部署。' : 'Three commands. Up and running in five minutes.'}</p>
        <div class="qs-step">
          <div class="qs-num">01</div>
          <div class="qs-detail">
            <strong>{zh ? '全局安装 CLI' : 'Install the CLI'}</strong>
            <p>{zh ? '通过 npm 或 pnpm 全局安装，无后台进程。' : 'Install globally via npm or pnpm. No background daemon.'}</p>
          </div>
        </div>
        <div class="qs-step">
          <div class="qs-num">02</div>
          <div class="qs-detail">
            <strong>{zh ? '解析 AI 工具日志' : 'Parse AI tool logs'}</strong>
            <p>{zh ? '自动发现本地日志文件，解析写入 SQLite 数据库。' : 'Auto-discovers local log files and writes to SQLite.'}</p>
          </div>
        </div>
        <div class="qs-step">
          <div class="qs-num">03</div>
          <div class="qs-detail">
            <strong>{zh ? '打开仪表盘' : 'Open the dashboard'}</strong>
            <p>{zh ? '启动本地 Web 服务，浏览器访问即可查看所有数据。' : 'Start a local web server and open it in your browser.'}</p>
          </div>
        </div>
        <a href="/docs#getting-started" class="qs-docs-link">{zh ? '阅读完整文档 →' : 'Read the full docs →'}</a>
      </div>
      <div class="qs-terminal">
        <div class="terminal">
          <div class="term-bar">
            <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
            <span class="term-title">Terminal</span>
          </div>
          <div class="term-body">
            <div class="tl"><span class="tp">$</span><span class="tc">npm install -g @juliantanx/aiusage</span></div>
            <div class="to">+ @juliantanx/aiusage@1.3.1</div>
            <div class="tl"><span class="tp">$</span><span class="tc">aiusage serve</span></div>
            <div class="to">{zh ? '✓ 自动解析完成，仪表盘已启动: http://localhost:3847' : '✓ Auto-parse complete, dashboard running: http://localhost:3847'}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ DOCKER ═══════ -->
<section class="docker-section reveal">
  <div class="section-inner">
    <div class="docker-grid">
      <div class="docker-text">
        <h2 class="section-label">Docker</h2>
        <p class="docker-desc">{zh
          ? '一行命令启动 AIUsage。官方 Docker 镜像包含 CLI 和 Web 仪表盘，支持挂载卷持久化数据。'
          : 'Start AIUsage with one command. Official Docker image includes CLI and web dashboard with volume-mounted data persistence.'}</p>
        <div class="docker-links">
          <a href="https://hub.docker.com/r/juliantanx/aiusage" class="btn-ghost" target="_blank" rel="noopener">Docker Hub</a>
        </div>
      </div>
      <div class="docker-code">
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">Terminal</span>
            <button class="copy-btn" on:click={() => {
              navigator.clipboard.writeText('docker run -d -p 3847:3847 -v ~/.aiusage:/root/.aiusage juliantanx/aiusage')
              copied = true; setTimeout(() => copied = false, 2000)
            }}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          <pre><code><span class="tk-cmt">{zh ? '# 使用 Docker 运行' : '# Run with Docker'}</span>
<span class="tk-kw">docker</span> run -d \
  -p 3847:3847 \
  -v ~/.aiusage:/root/.aiusage \
  juliantanx/aiusage</code></pre>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ CLI HIGHLIGHTS ═══════ -->
<section class="cli-section reveal">
  <div class="section-inner">
    <div class="section-header">
      <h2>{zh ? 'CLI 命令一览' : 'CLI Commands at a Glance'}</h2>
    </div>
    <div class="cli-grid">
      <a href="/docs#cli-parse" class="cli-item">
        <div><code>aiusage parse</code><p>{zh ? '手动解析 AI 工具的日志文件' : 'Manually parse log files from AI tools'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
      <a href="/docs#cli-serve" class="cli-item">
        <div><code>aiusage serve</code><p>{zh ? '启动本地 Web 仪表盘' : 'Start the local web dashboard'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
      <a href="/docs#cli-summary" class="cli-item">
        <div><code>aiusage summary</code><p>{zh ? '在终端查看用量摘要' : 'View usage summary in terminal'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
      <a href="/docs#cli-export" class="cli-item">
        <div><code>aiusage export</code><p>{zh ? '导出为 CSV / JSON / NDJSON' : 'Export as CSV / JSON / NDJSON'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
      <a href="/docs#sync" class="cli-item">
        <div><code>aiusage sync</code><p>{zh ? '与远程后端双向同步数据' : 'Push and pull data with remote backend'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
      <a href="/docs#cli-other" class="cli-item">
        <div><code>aiusage status</code><p>{zh ? '查看版本、数据库状态等信息' : 'View version, DB status, and more'}</p></div>
        <span class="cli-arrow">→</span>
      </a>
    </div>
  </div>
</section>

<!-- ═══════ CONTRIBUTE ═══════ -->
<section class="contribute-section reveal">
  <div class="section-inner">
    <div class="contribute-grid">
      <div>
        <h2 class="section-label">{zh ? '参与贡献' : 'Contribute'}</h2>
        <p class="contribute-desc">{zh
          ? 'AIUsage 是一个开源项目，欢迎任何形式的贡献。提交 Issue、发起 PR、改进文档，或者分享你的使用体验。'
          : 'AIUsage is open source. Contributions of any kind are welcome — submit issues, open PRs, improve docs, or share your experience.'}</p>
        <div class="contribute-links">
          <a href="https://github.com/juliantanx/aiusage/issues" class="btn-ghost" target="_blank" rel="noopener">{zh ? '提交 Issue' : 'Open an Issue'}</a>
          <a href="https://github.com/juliantanx/aiusage/pulls" class="btn-ghost" target="_blank" rel="noopener">{zh ? '发起 PR' : 'Open a PR'}</a>
        </div>
      </div>
      <div class="contribute-stats">
        <a class="stat-card" href="https://github.com/juliantanx/aiusage" target="_blank" rel="noopener" aria-label="GitHub stars">
          <span class="stat-value">{fmtCount(ghStats.stars)}</span>
          <span class="stat-label">Stars</span>
        </a>
        <a class="stat-card" href="https://github.com/juliantanx/aiusage/fork" target="_blank" rel="noopener" aria-label="GitHub forks">
          <span class="stat-value">{fmtCount(ghStats.forks)}</span>
          <span class="stat-label">Forks</span>
        </a>
        <a class="stat-card" href="https://github.com/juliantanx/aiusage/issues" target="_blank" rel="noopener" aria-label="GitHub issues">
          <span class="stat-value">{fmtCount(ghStats.issues)}</span>
          <span class="stat-label">Issues</span>
        </a>
      </div>
    </div>
  </div>
</section>

<!-- ═══════ CTA ═══════ -->
<section class="cta-section">
  <div class="section-inner">
    <h2>{zh ? '开始追踪你的 AI 编程开销' : 'Start tracking your AI coding spend'}</h2>
    <p>{zh ? '开源、免费、本地优先。五分钟内即可完成部署。' : 'Open source, free, and local-first. Up and running in five minutes.'}</p>
    <div class="cta-actions">
      <a href="/docs" class="btn-primary">{zh ? '阅读文档' : 'Read the Docs'}</a>
      <a href="https://github.com/juliantanx/aiusage" class="btn-ghost" target="_blank" rel="noopener">{zh ? '在 GitHub 上查看' : 'View on GitHub'}</a>
      <a href="https://hub.docker.com/r/juliantanx/aiusage" class="btn-ghost" target="_blank" rel="noopener">Docker Hub</a>
    </div>
  </div>
</section>

<style>
  /* ── Shared ──────────────────────────────────────────────────────────────── */
  .reveal { opacity: 1; transform: translateY(0); }
  :global(.reveal.js-ready) { opacity: 0; transform: translateY(20px); transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1); }
  :global(.reveal.js-ready.revealed) { opacity: 1; transform: translateY(0); }
  .section-inner { width: var(--content-width); margin: 0 auto; }
  .section-label {
    font-size: 1.75rem; font-weight: 700; letter-spacing: -0.025em;
    color: var(--text); margin-bottom: 1.25rem; line-height: 1.2;
  }
  .section-header { text-align: center; margin-bottom: 2rem; }
  .section-header h2 {
    font-size: clamp(1.5rem, 2.8vw, 2rem); font-weight: 700; letter-spacing: -0.025em;
    color: var(--text); margin-bottom: 0.75rem;
  }
  .section-header p { font-size: 1rem; color: var(--text-secondary); max-width: 620px; margin: 0 auto; line-height: 1.65; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; font-weight: 600;
    color: oklch(0.99 0.002 85); background: var(--accent); text-decoration: none;
    padding: 0.65rem 1.5rem; border-radius: 8px; transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: 0 4px 12px oklch(0.52 0.14 165 / 0.2); }
  .btn-ghost {
    display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; font-weight: 600;
    color: var(--text-secondary); text-decoration: none; padding: 0.65rem 1.5rem; border-radius: 8px;
    border: 1px solid var(--border-medium); transition: color 0.15s, border-color 0.15s, transform 0.15s;
  }
  .btn-ghost:hover { color: var(--text); border-color: var(--text-muted); transform: translateY(-1px); }

  /* ── Code block ──────────────────────────────────────────────────────────── */
  .code-block { border-radius: 10px; overflow: hidden; border: 1px solid oklch(0.23 0.015 85); }
  .code-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.5rem 1rem; background: oklch(0.19 0.013 85); border-bottom: 1px solid oklch(0.23 0.015 85);
  }
  .code-lang { font-family: var(--mono); font-size: 0.75rem; color: oklch(0.5 0.01 85); }
  .copy-btn {
    font-family: var(--mono); font-size: 0.75rem; font-weight: 600; color: oklch(0.6 0.01 85);
    background: transparent; border: 1px solid oklch(0.3 0.01 85); border-radius: 4px;
    padding: 0.25rem 0.6rem; cursor: pointer; transition: color 0.15s, border-color 0.15s;
  }
  .copy-btn:hover { color: oklch(0.8 0.01 85); border-color: oklch(0.5 0.01 85); }
  .code-block pre { margin: 0; border: none; border-radius: 0; }
  .tk-cmt { color: oklch(0.5 0.01 85); }
  .tk-kw { color: oklch(0.68 0.14 300); }
  .tk-str { color: oklch(0.68 0.16 155); }

  /* ── Hero ────────────────────────────────────────────────────────────────── */
  .hero {
    padding: 4rem 0 3rem;
    background:
      radial-gradient(ellipse 80% 50% at 70% 40%, oklch(0.52 0.14 165 / 0.04), transparent),
      radial-gradient(ellipse 60% 40% at 20% 60%, oklch(0.52 0.16 250 / 0.03), transparent);
  }
  .hero-inner { width: var(--content-width); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 3.5rem; align-items: center; }
  .hero-label {
    font-family: var(--mono); font-size: 0.8125rem; font-weight: 550;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin-bottom: 1.25rem;
  }
  .hero-headline {
    font-size: clamp(2rem, 4vw, 2.75rem); font-weight: 700; letter-spacing: -0.03em;
    color: var(--text); line-height: 1.12; margin-bottom: 1.25rem;
  }
  .hero-sub { font-size: 1.0625rem; color: var(--text-secondary); line-height: 1.65; max-width: 560px; margin-bottom: 2rem; }
  .hero-install { margin-bottom: 2rem; }
  .hero-actions { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }

  /* ── Dashboard preview ───────────────────────────────────────────────────── */
  .hero-visual { display: flex; justify-content: center; }
  .dash-preview {
    width: 100%; max-width: 520px; background: var(--surface); border-radius: 12px;
    border: 1px solid var(--border-subtle); box-shadow: var(--shadow-lg); overflow: hidden;
    transform: perspective(1000px) rotateY(-3deg) rotateX(1deg);
    transition: transform 0.5s cubic-bezier(0.16,1,0.3,1);
  }
  .dash-preview:hover { transform: perspective(1000px) rotateY(0deg) rotateX(0deg); }
  .dash-header {
    display: flex; align-items: center; gap: 0.375rem; padding: 0.625rem 0.875rem;
    background: var(--raised); border-bottom: 1px solid var(--border-subtle);
  }
  .dash-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border-medium); }
  .dash-dot:first-child { background: oklch(0.65 0.18 25); }
  .dash-dot:nth-child(2) { background: oklch(0.72 0.15 85); }
  .dash-dot:nth-child(3) { background: oklch(0.65 0.17 155); }
  .dash-url { font-family: var(--mono); font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem; }
  .dash-body { padding: 1.25rem; }
  .dash-counter { text-align: center; margin-bottom: 1rem; }
  .counter-value {
    font-family: var(--mono); font-size: 2.25rem; font-weight: 700; color: var(--text);
    letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
  }
  .counter-label {
    font-family: var(--mono); font-size: 0.6875rem; font-weight: 550; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-muted); margin-top: 0.25rem;
  }
  .dash-sub-stats { display: flex; justify-content: center; gap: 1.5rem; margin-bottom: 1rem; }
  .sub-stat { text-align: center; }
  .sub-val { font-family: var(--mono); font-size: 0.9375rem; font-weight: 600; display: block; }
  .sub-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .dash-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 1.25rem; gap: 2px; }
  .bar-seg { border-radius: 3px; }
  .dash-chart { display: flex; align-items: flex-end; gap: 4px; height: 64px; margin-bottom: 1.25rem; padding: 0 0.25rem; }
  .chart-bar { flex: 1; background: var(--accent); border-radius: 3px 3px 0 0; opacity: 0.7; animation: barRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes barRise { from { height: 0 !important; opacity: 0; } to { opacity: 0.7; } }
  .dash-cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.5rem; }
  .dash-card { background: var(--raised); border-radius: 6px; padding: 0.75rem; text-align: center; }
  .card-val { font-family: var(--mono); font-size: 1rem; font-weight: 700; color: var(--text); display: block; }
  .card-label { font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.125rem; display: block; }

  /* ── Tools strip ─────────────────────────────────────────────────────────── */
  .tools-section { padding: 2.5rem 0; background: var(--bg-warm); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
  .tools-label { font-family: var(--mono); font-size: 0.875rem; font-weight: 550; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 1.25rem; text-align: center; }
  .tools-strip { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.75rem; }
  .tool-chip {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.125rem;
    background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .tool-chip:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 2px 8px oklch(0.52 0.14 165 / 0.08); }
  .tool-icon { width: 1.125rem; height: 1.125rem; flex-shrink: 0; display: inline-flex; }
  .tool-icon :global(svg) { width: 100%; height: 100%; }
  .tool-name { font-family: var(--mono); font-size: 0.875rem; font-weight: 600; color: var(--text); }

  /* ── Features ────────────────────────────────────────────────────────────── */
  .features-section { padding: 3rem 0; }
  .features-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; }
  .feature-card {
    background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 10px;
    padding: 1.5rem; transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .feature-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 16px oklch(0.52 0.14 165 / 0.08); }
  .feature-icon { font-size: 1.375rem; margin-bottom: 0.75rem; line-height: 1; }
  .feature-card h3 { font-size: 1.0625rem; font-weight: 600; color: var(--text); margin-bottom: 0.5rem; }
  .feature-card p { font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.6; }

  /* ── How it works ────────────────────────────────────────────────────────── */
  .how-section { padding: 4rem 0; background: var(--bg-warm); border-top: 1px solid var(--border-subtle); }
  .steps { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 0; align-items: start; }
  .step-connector {
    width: 48px; height: 1px; margin-top: 2.5rem;
    position: relative; display: flex; align-items: center; justify-content: center;
  }
  .step-connector::after {
    content: '→';
    font-size: 1rem; color: var(--border-medium); letter-spacing: 0.1em;
  }
  .step-num {
    font-family: var(--mono); font-size: 2.5rem; font-weight: 700;
    color: oklch(0.52 0.14 165 / 0.12); line-height: 1; margin-bottom: 0.75rem;
  }
  .step { transition: transform 0.2s; padding: 0 1.5rem; }
  .step:hover { transform: translateY(-2px); }
  .step:hover .step-num { color: oklch(0.52 0.14 165 / 0.25); }
  .step h3 { font-size: 1.0625rem; font-weight: 600; color: var(--text); margin-bottom: 0.5rem; }
  .step p { font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.65; }
  .step-num { transition: color 0.2s; }

  /* ── Why ─────────────────────────────────────────────────────────────────── */
  .why-section { padding: 3rem 0; }
  .why-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 3rem; align-items: start; }
  .why-point { display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem; }
  .pt-icon { font-size: 0.5rem; margin-top: 0.5rem; flex-shrink: 0; }
  .why-point strong { font-size: 1rem; font-weight: 600; color: var(--text); display: block; margin-bottom: 0.25rem; }
  .why-point p { font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.6; }

  /* ── Quick start ─────────────────────────────────────────────────────────── */
  .quickstart-section { padding: 4rem 0; background: var(--bg-warm); border-top: 1px solid var(--border-subtle); }
  .qs-grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 4rem; align-items: center; }
  .qs-steps h2 { font-size: clamp(1.5rem, 2.8vw, 2rem); font-weight: 700; letter-spacing: -0.025em; color: var(--text); margin-bottom: 0.5rem; }
  .qs-intro { font-size: 0.9375rem; color: var(--text-muted); margin-bottom: 2.25rem; line-height: 1.55; }
  .qs-step { display: flex; gap: 1.25rem; align-items: flex-start; margin-bottom: 1.75rem; }
  .qs-num {
    font-family: var(--mono); font-size: 1.75rem; font-weight: 700;
    color: oklch(0.52 0.14 165 / 0.15); line-height: 1; flex-shrink: 0; width: 2.75rem;
    transition: color 0.2s;
  }
  .qs-step:hover .qs-num { color: oklch(0.52 0.14 165 / 0.35); }
  .qs-detail strong { font-size: 0.9375rem; font-weight: 600; color: var(--text); display: block; margin-bottom: 0.3rem; }
  .qs-detail p { font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6; }
  .qs-docs-link { font-size: 0.875rem; font-weight: 600; color: var(--accent); text-decoration: none; display: inline-block; margin-top: 0.25rem; transition: color 0.15s; }
  .qs-docs-link:hover { color: var(--accent-hover); }
  .terminal { border-radius: 12px; overflow: hidden; border: 1px solid oklch(0.23 0.015 85); box-shadow: var(--shadow-lg); }
  .term-bar {
    display: flex; align-items: center; gap: 0.375rem; padding: 0.75rem 1rem;
    background: oklch(0.19 0.013 85); border-bottom: 1px solid oklch(0.23 0.015 85);
  }
  .term-dot { width: 8px; height: 8px; border-radius: 50%; background: oklch(0.4 0.01 85); }
  .term-dot:first-child { background: oklch(0.65 0.18 25); }
  .term-dot:nth-child(2) { background: oklch(0.72 0.15 85); }
  .term-dot:nth-child(3) { background: oklch(0.65 0.17 155); }
  .term-title { font-family: var(--mono); font-size: 0.75rem; color: oklch(0.5 0.01 85); margin-left: 0.5rem; }
  .term-body { padding: 1.25rem 1.5rem; background: oklch(0.15 0.014 85); }
  .tl { font-family: var(--mono); font-size: 0.875rem; line-height: 1.8; color: oklch(0.88 0.008 85); }
  .to { font-family: var(--mono); font-size: 0.875rem; line-height: 1.8; color: oklch(0.6 0.01 85); margin-bottom: 0.25rem; }
  .tp { color: oklch(0.68 0.14 165); margin-right: 0.5rem; }
  .tc { color: oklch(0.88 0.008 85); }

  /* ── Docker ──────────────────────────────────────────────────────────────── */
  .docker-section { padding: 3rem 0; }
  .docker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
  .docker-desc { font-size: 1rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem; }
  .docker-links { display: flex; gap: 0.75rem; flex-wrap: wrap; }

  /* ── CLI grid ────────────────────────────────────────────────────────────── */
  .cli-section { padding: 4rem 0; background: var(--bg-warm); border-top: 1px solid var(--border-subtle); }
  .cli-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.75rem; }
  .cli-item {
    background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px;
    padding: 1.25rem; transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; text-decoration: none;
  }
  .cli-item:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 2px 8px oklch(0.52 0.14 165 / 0.06); }
  .cli-item code { font-family: var(--mono); font-size: 0.9375rem; font-weight: 600; color: var(--accent); display: block; margin-bottom: 0.375rem; }
  .cli-item p { font-size: 0.875rem; color: var(--text-muted); line-height: 1.5; margin: 0; }
  .cli-arrow { font-size: 0.9375rem; color: var(--border-medium); flex-shrink: 0; transition: color 0.15s, transform 0.15s; }
  .cli-item:hover .cli-arrow { color: var(--accent); transform: translateX(3px); }

  /* ── Contribute ──────────────────────────────────────────────────────────── */
  .contribute-section { padding: 3rem 0; }
  .contribute-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 3rem; align-items: center; }
  .contribute-desc { font-size: 1rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem; }
  .contribute-links { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .contribute-stats { display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap; }
  .stat-card {
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    min-width: 84px; padding: 0.875rem 1rem;
    background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px;
    text-decoration: none; transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .stat-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 2px 8px oklch(0.52 0.14 165 / 0.06); }
  .stat-value {
    font-family: var(--mono); font-size: 1.5rem; font-weight: 700; line-height: 1.1;
    color: var(--accent); min-height: 1.65rem;
  }
  .stat-label { font-size: 0.8125rem; color: var(--text-muted); }

  /* ── CTA ─────────────────────────────────────────────────────────────────── */
  .cta-section {
    padding: 4rem 0; text-align: center;
    background:
      radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.52 0.14 165 / 0.04), transparent);
  }
  .cta-section h2 { font-size: clamp(1.5rem, 2.8vw, 2rem); font-weight: 700; letter-spacing: -0.025em; color: var(--text); margin-bottom: 0.75rem; }
  .cta-section p { font-size: 1rem; color: var(--text-secondary); margin-bottom: 2rem; line-height: 1.6; }
  .cta-actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 1000px) {
    .features-grid { grid-template-columns: repeat(2,1fr); }
  }
  @media (max-width: 800px) {
    .hero-inner { grid-template-columns: 1fr; gap: 2rem; }
    .hero-visual { order: -1; }
    .dash-preview { transform: none; max-width: 100%; }
    .dash-preview:hover { transform: none; }
    .features-grid { grid-template-columns: 1fr; }
    .steps { grid-template-columns: 1fr; gap: 1.5rem; }
    .step-connector { display: none; }
    .why-grid { grid-template-columns: 1fr; gap: 2rem; }
    .docker-grid { grid-template-columns: 1fr; }
    .contribute-grid { grid-template-columns: 1fr; }
    .contribute-stats { justify-content: flex-start; }
    .cli-grid { grid-template-columns: 1fr; }
    .qs-grid { grid-template-columns: 1fr; gap: 2rem; }
  }
</style>
