/**
 * 接送管理 POS 佈局：單一學生狀態／排序權重純函式（T-002，proxy_picked 見 T-023）。
 *
 * 輸入單一學生 + 今日 dismissal calls（＋全園當日請假／放學車名單），輸出卡片徽章
 * 要顯示的狀態、排序權重與 ⋮ 選單需要的來源細節。
 * - guardian_picked／proxy_picked：status=completed 的 call（D5），差別在
 *   request_source==='proxy' 與否（D10：委託代理人代接需獨立徽章）。
 * - bus_picked（posbus01）：放學車上車打卡（pos-status 的 bus_departed，系統帶入）
 *   或辦公室補登的 request_source==='bus' completed call（可撤銷）。
 * - on_leave（posbus01）：今日出缺勤為病假／事假（pos-status 的 leaves）。
 * 純函式，方便單獨測試，元件只負責渲染。
 */

import type { PosDayStatus, PosStudentStatus, PosStudentStatusDetail } from '@/types/dismissalPos'
import { ACTIVE_STATUSES } from '@/composables/useDismissalRoster'

/** 今日 dismissal call 的最小輸入形狀（比照 useDismissalRoster.ts 的 RosterCallInput 慣例）。 */
export interface PosStudentCallInput {
  id?: number
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
  detail: PosStudentStatusDetail
}

/** unpicked 排最前；其餘（on_leave / bus_picked / guardian_picked / proxy_picked）殿後，權重相同即可（同組內排序由呼叫端另外處理）。 */
const SORT_WEIGHT: Record<PosStudentStatus, number> = {
  unpicked: 0,
  on_leave: 1,
  bus_picked: 1,
  guardian_picked: 1,
  proxy_picked: 1,
}

/** 該生今日第一筆指定 request_source 的 status=completed call（未指定 source 時比對 bus 以外的任何來源）。 */
function findCompletedCall(
  studentId: number,
  calls: PosStudentCallInput[],
  source?: string,
): PosStudentCallInput | undefined {
  return calls.find(
    c =>
      c.student_id === studentId &&
      c.status === 'completed' &&
      (source === undefined ? c.request_source !== 'bus' : c.request_source === source),
  )
}

/** 該生是否有進行中（pending/acknowledged）通知——再次通知時它比舊的 completed 更能代表現況。 */
function hasActiveCall(studentId: number, calls: PosStudentCallInput[]): boolean {
  return calls.some(c => c.student_id === studentId && ACTIVE_STATUSES.has(c.status ?? ''))
}

/**
 * 輸入單一學生 + 今日 dismissal calls[]（＋當日請假／放學車名單），輸出 { status, sortWeight, detail }。
 * pending/acknowledged/cancelled 等非 completed 狀態一律仍算 unpicked（尚未真正完成接送）。
 *
 * 優先權（高→低）：
 * 1. 有進行中通知 → unpicked：已放學後再次通知時，不讓舊的 completed 記錄把新通知
 *    蓋掉；對請假／娃娃車同樣適用（家長臨時改來接，以現場通知為準）。
 * 2. proxy_picked：資料異常同時存在 proxy 與非 proxy completed 時，委託代理人是需要
 *    辦公室特別留意的較窄訊號，寧可多顯示這個提醒。
 * 3. guardian_picked：人已被家長接走是最終事實，蓋過請假／娃娃車。
 * 4. bus_picked：補登的 bus call 或放學車上車打卡。
 * 5. on_leave。
 */
export function useStudentPosStatus(
  student: PosStudentInput,
  calls: PosStudentCallInput[],
  day?: PosDayStatus,
): PosStudentStatusResult {
  const detail: PosStudentStatusDetail = {}
  const status = resolveStatus(student.id, calls, day, detail)
  return { status, sortWeight: SORT_WEIGHT[status], detail }
}

function resolveStatus(
  studentId: number,
  calls: PosStudentCallInput[],
  day: PosDayStatus | undefined,
  detail: PosStudentStatusDetail,
): PosStudentStatus {
  if (hasActiveCall(studentId, calls)) return 'unpicked'
  if (findCompletedCall(studentId, calls, 'proxy')) return 'proxy_picked'
  if (findCompletedCall(studentId, calls)) return 'guardian_picked'

  const busCall = findCompletedCall(studentId, calls, 'bus')
  const departed = day?.busDeparted.get(studentId)
  if (busCall || departed) {
    if (busCall?.id != null) detail.busManualCallId = busCall.id
    if (departed) detail.busRouteName = departed.routeName
    return 'bus_picked'
  }

  const leave = day?.leaves.get(studentId)
  if (leave) {
    detail.leaveType = leave.leaveType
    detail.leaveMarkedByPos = leave.markedByPos
    return 'on_leave'
  }
  return 'unpicked'
}
