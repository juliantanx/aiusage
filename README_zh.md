<h1 align="center">
  <img src="https://cdn.jsdelivr.net/gh/juliantanx/aiusage@main/packages/site/static/logo-icon.svg" alt="AIUsage logo" width="42" align="absmiddle" />
  AIUsage
</h1>

<p align="center">
  面向 AI 编程助手的本地优先用量追踪工具。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@juliantanx/aiusage"><img src="https://img.shields.io/npm/v/@juliantanx/aiusage" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@juliantanx/aiusage"><img src="https://img.shields.io/npm/dm/@juliantanx/aiusage" alt="npm downloads" /></a>
  <a href="https://github.com/juliantanx/aiusage/actions/workflows/test.yml"><img src="https://github.com/juliantanx/aiusage/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  <strong><a href="https://aiusage.jtanx.com">官网</a></strong> ·
  <strong><a href="https://aiusage.jtanx.com/docs">文档</a></strong> ·
  <strong><a href="https://aiusage.jtanx.com/leaderboard">排行榜</a></strong> ·
  <a href="https://github.com/juliantanx/aiusage/blob/main/README.md">English</a> | 中文
</p>

在一个本地仪表盘里追踪 **20+ 款 AI 编程工具**的 token、费用、会话、模型、项目、工具调用和配额压力。本地使用无需账号、无遥测、无需云同步。

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/juliantanx/aiusage@main/packages/site/static/screenshots/aiusage-demo.gif" alt="AIUsage 仪表盘演示" width="92%" />
</p>

## 功能亮点

- **一个本地仪表盘** 查看 token、费用、会话、模型、项目、工具调用和配额。
- **广泛的数据源支持**，覆盖 Claude Code、Codex、OpenCode、Cursor、Copilot、Gemini CLI 等工具。
- **可选多机同步**，支持 GitHub、S3、R2 或 MinIO。
- **可选公开排行榜**，只上传签名后的聚合用量。
- **桌面小组件**，可在菜单栏或系统托盘快速查看最近用量。
- **默认保护隐私**：本地解析和本地仪表盘不会上传 prompt、completion、源码或文件路径。

## 快速开始

**要求：** Node.js 20+，支持 macOS、Linux 和 Windows。

```bash
npm install -g @juliantanx/aiusage
aiusage serve
```

打开 `http://127.0.0.1:3847` 即可使用仪表盘。`serve` 会在启动时解析一次本地日志，然后启动本地 Web UI。

使用 pnpm：

```bash
pnpm add -g @juliantanx/aiusage
```

使用 Docker：

```bash
docker run -d \
  -p 3847:3847 \
  -e AIUSAGE_DASHBOARD_PASSWORD=change-me \
  -v ~/.aiusage:/root/.aiusage \
  juliantanx/aiusage
```

