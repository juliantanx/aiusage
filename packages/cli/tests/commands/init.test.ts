import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
vi.mock('../../src/github/credentials.js', () => ({
  saveGitHubCredentials: vi.fn(() => '11111111-1111-1111-1111-111111111111'),
  loadGitHubCredentials: vi.fn(),
}))

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
const configPath = join(testDir, '.aiusage', 'config.json')

describe('Init Command', () => {
  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

  it('stores new PATs outside config with an explicit authentication method', () => {
    runInit({
      backend: 'github',
      repo: 'user/aiusage-data',
      token: 'ghp_test123',
    })

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.sync.githubAuth).toEqual({ method: 'pat', credentialId: '11111111-1111-1111-1111-111111111111' })
    expect(JSON.stringify(config)).not.toContain('ghp_test123')
  })

  it('preserves App authentication after explicit login even with a PAT environment variable', () => {
    const githubAuth = { method: 'github-app', credentialId: 'id', login: 'owner', clientId: 'Iv1.test', installationId: 1 }
    writeFileSync(configPath, JSON.stringify({ sync: { backend: 'github', repo: 'owner/data', githubAuth }, syncInterval: 300000, weekStart: 0 }))
    vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'ci-pat')
    runInit({ backend: 'github', repo: 'owner/data', githubAuth: 'github-app' })
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.sync.githubAuth).toEqual(githubAuth)
    expect(config.syncInterval).toBe(300000); expect(config.weekStart).toBe(0)
    runInit({ backend: 'github', repo: 'owner/data' })
    expect(JSON.parse(readFileSync(configPath, 'utf8')).sync.githubAuth).toEqual({ method: 'pat' })
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

  it('uses an S3 credentialRef that matches the stored access key credential key', () => {
    runInit({
      backend: 's3',
      bucket: 'my-bucket',
      prefix: 'aiusage/',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.sync.credentialRef).toBe('s3/my-bucket/accessKeyId')
    expect(config.credentials['s3/my-bucket/accessKeyId']).toBe('AKIAIOSFODNN7EXAMPLE')
    expect(config.credentials['s3/my-bucket/secretAccessKey']).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
  })
})
