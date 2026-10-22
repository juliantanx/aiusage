import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, walk } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../src/routes/+page.svelte', import.meta.url)),
  'utf8',
)
const script = (parse(source).instance as any).content

const text = (node: any) => source.slice(node.start, node.end).replace(/\s+/g, ' ')

// The body statements of the callback passed to `onMount(...)` / `onDestroy(...)`.
function lifecycleBody(name: string): any[] {
  const call = script.body.find((n: any) =>
    n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && n.expression.callee.name === name)
  return call.expression.arguments[0].body.body
}

function functionBody(name: string): any[] {
  return script.body.find((n: any) => n.type === 'FunctionDeclaration' && n.id.name === name).body.body
}

// Whether the statement itself awaits (callbacks inside it do not count).
function awaits(statement: any): boolean {
  let found = false
  walk(statement, {
    enter(node: any) {
      if (node.type === 'AwaitExpression') found = true
      if (node !== statement && /Function/.test(node.type)) this.skip()
    },
  })
  return found
}

describe('Home refresh lifecycle (issue #109)', () => {
  const onMount = lifecycleBody('onMount')

  it('marks the page destroyed before clearing its timers', () => {
    expect(text(lifecycleBody('onDestroy')[0])).toBe('destroyed = true')
  })

  it('starts no refresh cycle once the page is destroyed', () => {
    expect(text(functionBody('startRefreshCycle')[0])).toBe('if (destroyed) return')
  })

  it('adds the settings listener before the first await', () => {
    const listener = onMount.findIndex((s: any) => text(s).startsWith('window.addEventListener(SETTINGS_UPDATED_EVENT'))
    const firstAwait = onMount.findIndex(awaits)
    expect(listener).toBeGreaterThanOrEqual(0)
    expect(firstAwait).toBeGreaterThan(listener)
  })

  it('stops mounting after any await that the page did not outlive', () => {
    const awaiting = onMount.map((s: any, i: number) => (awaits(s) ? i : -1)).filter((i: number) => i >= 0)
    expect(awaiting.length).toBeGreaterThan(0)
    for (const i of awaiting) expect(text(onMount[i + 1])).toBe('if (destroyed) return')
  })
})