容器内的仪表盘监听 `0.0.0.0`，以便从 Docker 外部访问，因此必须设置非空的 `AIUSAGE_DASHBOARD_PASSWORD`，否则启动会被拒绝；请将 `change-me` 换成你自己的密码。Docker 示例中的 `~/.aiusage` 挂载只会持久化 AIUsage 自己的数据。若要解析宿主机上的 AI 工具日志，还需要额外挂载对应日志目录，并配置相应的 `AIUSAGE_*_PATH`。详见 [Docker 文档](https://aiusage.jtanx.com/docs#docker)。

## 常用命令

| 命令 | 用途 |
|---|---|
| `aiusage` / `aiusage summary` | 在终端输出用量摘要 |
| `aiusage parse` | 解析本地 AI 工具日志 |
| `aiusage serve` | 在 `3847` 端口启动本地仪表盘 |
| `aiusage status` | 查看数据源和本地数据库状态 |
| `aiusage export --range month` | 导出用量数据 |
| `aiusage init` | 配置可选同步 |
| `aiusage sync` | 使用已配置的后端同步数据 |
| `aiusage sync --repair` | 检查并修复跨设备同步污染（默认仅预览） |
| `aiusage widget` | 启动桌面托盘小组件 |
| `aiusage leaderboard` | 查看公开排行榜 |
| `aiusage login` / `aiusage upload` | 授权当前设备并上传聚合排行榜数据 |
| `aiusage pm2-start` | 使用 PM2 后台运行仪表盘和小组件 |

完整 CLI 参考请看：[aiusage.jtanx.com/docs#cli-reference](https://aiusage.jtanx.com/docs#cli-reference)。

## 已支持的工具

| | | | | |
|---|---|---|---|---|
| `Claude Code` | `Codex` | `OpenCode` | `Cursor` | `Hermes` |
| `Qoder` | `OpenClaw` | `KiloCode` | `Kelivo` | `Copilot` |
| `Gemini CLI` | `Kimi Code` | `CodeBuddy` | `Kiro` | `Grok Build` |
| `Antigravity` | `Roo Code` | `Zed` | `Goose` | `oh-my-pi` |
| `pi` | `Craft` | `Droid` | `ZCode` | `CodeFuse` |

默认路径和环境变量覆盖方式见 [数据源](https://aiusage.jtanx.com/docs#settings-sources) 与 [数据源环境变量](https://aiusage.jtanx.com/docs#settings-env)。

## 仪表盘密码

仪表盘默认只监听 `127.0.0.1`。IPv6 回环地址可使用 `aiusage serve --host ::1`。本地访问可以不设置密码；设置 `AIUSAGE_DASHBOARD_PASSWORD` 后，详细汇总、配额、设置等详细 API 均需要登录；只有首页展示的合计数据通过精简的 `/api/home-summary` 接口保持公开。

| Shell | 命令 |
|---|---|
| macOS / Linux | `AIUSAGE_DASHBOARD_PASSWORD="change-me" aiusage serve` |
| Windows PowerShell | `$env:AIUSAGE_DASHBOARD_PASSWORD="change-me"; aiusage serve` |
| Windows CMD | `set AIUSAGE_DASHBOARD_PASSWORD=change-me && aiusage serve` |

如需网络访问，请显式使用 `aiusage serve --host 0.0.0.0`（IPv6 使用 `--host ::`），并设置非空 `AIUSAGE_DASHBOARD_PASSWORD`，否则启动会被拒绝。Docker 镜像同样使用显式网络监听，因此密码是必需的。远程访问建议使用可信的 HTTPS 反向代理；代理必须保留浏览器侧的 Host 请求头，并将 `X-Forwarded-Proto` 覆盖为浏览器侧协议。

API 仅接受同源浏览器请求，不再支持跨源集成。本地非浏览器客户端可以省略 Origin。凭据设置只显示是否已配置并允许替换，不返回已有密钥或凭据引用；输入留空会保留原值。详见[本地 API 安全与兼容性说明](docs/dashboard-security.md)。

PM2 后台运行时，也可以在启动 `aiusage pm2-start` 时传入同名变量；修改密码后使用 `pm2 restart aiusage-server --update-env` 更新环境变量。详见 [仪表盘密码](https://aiusage.jtanx.com/docs#dashboard-password) 和 [PM2](https://aiusage.jtanx.com/docs#pm2)。

## 隐私与数据

AIUsage 采用本地优先设计。

- 本地解析会读取各工具日志，并把解析后的用量写入 `~/.aiusage/cache.db`。
- 本地仪表盘无需账号，不发送遥测。
- 可选同步由用户主动配置，支持 GitHub、S3、R2 或 MinIO。
- 可选排行榜上传只包含各排名周期的聚合 token 总量，不包含 prompt、completion、源码、文件路径或本地费用估算。
- 费用是基于定价元数据的估算值，刷新或重新计算定价后可能变化。
- 历史总量取决于各 AI 工具是否仍保留原始日志或本地数据库。

如需报告安全问题，优先使用私密渠道。详见 [SECURITY.md](./SECURITY.md)。

## 同步与排行榜

同步和排行榜是两个互相独立的可选功能。

- **同步** 用于在自己的多台设备之间保持数据一致，支持 GitHub、S3、R2 或 MinIO。使用 `aiusage init` 配置，再运行 `aiusage sync`。
  GitHub 同步推荐使用 `aiusage github login --repo OWNER/REPO` 或本地设置中的 **连接 GitHub**，通过最小权限 GitHub App 授权，无需 AIUsage 账号。细粒度 PAT 仍作为高级备用方案。详见 [GitHub App 配置与迁移说明](docs/github-sync.md)。
- 如果 1.5.13 及更早版本产生了跨设备重复记录，可先用 `aiusage sync --repair` 检查，再决定是否执行清理。详见[同步修复指南](./docs/sync-repair.md)。
- **排行榜** 面向明确选择分享聚合数据的用户。先用 `aiusage login` 授权设备，再运行 `aiusage upload`。
- 参与排行榜时，可在 [站点设置](https://aiusage.jtanx.com/settings) 中开启匿名模式。

官方站点负责账号、OAuth 登录、资料设置、授权设备、上传审核状态和管理员治理。CLI 负责本地解析、本地仪表盘、同步、终端摘要和签名上传。

## 桌面小组件

安装可选的托盘 / 菜单栏小组件：

```bash
npm install -g @juliantanx/aiusage-widget
aiusage-widget
```

小组件读取同一个本地 AIUsage 数据库，并可从托盘菜单打开完整仪表盘。详见 [Widget 文档](https://aiusage.jtanx.com/docs#widget)。

## 本地开发

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
pnpm test
pnpm dev
```

项目结构：

| 路径 | 说明 |
|---|---|
| `packages/core` | 共享类型、数据库 schema、定价和工具函数 |
| `packages/cli` | 发布到 npm 的 CLI、解析器、本地 API 服务、同步和 PM2 辅助命令 |
| `packages/web` | 打包进 CLI 的本地仪表盘 UI |
| `packages/widget` | Electron 托盘 / 菜单栏小组件 |
| `packages/site` | 官方站点、文档、账号、上传和排行榜 |

欢迎贡献。请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)，使用 issue 模板，并在提交 PR 前运行 `pnpm test`。

## 文档

- [完整文档](https://aiusage.jtanx.com/docs)
- [CLI 命令参考](https://aiusage.jtanx.com/docs#cli-reference)
- [Docker 部署](https://aiusage.jtanx.com/docs#docker)
- [同步设置](https://aiusage.jtanx.com/docs#sync)
- [桌面小组件](https://aiusage.jtanx.com/docs#widget)
- [更新日志](./CHANGELOG.zh-CN.md)
- [安全策略](./SECURITY.md)

## 贡献者

感谢以下贡献者（[表情符号说明](https://allcontributors.org/en/reference/emoji-key)）：

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/juliantanx"><img src="https://avatars.githubusercontent.com/u/59169896?v=4?s=100" width="100px;" alt="Julian"/><br /><sub><b>Julian</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=juliantanx" title="Code">💻</a> <a href="https://github.com/juliantanx/aiusage/commits?author=juliantanx" title="Documentation">📖</a> <a href="#infra-juliantanx" title="Infrastructure">🚇</a> <a href="#maintenance-juliantanx" title="Maintenance">🔧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Fiveo9"><img src="https://avatars.githubusercontent.com/u/57358895?v=4?s=100" width="100px;" alt="Fiveonine"/><br /><sub><b>Fiveonine</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=Fiveo9" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/joyshan1986"><img src="https://avatars.githubusercontent.com/u/105418356?v=4?s=100" width="100px;" alt="joyshan1986"/><br /><sub><b>joyshan1986</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=joyshan1986" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/zhaolu83949426-hub"><img src="https://avatars.githubusercontent.com/u/260552457?v=4?s=100" width="100px;" alt="zhaolu83949426-hub"/><br /><sub><b>zhaolu83949426-hub</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=zhaolu83949426-hub" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Mnoisec"><img src="https://avatars.githubusercontent.com/u/28181883?v=4?s=100" width="100px;" alt="Mnoisec"/><br /><sub><b>Mnoisec</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=Mnoisec" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jlxyfll"><img src="https://avatars.githubusercontent.com/u/16436887?v=4?s=100" width="100px;" alt="jlxyfll"/><br /><sub><b>jlxyfll</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=jlxyfll" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Ed-Bg"><img src="https://avatars.githubusercontent.com/u/68063080?v=4?s=100" width="100px;" alt="Harlan Hu"/><br /><sub><b>Harlan Hu</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=Ed-Bg" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lmingde"><img src="https://avatars.githubusercontent.com/u/38581341?v=4?s=100" width="100px;" alt="Mingde"/><br /><sub><b>Mingde</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/issues?q=author%3Almingde" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Ntrxi"><img src="https://avatars.githubusercontent.com/u/121737839?v=4?s=100" width="100px;" alt="Aaron C"/><br /><sub><b>Aaron C</b></sub></a><br /><a href="https://github.com/juliantanx/aiusage/commits?author=Ntrxi" title="Code">💻</a> <a href="https://github.com/juliantanx/aiusage/commits?author=Ntrxi" title="Documentation">📖</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

本项目遵循 [all-contributors](https://allcontributors.org) 规范，欢迎任何形式的贡献！

## 社区

- Bug 反馈：[GitHub Issues](https://github.com/juliantanx/aiusage/issues/new?template=bug_report.md)
- 功能建议：[GitHub Issues](https://github.com/juliantanx/aiusage/issues/new?template=feature_request.md)
- 问题讨论：[GitHub Discussions](https://github.com/juliantanx/aiusage/discussions)

[**linux.do**](https://linux.do/) —— 感谢 L 站及其社区为项目开发与交流提供的支持与启发。

## 许可证

[MIT](./LICENSE) © [Julian](https://github.com/juliantanx)
