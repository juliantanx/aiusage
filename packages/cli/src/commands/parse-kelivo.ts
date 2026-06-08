import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as yauzl from 'yauzl'

export interface KelivoImportOptions {
  filePath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}

export interface KelivoImportResult {
  records: StatsRecord[]
  errors: string[]
}

interface KelivoMessage {
  id?: string
  role?: string
  timestamp?: string
  modelId?: string | null
  providerId?: string | null
  totalTokens?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  cachedTokens?: number | null
  conversationId?: string
}

function toTokenCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

async function readZipEntryText(filePath: string, entryName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipfile) {
        reject(new Error('Unable to open zip file'))
        return
      }

      let settled = false
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (basename(entry.fileName) !== entryName) {
          zipfile.readEntry()
          return
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            settled = true
            zipfile.close()
            reject(streamError)
            return
          }
          if (!stream) {
            settled = true
            zipfile.close()
            reject(new Error(`Missing ${entryName} stream`))
            return
          }

          const chunks: Buffer[] = []
          stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          stream.on('error', (e) => {
            settled = true
            zipfile.close()
            reject(e)
          })
          stream.on('end', () => {
            settled = true
            zipfile.close()
            resolve(Buffer.concat(chunks).toString('utf-8'))
          })
        })
      })
      zipfile.on('end', () => {
        if (!settled) reject(new Error(`${entryName} not found in zip`))
      })
      zipfile.on('error', (e) => {
        if (!settled) reject(e)
      })
    })
  })
}

async function readKelivoExport(filePath: string): Promise<any> {
  const text = filePath.endsWith('.zip')
    ? await readZipEntryText(filePath, 'chats.json')
    : readFileSync(filePath, 'utf-8')
  return JSON.parse(text)
}

export async function runParseKelivo(options: KelivoImportOptions): Promise<KelivoImportResult> {
  const { filePath, device, deviceInstanceId, platform, now, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []

  let parsed: any
  try {
    parsed = await readKelivoExport(filePath)
  } catch (e) {
    return { records, errors: [`${filePath}: ${e instanceof Error ? e.message : e}`] }
  }

  const messages = Array.isArray(parsed?.messages) ? parsed.messages as KelivoMessage[] : []
  for (const [index, message] of messages.entries()) {
    if (message?.role !== 'assistant') continue

    const promptTokens = toTokenCount(message.promptTokens)
    const completionTokens = toTokenCount(message.completionTokens)
    const cachedTokens = toTokenCount(message.cachedTokens)
    const totalTokens = toTokenCount(message.totalTokens)
    const inputTokens = promptTokens > 0
      ? Math.max(0, promptTokens - cachedTokens)
      : Math.max(0, totalTokens - completionTokens - cachedTokens)
    const outputTokens = completionTokens
    const cacheReadTokens = cachedTokens
    const cacheWriteTokens = 0
    const thinkingTokens = 0

    if (inputTokens + outputTokens + cacheReadTokens === 0) continue

    const model = typeof message.modelId === 'string' && message.modelId.trim()
      ? message.modelId.trim()
      : 'unknown'
    const provider = typeof message.providerId === 'string' && message.providerId.trim()
      ? message.providerId.trim()
      : inferProvider(model)
    const ts = parseTimestamp(message.timestamp, now)
    const sessionId = typeof message.conversationId === 'string' && message.conversationId.trim()
      ? message.conversationId.trim()
      : 'unknown'
    const messageId = typeof message.id === 'string' && message.id.trim() ? message.id.trim() : `${sessionId}:${ts}:${index}`
    const sourceKey = `kelivo:${sessionId}:${messageId}`
    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
    const cost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0

    records.push({
      id: generateRecordId(deviceInstanceId, sourceKey, ts),
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: index,
      tool: 'kelivo',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource: cost > 0 ? 'pricing' : 'unknown',
      sessionId,
      sourceFile: filePath,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, errors }
}
