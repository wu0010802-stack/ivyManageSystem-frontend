import { computed, ref } from 'vue'
import { getFestivalPayoutSettings } from '@/api/festivalCarry'
import type { Schema } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'

export type FestivalPayoutSettings = Schema<'FestivalPayoutSettingsOut'>

/**
 * 讀取租戶節慶發放口徑（GET /salaries/festival-carry/settings）。
 *
 * 讀取失敗或無 SALARY_READ 時 settings 維持 null＝標準口徑（2/6/9/12）：只影響前端
 * 顯示與預先禁用，後端 calculate 422／period-accrual is_distribution_month 才是權威。
 */
export function useFestivalPayoutSettings() {
    const settings = ref<FestivalPayoutSettings | null>(null)
    const loaded = ref(false)
    const loading = ref(false)

    const load = async (): Promise<void> => {
        if (!hasPermission('SALARY_READ')) {
            loaded.value = true
            return
        }
        loading.value = true
        try {
            const res = await getFestivalPayoutSettings()
            settings.value = res.data
        } catch {
            settings.value = null
        } finally {
            loading.value = false
            loaded.value = true
        }
    }

    const earlyPayoutFromYm = computed<string | null>(() => settings.value?.early_payout_from_ym ?? null)

    return { settings, loaded, loading, load, earlyPayoutFromYm }
}
