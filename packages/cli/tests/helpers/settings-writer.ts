// A child process of tests/settings-concurrency.test.ts. It rewrites one field
// of state.json or config.json `iterations` times through the same functions
// aiusage uses, and before each write checks that the field still holds the
// value it wrote last: only this process writes it, so anything else means
// another process wrote back an older copy of the file (a lost update).
//
//   node --import tsx settings-writer.ts <role> <aiusageDir> <iterations>
//
// HOME/USERPROFILE point at the parent of <aiusageDir> (config.ts resolves
// ~/.aiusage from them). Prints one JSON line: { role, regressions, errors }.
import { getState, setState, setSyncConsent, setSyncTargetState, type State } from '../../src/init.js'
import { loadConfig, saveCredential, type Config } from '../../src/config.js'

const [role, aiusageDir, iterationsArg] = process.argv.slice(2)
const iterations = Number(iterationsArg)

const roles: Record<string, { write: (i: number) => void; read: () => number | undefined }> = {
  syncGeneration: {
    write: i => setSyncTargetState(aiusageDir, 'cloud', { syncGeneration: i, lastSyncStatus: 'ok' }),
    read: () => getState(aiusageDir)?.syncTargets?.cloud?.syncGeneration,
  },
  lastLeaderboardUploadAt: {
    write: i => setState(aiusageDir, { lastLeaderboardUploadAt: i }),
    read: () => getState(aiusageDir)?.lastLeaderboardUploadAt,
  },
  syncTargets: {
    write: i => setSyncTargetState(aiusageDir, 'github:owner/repo', { lastSyncUploaded: i, lastSyncStatus: 'ok' }),
    read: () => getState(aiusageDir)?.syncTargets?.['github:owner/repo']?.lastSyncUploaded,
  },
  syncConsent: {
    write: i => setSyncConsent(aiusageDir, 's3:bucket/aiusage/', { syncConsentAt: i, syncConsentTarget: 'fingerprint' }),
    read: () => (getState(aiusageDir) as State | null)?.syncConsents?.['s3:bucket/aiusage/']?.syncConsentAt,
  },
  credentialA: {
    write: i => saveCredential('a', String(i)),
    read: () => numberOrUndefined((loadConfig() as Config | null)?.credentials?.a),
  },
  credentialB: {
    write: i => saveCredential('b', String(i)),
    read: () => numberOrUndefined((loadConfig() as Config | null)?.credentials?.b),
  },
}

function numberOrUndefined(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value)
}

const { write, read } = roles[role]
let regressions = 0
const errors: string[] = []
for (let i = 1; i <= iterations; i++) {
  try {
    const seen = read()
    if (i > 1 && seen !== i - 1) regressions++
    write(i)
  } catch (error) {
    errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  }
}
process.stdout.write(JSON.stringify({ role, regressions, errors: errors.slice(0, 5), errorCount: errors.length }) + '\n')
