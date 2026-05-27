// Template ecosystem config for PM2.
// The `aiusage pm2-start` command generates a config automatically
// based on what's installed (widget is included only if available).
module.exports = {
  apps: [
    {
      name: 'aiusage-server',
      script: 'aiusage',
      args: 'serve',
      interpreter: process.execPath,
      autorestart: true,
      watch: false,
    },
    // Uncomment below if @juliantanx/aiusage-widget is installed globally
    // {
    //   name: 'aiusage-widget',
    //   script: 'aiusage-widget',
    //   args: '--foreground',
    //   interpreter: process.execPath,
    //   autorestart: true,
    //   watch: false,
    // }
  ]
}
