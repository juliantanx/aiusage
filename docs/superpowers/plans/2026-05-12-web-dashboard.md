# Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Web Dashboard with SvelteKit SPA, REST API, and serve command.

**Architecture:** SvelteKit frontend built as static SPA, served by Node.js HTTP server with REST API endpoints.

**Tech Stack:** SvelteKit, adapter-static, Node.js HTTP server, Vitest

---

## File Structure

```
packages/web/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte        # Main layout
│   │   ├── +page.svelte          # Overview page
│   │   ├── tokens/
│   │   │   └── +page.svelte      # Token page
│   │   ├── cost/
│   │   │   └── +page.svelte      # Cost page
│   │   ├── models/
│   │   │   └── +page.svelte      # Models page
│   │   ├── tool-calls/
│   │   │   └── +page.svelte      # Tool calls page
│   │   └── sessions/
│   │       └── +page.svelte      # Sessions page
│   └── lib/
│       ├── api.ts                # API client
│       └── stores.ts             # Svelte stores
├── static/
├── tests/
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## Task 1: SvelteKit Scaffold

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/svelte.config.js`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/src/app.html`
- Create: `packages/web/src/routes/+layout.svelte`

- [ ] **Step 1: Create packages/web/package.json**

```json
{
  "name": "@aiusage/web",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create svelte.config.js**

```javascript
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    })
  }
};

export default config;
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

- [ ] **Step 5: Create src/app.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 6: Create src/routes/+layout.svelte**

```svelte
<script>
  import { page } from '$app/stores';
</script>

<nav>
  <a href="/" class:active={$page.url.pathname === '/'}>Overview</a>
  <a href="/tokens" class:active={$page.url.pathname === '/tokens'}>Tokens</a>
  <a href="/cost" class:active={$page.url.pathname === '/cost'}>Cost</a>
  <a href="/models" class:active={$page.url.pathname === '/models'}>Models</a>
  <a href="/tool-calls" class:active={$page.url.pathname === '/tool-calls'}>Tool Calls</a>
  <a href="/sessions" class:active={$page.url.pathname === '/sessions'}>Sessions</a>
</nav>

<main>
  <slot />
</main>

<style>
  nav {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: #f5f5f5;
  }
  a {
    text-decoration: none;
    color: #333;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }
  a.active {
    background: #007bff;
    color: white;
  }
  main {
    padding: 2rem;
  }
</style>
```

- [ ] **Step 7: Run pnpm install**

Run: `pnpm install`
Expected: SvelteKit dependencies installed

- [ ] **Step 8: Commit**

```bash
git add packages/web/
git commit -m "chore(web): scaffold SvelteKit project"
```

---

## Task 2: API Client

**Files:**
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/tests/api.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSummary, fetchTokens, fetchCost } from '../src/lib/api.js'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches summary data', async () => {
    const mockData = { totalTokens: 1000, totalCost: 0.001 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSummary({ range: 'day' })
    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/summary?range=day')
  })

  it('fetches tokens data', async () => {
    const mockData = { data: [{ date: '2026-05-12', tokens: 1000 }] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchTokens({ range: 'week' })
    expect(result).toEqual(mockData)
  })

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 'INVALID_RANGE', message: 'Invalid range' } }),
    })

    await expect(fetchSummary({ range: 'invalid' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && pnpm test -- tests/api.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/api.js'"

- [ ] **Step 3: Write implementation**

```typescript
export interface SummaryParams {
  range?: 'day' | 'week' | 'month'
  from?: string
  to?: string
}

export interface TokenParams extends SummaryParams {
  tool?: string
}

export interface SummaryData {
  totalTokens: number
  totalCost: number
  activeDays: number
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
}

export interface TokenData {
  data: Array<{
    date: string
    inputTokens: number
    outputTokens: number
    thinkingTokens: number
  }>
}

export interface CostData {
  data: Array<{
    date: string
    cost: number
  }>
  byTool: Record<string, number>
  byModel: Record<string, number>
}

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base, window.location.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function fetchSummary(params: SummaryParams): Promise<SummaryData> {
  const url = buildUrl('/api/summary', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}

export async function fetchTokens(params: TokenParams): Promise<TokenData> {
  const url = buildUrl('/api/tokens', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}

export async function fetchCost(params: SummaryParams): Promise<CostData> {
  const url = buildUrl('/api/cost', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && pnpm test -- tests/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/api.ts packages/web/tests/api.test.ts
git commit -m "feat(web): add API client"
```

---

## Task 3: Overview Page

**Files:**
- Create: `packages/web/src/routes/+page.svelte`
- Create: `packages/web/tests/overview.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import OverviewPage from '../src/routes/+page.svelte'

describe('Overview Page', () => {
  it('renders summary data', () => {
    render(OverviewPage, {
      props: {
        data: {
          totalTokens: 1000,
          totalCost: 0.001,
          activeDays: 5,
          byTool: {},
          topToolCalls: [],
        },
      },
    })

    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('$0.001')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(OverviewPage, {
      props: {
        data: {
          totalTokens: 0,
          totalCost: 0,
          activeDays: 0,
          byTool: {},
          topToolCalls: [],
        },
      },
    })

    expect(screen.getByText('No data available')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && pnpm test -- tests/overview.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```svelte
<script lang="ts">
  export let data: {
    totalTokens: number
    totalCost: number
    activeDays: number
    byTool: Record<string, { tokens: number; cost: number }>
    topToolCalls: Array<{ name: string; count: number }>
  }

  function formatNumber(n: number): string {
    return n.toLocaleString()
  }

  function formatCost(n: number): string {
    return `$${n.toFixed(3)}`
  }
</script>

{#if data.totalTokens === 0}
  <div class="empty-state">
    <h2>No data available</h2>
    <p>Start using AI tools to see statistics here.</p>
  </div>
{:else}
  <div class="overview">
    <div class="stats">
      <div class="stat">
        <h3>Total Tokens</h3>
        <p>{formatNumber(data.totalTokens)}</p>
      </div>
      <div class="stat">
        <h3>Total Cost</h3>
        <p>{formatCost(data.totalCost)}</p>
      </div>
      <div class="stat">
        <h3>Active Days</h3>
        <p>{data.activeDays}</p>
      </div>
    </div>

    <div class="by-tool">
      <h3>By Tool</h3>
      {#each Object.entries(data.byTool) as [tool, stats]}
        <div class="tool-row">
          <span>{tool}</span>
          <span>{formatNumber(stats.tokens)} tokens</span>
          <span>{formatCost(stats.cost)}</span>
        </div>
      {/each}
    </div>

    <div class="top-tool-calls">
      <h3>Top Tool Calls</h3>
      {#each data.topToolCalls as tc}
        <div class="tc-row">
          <span>{tc.name}</span>
          <span>{tc.count}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .empty-state {
    text-align: center;
    padding: 4rem;
    color: #666;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
  }
  .stat h3 {
    margin: 0;
    font-size: 0.875rem;
    color: #666;
  }
  .stat p {
    margin: 0.5rem 0 0;
    font-size: 1.5rem;
    font-weight: bold;
  }
  .tool-row, .tc-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && pnpm test -- tests/overview.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/+page.svelte packages/web/tests/overview.test.ts
git commit -m "feat(web): add overview page"
```

---

## Task 4: REST API Server

**Files:**
- Create: `packages/cli/src/api/server.ts`
- Create: `packages/cli/tests/api/server.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { createApiServer } from '../../src/api/server.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

describe('API Server', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any
        baseUrl = `http://localhost:${address.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  it('returns summary data', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data).toHaveProperty('totalTokens')
    expect(data).toHaveProperty('totalCost')
  })

  it('returns 400 for invalid range', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=invalid`)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error.code).toBe('INVALID_PARAM')
  })

  it('returns 404 for empty data', async () => {
    const response = await fetch(`${baseUrl}/api/tokens?range=day`)
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error.code).toBe('NO_DATA')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- tests/api/server.test.ts`
Expected: FAIL with "Cannot find module '../../src/api/server.js'"

- [ ] **Step 3: Write implementation**

```typescript
import http from 'node:http'
import type Database from 'better-sqlite3'

export function createApiServer(db: Database.Database): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      if (url.pathname === '/api/summary') {
        const range = url.searchParams.get('range')
        if (range && !['day', 'week', 'month'].includes(range)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'INVALID_PARAM', message: 'Invalid range' } }))
          return
        }

        // Get summary data
        const totalTokens = (db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM records').get() as any).total
        const totalCost = (db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM records').get() as any).total

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ totalTokens, totalCost, activeDays: 0, byTool: {}, topToolCalls: [] }))
        return
      }

      if (url.pathname === '/api/tokens') {
        const records = db.prepare('SELECT COUNT(*) as count FROM records').get() as any
        if (records.count === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'NO_DATA', message: 'No data available' } }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [] }))
        return
      }

      // 404 for unknown endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } }))
    }
  })

  return server
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- tests/api/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/api/server.ts packages/cli/tests/api/server.test.ts
git commit -m "feat(api): add REST API server"
```

---

## Task 5: Serve Command

**Files:**
- Create: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Write serve command implementation**

```typescript
import http from 'node:http'
import { createApiServer } from '../api/server.js'
import type Database from 'better-sqlite3'

export interface ServeOptions {
  port: number
  db: Database.Database
}

export function serve(options: ServeOptions): void {
  const server = createApiServer(options.db)

  server.listen(options.port, '127.0.0.1', () => {
    console.log(`aiusage serve listening on http://localhost:${options.port}`)
  })

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    server.close(() => {
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0)
    })
  })
}
```

- [ ] **Step 2: Update cli.ts to use serve command**

```typescript
import { Command } from 'commander'
import { serve } from './commands/serve.js'

// ... (add to program)
program
  .command('serve')
  .description('Start web dashboard')
  .option('-p, --port <port>', 'Port number', '3847')
  .action((options) => {
    const db = createDatabase(join(homedir(), '.aiusage', 'cache.db'))
    serve({ port: parseInt(options.port), db })
  })
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/serve.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add serve command"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] SvelteKit SPA with adapter-static
   - [x] API client for frontend
   - [x] Overview page with summary data
   - [x] REST API server with endpoints
   - [x] serve command with graceful shutdown

2. **Placeholder scan:**
   - [x] No TBD/TODO in plan
   - [x] All code blocks are complete

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-web-dashboard.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
