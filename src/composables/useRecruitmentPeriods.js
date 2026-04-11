import { ref } from 'vue'
import { getPeriods, getPeriodsSummary } from '@/api/recruitment'
import { apiError } from '@/utils/error'

export function useRecruitmentPeriods({ notifyError } = {}) {
  const loadingPeriods = ref(false)
  const periods = ref([])
  const periodsSummary = ref(null)

  const reportError = (error, fallback) => {
    if (notifyError) notifyError(apiError(error, fallback))
  }

  const fetchPeriods = async () => {
    loadingPeriods.value = true
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        getPeriods(),
        getPeriodsSummary(),
      ])
      periods.value = listResponse.data
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
