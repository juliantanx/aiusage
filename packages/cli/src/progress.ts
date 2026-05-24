const MIN_INTERVAL_MS = 100

const isTTY = process.stderr.isTTY === true

function formatBar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width)
  return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled) + ']'
}

export interface ProgressInfo {
  phase: string
  tool?: string
  current: number
  total: number
  records: number
  toolCalls: number
}

export class ProgressReporter {
  private lastWrite = 0
  private lastLine = ''

  update(info: ProgressInfo): void {
    if (!isTTY) return

    const now = Date.now()
    if (now - this.lastWrite < MIN_INTERVAL_MS) return
    this.lastWrite = now

    const pct = info.total > 0 ? (info.current / info.total) * 100 : 0
    const bar = formatBar(info.total > 0 ? info.current / info.total : 0)
    const toolLabel = info.tool ? ` [${info.tool}]` : ''
    const line = `\r${info.phase}${toolLabel} ${bar} ${pct.toFixed(1)}%  ${info.current}/${info.total}  records: ${info.records}  calls: ${info.toolCalls}  `

    if (line !== this.lastLine) {
      process.stderr.write(line)
      this.lastLine = line
    }
  }

  done(): void {
    if (!isTTY) return
    process.stderr.write('\r\x1b[K')
  }
}
