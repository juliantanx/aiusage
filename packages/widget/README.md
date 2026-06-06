# @juliantanx/aiusage-widget

A lightweight system tray widget for [aiusage](https://github.com/juliantanx/aiusage) that shows your AI coding assistant token usage at a glance.

English | [中文](./README_zh.md)

## Features

- **System tray integration** — lives in your system tray, click to toggle a compact stats panel.
- **Today's token usage** — total tokens with input/output breakdown.
- **Monthly totals** — rolling token count for the current month.
- **Top model** — your most-used model today and its share.
- **Dashboard launcher** — open the full aiusage web dashboard from the tray menu.
- **Auto-refresh** — updates every 60 seconds automatically.
- **Cross-platform** — Windows, macOS, and Linux.

## Prerequisites

- [aiusage](https://github.com/juliantanx/aiusage) CLI installed and data parsed (`aiusage serve` auto-parses on startup)
- Node.js >= 20

## Install

```bash
npm install -g @juliantanx/aiusage-widget
```

## Usage

```bash
# Start the widget (runs in background, adds a tray icon)
aiusage-widget
```

The widget reads from `~/.aiusage/cache.db`. The database is created automatically when you run `aiusage serve`.

### Running with PM2

To keep the widget running after closing the terminal and auto-start on boot:

```bash
npm install -g pm2

# Start aiusage server + widget as background services
aiusage pm2-start

# Linux / macOS: run directly; Windows: run the output command as Administrator
pm2 startup
```

PM2 works on Windows, macOS, and Linux.

**Tray interactions:**

- **Left-click** — toggle the stats panel.
- **Right-click** — context menu with Show Panel, Refresh, and Quit.

**Panel actions:**

- Click the refresh icon in the panel header to reload local usage data immediately.
- Use **Open Dashboard** in the tray context menu to launch `aiusage serve` if needed and open the web dashboard in your browser.

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
