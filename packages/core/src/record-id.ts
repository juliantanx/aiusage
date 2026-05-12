import { createHash } from 'node:crypto'
import type { Tool } from './types.js'

export function generateRecordId(sourceFile: string, lineOffset: number): string {
  const hash = createHash('sha256')
    .update(sourceFile + lineOffset)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateSyncRecordId(
  deviceInstanceId: string,
  sourceFile: string,
  lineOffset: number
): string {
  const hash = createHash('sha256')
    .update(deviceInstanceId + sourceFile + lineOffset)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateToolCallId(
  recordId: string,
  name: string,
  ts: number,
  callIndex: number
): string {
  const hash = createHash('sha256')
    .update(recordId + name + ts + callIndex)
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
    .update(tool + ':' + name + ':' + ts + ':' + callIndex)
    .digest('hex')
  return hash.slice(0, 16)
}

export function generateSessionKey(device: string, sessionId: string): string {
  const hash = createHash('sha256')
    .update(device + sessionId)
    .digest('hex')
  return hash.slice(0, 24)
}
