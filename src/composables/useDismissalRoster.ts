/**
 * 接送通知「點名單」共用邏輯（管理端看板一鍵發起用）。
 *
 * 把在籍學生依班級分組成可一鍵發起的點名單，並依「進行中通知」標記哪些學生
 * 已在通知中（從源頭避免重複建立 / 後端 409）。純函式部分（集合 / 比對 / 分組）
 * 可單獨測試，元件只負責渲染與互動（搜尋字串、建立中 inFlight）。
 */

import {
  labelClassroomsByTerm,
  type ClassroomLike,
  type ClassroomLabeled,
} from '@/utils/classroomTerm'

export type RosterCallStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled' | string

/** 進行中通知的最小形狀（取自看板的 DismissalCallOut）。 */
export interface RosterCallInput {
  student_id?: number
  status?: RosterCallStatus
}

/** 學生清單最小形狀（取自 getStudents 的 items）。 */
export interface RosterStudentInput {
  id: number
  name: string
  classroom_id: number | null
  [key: string]: unknown
}

/** 班級輸入形狀與標籤產生一律以 utils/classroomTerm 為單一來源，避免兩份定義漂移。 */
export type ClassroomInput = ClassroomLike

/** 班級篩選下拉的一個選項；label 在同名班並存時帶學期標籤。 */
export type ClassroomOption = ClassroomLabeled

export interface RosterStudent {
  id: number
  name: string
  /** 原始班級 id（供發起 POST）；無班級為 null。 */
  classroomId: number | null
  /** 已有進行中（pending/acknowledged）通知 → 點名單上灰底停用。 */
  notifying: boolean
}

/**
 * 群組類別：
 * - classroom：對得上班級清單的正常班級。
 * - unknown：學生有 classroom_id，但班級清單裡查不到（停用班／清單未涵蓋的學期）。
 *   仍可發起通知，不可與 unassigned 混為一談。
 * - unassigned：學生真的沒有 classroom_id，無法發起通知。
 */
export type RosterGroupKind = 'classroom' | 'unknown' | 'unassigned'

export interface RosterGroup {
  classroomId: number | null
  classroomName: string
  kind: RosterGroupKind
  students: RosterStudent[]
}

/**
 * 視為「進行中」的通知狀態（佔用學生、不可重複建立）。全 repo 對「這筆通知還在
 * 走流程」的單一事實來源——useDismissalPosQueue.ts 的右欄 active 佇列判斷也
 * import 這個常數，避免兩處各自定義同一組字面值。
 */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['pending', 'acknowledged'])

const UNASSIGNED_NAME = '未分班'
const UNKNOWN_NAME = '其他班級'

/** 回傳目前有進行中通知（pending/acknowledged）的 student_id 集合。 */
export function activeCallStudentIds(calls: RosterCallInput[]): Set<number> {
  const ids = new Set<number>()
  for (const c of calls) {
    if (c.student_id != null && ACTIVE_STATUSES.has(c.status ?? '')) {
      ids.add(c.student_id)
    }
  }
  return ids
}

/** 姓名子字串比對：trim + 不分大小寫；空 query 視為全中。 */
export function matchStudent(name: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (name ?? '').toLowerCase().includes(q)
}

const byName = (a: RosterStudent, b: RosterStudent) =>
  a.name.localeCompare(b.name, 'zh-Hant')

/**
 * 產生分班點名單：
 * - 依 classrooms 給定順序分組，班級內依姓名排序。
 * - 每位學生標記 notifying（是否已在進行中通知）。
 * - 套用 query 後略過沒有任何相符學生的班級。
 * - 班級查不到的學生歸「其他班級」、真的沒班級的歸「未分班」，兩組依序殿後。
 *   （2026-07-30：兩者曾被併成「未分班」，暑假期間學生編入下學年班級時全站誤標。）
 */
export function buildRoster(
  students: RosterStudentInput[],
  classrooms: ClassroomInput[],
  calls: RosterCallInput[],
  query = '',
): RosterGroup[] {
  const activeIds = activeCallStudentIds(calls)
  const knownClassroom = new Set(classrooms.map(c => c.id))

  // 先分桶：班級 id 為已知班級，另有 'unknown'（查不到班級）/ 'unassigned'（沒有班級）
  const buckets = new Map<number | 'unknown' | 'unassigned', RosterStudent[]>()
  for (const s of students) {
    if (!matchStudent(s.name, query)) continue
    const key =
      s.classroom_id == null
        ? 'unassigned'
        : knownClassroom.has(s.classroom_id)
          ? s.classroom_id
          : 'unknown'
    const entry: RosterStudent = {
      id: s.id,
      name: s.name,
      classroomId: s.classroom_id ?? null,
      notifying: activeIds.has(s.id),
    }
    const list = buckets.get(key)
    if (list) list.push(entry)
    else buckets.set(key, [entry])
  }

  const result: RosterGroup[] = []
  // 已知班級依給定順序輸出（空班自動略過——buckets 沒有該 key）
  for (const c of classrooms) {
    const list = buckets.get(c.id)
    if (list && list.length) {
      result.push({
        classroomId: c.id,
        classroomName: c.name,
        kind: 'classroom',
        students: list.sort(byName),
      })
    }
  }
  // 查不到班級 → 其他班級（仍可發起通知）
  const unknown = buckets.get('unknown')
  if (unknown && unknown.length) {
    result.push({
      classroomId: null,
      classroomName: UNKNOWN_NAME,
      kind: 'unknown',
      students: unknown.sort(byName),
    })
  }
  // 未分班殿後（無 classroom_id，發不出通知）
  const unassigned = buckets.get('unassigned')
  if (unassigned && unassigned.length) {
    result.push({
      classroomId: null,
      classroomName: UNASSIGNED_NAME,
      kind: 'unassigned',
      students: unassigned.sort(byName),
    })
  }
  return result
}

/**
 * 產生班級篩選選項：只列出「實際有在籍學生」的班級，依 classrooms 給定順序。
 *
 * 班級清單改抓跨學期後會含歷年班級，全部倒進下拉沒有意義；同名班（不同學年同班名）
 * 的標籤由 labelClassroomsByTerm 統一處理。
 */
export function classroomOptionsForStudents(
  students: RosterStudentInput[],
  classrooms: ClassroomInput[],
): ClassroomOption[] {
  const used = new Set<number>()
  for (const s of students) {
    if (s.classroom_id != null) used.add(s.classroom_id)
  }
  return labelClassroomsByTerm(classrooms.filter(c => used.has(c.id)))
}
