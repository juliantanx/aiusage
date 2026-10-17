import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { generateToolCallId } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { getUnsyncedRecords, markRecordsSynced, markRecordVersionsSynced } from '../../src/db/records.js'
import { runParse } from '../../src/commands/parse.js'

// tests/setup-home.ts points the home directory at a temporary directory of
// this test file, so ~/.aiusage below is never the real one.
const aiusageDir = join(homedir(), '.aiusage')
const watermarkPath = join(aiusageDir, 'watermark.json')
const DEVICE = 'device-upsert-test'
const CLOUD = 'cloud:https://sync.example.test'
const FILE_TARGET = 'github:someone/usage-data'

interface Block {
  type: 'tool_use' | 'text' | 'thinking'
  id?: string
  name?: string
  input?: Record<string, unknown>
  text?: string
}

/** One JSONL line as Claude Code writes it: one content block of a message. */
function line(messageId: string, block: Block, timestamp: string, outputTokens = 50): string {
  return JSON.stringify({
    type: 'assistant',
    cwd: '/work/project',
    timestamp,
    message: {
      id: messageId,
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content: [block],
      usage: { input_tokens: 100, output_tokens: outputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 },
    },
  })
}

function toolUse(id: string, name: string, input: Record<string, unknown> = {}): Block {
  return { type: 'tool_use', id, name, input }
}

