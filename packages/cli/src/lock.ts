import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

export function acquireLock(lockPath: string): boolean {
  // Atomically create the lock file; throws EEXIST if it already exists.
  try {
    writeFileSync(lockPath, process.pid.toString(), { encoding: 'utf-8', flag: 'wx' })
    return true
  } catch (err: any) {
    if (err.code !== 'EEXIST') return false
  }

  // File exists — check if the owning process is still alive.
  let pid: number
  try {
    const content = readFileSync(lockPath, 'utf-8')
    pid = parseInt(content.trim(), 10)
  } catch {
    return false
  }

  if (isNaN(pid)) {
    // Corrupted lock file — remove and retry once.
    try { unlinkSync(lockPath) } catch { return false }
    try {
      writeFileSync(lockPath, process.pid.toString(), { encoding: 'utf-8', flag: 'wx' })
      return true
    } catch {
      return false
    }
  }

  try {
    process.kill(pid, 0)
    // Process is running — lock is held.
    return false
  } catch (err: any) {
    if (err.code !== 'ESRCH') {
      // EPERM or other error — process exists but we can't signal it; treat as held.
      return false
    }
    // ESRCH — process no longer exists; stale lock.
    try { unlinkSync(lockPath) } catch { return false }
    try {
      writeFileSync(lockPath, process.pid.toString(), { encoding: 'utf-8', flag: 'wx' })
      return true
    } catch {
      return false
    }
  }
}

export function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath)
  } catch {}
}

export function isLocked(lockPath: string): boolean {
  try {
    readFileSync(lockPath)
    return true
  } catch {
    return false
  }
}
