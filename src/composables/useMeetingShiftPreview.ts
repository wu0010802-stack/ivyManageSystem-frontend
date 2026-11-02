import { ref, type Ref } from 'vue'
import { getMeetingShiftHours } from '@/api/meetings'
import type { MeetingBatchAttendance } from '@/utils/meetingBatch'
import { validateMeetingWindow, type MeetingShiftHoursItem } from '@/utils/meetingWindow'

/**
 * 批次登錄園務會議：依每人當天排班預填時數（mtgshift01，義華 2026-11-02）。
 *
 * - init(date)：不帶時段查詢 → 租戶設了會議時段就進「時段模式」，帶出時段並把排班時數寫進
 *   每列的 suggested；租戶沒設或查詢失敗 → 維持整場時數模式（舊行為）。查詢失敗時後端寫入
 *   仍會依租戶時段計算，所以退回舊畫面不會算錯，只是看不到預覽。
 * - refresh(date)：時段模式下改日期／時段後重抓（明確帶目前時段），時段不完整就不抓。
 * 只負責預覽；實際時數由 POST /meetings/batch 在後端計算。
 */
export function useMeetingShiftPreview(rows: Ref<MeetingBatchAttendance[]>) {
  const windowMode = ref(false)
  const start = ref<string | null>(null)
  const end = ref<string | null>(null)
  const loading = ref(false)
  const items = ref<Record<number, MeetingShiftHoursItem>>({})
  let seq = 0

  const apply = (list: MeetingShiftHoursItem[]) => {
    items.value = Object.fromEntries(list.map((i) => [i.employee_id, i]))
    for (const row of rows.value) {
      row.suggested = items.value[row.id]?.hours
    }
  }

  const fetchPreview = async (params: Parameters<typeof getMeetingShiftHours>[0]) => {
    const mine = ++seq
    loading.value = true
    try {
      const res = await getMeetingShiftHours(params)
      return mine === seq ? res.data : undefined
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  const init = async (date: string) => {
    windowMode.value = false
    start.value = null
    end.value = null
    apply([])
    try {
      const data = await fetchPreview({ meeting_date: date })
      if (!data?.meeting_start_time || !data.meeting_end_time) return
      start.value = data.meeting_start_time
      end.value = data.meeting_end_time
      windowMode.value = true
      apply(data.items)
    } catch {
      windowMode.value = false
    }
  }

  const refresh = async (date: string) => {
    if (!windowMode.value || !date || !start.value || !end.value) return
    if (validateMeetingWindow(start.value, end.value)) return
    try {
      const data = await fetchPreview({
        meeting_date: date,
        meeting_start_time: start.value,
        meeting_end_time: end.value,
      })
      if (data) apply(data.items)
    } catch {
      // 保留上一次的預覽；送出時後端仍依時段計算
    }
  }

  const itemFor = (employeeId: number): MeetingShiftHoursItem | undefined => items.value[employeeId]

  return { windowMode, start, end, loading, init, refresh, itemFor }
}
