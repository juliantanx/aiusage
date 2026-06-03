# aiusage — AI 编程助手用量追踪工具

[![npm version](https://img.shields.io/npm/v/@juliantanx/aiusage)](https://www.npmjs.com/package/@juliantanx/aiusage)
[![CI](https://github.com/juliantanx/aiusage/actions/workflows/test.yml/badge.svg)](https://github.com/juliantanx/aiusage/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**[aiusage.jtanx.com](https://aiusage.jtanx.com)** · [English](https://github.com/juliantanx/aiusage/blob/main/README.md) | 中文

一站式追踪 **22 款 AI 编程工具**的 token 用量、费用和会话。本地优先，无需注册，无遥测，无需上云。

<p align="center">
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/dashboard-home.png" alt="aiusage 仪表盘首页" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/overview.png" alt="aiusage 概览仪表盘" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/sessions.png" alt="aiusage 会话仪表盘" width="32%" />
</p>

## 快速开始

**前置条件：** Node.js 20+

```bash
npm install -g @juliantanx/aiusage
aiusage parse
aiusage serve
```

打开 `http://localhost:3847` 即可查看仪表盘。

> aiusage 不会内建后台解析任务。如需自动导入，请使用 cron 或任务计划定时执行 `aiusage parse`，或使用 `aiusage pm2-start` 保持后台运行。

## 已支持的工具

| | | | | |
|---|---|---|---|---|
| `Claude Code` | `Codex` | `OpenCode` | `Cursor` | `Hermes` |
| `Qoder` | `OpenClaw` | `KiloCode` | `Copilot` | `Gemini CLI` |
| `Kimi Code` | `CodeBuddy` | `Kiro` | `Grok Build` | `Antigravity` |
| `Roo Code` | `Zed` | `Goose` | `oh-my-pi` | `pi` |
| `Craft` | `Droid` | | | |

## 为什么使用 aiusage

每款 AI 编程工具各自记录日志，格式不同、机器不同，没有统一视图。aiusage 把这些数据汇总到一个本地仪表盘：

- **一个仪表盘** 查看 token 用量、费用、模型分布和工具调用活跃度
- **多机同步** 通过 GitHub、S3 或 R2 — 完全可选
- **数据默认本地** 不上传、不追踪

## 文档

完整文档 — CLI 命令参考、Docker 部署、同步设置、桌面小组件等 — 请访问 **[文档页面](https://aiusage.jtanx.com/docs)**。

## 友情链接

[**linux.do**](https://linux.do/) —— 感谢 L 站及其社区为项目开发与交流提供的支持与启发。

## Star History

<a href="https://www.star-history.com/?repos=juliantanx%2Faiusage&type=date&logscale=&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&theme=dark&legend=top-left&t=20260603" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260603" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260603" />
 </picture>
</a>

## 贡献

欢迎贡献！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与。

## 许可证

[MIT](./LICENSE)
