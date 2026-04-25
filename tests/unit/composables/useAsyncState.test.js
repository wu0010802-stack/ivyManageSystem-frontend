import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAsyncState } from '@/composables/useAsyncState'

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('immediate: true 建立時自動 execute', async () => {
    const fetcher = vi.fn(() => Promise.resolve('hello'))
    const { data, pending } = useAsyncState(fetcher, { immediate: true, minShowMs: 0 })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(pending.value).toBe(true)

    await vi.runAllTimersAsync()
    expect(data.value).toBe('hello')
    expect(pending.value).toBe(false)
  })

  it('minShowMs 保證 pending 最短顯示時間', async () => {
    const fetcher = vi.fn(() => Promise.resolve('quick'))
    const { pending, execute } = useAsyncState(fetcher, { minShowMs: 300 })

    const p = execute()
    expect(pending.value).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    expect(pending.value).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    await p
    expect(pending.value).toBe(false)
  })

  it('dedupe: true 時併發 execute 只發一次 API', async () => {
    const fetcher = vi.fn(() => new Promise((r) => setTimeout(() => r('ok'), 50)))
    const { execute } = useAsyncState(fetcher, { dedupe: true, minShowMs: 0 })

    const p1 = execute()
    const p2 = execute()
    expect(fetcher).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60)
    await Promise.all([p1, p2])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('錯誤寫入 error ref，不向外拋出', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('boom')))
    const { error, data, pending, execute } = useAsyncState(fetcher, { minShowMs: 0 })

    await execute()
    expect(error.value).toBeInstanceOf(Error)
    expect(error.value.message).toBe('boom')
    expect(data.value).toBe(null)
    expect(pending.value).toBe(false)
  })

  it('reset 清空 data/error/pending', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'))
    const { data, error, pending, execute, reset } = useAsyncState(fetcher, { minShowMs: 0 })

    await execute()
    expect(data.value).toBe('x')

    reset()
    expect(data.value).toBe(null)
    expect(error.value).toBe(null)
    expect(pending.value).toBe(false)
  })

  it('reset 會 abort 尚未完成的請求', async () => {
    let receivedSignal
    const fetcher = vi.fn((signal) => {
      receivedSignal = signal
      return new Promise(() => {})
    })
    const { reset, execute } = useAsyncState(fetcher, { minShowMs: 0 })

    execute()
    await vi.advanceTimersByTimeAsync(0)
    expect(receivedSignal.aborted).toBe(false)
    reset()
    expect(receivedSignal.aborted).toBe(true)
  })

  it('initialData 設定 data 初始值', () => {
    const fetcher = vi.fn()
    const { data } = useAsyncState(fetcher, { initialData: [] })
    expect(data.value).toEqual([])
  })
})
