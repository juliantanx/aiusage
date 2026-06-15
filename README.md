<h1 align="center">
  <img src="https://cdn.jsdelivr.net/gh/juliantanx/aiusage@main/packages/site/static/logo-icon.svg" alt="AIUsage logo" width="42" align="absmiddle" />
  AIUsage
</h1>

<p align="center">
  Local-first usage tracker for AI coding assistants.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@juliantanx/aiusage"><img src="https://img.shields.io/npm/v/@juliantanx/aiusage" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@juliantanx/aiusage"><img src="https://img.shields.io/npm/dm/@juliantanx/aiusage" alt="npm downloads" /></a>
  <a href="https://github.com/juliantanx/aiusage/actions/workflows/test.yml"><img src="https://github.com/juliantanx/aiusage/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  <strong><a href="https://aiusage.jtanx.com">Website</a></strong> ·
  <strong><a href="https://aiusage.jtanx.com/docs">Docs</a></strong> ·
  <strong><a href="https://aiusage.jtanx.com/leaderboard">Leaderboard</a></strong> ·
  English | <a href="https://github.com/juliantanx/aiusage/blob/main/README_zh.md">中文</a>
</p>

Track tokens, cost, sessions, models, projects, tool calls, and quota pressure across **20+ AI coding tools** in one local dashboard. Local use needs no account, sends no telemetry, and does not require cloud sync.

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/juliantanx/aiusage@main/packages/site/static/screenshots/aiusage-demo.gif" alt="AIUsage dashboard demo" width="92%" />
</p>

## Highlights

- **One local dashboard** for tokens, cost, sessions, models, projects, tool calls, and quotas.
- **Broad parser support** for Claude Code, Codex, OpenCode, Cursor, Copilot, Gemini CLI, and more.
- **Optional sync** through GitHub, S3, R2, or MinIO.
- **Optional public leaderboard** with signed aggregate uploads only.
- **Desktop widget** for a tray/menu-bar glance at recent usage.
- **Private by default**: local parsing and local dashboards do not upload your prompts, completions, source code, or file paths.

## Quick Start

**Requirements:** Node.js 20+ on macOS, Linux, or Windows.

```bash
npm install -g @juliantanx/aiusage
aiusage serve
```

Open `http://localhost:3847` to use the dashboard. `serve` parses once on startup and then serves the local web UI.

Prefer pnpm:

```bash
pnpm add -g @juliantanx/aiusage
```

Use Docker:

```bash
docker run -d \
  -p 3847:3847 \
  -v ~/.aiusage:/root/.aiusage \
  juliantanx/aiusage
```

