#!/usr/bin/env node
const { spawn } = require('child_process')
const { writeFileSync, mkdirSync } = require('fs')
const { homedir } = require('os')
const electron = require('electron')
const path = require('path')

const aiusageDir = path.join(homedir(), '.aiusage')
const pidPath = path.join(aiusageDir, 'widget.pid')

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
