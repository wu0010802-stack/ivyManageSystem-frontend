import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getManualEventCounts,
  batchUpsertManualEventCounts,
  listAppraisalCycles,
  getAppraisalAllEmployeesStatus,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'

export const MANUAL_ITEM_CODES = [
  'SCHOOL_MEETING_ABSENCE',
  'INSTITUTION_MEETING_0913',
  'INSTITUTION_MEETING_1115',
  'SELF_IMPROVEMENT_ACTIVITY',
  'STUDENT_WITHDRAWAL',
  'CLASS_TRANSFER',
  'EXAM_RESULT',
  'RECRUIT_SCORE',
  'SUPERVISOR_SCORE',
  'EXCELLENCE_NOMINATION',
  'OTHER',
]

export const MANUAL_LABEL: Record<string, string> = {
  SCHOOL_MEETING_ABSENCE: '園務會議',
  INSTITUTION_MEETING_0913: '機構會議9/13',
  INSTITUTION_MEETING_1115: '機構會議11/15',
  SELF_IMPROVEMENT_ACTIVITY: '自強活動',
  STUDENT_WITHDRAWAL: '休學人數',
  CLASS_TRANSFER: '轉班',
  EXAM_RESULT: '檢測成績',
  RECRUIT_SCORE: '招生加分',
  SUPERVISOR_SCORE: '主管加分',
  EXCELLENCE_NOMINATION: '呈報優異',
  OTHER: '其他',
}

type CountMap = Record<string, Record<string, number>>
type NoteMap = Record<string, Record<string, string>>

export function useManualEventEntry(cycleIdRef: Ref<number | null | undefined>) {
  const counts = ref<CountMap>({})
  const original = ref<CountMap>({})
  const notes = ref<NoteMap>({})
  const loading = ref(false)
  const saving = ref(false)

  async function load() {
    if (!cycleIdRef.value) return
    loading.value = true
    try {
      const { data } = await getManualEventCounts(cycleIdRef.value)
      const m: CountMap = {}
      const n: NoteMap = {}
      const entries = (data as { entries?: { participant_id: number | string; item_code: string; count: number | string; note?: string | null }[] }).entries ?? []
      for (const e of entries) {
        const pid = String(e.participant_id)
        if (!m[pid]) m[pid] = {}
        m[pid][e.item_code] = Number(e.count)
        if (e.note) {
          if (!n[pid]) n[pid] = {}
          n[pid][e.item_code] = e.note
        }
      }
      counts.value = JSON.parse(JSON.stringify(m)) as CountMap
      original.value = JSON.parse(JSON.stringify(m)) as CountMap
      notes.value = n
    } catch (e) {
      ElMessage.error(apiError(e, '載入手填事件失敗'))
    } finally {
      loading.value = false
    }
  }

  const dirtyEntries = computed(() => {
    const out: { participant_id: number; item_code: string; count: number }[] = []
    for (const pid of Object.keys(counts.value)) {
      for (const code of MANUAL_ITEM_CODES) {
        const cur = counts.value[pid]?.[code] ?? 0
        const orig = original.value[pid]?.[code] ?? 0
        if (Number(cur) !== Number(orig)) {
          out.push({ participant_id: Number(pid), item_code: code, count: Number(cur) })
        }
      }
    }
    return out
  })

  async function saveAll() {
    if (dirtyEntries.value.length === 0) {
      ElMessage.info('沒有變更')
      return
    }
    saving.value = true
    try {
      await batchUpsertManualEventCounts(cycleIdRef.value!, dirtyEntries.value)
      ElMessage.success(`已儲存 ${dirtyEntries.value.length} 筆變更`)
      await load()
    } catch (e) {
      ElMessage.error(apiError(e, '儲存失敗'))
    } finally {
      saving.value = false
    }
  }

  function getCount(pid: string | number, code: string) {
    return counts.value[String(pid)]?.[code] ?? 0
  }

  function setCount(pid: string | number, code: string, value: number) {
    const key = String(pid)
    if (!counts.value[key]) counts.value[key] = {}
    counts.value[key][code] = value
  }

  function getOriginal(pid: string | number, code: string) {
    return original.value[String(pid)]?.[code] ?? 0
  }

  /** 該格後端 note（例如「自動同步：機構活動出席（2場）」溯源標示用）；無則 null。 */
  function getNote(pid: string | number, code: string): string | null {
    return notes.value[String(pid)]?.[code] ?? null
  }

  async function inheritFromPreviousCycle(
    currentParticipants: { participant_id?: number | null; employee_id?: number }[],
  ): Promise<{ applied: number; skipped: number } | null> {
    const curId = cycleIdRef.value
    if (!curId) return null
    // 1. 取全部週期，依 start_date 升冪找出當前的前一個
    const { data: cyclesRaw } = await listAppraisalCycles()
    const cycles = (cyclesRaw as { id: number; start_date: string }[]) ?? []
    const sorted = [...cycles].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    const idx = sorted.findIndex((c) => Number(c.id) === Number(curId))
    if (idx <= 0) return null
    const prevId = sorted[idx - 1].id

    // 2. 上一週期 participant_id → employee_id
    const { data: prevStatus } = await getAppraisalAllEmployeesStatus(prevId)
    const prevParts = (prevStatus as { participants?: { participant_id?: number | null; employee_id?: number }[] }).participants ?? []
    const prevPidToEmp = new Map<number, number>()
    for (const p of prevParts) {
      if (p.participant_id != null && p.employee_id != null) prevPidToEmp.set(Number(p.participant_id), Number(p.employee_id))
    }

    // 3. 當期 employee_id → 當期 participant_id
    const empToCurPid = new Map<number, number>()
    for (const p of currentParticipants) {
      if (p.participant_id != null && p.employee_id != null) empToCurPid.set(Number(p.employee_id), Number(p.participant_id))
    }

    // 4. 上一週期手填值，逐筆對映帶入
    const { data: prevCounts } = await getManualEventCounts(prevId)
    const entries = (prevCounts as { entries?: { participant_id: number | string; item_code: string; count: number | string }[] }).entries ?? []
    let applied = 0
    let skipped = 0
    for (const e of entries) {
      const emp = prevPidToEmp.get(Number(e.participant_id))
      const curPid = emp != null ? empToCurPid.get(emp) : undefined
      if (curPid == null) { skipped++; continue }
      setCount(curPid, e.item_code, Number(e.count))
      applied++
    }
    return { applied, skipped }
  }

  watch(cycleIdRef, () => load(), { immediate: true })

  return { counts, dirtyEntries, loading, saving, load, saveAll, getCount, setCount, getOriginal, getNote, inheritFromPreviousCycle }
}