describe('runParse with Claude Code logs (#89)', () => {
  let db: Database.Database
  let logsDir: string

  beforeEach(() => {
    rmSync(aiusageDir, { recursive: true, force: true })
    mkdirSync(aiusageDir, { recursive: true })
    logsDir = mkdtempSync(join(tmpdir(), 'aiusage-cc-upsert-'))
    writeFileSync(join(aiusageDir, 'state.json'), JSON.stringify({ deviceInstanceId: DEVICE }))
    writeFileSync(join(aiusageDir, 'config.json'), JSON.stringify({ sources: { 'claude-code': logsDir } }))
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
    rmSync(logsDir, { recursive: true, force: true })
  })

  function writeLog(name: string, lines: string[]): string {
    const dir = join(logsDir, '-work-project')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, name)
    writeFileSync(filePath, lines.join('\n') + '\n')
    return filePath
  }

  function toolCalls(): Array<{ id: string; record_id: string; name: string; ts: number; call_index: number }> {
    return db.prepare('SELECT id, record_id, name, ts, call_index FROM tool_calls ORDER BY ts, name').all() as Array<{ id: string; record_id: string; name: string; ts: number; call_index: number }>
  }

  function records(): Array<{ id: string; line_offset: number; output_tokens: number; ingested_at: number; updated_at: number; synced_at: number | null; cwd: string }> {
    return db.prepare('SELECT id, line_offset, output_tokens, ingested_at, updated_at, synced_at, cwd FROM records ORDER BY ts').all() as Array<{ id: string; line_offset: number; output_tokens: number; ingested_at: number; updated_at: number; synced_at: number | null; cwd: string }>
  }

  /** Forget how far every file was read, as a watermark reset does. */
  function resetFileWatermarks(): void {
    const watermark = JSON.parse(readFileSync(watermarkPath, 'utf-8'))
    watermark.files['claude-code'] = {}
    writeFileSync(watermarkPath, JSON.stringify(watermark))
  }

  /**
   * Rewrite the tool calls the way releases before this fix left them: one
   * row per record, for the block of the message's last line, under the id
   * that hashed (record id, name, ts, call index).
   */
  function downgradeToolCalls(lastBlocks: Array<{ recordId: string; name: string; ts: string }>): string[] {
    db.prepare('DELETE FROM tool_calls').run()
    const insert = db.prepare('INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, NULL, ?, ?, 0)')
    return lastBlocks.map(({ recordId, name, ts }) => {
      const tsMs = new Date(ts).getTime()
      const id = generateToolCallId(recordId, name, tsMs, 0)
      insert.run(id, recordId, name, tsMs)
      return id
    })
  }

  /** Make the watermark look like one written before the Claude Code parser was versioned. */
  function dropClaudeCodeParserVersion(): void {
    const watermark = JSON.parse(readFileSync(watermarkPath, 'utf-8'))
    expect(watermark.claudeCodeParserVersion).toBe(1)
    delete watermark.claudeCodeParserVersion
    writeFileSync(watermarkPath, JSON.stringify(watermark))
  }

  const threeBlockMessage = [
    line('msg_1', { type: 'text', text: 'Looking.' }, '2026-07-06T08:00:00.000Z', 3),
    line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
    line('msg_1', toolUse('toolu_grep', 'Grep'), '2026-07-06T08:00:02.000Z', 3),
    line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:03.000Z', 120),
  ]

  it('stores every tool call of a message written as one line per content block', async () => {
    writeLog('session-a.jsonl', threeBlockMessage)

    const result = await runParse(db, 'claude-code')

    expect(result.errors).toEqual([])
    expect(records()).toHaveLength(1)
    expect(records()[0]).toMatchObject({ output_tokens: 120, cwd: '/work/project' })
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Grep', 'Edit'])
    expect(new Set(toolCalls().map(tc => tc.record_id)).size).toBe(1)
  })

  it('keeps two blocks of one message that share a tool name and a timestamp apart', async () => {
    writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_read_1', 'Read'), '2026-07-06T08:00:01.000Z'),
      line('msg_1', toolUse('toolu_read_2', 'Read'), '2026-07-06T08:00:01.000Z'),
    ])

    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Read'])
  })

  it('adds the tool calls of lines that arrive in a later run', async () => {
    const filePath = writeLog('session-a.jsonl', threeBlockMessage.slice(0, 2))
    await runParse(db, 'claude-code')
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read'])

    appendFileSync(filePath, threeBlockMessage.slice(2).join('\n') + '\n')
    await runParse(db, 'claude-code')

    expect(records()).toHaveLength(1)
    expect(records()[0].output_tokens).toBe(120)
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Grep', 'Edit'])
  })

  it('leaves an unchanged record synced and with its tool calls when its log is read again', async () => {
    writeLog('session-a.jsonl', threeBlockMessage)
    writeLog('session-b.jsonl', [
      line('msg_2', toolUse('toolu_bash', 'Bash'), '2026-07-06T09:00:00.000Z'),
    ])
    await runParse(db, 'claude-code')
    const before = records()
    const callsBefore = toolCalls()
    expect(before).toHaveLength(2)
    expect(callsBefore).toHaveLength(4)

    // Cloud path: the acknowledgement is the updated_at that was sent.
    expect(markRecordVersionsSynced(db, before.map(r => ({ id: r.id, updatedAt: r.updated_at })), CLOUD)).toBe(2)
    // File backends: the acknowledgement is the time of the upload.
    const uploadedAt = Math.max(...before.map(r => r.updated_at)) + 1
    markRecordsSynced(db, before.map(r => r.id), uploadedAt, FILE_TARGET)
    expect(getUnsyncedRecords(db, CLOUD, DEVICE)).toEqual([])
    expect(getUnsyncedRecords(db, FILE_TARGET, DEVICE)).toEqual([])
    const synced = records()

    resetFileWatermarks()
    const result = await runParse(db, 'claude-code')

    expect(result.errors).toEqual([])
    expect(result.parsedCount).toBe(5)
    expect(records()).toEqual(synced)
    expect(toolCalls()).toEqual(callsBefore)
    expect(db.prepare('SELECT target, COUNT(*) AS n FROM sync_record_state GROUP BY target ORDER BY target').all()).toEqual([
      { target: CLOUD, n: 2 },
      { target: FILE_TARGET, n: 2 },
    ])
    expect(getUnsyncedRecords(db, CLOUD, DEVICE)).toEqual([])
    expect(getUnsyncedRecords(db, FILE_TARGET, DEVICE)).toEqual([])
    expect(getUnsyncedRecords(db, undefined, DEVICE)).toEqual([])
  })

  it('restores the tool calls an earlier release dropped, once, without counting any twice', async () => {
    writeLog('session-a.jsonl', threeBlockMessage)
    const goneFile = writeLog('session-gone.jsonl', [
      line('msg_gone', toolUse('toolu_gone_1', 'Read'), '2026-07-05T08:00:00.000Z'),
      line('msg_gone', toolUse('toolu_gone_2', 'Write'), '2026-07-05T08:00:01.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [gone, kept] = records()
    const legacyIds = downgradeToolCalls([
      { recordId: gone.id, name: 'Write', ts: '2026-07-05T08:00:01.000Z' },
      { recordId: kept.id, name: 'Edit', ts: '2026-07-06T08:00:03.000Z' },
    ])
    markRecordVersionsSynced(db, records().map(r => ({ id: r.id, updatedAt: r.updated_at })), CLOUD)
    const synced = records()
    // Claude Code deletes old transcripts; this record can no longer be read again.
    rmSync(goneFile)
    dropClaudeCodeParserVersion()

    await runParse(db, 'claude-code')

    // The record whose log still exists has all three calls, none of them twice.
    const keptCalls = toolCalls().filter(tc => tc.record_id === kept.id)
    expect(keptCalls.map(tc => tc.name)).toEqual(['Read', 'Grep', 'Edit'])
    expect(keptCalls.map(tc => tc.id)).not.toContain(legacyIds[1])
    // The record whose log is gone keeps the one call it had.
    expect(toolCalls().filter(tc => tc.record_id === gone.id).map(tc => tc.id)).toEqual([legacyIds[0]])
    // Tool calls are local: restoring them does not queue the records again.
    expect(records()).toEqual(synced)
    expect(getUnsyncedRecords(db, CLOUD, DEVICE)).toEqual([])
    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).claudeCodeParserVersion).toBe(1)

    // A second run reads nothing again and changes nothing.
    const after = toolCalls()
    const second = await runParse(db, 'claude-code')
    expect(second.parsedCount).toBe(0)
    expect(toolCalls()).toEqual(after)
  })

  it('removes old-scheme rows for a log whose re-import was interrupted after the watermark was saved', async () => {
    writeLog('session-a.jsonl', threeBlockMessage)
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: 'Edit', ts: '2026-07-06T08:00:03.000Z' }])
    // The parser version is already recorded, but this file was not read again yet.
    resetFileWatermarks()

    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Grep', 'Edit'])
    expect(toolCalls().map(tc => tc.id)).not.toContain(legacyId)
  })

  it('keeps an old-scheme call that the surviving log of its record does not contain', async () => {
    // The same message was copied into a second transcript without its tool
    // block; the transcript that had the block is gone.
    const full = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: 'Read', ts: '2026-07-06T08:00:01.000Z' }])
    rmSync(full)
    writeLog('session-b.jsonl', [
      line('msg_1', { type: 'text', text: 'Looking.' }, '2026-07-06T08:00:00.000Z'),
    ])
    dropClaudeCodeParserVersion()

    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => tc.id)).toEqual([legacyId])
  })

  it('rolls a file back as a whole when one of its tool calls cannot be written', async () => {
    writeLog('session-a.jsonl', threeBlockMessage)
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: 'Read', ts: '2026-07-06T08:00:01.000Z' }])
    // The Read line replaces the old-scheme row, then a line with an
    // unreadable timestamp yields a tool call that cannot be stored.
    writeLog('session-a.jsonl', [
      threeBlockMessage[1],
      line('msg_1', toolUse('toolu_grep', 'Grep'), 'not a timestamp'),
      line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:03.000Z', 999),
    ])
    resetFileWatermarks()

    const result = await runParse(db, 'claude-code')

    expect(result.errors).toHaveLength(1)
    // Neither the record update nor the replacement of the Read row was kept.
    expect(records()[0].output_tokens).toBe(120)
    expect(toolCalls().map(tc => tc.id)).toEqual([legacyId])
  })

  it('keeps a call without a block id that shares name, timestamp and index with a block-keyed one', async () => {
    // Neither is stored under a positional id.
    const positional = (tc: { id: string; record_id: string; name: string; ts: number; call_index: number }) =>
      tc.id === generateToolCallId(tc.record_id, tc.name, tc.ts, tc.call_index)
    writeLog('session-a.jsonl', [
      line('msg_1', { type: 'tool_use', name: 'Read', input: {} }, '2026-07-06T08:00:01.000Z'),
      line('msg_1', toolUse('toolu_read_2', 'Read'), '2026-07-06T08:00:01.000Z'),
    ])

    await runParse(db, 'claude-code')
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Read'])
    expect(toolCalls().some(positional)).toBe(false)

    resetFileWatermarks()
    await runParse(db, 'claude-code')
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Read'])
  })

  it('queues a changed record even when its cwd is filled in and an acknowledgement lies in the future', async () => {
    const filePath = writeLog('session-a.jsonl', threeBlockMessage.slice(0, 2))
    await runParse(db, 'claude-code')
    const [record] = records()
    // A row from before cwd was recorded, acknowledged by a file backend
    // whose upload time is ahead of this machine's clock.
    db.prepare("UPDATE records SET cwd = '' WHERE id = ?").run(record.id)
    const ahead = Date.now() + 86_400_000
    markRecordsSynced(db, [record.id], ahead, FILE_TARGET)
    expect(getUnsyncedRecords(db, FILE_TARGET, DEVICE)).toEqual([])

    appendFileSync(filePath, threeBlockMessage.slice(2).join('\n') + '\n')
    await runParse(db, 'claude-code')

    expect(records()[0]).toMatchObject({ output_tokens: 120, cwd: '/work/project' })
    expect(records()[0].updated_at).toBeGreaterThan(ahead)
    expect(getUnsyncedRecords(db, FILE_TARGET, DEVICE).map(r => r.id)).toEqual([record.id])
  })

  it('keeps a message that two transcripts share with the file it is stored under', async () => {
    const shared = [
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z'),
      line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:02.000Z', 120),
    ]
    const first = writeLog('session-a.jsonl', shared)
    await runParse(db, 'claude-code')
    // A resumed session: the earlier message is copied in front of a new one.
    writeLog('session-b.jsonl', [
      line('pad', { type: 'text', text: 'x' }, '2026-07-06T07:00:00.000Z'),
      ...shared,
      line('msg_2', toolUse('toolu_bash', 'Bash'), '2026-07-06T09:00:00.000Z'),
    ])
    await runParse(db, 'claude-code')
    expect(records()).toHaveLength(3)
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Edit', 'Bash'])
    const owned = db.prepare('SELECT source_file FROM records WHERE ts = ?').get(new Date('2026-07-06T08:00:02.000Z').getTime())
    expect(owned).toEqual({ source_file: first })

    markRecordVersionsSynced(db, records().map(r => ({ id: r.id, updatedAt: r.updated_at })), CLOUD)
    const synced = records()
    const calls = toolCalls()

    resetFileWatermarks()
    await runParse(db, 'claude-code')

    expect(records()).toEqual(synced)
    expect(toolCalls()).toEqual(calls)
    expect(getUnsyncedRecords(db, CLOUD, DEVICE)).toEqual([])

    // Once the owning transcript is gone, the other one takes the record over.
    rmSync(first)
    resetFileWatermarks()
    await runParse(db, 'claude-code')
    expect(records()).toHaveLength(3)
    expect(db.prepare('SELECT COUNT(DISTINCT source_file) AS n FROM records').get()).toEqual({ n: 1 })
    expect(toolCalls()).toEqual(calls)
  })

  it('takes later lines of a shared message from the other transcript without moving the record', async () => {
    // The first transcript stops after the first block of the message.
    const first = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
    ])
    await runParse(db, 'claude-code')
    const [before] = records()
    const owner = db.prepare('SELECT session_id FROM records WHERE id = ?').get(before.id) as { session_id: string }
    writeLog('session-b.jsonl', [
      line('pad', { type: 'text', text: 'x' }, '2026-07-06T07:00:00.000Z'),
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
      line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:02.000Z', 120),
    ])

    await runParse(db, 'claude-code')

    const stored = () => db.prepare('SELECT output_tokens, source_file, line_offset, session_id FROM records WHERE id = ?').get(before.id)
    expect(stored()).toEqual({ output_tokens: 120, source_file: first, line_offset: before.line_offset, session_id: owner.session_id })
    expect(toolCalls().map(tc => tc.name)).toEqual(['Read', 'Edit'])

    // Reading both files again, in either order, neither moves the record
    // nor takes it back to the earlier line.
    const settled = records()
    resetFileWatermarks()
    await runParse(db, 'claude-code')
    expect(records()).toEqual(settled)
    expect(stored()).toMatchObject({ output_tokens: 120, source_file: first })
  })

  it('refreshes derived fields of a shared record whose final state comes from the other transcript', async () => {
    const first = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
    ])
    await runParse(db, 'claude-code')
    writeLog('session-b.jsonl', [
      line('pad', { type: 'text', text: 'x' }, '2026-07-06T07:00:00.000Z'),
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
      line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:02.000Z', 120),
    ])
    await runParse(db, 'claude-code')
    const ts = new Date('2026-07-06T08:00:02.000Z').getTime()
    const stored = () => db.prepare('SELECT cost, output_tokens, source_file, updated_at FROM records WHERE ts = ?').get(ts) as { cost: number; output_tokens: number; source_file: string; updated_at: number }
    const settled = stored()
    expect(settled).toMatchObject({ output_tokens: 120, source_file: first })

    // The record was priced differently when it was stored; the logs are read again.
    db.prepare('UPDATE records SET cost = ? WHERE ts = ?').run(settled.cost + 1, ts)
    resetFileWatermarks()
    await runParse(db, 'claude-code')

    expect(stored()).toMatchObject({ cost: settled.cost, output_tokens: 120, source_file: first })
    expect(stored().updated_at).toBeGreaterThan(settled.updated_at)

    // Unchanged from here on.
    const refreshed = records()
    resetFileWatermarks()
    await runParse(db, 'claude-code')
    expect(records()).toEqual(refreshed)
  })

  it('keeps the cwd of the owning transcript when the other one was started elsewhere', async () => {
    const shared = line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z')
    writeLog('session-a.jsonl', [shared])
    await runParse(db, 'claude-code')
    // The session was resumed from another directory.
    writeLog('session-b.jsonl', [
      JSON.stringify({ ...JSON.parse(line('pad', { type: 'text', text: 'x' }, '2026-07-06T07:00:00.000Z')), cwd: '/work/elsewhere' }),
      shared,
    ])
    await runParse(db, 'claude-code')
    const owned = () => records().find(r => r.cwd !== '/work/elsewhere')
    expect(owned()).toMatchObject({ cwd: '/work/project' })
    markRecordVersionsSynced(db, records().map(r => ({ id: r.id, updatedAt: r.updated_at })), CLOUD)
    const synced = records()
    expect(synced.map(r => r.cwd)).toEqual(['/work/elsewhere', '/work/project'])

    for (let i = 0; i < 2; i++) {
      resetFileWatermarks()
      await runParse(db, 'claude-code')
      expect(records()).toEqual(synced)
      expect(getUnsyncedRecords(db, CLOUD, DEVICE)).toEqual([])
    }
  })

  it('does not rewrite block-keyed Skill calls when skill names are backfilled', async () => {
    writeLog('session-a.jsonl', [
      // A Skill block without a readable skill name, then a named one, in one message.
      line('msg_1', toolUse('toolu_skill_1', 'Skill', {}), '2026-07-06T08:00:01.000Z'),
      line('msg_1', toolUse('toolu_skill_2', 'Skill', { skill: 'review' }), '2026-07-06T08:00:02.000Z'),
    ])

    await runParse(db, 'claude-code')
    const first = toolCalls()
    expect(first.map(tc => tc.name)).toEqual(['skill__unknown', 'skill__review'])

    // backfillSkillNames runs at the end of every parse.
    await runParse(db, 'claude-code')
    expect(toolCalls()).toEqual(first)
  })

  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ])('keeps a call without a block id when another transcript (%s before %s) has a block-keyed call at its position', async (noIdFile, keyedFile) => {
    // Same message, timestamp and index in both transcripts, different calls.
    writeLog(`session-${noIdFile}.jsonl`, [
      line('msg_1', { type: 'tool_use', name: 'Skill', input: {} }, '2026-07-06T08:00:01.000Z'),
    ])
    writeLog(`session-${keyedFile}.jsonl`, [
      line('msg_1', toolUse('toolu_skill', 'Skill', { skill: 'review' }), '2026-07-06T08:00:01.000Z'),
    ])

    await runParse(db, 'claude-code')
    const first = toolCalls()
    expect(first.map(tc => tc.name).sort()).toEqual(['skill__review', 'skill__unknown'])

    for (let i = 0; i < 2; i++) {
      resetFileWatermarks()
      await runParse(db, 'claude-code')
      expect(toolCalls()).toEqual(first)
    }
  })

  it('takes the fuller state of a shared message whose lines carry one timestamp', async () => {
    const first = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
    ])
    await runParse(db, 'claude-code')
    writeLog('session-b.jsonl', [
      line('pad', { type: 'text', text: 'x' }, '2026-07-06T07:00:00.000Z'),
      line('msg_1', toolUse('toolu_read', 'Read'), '2026-07-06T08:00:01.000Z', 3),
      line('msg_1', toolUse('toolu_edit', 'Edit'), '2026-07-06T08:00:01.000Z', 120),
    ])
    await runParse(db, 'claude-code')

    const stored = () => db.prepare("SELECT output_tokens, source_file FROM records WHERE ts = ?").get(new Date('2026-07-06T08:00:01.000Z').getTime())
    expect(stored()).toEqual({ output_tokens: 120, source_file: first })

    // Reading the shorter transcript again does not take the record back.
    const settled = records()
    for (let i = 0; i < 2; i++) {
      resetFileWatermarks()
      await runParse(db, 'claude-code')
      expect(records()).toEqual(settled)
    }
    expect(stored()).toEqual({ output_tokens: 120, source_file: first })
  })

  it('does not rename a Skill call without a block id after another line of its message', async () => {
    writeLog('session-a.jsonl', [
      line('msg_1', { type: 'tool_use', name: 'Skill', input: {} }, '2026-07-06T08:00:01.000Z'),
      line('msg_1', toolUse('toolu_skill_2', 'Skill', { skill: 'review' }), '2026-07-06T08:00:02.000Z'),
    ])
    await runParse(db, 'claude-code')
    const first = toolCalls()
    expect(first.map(tc => tc.name)).toEqual(['skill__unknown', 'skill__review'])

    await runParse(db, 'claude-code')
    expect(toolCalls()).toEqual(first)

    // The same with both lines on one timestamp.
    writeLog('session-b.jsonl', [
      line('msg_2', { type: 'tool_use', name: 'Skill', input: {} }, '2026-07-06T09:00:00.000Z'),
      line('msg_2', toolUse('toolu_skill_3', 'Skill', { skill: 'plan' }), '2026-07-06T09:00:00.000Z'),
    ])
    await runParse(db, 'claude-code')
    await runParse(db, 'claude-code')
    expect(toolCalls().map(tc => tc.name).sort()).toEqual(['skill__plan', 'skill__review', 'skill__unknown', 'skill__unknown'])
  })

  it('does not name an old-scheme Skill call from a line it did not come from', async () => {
    writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_skill_1', 'Skill', { skill: 'review' }), '2026-07-06T08:00:02.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    // A call kept from a transcript that no longer exists: same record, but
    // not the line the record now points at.
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: 'Skill', ts: '2026-07-06T08:00:01.000Z' }])

    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => ({ id: tc.id, name: tc.name }))).toEqual([{ id: legacyId, name: 'Skill' }])
  })

  it('still names an old-scheme Skill call from its log line', async () => {
    writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_skill_1', 'Skill', { skill: 'review' }), '2026-07-06T08:00:01.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    downgradeToolCalls([{ recordId: record.id, name: 'Skill', ts: '2026-07-06T08:00:01.000Z' }])

    // No log is read again here (the watermark is current), so only the backfill runs.
    await runParse(db, 'claude-code')

    const ts = new Date('2026-07-06T08:00:01.000Z').getTime()
    expect(toolCalls()).toEqual([
      { id: generateToolCallId(record.id, 'skill__review', ts, 0), record_id: record.id, name: 'skill__review', ts, call_index: 0 },
    ])
  })

  it.each(['Skill', 'skill__unknown'])('replaces an old-scheme %s row with the named call of the line it came from', async (oldName) => {
    writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_skill_1', 'Skill', { skill: 'review' }), '2026-07-06T08:00:01.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: oldName, ts: '2026-07-06T08:00:01.000Z' }])
    dropClaudeCodeParserVersion()

    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => tc.name)).toEqual(['skill__review'])
    expect(toolCalls().map(tc => tc.id)).not.toContain(legacyId)
  })

  it.each(['Skill', 'skill__unknown'])('keeps an old-scheme %s call of a transcript that is gone when another transcript has a named skill at its position', async (oldName) => {
    // Two different Skill blocks of one message, same timestamp and index.
    const gone = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_skill_a', 'Skill', {}), '2026-07-06T08:00:01.000Z'),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: oldName, ts: '2026-07-06T08:00:01.000Z' }])
    rmSync(gone)
    writeLog('session-b.jsonl', [
      line('msg_1', toolUse('toolu_skill_b', 'Skill', { skill: 'review' }), '2026-07-06T08:00:01.000Z'),
    ])
    dropClaudeCodeParserVersion()

    await runParse(db, 'claude-code')

    const kept = [oldName, 'skill__review'].sort()
    expect(toolCalls().map(tc => tc.name).sort()).toEqual(kept)
    expect(toolCalls().map(tc => tc.id)).toContain(legacyId)

    // Reading the surviving transcript once more (a lost watermark) changes nothing.
    const settled = toolCalls()
    resetFileWatermarks()
    await runParse(db, 'claude-code')
    expect(toolCalls()).toEqual(settled)
  })

  it('does not rename a kept old-scheme Skill call to a block that is already stored', async () => {
    const gone = writeLog('session-a.jsonl', [
      line('msg_1', toolUse('toolu_skill_a', 'Skill', {}), '2026-07-06T08:00:01.000Z', 3),
    ])
    await runParse(db, 'claude-code')
    const [record] = records()
    const [legacyId] = downgradeToolCalls([{ recordId: record.id, name: 'skill__unknown', ts: '2026-07-06T08:00:01.000Z' }])
    rmSync(gone)
    // The surviving transcript takes the record over with a text line...
    const survivor = writeLog('session-b.jsonl', [
      line('msg_1', { type: 'text', text: 'Looking.' }, '2026-07-06T08:00:01.000Z', 3),
    ])
    await runParse(db, 'claude-code')
    expect(db.prepare('SELECT source_file FROM records WHERE id = ?').get(record.id)).toEqual({ source_file: survivor })
    expect(toolCalls().map(tc => tc.id)).toEqual([legacyId])

    // ...and later gains a named Skill block on the same timestamp.
    appendFileSync(survivor, line('msg_1', toolUse('toolu_skill_b', 'Skill', { skill: 'review' }), '2026-07-06T08:00:01.000Z', 120) + '\n')
    await runParse(db, 'claude-code')

    expect(toolCalls().map(tc => tc.name).sort()).toEqual(['skill__review', 'skill__unknown'])
    expect(toolCalls().find(tc => tc.name === 'skill__unknown')?.id).toBe(legacyId)
  })
})

