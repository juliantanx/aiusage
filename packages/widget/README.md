# @juliantanx/aiusage-widget

A lightweight system tray widget for [aiusage](https://github.com/juliantanx/aiusage) that shows your AI coding assistant token usage at a glance.

English | [中文](./README_zh.md)

## Features

- **System tray integration** — lives in your system tray, click to toggle a compact stats panel.
- **Today's token usage** — total tokens with input/output breakdown.
- **Monthly totals** — rolling token count for the current month.
- **Top model** — your most-used model today and its share.
- **Dashboard launcher** — one click to open the full aiusage web dashboard.
- **Auto-refresh** — updates every 60 seconds automatically.
- **Cross-platform** — Windows, macOS, and Linux.

## Prerequisites

- [aiusage](https://github.com/juliantanx/aiusage) CLI installed and data parsed (`aiusage parse`)
- Node.js >= 18

## Install

```bash
npm install -g @juliantanx/aiusage-widget
```

## Usage

```bash
# Start the widget (runs in background, adds a tray icon)
aiusage-widget
```

The widget reads from `~/.aiusage/cache.db`. Make sure you have run `aiusage parse` at least once so the database exists.

**Tray interactions:**

- **Left-click** — toggle the stats panel.
- **Right-click** — context menu with Show Panel, Refresh, and Quit.

**Panel actions:**

- Click **Open Full Dashboard** to launch `aiusage serve` and open the web dashboard in your browser.

## Build from Source

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
cd packages/widget
pnpm dev
```

## Tech Stack

- **Runtime:** Electron
- **UI:** Svelte + Vite
- **Database:** better-sqlite3 (reads aiusage's local SQLite database)

## License

MIT
