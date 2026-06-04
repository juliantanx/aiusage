# aiusage — AI Coding Assistant Usage Tracker

[![npm version](https://img.shields.io/npm/v/@juliantanx/aiusage)](https://www.npmjs.com/package/@juliantanx/aiusage)
[![CI](https://github.com/juliantanx/aiusage/actions/workflows/test.yml/badge.svg)](https://github.com/juliantanx/aiusage/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**[aiusage.jtanx.com](https://aiusage.jtanx.com)** · English | [中文](https://github.com/juliantanx/aiusage/blob/main/README_zh.md)

Track token usage, cost, and sessions across **22 AI coding tools** in one local dashboard. No account is required for local use. No telemetry. No cloud required.

<p align="center">
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/dashboard-home.png" alt="aiusage dashboard home" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/overview.png" alt="aiusage overview dashboard" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/sessions.png" alt="aiusage sessions dashboard" width="32%" />
</p>

## Quick Start

**Prerequisites:** Node.js 20+

```bash
npm install -g @juliantanx/aiusage
aiusage serve
```

Open `http://localhost:3847` to explore the dashboard.

## Supported Tools

| | | | | |
|---|---|---|---|---|
| `Claude Code` | `Codex` | `OpenCode` | `Cursor` | `Hermes` |
| `Qoder` | `OpenClaw` | `KiloCode` | `Copilot` | `Gemini CLI` |
| `Kimi Code` | `CodeBuddy` | `Kiro` | `Grok Build` | `Antigravity` |
| `Roo Code` | `Zed` | `Goose` | `oh-my-pi` | `pi` |
| `Craft` | `Droid` | | | |

## Why aiusage

Your AI coding tools each log usage separately — different formats, different machines, no shared view. aiusage pulls it all into one local dashboard:

- **One dashboard** for tokens, cost, model mix, and tool-call activity
- **Multi-machine sync** via official cloud sync, GitHub, S3, or R2 — entirely optional
- **Your data stays local** by default

## Public Leaderboard

AIUsage includes a public leaderboard for users who choose to share aggregate totals. Ranking supports both **token totals** and **cost**, with filtering by tool and model.

- View the leaderboard at [aiusage.jtanx.com/leaderboard](https://aiusage.jtanx.com/leaderboard) or from the CLI with `aiusage leaderboard`.
- Upload requires an account and an authorized CLI device: `aiusage login`, then `aiusage upload`.
- Leaderboard uploads contain aggregate token totals for ranking periods. They do not include prompts, completions, source code, file paths, or local cost estimates.
- Anonymous mode is available in [/settings](https://aiusage.jtanx.com/settings) to hide your identity on the leaderboard.

## Site Account

The official site at [aiusage.jtanx.com](https://aiusage.jtanx.com) provides an account system for leaderboard participation:

- **Login**: Password, GitHub OAuth, or LINUX DO OAuth
- **Profile** ([/settings](https://aiusage.jtanx.com/settings)): Username (30-day cooldown), display name, avatar, password, leaderboard visibility, anonymous mode
- **Upload Status** ([/uploads](https://aiusage.jtanx.com/uploads)): View upload history, manage authorized devices
- **Admin Dashboard** ([/admin](https://aiusage.jtanx.com/admin)): Upload moderation, user management, pricing tables, audit logs (admin role required)

Responsibility split:

- `@juliantanx/aiusage` handles local parsing, local dashboards, sync, terminal summaries, CLI authorization, and signed leaderboard uploads.
- The official site handles public leaderboard browsing, accounts, profile settings, authorized devices, upload review status, and admin moderation.

## Documentation

Full documentation — CLI reference, Docker deployment, sync setup, desktop widget, and more — is available on the **[Docs page](https://aiusage.jtanx.com/docs)**.

## Friends

[**linux.do**](https://linux.do/) — Thanks to the linux.do community for their support and inspiration during the development of this project.

## Star History

<a href="https://www.star-history.com/?repos=juliantanx%2Faiusage&type=date&logscale=&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&theme=dark&legend=top-left&t=20260603" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260603" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260603" />
 </picture>
</a>

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get started.

## License

[MIT](./LICENSE)
