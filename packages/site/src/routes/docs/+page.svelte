<script>
  import { browser } from '$app/environment'
  import { onMount, tick } from 'svelte'
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
    { id: 'widget', en: 'Widget', zh: '桌面小组件',
      children: [
        { id: 'widget-install', en: 'Installation', zh: '安装' },
        { id: 'widget-panel', en: 'Panel', zh: '面板功能' },
        { id: 'widget-tray', en: 'Tray Icon', zh: '托盘图标' },
      ]
    },
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

  $: if (browser && activeSection) {
    tick().then(() => {
      const sidebar = document.querySelector('.docs-sidebar')
      if (!sidebar) return
      const activeEl = sidebar.querySelector('.toc-l2.active') ?? sidebar.querySelector('.toc-l1.active')
      activeEl?.scrollIntoView({ block: 'nearest' })
    })
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
        <span class="meta-tag">v1.3.2</span>
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
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">npm</span> install -g <span class="tk-str">@juliantanx/aiusage</span>
      </CodeBlock>
      <p>{zh ? '或使用 pnpm：' : 'Or with pnpm:'}</p>
      <CodeBlock lang="Terminal" copyText="pnpm add -g @juliantanx/aiusage">
        <span slot="lines"><span>1</span></span>
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
          ? '首页会按当前时间范围从 API 拉取汇总数据，并根据设置中的轮询间隔自动刷新。需要导入新日志时，可手动运行 aiusage parse，或在设置里启用自动解析间隔。'
          : 'The home page loads summary data for the current range and refreshes automatically based on the dashboard poll interval. To import new logs, run aiusage parse manually or enable the auto-parse interval in Settings.'
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
        {@html zh
          ? `<span class="tk-kw">npm</span> install -g pm2  <span class="tk-cmt"># 全局安装 PM2</span>
<span class="tk-kw">aiusage</span> pm2-start  <span class="tk-cmt"># 现在启动后台服务并保存进程列表</span>
<span class="tk-kw">pm2</span> startup  <span class="tk-cmt"># 注册开机自启</span>`
          : `<span class="tk-kw">npm</span> install -g pm2  <span class="tk-cmt"># Install PM2 globally</span>
<span class="tk-kw">aiusage</span> pm2-start  <span class="tk-cmt"># Start the service now and save the process list</span>
<span class="tk-kw">pm2</span> startup  <span class="tk-cmt"># Register auto-start on boot</span>`}
      </CodeBlock>
      <Callout type="info">
        {zh
          ? '前两条命令会立即把服务跑起来；pm2 startup 则负责开机自启，二者缺一不可。pm2 startup 会打印一条 sudo env PATH=… pm2 startup … 命令，需要复制并执行它才能真正生效。'
          : 'The first two commands start the service right away; pm2 startup handles auto-start on reboot — you need both. Note that pm2 startup prints a sudo env PATH=… pm2 startup … command that you must copy and run for it to take effect.'
        }
      </Callout>
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
          ? '官方镜像当前提供在 Docker Hub（juliantanx/aiusage），支持 amd64 和 arm64 架构。'
          : 'The official image is currently published on Docker Hub (juliantanx/aiusage) with amd64 and arm64 support.'
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
        <p>首页是实时总览页，包含 LIVE 状态、当前时间范围、时钟、主 Token 计数器、配额预警、自动刷新进度条，以及费用 / 会话 / 活跃天数三项摘要。</p>
      {:else}
        <p>The home page is a live overview with the current range, clock, main token counter, quota warnings, refresh progress, and summary stats for cost, sessions, and active days.</p>
      {/if}
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/dashboard-home.png" alt={zh ? 'AIUsage 首页仪表盘截图' : 'AIUsage dashboard home screenshot'} loading="lazy" />
        <figcaption>{zh ? '首页展示实时累计 Token、刷新倒计时和配额预警。' : 'Home page showing live token totals, refresh countdown, and quota warnings.'}</figcaption>
      </figure>
    </section>

    <section id="dash-elements">
      <h3>{zh ? '界面元素' : 'UI Elements'}</h3>
      <ul>
        <li><strong>{zh ? '实时计数器' : 'Live counter'}</strong> — {zh ? '显示总 Token 数，支持动画计数效果' : 'Shows total tokens with a count-up animation'}</li>
        <li><strong>{zh ? '子统计' : 'Sub-stats'}</strong> — {zh ? '分别展示输入、输出与缓存总量（缓存读写合并显示）' : 'Shows input, output, and combined cache totals'}</li>
        <li><strong>{zh ? '范围与时钟' : 'Range and clock'}</strong> — {zh ? '顶部显示当前时间范围、实时时钟和 LIVE 状态' : 'Top bar shows the active range, live clock, and LIVE indicator'}</li>
        <li><strong>{zh ? '费用 / 会话 / 活跃天数' : 'Cost / Sessions / Active Days'}</strong> — {zh ? '三个摘要统计块' : 'Three summary stat blocks'}</li>
        <li><strong>{zh ? 'Token 构成条' : 'Token composition bar'}</strong> — {zh ? '按比例显示输入、输出、缓存读写分布' : 'Proportional breakdown of input, output, cache read, and cache write'}</li>
        <li><strong>{zh ? '刷新进度条' : 'Refresh progress bar'}</strong> — {zh ? '显示下次自动刷新的倒计时，并可手动立即刷新' : 'Shows countdown to next refresh and allows manual refresh'}</li>
        <li><strong>{zh ? '配额预警' : 'Quota warnings'}</strong> — {zh ? '当 Claude Code / Codex 配额层级达到 80% 以上时会在首页顶部提示' : 'Shows warning banners when Claude Code or Codex quota tiers reach 80%+'}</li>
      </ul>
    </section>

    <section id="dash-config">
      <h3>{zh ? '显示配置' : 'Display Config'}</h3>
      <p>{zh ? '点击右上角的齿轮按钮可打开显示配置面板：' : 'Click the gear button to open the display config panel:'}</p>
      <ul>
        <li><strong>{zh ? '时间范围' : 'Time range'}</strong> — {zh ? '全部 / 今天 / 本周 / 本月 / 近 30 天' : 'All Time / Today / This Week / This Month / Last 30d'}</li>
        <li><strong>{zh ? '数字格式' : 'Number format'}</strong> — {zh ? '精确（1,234,567）或简写（1.2K / 1.2M）' : 'Exact numbers or abbreviated format (1.2K / 1.2M)'}</li>
        <li><strong>{zh ? '刷新说明' : 'Refresh info'}</strong> — {zh ? '面板底部会显示当前轮询间隔，并可跳转到 Settings 修改 dashboard poll interval' : 'The panel shows the current poll interval and links to Settings to change the dashboard poll interval'}</li>
      </ul>
    </section>

    <!-- ══════ Overview ══════ -->
    <section id="overview">
      <div class="sec-head">
        <span class="sec-idx">03</span>
        <h2>{zh ? '概览' : 'Overview'}</h2>
      </div>
      {#if zh}
        <p>概览页展示聚合统计摘要，并支持按日期范围、设备和 AI 工具筛选。这里也是查看按工具聚合和 Top Tool Calls / MCP 服务调用的入口。</p>
      {:else}
        <p>The Overview page shows aggregated stats with filters for date range, device, and AI tool. It also summarizes usage by tool and highlights top tool calls or MCP servers.</p>
      {/if}
      <Callout type="tip">
        {zh
          ? '顶部三个筛选器（Date Range、Device、Tool）会同步影响 Overview、Tokens、Cost、Models、Tool Calls、Projects 和 Sessions 页面。'
          : 'The Date Range, Device, and Tool filters are shared across Overview, Tokens, Cost, Models, Tool Calls, Projects, and Sessions.'
        }
      </Callout>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/overview.png" alt={zh ? 'AIUsage 概览页截图' : 'AIUsage overview page screenshot'} loading="lazy" />
        <figcaption>{zh ? '概览页包含统计卡片、Token 明细、按工具汇总，以及 Top Tool Calls / MCP 标签页。' : 'Overview includes stat cards, token breakdown, by-tool totals, and the Top Tool Calls / MCP tabs.'}</figcaption>
      </figure>
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
        ? '页面支持两种图表模式：Breakdown 会按输入、输出、缓存读取、缓存写入、思考 Token 分开展示；Total 会将一天内所有 Token 合并成单柱。'
        : 'The page supports two chart modes: Breakdown splits input, output, cache read, cache write, and thinking tokens; Total combines each day into a single bar.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/tokens.png" alt={zh ? 'AIUsage Token 页面截图' : 'AIUsage tokens page screenshot'} loading="lazy" />
        <figcaption>{zh ? 'Token 页面支持 Breakdown / Total 两种视图，并在表格中列出每天各类 Token。' : 'Tokens page with Breakdown / Total modes and the daily token table.'}</figcaption>
      </figure>
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
        ? '费用页面展示总费用卡片、每日费用柱状图，以及按工具和按模型的前 10 名费用排行。'
        : 'The Cost page shows a total cost card, a daily cost bar chart, and top-10 cost breakdowns by tool and by model.'
      }</p>
      <Callout type="warn">
        {zh
          ? '费用为估算值，基于「定价」页面中的每百万 Token 价格计算。若你修改了定价，请手动执行重新计算费用。'
          : 'Costs are estimates based on the per-million-token pricing table. If you change pricing, run the cost recalculation step manually.'
        }
      </Callout>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/cost.png" alt={zh ? 'AIUsage 费用页面截图' : 'AIUsage cost page screenshot'} loading="lazy" />
        <figcaption>{zh ? '费用页显示总费用、每日费用走势，以及按工具 / 模型的费用排行。' : 'Cost page showing total cost, daily trend, and ranked breakdowns by tool and model.'}</figcaption>
      </figure>
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
      <p>{zh ? '模型页面按总 Token 使用量排序，展示模型 ID、提供商、调用次数、总 Token，以及占比进度条。' : 'The Models page ranks models by total token usage and shows model ID, provider, call count, total tokens, and share bars.'}</p>
      <ul>
        <li><strong>{zh ? '模型' : 'Model'}</strong> — {zh ? '模型 ID（如 claude-sonnet-4-6）' : 'Model ID (e.g. claude-sonnet-4-6)'}</li>
        <li><strong>{zh ? '提供商' : 'Provider'}</strong> — {zh ? '服务提供商（Anthropic、OpenAI 等）' : 'Service provider (Anthropic, OpenAI, etc.)'}</li>
        <li><strong>{zh ? '调用次数' : 'Calls'}</strong> — {zh ? '该模型被调用的次数' : 'Number of times invoked'}</li>
        <li><strong>{zh ? 'Token' : 'Tokens'}</strong> — {zh ? '该模型消耗的 Token 总量' : 'Total tokens consumed'}</li>
        <li><strong>{zh ? '占比' : 'Share'}</strong> — {zh ? '在当前筛选结果中的占比（含进度条）' : 'Percentage within the current filtered dataset (with progress bar)'}</li>
      </ul>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/models.png" alt={zh ? 'AIUsage 模型页面截图' : 'AIUsage models page screenshot'} loading="lazy" />
        <figcaption>{zh ? '模型页用表格和进度条展示各模型的调用量与 Token 占比。' : 'Models page uses a table and share bars to compare model usage.'}</figcaption>
      </figure>
    </section>

    <!-- ══════ Tool Calls ══════ -->
    <section id="tool-calls">
      <div class="sec-head">
        <span class="sec-idx">07</span>
        <h2>{zh ? '工具调用' : 'Tool Calls'}</h2>
      </div>
      <p>{zh
        ? '工具调用页面展示会话内工具调用频次排行，可切换查看全部、builtin、mcp、skill 三种类型。Qoder 和 Cursor 当前不会产出工具调用数据，因此切换到这两类工具时页面会显示提示。'
        : 'The Tool Calls page ranks tool usage within sessions and supports All, builtin, mcp, and skill tabs. Qoder and Cursor currently do not emit tool-call data, so the page shows a notice when filtered to those tools.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/tool-calls.png" alt={zh ? 'AIUsage 工具调用页面截图' : 'AIUsage tool calls page screenshot'} loading="lazy" />
        <figcaption>{zh ? '工具调用页支持类型切换，并用排行条展示调用占比。' : 'Tool Calls page with type tabs and ranked percentage bars.'}</figcaption>
      </figure>
    </section>

    <!-- ══════ Projects ══════ -->
    <section id="projects">
      <div class="sec-head">
        <span class="sec-idx">08</span>
        <h2>{zh ? '项目' : 'Projects'}</h2>
      </div>
      <p>{zh
        ? '项目页面按项目目录汇总 Token 和费用，并显示项目名、完整路径、占比条、Token 总量、费用与百分比。适合快速找出最耗资源的仓库。'
        : 'The Projects page aggregates usage by project directory and shows project name, full path, share bar, total tokens, cost, and percentage so you can spot the most expensive repos quickly.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/projects.png" alt={zh ? 'AIUsage 项目页面截图' : 'AIUsage projects page screenshot'} loading="lazy" />
        <figcaption>{zh ? '项目页按目录聚合，适合定位最耗 Token / 费用的代码仓库。' : 'Projects page grouped by directory to identify the most expensive repos.'}</figcaption>
      </figure>
    </section>

    <!-- ══════ Sessions ══════ -->
    <section id="sessions">
      <div class="sec-head">
        <span class="sec-idx">09</span>
        <h2>{zh ? '会话' : 'Sessions'}</h2>
      </div>
      <p>{zh
        ? '会话页面按分页展示会话列表（每页 50 条），点击任意一行可进入详情页。列表列包含时间、工具、模型、持续时长、工具调用次数、输入 / 输出 Token 与费用。'
        : 'The Sessions page lists sessions 50 per page. Click any row to open the detail view. Columns include time, tool, model, duration, tool-call count, input/output tokens, and cost.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/sessions.png" alt={zh ? 'AIUsage 会话列表页截图' : 'AIUsage sessions list page screenshot'} loading="lazy" />
        <figcaption>{zh ? '会话列表支持分页，并可点击进入单个会话详情。' : 'Session list with pagination and clickable rows for detail view.'}</figcaption>
      </figure>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/session-detail.png" alt={zh ? 'AIUsage 会话详情页截图' : 'AIUsage session detail page screenshot'} loading="lazy" />
        <figcaption>{zh ? '会话详情页按时间线展示 API records、tool calls 和记录间隔。' : 'Session detail page showing the timeline of API records, tool calls, and gaps between records.'}</figcaption>
      </figure>
    </section>

    <!-- ══════ Quotas ══════ -->
    <section id="quotas">
      <div class="sec-head">
        <span class="sec-idx">10</span>
        <h2>{zh ? '配额监控' : 'Quotas'}</h2>
      </div>
      <p>{zh
        ? '配额页面当前主要覆盖 Claude Code 和 Codex。页面会把有凭证的工具显示为卡片，没有本地凭证的工具则放到下方的 inactive 列表中。'
        : 'The Quotas page currently focuses on tools with local quota credentials, mainly Claude Code and Codex. Tools with credentials appear as cards, while tools without credentials are listed in an inactive section below.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/quotas.png" alt={zh ? 'AIUsage 配额页面截图' : 'AIUsage quotas page screenshot'} loading="lazy" />
        <figcaption>{zh ? '配额页用卡片显示各层级利用率、颜色状态和重置倒计时。' : 'Quota cards show utilization, color state, and reset countdowns.'}</figcaption>
      </figure>
    </section>

    <section id="quotas-cards">
      <h3>{zh ? '配额卡片' : 'Quota Cards'}</h3>
      <p>{zh
        ? '每个已配置凭证的工具会显示最后更新时间，以及当前查询状态：正常显示 tiers、凭证过期、解析失败、查询失败、或暂无 tiers。未配置凭证的工具会显示在底部 inactive 列表中。'
        : 'Each configured tool shows the last query time and one of several states: normal tier display, expired credentials, parse error, query failure, or no tiers. Tools without credentials appear in the inactive list at the bottom.'
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
        ? '定价页面按模型显示卡片，可直接编辑 input / output / cache read / cache write 的每百万 Token 单价。状态标签可能是 Default、Override、自定义前缀匹配，或 No pricing；部分模型还会显示 CNY 标签。'
        : 'The Pricing page shows one card per model and lets you edit per-million-token rates for input, output, cache read, and cache write. Status badges may indicate Default, Override, prefix match, or No pricing, and some models also carry a CNY badge.'
      }</p>
      <Callout type="warn">
        {zh
          ? '点击「重新计算费用」会批量更新数据库中历史记录的费用字段，请在确认定价无误后再执行。'
          : 'Clicking Recalculate Costs updates historical cost fields in the database, so only run it after you confirm the pricing table is correct.'
        }
      </Callout>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/pricing.png" alt={zh ? 'AIUsage 定价页面截图' : 'AIUsage pricing page screenshot'} loading="lazy" />
        <figcaption>{zh ? '定价页支持逐模型编辑费率，并通过标签区分默认价、自定义价和无定价模型。' : 'Pricing page with editable per-model rates and badges for default, override, and missing pricing.'}</figcaption>
      </figure>
    </section>

    <!-- ══════ Settings ══════ -->
    <section id="settings">
      <div class="sec-head">
        <span class="sec-idx">12</span>
        <h2>{zh ? '设置' : 'Settings'}</h2>
      </div>
      <p>{zh ? '设置页按模块分区，当前包含 General、Data Sources、Sync、Data、Currency 五个区域，每个区域独立保存。' : 'The Settings page is split into independent sections: General, Data Sources, Sync, Data, and Currency. Each section saves separately.'}</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/settings.png" alt={zh ? 'AIUsage 设置页面截图' : 'AIUsage settings page screenshot'} loading="lazy" />
        <figcaption>{zh ? '设置页包含通用配置、日志路径、同步凭证、数据保留和货币显示设置。' : 'Settings page with general config, source paths, sync credentials, data retention, and currency display settings.'}</figcaption>
      </figure>
    </section>

    <section id="settings-general">
      <h3>{zh ? '通用' : 'General'}</h3>
      <DocsTable
        headers={zh ? ['字段', '说明'] : ['Field', 'Description']}
        rows={[
          [zh ? '设备别名' : 'Device Alias', zh ? '可选的当前设备名称，留空则使用主机名' : 'Optional device name, defaults to hostname'],
          [zh ? '每周起始日' : 'Week Starts On', zh ? '「本周」时间范围的起始天（周日或周一 ISO）' : 'Starting day for "This Week" range (Sunday or Monday ISO)'],
          [zh ? '仪表盘轮询间隔' : 'Dashboard Poll Interval', zh ? '首页自动刷新的间隔（毫秒）' : 'Auto-refresh interval for the home dashboard in milliseconds'],
          [zh ? '自动解析间隔' : 'Auto-Parse Interval', zh ? '后台自动触发解析的间隔（毫秒），设为 0 或留空可关闭' : 'Background parse interval in milliseconds; use 0 or empty to disable'],
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
        ? '用于配置后续清理策略。设为 0 或留空则表示永久保留；设置页面本身不会立即删除数据。'
        : 'Controls future cleanup policy. Set to 0 or leave empty to keep data forever; changing this setting does not immediately delete records.'
      }</p>
    </section>

    <!-- ══════ Sync ══════ -->
    <section id="sync">
      <div class="sec-head">
        <span class="sec-idx">13</span>
        <h2>{zh ? '多设备同步' : 'Sync'}</h2>
      </div>
      <p>{zh
        ? '同步功能会把本机数据上传到远端，再拉取其他设备的数据并合并。你可以通过侧边栏 Sync 按钮手动触发，也可以先用 init 命令或设置页完成后端配置。'
        : 'Sync uploads this device’s data, pulls data from other devices, and merges the results. You can trigger it from the sidebar Sync button after configuring the backend via init or the Settings page.'
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
        ? 'Widget 是一个独立发布的 Electron 系统托盘应用，让你无需打开浏览器，就能随时在菜单栏（macOS）或系统托盘（Windows / Linux）瞥一眼今日 Token 用量。它与 CLI 共用同一个本地数据库，每 60 秒自动刷新一次。'
        : 'Widget is a separately published Electron tray app that lets you check your token usage at a glance from the menu bar (macOS) or system tray (Windows / Linux) without opening a browser. It reads the same local database as the CLI and auto-refreshes every 60 seconds.'
      }</p>
    </section>

    <section id="widget-install">
      <h3>{zh ? '安装' : 'Installation'}</h3>
      <p>{zh ? '作为独立 npm 包安装：' : 'Install as a standalone npm package:'}</p>
      <CodeBlock lang="Terminal" copyText="npm install -g @juliantanx/aiusage-widget">
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">npm</span> install -g <span class="tk-str">@juliantanx/aiusage-widget</span>
      </CodeBlock>
      <p>{zh ? '安装后，可以直接启动：' : 'Once installed, launch it directly:'}</p>
      <CodeBlock lang="Terminal" copyText="aiusage-widget">
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">aiusage-widget</span>
      </CodeBlock>
      <p>{zh ? '或通过 aiusage CLI 启动（如未安装会提示先安装）：' : 'Or launch via the aiusage CLI (prompts to install if missing):'}</p>
      <CodeBlock lang="Terminal" copyText="aiusage widget">
        <span slot="lines"><span>1</span></span>
        <span class="tk-kw">aiusage</span> widget
      </CodeBlock>
      <Callout type="info">
        {zh
          ? 'Widget 会以后台方式运行——启动后关闭终端不会退出应用。再次运行 aiusage-widget 时，如检测到已有进程在运行，将不会重复启动。'
          : 'The widget runs detached from the terminal — closing the terminal after launch will not quit the app. If a widget process is already running when you launch again, it will not start a second instance.'
        }
      </Callout>
    </section>

    <section id="widget-panel">
      <h3>{zh ? '面板功能' : 'Panel'}</h3>
      <p>{zh
        ? '点击托盘图标展开悬浮面板，再次点击或点击面板右上角的 ✕ 可关闭。面板显示以下三项统计：'
        : 'Click the tray icon to open the floating panel; click again or press ✕ to close. The panel shows three stats:'
      }</p>
      <ul>
        <li><strong>TODAY</strong> — {zh ? '今日总 Token 数，附带输入（↑）/ 输出（↓）明细' : 'Total tokens today, with input (↑) and output (↓) breakdown'}</li>
        <li><strong>THIS MONTH</strong> — {zh ? '本月累计 Token 数' : 'Cumulative token count for the current month'}</li>
        <li><strong>TOP MODEL</strong> — {zh ? '本月使用最多的模型及其占比' : 'Most-used model this month and its share percentage'}</li>
      </ul>
      <p>{zh
        ? '面板底部的「Open Full Dashboard →」按钮会在浏览器中打开 aiusage 仪表盘（如服务未运行会自动尝试启动）。右上角的 ↻ 按钮可立即手动刷新数据。'
        : 'The "Open Full Dashboard →" button opens the aiusage dashboard in your browser, starting the server automatically if it is not already running. The ↻ button triggers an immediate manual refresh.'
      }</p>
    </section>

    <section>
      <figure class="doc-shot">
        <img src="/screenshots/widget.png" alt={zh ? 'aiusage Widget 面板截图' : 'aiusage Widget panel screenshot'} loading="lazy" />
        <figcaption>{zh ? 'Widget 悬浮面板：今日 / 本月 Token、Top Model，以及打开完整仪表盘的快捷入口。' : 'Widget panel showing today and month tokens, top model, and a shortcut to the full dashboard.'}</figcaption>
      </figure>
    </section>

    <section id="widget-tray">
      <h3>{zh ? '托盘图标' : 'Tray Icon'}</h3>
      <p>{zh
        ? '左键单击托盘图标可切换面板的显示 / 隐藏；右键单击会弹出上下文菜单：'
        : 'Left-click the tray icon to toggle the panel; right-click for the context menu:'
      }</p>
      <ul>
        <li><strong>{zh ? 'Show Panel' : 'Show Panel'}</strong> — {zh ? '显示面板' : 'Show the floating panel'}</li>
        <li><strong>{zh ? 'Refresh' : 'Refresh'}</strong> — {zh ? '立即从数据库拉取最新数据' : 'Pull latest data from the database immediately'}</li>
        <li><strong>{zh ? 'Quit' : 'Quit'}</strong> — {zh ? '完全退出 Widget' : 'Exit the widget completely'}</li>
      </ul>
      <Callout type="tip">
        {zh
          ? '关闭面板（点击 ✕ 或点击面板外部）只会隐藏面板，Widget 进程依然在后台运行。若要彻底退出，请右键托盘图标并选择 Quit。'
          : 'Closing the panel (✕ or clicking outside) only hides it — the widget process keeps running in the background. To quit completely, right-click the tray icon and choose Quit.'
        }
      </Callout>
    </section>

    <!-- ══════ CLI Reference ══════ -->
    <section id="cli">
      <div class="sec-head">
        <span class="sec-idx">16</span>
        <h2>{zh ? 'CLI 命令参考' : 'CLI Reference'}</h2>
      </div>
      <p>{zh
        ? '所有 CLI 命令均通过 aiusage <command> 调用；不带子命令时会输出 summary。当前内置的主要命令包括 summary、status、parse、serve、export、clean、reset、recalc、init、sync、widget、pm2-setup 和 pm2-start。'
        : 'All CLI commands are invoked as aiusage <command>; running aiusage without a subcommand prints the summary. Main built-ins currently include summary, status, parse, serve, export, clean, reset, recalc, init, sync, widget, pm2-setup, and pm2-start.'
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
      <p>{zh ? '默认命令。输出总 Token、总费用、记录数；当存在数据时还会显示按工具汇总，默认入口还会附带 Top Tool Calls。' : 'This is the default command. It prints total tokens, total cost, and record count; when data exists it also shows a by-tool summary, and the root command additionally prints Top Tool Calls.'}</p>
      <DocsTable
        headers={zh ? ['选项', '说明'] : ['Option', 'Description']}
        rows={[
          ['<code>--week</code>', zh ? '查看本周数据' : 'Show this week'],
          ['<code>--month</code>', zh ? '查看本月数据' : 'Show this month'],
          ['<code>--from &lt;date&gt;</code>', zh ? '开始日期（YYYY-MM-DD）' : 'Start date (YYYY-MM-DD)'],
          ['<code>--to &lt;date&gt;</code>', zh ? '结束日期（YYYY-MM-DD）' : 'End date (YYYY-MM-DD)'],
          ['<code>--device &lt;id&gt;</code>', zh ? '按设备实例 ID 筛选' : 'Filter by device instance ID'],
          ['<code>--tool &lt;tool&gt;</code>', zh ? '按工具类型筛选' : 'Filter by tool type'],
        ]}
      />
    </section>

    <section id="cli-export">
      <h3><code>export</code> — {zh ? '导出数据' : 'Export Data'}</h3>
      <p>{zh ? '导出命令当前要求显式指定格式，可输出到文件，也可直接打印到 stdout。' : 'The export command currently requires an explicit format and can write either to a file or to stdout.'}</p>
      <DocsTable
        headers={zh ? ['选项', '说明', '必填'] : ['Option', 'Description', 'Required']}
        rows={[
          ['<code>--format &lt;f&gt;</code>', 'csv, json, ndjson', zh ? '是' : 'Yes'],
          ['<code>--range &lt;range&gt;</code>', zh ? '时间范围（day | week | month）' : 'Time range (day | week | month)', zh ? '否' : 'No'],
          ['<code>--from &lt;date&gt;</code>', zh ? '开始日期（YYYY-MM-DD）' : 'Start date (YYYY-MM-DD)', zh ? '否' : 'No'],
          ['<code>--to &lt;date&gt;</code>', zh ? '结束日期（YYYY-MM-DD）' : 'End date (YYYY-MM-DD)', zh ? '否' : 'No'],
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
          ['<code>--remote</code>', zh ? '同时清理远端同步数据' : 'Also clean remote synced data', '-'],
          ['<code>--all-devices</code>', zh ? '配合 --remote 清理所有设备' : 'Clean all devices together with --remote', '-'],
          ['<code>--yes</code>', zh ? '跳过确认' : 'Skip confirmation', '-'],
          ['<code>--approve-delete</code>', zh ? '批准删除权限升级' : 'Approve delete permission upgrade', '-'],
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
          ['<code>status</code>', zh ? '显示版本号、设备名称、数据库路径、schema 版本、对象数量、记录数、数据库大小及同步状态' : 'Show version, device name, DB path, schema version, object counts, record count, DB size, and sync status'],
          ['<code>sync</code>', zh ? '与远程后端执行推送 / 拉取 / 合并同步' : 'Push, pull, and merge data with the remote backend'],
          ['<code>recalc</code>', zh ? '按最新定价重新计算费用' : 'Recalculate costs with latest pricing'],
          ['<code>init</code>', zh ? '初始化同步后端（支持 GitHub / S3）' : 'Initialize sync backend (GitHub or S3)'],
          ['<code>widget</code>', zh ? '启动桌面托盘 Widget' : 'Launch the desktop tray widget'],
          ['<code>pm2-setup</code>', zh ? '生成 PM2 ecosystem.config.cjs' : 'Generate PM2 ecosystem.config.cjs'],
          ['<code>pm2-start</code>', zh ? '生成配置并启动 PM2 后台服务' : 'Generate config and start PM2 background services'],
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

  .doc-shot {
    margin: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .doc-shot img {
    display: block;
    width: 100%;
    height: auto;
    background: var(--raised);
  }

  .doc-shot figcaption {
    padding: 0.75rem 1rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-secondary);
    border-top: 1px solid var(--border-subtle);
    background: var(--raised);
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
