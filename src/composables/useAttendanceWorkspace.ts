import { ref, computed, watch, type Ref } from 'vue'
import { getSummary, getAnomalyList } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'

export interface RosterRow {
  employee_id: number
  employee_name: string
  employee_number?: string
  normal_days: number
  late_count: number
  early_leave_count: number
  missing_punch_in: number
  missing_punch_out: number
  total_late_minutes: number
}

export interface AnomalyItem {
  id: number
  employee_name: string
  employee_number: string
  date: string
  weekday: string
  type: 'late' | 'early_leave' | 'missing_punch'
  type_label: string
  detail: string
  estimated_deduction: number
  confirmed_action: string | null
}

export interface Kpis {
  fullAttendance: number
  lateCount: number
  missingCount: number
  pendingAnomalies: number
}

export function dedupeAnomalyIds(items: { id: number }[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const it of items) {
    if (!seen.has(it.id)) {
      seen.add(it.id)
      out.push(it.id)
    }
  }
  return out
}

export function buildKpis(summary: RosterRow[], anomalies: { pending?: number }): Kpis {
  let lateCount = 0
  let missingCount = 0
  let full = 0
  for (const r of summary) {
    lateCount += r.late_count || 0
    missingCount += (r.missing_punch_in || 0) + (r.missing_punch_out || 0)
    if (!r.late_count && !r.early_leave_count && !r.missing_punch_in && !r.missing_punch_out) {
      full += 1
    }
  }
  return {
    fullAttendance: full,
    lateCount,
    missingCount,
    pendingAnomalies: anomalies?.pending || 0,
  }
}

export function useAttendanceWorkspace(year: Ref<number>, month: Ref<number>) {
  const { notify } = useErrorNotify()
  const roster = ref<RosterRow[]>([])
  const anomalyQueue = ref<AnomalyItem[]>([])
  const anomalyMeta = ref<{ total: number; pending: number; confirmed: number }>({
    total: 0,
    pending: 0,
    confirmed: 0,
  })
  const loading = ref(false)

  // 防切月 race：晚到的舊請求不得蓋掉新月資料（epoch 比對，鏡像 useSalarySettlement）
  let epoch = 0

  const kpis = computed<Kpis>(() => buildKpis(roster.value, anomalyMeta.value))

  async function refresh() {
    const my = ++epoch
    loading.value = true
    try {
      const [sumRes, anoRes] = await Promise.all([
        getSummary({ year: year.value, month: month.value }),
        getAnomalyList({ year: year.value, month: month.value, status: 'all' }),
      ])
      if (my !== epoch) return
      const anoData = (anoRes.data ?? {}) as { // TODO(ts-strict): waiting on backend response_model
        total?: number
        pending?: number
        confirmed?: number
        items?: AnomalyItem[]
      }
      const items: AnomalyItem[] = anoData.items ?? []
      roster.value = (sumRes.data ?? []) as RosterRow[] // TODO(ts-strict): waiting on backend response_model
      anomalyQueue.value = items.filter(it => it.confirmed_action == null)
      anomalyMeta.value = {
        total: anoData.total ?? 0,
        pending: anoData.pending ?? 0,
        confirmed: anoData.confirmed ?? 0,
      }
    } catch (e) {
      if (my === epoch) notify(e, 'useAttendanceWorkspace.refresh', '載入考勤工作台失敗')
    } finally {
      if (my === epoch) loading.value = false
    }
  }

  watch([year, month], refresh)

  return { roster, anomalyQueue, anomalyMeta, kpis, loading, refresh }
}

export type AttendanceWorkspace = ReturnType<typeof useAttendanceWorkspace>
