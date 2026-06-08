import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { serve } from './commands/serve.js'
import { runInit } from './commands/init.js'
import { runSync } from './commands/sync.js'
import { generateSummary } from './commands/summary.js'
import { generateStatus } from './commands/status.js'
import { exportData } from './commands/export.js'
import { cleanOldData, cleanAll, getRemoteBackends, propagateClean } from './commands/clean.js'
import { recalcPricing } from './commands/recalc.js'
import { runParse } from './commands/parse.js'
import { ProgressReporter, SyncProgressReporter } from './progress.js'
import { launchWidget } from './commands/widget.js'
import { runLeaderboardLogin } from './commands/leaderboard-login.js'
import { runLeaderboardUpload } from './commands/leaderboard-upload.js'
import { runLeaderboardStatus } from './commands/leaderboard-status.js'
import { runLeaderboardLogout } from './commands/leaderboard-logout.js'
import { runLeaderboardView } from './commands/leaderboard-view.js'
import { runMenu } from './commands/menu.js'
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
    const unknownCommand = program.args.find((arg) => typeof arg === 'string')
    if (unknownCommand) {
      console.error(`error: unknown command '${unknownCommand}'`)
      console.error(`Run 'aiusage --help' to see available commands.`)
      process.exit(1)
    }

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
  .option('--tool <tool>', 'Filter by any supported tool id')
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
  .option('--tool <tool>', 'Specific supported tool id to parse')
  .option('--no-progress', 'Hide real-time progress')
  .action(async (options) => {
    const db = createDatabase(DB_PATH)
    const reporter = options.progress !== false ? new ProgressReporter() : undefined
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
  .description('Clean data (old records or all data)')
  .option('--before <duration>', 'Delete data older than this (e.g., 30d, 180d)', '180d')
  .option('--all', 'Wipe all data (equivalent to former reset: all records, tool calls, watermark)')
  .option('--local-only', 'Only clean local data, do not propagate to remote backends')
  .option('--target <backend>', 'Target specific remote backend (github/s3/cloud)')
  .option('--yes', 'Skip local confirmation (remote deletion still requires confirmation)')
  .action(async (options) => {
    const isAll = !!options.all
    const localOnly = !!options.localOnly
    let days = 0

    if (isAll && options.before !== '180d') {
      console.error('Cannot use --all and --before together. Use one or the other.')
      process.exit(1)
    }

    if (!isAll) {
      const daysMatch = options.before.match(/^(\d+)d$/)
      if (!daysMatch) {
        console.error('Invalid duration format. Use e.g. 30d, 180d.')
        process.exit(1)
      }
      days = parseInt(daysMatch[1], 10)
    }

    const remoteBackends = localOnly ? [] : getRemoteBackends()

    // Print warning
    if (isAll) {
      console.log('\x1b[33m⚠ WARNING: This will delete ALL parsed data, tool calls, synced records,\x1b[0m')
      console.log('\x1b[33m  and the parse watermark. Next parse will re-import from scratch.\x1b[0m')
    } else {
      console.log(`This will delete local records older than ${days} days.`)
    }

    if (localOnly) {
      console.log('\x1b[36m  (--local-only: remote data will NOT be affected)\x1b[0m')
    }

    // Show affected remote backends
    if (remoteBackends.length > 0) {
      console.log('\nCloud sync is configured. The following remote backends will also be affected:')
      for (const rb of remoteBackends) {
        console.log(`  - ${rb.label}`)
      }
    }

    // Confirmation
    const ask = async (question: string): Promise<string> => {
      if (!process.stdin.isTTY) {
        console.error('Non-interactive mode detected. Use --local-only to skip remote propagation, or run interactively.')
        process.exit(1)
      }
      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      return new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
          rl.close()
          resolve(answer.trim())
        })
      })
    }

    if (!options.yes) {
      if (remoteBackends.length > 0) {
        const answer = await ask(`\n? Confirm deletion on local + ${remoteBackends.length} remote backend(s)? [y/N] `)
        if (answer.toLowerCase() !== 'y') {
          console.log('Cancelled.')
          process.exit(0)
        }
      } else {
        const answer = await ask('\n? Confirm? [y/N] ')
        if (answer.toLowerCase() !== 'y') {
          console.log('Cancelled.')
          process.exit(0)
        }
      }
    } else if (remoteBackends.length > 0) {
      // --yes but remote backends require explicit confirmation
      const answer = await ask('\n? Type "confirm" to proceed with remote deletion: ')
      if (answer !== 'confirm') {
        console.log('Cancelled.')
        process.exit(0)
      }
    }

    // Execute local clean
    const db = createDatabase(DB_PATH)
    if (isAll) {
      console.log('\nDeleting all local data...')
      const result = cleanAll(db)
      console.log(`  Local: deleted ${result.deletedRecords} records, ${result.deletedToolCalls} tool calls, ${result.deletedSyncedRecords} synced records`)
      if (result.watermarkRemoved) {
        console.log('  Watermark removed')
      }
    } else {
      console.log(`\nCleaning local records older than ${days} days...`)
      const result = cleanOldData(db, days)
      console.log(`  Local: deleted ${result.deletedCount} records, ${result.deletedSyncedCount} synced records, ${result.deletedOrphanToolCalls} orphan tool calls`)
    }
    db.close()

    // Propagate to remote backends
    if (remoteBackends.length > 0) {
      console.log('\nSyncing deletion to remote backends...')
      try {
        const propagation = await propagateClean({
          all: isAll,
          beforeDays: isAll ? undefined : days,
          target: options.target,
        })
        for (const r of propagation.backends) {
          if (r.status === 'ok') {
            console.log(`  ${r.backend.label}: ${r.detail}`)
          } else {
            console.log(`  ${r.backend.label}: skipped — ${r.detail}`)
          }
        }
      } catch (err) {
        console.error(`  Propagation failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    console.log('\nDone.')
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
  .option('--backend <backend>', 'Sync backend (cloud|github|s3|skip)')
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
    const reporter = new SyncProgressReporter()
    reporter.start()
    try {
      const result = await runSync(db, {
        onProgress: (progress) => reporter.update(progress),
      })
      reporter.done()
      if (result.status === 'ok') {
        console.log(`✓ Sync complete — pulled: ${result.pulledCount}, merged: ${result.mergedCount}, uploaded: ${result.uploadedCount}`)
      } else if (result.status === 'blocked_pending_consent') {
        console.error(`✗ ${result.error}`)
        process.exit(1)
      } else {
        console.error(`✗ Sync failed: ${result.error}`)
        process.exit(1)
      }
    } catch (e) {
      reporter.done()
      console.error(`✗ Sync failed: ${e instanceof Error ? e.message : e}`)
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

// leaderboard command
program
  .command('leaderboard')
  .description('View the public leaderboard')
  .allowExcessArguments(false)
  .option('-p, --period <period>', 'Period to view (daily|weekly|monthly|yearly|all_time)', 'daily')
  .option('-m, --metric <metric>', 'Ranking metric (tokens|cost)', 'tokens')
  .option('-s, --scope <scope>', 'Ranking scope (all|tool|model|tool_model)', 'all')
  .option('--tool <tool>', 'Filter by tool')
  .option('--model <model>', 'Filter by model')
  .option('-l, --limit <limit>', 'Number of rows to show, max 50', '20')
  .action(async (options) => {
    await runLeaderboardView(options)
  })

program
  .command('login')
  .description('Authorize this device for leaderboard uploads')
  .action(async () => {
    await runLeaderboardLogin()
  })

program
  .command('upload')
  .description('Upload aggregate token data to the public leaderboard')
  .action(async () => {
    await runLeaderboardUpload()
  })

program
  .command('upload-status')
  .description('Show leaderboard upload status')
  .action(async () => {
    await runLeaderboardStatus()
  })

program
  .command('logout')
  .description('Remove local leaderboard credentials')
  .action(async () => {
    await runLeaderboardLogout()
  })

// menu command
program
  .command('menu')
  .description('Interactive management menu')
  .action(async () => {
    await runMenu()
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
