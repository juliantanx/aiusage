import { Command } from 'commander'
import { serve } from './commands/serve.js'
import { runInit } from './commands/init.js'
import { runSync } from './commands/sync.js'
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
    console.log('Running summary...')
  })

// summary command
program
  .command('summary')
  .description('Show usage summary')
  .option('--week', 'Show this week')
  .option('--month', 'Show this month')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action((options) => {
    console.log('Running summary with options:', options)
  })

// status command
program
  .command('status')
  .description('Show current status')
  .action(() => {
    console.log('Running status...')
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
    console.log('Running export with options:', options)
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
    console.log('Running clean with options:', options)
  })

// recalc command
program
  .command('recalc')
  .description('Recalculate costs')
  .option('--pricing', 'Recalculate using latest pricing')
  .action((options) => {
    console.log('Running recalc with options:', options)
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
