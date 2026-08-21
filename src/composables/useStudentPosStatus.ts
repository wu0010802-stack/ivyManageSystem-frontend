/**
 * 接送管理 POS 佈局：單一學生狀態／排序權重純函式（T-002）。
 *
 * 輸入單一學生 + 今日 dismissal calls，輸出卡片徽章要顯示的狀態與排序權重。
 * on_leave / bus_picked 本輪皆無資料來源（D3/D4，backlog 見 BD-002/BD-003），
 * 永遠判定為 false；只有 guardian_picked 由既有 status=completed 的 call 判定
 * （D5，dismissal_calls 既有欄位，不需要新後端端點）。純函式，方便單獨測試，
 * 元件只負責渲染。
 */

import type { PosStudentStatus } from '@/types/dismissalPos'
import { ACTIVE_STATUSES } from '@/composables/useDismissalRoster'

/** 今日 dismissal call 的最小輸入形狀（比照 useDismissalRoster.ts 的 RosterCallInput 慣例）。 */
export interface PosStudentCallInput {
  student_id?: number
  status?: string
}

/** 學生輸入最小形狀：目前只需要 id 來比對 calls。 */
export interface PosStudentInput {
  id: number
}

export interface PosStudentStatusResult {
  status: PosStudentStatus
  sortWeight: number
}

/** unpicked 排最前；其餘（on_leave / bus_picked / guardian_picked）殿後，權重相同即可（同組內排序由呼叫端另外處理）。 */
const SORT_WEIGHT: Record<PosStudentStatus, number> = {
  unpicked: 0,
  on_leave: 1,
  bus_picked: 1,
  guardian_picked: 1,
}

/** 該生今日是否有一筆 status=completed 的 call（D5：家長已接送＝既有真實資料）。 */
function hasCompletedCall(studentId: number, calls: PosStudentCallInput[]): boolean {
  return calls.some(c => c.student_id === studentId && c.status === 'completed')
}

/** 該生是否有進行中（pending/acknowledged）通知——再次通知時它比舊的 completed 更能代表現況。 */
function hasActiveCall(studentId: number, calls: PosStudentCallInput[]): boolean {
  return calls.some(c => c.student_id === studentId && ACTIVE_STATUSES.has(c.status ?? ''))
}

/**
 * 輸入單一學生 + 今日 dismissal calls[]，輸出 { status, sortWeight }。
 * pending/acknowledged/cancelled 等非 completed 狀態一律仍算 unpicked（尚未真正完成接送）。
 * 已放學（completed）後可再次通知：同時存在 completed ＋ 進行中通知時，以進行中
 * 為準判 unpicked（卡片回到待接送外觀），不讓舊的 completed 記錄把新通知蓋掉。
 */
export function useStudentPosStatus(
  student: PosStudentInput,
  calls: PosStudentCallInput[],
): PosStudentStatusResult {
  const status: PosStudentStatus =
    hasCompletedCall(student.id, calls) && !hasActiveCall(student.id, calls)
      ? 'guardian_picked'
      : 'unpicked'
  return { status, sortWeight: SORT_WEIGHT[status] }
}
