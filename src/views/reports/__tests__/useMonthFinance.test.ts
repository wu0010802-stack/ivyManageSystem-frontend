import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
vi.mock('@/api/reports', () => ({
  getFinanceSummary: vi.fn((_y: number, m: number) => new Promise((resolve, reject) => { pending.set(m, { resolve, reject }) })),
}))

import { useMonthFinance } from '../useMonthFinance'

describe('useMonthFinance（取代收支彙總舊版的 loadEpoch 競態守衛）', () => {
  it('快速切月時晚到的舊回應不會覆蓋新月份', async () => {
    const month = ref(8)
    const { data, pending: isPending } = useMonthFinance(2026, month)
    month.value = 9
    await nextTick()
    pending.get(9)!.resolve({ data: { summary: { total_revenue: 9 } } })
    await flushPromises()
    pending.get(8)!.resolve({ data: { summary: { total_revenue: 8 } } }) // 舊月份晚到
    await flushPromises()
    expect(data.value?.summary?.total_revenue).toBe(9)
    expect(isPending.value).toBe(false)
  })

  it('換月份時先清空，不會短暫顯示上個月的數字', async () => {
    const month = ref(8)
    const { data } = useMonthFinance(2026, month)
    pending.get(8)!.resolve({ data: { summary: { total_revenue: 8 } } })
    await flushPromises()
    expect(data.value?.summary?.total_revenue).toBe(8)
    month.value = 9
    await nextTick()
    expect(data.value).toBeNull()
  })

  it('舊請求的錯誤被丟棄，不污染新月份', async () => {
    const month = ref(8)
    const { data, error } = useMonthFinance(2026, month)
    month.value = 9
    await nextTick()
    pending.get(8)!.reject(new Error('old'))
    pending.get(9)!.resolve({ data: { summary: { total_revenue: 9 } } })
    await flushPromises()
    expect(error.value).toBeNull()
    expect(data.value?.summary?.total_revenue).toBe(9)
  })
})
