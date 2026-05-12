import { Command } from 'commander'

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

export { program }
