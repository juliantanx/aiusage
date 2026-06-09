import { describe, expect, it } from 'vitest'
import { AsyncTaskQueue } from '../../src/db/write-queue.js'

describe('AsyncTaskQueue', () => {
  it('runs async tasks one at a time in submission order', async () => {
    const queue = new AsyncTaskQueue()
    const events: string[] = []
    let releaseFirst!: () => void

    const first = queue.run(async () => {
      events.push('first:start')
      await new Promise<void>((resolve) => { releaseFirst = resolve })
      events.push('first:end')
      return 1
    })

    const second = queue.run(() => {
      events.push('second')
      return 2
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    releaseFirst()
    await expect(first).resolves.toBe(1)
    await expect(second).resolves.toBe(2)
    expect(events).toEqual(['first:start', 'first:end', 'second'])
  })

  it('keeps running queued tasks after a task fails', async () => {
    const queue = new AsyncTaskQueue()
    const failed = queue.run(() => {
      throw new Error('boom')
    })
    const next = queue.run(() => 'ok')

    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('reports running and pending task counts', async () => {
    const queue = new AsyncTaskQueue()
    let releaseFirst!: () => void

    const first = queue.run(async () => {
      await new Promise<void>((resolve) => { releaseFirst = resolve })
    })
    const second = queue.run(() => 'next')

    await Promise.resolve()
    expect(queue.getStatus()).toEqual({ running: true, pending: 1 })

    releaseFirst()
    await first
    await second
    expect(queue.getStatus()).toEqual({ running: false, pending: 0 })
  })
})
