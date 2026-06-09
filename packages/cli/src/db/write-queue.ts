export type QueuedTask<T> = () => T | Promise<T>

export interface AsyncTaskQueueStatus {
  running: boolean
  pending: number
}

export class AsyncTaskQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private running = false
  private pending = 0

  run<T>(task: QueuedTask<T>): Promise<T> {
    this.pending++
    const runTask = async () => {
      this.pending--
      this.running = true
      try {
        return await task()
      } finally {
        this.running = false
      }
    }
    const result = this.tail.then(runTask, runTask)
    this.tail = result.catch(() => undefined)
    return result
  }

  getStatus(): AsyncTaskQueueStatus {
    return { running: this.running, pending: this.pending }
  }
}
