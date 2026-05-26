#!/usr/bin/env node
const { spawn } = require('child_process')
const { writeFileSync, mkdirSync } from 'fs'
const { homedir } = require('os')
const electron = require('electron')
const path = require('path')

const foreground = process.argv.includes('--foreground')
const aiusageDir = path.join(homedir(), '.aiusage')
const pidPath = path.join(aiusageDir, 'widget.pid')

if (foreground) {
  // PM2 / service mode: run in foreground so the process manager can monitor it
  const child = spawn(
    String(electron),
    [path.join(__dirname, '..', 'dist', 'main.js')],
    { stdio: 'inherit' }
  )
  child.on('exit', (code) => process.exit(code ?? 0))
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
} else {
  // Normal mode: detach so closing the terminal doesn't kill the widget
  const child = spawn(
    String(electron),
    [path.join(__dirname, '..', 'dist', 'main.js')],
    { detached: true, stdio: 'ignore' }
  )

  if (child.pid) {
    try {
      mkdirSync(aiusageDir, { recursive: true })
      writeFileSync(pidPath, String(child.pid), { encoding: 'utf-8' })
    } catch {
      // Non-fatal: widget still starts, deduplication just won't work
    }
  }

  child.unref()
}
