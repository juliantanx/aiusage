import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Data → Clean in `aiusage menu` must only start a clean on an explicit
// choice, and must leave the confirmation of a partial clean to the `clean`
// command (no `--yes`).

const home = mkdtempSync(join(tmpdir(), 'aiusage-menu-clean-'))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => home }
})

const spawnSync = vi.fn((_command: string, _args: string[], _options?: unknown) => ({ status: 0 }))

vi.mock('node:child_process', () => ({
  spawnSync,
  // The dashboard status line looks for a listener on the port; none here.
  execSync: vi.fn(() => { throw new Error('no dashboard') }),
  spawn: vi.fn(() => ({ unref: () => {} })),
}))

let answers: string[] = []
const questions: string[] = []

vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (question: string, callback: (answer: string) => void) => {
      questions.push(question)
      if (answers.length === 0) throw new Error(`Unexpected prompt: ${question}`)
      callback(answers.shift()!)
    },
    close: () => {},
  }),
}))

// Must import after mocks
const { runMenu } = await import('../../src/commands/menu.js')

const CLEAN_PROMPT = '1=Old data (180d)'
const CONTINUE = ''

/** Main menu → Data → Clean, answer its prompts, then back out and exit. */
async function runClean(cleanAnswers: string[]): Promise<string[][]> {
  answers = ['2', '4', ...cleanAnswers, CONTINUE, '0', '6']
  await runMenu()
  expect(answers).toEqual([])
  expect(questions.some(q => q.includes(CLEAN_PROMPT))).toBe(true)
  // The menu runs the CLI through this Node.js and its entry script, which
  // also works on Windows, where the npm shim is aiusage.cmd.
  return spawnSync.mock.calls.map(call => {
    expect(call[0]).toBe(process.execPath)
    const entry = call[1].indexOf(process.argv[1])
    expect(entry).toBeGreaterThanOrEqual(0)
    return call[1].slice(entry + 1)
  })
}

describe('menu: Data → Clean', () => {
  beforeEach(() => {
    spawnSync.mockClear()
    questions.length = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['an empty line', ''],
    ['0 (back)', '0'],
    ['an unknown number', '4'],
    ['a letter', 'q'],
    ['y', 'y'],
    ['a duration', '180d'],
    ['1 with trailing text', '1x'],
  ])('runs nothing on %s', async (_label, input) => {
    const commands = await runClean([input])
    expect(commands).toEqual([])
  })

  it('runs the 180-day clean on an explicit 1, without --yes', async () => {
    const commands = await runClean(['1'])
    expect(commands).toEqual([['clean', '--before', '180d']])
  })

  it('runs a custom clean with the duration given, without --yes', async () => {
    const commands = await runClean(['2', '30d'])
    expect(commands).toEqual([['clean', '--before', '30d']])
  })

  it('runs nothing when the custom duration is left blank', async () => {
    const commands = await runClean(['2', ''])
    expect(commands).toEqual([])
  })

  it('still wipes everything only after a typed confirm', async () => {
    expect(await runClean(['3', 'confirm'])).toEqual([['clean', '--all', '--yes']])
    spawnSync.mockClear()
    expect(await runClean(['3', ''])).toEqual([])
    expect(await runClean(['3', 'y'])).toEqual([])
  })
})
