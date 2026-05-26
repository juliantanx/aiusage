module.exports = {
  apps: [
    {
      name: 'aiusage-server',
      script: 'aiusage',
      args: 'serve',
      autorestart: true,
      watch: false,
    },
    {
      name: 'aiusage-widget',
      script: 'aiusage-widget',
      args: '--foreground',
      autorestart: true,
      watch: false,
    }
  ]
}
