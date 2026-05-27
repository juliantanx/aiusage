<script>
  import { onMount } from 'svelte'
  import { lang } from '$lib/lang'
  import TableOfContents from '$lib/components/TableOfContents.svelte'
  import CodeBlock from '$lib/components/CodeBlock.svelte'
  import Callout from '$lib/components/Callout.svelte'
  import DocsTable from '$lib/components/DocsTable.svelte'

  $: zh = $lang === 'zh'

  const sections = [
    { id: 'getting-started', en: 'Getting Started', zh: '快速开始',
      children: [
        { id: 'install', en: 'Installation', zh: '安装' },
        { id: 'parse', en: 'Parse Data', zh: '解析数据' },
        { id: 'serve', en: 'Start Dashboard', zh: '启动仪表盘' },
        { id: 'pm2', en: 'Background (PM2)', zh: '后台运行 (PM2)' },
        { id: 'docker', en: 'Docker', zh: 'Docker 部署' },
      ]
    },
    { id: 'dashboard', en: 'Dashboard', zh: '仪表盘',
      children: [
        { id: 'dash-elements', en: 'UI Elements', zh: '界面元素' },
        { id: 'dash-config', en: 'Display Config', zh: '显示配置' },
      ]
    },
    { id: 'overview', en: 'Overview', zh: '概览',
      children: [
        { id: 'overview-cards', en: 'Stat Cards', zh: '统计卡片' },
        { id: 'overview-breakdown', en: 'Token Breakdown', zh: 'Token 明细' },
        { id: 'overview-assistant', en: 'By AI Assistant', zh: '按 AI 助手统计' },
      ]
    },
    { id: 'tokens', en: 'Tokens', zh: 'Token 用量',
      children: [
        { id: 'tokens-chart', en: 'Daily Bar Chart', zh: '每日柱状图' },
        { id: 'tokens-table', en: 'Detail Table', zh: '明细表格' },
        { id: 'tokens-types', en: 'Token Types', zh: 'Token 类型说明' },
      ]
    },
    { id: 'cost', en: 'Cost', zh: '费用',
      children: [
        { id: 'cost-daily', en: 'Daily Cost Chart', zh: '每日费用图' },
        { id: 'cost-breakdown', en: 'By Assistant & Model', zh: '按助手与模型分布' },
      ]
    },
    { id: 'models', en: 'Models', zh: '模型', children: [] },
    { id: 'tool-calls', en: 'Tool Calls', zh: '工具调用', children: [] },
    { id: 'projects', en: 'Projects', zh: '项目', children: [] },
    { id: 'sessions', en: 'Sessions', zh: '会话', children: [] },
    { id: 'quotas', en: 'Quotas', zh: '配额监控',
      children: [
        { id: 'quotas-cards', en: 'Quota Cards', zh: '配额卡片' },
        { id: 'quotas-tiers', en: 'Tier Bars', zh: '配额条' },
      ]
    },
    { id: 'pricing', en: 'Pricing', zh: '定价', children: [] },
    { id: 'settings', en: 'Settings', zh: '设置',
      children: [
        { id: 'settings-general', en: 'General', zh: '通用' },
        { id: 'settings-sources', en: 'Data Sources', zh: '数据源' },
        { id: 'settings-data', en: 'Data Management', zh: '数据管理' },
      ]
    },
    { id: 'sync', en: 'Sync', zh: '多设备同步', children: [] },
    { id: 'export', en: 'Export', zh: '数据导出', children: [] },
    { id: 'widget', en: 'Widget', zh: '桌面小组件', children: [] },
    { id: 'cli', en: 'CLI Reference', zh: 'CLI 命令',
      children: [
        { id: 'cli-parse', en: 'parse', zh: 'parse' },
        { id: 'cli-serve', en: 'serve', zh: 'serve' },
        { id: 'cli-summary', en: 'summary', zh: 'summary' },
        { id: 'cli-export', en: 'export', zh: 'export' },
        { id: 'cli-clean', en: 'clean', zh: 'clean' },
        { id: 'cli-reset', en: 'reset', zh: 'reset' },
        { id: 'cli-other', en: 'Other Commands', zh: '其他命令' },
      ]
    },
  ]

  let activeSection = 'getting-started'
  let expandedSections = new Set(['getting-started'])
  let mobileTocOpen = false
  let showBackToTop = false
  let sidebarOffset = 0
  let scrollLock = null

  function getSectionIndex(id) {
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return i
      if (sections[i].children?.some(c => c.id === id)) return i
    }
    return 0
  }

  function scrollTo(id) {
    const el = document.getElementById(id)
    if (el) {
      activeSection = id
      scrollLock = id
      const headerOffset = 76
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top - headerOffset, behavior: 'smooth' })
      mobileTocOpen = false
      for (const s of sections) {
        if (s.id === id || s.children?.some(c => c.id === id)) {
          expandedSections.add(s.id)
          expandedSections = expandedSections
        }
      }
      setTimeout(() => { scrollLock = null }, 600)
    }
  }

  function handleTocNavigate(e) {
    scrollTo(e.detail.id)
  }

  function handleTocToggle(e) {
    const id = e.detail.id
    if (expandedSections.has(id)) expandedSections.delete(id)
    else expandedSections.add(id)
    expandedSections = expandedSections
  }

  function toggleExpand(id) {
    if (expandedSections.has(id)) expandedSections.delete(id)
    else expandedSections.add(id)
    expandedSections = expandedSections
  }

  $: allSectionIds = sections.flatMap(s => [s.id, ...(s.children ?? []).map(c => c.id)])

  function updateActiveFromScroll() {
    showBackToTop = window.scrollY > 400
    const footer = document.querySelector('.site-footer')
    if (footer) {
      const footerTop = footer.getBoundingClientRect().top
      const sidebarBottom = 76 + (window.innerHeight - 92)
      sidebarOffset = footerTop < sidebarBottom ? sidebarBottom - footerTop : 0
    }
    if (scrollLock) return
    const offset = 90
    let best = allSectionIds[0]
    for (const id of allSectionIds) {
      const el = document.getElementById(id)
      if (el && el.getBoundingClientRect().top <= offset) {
        best = id
      }
    }
    if (best !== activeSection) {
      activeSection = best
      for (const s of sections) {
        if (s.id === activeSection || s.children?.some(c => c.id === activeSection)) {
          expandedSections.add(s.id)
        }
      }
      expandedSections = expandedSections
    }
  }

  onMount(() => {
    updateActiveFromScroll()
    window.addEventListener('scroll', updateActiveFromScroll, { passive: true })
    return () => window.removeEventListener('scroll', updateActiveFromScroll)
  })
