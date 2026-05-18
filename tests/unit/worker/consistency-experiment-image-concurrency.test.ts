import { describe, expect, it } from 'vitest'
import { runConsistencyExperimentImageItemsInParallel } from '@/lib/workers/handlers/consistency-experiment-image-task-handler'

function deferred(): {
  readonly promise: Promise<void>
  readonly resolve: () => void
} {
  let resolvePromise: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

describe('consistency experiment image concurrency', () => {
  it('starts all image items without waiting for earlier items to finish', async () => {
    const first = deferred()
    const started: number[] = []
    const running = runConsistencyExperimentImageItemsInParallel([1, 2, 3], async (item) => {
      started.push(item)
      if (item === 1) await first.promise
    })

    await Promise.resolve()
    expect(started).toEqual([1, 2, 3])
    first.resolve()
    await running
  })

  it('waits for already-started image items before surfacing a failure', async () => {
    const slow = deferred()
    const finished: number[] = []
    const running = runConsistencyExperimentImageItemsInParallel([1, 2], async (item) => {
      if (item === 1) {
        await slow.promise
        finished.push(item)
        return
      }
      throw new Error('image failed')
    })

    await Promise.resolve()
    slow.resolve()
    await expect(running).rejects.toThrow('image failed')
    expect(finished).toEqual([1])
  })
})
