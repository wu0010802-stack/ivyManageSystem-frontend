/**
 * 共享平板教師端 PII 殘留（bug-hunt 2026-06-25，P1）：clearAuth 應重置 setup store。
 *
 * 問題：clearAuth → _resetStores 只對「有 $reset 的 option store」生效
 * （pinia._s.forEach(store => store.$reset?.())），portalMessages / portalDashboard
 * 是 setup store（無 $reset），登出時被略過。登出/登入皆 SPA router.push 不 reload，
 * 記憶體中的 threads（含學生姓名 + 對話 PII）與 summary（含學生過敏/用藥/缺席）跨換人存活；
 * fetchThreads/fetchSummary 命中 threadsLoaded / isFresh early-return → 渲染前一位教師的資料。
 *
 * 修法：_resetStores 對「無 $reset 但有 invalidate()」的 setup store 改呼叫 invalidate()；
 * 並修正 portalDashboard.invalidate() 一併清 summary.value（原本只清 lastFetchedAt，
 * summary 殘留仍可讀）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { clearAuth } from '@/utils/auth'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { usePortalDashboardStore } from '@/stores/portalDashboard'

describe('clearAuth 重置 setup store（共享平板教師端 PII 殘留）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('登出時清空 portalMessages 的 threads / threadsLoaded / messagesByThread', () => {
    const store = usePortalMessagesStore()
    // 灌入前一位教師的家長訊息串（含學生姓名 + 對話 PII）
    store.threads = [{ id: 1, student_name: '王小明', last_body: '請假事宜' }]
    store.threadsLoaded = true
    store.messagesByThread = {
      1: { items: [{ id: 10, body: '收到' }], next_cursor: null, hasMore: false },
    }

    clearAuth({ notifyServer: false })

    expect(store.threads).toEqual([])
    expect(store.threadsLoaded).toBe(false)
    expect(store.messagesByThread).toEqual({})
  })

  it('登出時清空 portalDashboard 的 summary（含過敏/用藥/缺席）', () => {
    const store = usePortalDashboardStore()
    // 灌入前一位教師的首頁摘要（含學生過敏/用藥/缺席 PII）
    store.summary = { allergies: ['花生'], medications: ['退燒藥'], absences: 2 }

    clearAuth({ notifyServer: false })

    // summary 必須被清成 null（否則下一位登入者在 60s TTL 窗內 isFresh() 命中可讀到殘留 PII）
    expect(store.summary).toBeNull()
  })
})
