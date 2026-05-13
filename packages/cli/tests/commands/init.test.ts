import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-init-cmd-test'),
  }
})

// Must import after mock
const { runInit } = await import('../../src/commands/init.js')

const testDir = join(tmpdir(), 'aiusage-init-cmd-test')

describe('Init Command', () => {
  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('saves config without sync when backend is skip', () => {
    const result = runInit({ backend: 'skip', device: 'test-device' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('without cloud sync')
  })

  it('saves config without sync when no backend specified', () => {
    const result = runInit({ device: 'test-device' })
    expect(result.success).toBe(true)
  })

  it('fails when GitHub repo is missing', () => {
    const result = runInit({ backend: 'github', token: 'test-token' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('repository')
  })

  it('fails when GitHub token is missing', () => {
    const result = runInit({ backend: 'github', repo: 'user/repo' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('Token')
  })

  it('configures GitHub backend', () => {
    const result = runInit({
      backend: 'github',
      repo: 'user/aiusage-data',
      token: 'ghp_test123',
      device: 'macbook',
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('GitHub sync configured')
  })

  it('fails when S3 bucket is missing', () => {
    const result = runInit({ backend: 's3', accessKeyId: 'k', secretAccessKey: 's' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('bucket')
  })

  it('fails when S3 credentials are missing', () => {
    const result = runInit({ backend: 's3', bucket: 'my-bucket' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('access key')
  })

  it('configures S3 backend', () => {
    const result = runInit({
      backend: 's3',
      bucket: 'my-bucket',
      prefix: 'aiusage/',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      endpoint: 'https://test.r2.cloudflarestorage.com',
      region: 'auto',
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('S3 sync configured')
  })
})
