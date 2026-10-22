import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, walk } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'
import { getAuthShellState } from '../src/lib/auth-shell.js'

const source = readFileSync(
  fileURLToPath(new URL('../src/routes/+layout.svelte', import.meta.url)),
  'utf8',
)

interface Branch { condition: string; holds: boolean }
interface FoundSlot { branches: Branch[]; keys: string[] }

// Every <slot /> in the layout markup, with the {#if} conditions it sits under
// and whether each must hold (then-branch) or fail ({:else} branch), and the
// expressions of the {#key} blocks around it.
function findSlots(node: any, branches: Branch[] = [], keys: string[] = [], found: FoundSlot[] = []): FoundSlot[] {
  if (!node) return found
  if (node.type === 'Slot') found.push({ branches, keys })
  if (node.type === 'IfBlock') {
    const condition = source.slice(node.expression.start, node.expression.end)
    for (const child of node.children ?? []) findSlots(child, [...branches, { condition, holds: true }], keys, found)
    for (const child of node.else?.children ?? []) findSlots(child, [...branches, { condition, holds: false }], keys, found)
    return found
  }
  if (node.type === 'KeyBlock') keys = [...keys, source.slice(node.expression.start, node.expression.end)]
  for (const child of node.children ?? []) findSlots(child, branches, keys, found)
  for (const child of node.else?.children ?? []) findSlots(child, branches, keys, found)
  return found
}

// Names of the functions in the layout script that assign `name`.
function assignedIn(name: string): string[] {
  const functions: string[] = []
  const found: string[] = []
  walk((parse(source).instance as any).content, {
    enter(node: any) {
      if (node.type === 'FunctionDeclaration') functions.push(node.id.name)
      const target = node.type === 'AssignmentExpression' ? node.left : node.type === 'UpdateExpression' ? node.argument : null
      if (target?.type === 'Identifier' && target.name === name) found.push(functions.at(-1) ?? '<top level>')
    },
    leave(node: any) {
      if (node.type === 'FunctionDeclaration') functions.pop()
    },
  })
  return found
}

// The values the layout derives from its shell state.
function evaluate(condition: string, shellState: string): boolean {
  const scope = {
    shellState,
    shouldShowLogin: shellState === 'login-page',
    shouldShowPublicHome: shellState === 'public-home',
    mobileOpen: false,
    unlockOpen: false,
  }
  return Boolean(new Function(...Object.keys(scope), `return (${condition})`)(...Object.values(scope)))
}

const slots = findSlots(parse(source).html)
const rendersIn = (slot: FoundSlot, shellState: string) =>
  slot.branches.every(({ condition, holds }) => evaluate(condition, shellState) === holds)

describe('layout page slot (issue #109)', () => {
  it('renders the page through a single <slot />', () => {
    expect(slots).toHaveLength(1)
  })

  it('keeps the page mounted when the auth check settles on `/`', () => {
    const whileLoading = getAuthShellState({ pathname: '/', authEnabled: false, authenticated: false, authLoading: true })
    const settled = getAuthShellState({ pathname: '/', authEnabled: false, authenticated: false, authLoading: false })
    const unlocked = getAuthShellState({ pathname: '/', authEnabled: true, authenticated: true, authLoading: false })
    expect([whileLoading, settled, unlocked]).toEqual(['public-home', 'shell', 'shell'])

    const [slot] = slots
    for (const state of [whileLoading, settled]) expect(rendersIn(slot, state)).toBe(true)
    // Every {#if} around the slot takes the same branch in both states, so
    // Svelte keeps the block, and the page instance in it, instead of
    // creating a new one.
    for (const { condition } of slot.branches) {
      expect(evaluate(condition, whileLoading)).toBe(evaluate(condition, settled))
    }
  })

  it('mounts the page again only after an unlock, so the public home reloads with access', () => {
    const [slot] = slots
    expect(slot.keys).toEqual(['unlockCount'])
    expect(assignedIn('unlockCount')).toEqual(['handleLogin'])
  })

  it('does not render the page on the login screen or while a protected route is checked', () => {
    const [slot] = slots
    expect(rendersIn(slot, 'login-page')).toBe(false)
    expect(rendersIn(slot, 'loading')).toBe(false)
  })
})
