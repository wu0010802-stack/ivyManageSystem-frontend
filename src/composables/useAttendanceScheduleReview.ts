import { ref } from 'vue'
import { getAttendanceMonthContext } from '@/api/attendanceMonthContext'
import { classifyScheduleReview, isCurrentScheduleRow, manualScheduleHint, reviewFingerprint } from '@/utils/attendanceScheduleReview'
import type { ScheduleHint, ScheduleReviewRow } from '@/utils/attendanceScheduleReview'

/** 僅保存本次匯入所需提示；不保存名冊或請假明細，跨次載入合計最多兩個請求。 */
export function useAttendanceScheduleReview() {
  const hints = ref<Record<string, ScheduleHint>>({})
  const requiredKeys = ref(new Set<string>())
  const blockingKeys = ref(new Set<string>())
  const loading = ref(false)
  const loaded = ref(false)
  const completed = ref(0)
  const total = ref(0)
  const failed = ref(0)
  let generation = 0
  let active = 0
  let queue: (() => Promise<void>)[] = []
  let settle: (() => void) | null = null
  function invalidate(clearRequired = true) {
    generation++
    queue = []
    settle?.(); settle = null
    hints.value = {}; loading.value = false; loaded.value = false
    completed.value = 0; total.value = 0; failed.value = 0
    if (clearRequired) { requiredKeys.value = new Set(); blockingKeys.value = new Set() }
  }
  function record(row: ScheduleReviewRow, hint: ScheduleHint) {
    const key = reviewFingerprint(row)
    hints.value[key] = hint
    if (hint.kind === 'manual') {
      requiredKeys.value.add(key)
      if (row.check === 'importable' || row.check === 'overwrite') blockingKeys.value.add(key)
    }
  }
  function pump() {
    while (active < 2 && queue.length) {
      const run = queue.shift()!
      active++
      void run().finally(() => { active--; pump() })
    }
  }
  function load(rows: ScheduleReviewRow[], year: number, month: number): Promise<void> {
    invalidate(false)
    const request = generation
    loaded.value = true
    const groups = new Map<number, ScheduleReviewRow[]>()
    for (const row of rows) {
      if (!isCurrentScheduleRow(row, year, month)) { record(row, classifyScheduleReview(row, undefined, year, month)); continue }
      const id = row.matched_employee_id!
      groups.set(id, [...(groups.get(id) ?? []), row])
    }
    total.value = groups.size
    if (!groups.size) return Promise.resolve()
    loading.value = true
    return new Promise(resolve => {
      settle = resolve
      queue = [...groups].map(([id, employeeRows]) => async () => {
        if (request !== generation) return
        try {
          const response = await getAttendanceMonthContext({ year, month, employee_id: id })
          if (request !== generation) return
          for (const row of employeeRows) {
            const day = response.data.days.find(entry => entry.date === row.date)
            record(row, classifyScheduleReview(row, day ? {
              date: day.date, schedule_known: day.schedule_known, is_expected_workday: day.is_expected_workday,
              expected_start_at: day.expected_start_at, expected_end_at: day.expected_end_at,
              has_leave: day.full_day_leave || day.approved_leaves.length > 0,
            } : undefined, year, month))
          }
        } catch {
          if (request !== generation) return
          failed.value++
          for (const row of employeeRows) record(row, manualScheduleHint('班表讀取失敗，請重試或人工核對'))
        } finally {
          if (request === generation) {
            completed.value++
            if (completed.value === total.value) { loading.value = false; settle = null; resolve() }
          }
        }
      })
      pump()
    })
  }
  return { hints, requiredKeys, blockingKeys, loading, loaded, completed, total, failed, invalidate, load }
}
