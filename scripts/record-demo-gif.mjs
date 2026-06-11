#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const DEFAULT_DB = join(tmpdir(), 'aiusage-demo', 'cache.db')
const DEFAULT_OUT = 'packages/site/static/screenshots/aiusage-demo.gif'
const SESSION = 'aiusage-demo-gif'

const SHOTS = [
  { route: '/', file: '01-home.png', wait: 3200, duration: 1.7 },
  { route: '/tokens', file: '02-tokens-breakdown.png', wait: 1200, duration: 1.35 },
  { route: '/tokens', file: '03-tokens-total.png', wait: 600, duration: 1.05, click: '.mode-toggle button:nth-child(2)' },
  { route: '/cost', file: '04-cost.png', wait: 1200, duration: 1.35 },
  { route: '/models', file: '05-models-tokens.png', wait: 1200, duration: 1.25 },
  { route: '/models', file: '06-models-cost.png', wait: 600, duration: 1.05, click: '.mode-toggle button:nth-child(2)' },
  { route: '/sessions', file: '07-sessions.png', wait: 1000, duration: 1.25 },
  { route: '/projects', file: '08-projects.png', wait: 1000, duration: 1.15 },
  { route: '/tool-calls', file: '09-tool-calls.png', wait: 1000, duration: 1.15, click: '.type-tabs button:nth-child(3)' },
  { route: '/quotas', file: '10-quotas.png', wait: 1000, duration: 1.2 },
]

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    out: DEFAULT_OUT,
    db: DEFAULT_DB,
    apiPort: 3847,
    webPort: 5173,
    anchor: todayYmd(),
    seed: 'public-demo',
    keepFrames: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--out') options.out = args[++i] ?? options.out
    else if (arg === '--db') options.db = args[++i] ?? options.db
    else if (arg === '--api-port') options.apiPort = Number(args[++i] ?? options.apiPort)
    else if (arg === '--web-port') options.webPort = Number(args[++i] ?? options.webPort)
    else if (arg === '--anchor') options.anchor = args[++i] ?? options.anchor
    else if (arg === '--seed') options.seed = args[++i] ?? options.seed
    else if (arg === '--keep-frames') options.keepFrames = true
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/record-demo-gif.mjs [options]',
        '',
        'Options:',
        '  --out <path>       Output GIF path',
        '  --db <path>        Demo SQLite DB path',
        '  --api-port <port>  Demo API port, defaults to 3847',
        '  --web-port <port>  Vite dev server port, defaults to 5173',
        '  --anchor <date>    Anchor date, YYYY-MM-DD, defaults to today',
        '  --seed <text>      Stable random seed',
        '  --keep-frames      Keep temporary screenshots',
      ].join('\n'))
      process.exit(0)
    }
  }

  options.out = resolve(options.out)
  options.db = resolve(options.db)
  return options
}

function todayYmd() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
  return result
}

function commandExists(command) {
  const result = spawnSync('which', [command], { stdio: 'ignore' })
  return result.status === 0
}

function start(command, args, name, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))
  child.on('exit', code => {
    if (code !== 0 && code !== null) process.stderr.write(`[${name}] exited with ${code}\n`)
  })
  return child
}

async function waitForUrl(url, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function agent(args, stdio = 'pipe') {
  return run('agent-browser', ['--session', SESSION, ...args], { stdio })
}

async function captureShot(baseUrl, frameDir, shot) {
  const url = `${baseUrl}${shot.route}`
  agent(['open', url])
  agent(['wait', '--load', 'networkidle'])
  agent(['wait', '--fn', "!document.body.innerText.includes('Loading...')"], 'ignore')
  if (shot.click) {
    agent(['click', shot.click])
  }
  agent(['wait', String(shot.wait ?? 800)])
  agent(['screenshot', join(frameDir, shot.file)])
}

function buildConcatList(frameDir) {
  const lines = []
  for (const shot of SHOTS) {
    lines.push(`file '${join(frameDir, shot.file).replaceAll("'", "'\\''")}'`)
    lines.push(`duration ${shot.duration}`)
  }
  const last = SHOTS[SHOTS.length - 1]
  lines.push(`file '${join(frameDir, last.file).replaceAll("'", "'\\''")}'`)
  const listPath = join(frameDir, 'frames.txt')
  writeFileSync(listPath, `${lines.join('\n')}\n`, 'utf-8')
  return listPath
}

function encodeGif(frameDir, outPath) {
  const listPath = buildConcatList(frameDir)
  const palette = join(frameDir, 'palette.png')
  const scale = 'fps=8,scale=960:562:flags=lanczos'
  run('ffmpeg', [
    '-y',
    '-v', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-vf', `${scale},palettegen=stats_mode=diff`,
    palette,
  ])
  run('ffmpeg', [
    '-y',
    '-v', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-i', palette,
    '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
    outPath,
  ])
}

async function main() {
  const options = parseArgs()
  for (const command of ['pnpm', 'agent-browser', 'ffmpeg']) {
    if (!commandExists(command)) throw new Error(`${command} is required to record the demo GIF`)
  }

  run('pnpm', [
    '--dir', 'packages/cli',
    'exec', 'tsx', 'scripts/generate-demo-db.ts',
    '--out', options.db,
    '--anchor', options.anchor,
    '--seed', options.seed,
  ])

  const frameDir = mkdtempSync(join(tmpdir(), 'aiusage-demo-frames-'))
  let api = null
  let web = null

  const cleanup = () => {
    try { agent(['close'], 'ignore') } catch {}
    if (api) api.kill('SIGTERM')
    if (web) web.kill('SIGTERM')
    if (!options.keepFrames) rmSync(frameDir, { recursive: true, force: true })
    else console.log(`Frames kept at ${frameDir}`)
  }

  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })

  try {
    api = start('pnpm', [
      '--dir', 'packages/cli',
      'exec', 'tsx', 'scripts/serve-demo-api.ts',
      '--db', options.db,
      '--port', String(options.apiPort),
    ], 'api')
    await waitForUrl(`http://127.0.0.1:${options.apiPort}/api/summary?range=last30`)

    web = start('pnpm', [
      '--dir', 'packages/web',
      'exec', 'vite', 'dev',
      '--host', '127.0.0.1',
      '--port', String(options.webPort),
      '--strictPort',
    ], 'web')
    await waitForUrl(`http://127.0.0.1:${options.webPort}/`)

    const baseUrl = `http://127.0.0.1:${options.webPort}`
    agent(['close'], 'ignore')
    agent(['set', 'viewport', '1280', '750', '1'])
    agent(['open', baseUrl])
    agent([
      'eval',
      [
        "localStorage.clear();",
        "localStorage.setItem('aiusage-lang', 'en');",
        "localStorage.setItem('aiusage-theme', 'light');",
        "localStorage.setItem('aiusage-dateRange', JSON.stringify({ range: 'last30' }));",
        "localStorage.setItem('aiusage-selectedDevice', JSON.stringify(''));",
        "localStorage.setItem('aiusage-selectedTool', JSON.stringify(''));",
        "localStorage.setItem('aiusage-sidebar-collapsed', 'false');",
      ].join(' '),
    ])

    for (const shot of SHOTS) {
      await captureShot(baseUrl, frameDir, shot)
    }

    encodeGif(frameDir, options.out)
    console.log(`Wrote ${options.out}`)
  } finally {
    cleanup()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
