import { ref, watch, type Ref } from 'vue'
import { getMonthlyFixedCosts } from '@/api/monthlyFixedCost'
import { hasPermission } from '@/utils/auth'
import type { FixedCostStatus } from './closeStatus'

/**
 * 固定支出「哪些月份已登錄」（報表頁殼層持有，供分頁列未登錄數與總覽結帳狀態共用）。
 *
 * 底層端點需要 VENDOR_PAYMENT_READ（獨立於 REPORTS）：沒權限回 forbidden、失敗回 error，
 * 兩者都代表「查不到」，呼叫端不可當成「全部沒登錄」。年度切換以序號丟棄晚到的舊回應；
 * 固定支出分頁儲存後呼叫 reload() 讓未登錄數即時更新。
 */
export function useFixedCostStatus(year: Ref<number>) {
  const status = ref<FixedCostStatus>({ state: 'loading' })
  const canRead = hasPermission('VENDOR_PAYMENT_READ')
  let seq = 0

  async function reload(): Promise<void> {
    const my = ++seq
    if (!canRead) {
      status.value = { state: 'forbidden' }
      return
    }
    status.value = { state: 'loading' }
    try {
      const entries: unknown = await getMonthlyFixedCosts(year.value)
      if (my !== seq) return
      const sums = new Map<number, number>()
      for (const e of Array.isArray(entries) ? entries : []) {
        const row = e as { month?: unknown; amount?: unknown }
        const m = Number(row.month)
        if (!Number.isInteger(m)) continue
        sums.set(m, (sums.get(m) || 0) + (Number(row.amount) || 0))
      }
      status.value = { state: 'ok', registered: [...sums].filter(([, v]) => v > 0).map(([m]) => m) }
    } catch {
      if (my === seq) status.value = { state: 'error' }
    }
  }

  watch(year, reload, { immediate: true })
  return { status, reload }
}
