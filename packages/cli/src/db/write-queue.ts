export type QueuedTask<T> = () => T | Promise<T>

export class AsyncTaskQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: QueuedTask<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => undefined)
    return result
  }
}

