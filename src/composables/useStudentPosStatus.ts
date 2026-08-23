/**
 * 接送管理 POS 佈局：單一學生狀態／排序權重純函式（T-002，proxy_picked 見 T-023）。
 *
 * 輸入單一學生 + 今日 dismissal calls，輸出卡片徽章要顯示的狀態與排序權重。
 * on_leave / bus_picked 本輪皆無資料來源（D3/D4，backlog 見 BD-002/BD-003），
 * 永遠判定為 false；guardian_picked 與 proxy_picked 皆由既有 status=completed 的
 * call 判定（D5，dismissal_calls 既有欄位，不需要新後端端點），差別在
 * request_source==='proxy' 與否（D10：委託代理人代接需獨立徽章，不與本人家長共用）。
 * 純函式，方便單獨測試，元件只負責渲染。
 */

import type { PosStudentStatus } from '@/types/dismissalPos'
import { ACTIVE_STATUSES } from '@/composables/useDismissalRoster'

/** 今日 dismissal call 的最小輸入形狀（比照 useDismissalRoster.ts 的 RosterCallInput 慣例）。 */
export interface PosStudentCallInput {
  student_id?: number
  status?: string
  /** 比照 useDismissalUrgency.ts 的 DismissalCallView：'proxy' 代表委託代理人代接（T-023）。 */
  request_source?: string | null
}

/** 學生輸入最小形狀：目前只需要 id 來比對 calls。 */
export interface PosStudentInput {
  id: number
}

export interface PosStudentStatusResult {
  status: PosStudentStatus
  sortWeight: number
}

/** unpicked 排最前；其餘（on_leave / bus_picked / guardian_picked / proxy_picked）殿後，權重相同即可（同組內排序由呼叫端另外處理）。 */
const SORT_WEIGHT: Record<PosStudentStatus, number> = {
  unpicked: 0,
  on_leave: 1,
  bus_picked: 1,
  guardian_picked: 1,
  proxy_picked: 1,
}

/** 該生今日是否有一筆指定 request_source 的 status=completed call（未指定 source 時比對任何來源）。 */
function hasCompletedCall(
  studentId: number,
  calls: PosStudentCallInput[],
  source?: string,
): boolean {
  return calls.some(
    c =>
      c.student_id === studentId &&
      c.status === 'completed' &&
      (source === undefined || c.request_source === source),
  )
}

/** 該生是否有進行中（pending/acknowledged）通知——再次通知時它比舊的 completed 更能代表現況。 */
function hasActiveCall(studentId: number, calls: PosStudentCallInput[]): boolean {
  return calls.some(c => c.student_id === studentId && ACTIVE_STATUSES.has(c.status ?? ''))
}

/**
 * 輸入單一學生 + 今日 dismissal calls[]，輸出 { status, sortWeight }。
 * pending/acknowledged/cancelled 等非 completed 狀態一律仍算 unpicked（尚未真正完成接送）。
 *
 * 已放學（completed）後可再次通知：同時存在 completed ＋ 進行中通知時，以進行中
 * 為準判 unpicked（卡片回到待接送外觀），不讓舊的 completed 記錄把新通知蓋掉——
 * 這條規則對 guardian_picked／proxy_picked 一視同仁，優先權最高。
 *
 * 防禦性優先權（限沒有進行中通知時）：同一學生同日理論上只會有一種完成路徑，
 * 但若資料異常同時存在 proxy 與非 proxy 的 completed call，proxy_picked 優先——
 * 委託代理人代接是需要辦公室特別留意的較窄訊號（人不是家長本人），異常時寧可
 * 多顯示這個提醒。
 */
export function useStudentPosStatus(
  student: PosStudentInput,
  calls: PosStudentCallInput[],
): PosStudentStatusResult {
  const status: PosStudentStatus = hasActiveCall(student.id, calls)
    ? 'unpicked'
    : hasCompletedCall(student.id, calls, 'proxy')
      ? 'proxy_picked'
      : hasCompletedCall(student.id, calls)
        ? 'guardian_picked'
        : 'unpicked'
  return { status, sortWeight: SORT_WEIGHT[status] }
}