Docker persists AIUsage data with the `~/.aiusage` mount. To parse AI tool logs from the host, also mount each source log directory and configure the matching `AIUSAGE_*_PATH` variable. See the [Docker docs](https://aiusage.jtanx.com/docs#docker).

## Common Commands

| Command | What it does |
|---|---|
| `aiusage` / `aiusage summary` | Print a terminal summary |
| `aiusage parse` | Parse supported local AI tool logs |
| `aiusage serve` | Start the local dashboard on port `3847` |
| `aiusage status` | Show data source and local database status |
| `aiusage export --range month` | Export usage data |
| `aiusage init` | Configure optional sync |
| `aiusage sync` | Sync with the configured backend |
| `aiusage widget` | Launch the desktop tray widget |
| `aiusage leaderboard` | View public leaderboard rankings |
| `aiusage login` / `aiusage upload` | Authorize this device and upload aggregate leaderboard data |
| `aiusage pm2-start` | Run dashboard and widget as PM2 background services |

Full CLI reference: [aiusage.jtanx.com/docs#cli-reference](https://aiusage.jtanx.com/docs#cli-reference).

## Supported Tools

| | | | | |
|---|---|---|---|---|
| `Claude Code` | `Codex` | `OpenCode` | `Cursor` | `Hermes` |
| `Qoder` | `OpenClaw` | `KiloCode` | `Kelivo` | `Copilot` |
| `Gemini CLI` | `Kimi Code` | `CodeBuddy` | `Kiro` | `Grok Build` |
| `Antigravity` | `Roo Code` | `Zed` | `Goose` | `oh-my-pi` |
| `pi` | `Craft` | `Droid` | `ZCode` | |

Default paths and environment variable overrides are documented in [Data Sources](https://aiusage.jtanx.com/docs#settings-sources) and [Source Env Vars](https://aiusage.jtanx.com/docs#settings-env).

## Dashboard Password

The local dashboard is open on localhost by default. Set `AIUSAGE_DASHBOARD_PASSWORD` to protect dashboard APIs.

| Shell | Command |
|---|---|
| macOS / Linux | `AIUSAGE_DASHBOARD_PASSWORD="change-me" aiusage serve` |
| Windows PowerShell | `$env:AIUSAGE_DASHBOARD_PASSWORD="change-me"; aiusage serve` |
| Windows CMD | `set AIUSAGE_DASHBOARD_PASSWORD=change-me && aiusage serve` |

For PM2 background services, pass the same variable when starting `aiusage pm2-start`, and use `pm2 restart aiusage-server --update-env` after changing it. Details: [Dashboard Password](https://aiusage.jtanx.com/docs#dashboard-password) and [PM2](https://aiusage.jtanx.com/docs#pm2).

## Privacy and Data

AIUsage is designed to be local-first.

- Local parsing reads tool logs and stores parsed usage in `~/.aiusage/cache.db`.
- Local dashboard mode does not require an account and does not send telemetry.
- Optional sync is user-configured and can use GitHub, S3, R2, or MinIO.
- Optional leaderboard uploads contain aggregate token totals for ranking periods. They do not include prompts, completions, source code, file paths, or local cost estimates.
- Cost is an estimate based on pricing metadata and can change when pricing is refreshed or recalculated.
- Historical totals depend on whether each AI tool still retains its source logs or local databases.

Security issues should be reported privately when possible. See [SECURITY.md](./SECURITY.md).

## Sync and Leaderboard

Sync and leaderboard are independent optional features.

- **Sync** keeps your own devices aligned through GitHub, S3, R2, or MinIO. Configure it with `aiusage init`, then run `aiusage sync`.
- **Leaderboard** is public ranking for users who explicitly upload aggregate totals. Authorize a device with `aiusage login`, then run `aiusage upload`.
- Anonymous mode is available in [site settings](https://aiusage.jtanx.com/settings) for leaderboard participation.

The official site handles accounts, OAuth login, profile settings, authorized devices, upload review status, and admin moderation. The CLI handles local parsing, local dashboards, sync, terminal summaries, and signed uploads.

## Desktop Widget

Install the optional tray/menu-bar widget:

```bash
npm install -g @juliantanx/aiusage-widget
aiusage-widget
```

The widget reads the same local AIUsage database and can open the full dashboard from its tray menu. See [Widget docs](https://aiusage.jtanx.com/docs#widget).

## Development

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
pnpm test
pnpm dev
```

Project layout:

| Path | Purpose |
|---|---|
| `packages/core` | Shared types, schema, pricing, and utilities |
| `packages/cli` | Published CLI, parsers, local API server, sync, PM2 helpers |
| `packages/web` | Local dashboard UI bundled into the CLI |
| `packages/widget` | Electron tray/menu-bar widget |
| `packages/site` | Official website, docs, accounts, uploads, leaderboard |

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md), use the issue templates, and run `pnpm test` before opening a PR.

## Documentation

- [Full docs](https://aiusage.jtanx.com/docs)
- [CLI reference](https://aiusage.jtanx.com/docs#cli-reference)
- [Docker deployment](https://aiusage.jtanx.com/docs#docker)
- [Sync setup](https://aiusage.jtanx.com/docs#sync)
- [Widget](https://aiusage.jtanx.com/docs#widget)
- [Changelog](./CHANGELOG.md)
- [Security policy](./SECURITY.md)

## Community

- Bugs: [GitHub Issues](https://github.com/juliantanx/aiusage/issues/new?template=bug_report.md)
- Feature requests: [GitHub Issues](https://github.com/juliantanx/aiusage/issues/new?template=feature_request.md)
- Questions: [GitHub Discussions](https://github.com/juliantanx/aiusage/discussions)

[**linux.do**](https://linux.do/) - thanks to the linux.do community for support and inspiration during the development of this project.

## License

[MIT](./LICENSE)
