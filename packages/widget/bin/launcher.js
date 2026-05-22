#!/usr/bin/env node
const { spawn } = require('child_process')
const electron = require('electron')
const path = require('path')

const child = spawn(
  String(electron),
  [path.join(__dirname, '..', 'dist', 'main.js')],
  { detached: true, stdio: 'ignore' }
)
child.unref()
