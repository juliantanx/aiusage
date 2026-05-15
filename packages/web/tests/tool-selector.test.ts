import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { selectedTool, setTool } from '../src/lib/stores.js'

describe('Tool Selector Store', () => {
  it('selectedTool defaults to empty', () => {
    expect(get(selectedTool)).toBe('')
  })

  it('setTool updates selectedTool', () => {
    setTool('opencode')
    expect(get(selectedTool)).toBe('opencode')
  })
})
