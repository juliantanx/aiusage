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
  private lastInfo: ProgressInfo | null = null
  private currentTool: string | undefined
  private toolRecords: Map<string, number> = new Map()
  private recordsAtToolStart = 0

  update(info: ProgressInfo): void {
    if (!isTTY) return

    // When tool changes, finalize the previous tool's line and start a new one
    if (info.tool && info.tool !== this.currentTool) {
      if (this.currentTool && this.lastInfo) {
        // Finalize previous tool line
        const toolRecordCount = this.lastInfo.records - this.recordsAtToolStart
        this.toolRecords.set(this.currentTool, toolRecordCount)
        if (toolRecordCount > 0) {
          this.writeLine(this.lastInfo)
          process.stderr.write('\n')
        } else {
          // Clear the line for tools with 0 records
          process.stderr.write('\r\x1b[K')
        }
        this.lastLine = ''
      }
      this.currentTool = info.tool
      this.recordsAtToolStart = info.records
    }

    this.lastInfo = info

    const now = Date.now()
    const isComplete = info.total > 0 && info.current >= info.total
    if (!isComplete && now - this.lastWrite < MIN_INTERVAL_MS) return
    this.lastWrite = now

    this.writeLine(info)
  }

  private writeLine(info: ProgressInfo): void {
    const pct = info.total > 0 ? (info.current / info.total) * 100 : 0
    const bar = formatBar(info.total > 0 ? info.current / info.total : 0)
    const toolLabel = info.tool ? ` [${info.tool}]` : ''
    const toolRecordCount = info.records - this.recordsAtToolStart
    const line = `\r${info.phase}${toolLabel} ${bar} ${pct.toFixed(1)}%  ${info.current}/${info.total}  records: ${toolRecordCount}  `

    if (line !== this.lastLine) {
      process.stderr.write(line)
      this.lastLine = line
    }
  }

  done(): void {
    if (!isTTY) return
    // Finalize the last tool's line
    if (this.lastInfo && this.currentTool) {
      const toolRecordCount = this.lastInfo.records - this.recordsAtToolStart
      this.toolRecords.set(this.currentTool, toolRecordCount)
      if (toolRecordCount > 0) {
        this.writeLine(this.lastInfo)
        process.stderr.write('\n')
      } else {
        process.stderr.write('\r\x1b[K')
      }
    }
  }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class SyncProgressReporter {
  private frame = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private lastPhase = ''
  private lastCounts = ''

  start(): void {
    if (!isTTY) return
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length
      this.render()
    }, 80)
  }

  update(progress: { phase: string; pulledCount?: number; uploadedCount?: number }): void {
    const phaseLabels: Record<string, string> = {
      pulling: 'Pulling',
      merging: 'Merging',
      uploading: 'Uploading',
      finalizing: 'Finalizing',
    }
    this.lastPhase = phaseLabels[progress.phase] ?? progress.phase
    const parts: string[] = []
    if (progress.pulledCount) parts.push(`pulled: ${progress.pulledCount}`)
    if (progress.uploadedCount) parts.push(`uploaded: ${progress.uploadedCount}`)
    this.lastCounts = parts.length ? `  ${parts.join(', ')}` : ''
    this.render()
  }

  private render(): void {
    if (!isTTY) return
    const spinner = SPINNER_FRAMES[this.frame]
    const phase = this.lastPhase || 'Starting'
    process.stderr.write(`\r${spinner} ${phase}...${this.lastCounts}  `)
  }

  done(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (!isTTY) return
    process.stderr.write('\r\x1b[K')
  }
}
