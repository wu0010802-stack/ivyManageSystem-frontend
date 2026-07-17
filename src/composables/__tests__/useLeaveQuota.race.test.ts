import { describe, it, expect, vi } from 'vitest'
import { useLeaveQuota } from '@/composables/useLeaveQuota'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Quota = { remaining_hours: number; label: string }

describe('useLeaveQuota request-sequence guard（防 out-of-order 覆蓋）', () => {
  it('切員工 A(慢)→B(快)：舊回應不得覆蓋 quotaInfo（最終為 B）', async () => {
    const dA = deferred<Quota>()
    const dB = deferred<Quota>()
    const calls = [dA, dB]
    let i = 0
    // fetchFn 依呼叫順序回傳不同 deferred，模擬慢 A、快 B
    const fetchFn = vi.fn(() => calls[i++].promise)

    // 用純物件 form：避免 watch/debounce 介入，直接手動驅動 fetchQuotaInfo
    const form: Record<string, unknown> = {
      employee_id: null,
      leave_type: 'annual',
      start_date: '2026-01-01',
    }
    const { quotaInfo, fetchQuotaInfo, quotaLoading } = useLeaveQuota({ form, fetchFn })

    // 切到員工 A → 觸發慢請求
    form.employee_id = 'A'
    const pA = fetchQuotaInfo()

    // 使用者快速改切到員工 B → 觸發快請求
    form.employee_id = 'B'
    const pB = fetchQuotaInfo()

    // B 先回
    dB.resolve({ remaining_hours: 20, label: 'B' })
    await pB
    expect(quotaInfo.value?.label).toBe('B')

    // A（stale）稍後才回，必須被丟棄
    dA.resolve({ remaining_hours: 8, label: 'A' })
    await pA

    expect(quotaInfo.value?.label).toBe('B') // 未被 stale A 覆蓋
    expect(quotaLoading.value).toBe(false)
  })

  it('無競態時（單一請求）仍正常寫入 quotaInfo', async () => {
    const d = deferred<Quota>()
    const fetchFn = vi.fn(() => d.promise)
    const form: Record<string, unknown> = {
      employee_id: 'X',
      leave_type: 'sick',
      start_date: '2026-01-01',
    }
    const { quotaInfo, fetchQuotaInfo, quotaLoading } = useLeaveQuota({ form, fetchFn })

    const p = fetchQuotaInfo()
    expect(quotaLoading.value).toBe(true)
    d.resolve({ remaining_hours: 40, label: 'X' })
    await p

    expect(quotaInfo.value?.label).toBe('X')
    expect(quotaLoading.value).toBe(false)
  })

  it('stale 錯誤被靜默吞掉，不清掉最新（B）結果', async () => {
    const dA = deferred<Quota>()
    const dB = deferred<Quota>()
    const calls = [dA, dB]
    let i = 0
    const fetchFn = vi.fn(() => calls[i++].promise)
    // 起始 employee_id=null，讓 composable 初始化時的自動 fetch 早退、不消耗 deferred
    const form: Record<string, unknown> = {
      employee_id: null,
      leave_type: 'annual',
      start_date: '2026-01-01',
    }
    const { quotaInfo, fetchQuotaInfo } = useLeaveQuota({ form, fetchFn })

    form.employee_id = 'A'
    const pA = fetchQuotaInfo() // seq 慢
    form.employee_id = 'B'
    const pB = fetchQuotaInfo() // seq 快

    dB.resolve({ remaining_hours: 12, label: 'B' })
    await pB
    expect(quotaInfo.value?.label).toBe('B')

    // 舊請求 A 才報錯 → 不得把 quotaInfo 清成 null
    dA.reject(new Error('stale fail'))
    await pA
    expect(quotaInfo.value?.label).toBe('B')
  })
})
