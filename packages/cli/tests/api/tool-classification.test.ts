import { describe, it, expect } from 'vitest'

function classifyToolCall(name: string): 'mcp' | 'skill' | 'builtin' {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name === 'Skill') return 'skill'
  return 'builtin'
}

function parseMcpName(name: string): { server: string; action: string; display: string } {
  const withoutPrefix = name.slice(5) // remove 'mcp__'
  const idx = withoutPrefix.indexOf('__')
  if (idx === -1) return { server: withoutPrefix, action: '', display: withoutPrefix }
  return {
    server: withoutPrefix.slice(0, idx),
    action: withoutPrefix.slice(idx + 2),
    display: `${withoutPrefix.slice(0, idx)} / ${withoutPrefix.slice(idx + 2)}`,
  }
}

function getToolTypeFilter(toolType: string | null): string {
  if (toolType === 'mcp') return "AND tc.name LIKE 'mcp__%'"
  if (toolType === 'skill') return "AND tc.name = 'Skill'"
  if (toolType === 'builtin') return "AND tc.name NOT LIKE 'mcp__%' AND tc.name != 'Skill'"
  return ''
}

describe('classifyToolCall', () => {
  it('classifies mcp__ prefix as mcp', () => {
    expect(classifyToolCall('mcp__brave__search')).toBe('mcp')
    expect(classifyToolCall('mcp__filesystem__read_file')).toBe('mcp')
  })

  it('classifies exact "Skill" as skill', () => {
    expect(classifyToolCall('Skill')).toBe('skill')
  })

  it('classifies SkillXYZ as builtin (not skill)', () => {
    expect(classifyToolCall('SkillX')).toBe('builtin')
  })

  it('classifies common tools as builtin', () => {
    expect(classifyToolCall('Read')).toBe('builtin')
    expect(classifyToolCall('Bash')).toBe('builtin')
    expect(classifyToolCall('Edit')).toBe('builtin')
  })
})

describe('parseMcpName', () => {
  it('parses standard mcp__server__action', () => {
    const result = parseMcpName('mcp__brave__search')
    expect(result.server).toBe('brave')
    expect(result.action).toBe('search')
    expect(result.display).toBe('brave / search')
  })

  it('handles complex action names', () => {
    const result = parseMcpName('mcp__filesystem__read_file')
    expect(result.server).toBe('filesystem')
    expect(result.action).toBe('read_file')
    expect(result.display).toBe('filesystem / read_file')
  })

  it('handles missing second double underscore', () => {
    const result = parseMcpName('mcp__bareserver')
    expect(result.server).toBe('bareserver')
    expect(result.action).toBe('')
    expect(result.display).toBe('bareserver')
  })
})

describe('getToolTypeFilter', () => {
  it('returns mcp filter for mcp type', () => {
    expect(getToolTypeFilter('mcp')).toBe("AND tc.name LIKE 'mcp__%'")
  })

  it('returns skill filter for skill type', () => {
    expect(getToolTypeFilter('skill')).toBe("AND tc.name = 'Skill'")
  })

  it('returns exclusion filter for builtin type', () => {
    expect(getToolTypeFilter('builtin')).toBe("AND tc.name NOT LIKE 'mcp__%' AND tc.name != 'Skill'")
  })

  it('returns empty string for null (all types)', () => {
    expect(getToolTypeFilter(null)).toBe('')
    expect(getToolTypeFilter('')).toBe('')
  })
})
