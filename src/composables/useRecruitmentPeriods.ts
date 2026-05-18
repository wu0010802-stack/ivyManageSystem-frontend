import { ref } from 'vue'
import { getPeriods, getPeriodsSummary } from '@/api/recruitment'
import { apiError } from '@/utils/error'

export function useRecruitmentPeriods({ notifyError }: { notifyError?: (msg: string) => void } = {}) {
  const loadingPeriods = ref(false)
  const periods = ref<unknown[]>([])
  const periodsSummary = ref<unknown>(null)

  const reportError = (error: unknown, fallback: string) => {
    if (notifyError) notifyError(apiError(error, fallback))
  }

  const fetchPeriods = async () => {
    loadingPeriods.value = true
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        getPeriods(),
        getPeriodsSummary({}),
      ])
      periods.value = listResponse.data as unknown[]
      periodsSummary.value = summaryResponse.data
      return true
    } catch (error) {
      reportError(error, '載入期間資料失敗')
      return false
    } finally {
      loadingPeriods.value = false
    }
  }

  return {
    loadingPeriods,
    periods,
    periodsSummary,
    fetchPeriods,
  }
}
