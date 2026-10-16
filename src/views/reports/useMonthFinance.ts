import { ref, shallowRef, watch, type Ref } from 'vue'
import { getFinanceSummary } from '@/api/reports'

export interface CategoryAmount {
  category?: string
  label?: string
  amount?: number
  refund?: number
}

export interface MonthFinanceData {
  summary?: { total_revenue?: number; total_refund?: number; total_expense?: number; net_cashflow?: number }
  revenue_by_category?: CategoryAmount[]
  expense_by_category?: CategoryAmount[]
}

/**
 * 焦點月的收支分類（finance-summary?month=）。
 *
 * 不走 useCachedAsync：它換 key 不會自動重抓，且 SWR 會先顯示上一個月的資料
 * （標題寫 9 月、數字卻是 8 月）。這裡每次月份改變就清空再抓，並以序號丟棄晚到的舊回應。
 */
export function useMonthFinance(year: number, month: Ref<number>) {
  const data = shallowRef<MonthFinanceData | null>(null)
  const error = ref<unknown>(null)
  const pending = ref(false)
  let seq = 0

  async function load(): Promise<void> {
    const my = ++seq
    data.value = null
    error.value = null
    pending.value = true
    try {
      const res = await getFinanceSummary(year, month.value)
      if (my === seq) data.value = (res.data ?? null) as MonthFinanceData | null
    } catch (e) {
      if (my === seq) error.value = e
    } finally {
      if (my === seq) pending.value = false
    }
  }

  watch(month, load, { immediate: true })
  return { data, error, pending, reload: load }
}
