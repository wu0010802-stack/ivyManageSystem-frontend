import { ref, computed, watch, type Ref } from 'vue'
import { getSummary, getAnomalyList } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { ApiResponse } from '@/api/_generated/typed'

export type SummaryRowApi = ApiResponse<'/attendance/summary', 'get'>[number]
export type AnomalyRowApi = ApiResponse<'/attendance/anomalies', 'get'>['items'][number]

export interface RosterRow {
  employee_id: number
  employee_name: string
  employee_number?: string | null
  normal_days: number
  late_count: number
  early_leave_count: number
  missing_punch_in: number
  missing_punch_out: number
  total_late_minutes: number
}

/** 單一異常項（遲到／早退／缺卡），屬於某張日卡 */
export interface AnomalyEntry {
  type: string // 'late' | 'early_leave' | 'missing_punch'
  type_label: string
  detail: string
  /** 遮罩語意：非全員薪資視野後端回 null，不得在前端變 0 */
  estimated_deduction: number | null
}

/**
 * 一天一張卡（P1-4）：後端一筆 Attendance 可展開多列異常但共用 attendance id；
 * 管理端以日卡呈現、卡內列出所有異常。admin_accept / admin_waive 的薪資語意
 * 是**整天**，處理會套用到整張卡。
 */
export interface AnomalyDayCard {
  id: number
  employee_name: string
  employee_number: string
  date: string
  weekday: string
  confirmed_action: string | null
  items: AnomalyEntry[]
}

/** @deprecated 舊名相容：異常佇列元素現為日卡 */
export type AnomalyItem = AnomalyDayCard

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

/** 後端逐異常列 → 依 attendance id 分組成日卡（保留首見順序與所有狀態） */
export function groupAnomalies(
  rows: Pick<
    AnomalyRowApi,
    | 'id'
    | 'employee_name'
    | 'employee_number'
    | 'date'
    | 'weekday'
    | 'type'
    | 'type_label'
    | 'detail'
    | 'estimated_deduction'
    | 'confirmed_action'
  >[],
): AnomalyDayCard[] {
  const byId = new Map<number, AnomalyDayCard>()
  for (const r of rows) {
    let card = byId.get(r.id)
    if (!card) {
      card = {
        id: r.id,
        employee_name: r.employee_name,
        employee_number: r.employee_number ?? '',
        date: r.date,
        weekday: r.weekday,
        confirmed_action: r.confirmed_action ?? null,
        items: [],
      }
      byId.set(r.id, card)
    }
    card.items.push({
      type: r.type,
      type_label: r.type_label,
      detail: r.detail,
      estimated_deduction: r.estimated_deduction ?? null,
    })
  }
  return [...byId.values()]
}

export function buildKpis(
  summary: Pick<
    RosterRow,
    'late_count' | 'early_leave_count' | 'missing_punch_in' | 'missing_punch_out'
  >[],
  anomalies: { pending?: number },
): Kpis {
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
    // 語意：「已有紀錄且無異常」的人數——expected workdays 尚未定義，
    // 不可宣稱真「全勤」（P1-3，待業主裁定）
    fullAttendance: full,
    lateCount,
    missingCount,
    pendingAnomalies: anomalies?.pending || 0,
  }
}

export function useAttendanceWorkspace(year: Ref<number>, month: Ref<number>) {
  const { notify } = useErrorNotify()
  const roster = ref<RosterRow[]>([])
  const anomalyQueue = ref<AnomalyDayCard[]>([])
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
      const anoData = anoRes.data ?? { total: 0, pending: 0, confirmed: 0, items: [] }
      roster.value = sumRes.data ?? []
      // P1-4：queue 保留全部狀態（依 id 分組成日卡）；「未處理/已處理」
      // 篩選由 AnomalyQueueColumn 依 confirmed_action 過濾，讓 status filter 真的生效
      anomalyQueue.value = groupAnomalies(anoData.items ?? [])
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
