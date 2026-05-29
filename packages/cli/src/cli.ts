import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { serve } from './commands/serve.js'
import { runInit } from './commands/init.js'
import { runSync } from './commands/sync.js'
import { generateSummary } from './commands/summary.js'
import { generateStatus } from './commands/status.js'
import { exportData } from './commands/export.js'
import { cleanOldData } from './commands/clean.js'
import { runReset } from './commands/reset.js'
import { recalcPricing } from './commands/recalc.js'
import { runParse } from './commands/parse.js'
import { ProgressReporter } from './progress.js'
import { launchWidget } from './commands/widget.js'
import { runLeaderboardLogin } from './commands/leaderboard-login.js'
import { runLeaderboardUpload } from './commands/leaderboard-upload.js'
import { runLeaderboardStatus } from './commands/leaderboard-status.js'
import { runLeaderboardLogout } from './commands/leaderboard-logout.js'
import { createDatabase } from './db/index.js'
import { getState } from './init.js'
import { AIUSAGE_DIR } from './config.js'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_PATH = join(AIUSAGE_DIR, 'cache.db')

const program = new Command()

declare const __VERSION__: string | undefined

program
  .name('aiusage')
  .version(typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev')
  .description('CLI tool for AI usage statistics')

// Default command: summary
program
  .action(() => {
    const db = createDatabase(DB_PATH)
    const state = getState(AIUSAGE_DIR)
    const summary = generateSummary(db, {
      currentDeviceInstanceId: state?.deviceInstanceId,
    })
    if (summary.deviceCount > 1) {
      console.log(`设备：全部（${summary.deviceCount} 台设备在线）`)
    }
    console.log(`Total Tokens: ${summary.totalTokens.toLocaleString()}`)
    console.log(`Total Cost:   $${summary.totalCost.toFixed(4)}`)
    console.log(`Records:      ${summary.recordCount}`)
    if (Object.keys(summary.byTool).length > 0) {
      console.log('\nBy Tool:')
      for (const [tool, stats] of Object.entries(summary.byTool)) {
        console.log(`  ${tool}: ${stats.tokens.toLocaleString()} tokens, $${stats.cost.toFixed(4)}`)
      }
    }
    if (summary.topToolCalls.length > 0) {
      console.log('\nTop Tool Calls:')
      for (const tc of summary.topToolCalls) {
        console.log(`  ${tc.name}: ${tc.count}`)
      }
    }
    db.close()
  })

// summary command
program
  .command('summary')
  .description('Show usage summary')
  .option('--week', 'Show this week')
  .option('--month', 'Show this month')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--device <id>', 'Filter by device instance ID')
  .option('--tool <tool>', 'Filter by tool type (claude-code|codex|openclaw|opencode|hermes|qoder|cursor)')
  .action((options) => {
    const db = createDatabase(DB_PATH)
    const state = getState(AIUSAGE_DIR)
    const summary = generateSummary(db, {
      currentDeviceInstanceId: state?.deviceInstanceId,
      device: options.device,
      tool: options.tool,
    })
    if (summary.deviceLabel) {
      console.log(`设备：${summary.deviceLabel}`)
    } else if (summary.deviceCount > 1) {
      console.log(`设备：全部（${summary.deviceCount} 台设备在线）`)
    }
    console.log(`Total Tokens: ${summary.totalTokens.toLocaleString()}`)
    console.log(`Total Cost:   $${summary.totalCost.toFixed(4)}`)
    console.log(`Records:      ${summary.recordCount}`)
    if (Object.keys(summary.byTool).length > 0) {
      console.log('\nBy Tool:')
      for (const [tool, stats] of Object.entries(summary.byTool)) {
        console.log(`  ${tool}: ${stats.tokens.toLocaleString()} tokens, $${stats.cost.toFixed(4)}`)
      }
    }
    db.close()
  })

// status command
program
  .command('status')
  .description('Show current status')
  .action(() => {
    const db = createDatabase(DB_PATH)
    const status = generateStatus(db)
    console.log(`Version:     ${status.version}`)
    console.log(`Device:      ${status.deviceName}`)
    console.log(`DB Path:     ${status.dbPath}`)
    console.log(`Schema:      v${status.schemaVersion}`)
    console.log(`Objects:     ${status.tableCount} tables, ${status.viewCount} views`)
    console.log(`Records:     ${status.recordCount}`)
    console.log(`DB Size:     ${status.databaseSize}`)
    console.log(`Sync Status: ${status.syncStatus}`)
    if (status.lastSyncAt) {
      console.log(`Last Sync:   ${new Date(status.lastSyncAt).toISOString()}`)
    }
    db.close()
  })

// export command
program
  .command('export')
  .description('Export data')
  .requiredOption('--format <format>', 'Output format (csv|json|ndjson)')
  .option('--range <range>', 'Time range (day|week|month)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action((options) => {
    const format = options.format as 'csv' | 'json' | 'ndjson'
    if (!['csv', 'json', 'ndjson'].includes(format)) {
      console.error('Invalid format. Use csv, json, or ndjson.')
      process.exit(1)
    }
    const db = createDatabase(DB_PATH)
    const data = exportData(db, format)
    if (options.output) {
      writeFileSync(options.output, data, 'utf-8')
      console.log(`Exported to ${options.output}`)
    } else {
      console.log(data)
    }
    db.close()
  })

