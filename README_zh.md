# aiusage — AI 编程助手用量追踪工具

[![npm version](https://img.shields.io/npm/v/@juliantanx/aiusage)](https://www.npmjs.com/package/@juliantanx/aiusage)
[![CI](https://github.com/juliantanx/aiusage/actions/workflows/test.yml/badge.svg)](https://github.com/juliantanx/aiusage/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**[aiusage.jtanx.com](https://aiusage.jtanx.com)** · [English](https://github.com/juliantanx/aiusage/blob/main/README.md) | 中文

一站式追踪 **22 款 AI 编程工具**的 token 用量、费用和会话。本地使用无需注册，无遥测，无需上云。

<p align="center">
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/dashboard-home.png" alt="aiusage 仪表盘首页" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/overview.png" alt="aiusage 概览仪表盘" width="32%" />
  <img src="https://raw.githubusercontent.com/juliantanx/aiusage/a527444cf87a9c1e92f1440282ed4e94f744b910/packages/site/static/screenshots/sessions.png" alt="aiusage 会话仪表盘" width="32%" />
</p>

## 快速开始

**前置条件：** Node.js 20+

```bash
npm install -g @juliantanx/aiusage
aiusage serve
```

打开 `http://localhost:3847` 即可查看仪表盘。

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
- **多机同步** 通过官方云同步、GitHub、S3 或 R2 — 完全可选
- **数据默认本地** 不上传、不追踪

## 公开排行榜

AIUsage 内置公开排行榜，适合愿意分享聚合总量的用户参与。支持按 **Token 总量**或**费用**排名，可按工具和模型维度筛选。

- 在 [aiusage.jtanx.com/leaderboard](https://aiusage.jtanx.com/leaderboard) 查看排行榜，或用 `aiusage leaderboard` 在终端查看。
- 上传数据需要账号和已授权的 CLI 设备：先运行 `aiusage login`，再运行 `aiusage upload`。
- 上传内容只包含各排名周期的聚合 Token 总量，不包含 prompt、completion、源码、文件路径或本地费用估算。
- 可在 [/settings](https://aiusage.jtanx.com/settings) 中开启匿名模式，隐藏排行榜上的身份信息。

## 站点账号

官方站点 [aiusage.jtanx.com](https://aiusage.jtanx.com) 提供账号系统，用于排行榜参与：

- **登录方式**：密码注册、GitHub OAuth、LINUX DO OAuth
- **个人设置**（[/settings](https://aiusage.jtanx.com/settings)）：用户名（30 天冷却期）、显示名称、头像、密码、排行榜可见性、匿名模式
- **上传状态**（[/uploads](https://aiusage.jtanx.com/uploads)）：查看上传历史、管理授权设备
- **管理后台**（[/admin](https://aiusage.jtanx.com/admin)）：上传审核、用户管理、定价表、审计日志（需管理员角色）

职责边界：

- `@juliantanx/aiusage` 负责本地解析、本地仪表盘、同步、终端摘要、CLI 授权和签名上传。
- 官方站点负责公开榜单浏览、账号资料、授权设备、上传审核状态和管理员治理。

## 文档

完整文档 — CLI 命令参考、Docker 部署、同步设置、桌面小组件等 — 请访问 **[文档页面](https://aiusage.jtanx.com/docs)**。

## 友情链接

[**linux.do**](https://linux.do/) —— 感谢 L 站及其社区为项目开发与交流提供的支持与启发。

## Star History

<a href="https://www.star-history.com/?repos=juliantanx%2Faiusage&type=date&logscale=&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&theme=dark&legend=top-left&t=20260604" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260604" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=juliantanx/aiusage&type=date&legend=top-left&t=20260604" />
 </picture>
</a>

## 贡献

欢迎贡献！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与。

## 许可证

[MIT](./LICENSE)
