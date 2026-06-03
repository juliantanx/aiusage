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
    { name: 'Claude Code', icon: '◈', color: 'var(--accent)' },
    { name: 'Codex',       icon: '◇', color: 'var(--blue)' },
    { name: 'OpenClaw',    icon: '◆', color: 'var(--purple)' },
    { name: 'OpenCode',    icon: '◎', color: 'var(--green)' },
    { name: 'Hermes',      icon: '◐', color: 'var(--amber)' },
    { name: 'Qoder',       icon: '▣', color: 'var(--rose)' },
    { name: 'Cursor',      icon: '⌖', color: 'var(--blue)' },
    { name: 'Copilot',     icon: '⬡', color: 'var(--green)' },
    { name: 'KiloCode',    icon: '▧', color: 'var(--purple)' },
    { name: 'Gemini CLI',  icon: '◉', color: 'var(--blue)' },
    { name: 'Kimi Code',   icon: '◐', color: 'var(--accent)' },
    { name: 'CodeBuddy',   icon: '◈', color: 'var(--green)' },
    { name: 'Kiro',        icon: '◇', color: 'var(--amber)' },
    { name: 'Grok Build',  icon: '◆', color: 'var(--rose)' },
    { name: 'Antigravity',  icon: '◎', color: 'var(--purple)' },
    { name: 'Roo Code',    icon: '⬡', color: 'var(--green)' },
    { name: 'Zed',         icon: '▣', color: 'var(--blue)' },
    { name: 'Goose',       icon: '⌖', color: 'var(--amber)' },
    { name: 'oh-my-pi',    icon: '◐', color: 'var(--accent)' },
    { name: 'pi',          icon: '◈', color: 'var(--rose)' },
    { name: 'Craft',       icon: '◇', color: 'var(--purple)' },
    { name: 'Droid',       icon: '◆', color: 'var(--green)' },
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
            ? 'AIUsage 是一个本地优先的 AI 编程工具用量分析平台，支持追踪 Claude Code、Codex、Copilot、Cursor 等 22 种 AI 工具的 Token 用量、费用和使用模式。数据存储在本地，不经过任何第三方服务器。'
            : 'AIUsage is a local-first AI coding usage analytics platform that tracks token consumption, costs, and usage patterns across 22 AI tools including Claude Code, Codex, Copilot, and Cursor. Data stays on your machine — no third-party servers.'
        }
      },
      {
        '@type': 'Question',
        name: zh ? 'AIUsage 支持哪些 AI 工具？' : 'Which AI tools does AIUsage support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: zh
            ? 'AIUsage 支持 22 种 AI 编程工具：Claude Code、Codex、OpenClaw、OpenCode、Hermes、Qoder、Cursor、Copilot、KiloCode、Gemini CLI、Kimi Code、CodeBuddy、Kiro、Grok Build、Antigravity、Roo Code、Zed、Goose、oh-my-pi、pi、Craft、Droid。'
            : 'AIUsage supports 22 AI coding tools: Claude Code, Codex, OpenClaw, OpenCode, Hermes, Qoder, Cursor, Copilot, KiloCode, Gemini CLI, Kimi Code, CodeBuddy, Kiro, Grok Build, Antigravity, Roo Code, Zed, Goose, oh-my-pi, pi, Craft, and Droid.'
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
            ? '通过 npm 全局安装：npm install -g @juliantanx/aiusage，然后运行 aiusage parse 解析数据，最后运行 aiusage serve 启动仪表盘。'
            : 'Install globally via npm: npm install -g @juliantanx/aiusage, then run aiusage parse to parse data, and aiusage serve to start the dashboard.'
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
          ? 'AIUsage 追踪 Claude Code、Codex、Copilot、Cursor 等 22 种 AI 工具的 Token 用量和费用。数据存储在本地，不经过任何第三方服务器。'
          : 'AIUsage tracks token consumption and costs across 22 AI coding tools. Data stays on your machine — no third-party servers.'}
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
<span class="tk-kw">aiusage</span> parse && <span class="tk-kw">aiusage</span> serve</code></pre>
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
    <p class="tools-label">{zh ? '支持 7 种 AI 编程工具' : 'Supports 7 AI coding tools'}</p>
    <div class="tools-strip">
      {#each tools as tool}
        <div class="tool-chip">
          <span class="tool-icon" style="color:{tool.color}">{tool.icon}</span>
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
        <h3>{zh ? '解析日志文件' : 'Parse Log Files'}</h3>
        <p>{zh ? '运行 aiusage parse，自动发现并解析 AI 工具生成的本地日志文件，写入 SQLite 数据库。' : 'Run aiusage parse to auto-discover and parse AI tool logs into a local SQLite database.'}</p>
      </div>
      <div class="step-connector"></div>
      <div class="step">
        <div class="step-num">03</div>
        <h3>{zh ? '查看仪表盘' : 'View the Dashboard'}</h3>
        <p>{zh ? '运行 aiusage serve 启动本地 Web 仪表盘。浏览器打开 localhost:3847，所有数据一目了然。' : 'Run aiusage serve to start a local web dashboard. Open localhost:3847 — all data at a glance.'}</p>
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
            <div class="tl"><span class="tp">$</span><span class="tc">aiusage parse</span></div>
            <div class="to">{zh ? '✓ 已解析 3 个工具的 1,247 条会话记录' : '✓ Parsed 1,247 sessions from 3 tools'}</div>
            <div class="tl"><span class="tp">$</span><span class="tc">aiusage serve</span></div>
            <div class="to">{zh ? '✓ 仪表盘已启动: http://localhost:3847' : '✓ Dashboard running: http://localhost:3847'}</div>
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
        <div><code>aiusage parse</code><p>{zh ? '解析所有 AI 工具的日志文件' : 'Parse log files from all AI tools'}</p></div>
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
  .reveal.js-ready { opacity: 0; transform: translateY(20px); transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1); }
  .reveal.js-ready.revealed { opacity: 1; transform: translateY(0); }
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
  .tool-icon { font-size: 1rem; }
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
    width: 48px; height: 1px; background: var(--border-medium); margin-top: 2.5rem;
    position: relative;
  }
  .step-connector::after {
    content: '→'; position: absolute; right: -4px; top: -0.6rem;
    font-size: 0.875rem; color: var(--text-muted);
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
