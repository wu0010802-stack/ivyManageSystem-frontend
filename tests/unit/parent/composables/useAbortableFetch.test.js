import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAbortableFetch } from '@/parent/composables/useAbortableFetch'

/**
 * useAbortableFetch:
 *   - 包 axios（或任何接受 `{ signal }` config 的 fetcher），暴露 `data/error/pending/refresh/abort`
 *   - 連續 refresh：舊 controller 被 abort
 *   - 元件 unmount：自動 abort 進行中的 request
 *   - fetcher rejected with AbortError：data 不變、error 不更新
 */

function mountWith(useFn) {
  let captured = null
  const Cmp = {
    template: '<div></div>',
    setup() {
      captured = useFn()
      return captured
    },
  }
  const wrapper = mount(Cmp)
  // captured 是 composable 直接回的物件，refs 可在外部讀寫
  return { wrapper, instance: captured, unmount: () => wrapper.unmount() }
}

describe('useAbortableFetch', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('refresh 期間再呼叫 → 舊 request 被 abort，新 request 用新 signal', async () => {
    const calls = []
    const fetcher = vi.fn((cfg) => {
      const myCallIdx = calls.length
      calls.push({ signal: cfg.signal, resolved: false })
      return new Promise((resolve, reject) => {
        cfg.signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'CanceledError'
          reject(err)
        })
        // 第二次呼叫立刻 resolve
        if (myCallIdx === 1) {
          setTimeout(() => {
            calls[myCallIdx].resolved = true
            resolve({ data: { v: 'second' } })
          }, 0)
        }
      })
    })

    const { instance } = mountWith(() => useAbortableFetch(fetcher))
    const { refresh, data } = instance

    const p1 = refresh()
    await nextTick()
    const p2 = refresh()
    await p1.catch(() => {}) // 第一次會被 abort 而 reject
    await p2

    expect(calls[0].signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)
    expect(data.value).toEqual({ data: { v: 'second' } })
  })

  it('元件 unmount → 進行中 request 被 abort', async () => {
    let capturedSignal = null
    const fetcher = vi.fn(
      (cfg) =>
        new Promise(() => {
          capturedSignal = cfg.signal
        }),
    )

    const { instance, unmount } = mountWith(() => useAbortableFetch(fetcher))
    instance.refresh().catch(() => {})
    await nextTick()
    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal.aborted).toBe(false)

    unmount()
    expect(capturedSignal.aborted).toBe(true)
  })

  it('AbortError reject 不更新 error；data 保留舊值', async () => {
    let firstRej
    let secondRes
    const fetcher = vi.fn().mockImplementationOnce(
      (cfg) =>
        new Promise((_resolve, reject) => {
          firstRej = reject
          cfg.signal.addEventListener('abort', () => {
            const e = new Error('canceled')
            e.name = 'CanceledError'
            reject(e)
          })
        }),
    ).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          secondRes = resolve
        }),
    )

    const { instance } = mountWith(() => useAbortableFetch(fetcher))
    const { refresh, data, error } = instance

    const p1 = refresh()
    await nextTick()
    const p2 = refresh()
    await p1.catch(() => {})

    // 第一次被 abort：error 不該被填，data 維持 null
    expect(error.value).toBe(null)
    expect(data.value).toBe(null)

    secondRes({ ok: true })
    await p2
    expect(data.value).toEqual({ ok: true })
  })

  it('其他錯誤 (非 abort) → error 被填、data 不變', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('500'))

    const { instance } = mountWith(() => useAbortableFetch(fetcher))
    const { refresh, data, error } = instance

    await refresh().catch(() => {})

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value.message).toBe('500')
    expect(data.value).toBe(null)
  })

  it('成功 → data 填入 fetcher resolved value、pending false', async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 })
    const { instance } = mountWith(() => useAbortableFetch(fetcher))
    const { refresh, data, pending } = instance

    const p = refresh()
    // pending 在 refresh 期間 true
    expect(pending.value).toBe(true)
    await p
    expect(pending.value).toBe(false)
    expect(data.value).toEqual({ x: 1 })
  })
})
