import { createInterface } from 'node:readline/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { appSettings, connectRepository, githubApi, installationRepositories, pollDeviceAuthorization, startDeviceAuthorization, validateRepo, GitHubAuthError } from '../github/auth.js'
import { runInit } from './init.js'

export async function runGitHubLogin(options: { repo?: string; device?: string } = {}): Promise<void> {
  if (options.repo) validateRepo(options.repo)
  const flow = await startDeviceAuthorization()
  // Only the public, short-lived user code is displayed. Never display device_code.
  console.log(`Connect GitHub: ${flow.verificationUrl}\nEnter code: ${flow.userCode}`)
  let credentials = null
  while (!credentials) {
    await sleep(Math.max(0, flow.nextPollAt - Date.now()))
    credentials = await pollDeviceAuthorization(flow)
  }
  const user = await githubApi(credentials.accessToken, '/user')
  if (!/^[A-Za-z0-9-]+$/.test(user.login)) throw new GitHubAuthError('GitHub returned an invalid user profile.')
  console.log(`Authenticated as ${user.login}.`)
  console.log(`Install/select the App for only your sync repository: ${appSettings().installUrl}`)
  const prompt = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null
  try {
    let choices = await installationRepositories(credentials.accessToken)
    let choice = choices.find(c => c.repo.toLowerCase() === options.repo?.toLowerCase())
    if (options.repo) {
      // Headless users can install from another device while this CLI waits.
      const deadline = Date.now() + 10 * 60_000
      while (!choice && Date.now() < deadline) {
        console.log('Waiting for App access to the selected repository...')
        await sleep(10_000)
        choices = await installationRepositories(credentials.accessToken)
        choice = choices.find(c => c.repo.toLowerCase() === options.repo!.toLowerCase())
      }
    } else if (prompt) {
      while (!choice) {
        choices.forEach((c, i) => console.log(`${i + 1}. ${c.repo}`))
        const answer = await prompt.question('Select repository number (Enter refreshes installations): ')
        if (answer.trim()) choice = choices[Number(answer) - 1]
        else choices = await installationRepositories(credentials.accessToken)
      }
    }
    if (!choice) throw new GitHubAuthError('No selected repository is available. Install the App, then run aiusage github login --repo owner/repo.')
    connectRepository(credentials, user.login, choice)
    const result = runInit({ backend: 'github', repo: choice.repo, device: options.device, githubAuth: 'github-app' })
    if (!result.success) throw new GitHubAuthError(result.message)
    console.log(result.message)
  } finally { prompt?.close() }
}