</script>

<svelte:head>
  <title>{zh ? '文档' : 'Documentation'} — AIUsage</title>
  <meta name="description" content={zh
    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'
    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'
  } />
  <link rel="canonical" href="https://aiusage.jtanx.com/docs" />
  <meta property="og:title" content="{zh ? '文档' : 'Documentation'} — AIUsage" />
  <meta property="og:description" content={zh
    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'
    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'
  } />
  <meta property="og:url" content="https://aiusage.jtanx.com/docs" />
  <meta name="twitter:title" content="{zh ? '文档' : 'Documentation'} — AIUsage" />
  <meta name="twitter:description" content={zh
    ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'
    : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.'
  } />

  <!-- JSON-LD for Docs page -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: zh ? 'AIUsage 文档' : 'AIUsage Documentation',
    description: zh
      ? 'AIUsage 完整文档：安装指南、CLI 命令参考、仪表盘使用说明、多设备同步配置、数据导出等。'
      : 'AIUsage documentation: installation guide, CLI reference, dashboard usage, multi-device sync, data export, and more.',
    url: 'https://aiusage.jtanx.com/docs',
    isPartOf: {
      '@type': 'WebSite',
      name: 'AIUsage',
      url: 'https://aiusage.jtanx.com'
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://aiusage.jtanx.com/'
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: zh ? '文档' : 'Documentation',
          item: 'https://aiusage.jtanx.com/docs'
        }
      ]
    }
  })}</script>`}
</svelte:head>

<div class="docs-layout">
  <button class="mobile-toc-toggle" on:click={() => mobileTocOpen = !mobileTocOpen}>
    <span class="toc-burger" class:open={mobileTocOpen}>
      <span></span><span></span><span></span>
    </span>
    <span>{zh ? '目录' : 'Contents'}</span>
  </button>

  <aside class="docs-sidebar" class:mobile-open={mobileTocOpen} style:transform="translateY(-{sidebarOffset}px)">
    <TableOfContents
      {sections}
      {activeSection}
      {expandedSections}
      {zh}
      on:navigate={handleTocNavigate}
      on:toggle={handleTocToggle}
    />
  </aside>

  <article class="docs-content">
    <!-- ── Page Header ──────────────────────────────────────── -->
    <header class="docs-hero">
      <div class="hero-eyebrow">
        <span class="hero-eyebrow-icon">⌘</span>
        <span>{zh ? 'AIUsage 参考手册' : 'AIUsage Reference'}</span>
      </div>
      <h1 class="hero-title">{zh ? '文档' : 'Documentation'}</h1>
      <p class="hero-sub">{zh
        ? 'AIUsage 是一款 AI 工具用量统计平台，支持 Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor 等多种 AI 工具的 Token 和费用追踪。'
        : 'AIUsage is a local-first usage analytics platform for AI coding tools — tracking tokens, costs, sessions and more across Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, and Cursor.'
      }</p>
      <div class="hero-meta">
        <span class="meta-tag">{zh ? '开源' : 'Open Source'}</span>
        <span class="meta-tag">MIT</span>
        <span class="meta-tag">v1.3.1</span>
      </div>
    </header>

    <!-- ══════ Getting Started ══════ -->
    <section id="getting-started">
      <div class="sec-head">
        <span class="sec-idx">01</span>
        <h2>{zh ? '快速开始' : 'Getting Started'}</h2>
      </div>
      {#if zh}
        <p>AIUsage 是一个命令行工具，内置 Web 仪表盘。安装完成后，它会解析 AI 工具生成的日志文件，并在本地数据库中追踪用量数据。</p>
      {:else}
        <p>AIUsage is a CLI tool with a built-in web dashboard. It parses log files generated by AI tools and tracks usage data in a local database.</p>
      {/if}
    </section>

    <section id="install">
      <h3>{zh ? '安装' : 'Installation'}</h3>
      <CodeBlock lang="Terminal" copyText="npm install -g @juliantanx/aiusage">
        <span slot="lines"><span>1</span><span>2</span><span>3</span></span>
        <span class="tk-kw">npm</span> install -g <span class="tk-str">@juliantanx/aiusage</span>
<span class="tk-cmt"># or with pnpm</span>
<span class="tk-kw">pnpm</span> add -g <span class="tk-str">@juliantanx/aiusage</span>
      </CodeBlock>
    </section>

    <section id="parse">
      <h3>{zh ? '解析数据' : 'Parse Data'}</h3>
      <p>{zh ? '解析 AI 工具的日志文件，写入本地数据库：' : 'Parse log files from your AI tools into the local database:'}</p>
      <CodeBlock lang="Terminal" copyText="aiusage parse">
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">aiusage</span> parse
      </CodeBlock>
    </section>

    <section id="serve">
      <h3>{zh ? '启动仪表盘' : 'Start the Dashboard'}</h3>
      <CodeBlock lang="Terminal" copyText="aiusage serve">
        <span slot="lines"><span>1</span><span>2</span></span>
        <span class="tk-kw">aiusage</span> serve
<span class="tk-cmt"># Listens on http://localhost:3847 by default</span>
      </CodeBlock>
      <p>{zh ? '浏览器打开 http://localhost:3847 即可查看仪表盘。' : 'Open http://localhost:3847 in your browser to view the dashboard.'}</p>
      <Callout type="info">
        {zh
          ? '仪表盘首页在浏览器首次加载时会自动触发一次解析。您也可以在 Settings 页面配置自动定期解析。'
          : 'The dashboard home page triggers a parse automatically on first load. You can also configure automatic periodic parsing in Settings.'
        }
      </Callout>
    </section>

    <section id="pm2">
      <h3>{zh ? '后台运行 (PM2)' : 'Running in Background (PM2)'}</h3>
      <p>{zh
        ? 'aiusage serve 默认在前台运行，关闭终端后服务会终止。如需后台持续运行，请使用 PM2：'
        : 'aiusage serve runs in the foreground. To keep it running in the background, use PM2:'}</p>
      <CodeBlock lang="Terminal" copyText={'npm install -g pm2\naiusage pm2-start\npm2 startup'}>
        <span slot="lines"><span>1</span><span>2</span><span>3</span></span>
        <span class="tk-kw">npm</span> install -g pm2
<span class="tk-kw">aiusage</span> pm2-start
<span class="tk-kw">pm2</span> startup
      </CodeBlock>
    </section>

    <section id="docker">
      <h3>Docker</h3>
      <p>{zh
        ? '使用官方 Docker 镜像运行 AIUsage，无需安装 Node.js：'
        : 'Run AIUsage with the official Docker image, no Node.js installation required:'}</p>
      <CodeBlock lang="Terminal" copyText={'docker run -d \\\n  -p 3847:3847 \\\n  -v ~/.aiusage:/root/.aiusage \\\n  juliantanx/aiusage'}>
        <span slot="lines"><span>1</span><span>2</span><span>3</span><span>4</span></span>
        <span class="tk-kw">docker</span> run -d \
  -p 3847:3847 \
  -v ~/.aiusage:/root/.aiusage \
  juliantanx/aiusage
      </CodeBlock>
      <Callout type="info">
        {zh
          ? '镜像在 Docker Hub (juliantanx/aiusage) 和 GitHub Container Registry (ghcr.io/juliantanx/aiusage) 均可获取。支持 amd64 和 arm64 架构。'
          : 'Available on Docker Hub (juliantanx/aiusage) and GitHub Container Registry (ghcr.io/juliantanx/aiusage). Supports amd64 and arm64 architectures.'
        }
      </Callout>
    </section>

    <!-- ══════ Dashboard ══════ -->
    <section id="dashboard">
      <div class="sec-head">
        <span class="sec-idx">02</span>
        <h2>{zh ? '仪表盘（首页）' : 'Dashboard (Home)'}</h2>
      </div>
      {#if zh}
        <p>首页是一个实时 Token 计数器，显示所选时间范围内的累计用量，并每隔一段时间自动刷新。</p>
      {:else}
        <p>The home page is a live token counter showing cumulative usage for the selected time range, auto-refreshing at a configurable interval.</p>
      {/if}
    </section>

    <section id="dash-elements">
      <h3>{zh ? '界面元素' : 'UI Elements'}</h3>
      <ul>
        <li><strong>{zh ? '实时计数器' : 'Live counter'}</strong> — {zh ? '显示总 Token 数，支持动画计数效果' : 'Total token count with animated count-up effect'}</li>
        <li><strong>{zh ? '子统计' : 'Sub-stats'}</strong> — {zh ? '分别展示输入、输出和缓存 Token' : 'Input, output, and cache tokens shown separately'}</li>
        <li><strong>{zh ? '费用 / 会话 / 活跃天数' : 'Cost / Sessions / Active Days'}</strong> — {zh ? '三个辅助统计卡片' : 'Three secondary stat cards'}</li>
        <li><strong>{zh ? 'Token 构成条' : 'Token composition bar'}</strong> — {zh ? '按比例显示输入、输出、缓存读写的分布' : 'Proportional breakdown of input, output, cache read/write'}</li>
        <li><strong>{zh ? '刷新进度条' : 'Refresh progress bar'}</strong> — {zh ? '显示下次自动刷新的倒计时' : 'Countdown until next auto-refresh'}</li>
      </ul>
    </section>

    <section id="dash-config">
      <h3>{zh ? '显示配置' : 'Display Config'}</h3>
      <p>{zh ? '点击右上角的齿轮按钮可打开显示配置面板：' : 'Click the gear button to open the display config panel:'}</p>
      <ul>
        <li><strong>{zh ? '时间范围' : 'Time range'}</strong> — {zh ? '今天 / 本周 / 本月 / 近 30 天 / 全部' : 'Today / This Week / This Month / Last 30d / All Time'}</li>
        <li><strong>{zh ? '数字格式' : 'Number format'}</strong> — {zh ? '精确（1,234,567）或简短（1.2M）' : 'Exact (1,234,567) or abbreviated (1.2M)'}</li>
      </ul>
    </section>

    <!-- ══════ Overview ══════ -->
    <section id="overview">
      <div class="sec-head">
        <span class="sec-idx">03</span>
        <h2>{zh ? '概览' : 'Overview'}</h2>
      </div>
      {#if zh}
        <p>概览页展示带筛选条件的聚合统计摘要，是了解整体用量的起点。</p>
      {:else}
        <p>The Overview page shows aggregated usage stats with filters — your go-to starting point for understanding overall usage.</p>
      {/if}
      <Callout type="tip">
        {zh
          ? '使用页面顶部的筛选栏可以按日期范围、设备、AI 助手进行过滤，所有数据页面均支持这些筛选条件。'
          : 'Use the filter bar at the top to narrow by date range, device, and AI assistant — all data pages share these filters.'
        }
      </Callout>
    </section>

    <section id="overview-cards">
      <h3>{zh ? '统计卡片' : 'Stat Cards'}</h3>
      <ul>
        <li><strong>{zh ? '总 Token' : 'Total Tokens'}</strong> — {zh ? '所有类型 Token 的合计' : 'Sum of all token types'}</li>
        <li><strong>{zh ? '总费用' : 'Total Cost'}</strong> — {zh ? '基于定价表计算的估算费用' : 'Estimated cost based on the pricing table'}</li>
        <li><strong>{zh ? '活跃天数' : 'Active Days'}</strong> — {zh ? '有记录的天数' : 'Number of days with recorded usage'}</li>
        <li><strong>{zh ? '会话数' : 'Sessions'}</strong> — {zh ? '独立会话的总数' : 'Total number of distinct sessions'}</li>
      </ul>
    </section>

    <section id="overview-breakdown">
      <h3>{zh ? 'Token 明细' : 'Token Breakdown'}</h3>
      <p>{zh ? '在卡片下方展示输入、输出、缓存读取、缓存写入的分项数据。' : 'Below the cards: input, output, cache read, and cache write token counts shown individually.'}</p>
    </section>

    <section id="overview-assistant">
      <h3>{zh ? '按 AI 助手统计' : 'By AI Assistant'}</h3>
      <p>{zh
        ? '按使用的 AI 工具（claude-code、codex 等）分组，显示各工具的 Token 数和费用。列出调用次数最多的工具（如 Bash、Read、Edit 等）。'
        : 'Usage grouped by AI tool (claude-code, codex, etc.) showing tokens and cost per tool. Most-called tool names ranked by invocation count.'
      }</p>
    </section>

    <!-- ══════ Tokens ══════ -->
    <section id="tokens">
      <div class="sec-head">
        <span class="sec-idx">04</span>
        <h2>{zh ? 'Token 用量' : 'Tokens'}</h2>
      </div>
      <p>{zh
        ? 'Token 页面以每日图表和明细表格的形式展示 Token 消耗趋势。'
        : 'The Tokens page visualizes daily token consumption with a bar chart and a detail table.'
      }</p>
    </section>

    <section id="tokens-chart">
      <h3>{zh ? '每日柱状图' : 'Daily Bar Chart'}</h3>
      <p>{zh
        ? '每组柱子展示同一天内的各类 Token（输入、输出、缓存读取、缓存写入、思考 Token），悬停可查看具体数值。'
        : 'Each bar group shows the token types for one day (input, output, cache read, cache write, thinking). Hover to see exact counts.'
      }</p>
    </section>

    <section id="tokens-table">
      <h3>{zh ? '明细表格' : 'Detail Table'}</h3>
      <p>{zh
        ? '表格列出每天各类型的 Token 数量及合计，支持横向滚动查看较长时间范围的数据。'
        : 'A table below lists per-day counts for each token type plus a daily total. Scroll horizontally for longer date ranges.'
      }</p>
    </section>

    <section id="tokens-types">
      <h3>{zh ? 'Token 类型说明' : 'Token Types'}</h3>
      <ul>
        <li><strong>{zh ? '输入' : 'Input'}</strong> — {zh ? '发送给模型的提示 Token' : 'Prompt tokens sent to the model'}</li>
        <li><strong>{zh ? '输出' : 'Output'}</strong> — {zh ? '模型生成的回复 Token' : 'Tokens generated by the model'}</li>
        <li><strong>{zh ? '缓存读取' : 'Cache Read'}</strong> — {zh ? '从缓存中命中并读取的 Token（计费更低）' : 'Tokens read from cache (billed at a lower rate)'}</li>
        <li><strong>{zh ? '缓存写入' : 'Cache Write'}</strong> — {zh ? '写入缓存的 Token' : 'Tokens written to the cache'}</li>
        <li><strong>{zh ? '思考' : 'Thinking'}</strong> — {zh ? '扩展思考功能使用的 Token' : 'Tokens used by Extended Thinking mode'}</li>
      </ul>
    </section>

    <!-- ══════ Cost ══════ -->
    <section id="cost">
      <div class="sec-head">
        <span class="sec-idx">05</span>
        <h2>{zh ? '费用' : 'Cost'}</h2>
      </div>
      <p>{zh
        ? '费用页面展示每日费用走势及按 AI 助手、模型的费用分布。'
        : 'The Cost page shows daily spending trends and a breakdown by AI assistant and model.'
      }</p>
      <Callout type="warn">
        {zh
          ? '费用为估算值，基于「定价」页面中配置的每百万 Token 单价计算。如发现费用偏差，请在「定价」页面检查并修正价格。'
          : 'Costs are estimates calculated using per-million-token prices from the Pricing page. If costs look wrong, review and update prices there.'
        }
      </Callout>
    </section>

    <section id="cost-daily">
      <h3>{zh ? '每日费用图' : 'Daily Cost Chart'}</h3>
      <p>{zh ? '柱状图展示每天的费用，悬停可查看当日金额。' : 'A bar chart showing per-day costs. Hover to view exact amounts.'}</p>
    </section>

    <section id="cost-breakdown">
      <h3>{zh ? '按助手与模型分布' : 'By Assistant & Model'}</h3>
      <p>{zh
        ? '不同工具（Claude Code、Codex 等）的费用排名。不同模型（claude-sonnet-4-5、gpt-4o 等）的费用排名。'
        : 'Ranked list of costs per tool (Claude Code, Codex, etc.) and per model (e.g. claude-sonnet-4-5, gpt-4o).'
      }</p>
    </section>

    <!-- ══════ Models ══════ -->
    <section id="models">
      <div class="sec-head">
        <span class="sec-idx">06</span>
        <h2>{zh ? '模型' : 'Models'}</h2>
      </div>
      <p>{zh ? '模型页面展示各 AI 模型的使用量排名，帮助了解哪些模型被频繁调用。' : 'The Models page ranks AI model usage to show which models are used most.'}</p>
      <ul>
        <li><strong>{zh ? '模型' : 'Model'}</strong> — {zh ? '模型 ID（如 claude-sonnet-4-6）' : 'Model ID (e.g. claude-sonnet-4-6)'}</li>
        <li><strong>{zh ? '提供商' : 'Provider'}</strong> — {zh ? '服务提供商（Anthropic、OpenAI 等）' : 'Service provider (Anthropic, OpenAI, etc.)'}</li>
        <li><strong>{zh ? '调用次数' : 'Calls'}</strong> — {zh ? '该模型被调用的次数' : 'Number of times invoked'}</li>
        <li><strong>{zh ? 'Token' : 'Tokens'}</strong> — {zh ? '该模型消耗的 Token 总量' : 'Total tokens consumed'}</li>
        <li><strong>{zh ? '占比' : 'Share'}</strong> — {zh ? '在所有 Token 中的占比（含进度条）' : 'Percentage of total tokens (with progress bar)'}</li>
      </ul>
    </section>

    <!-- ══════ Tool Calls ══════ -->
    <section id="tool-calls">
      <div class="sec-head">
        <span class="sec-idx">07</span>
        <h2>{zh ? '工具调用' : 'Tool Calls'}</h2>
      </div>
      <p>{zh
        ? '工具调用页面展示 AI 助手在会话中调用各工具的频次排名。工具调用是 AI 助手执行的具体操作，例如 Bash（运行命令）、Read（读取文件）、Edit（修改文件）等。'
        : 'The Tool Calls page ranks how frequently each tool was invoked. Tool calls are specific actions — e.g. Bash (run commands), Read (read files), Edit (modify files).'
      }</p>
    </section>

    <!-- ══════ Projects ══════ -->
    <section id="projects">
      <div class="sec-head">
        <span class="sec-idx">08</span>
        <h2>{zh ? '项目' : 'Projects'}</h2>
      </div>
      <p>{zh
        ? '项目页面按项目目录展示 Token 用量和费用排名，帮助了解哪些代码库消耗了最多资源。项目名称来自 AI 工具日志中记录的工作目录路径。'
        : 'The Projects page ranks token usage and cost by project directory. Project names come from the working directory path recorded in AI tool logs.'
      }</p>
    </section>

    <!-- ══════ Sessions ══════ -->
    <section id="sessions">
      <div class="sec-head">
        <span class="sec-idx">09</span>
        <h2>{zh ? '会话' : 'Sessions'}</h2>
      </div>
      <p>{zh
        ? '会话页面展示每一条会话记录的详细日志，每页显示 50 条，支持翻页。包含时间、工具、模型、输入/输出 Token、费用等列。'
        : 'The Sessions page shows a detailed log of every recorded session, paginated at 50 per page. Columns include time, tool, model, input/output tokens, and cost.'
      }</p>
    </section>

    <!-- ══════ Quotas ══════ -->
    <section id="quotas">
      <div class="sec-head">
        <span class="sec-idx">10</span>
        <h2>{zh ? '配额监控' : 'Quotas'}</h2>
      </div>
      <p>{zh
        ? '配额页面实时监控 Claude Code、Codex 等工具的速率限制配额。自动从本地凭证中读取配额信息。'
        : 'The Quotas page monitors rate limit quotas for Claude Code, Codex, and more. Quota info is read automatically from local credentials.'
      }</p>
    </section>

    <section id="quotas-cards">
      <h3>{zh ? '配额卡片' : 'Quota Cards'}</h3>
      <p>{zh
        ? '每个已配置凭证的工具显示一张卡片，包含工具名称、最后更新时间、配额状态。未配置凭证的工具会显示在底部的非活跃列表中。'
        : 'Each tool with configured credentials shows a card with tool name, last update time, and quota status. Tools without credentials appear in an inactive list at the bottom.'
      }</p>
    </section>

    <section id="quotas-tiers">
      <h3>{zh ? '配额条' : 'Tier Bars'}</h3>
      <p>{zh
        ? '每个配额层级（如 5h、7d）显示一个进度条，颜色表示使用率：绿色（<70%）、橙色（70-90%）、红色（>90%）。显示重置倒计时。'
        : 'Each quota tier (e.g. 5h, 7d) shows a progress bar. Color indicates utilization: green (<70%), orange (70-90%), red (>90%). Reset countdown shown.'
      }</p>
    </section>

    <!-- ══════ Pricing ══════ -->
    <section id="pricing">
      <div class="sec-head">
        <span class="sec-idx">11</span>
        <h2>{zh ? '定价' : 'Pricing'}</h2>
      </div>
      <p>{zh
        ? '定价页面用于管理各模型的每百万 Token 单价，用于计算整个仪表盘的费用估算。每个模型显示一张卡片，包含模型名、输入/输出费率、缓存费率、状态标签（默认/自定义/前缀匹配/无定价）。'
        : 'The Pricing page manages per-million-token rates for each model. Each model card shows: name, input/output rates, cache rates, and status badge (Default/Custom/Prefix match/No pricing).'
      }</p>
      <Callout type="warn">
        {zh
          ? '修改价格后点击「重新计算费用」会不可逆地更新数据库中所有历史会话的费用字段。'
          : 'After changing prices, clicking "Recalculate Costs" irreversibly updates the cost field for all sessions in the database.'
        }
      </Callout>
    </section>

    <!-- ══════ Settings ══════ -->
    <section id="settings">
      <div class="sec-head">
        <span class="sec-idx">12</span>
        <h2>{zh ? '设置' : 'Settings'}</h2>
      </div>
      <p>{zh ? '设置页面按模块分区，每个区域独立保存。' : 'The Settings page is divided into sections, each saved independently.'}</p>
    </section>

    <section id="settings-general">
      <h3>{zh ? '通用' : 'General'}</h3>
      <DocsTable
        headers={zh ? ['字段', '说明'] : ['Field', 'Description']}
        rows={[
          [zh ? '设备别名' : 'Device Alias', zh ? '可选的当前设备名称，留空则使用主机名' : 'Optional device name, defaults to hostname'],
          [zh ? '每周起始日' : 'Week Starts On', zh ? '「本周」时间范围的起始天（周日或周一 ISO）' : 'Starting day for "This Week" range (Sunday or Monday ISO)'],
          [zh ? '仪表盘轮询间隔' : 'Dashboard Poll Interval', zh ? '首页自动刷新的间隔（毫秒，默认 30000）' : 'Auto-refresh interval in ms (default: 30000)'],
          [zh ? '自动解析间隔' : 'Auto-Parse Interval', zh ? '后台自动触发解析的间隔（毫秒）。设为 0 则禁用' : 'Background parse interval in ms. Set 0 to disable'],
        ]}
      />
    </section>

    <section id="settings-sources">
      <h3>{zh ? '数据源' : 'Data Sources'}</h3>
      <p>{zh ? '为每种 AI 工具指定自定义日志目录路径。留空则使用默认路径：' : 'Specify custom log directory paths for each AI tool. Leave blank for defaults:'}</p>
      <ul>
        <li><strong>Claude Code</strong> — <code>~/.claude/projects</code></li>
        <li><strong>Codex</strong> — <code>~/.codex/sessions</code></li>
        <li><strong>OpenClaw</strong> — <code>~/.openclaw/agents</code></li>
        <li><strong>OpenCode</strong> — {zh ? '平台相关的 SQLite 数据库路径' : 'platform-specific SQLite database path'}</li>
        <li><strong>Hermes</strong> — <code>~/.hermes/state.db</code></li>
        <li><strong>Qoder</strong> — <code>~/.qoder/logs/sessions</code> + {zh ? '平台相关的' : 'platform-specific'} <code>local.db</code></li>
        <li><strong>Cursor</strong> — {zh ? '平台相关的' : 'platform-specific'} <code>state.vscdb</code></li>
      </ul>
    </section>

    <section id="settings-data">
      <h3>{zh ? '数据管理' : 'Data Management'}</h3>
      <p><strong>{zh ? '本地数据保留天数' : 'Local Data Retention (days)'}</strong> — {zh
        ? '超过此天数的旧数据将被清理。设为 0 或留空则永久保留。'
        : 'Data older than this will be cleaned up. Set to 0 or leave empty to keep forever.'
      }</p>
    </section>

    <!-- ══════ Sync ══════ -->
    <section id="sync">
      <div class="sec-head">
        <span class="sec-idx">13</span>
        <h2>{zh ? '多设备同步' : 'Sync'}</h2>
      </div>
      <p>{zh
        ? '同步功能将本设备的数据推送到远程存储，并从远程拉取其他设备的数据，实现多台设备之间的用量统计共享。'
        : 'Sync pushes this device\'s data to remote storage and pulls other devices\' data, sharing usage stats across machines.'
      }</p>
      <ul>
        <li><strong>GitHub</strong> — {zh ? '推送到 GitHub 仓库' : 'Push to a GitHub repository'}</li>
        <li><strong>S3 / {zh ? '兼容存储' : 'Compatible'}</strong> — {zh ? '推送到 Amazon S3 或任何 S3 兼容存储（Cloudflare R2、MinIO 等）' : 'Push to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, etc.)'}</li>
      </ul>
      <CodeBlock lang="Terminal" copyText="aiusage sync">
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">aiusage</span> sync
      </CodeBlock>
    </section>

    <!-- ══════ Export ══════ -->
    <section id="export">
      <div class="sec-head">
        <span class="sec-idx">14</span>
        <h2>{zh ? '数据导出' : 'Export'}</h2>
      </div>
      <p>{zh
        ? '将用量数据导出为 CSV、JSON 或 NDJSON 格式，方便集成到已有的数据管道和报表系统。'
        : 'Export usage data as CSV, JSON, or NDJSON for integration with existing data pipelines and reporting.'
      }</p>
      <CodeBlock lang="Terminal" copyText={'aiusage export --format csv -o usage.csv\naiusage export --format json -o usage.json\naiusage export --format ndjson'}>
        <span slot="lines"><span>1</span><span>2</span><span>3</span></span>
        <span class="tk-kw">aiusage</span> export --format csv -o usage.csv
<span class="tk-kw">aiusage</span> export --format json -o usage.json
<span class="tk-kw">aiusage</span> export --format ndjson
      </CodeBlock>
    </section>

    <!-- ══════ Widget ══════ -->
    <section id="widget">
      <div class="sec-head">
        <span class="sec-idx">15</span>
        <h2>{zh ? '桌面小组件' : 'Widget'}</h2>
      </div>
      <p>{zh
        ? 'AIUsage Widget 是一个 Electron 系统托盘应用，在系统托盘中显示 Token 用量摘要，无需打开浏览器即可快速查看。'
        : 'AIUsage Widget is an Electron system tray app that shows token usage summaries in your system tray — no browser needed.'
      }</p>
      <CodeBlock lang="Terminal" copyText={'npm install -g @juliantanx/aiusage-widget\naiusage-widget'}>
        <span slot="lines"><span>1</span><span>2</span></span>
        <span class="tk-kw">npm</span> install -g <span class="tk-str">@juliantanx/aiusage-widget</span>
<span class="tk-kw">aiusage-widget</span>
      </CodeBlock>
      <p>{zh
        ? 'Widget 读取与 CLI 相同的本地数据库，因此需要先运行 aiusage parse 解析数据。'
        : 'Widget reads the same local database as the CLI, so you need to run aiusage parse first.'
      }</p>
    </section>

    <!-- ══════ CLI Reference ══════ -->
    <section id="cli">
      <div class="sec-head">
        <span class="sec-idx">16</span>
        <h2>{zh ? 'CLI 命令参考' : 'CLI Reference'}</h2>
      </div>
      <p>{zh
        ? '所有 CLI 命令均通过 aiusage <command> 调用。不带子命令时等同于 aiusage summary。'
        : 'All CLI commands are invoked as aiusage <command>. Running without a subcommand is equivalent to aiusage summary.'
      }</p>
    </section>

    <section id="cli-parse">
      <h3><code>parse</code> — {zh ? '解析日志' : 'Parse Logs'}</h3>
      <DocsTable
        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}
        rows={[
          ['<code>--tool &lt;tool&gt;</code>', zh ? '只解析指定工具' : 'Only parse specific tool: claude-code, codex, openclaw, opencode, hermes, qoder, cursor'],
          ['<code>--progress</code>', zh ? '显示实时进度条（仅 TTY）' : 'Show real-time progress bar (TTY only)'],
        ]}
      />
    </section>

    <section id="cli-serve">
      <h3><code>serve</code> — {zh ? '启动仪表盘' : 'Start Dashboard'}</h3>
      <DocsTable
        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}
        rows={[
          ['<code>-p, --port &lt;port&gt;</code>', zh ? '端口号' : 'Port number', '<code>3847</code>'],
        ]}
      />
    </section>

    <section id="cli-summary">
      <h3><code>summary</code> — {zh ? '终端摘要' : 'Terminal Summary'}</h3>
      <DocsTable
        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}
        rows={[
          ['<code>--device &lt;id&gt;</code>', zh ? '按设备实例 ID 筛选' : 'Filter by device instance ID'],
          ['<code>--tool &lt;tool&gt;</code>', zh ? '按工具类型筛选' : 'Filter by tool type'],
        ]}
      />
    </section>

    <section id="cli-export">
      <h3><code>export</code> — {zh ? '导出数据' : 'Export Data'}</h3>
      <DocsTable
        headers={zh ? ['选项', '说明', '必填'] : ['Option', 'Description', 'Required']}
        rows={[
          ['<code>--format &lt;f&gt;</code>', 'csv, json, ndjson', zh ? '是' : 'Yes'],
          ['<code>-o, --output &lt;f&gt;</code>', zh ? '输出文件路径（默认 stdout）' : 'Output file path (default: stdout)', zh ? '否' : 'No'],
        ]}
      />
    </section>

    <section id="cli-clean">
      <h3><code>clean</code> — {zh ? '清理旧数据' : 'Clean Old Data'}</h3>
      <DocsTable
        headers={zh ? ['选项', '说明', '默认'] : ['Option', 'Description', 'Default']}
        rows={[
          ['<code>--before &lt;dur&gt;</code>', zh ? '删除此时间之前的数据（如 30d、180d）' : 'Delete data older than this (e.g. 30d, 180d)', '<code>180d</code>'],
        ]}
      />
    </section>

    <section id="cli-reset">
      <h3><code>reset</code> — {zh ? '重置所有数据' : 'Reset All Data'}</h3>
      <p>{zh
        ? '删除所有已解析的记录、工具调用、同步数据和水位线。原始日志文件不受影响。'
        : 'Delete all parsed records, tool calls, synced data, and the parse watermark. Source log files are not affected.'
      }</p>
      <DocsTable
        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}
        rows={[
          ['<code>--yes</code>', zh ? '跳过确认提示（必须指定才会执行）' : 'Skip confirmation prompt (required to execute)'],
        ]}
      />
    </section>

    <section id="cli-other">
      <h3>{zh ? '其他命令' : 'Other Commands'}</h3>
      <DocsTable
        headers={zh ? ['命令', '说明'] : ['Command', 'Description']}
        rows={[
          ['<code>status</code>', zh ? '显示版本号、设备名称、数据库路径、schema 版本、记录数、数据库大小及同步状态' : 'Show version, device name, DB path, schema version, record count, DB size, and sync status'],
          ['<code>sync</code>', zh ? '与远程后端双向同步数据' : 'Push and pull data with remote backend'],
          ['<code>recalc</code>', zh ? '按最新定价重新计算费用' : 'Recalculate costs with latest pricing'],
          ['<code>init</code>', zh ? '配置同步后端（--backend, --repo, --token, --bucket, --endpoint 等）' : 'Configure sync backend (--backend, --repo, --token, --bucket, --endpoint, etc.)'],
        ]}
      />
    </section>
  </article>

  {#if showBackToTop}
    <button class="back-to-top" on:click={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
      ↑
    </button>
  {/if}
</div>

<style>
  /* ── Layout ──────────────────────────────────────────────── */
  .docs-layout {
    width: var(--content-width);
    margin: 0 auto;
    padding: 2rem 0 4rem;
    position: relative;
  }

  /* ── Mobile TOC ──────────────────────────────────────────── */
  .mobile-toc-toggle {
    display: none;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-weight: 550;
    color: var(--text-secondary);
    cursor: pointer;
    margin-bottom: 0.5rem;
  }

  .toc-burger {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 16px;
  }

  .toc-burger span {
    display: block;
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
    transition: all 0.2s ease;
  }

  .toc-burger.open span:nth-child(1) {
    transform: rotate(45deg) translate(3px, 3px);
  }
  .toc-burger.open span:nth-child(2) {
    opacity: 0;
  }
  .toc-burger.open span:nth-child(3) {
    transform: rotate(-45deg) translate(4px, -4px);
  }

  /* ── Sidebar ─────────────────────────────────────────────── */
  .docs-sidebar {
    position: fixed;
    top: 76px;
    left: calc(50% - var(--content-width) / 2);
    width: 260px;
    max-height: calc(100vh - 92px);
    overflow-y: auto;
    scrollbar-width: thin;
    transition: transform 0.15s ease;
  }

  /* ── Hero ────────────────────────────────────────────────── */
  .docs-hero {
    margin-bottom: 3rem;
    padding-bottom: 2.5rem;
    border-bottom: 1px solid var(--border-subtle);
    position: relative;
  }

  .docs-hero::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 80px;
    height: 2px;
    background: var(--accent);
  }

  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    margin-bottom: 0.75rem;
    padding: 0.3rem 0.75rem;
    background: var(--accent-dim);
    border-radius: 4px;
  }

  .hero-eyebrow-icon {
    font-size: 0.8125rem;
  }

  .hero-title {
    font-family: 'Source Serif 4', 'Georgia', serif;
    font-size: 2.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text);
    margin-bottom: 0.75rem;
    line-height: 1.15;
  }

  .hero-sub {
    font-size: 1.0625rem;
    color: var(--text-secondary);
    line-height: 1.7;
    max-width: 640px;
  }

  .hero-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.25rem;
    flex-wrap: wrap;
  }

  .meta-tag {
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 550;
    color: var(--text-muted);
    background: var(--raised);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    letter-spacing: 0.02em;
  }

  /* ── Content ─────────────────────────────────────────────── */
  .docs-content {
    min-width: 0;
    max-width: 85ch;
    margin-left: 290px;
  }

  /* ── Section heads ───────────────────────────────────────── */
  section {
    margin-bottom: 2.5rem;
    padding-top: 0.25rem;
    scroll-margin-top: 76px;
  }

  .sec-head {
    display: flex;
    align-items: baseline;
    gap: 0.875rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.625rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .sec-idx {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent);
    opacity: 0.6;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  section h2 {
    font-family: 'Source Serif 4', 'Georgia', serif;
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    margin: 0;
    padding: 0;
    border: none;
  }

  section h3 {
    font-family: 'Instrument Sans', sans-serif;
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
    margin: 2rem 0 0.75rem;
  }

  section p {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.75;
    margin-bottom: 0.75rem;
  }

  section ul {
    padding-left: 1.25rem;
    margin-bottom: 0.75rem;
    list-style: none;
  }

  section li {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.75;
    margin-bottom: 0.375rem;
    position: relative;
    padding-left: 0.875rem;
  }

  section li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.4;
  }

  section strong {
    color: var(--text);
    font-weight: 600;
  }

  section code {
    font-family: var(--mono);
    font-size: 0.8125rem;
    background: var(--raised);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 0.1em 0.4em;
    color: var(--accent);
  }

  /* ── Back to top ─────────────────────────────────────────── */
  .back-to-top {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 50;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--accent);
    color: oklch(0.99 0.002 85);
    border: none;
    cursor: pointer;
    font-size: 1.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px oklch(0 0 0 / 0.15);
    transition: all 0.2s ease;
    animation: fadeIn 0.2s ease-out;
  }

  .back-to-top:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px oklch(0 0 0 / 0.2);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Responsive ──────────────────────────────────────────── */
  @media (max-width: 800px) {
    .docs-content {
      margin-left: 0;
    }

    .mobile-toc-toggle {
      display: flex;
    }

    .docs-sidebar {
      display: none;
      position: static;
      width: auto;
      max-height: none;
      margin-bottom: 1rem;
    }

    .docs-sidebar.mobile-open {
      display: block;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.5rem;
    }

    .docs-sidebar.mobile-open :global(.toc) {
      border-right: none;
      padding-right: 0;
    }

    .hero-title {
      font-size: 1.875rem;
    }
  }
</style>
