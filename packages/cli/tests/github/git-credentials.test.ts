import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitCredentialOptions } from '../../src/github/git-credentials.js'
const exec = promisify(execFile)
const dirs: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function credential(action: string, input: string, cwd: string) {
  const options = gitCredentialOptions('owner/data', 'integration-secret')
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('git', [...options.args, 'credential', action], { cwd, env: options.env, windowsHide: true })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d)
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}
describe('real Git ephemeral credential helper', () => {
  it('provides credentials only over the Git protocol pipe and never persists them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiusage-git-helper-')); dirs.push(dir)
    await exec('git', ['init', dir])
    await exec('git', ['remote', 'add', 'origin', 'https://github.com/owner/data.git'], { cwd: dir })
    const local = gitCredentialOptions('owner/data')
    await exec('git', [...local.args, 'commit', '--allow-empty', '-m', 'sync test'], { cwd: dir, env: local.env })
    const prompt = 'protocol=https\nhost=github.com\npath=owner/data.git\n\n'
    const response = await credential('fill', prompt, dir)
    expect(response.code).toBe(0)
    expect(response.stdout).toContain('password=integration-secret')
    expect(response.stderr).not.toContain('integration-secret')
    await credential('approve', prompt.trimEnd() + '\nusername=x-access-token\npassword=integration-secret\n\n', dir)
    const config = readFileSync(join(dir, '.git/config'), 'utf8')
    expect(config).not.toContain('integration-secret'); expect(config).not.toContain('credential.helper')
    expect(config).toContain('https://github.com/owner/data.git')
    expect(JSON.stringify(gitCredentialOptions('owner/data', 'integration-secret').args)).not.toContain('integration-secret')
  })
  it.each(['protocol=https\nhost=evil.example\npath=owner/data.git\n\n', 'protocol=https\nhost=github.com\npath=other/data.git\n\n', 'protocol=http\nhost=github.com\npath=owner/data.git\n\n'])('refuses credentials for an unrelated destination', async input => {
    const dir = mkdtempSync(join(tmpdir(), 'aiusage-git-helper-')); dirs.push(dir)
    const result = await credential('fill', input, dir)
    expect(result.code).not.toBe(0); expect(result.stdout + result.stderr).not.toContain('integration-secret')
  })
  it('disables inherited tracing and credential injection; local Git receives no token', () => {
    vi.stubEnv('GIT_TRACE', '1'); vi.stubEnv('GIT_CURL_VERBOSE', '1'); vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'inherited'); vi.stubEnv('AIUSAGE_GIT_CREDENTIAL', 'inherited')
    const options = gitCredentialOptions('owner/data')
    expect(options.env.GIT_TRACE).toBeUndefined(); expect(options.env.GIT_CURL_VERBOSE).toBeUndefined()
    expect(options.env.GIT_CONFIG_COUNT).toBeUndefined(); expect(options.env.AIUSAGE_GIT_CREDENTIAL).toBeUndefined()
    expect(options.env.AIUSAGE_GITHUB_TOKEN).toBeUndefined()
  })
})
