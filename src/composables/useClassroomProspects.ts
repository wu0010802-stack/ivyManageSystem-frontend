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
  // 快速切年級時舊回應不得覆寫較新請求的結果。
  let reloadSeq = 0

  async function reload(): Promise<void> {
    const { grade_id, school_year, semester } = opts.value
    if (grade_id == null || school_year == null) {
      reloadSeq += 1
      reservedCount.value = 0
      prospects.value = []
      return
    }
    const seq = ++reloadSeq
    loading.value = true
    try {
      const [planResp, recResp] = await Promise.all([
        getIntakePlan({ school_year, semester: semester ?? 1 }),
        getRecruitmentRecords({ has_deposit: true, page_size: 200 }),
      ])
      if (seq !== reloadSeq) return // 過期回應：已切到別年級，丟棄不覆寫
      const planRows = ((planResp.data as { rows?: PlanRowLite[] }).rows ?? []) as PlanRowLite[]
      reservedCount.value = planRows.find((r) => r.grade_id === grade_id)?.reserved_count ?? 0
      const records = ((recResp.data as { records?: ProspectRow[] }).records ?? []) as ProspectRow[]
      // 與 compute_intake_plan 的 reserved_count 同 scope（grade + 學年 + 學期 + 未報到），
      // 使名單與容量 pill 的「保留 N」一致。
      prospects.value = records.filter(
        (r) =>
          r.provisional_grade_id === grade_id &&
          r.target_school_year === school_year &&
          r.target_semester === (semester ?? 1) &&
          !r.enrolled,
      )
    } finally {
      if (seq === reloadSeq) loading.value = false
    }
  }

  return { reservedCount, prospects, loading, reload }
}
