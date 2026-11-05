import { computed, ref, shallowRef } from 'vue'
import { getFestivalBonusPreview } from '@/api/salary'
import { useFestivalPayoutSettings } from '@/composables/useFestivalPayoutSettings'
import { festivalPayoutMonthForEvent, isFestivalPayoutMonth } from '@/views/salary/festivalCoverage'
import { parseFestivalPreview, type MonthFestival } from '@/views/salary/settle/reviewFestival'

/**
 * 結薪覆核：本月算出、但本月薪資不入帳的節慶獎金（本月應計）。
 *
 * - 顯示條件：本月的累積「不在本月發」（依租戶發放口徑）。標準口徑每個月都成立
 *   （發放月發的是前幾個月的累積）；前移口徑下期間最後一個月當月就發 → 不顯示。
 * - 讀取失敗不擋覆核：failed＝true、資料清空，畫面顯示「—」。
 * - 月份切換時以序號丟棄晚到的舊回應。
 */
export function useFestivalMonthAccrual(period: () => { year: number; month: number }) {
    const payoutSettings = useFestivalPayoutSettings()
    const byEmployee = shallowRef(new Map<number, MonthFestival>())
    const loading = ref(false)
    const failed = ref(false)
    let seq = 0

    const payout = computed(() => {
        const { year, month } = period()
        return festivalPayoutMonthForEvent(year, month, payoutSettings.earlyPayoutFromYm.value)
    })
    const visible = computed(() => {
        if (!payoutSettings.loaded.value || !payout.value) return false
        const { year, month } = period()
        return !(payout.value[0] === year && payout.value[1] === month)
    })
    /** 本月本身是否為發放月（是的話「節慶獎金」欄是前幾個月的累積實發）。 */
    const paidThisMonth = computed(() => {
        const { year, month } = period()
        return isFestivalPayoutMonth(year, month, payoutSettings.earlyPayoutFromYm.value)
    })

    const load = async (): Promise<void> => {
        const token = ++seq
        if (!payoutSettings.loaded.value) await payoutSettings.load()
        if (token !== seq) return
        if (!visible.value) {
            byEmployee.value = new Map()
            failed.value = false
            loading.value = false
            return
        }
        const { year, month } = period()
        loading.value = true
        failed.value = false
        try {
            const res = await getFestivalBonusPreview({ year, month })
            if (token !== seq) return
            byEmployee.value = parseFestivalPreview(res.data)
        } catch {
            if (token !== seq) return
            failed.value = true
            byEmployee.value = new Map()
        } finally {
            if (token === seq) loading.value = false
        }
    }

    const of = (employeeId: string | number): MonthFestival | undefined =>
        byEmployee.value.get(Number(employeeId))

    return { byEmployee, loading, failed, visible, payout, paidThisMonth, load, of }
}

export type FestivalMonthAccrual = ReturnType<typeof useFestivalMonthAccrual>
