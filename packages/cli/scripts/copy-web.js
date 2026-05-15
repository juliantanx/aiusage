#!/usr/bin/env node
// Copies the web SPA build into the CLI dist so it ships inside the npm package.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webBuildDir = join(__dirname, '..', '..', 'web', 'build')
const destDir = join(__dirname, '..', 'dist', 'web')

if (!existsSync(webBuildDir)) {
  console.error('Web build not found at', webBuildDir)
  console.error('Run: pnpm --filter @aiusage/web build')
  process.exit(1)
}

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true })
}

cpSync(webBuildDir, destDir, { recursive: true })
console.log('Web build copied to dist/web')
