/**
 * CONC-03（2026-08-24 bug hunt）：結帳後的刷新被去重層吞成「結帳前」的快照。
 *
 * `src/utils/apiDedupe.ts` 的 run() 對「同 key 且仍在途」的 GET 直接回傳既有 promise，
 * 且**不快取已完成結果**（只去重 in-flight）。POS 兩支刷新的 key 恆定
 * （daily-summary 無參數、recent-transactions {limit:100}），所以只要櫃台在結帳前按過
 * 「重新整理」而該請求還在途中，結帳後的刷新就不會發出新請求，直接領到**結帳前**的
 * 快照——彙總條顯示不含本筆的金額且不會自我修正，櫃台據此點鈔會少算。
 *
 * 本檔用真的 applyDedupe + 真的 api wrapper 驗證逃生口：
 * - 帶 force 的刷新必須真的打到 adapter（繞過 in-flight 去重）
 * - 不帶參數的既有呼叫端行為逐字不變（仍然去重，且 config 不含 meta）
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [],
  pending: [],
  hold: false,
}))

vi.mock('@/api/index', async () => {
  const axios = (await import('axios')).default
  const { applyDedupe } = await import('@/utils/apiDedupe')
  const instance = axios.create()
  instance.defaults.adapter = (config) => {
    const callIndex = state.calls.length
    state.calls.push({ url: config.url, params: config.params, meta: config.meta })
    return new Promise((resolve) => {
      const done = () =>
        resolve({
          data: { callIndex },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        })
      if (state.hold) state.pending.push(done)
      else done()
    })
  }
  applyDedupe(instance)
  return { default: instance }
})

import apiInstance from '@/api/index'
import { clearDedupe } from '@/utils/apiDedupe'
import { getPOSDailySummary, getPOSRecentTransactions } from '@/api/activity'

/** 讓 axios 的 promise 鏈跑到 adapter（送出不是同步的） */
const tick = () => new Promise((r) => setTimeout(r, 0))

function flushHeld() {
  const queued = state.pending.splice(0)
  queued.forEach((fn) => fn())
}

describe('POS 刷新的去重逃生口（CONC-03）', () => {
  beforeEach(() => {
    state.calls = []
    state.pending = []
    state.hold = false
    // 去重 map 是 instance 級的，跨 it 會殘留 in-flight 項目
    clearDedupe(apiInstance)
  })

  it('日結彙總：in-flight 的舊刷新不得吞掉帶 force 的新刷新', async () => {
    state.hold = true

    const stale = getPOSDailySummary()
    const deduped = getPOSDailySummary()
    await tick()
    expect(state.calls.length).toBe(1) // 同 key in-flight → 去重（既有行為，維持）

    const forced = getPOSDailySummary(undefined, { force: true })
    await tick()
    expect(state.calls.length).toBe(2) // ← 修之前是 1：結帳後刷新領到結帳前快照

    flushHeld()
    const [a, b, c] = await Promise.all([stale, deduped, forced])
    expect(a.data.callIndex).toBe(0)
    expect(b.data.callIndex).toBe(0)
    expect(c.data.callIndex).toBe(1)
  })

  it('今日交易：in-flight 的舊刷新不得吞掉帶 force 的新刷新', async () => {
    state.hold = true

    const stale = getPOSRecentTransactions({ limit: 100 })
    await tick()
    expect(state.calls.length).toBe(1)

    const forced = getPOSRecentTransactions({ limit: 100 }, { force: true })
    await tick()
    expect(state.calls.length).toBe(2)

    flushHeld()
    const [a, b] = await Promise.all([stale, forced])
    expect(a.data.callIndex).toBe(0)
    expect(b.data.callIndex).toBe(1)
  })

  it('不帶 force 的既有呼叫端行為逐字不變（仍去重、config 不含 meta）', async () => {
    state.hold = true

    const p1 = getPOSRecentTransactions({ limit: 100 })
    const p2 = getPOSRecentTransactions({ limit: 100 })
    const p3 = getPOSDailySummary()
    const p4 = getPOSDailySummary()
    await tick()
    expect(state.calls.length).toBe(2) // 兩支各一次

    flushHeld()
    await Promise.all([p1, p2, p3, p4])
    expect(state.calls.every((c) => c.meta === undefined)).toBe(true)
  })
})
