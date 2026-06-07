# @juliantanx/aiusage-widget

一个轻量级的系统托盘小组件，用于 [AIUsage](https://github.com/juliantanx/aiusage)，可以快速查看 AI 编程助手的 token 用量。

[English](./README.md) | 中文

## 功能

- **系统托盘集成** — 常驻系统托盘，点击即可弹出简洁的统计面板。
- **今日 token 用量** — 总 token 数及输入/输出明细。
- **月度总量** — 当月累计 token 数。
- **热门模型** — 今日使用最多的模型及其占比。
- **仪表盘启动** — 从托盘菜单打开完整的 AIUsage Web 仪表盘。
- **自动刷新** — 每 60 秒自动更新数据。
- **跨平台** — 支持 Windows、macOS 和 Linux。

## 前置条件

- 已安装 [AIUsage](https://github.com/juliantanx/aiusage) CLI 并完成数据解析（`aiusage serve` 启动时会自动解析）
- Node.js >= 20

## 安装

```bash
npm install -g @juliantanx/aiusage-widget
```

## 使用

```bash
# 启动组件（后台运行，添加系统托盘图标）
aiusage-widget
```

组件会读取 `~/.aiusage/cache.db`。运行 `aiusage serve` 时会自动创建数据库。

### 使用 PM2 后台运行

如需关闭终端后保持组件运行，并实现开机自启：

```bash
npm install -g pm2

# 一条命令启动 AIUsage 服务 + 托盘组件为后台服务
aiusage pm2-start

# Linux / macOS: 直接执行；Windows: 以管理员身份执行输出的命令
pm2 startup
```

PM2 支持 Windows、macOS 和 Linux。

**托盘操作：**

- **左键点击** — 切换统计面板的显示/隐藏。
- **右键点击** — 弹出上下文菜单，包含显示面板、刷新和退出。

**面板操作：**

- 点击面板右上角的刷新图标，可立即重新读取本地用量数据。
- 在托盘右键菜单中点击 **Open Dashboard**，可按需启动 `aiusage serve` 并在浏览器中打开 Web 仪表盘。

## 从源码构建

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
cd packages/widget
pnpm dev
```

## 技术栈

- **运行时：** Electron
- **UI：** Svelte + Vite
- **数据库：** better-sqlite3（读取 AIUsage 的本地 SQLite 数据库）

## 许可证

MIT
