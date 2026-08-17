import { ref, watch } from 'vue'
import { getSignStatusSummary, getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndGrid, getYearEndCycleExceptions, previewAppraisalPayout } from '@/api/yearEnd'
import { apiError } from '@/utils/error'

export interface CycleHandle { id: number; label: string; status: string }

// ── 考核（比照 WorkbenchAppraisalCard.vue 既有 load() 邏輯）──────────────
export function useAppraisalWorkbenchStats(cycle: () => CycleHandle | null) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const counts = ref<Record<string, number>>({})

  async function load() {
    const c = cycle()
    if (!c) {
      stat.value = 0
      return
    }
    loading.value = true
    errorMsg.value = ''
    try {
      const acc = (await getSignStatusSummary(c.id)).data.counts ?? {}
      counts.value = acc
      const total = Object.values(acc).reduce((s, n) => s + n, 0)
      stat.value = total - (acc.FINALIZED ?? 0)
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(cycle, load, { immediate: true })
  return { loading, errorMsg, stat, counts, load }
}

// ── 年終（比照 WorkbenchYearEndCard.vue 既有 load() 邏輯；getYearEndGrid
//    回傳裸陣列 GridRowOut[]，非 { rows: [...] }）──────────────────────
export function useYearEndWorkbenchStats(cycle: () => CycleHandle | null) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const counts = ref<Record<string, number>>({})

  async function load() {
    const c = cycle()
    if (!c) {
      stat.value = 0
      return
    }
    loading.value = true
    errorMsg.value = ''
    try {
      const rows = (await getYearEndGrid(c.id)).data
      const acc: Record<string, number> = {}
      for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1
      counts.value = acc
      stat.value = rows.filter((r) => r.status !== 'FINALIZED').length
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(cycle, load, { immediate: true })
  return { loading, errorMsg, stat, counts, load }
}

// ── 例外（比照 WorkbenchExceptionsCard.vue 既有 load() 邏輯；severity 實際值
//    為 blocking/warning/info，見 schema.d.ts ExceptionItemOut.severity）──
type Severity = 'blocking' | 'warning' | 'info'

export function useExceptionsWorkbenchStats(
  appraisalCycle: () => CycleHandle | null,
  yearEndCycle: () => CycleHandle | null,
) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const appraisalCount = ref(0)
  const yearEndCount = ref(0)
  const severityCounts = ref<Partial<Record<Severity, number>>>({})

  async function load() {
    loading.value = true
    errorMsg.value = ''
    try {
      const aCycle = appraisalCycle()
      const yCycle = yearEndCycle()
      const [aRes, yRes] = await Promise.all([
        aCycle ? getAppraisalCycleExceptions(aCycle.id) : Promise.resolve(null),
        yCycle ? getYearEndCycleExceptions(yCycle.id) : Promise.resolve(null),
      ])
      const aItems = aRes?.data.items ?? []
      const yItems = yRes?.data.items ?? []
      appraisalCount.value = aItems.length
      yearEndCount.value = yItems.length
      const sev: Partial<Record<Severity, number>> = {}
      for (const it of [...aItems, ...yItems]) {
        const key = it.severity as Severity
        sev[key] = (sev[key] ?? 0) + 1
      }
      severityCounts.value = sev
      stat.value = sev.blocking ?? 0
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(() => [appraisalCycle()?.id, yearEndCycle()?.id], load, { immediate: true })
  return { loading, errorMsg, stat, appraisalCount, yearEndCount, severityCounts, load }
}

// ── 發放（比照 WorkbenchPayoutCard.vue 既有 load() 邏輯；422 = 資料態尚未
//    就緒，非載入失敗，不視為 error）────────────────────────────────────
const NOT_READY_MESSAGE = '本年度尚無可發放的考核年終資料，可切換年份，或前往考核管理建立來源學年的考核週期'

export function usePayoutWorkbenchStats(year: () => number) {
  const loading = ref(false)
  const errorMsg = ref('')
  const notReady = ref(false)
  const stat = ref<number | undefined>(undefined)
  const totalAmount = ref(0)

  async function load() {
    loading.value = true
    errorMsg.value = ''
    notReady.value = false
    try {
      const rows = (await previewAppraisalPayout(year())).data
      stat.value = rows.length
      totalAmount.value = rows.reduce((sum, r) => sum + Number(r.total_amount), 0)
    } catch (e) {
      const status = (e as { response?: { status?: number } } | null)?.response?.status
      if (status === 422) {
        notReady.value = true
        errorMsg.value = NOT_READY_MESSAGE
        stat.value = 0
      } else {
        errorMsg.value = apiError(e, '載入失敗')
        stat.value = 0
      }
    } finally {
      loading.value = false
    }
  }
  watch(year, load, { immediate: true })
  return { loading, errorMsg, notReady, stat, totalAmount, load }
}
