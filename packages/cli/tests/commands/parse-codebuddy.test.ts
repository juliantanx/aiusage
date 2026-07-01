import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-codebuddy-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

const testDir = join(tmpdir(), 'aiusage-parse-codebuddy-test')
const dataDir = join(testDir, 'cb-data')

/** Build a conversation messages/ directory with the given message files. */
function writeConversation(convId: string, messages: Record<string, unknown>[]): void {
  const messagesDir = join(dataDir, 'default', 'CodeBuddyIDE', 'ws', 'history', 'session-1', convId, 'messages')
  mkdirSync(messagesDir, { recursive: true })
  messages.forEach((msg, i) => {
    writeFileSync(join(messagesDir, `msg-${i}.json`), JSON.stringify(msg))
  })
}

function userMessage(text: string, cwd: string): Record<string, unknown> {
  return {
    role: 'user',
    message: JSON.stringify({
      role: 'user',
      content: [{ type: 'text', text: `<user_info>\nWorkspace Folder: ${cwd}\n</user_info>\n\n<user_query>\n${text}\n</user_query>` }],
    }),
    id: 'u1',
    createdAt: '2026-07-01T06:58:18.147Z',
  }
}

function assistantFinal(createdAt: string, extra: Record<string, unknown>): Record<string, unknown> {
  return { role: 'assistant', message: '{}', id: 'a-final', extra: JSON.stringify(extra), createdAt }
}

describe('runParse with CodeBuddy IDE data', () => {
  let cacheDb: Database.Database

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { 'codebuddy-ide': dataDir },
    }))
    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports one record per conversation from the final statsSnapshot', async () => {
    writeConversation('conv-1', [
      userMessage('帮我分析当前项目结构', '/Users/tjh/claude-projects/test'),
      // Intermediate assistant/tool messages carry no usage stats.
      { role: 'assistant', message: '{}', id: 'a1', extra: JSON.stringify({ modelId: 'deepseek-v4-flash' }), createdAt: '2026-07-01T06:58:21.819Z' },
      { role: 'tool', message: '{}', id: 't1', extra: '{}', createdAt: '2026-07-01T06:58:21.827Z' },
      assistantFinal('2026-07-01T06:58:36.818Z', {
        modelId: 'deepseek-v4-flash',
        lastStepInputTokens: 44551,
        lastStepOutputTokens: 683,
        lastStepCachedInputTokens: 28928,
        statsSnapshot: {
          cachedInputTokens: 66688,
          cacheWriteTokens: 0,
          cacheMissTokens: 44472,
          thinkingTokens: 0,
          lastOutputTokens: 683,
          credit: 1.5,
        },
      }),
    ])

    const result = await runParse(cacheDb, 'codebuddy')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, session_id, cwd FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'codebuddy',
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      input_tokens: 44472,
      output_tokens: 683,
      cache_read_tokens: 66688,
      cache_write_tokens: 0,
      thinking_tokens: 0,
      session_id: 'conv-1',
      cwd: '/Users/tjh/claude-projects/test',
    })
  })

  it('skips conversations with no usage stats', async () => {
    writeConversation('empty-conv', [
      userMessage('hi', '/tmp/x'),
      { role: 'assistant', message: '{}', id: 'a1', extra: JSON.stringify({ modelId: 'deepseek-v4-flash' }), createdAt: '2026-07-01T06:58:21.819Z' },
    ])

    const result = await runParse(cacheDb, 'codebuddy')

    expect(result.parsedCount).toBe(0)
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records').get()).toMatchObject({ n: 0 })
  })

  it('is idempotent and does not double-count on re-parse', async () => {
    writeConversation('conv-1', [
      userMessage('q', '/tmp/x'),
      assistantFinal('2026-07-01T06:58:36.818Z', {
        modelId: 'deepseek-v4-flash',
        statsSnapshot: { cachedInputTokens: 100, cacheMissTokens: 200, cacheWriteTokens: 0, thinkingTokens: 0, lastOutputTokens: 50 },
      }),
    ])

    await runParse(cacheDb, 'codebuddy')
    await runParse(cacheDb, 'codebuddy')

    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records').get()).toMatchObject({ n: 1 })
  })
})
