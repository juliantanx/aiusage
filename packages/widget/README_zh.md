# @juliantanx/aiusage-widget

一个轻量级的系统托盘小组件，用于 [aiusage](https://github.com/juliantanx/aiusage)，可以快速查看 AI 编程助手的 token 用量。

[English](./README.md) | 中文

## 功能

- **系统托盘集成** — 常驻系统托盘，点击即可弹出简洁的统计面板。
- **今日 token 用量** — 总 token 数及输入/输出明细。
- **月度总量** — 当月累计 token 数。
- **热门模型** — 今日使用最多的模型及其占比。
- **仪表盘启动** — 一键打开完整的 aiusage Web 仪表盘。
- **自动刷新** — 每 60 秒自动更新数据。
- **跨平台** — 支持 Windows、macOS 和 Linux。

## 前置条件

- 已安装 [aiusage](https://github.com/juliantanx/aiusage) CLI 并完成数据解析（`aiusage parse`）
- Node.js >= 18

## 安装

```bash
npm install -g @juliantanx/aiusage-widget
```

## 使用

```bash
# 启动组件（后台运行，添加系统托盘图标）
aiusage-widget
```

组件会读取 `~/.aiusage/cache.db`。请确保至少执行过一次 `aiusage parse`，使数据库文件存在。

**托盘操作：**

- **左键点击** — 切换统计面板的显示/隐藏。
- **右键点击** — 弹出上下文菜单，包含显示面板、刷新和退出。

**面板操作：**

- 点击 **Open Full Dashboard** 可启动 `aiusage serve` 并在浏览器中打开 Web 仪表盘。

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
- **数据库：** better-sqlite3（读取 aiusage 的本地 SQLite 数据库）

## 许可证

MIT
