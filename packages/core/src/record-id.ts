import { createHash } from 'node:crypto'
import type { Tool } from './types.js'

export function generateRecordId(deviceInstanceId: string, sourceFile: string, lineOffset: number): string {
  const hash = createHash('sha256')
    .update(deviceInstanceId + '\0' + sourceFile + '\0' + lineOffset)
    .digest('hex')
  return hash.slice(0, 16)
}

/** @deprecated Use generateRecordId instead — they are now identical */
export function generateSyncRecordId(
  deviceInstanceId: string,
  sourceFile: string,
  lineOffset: number
): string {
  return generateRecordId(deviceInstanceId, sourceFile, lineOffset)
}

export function generateToolCallId(
  recordId: string,
  name: string,
  ts: number,
  callIndex: number
): string {
  const hash = createHash('sha256')
    .update(recordId + '\0' + name + '\0' + ts + '\0' + callIndex)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateOrphanToolCallId(
  tool: Tool,
  name: string,
  ts: number,
  callIndex: number
): string {
  const hash = createHash('sha256')
    .update(tool + '\0' + name + '\0' + ts + '\0' + callIndex)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateSessionKey(device: string, sessionId: string): string {
  const hash = createHash('sha256')
    .update(device + '\0' + sessionId)
    .digest('hex')
  return hash.slice(0, 24)
}