describe('runParse after a log file that could not be written (#89)', () => {
  let db: Database.Database
  let sessionsDir: string

  beforeEach(() => {
    rmSync(aiusageDir, { recursive: true, force: true })
    mkdirSync(aiusageDir, { recursive: true })
    sessionsDir = mkdtempSync(join(tmpdir(), 'aiusage-codex-upsert-'))
    writeFileSync(join(aiusageDir, 'state.json'), JSON.stringify({ deviceInstanceId: DEVICE }))
    writeFileSync(join(aiusageDir, 'config.json'), JSON.stringify({ sources: { codex: sessionsDir } }))
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
    rmSync(sessionsDir, { recursive: true, force: true })
  })

  const tokenCount = (timestamp: string) => JSON.stringify({
    type: 'event_msg',
    timestamp,
    payload: { type: 'token_count', model: 'gpt-5', info: { last_token_usage: { input_tokens: 100, output_tokens: 20 } } },
  })
  const functionCall = (timestamp: string) => JSON.stringify({
    type: 'response_item',
    timestamp,
    payload: { type: 'function_call', name: 'shell' },
  })

  it('does not attach a pending Codex function call of the failed file to the next file', async () => {
    // The usage line cannot be stored; the function call after it has no usage of its own.
    writeFileSync(join(sessionsDir, 'rollout-a.jsonl'), [
      tokenCount('not a timestamp'),
      functionCall('2026-07-06T08:00:01.000Z'),
    ].join('\n') + '\n')
    writeFileSync(join(sessionsDir, 'rollout-b.jsonl'), tokenCount('2026-07-06T09:00:00.000Z') + '\n')

    const result = await runParse(db, 'codex')

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('rollout-a.jsonl')
    expect(db.prepare('SELECT source_file FROM records').all()).toEqual([{ source_file: join(sessionsDir, 'rollout-b.jsonl') }])
    expect(db.prepare('SELECT name, record_id FROM tool_calls').all()).toEqual([])
  })
})
