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
    homedir: () => join(tmpdir(), 'aiusage-parse-qoder-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

describe('runParse with qoder', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-qoder-test')
  let cacheDb: Database.Database
  let qoderSegmentPath: string

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { qoder: join(testDir, '.qoder') },
    }))

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)

    qoderSegmentPath = join(testDir, '.qoder', 'logs', 'sessions', '-workspace-project', 'sess_qoder', 'segments', '2026-05-12T17-06-16-450+08-00-xj6lr3-p16146.jsonl')
    mkdirSync(join(qoderSegmentPath, '..'), { recursive: true })
    writeFileSync(qoderSegmentPath, [
      '{"ts":"2026-05-12T17:14:20.800+08:00","seq":10,"level":"info","type":"tool.requested","turn_id":"turn_1","loop_id":"turn_1:1","tool_call_id":"call_1","data":{"tool_name":"Bash","args":{"command":"pwd"}}}',
      '{"ts":"2026-05-12T17:14:20.913+08:00","seq":11,"level":"info","type":"model.response.completed","turn_id":"turn_1","loop_id":"turn_1:1","request_id":"req_1","data":{"request_index":1,"model":"ultimate","stop_reason":"tool_use","content_block_count":1,"input_tokens":23048,"output_tokens":115,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}',
      '{"ts":"2026-05-12T17:14:30.366+08:00","seq":12,"level":"info","type":"model.response.completed","turn_id":"turn_1","loop_id":"turn_1:2","request_id":"req_2","data":{"request_index":2,"model":"gpt-4o","stop_reason":"end_turn","content_block_count":1,"input_tokens":23163,"output_tokens":80,"cache_read_input_tokens":23045,"cache_creation_input_tokens":0}}',
      '',
    ].join('\n'))
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports qoder records from session segment logs', async () => {
    const result = await runParse(cacheDb, 'qoder')

    expect(result.parsedCount).toBe(2)
    expect(result.toolCallCount).toBe(1)
    expect(result.errors).toHaveLength(0)

    const rows = cacheDb.prepare('SELECT tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cost, cost_source, session_id FROM records ORDER BY line_offset').all() as any[]
    expect(rows.map(r => r.tool)).toEqual(['qoder', 'qoder'])
    expect(rows[0].model).toBe('qoder-ultimate')
    expect(rows[0].provider).toBe('qoder')
    expect(rows[0].cost).toBeGreaterThan(0)
    expect(rows[0].cost_source).toBe('pricing')
    expect(rows[0].session_id).toBe('sess_qoder')
    expect(rows[1].cache_read_tokens).toBe(23045)

    const toolCalls = cacheDb.prepare('SELECT name FROM tool_calls').all() as any[]
    expect(toolCalls.map(tc => tc.name)).toEqual(['Bash'])
  })

  it('respects the file watermark on subsequent parses', async () => {
    const result1 = await runParse(cacheDb, 'qoder')
    expect(result1.parsedCount).toBe(2)

    const result2 = await runParse(cacheDb, 'qoder')
    expect(result2.parsedCount).toBe(0)
    expect(result2.toolCallCount).toBe(0)
  })

  it('skips qoder when filter is different tool', async () => {
    const result = await runParse(cacheDb, 'claude-code')
    expect(result.parsedCount).toBe(0)
    expect(result.toolCallCount).toBe(0)
  })

  it('accepts a qoder config path pointing at the .qoder root', async () => {
    const customRoot = join(testDir, 'custom-qoder-root')
    const segmentPath = join(customRoot, 'logs', 'sessions', '-windows-project', 'sess_windows', 'segments', '2026-05-24T02-03-23.jsonl')
    mkdirSync(join(segmentPath, '..'), { recursive: true })
    writeFileSync(segmentPath, [
      '{"ts":"2026-05-24T02:03:23.100+08:00","type":"model.response.completed","turn_id":"turn_2","loop_id":"turn_2:1","data":{"model":"gpt-4o","input_tokens":100,"output_tokens":20,"cache_read_input_tokens":10,"cache_creation_input_tokens":0}}',
      '',
    ].join('\n'))
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { qoder: customRoot },
    }))

    const result = await runParse(cacheDb, 'qoder')

    expect(result.parsedCount).toBe(1)
    expect(result.errors).toHaveLength(0)

    const row = cacheDb.prepare('SELECT session_id, source_file FROM records').get() as any
    expect(row.session_id).toBe('sess_windows')
    expect(row.source_file).toBe(segmentPath)
  })

  it('auto-discovers qoder sessions from USERPROFILE when no explicit source is configured', async () => {
    // Remove the default .qoder dir created in beforeEach so only the USERPROFILE path is discovered.
    rmSync(join(testDir, '.qoder'), { recursive: true, force: true })

    const windowsHome = join(testDir, 'windows-user-home')
    const segmentPath = join(windowsHome, '.qoder', 'logs', 'sessions', '-project', 'sess_win', 'segments', 'seg.jsonl')
    mkdirSync(join(segmentPath, '..'), { recursive: true })
    writeFileSync(segmentPath, [
      '{"ts":"2026-05-24T10:00:00.000Z","type":"model.response.completed","loop_id":"l1","data":{"model":"efficient","input_tokens":100,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}',
      '',
    ].join('\n'))

    // Remove explicit qoder source so auto-discovery via env var kicks in
    writeFileSync(join(testDir, '.aiusage', 'config.json'), '{}')

    const prev = process.env.USERPROFILE
    process.env.USERPROFILE = windowsHome
    try {
      const result = await runParse(cacheDb, 'qoder')
      expect(result.parsedCount).toBe(1)
      expect(result.errors).toHaveLength(0)
      const row = cacheDb.prepare('SELECT session_id FROM records').get() as any
      expect(row.session_id).toBe('sess_win')
    } finally {
      if (prev === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = prev
    }
  })

  it('does not import qoder desktop transcripts or context-usage snapshots', async () => {
    const customRoot = join(testDir, 'desktop-qoder-root')
    const transcriptPath = join(customRoot, 'projects', 'project-1', 'transcript', 'session.jsonl')
    mkdirSync(join(transcriptPath, '..'), { recursive: true })
    writeFileSync(transcriptPath, [
      '{"type":"assistant","sessionId":"session","timestamp":"2026-05-23T09:35:49.6527118Z","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}',
      '',
    ].join('\n'))

    const desktopLogPath = join(customRoot, 'logs', '20260523T181255', 'window3', 'agent.log')
    mkdirSync(join(desktopLogPath, '..'), { recursive: true })
    writeFileSync(desktopLogPath, [
      '2026-05-23 18:16:19.638 [info] [ChatSessionService] Context usage update: {"sessionId":"session","usedTokens":26737,"limitTokens":1000000}',
      '',
    ].join('\n'))
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { qoder: customRoot },
    }))

    const result = await runParse(cacheDb, 'qoder')

    expect(result.parsedCount).toBe(0)
    expect(result.toolCallCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})
