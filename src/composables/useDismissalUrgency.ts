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
  student_id?: number
  student_name?: string
  classroom_name?: string
  status?: string
  requested_at?: string
  requested_by_name?: string
  note?: string
  /** pnotice01 家長預告接送：staff（舊流程，視同已在門口）/ parent（預告） */
  request_source?: string | null
  expected_arrival_at?: string | null
  arrived_at?: string | null
  cancelled_at?: string | null
  [key: string]: unknown
}

/** 家長預告且尚未抵達——顯示 ETA、不套 3/8 分鐘等候警示。 */
export function isPreArrivalNotice(call: {
  request_source?: string | null
  arrived_at?: string | null
}): boolean {
  return call.request_source === 'parent' && !call.arrived_at
}

/**
 * 等候時間起算點：實際到門口（arrived_at）優先；staff 舊流程 arrived_at＝
 * requested_at（migration 已回填），無 arrived_at 時防禦性 fallback requested_at
 * ——確保等候語意永遠是「家長在門口等多久」，不是「按下通知多久」。
 */
export function waitAnchorIso(call: {
  requested_at?: string | null
  arrived_at?: string | null
}): string | null | undefined {
  return call.arrived_at || call.requested_at
}

/** 「預計 HH:MM」（台北時間）。無法解析回空字串。 */
export function formatExpectedArrival(iso: string | null | undefined): string {
  const d = parseTaipeiDate(iso)
  if (!d) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `預計 ${hh}:${mm}`
}

/** ETA 差（分鐘，向零取整）：未到為正、已過為負。無法解析回 null。 */
export function etaDeltaMinutes(
  iso: string | null | undefined,
  nowMs: number,
): number | null {
  const d = parseTaipeiDate(iso)
  if (!d) return null
  return Math.trunc((d.getTime() - nowMs) / 60000)
}

/** ETA 相對文案：「還有 N 分」／「即將抵達」（±1 分內）／「預計時間已過 N 分」。 */
export function etaRelativeText(
  iso: string | null | undefined,
  nowMs: number,
): string {
  const delta = etaDeltaMinutes(iso, nowMs)
  if (delta == null) return ''
  if (delta > 0) return `還有 ${delta} 分`
  if (delta === 0) return '即將抵達'
  return `預計時間已過 ${-delta} 分`
}

/**
 * active queue 排序（管理端與教師端共用，語意單一來源）：
 * 1. 已抵達者優先，依 arrived_at 最舊到最新（等最久的孩子最前）
 * 2. 尚未抵達者依 expected_arrival_at 由近到遠（已超過 ETA 自然排最前）
 * staff 舊資料 arrived_at=requested_at → 全體落在第 1 組，等價原 FIFO。
 */
export function sortActiveQueue<
  T extends {
    requested_at?: string | null
    expected_arrival_at?: string | null
    arrived_at?: string | null
  },
>(calls: T[]): T[] {
  const ts = (iso: string | null | undefined) =>
    parseTaipeiDate(iso)?.getTime() ?? Number.MAX_SAFE_INTEGER
  return [...calls].sort((a, b) => {
    const aArrived = !!a.arrived_at
    const bArrived = !!b.arrived_at
    if (aArrived !== bArrived) return aArrived ? -1 : 1
    if (aArrived) return ts(a.arrived_at) - ts(b.arrived_at)
    return (
      ts(a.expected_arrival_at ?? a.requested_at) -
      ts(b.expected_arrival_at ?? b.requested_at)
    )
  })
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
