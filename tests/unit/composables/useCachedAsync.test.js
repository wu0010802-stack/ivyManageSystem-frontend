/**
 * useCachedAsync 測試 — 確認 SWR 三大行為：
 *  1. cache hit + fresh：不重 fetch、立刻有 data
 *  2. cache hit + stale：立刻給舊 data + 背景 refetch
 *  3. cache miss：正常 loading → data
 *  + dedupe：兩個 caller 同時 mount 同 key，fetcher 只跑一次
 *  + 失敗保留舊資料
 *  + invalidate
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import {
  useCachedAsync,
  invalidateCachedAsync,
  _resetCacheForTesting,
} from '@/composables/useCachedAsync'

beforeEach(() => {
  _resetCacheForTesting()
})

function makeHarness(key, fetcher, options) {
  const captured = {}
  const Comp = defineComponent({
    setup() {
      const r = useCachedAsync(key, fetcher, options)
      Object.assign(captured, r)
      return () => h('div')
    },
  })
  const wrapper = mount(Comp)
  return { wrapper, captured }
}

describe('useCachedAsync', () => {
  it('cache miss：fetcher 跑一次，data 取得', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 })
    const { captured } = makeHarness('k1', fetcher, { ttl: 1000 })

    expect(captured.pending.value).toBe(true)
    expect(captured.data.value).toBe(null)

    await vi.waitFor(() => {
      expect(captured.pending.value).toBe(false)
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(captured.data.value).toEqual({ value: 1 })
  })

  it('cache hit + fresh：第二個 caller 不再 fetch，pending 全程 false', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 'cached' })
    const a = makeHarness('k2', fetcher, { ttl: 60_000 })
    await vi.waitFor(() => {
      expect(a.captured.pending.value).toBe(false)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    const fetcher2 = vi.fn().mockResolvedValue({ value: 'should-not-call' })
    const b = makeHarness('k2', fetcher2, { ttl: 60_000 })

    await nextTick()
    expect(b.captured.data.value).toEqual({ value: 'cached' })
    expect(b.captured.pending.value).toBe(false)
    expect(fetcher2).toHaveBeenCalledTimes(0)
  })

  it('cache hit + stale：立刻給舊 data，pending 不亮，背景 refetch', async () => {
    const fetcher1 = vi.fn().mockResolvedValue({ value: 'old' })
    const a = makeHarness('k3', fetcher1, { ttl: 1 })
    await vi.waitFor(() => expect(a.captured.pending.value).toBe(false))

    await new Promise((r) => setTimeout(r, 10))

    const fetcher2 = vi.fn().mockResolvedValue({ value: 'new' })
    const b = makeHarness('k3', fetcher2, { ttl: 1 })

    // 立刻給舊 data
    expect(b.captured.data.value).toEqual({ value: 'old' })
    // 有舊資料 → 不顯示 spinner
    expect(b.captured.pending.value).toBe(false)

    await vi.waitFor(() => {
      expect(b.captured.data.value).toEqual({ value: 'new' })
    })
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })

  it('dedupe：兩個 caller 同 tick 同 key，fetcher 只跑一次', async () => {
    let resolveFetch
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveFetch = r }),
    )

    const a = makeHarness('k4', fetcher, { ttl: 1000 })
    const b = makeHarness('k4', fetcher, { ttl: 1000 })

    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)

    resolveFetch({ value: 'shared' })
    await vi.waitFor(() => {
      expect(a.captured.data.value).toEqual({ value: 'shared' })
      expect(b.captured.data.value).toEqual({ value: 'shared' })
    })
  })

  it('失敗時保留舊資料，error 物件被填入', async () => {
    const fetcher1 = vi.fn().mockResolvedValue({ value: 'good' })
    const a = makeHarness('k5', fetcher1, { ttl: 1 })
    await vi.waitFor(() => expect(a.captured.pending.value).toBe(false))

    await new Promise((r) => setTimeout(r, 10))

    const failure = new Error('boom')
    const fetcher2 = vi.fn().mockRejectedValue(failure)
    const b = makeHarness('k5', fetcher2, { ttl: 1 })

    expect(b.captured.data.value).toEqual({ value: 'good' })

    await vi.waitFor(() => {
      expect(b.captured.error.value).toBe(failure)
    })
    // data 維持舊值
    expect(b.captured.data.value).toEqual({ value: 'good' })
  })

  it('invalidate：清掉 cache，下次 mount 重 fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 'a' })
    const a = makeHarness('k6', fetcher, { ttl: 60_000 })
    await vi.waitFor(() => expect(a.captured.pending.value).toBe(false))

    a.captured.invalidate()

    const fetcher2 = vi.fn().mockResolvedValue({ value: 'b' })
    const b = makeHarness('k6', fetcher2, { ttl: 60_000 })
    await vi.waitFor(() => expect(b.captured.data.value).toEqual({ value: 'b' }))
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })

  it('invalidateCachedAsync(prefix)：只清前綴匹配的 key', async () => {
    const f1 = vi.fn().mockResolvedValue({ v: 1 })
    const f2 = vi.fn().mockResolvedValue({ v: 2 })
    makeHarness('parent/home', f1, { ttl: 60_000 })
    makeHarness('admin/home', f2, { ttl: 60_000 })

    await vi.waitFor(() => {
      expect(f1).toHaveBeenCalledTimes(1)
      expect(f2).toHaveBeenCalledTimes(1)
    })

    invalidateCachedAsync('parent/')

    const f1b = vi.fn().mockResolvedValue({ v: 1 })
    const f2b = vi.fn().mockResolvedValue({ v: 2 })
    makeHarness('parent/home', f1b, { ttl: 60_000 })
    makeHarness('admin/home', f2b, { ttl: 60_000 })

    await vi.waitFor(() => {
      expect(f1b).toHaveBeenCalledTimes(1) // parent/ 被清，重新 fetch
    })
    // admin/ 沒被清 → 不會再 fetch
    expect(f2b).toHaveBeenCalledTimes(0)
  })
})
