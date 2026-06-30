import { ref } from 'vue'
import { getRecruitmentStats, getRecruitmentOptions } from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'

export const createEmptyRecruitmentStats = () => ({
  total_visit: 0,
  total_deposit: 0,
  total_enrolled: 0,
  total_transfer_term: 0,
  total_pending_deposit: 0,
  total_effective_deposit: 0,
  unique_visit: 0,
  unique_deposit: 0,
  visit_to_deposit_rate: 0,
  visit_to_enrolled_rate: 0,
  deposit_to_enrolled_rate: 0,
  effective_to_enrolled_rate: 0,
  chuannian_visit: 0,
  chuannian_deposit: 0,
  monthly: [],
  by_grade: [],
  month_grade: {},
  by_source: [],
  by_referrer: [],
  by_district: [],
  referrer_source_cross: null,
  no_deposit_reasons: [],
  chuannian_by_expected: [],
  chuannian_by_grade: [],
  by_year: [],
  reference_month: null,
  decision_summary: {
    current_month: {},
    rolling_30d: {},
    rolling_90d: {},
    ytd: {},
  },
  funnel_snapshot: {
    visit: 0,
    deposit: 0,
    enrolled: 0,
    transfer_term: 0,
    effective_deposit: 0,
    pending_deposit: 0,
  },
  month_over_month: {
    current_month: null,
    previous_month: null,
  },
  alerts: [],
  top_action_queue: [],
})

export const createEmptyRecruitmentOptions = () => ({
  months: [],
  grades: [],
  sources: [],
  referrers: [],
  no_deposit_reasons: [],
})


export function useRecruitmentDashboard({ notifyError }: { notifyError?: (msg: string) => void } = {}) {
  const stats = ref<Record<string, unknown>>(createEmptyRecruitmentStats() as Record<string, unknown>)
  const options = ref<Record<string, unknown>>(createEmptyRecruitmentOptions() as Record<string, unknown>)
  const loadingStats = ref(false)
  const optionsLoaded = ref(false)
  const exportingExcel = ref(false)
  const referenceMonth = ref<string | null>(null)
  const statsSchoolYear = ref<number | null>(null)
  const statsSemester = ref<1 | 2 | null>(null)

  let optionsPromise: Promise<boolean> | null = null

  const reportError = (error: unknown, fallback: string) => {
    if (notifyError) notifyError(apiError(error, fallback))
  }

  const applyStatsPayload = (payload: Record<string, unknown> = {}) => {
    stats.value = {
      ...createEmptyRecruitmentStats(),
      ...payload,
      decision_summary: {
        current_month: {},
        rolling_30d: {},
        rolling_90d: {},
        ytd: {},
        ...(payload.decision_summary || {}),
      },
      funnel_snapshot: {
        visit: 0,
        deposit: 0,
        enrolled: 0,
        transfer_term: 0,
        effective_deposit: 0,
        pending_deposit: 0,
        ...(payload.funnel_snapshot || {}),
      },
      month_over_month: {
        current_month: null,
        previous_month: null,
        ...(payload.month_over_month || {}),
      },
      alerts: payload.alerts || [],
      top_action_queue: payload.top_action_queue || [],
    }
    referenceMonth.value = (payload.reference_month as string | null | undefined) ?? referenceMonth.value ?? null
  }

  const invalidateOptions = () => {
    optionsLoaded.value = false
  }

  const buildScopeParams = (base = {}) => {
    const params = { ...base }
    return Object.keys(params).length ? params : undefined
  }

  const fetchOptions = async (force = false) => {
    if (optionsLoaded.value && !force) return true
    if (optionsPromise && !force) return optionsPromise

    optionsPromise = (async () => {
      try {
        const response = await getRecruitmentOptions(buildScopeParams())
        options.value = {
          ...createEmptyRecruitmentOptions(),
          ...(response.data || {}),
        }
        optionsLoaded.value = true
        return true
      } catch (error) {
        reportError(error, '載入篩選選項失敗')
        return false
      } finally {
        optionsPromise = null
      }
    })()

    return optionsPromise
  }

  const fetchStats = async (month: string | null = referenceMonth.value) => {
    loadingStats.value = true
    try {
      const base: Record<string, unknown> = {}
      if (month) base.reference_month = month
      if (statsSchoolYear.value != null) base.school_year = statsSchoolYear.value
      if (statsSemester.value != null) base.semester = statsSemester.value
      const params = buildScopeParams(base)
      const response = await getRecruitmentStats(params)
      applyStatsPayload(response.data)
      return true
    } catch (error) {
      reportError(error, '載入統計資料失敗')
      return false
    } finally {
      loadingStats.value = false
    }
  }

  const loadDashboard = async () => {
    const [statsOk, optionsOk] = await Promise.all([
      fetchStats(),
      fetchOptions(),
    ])
    return statsOk && optionsOk
  }

  const setReferenceMonth = async (month: string | null) => {
    referenceMonth.value = month || null
    return fetchStats(referenceMonth.value)
  }

  const handleExportExcel = async () => {
    exportingExcel.value = true
    try {
      const filename = '招生統計.xlsx'
      const urlParams = new URLSearchParams()
      if (referenceMonth.value) urlParams.set('reference_month', referenceMonth.value)
      if (statsSchoolYear.value != null) urlParams.set('school_year', String(statsSchoolYear.value))
      if (statsSemester.value != null) urlParams.set('semester', String(statsSemester.value))
      const query = urlParams.toString()
      const url = query ? `/recruitment/stats/export?${query}` : '/recruitment/stats/export'
      await downloadFile(url, filename)
      return true
    } catch (error) {
      reportError(error, '匯出失敗')
      return false
    } finally {
      exportingExcel.value = false
    }
  }

  return {
    stats,
    options,
    loadingStats,
    optionsLoaded,
    exportingExcel,
    referenceMonth,
    statsSchoolYear,
    statsSemester,
    invalidateOptions,
    fetchOptions,
    fetchStats,
    loadDashboard,
    setReferenceMonth,
    handleExportExcel,
  }
}
