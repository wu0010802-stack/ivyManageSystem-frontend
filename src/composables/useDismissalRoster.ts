/**
 * 接送通知「點名單」共用邏輯（管理端看板一鍵發起用）。
 *
 * 把在籍學生依班級分組成可一鍵發起的點名單，並依「進行中通知」標記哪些學生
 * 已在通知中（從源頭避免重複建立 / 後端 409）。純函式部分（集合 / 比對 / 分組）
 * 可單獨測試，元件只負責渲染與互動（搜尋字串、建立中 inFlight）。
 */

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

export interface ClassroomInput {
  id: number
  name: string
}

export interface RosterStudent {
  id: number
  name: string
  /** 原始班級 id（供發起 POST）；無班級為 null。 */
  classroomId: number | null
  /** 已有進行中（pending/acknowledged）通知 → 點名單上灰底停用。 */
  notifying: boolean
}

export interface RosterGroup {
  classroomId: number | null
  classroomName: string
  students: RosterStudent[]
}

/** 視為「進行中」的通知狀態（佔用學生、不可重複建立）。 */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['pending', 'acknowledged'])

const UNASSIGNED_NAME = '未分班'

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
 * - 無班級 / 班級不存在的學生歸入「未分班」並殿後。
 */
export function buildRoster(
  students: RosterStudentInput[],
  classrooms: ClassroomInput[],
  calls: RosterCallInput[],
  query = '',
): RosterGroup[] {
  const activeIds = activeCallStudentIds(calls)
  const knownClassroom = new Set(classrooms.map(c => c.id))

  // 先依班級 id 分桶（null key 代表未分班）
  const buckets = new Map<number | null, RosterStudent[]>()
  for (const s of students) {
    if (!matchStudent(s.name, query)) continue
    const key =
      s.classroom_id != null && knownClassroom.has(s.classroom_id) ? s.classroom_id : null
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
        students: list.sort(byName),
      })
    }
  }
  // 未分班殿後
  const unassigned = buckets.get(null)
  if (unassigned && unassigned.length) {
    result.push({
      classroomId: null,
      classroomName: UNASSIGNED_NAME,
      students: unassigned.sort(byName),
    })
  }
  return result
}