// parse command
program
  .command('parse')
  .description('Parse AI tool session logs')
  .option('--tool <tool>', 'Specific tool to parse (claude-code|codex|openclaw|opencode|hermes|qoder|cursor)')
  .option('--progress', 'Show real-time progress')
  .action(async (options) => {
    const db = createDatabase(DB_PATH)
    const reporter = options.progress ? new ProgressReporter() : undefined
    try {
      const result = await runParse(db, options.tool, {
        onProgress: reporter ? (info) => reporter.update(info) : undefined,
      })
      reporter?.done()
      console.log(`Parsed ${result.parsedCount} records, ${result.toolCallCount} tool calls.`)
      if (result.errors.length > 0) {
        console.warn(`${result.errors.length} errors encountered.`)
      }
    } catch (e) {
      reporter?.done()
      console.error(`Parse failed: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    } finally {
      db.close()
    }
  })

// clean command
program
  .command('clean')
  .description('Clean old data')
  .option('--before <duration>', 'Duration (e.g., 30d)', '180d')
  .option('--remote', 'Also clean remote data')
  .option('--all-devices', 'Clean all devices (with --remote)')
  .option('--yes', 'Skip confirmation')
  .option('--approve-delete', 'Approve delete permission upgrade')
  .action((options) => {
    const daysMatch = options.before.match(/^(\d+)d$/)
    if (!daysMatch) {
      console.error('Invalid duration format. Use e.g. 30d, 180d.')
      process.exit(1)
    }
    const days = parseInt(daysMatch[1], 10)
    const db = createDatabase(DB_PATH)
    const result = cleanOldData(db, days)
    console.log(`Deleted ${result.deletedCount} records, ${result.deletedSyncedCount} synced records, ${result.deletedOrphanToolCalls} orphan tool calls.`)
    db.close()
  })

// reset command
program
  .command('reset')
  .description('Delete all parsed data and watermark, then re-parse from scratch')
  .option('--yes', 'Skip confirmation')
  .action((options) => {
    if (!options.yes) {
      console.error('This will delete ALL parsed records, tool calls, synced data, and the parse watermark.')
      console.error('Source log files (~/.claude, ~/.codex, etc.) will NOT be affected.')
      console.error('Use --yes to confirm.')
      process.exit(1)
    }
    const db = createDatabase(DB_PATH)
    const result = runReset(db)
    console.log(`Deleted ${result.deletedRecords} records, ${result.deletedToolCalls} tool calls, ${result.deletedSyncedRecords} synced records.`)
    if (result.watermarkRemoved) {
      console.log('Watermark removed — next parse will re-import all data from scratch.')
    }
    db.close()
  })

// recalc command
program
  .command('recalc')
  .description('Recalculate costs')
  .option('--pricing', 'Recalculate using latest pricing')
  .action(() => {
    const db = createDatabase(DB_PATH)
    const result = recalcPricing(db)
    console.log(`Updated ${result.updatedCount} records, skipped ${result.skippedCount}.`)
    db.close()
  })

// serve command
program
  .command('serve')
  .description('Start web dashboard')
  .option('-p, --port <port>', 'Port number', '3847')
  .action((options) => {
    const db = createDatabase(DB_PATH)
    serve({ port: parseInt(options.port), db })
  })

// init command
program
  .command('init')
  .description('Configure cloud sync')
  .option('--backend <backend>', 'Sync backend (github|s3|skip)')
  .option('--repo <repo>', 'GitHub repository (format: username/repo-name)')
  .option('--token <token>', 'GitHub Personal Access Token')
  .option('--bucket <bucket>', 'S3 bucket name')
  .option('--prefix <prefix>', 'S3 object prefix', 'aiusage/')
  .option('--endpoint <endpoint>', 'S3 endpoint URL')
  .option('--region <region>', 'S3 region', 'auto')
  .option('--access-key-id <id>', 'S3 access key ID')
  .option('--secret-access-key <key>', 'S3 secret access key')
  .option('--device <alias>', 'Device alias')
  .action((options) => {
    const result = runInit(options)
    if (result.success) {
      console.log(`✓ ${result.message}`)
    } else {
      console.error(`✗ ${result.message}`)
      process.exit(1)
    }
  })

// sync command
program
  .command('sync')
  .description('Sync data with cloud storage')
  .action(async () => {
    const db = createDatabase(DB_PATH)
    const result = await runSync(db)
    if (result.status === 'ok') {
      console.log(`✓ Sync complete — pulled: ${result.pulledCount}, merged: ${result.mergedCount}, uploaded: ${result.uploadedCount}`)
    } else if (result.status === 'blocked_pending_consent') {
      console.error(`✗ ${result.error}`)
      process.exit(1)
    } else {
      console.error(`✗ Sync failed: ${result.error}`)
      process.exit(1)
    }
    db.close()
  })

// widget command
program
  .command('widget')
  .description('Start the system tray widget')
  .action(async () => {
    await launchWidget()
  })

// leaderboard command group
const leaderboard = program
  .command('leaderboard')
  .description('Token leaderboard commands')

leaderboard
  .command('login')
  .description('Authorize this device to upload token usage data')
  .action(async () => {
    await runLeaderboardLogin()
  })

leaderboard
  .command('upload')
  .description('Upload token usage data to the leaderboard')
  .action(async () => {
    await runLeaderboardUpload()
  })

leaderboard
  .command('status')
  .description('Show leaderboard upload status')
  .action(async () => {
    await runLeaderboardStatus()
  })

leaderboard
  .command('logout')
  .description('Remove local leaderboard credentials')
  .action(async () => {
    await runLeaderboardLogout()
  })

// PM2 ecosystem config
function hasWidget(): boolean {
  try {
    execSync('which aiusage-widget', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function buildPm2Config(includeWidget: boolean): string {
  // PM2 uses require() internally; ESM modules need a CJS wrapper that spawns a child process
  const wrapperPath = join(AIUSAGE_DIR, 'pm2-server.cjs')
  writeFileSync(wrapperPath, [
    `// Auto-generated by aiusage pm2-start — do not edit`,
    `const { execSync, spawn } = require('child_process')`,
    `const { dirname, join } = require('path')`,
    `const aiusagePath = execSync('which aiusage', { encoding: 'utf-8' }).trim()`,
    `// Detect Node from aiusage install path (e.g. ~/.nvm/versions/node/v18.x/bin/aiusage)`,
    `let nodeExe = process.execPath`,
    `try {`,
    `  const binDir = dirname(aiusagePath)`,
    `  const candidate = join(binDir, 'node')`,
    `  require('fs').accessSync(candidate)`,
    `  nodeExe = candidate`,
    `} catch {}`,
    `const child = spawn(nodeExe, [aiusagePath, 'serve'], {`,
    `  stdio: 'inherit',`,
    `  env: process.env,`,
    `})`,
    `child.on('exit', (code) => process.exit(code ?? 0))`,
    `process.on('SIGINT', () => child.kill('SIGINT'))`,
    `process.on('SIGTERM', () => child.kill('SIGTERM'))`,
  ].join('\n'), 'utf-8')

  const apps = [
    `    {
      name: 'aiusage-server',
      script: '${wrapperPath}',
      autorestart: true,
    }`,
  ]
  if (includeWidget) {
    apps.push(`    {
      name: 'aiusage-widget',
      script: 'aiusage-widget',
      args: '--foreground',
      autorestart: true,
    }`)
  }
  return `module.exports = {
  apps: [
${apps.join(',\n')}
  ]
}
`
}

// pm2-setup command
program
  .command('pm2-setup')
  .description('Generate ecosystem.config.cjs for PM2 background services')
  .option('--server-only', 'Only include server, skip widget')
  .action((options) => {
    const includeWidget = options.serverOnly ? false : hasWidget()
    const config = buildPm2Config(includeWidget)
    const configPath = join(AIUSAGE_DIR, 'ecosystem.config.cjs')
    writeFileSync(configPath, config, 'utf-8')
    console.log(`Config created: ${configPath}`)
    if (!includeWidget) {
      console.log('Note: aiusage-widget not found, only server is configured.')
    }
  })

// pm2-start command
program
  .command('pm2-start')
  .description('Setup and start PM2 background services (requires pm2 installed globally)')
  .option('--server-only', 'Only start server, skip widget')
  .action((options) => {
    const includeWidget = options.serverOnly ? false : hasWidget()
    const config = buildPm2Config(includeWidget)
    const configPath = join(AIUSAGE_DIR, 'ecosystem.config.cjs')
    writeFileSync(configPath, config, 'utf-8')
    console.log(`Config: ${configPath}`)

    try {
      execSync(`pm2 start "${configPath}"`, { stdio: 'inherit' })
      execSync('pm2 save', { stdio: 'inherit' })
      console.log('\nDashboard: http://localhost:3847')
      console.log('To enable auto-start on boot, run: pm2 startup')
    } catch {
      console.error('Failed to start PM2. Make sure pm2 is installed: npm install -g pm2')
      process.exit(1)
    }
  })

export { program }
