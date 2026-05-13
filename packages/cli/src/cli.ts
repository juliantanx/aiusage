import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { serve } from './commands/serve.js'
import { runInit } from './commands/init.js'
import { runSync } from './commands/sync.js'
import { generateSummary } from './commands/summary.js'
import { generateStatus } from './commands/status.js'
import { exportData } from './commands/export.js'
import { cleanOldData } from './commands/clean.js'
import { recalcPricing } from './commands/recalc.js'
import { runParse } from './commands/parse.js'
import { createDatabase } from './db/index.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

const program = new Command()

program
  .name('aiusage')
  .version('0.0.1')
  .description('CLI tool for AI usage statistics')

// Default command: summary
program
  .action(() => {
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    const summary = generateSummary(db)
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
  .action(() => {
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    const summary = generateSummary(db)
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
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    const status = generateStatus(db)
    console.log(`Version:     ${status.version}`)
    console.log(`Device:      ${status.deviceName}`)
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
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
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
  .option('--tool <tool>', 'Specific tool to parse (claude-code|codex|openclaw)')
  .action(async (options) => {
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    try {
      const result = await runParse(db, options.tool)
      console.log(`Parsed ${result.parsedCount} records, ${result.toolCallCount} tool calls.`)
      if (result.errors.length > 0) {
        console.warn(`${result.errors.length} errors encountered.`)
      }
    } catch (e) {
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
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    const result = cleanOldData(db, days)
    console.log(`Deleted ${result.deletedCount} records, ${result.deletedSyncedCount} synced records, ${result.deletedOrphanToolCalls} orphan tool calls.`)
    db.close()
  })

// recalc command
program
  .command('recalc')
  .description('Recalculate costs')
  .option('--pricing', 'Recalculate using latest pricing')
  .action(() => {
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
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
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
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
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    const result = await runSync(db)
    if (result.status === 'ok') {
      console.log(`✓ Sync complete — pulled: ${result.pulledCount}, uploaded: ${result.uploadedCount}`)
    } else if (result.status === 'blocked_pending_consent') {
      console.error(`✗ ${result.error}`)
      process.exit(1)
    } else {
      console.error(`✗ Sync failed: ${result.error}`)
      process.exit(1)
    }
    db.close()
  })

export { program }
