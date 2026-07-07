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
    homedir: () => join(tmpdir(), 'aiusage-parse-codefuse-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

const testDir = join(tmpdir(), 'aiusage-parse-codefuse-test')
const codeFuseRoot = join(testDir, '.codefuse')

function writeJsonl(filePath: string, rows: Record<string, unknown>[]): void {
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
}

describe('runParse with CodeFuse data', () => {
  let cacheDb: Database.Database

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { codefuse: codeFuseRoot },
    }))
    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports all CodeFuse sources without double-counting snapshots or non-assistant rows', async () => {
    const workspace = join(testDir, 'workspace')
    const ccDir = join(codeFuseRoot, 'engine', 'cc', 'projects', '-workspace')
    const nativeDir = join(codeFuseRoot, 'projects', '-workspace')
    const embeddedCodexDir = join(codeFuseRoot, 'engine', 'codex', 'sessions', '2026', '07', '06')
    const externalTranscriptDir = join(testDir, 'external-transcripts')
    mkdirSync(ccDir, { recursive: true })
    mkdirSync(nativeDir, { recursive: true })
    mkdirSync(embeddedCodexDir, { recursive: true })
    mkdirSync(externalTranscriptDir, { recursive: true })

    const ccFile = join(ccDir, 'cc-session.jsonl')
    const nativeFile = join(nativeDir, 'native-session.jsonl')
    const embeddedCodexFile = join(embeddedCodexDir, 'rollout-embedded-session.jsonl')
    const embeddedCodexNoModelFile = join(embeddedCodexDir, 'rollout-embedded-no-model.jsonl')
    const duplicateSnapshotFile = join(ccDir, 'ant_cc_cc-session.json')
    const snapshotOnlyFile = join(ccDir, 'ant_cc_snapshot-only.json')
    const externalTranscript = join(externalTranscriptDir, 'snapshot-only.jsonl')
    writeFileSync(externalTranscript, '{}\n')

    writeJsonl(ccFile, [
      { type: 'user', sessionId: 'cc-session', cwd: workspace },
      {
        type: 'assistant',
        uuid: 'cc-uuid-1',
        sessionId: 'cc-session',
        timestamp: '2026-07-06T08:00:00.000Z',
        message: {
          id: 'duplicate-message-id',
          model: 'claude-opus-4-6',
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'pwd' } },
            { type: 'tool_use', name: 'Skill', input: { skill: 'review' } },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 30,
            cache_read_input_tokens: 40,
          },
        },
      },
      {
        type: 'user',
        uuid: 'cc-user-usage',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 999, output_tokens: 999 },
        },
      },
      {
        type: 'assistant',
        uuid: 'cc-synthetic',
        message: {
          model: '<synthetic>',
          usage: { input_tokens: 100, output_tokens: 1 },
        },
      },
    ])

    writeJsonl(nativeFile, [
      {
        type: 'assistant',
        uuid: 'native-uuid-1',
        sessionId: 'native-session',
        cwd: workspace,
        startTime: 1783334400000,
        modelId: 'antchat/claude-sonnet-4-6',
        message: {
          content: [
            { type: 'tool-call', toolName: 'Read', input: { filePath: join(workspace, 'a.ts') } },
          ],
        },
        usage: {
          promptTokens: 100,
          completionTokens: 25,
          cachedTokens: 60,
          totalTokens: 125,
        },
      },
      {
        type: 'tool',
        uuid: 'native-tool-usage',
        modelId: 'antchat/claude-sonnet-4-6',
        usage: {
          promptTokens: 999,
          completionTokens: 999,
          cachedTokens: 0,
        },
      },
    ])

    writeJsonl(embeddedCodexFile, [
      {
        timestamp: '2026-07-06T08:01:00.000Z',
        type: 'response_item',
        payload: { type: 'function_call', name: 'exec_command' },
      },
      {
        timestamp: '2026-07-06T08:01:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          model: 'gpt-4o',
          info: {
            last_token_usage: {
              input_tokens: 10,
              output_tokens: 5,
              cached_input_tokens: 2,
              reasoning_output_tokens: 1,
            },
          },
        },
      },
    ])

    writeJsonl(embeddedCodexNoModelFile, [
      {
        timestamp: '2026-07-06T08:01:02.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: 3,
              output_tokens: 2,
            },
          },
        },
      },
    ])

    writeFileSync(duplicateSnapshotFile, JSON.stringify({
      session_id: 'cc-session',
      model_id: 'glink/claude-opus-4-6',
      last_status_line: {
        context_window: {
          current_usage: {
            input_tokens: 5000,
            output_tokens: 500,
          },
        },
      },
      last_status_line_time: '2026-07-06T08:02:00.000Z',
    }))

    writeFileSync(snapshotOnlyFile, JSON.stringify({
      session_id: 'snapshot-only',
      model_id: 'glink/claude-opus-4-6[1m]',
      cwd: workspace,
      last_status_line: {
        transcript_path: externalTranscript,
        context_window: {
          current_usage: {
            input_tokens: 70,
            output_tokens: 8,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 4,
          },
        },
      },
      last_status_line_time: '2026-07-06T08:03:00.000Z',
    }))

    const result = await runParse(cacheDb, 'codefuse')

    expect(result.errors).toHaveLength(0)
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records WHERE tool = ?').get('codefuse')).toMatchObject({ n: 5 })
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM tool_calls').get()).toMatchObject({ n: 4 })
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records WHERE source_file = ?').get(duplicateSnapshotFile)).toMatchObject({ n: 0 })
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records WHERE source_file = ?').get(snapshotOnlyFile)).toMatchObject({ n: 1 })

    const cc = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cwd FROM records WHERE session_id = ?').get('cc-session') as any
    expect(cc).toMatchObject({
      model: 'claude-opus-4-6',
      input_tokens: 100,
      output_tokens: 20,
      cache_read_tokens: 40,
      cache_write_tokens: 30,
      cwd: workspace,
    })

    const native = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, ts, cwd FROM records WHERE session_id = ?').get('native-session') as any
    expect(native).toMatchObject({
      model: 'claude-sonnet-4-6',
      input_tokens: 40,
      output_tokens: 25,
      cache_read_tokens: 60,
      cache_write_tokens: 0,
      ts: 1783334400000,
      cwd: workspace,
    })

    const embedded = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, thinking_tokens FROM records WHERE session_id = ?').get('embedded-session') as any
    expect(embedded).toMatchObject({
      model: 'gpt-4o',
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 2,
      thinking_tokens: 1,
    })

    const embeddedNoModel = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cost_source FROM records WHERE session_id = ?').get('embedded-no-model') as any
    expect(embeddedNoModel).toMatchObject({
      model: 'unknown',
      input_tokens: 3,
      output_tokens: 2,
      cost_source: 'unknown',
    })

    const snapshot = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM records WHERE session_id = ?').get('snapshot-only') as any
    expect(snapshot).toMatchObject({
      model: 'claude-opus-4-6',
      input_tokens: 70,
      output_tokens: 8,
      cache_read_tokens: 30,
      cache_write_tokens: 4,
    })

    const toolCalls = cacheDb.prepare('SELECT name FROM tool_calls ORDER BY name').all() as Array<{ name: string }>
    expect(toolCalls.map((tc) => tc.name)).toEqual(['Bash', 'Read', 'exec_command', 'skill__review'])
    expect(toolCalls.map((tc) => tc.name).join('\n')).not.toContain('pwd')
    expect(toolCalls.map((tc) => tc.name).join('\n')).not.toContain('a.ts')

    await runParse(cacheDb, 'codefuse')
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM records WHERE tool = ?').get('codefuse')).toMatchObject({ n: 5 })
    expect(cacheDb.prepare('SELECT COUNT(*) AS n FROM tool_calls').get()).toMatchObject({ n: 4 })
  })
})
