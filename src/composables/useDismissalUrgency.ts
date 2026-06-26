import { ref, onMounted, onUnmounted } from 'vue'
import { parseTaipeiDate } from '@/utils/taipeiTime'

/**
 * 接送通知「等候時間 / 緊急度」共用邏輯。
 *
 * 老師端 portal 與管理端佇列共用同一套：把家長已等候的時間變成主角，
 * 並依門檻升級顏色，讓最久沒被接的孩子最醒目。純函式部分（elapsed /
 * level / format）可單獨測試，元件只負責渲染。
 *
 * 台北時區解析統一委派 `@/utils/taipeiTime`（單一事實來源；admin 歷史表格、
 * 家長時間軸同源），此處 re-export 維持既有 import 相容。
 */
export { parseTaipeiDate } from '@/utils/taipeiTime'

/** 等候時間升級門檻（分鐘）。3 分轉琥珀提醒、8 分轉紅警示。日後要調整服務標準改這兩個常數即可。 */
export const URGENCY_WARNING_MIN = 3
export const URGENCY_CRITICAL_MIN = 8

export type UrgencyLevel = 'normal' | 'warning' | 'critical'

/** 接送通知 payload 的最小形狀（管理端 / portal 共用欄位，見後端 _call_base_dict）。 */
export interface DismissalCallView {
  id: number
  student_name?: string
  classroom_name?: string
  status?: string
  requested_at?: string
  requested_by_name?: string
  note?: string
  [key: string]: unknown
}

/** 已等候分鐘數（向下取整，下限 0）。無法解析回 null。 */
export function elapsedMinutes(
  iso: string | null | undefined,
  nowMs: number,
): number | null {
  const d = parseTaipeiDate(iso)
  if (!d) return null
  return Math.max(0, Math.floor((nowMs - d.getTime()) / 60000))
}

/** 依等候分鐘數決定緊急度。null（未知）視為 normal。 */
export function urgencyLevel(minutes: number | null): UrgencyLevel {
  if (minutes == null) return 'normal'
  if (minutes >= URGENCY_CRITICAL_MIN) return 'critical'
  if (minutes >= URGENCY_WARNING_MIN) return 'warning'
  return 'normal'
}

/** 等候時間的人話文案。剛到顯示「剛剛」，逾一小時顯示時 + 分。null 回空字串（不顯示）。 */
export function formatWaited(minutes: number | null): string {
  if (minutes == null) return ''
  if (minutes <= 0) return '剛剛'
  if (minutes < 60) return `等候 ${minutes} 分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `等候 ${h} 小時 ${m} 分` : `等候 ${h} 小時`
}

/** 姓名首字圓徽文字。取首個字元（中文姓氏一字 / 英文首字母大寫），空值回「？」。 */
export function monogramOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '？'
  return [...trimmed][0].toUpperCase()
}

/** 依 requested_at 由舊到新排序（最久等候優先 / FIFO），回傳新陣列、不變動輸入。 */
export function sortByOldestFirst<T extends { requested_at?: string | null }>(
  calls: T[],
): T[] {
  return [...calls].sort((a, b) => {
    const ta = parseTaipeiDate(a.requested_at)?.getTime() ?? 0
    const tb = parseTaipeiDate(b.requested_at)?.getTime() ?? 0
    return ta - tb
  })
}

/**
 * 每 30 秒前進一次的 now（毫秒），讓相對等候時間活著跳。
 * 單一 interval、掛載時立即校時、卸載時清除。純函式吃 now 值，元件吃這個 ref。
 */
export function useNowClock(intervalMs = 30000) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, intervalMs)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })
  return { now }
}
