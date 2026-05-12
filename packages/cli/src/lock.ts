import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'

export function acquireLock(lockPath: string): boolean {
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, process.pid.toString(), 'utf-8')
    return true
  }

  // Check if the PID in the lock file is still running
  try {
    const content = readFileSync(lockPath, 'utf-8')
    const pid = parseInt(content.trim(), 10)
    if (isNaN(pid)) {
      // Invalid lock file, remove it and acquire
      unlinkSync(lockPath)
      writeFileSync(lockPath, process.pid.toString(), 'utf-8')
      return true
    }

    // Try to check if process is running using signal 0
    try {
      process.kill(pid, 0)
      // Process is still running, lock is held
      return false
    } catch {
      // Process not running (stale lock), acquire it
      unlinkSync(lockPath)
      writeFileSync(lockPath, process.pid.toString(), 'utf-8')
      return true
    }
  } catch {
    // Error reading lock file, try to acquire
    try {
      unlinkSync(lockPath)
    } catch {}
    writeFileSync(lockPath, process.pid.toString(), 'utf-8')
    return true
  }
}

export function releaseLock(lockPath: string): void {
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath)
    }
  } catch {}
}

export function isLocked(lockPath: string): boolean {
  return existsSync(lockPath)
}
