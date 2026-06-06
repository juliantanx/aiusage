import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutSource = readFileSync(
  fileURLToPath(new URL('../src/routes/+layout.svelte', import.meta.url)),
  'utf8',
)

function getRule(selector: string): string {
  const match = layoutSource.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

function hasDeclaration(rule: string, property: string, value: string): boolean {
  return new RegExp(`(^|;)\\s*${property}:\\s*${value}\\s*(;|$)`).test(rule)
}

describe('layout styles', () => {
  it('keeps public language toggle the same size for EN and Chinese labels', () => {
    const rule = getRule('.public-lang')

    expect(hasDeclaration(rule, 'width', '2.5rem')).toBe(true)
    expect(hasDeclaration(rule, 'min-width', '2.5rem')).toBe(true)
    expect(hasDeclaration(rule, 'padding', '0')).toBe(true)
  })
})
