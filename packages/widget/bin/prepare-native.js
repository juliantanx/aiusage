#!/usr/bin/env node
const { copyFileSync, mkdirSync, statSync, existsSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { execFileSync } = require('node:child_process')
const { rebuild } = require('@electron/rebuild')

const widgetRoot = join(__dirname, '..')
const nativeSource = join(
  dirname(require.resolve('better-sqlite3/package.json')),
  'build',
  'Release',
  'better_sqlite3.node'
)
const nativeDir = join(widgetRoot, 'dist', 'native')
const nativeTarget = join(nativeDir, 'better_sqlite3.node')

function isTargetFresh() {
  try {
    if (!existsSync(nativeTarget) || !existsSync(nativeSource)) return false
    const srcTime = statSync(nativeSource).mtimeMs
    const dstTime = statSync(nativeTarget).mtimeMs
    return dstTime >= srcTime
  } catch {
    return false
  }
}

async function main() {
  if (isTargetFresh() && !process.argv.includes('--force')) {
    console.log('Native binding is up to date, skipping rebuild (use --force to override)')
    return
  }

  const electronVersion = require('electron/package.json').version

  await rebuild({
    buildPath: widgetRoot,
    electronVersion,
    onlyModules: ['better-sqlite3'],
    force: true,
  })

  mkdirSync(nativeDir, { recursive: true })
  copyFileSync(nativeSource, nativeTarget)

  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--sign', '-', nativeTarget], { stdio: 'inherit' })
  }

  execFileSync('npm', ['run', 'install'], {
    cwd: dirname(require.resolve('better-sqlite3/package.json')),
    stdio: 'pipe',
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
