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
    homedir: () => join(tmpdir(), 'aiusage-parse-ui-messages-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

describe('runParse with VS Code task ui_messages', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-ui-messages-test')
  let cacheDb: Database.Database

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: {
        roocode: join(testDir, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks'),
        kilocode: join(testDir, '.config', 'Code', 'User', 'globalStorage', 'kilocode.kilo-code', 'tasks'),
        kiro: join(testDir, '.kiro', 'sessions', 'cli'),
      },
    }))

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports Roo Code task usage from ui_messages.json', async () => {
    const taskDir = join(testDir, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks', 'task-1')
    mkdirSync(taskDir, { recursive: true })
    writeFileSync(join(taskDir, 'ui_messages.json'), JSON.stringify([
      {
        ts: 1778821880545,
        say: 'api_req_started',
        text: JSON.stringify({
          apiProtocol: 'anthropic',
          model: 'claude-sonnet-4-6',
          tokensIn: 120,
          tokensOut: 30,
          cacheReads: 50,
          cacheWrites: 5,
          cost: 0,
        }),
      },
    ]))

    const result = await runParse(cacheDb, 'roocode')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'roocode',
      model: 'claude-sonnet-4-6',
      input_tokens: 120,
      output_tokens: 30,
      cache_read_tokens: 50,
      cache_write_tokens: 5,
      session_id: 'task-1',
    })
  })

  it('imports Kiro session JSON turns with token counts', async () => {
    const sessionDir = join(testDir, '.kiro', 'sessions', 'cli')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(sessionDir, '11111111-1111-4111-8111-111111111111.json'), JSON.stringify({
      session_id: 'kiro-session-1',
      session_state: {
        rts_model_state: {
          model_info: { model_id: 'anthropic.claude-sonnet-4-20250514-v1:0' },
        },
        conversation_metadata: {
          user_turn_metadatas: [
            {
              loop_id: { rand: 42 },
              request_start_timestamp_ms: 1778821880545,
              input_token_count: 400,
              output_token_count: 80,
            },
          ],
        },
      },
    }))

    const result = await runParse(cacheDb, 'kiro')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, input_tokens, output_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kiro',
      model: 'claude-sonnet-4',
      input_tokens: 400,
      output_tokens: 80,
      session_id: 'kiro-session-1',
    })
  })
})
