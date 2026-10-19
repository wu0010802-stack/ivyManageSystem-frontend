/**
 * 「排班與出勤」整月格子資料（SPEC-027 C 期 D-06）：頁面建立一份，同時給本月進度條與月格子，
 * 不各自打 API。換月或資料異動（revision）時重抓；換月時先清掉舊月，載入中不顯示別月的數字。
 */
import { computed, ref, watch, type Ref } from 'vue'
import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { apiError } from '@/utils/error'
import { indexCells, monthRange, type GridOut } from '@/utils/scheduleAttendanceGrid'
import { detectAttendancePatterns } from '@/utils/attendancePatterns'

export function useMonthGrid(anchorDate: Ref<string>, revision: Ref<number>) {
  const range = computed(() => monthRange(anchorDate.value))
  const data = ref<GridOut | null>(null)
  const loading = ref(false)
  const loadError = ref('')
  let seq = 0
  /** data 是哪個月（請求當下的月初）；換月重抓時先清掉，載入中不顯示別月的數字 */
  let loadedStart = ''

  async function reload(): Promise<void> {
    const current = ++seq
    const { start, end } = range.value
    // 同一個月再抓＝寫入後的重抓（revision、面板呼叫）：繞過 apiDedupe，不領到寫入前就在途的舊快照
    const sameMonth = loadedStart === start
    const opts = sameMonth ? [{ force: true }] as const : [] as const
    if (!sameMonth) data.value = null
    loading.value = true
    loadError.value = ''
    try {
      const res = await getScheduleAttendanceGrid({ start_date: start, end_date: end }, ...opts)
      if (current === seq) {
        data.value = res.data
        loadedStart = start
      }
    } catch (err) {
      if (current === seq) {
        data.value = null
        loadedStart = ''
        loadError.value = apiError(err, '載入本月進度失敗')
      }
    } finally {
      if (current === seq) loading.value = false
    }
  }

  watch([() => range.value.start, revision], () => { void reload() }, { immediate: true })

  const cells = computed(() => indexCells(data.value?.cells ?? []))
  /** 本月型態診斷（整月同一種情形的人）：進度條的設定檢查與格子人員欄的註記共用 */
  const patterns = computed(() => (data.value ? detectAttendancePatterns(data.value) : []))
  return { range, data, cells, patterns, loading, loadError, reload }
}

export type MonthGridState = ReturnType<typeof useMonthGrid>
