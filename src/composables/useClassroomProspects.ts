/**
 * 班級頁準新生（保留座位）：reservedCount 取自 intake-plan，名單取自 records（client filter）。
 * 走正確路由的 records/intake，不依賴招生漏斗。
 */
import { ref, type Ref } from 'vue'
import { getIntakePlan } from '@/api/recruitmentIntake'
import { getRecruitmentRecords } from '@/api/recruitment'

export interface ProspectRow {
  id: number
  child_name?: string
  source?: string
  has_deposit?: boolean
  target_semester?: number | null
  [key: string]: unknown
}
export interface ClassroomKey {
  grade_id?: number | null
  school_year?: number | null
  semester?: number | null
}

interface PlanRowLite {
  grade_id: number
  reserved_count: number
}

export function useClassroomProspects(opts: Ref<ClassroomKey>) {
  const reservedCount = ref(0)
  const prospects = ref<ProspectRow[]>([])
  const loading = ref(false)

  async function reload(): Promise<void> {
    const { grade_id, school_year, semester } = opts.value
    if (grade_id == null || school_year == null) {
      reservedCount.value = 0
      prospects.value = []
      return
    }
    loading.value = true
    try {
      const [planResp, recResp] = await Promise.all([
        getIntakePlan({ school_year, semester: semester ?? 1 }),
        getRecruitmentRecords({ has_deposit: true, page_size: 200 }),
      ])
      const planRows = ((planResp.data as { rows?: PlanRowLite[] }).rows ?? []) as PlanRowLite[]
      reservedCount.value = planRows.find((r) => r.grade_id === grade_id)?.reserved_count ?? 0
      const records = ((recResp.data as { records?: ProspectRow[] }).records ?? []) as ProspectRow[]
      prospects.value = records.filter(
        (r) =>
          r.provisional_grade_id === grade_id &&
          r.target_school_year === school_year &&
          !r.enrolled,
      )
    } finally {
      loading.value = false
    }
  }

  return { reservedCount, prospects, loading, reload }
}
