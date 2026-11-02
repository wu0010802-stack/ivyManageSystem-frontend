// 新學年預編班工作台共用的純函式（無狀態、可單元測試）。
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import { formatTeacherOptionLabel, type TeacherOptionLike } from '@/utils/teacherOption'

type PlanClass = Schema<'PlanClassOut'>

/** 後端 date 字串 'YYYY-MM-DD' → 'YYYY/MM/DD'；空值回空字串、非預期格式原樣回傳。 */
export function formatPlanDate(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}

// ── 草稿班三師 ──

export type TeacherRole = 'head' | 'assistant' | 'art'

export const TEACHER_FIELD_BY_ROLE = {
  head: 'head_teacher_id',
  assistant: 'assistant_teacher_id',
  art: 'art_teacher_id',
} as const

export type TeacherField = (typeof TEACHER_FIELD_BY_ROLE)[TeacherRole]

export const TEACHER_ROLE_LABELS: Record<TeacherRole, string> = {
  head: '班導',
  assistant: '副班導',
  art: '美語老師',
}

const SOURCE_NAME_BY_ROLE = {
  head: 'source_head_teacher_name',
  assistant: 'source_assistant_teacher_name',
  art: 'source_art_teacher_name',
} as const

export const TEACHER_ROLES: TeacherRole[] = ['head', 'assistant', 'art']

export interface TeacherCellOption {
  id: number
  label: string
  disabled: boolean
  /** 目前在草稿裡的其他職務（例：「玫瑰班導」「也帶百合」），空字串＝沒有 */
  note: string
}

/**
 * 某班某職務的老師下拉選項。班導／副班導同一人只能帶一班（後端 teacher_duplicate
 * 會擋發布），已在他班或本班另一職務擔任者停用並註明；美語老師可跨班，只註明
 * 也帶哪些班。該格目前已選的老師一律保持可選，避免下拉把現值顯示成空白。
 */
export function buildTeacherOptions(
  teachers: TeacherOptionLike[],
  classes: PlanClass[],
  classId: number,
  role: TeacherRole,
): TeacherCellOption[] {
  const current = classes.find(c => c.id === classId)
  const currentId = current ? current[TEACHER_FIELD_BY_ROLE[role]] ?? null : null
  return teachers.map((teacher) => {
    const notes: string[] = []
    if (role === 'art') {
      const others = classes
        .filter(c => c.id !== classId && c.art_teacher_id === teacher.id)
        .map(c => c.target_name)
      if (others.length) notes.push(`也帶${others.join('、')}`)
    } else {
      const otherRole: TeacherRole = role === 'head' ? 'assistant' : 'head'
      for (const c of classes) {
        if (c.id === classId) {
          if (c[TEACHER_FIELD_BY_ROLE[otherRole]] === teacher.id) {
            notes.push(`本班${TEACHER_ROLE_LABELS[otherRole]}`)
          }
          continue
        }
        if (c.head_teacher_id === teacher.id) notes.push(`${c.target_name}班導`)
        if (c.assistant_teacher_id === teacher.id) notes.push(`${c.target_name}副班導`)
      }
    }
    return {
      id: teacher.id,
      label: formatTeacherOptionLabel(teacher),
      disabled: role !== 'art' && notes.length > 0 && teacher.id !== currentId,
      note: notes.join('、'),
    }
  })
}

/** 原班老師可沿用的空格數（實際能填多少以後端回傳為準：停用或衝突的會被略過）。 */
export function countCarryOverSlots(classes: PlanClass[]): number {
  let count = 0
  for (const c of classes) {
    for (const role of TEACHER_ROLES) {
      if (c[TEACHER_FIELD_BY_ROLE[role]] == null && c[SOURCE_NAME_BY_ROLE[role]]) count += 1
    }
  }
  return count
}

/** 某班某職務的原班老師姓名（手動新增的班為 null）。 */
export function sourceTeacherName(cls: PlanClass, role: TeacherRole): string | null {
  return cls[SOURCE_NAME_BY_ROLE[role]] ?? null
}

// ── 學生分派 ──

type PlanStudent = Schema<'PlanStudentOut'>

/** 學生是從別班換進這個草稿班（原班 ≠ 草稿班的原班）；手動新增的班沒有原班，一律算。 */
export function isMovedIn(student: PlanStudent, cls: PlanClass): boolean {
  return !!student.source_classroom_name && student.source_classroom_name !== cls.source_name
}

/**
 * 已分班學生中「換到別班」與「留級」的人數（發布摘要用）。留級生一定落在別的班，
 * 另計不重複算進換班；未分班、畢業、排除都不算。
 */
export function countPlanMoves(
  students: PlanStudent[],
  classes: PlanClass[],
): { moved: number; retained: number } {
  const classById = new Map(classes.map(c => [c.id, c]))
  let moved = 0
  let retained = 0
  for (const s of students) {
    if (s.plan_class_id == null) continue
    const cls = classById.get(s.plan_class_id)
    if (!cls) continue
    if (s.disposition === 'retain') retained += 1
    else if (s.disposition === 'promote' && isMovedIn(s, cls)) moved += 1
  }
  return { moved, retained }
}

/**
 * 留在畢業年級的留級生人數：這些人只有在計畫「已發布」時才會被畢業排程豁免，
 * 撤回發布後若沒在畢業日前重新發布，會被自動畢業。畢業年級以「有學生標為畢業」
 * 的現況年級判斷（前端沒有年級的畢業屬性）；判斷不出來時回 0。
 */
export function countRetainAtGraduationRisk(students: PlanStudent[]): number {
  const graduationGrades = new Set(
    students
      .filter(s => s.disposition === 'graduate' && s.current_grade_name)
      .map(s => s.current_grade_name as string),
  )
  if (graduationGrades.size === 0) return 0
  return students.filter(
    s => s.disposition === 'retain' && !!s.current_grade_name && graduationGrades.has(s.current_grade_name),
  ).length
}

export interface AssignGroup {
  gradeName: string
  options: Array<{ id: number; label: string }>
}

/**
 * 待分班學生「分到…」下拉的選項：依年級分組。
 * - 留級生只能分到現在年級的班（後端 retain 年級不符回 422）。
 * - 一般升班：原班升上去的年級（草稿班原班＝學生原班）排第一，其餘照草稿班順序。
 */
export function buildAssignGroups(student: PlanStudent, classes: PlanClass[]): AssignGroup[] {
  const candidates = student.disposition === 'retain'
    ? classes.filter(c => !!student.current_grade_name && c.grade_name === student.current_grade_name)
    : classes
  const groups: AssignGroup[] = []
  for (const c of candidates) {
    const gradeName = c.grade_name || '未分年級'
    let group = groups.find(g => g.gradeName === gradeName)
    if (!group) {
      group = { gradeName, options: [] }
      groups.push(group)
    }
    group.options.push({ id: c.id, label: c.target_name })
  }
  const expected = classes.find(
    c => !!student.source_classroom_name && c.source_name === student.source_classroom_name,
  )?.grade_name
  if (expected) {
    const idx = groups.findIndex(g => g.gradeName === expected)
    if (idx > 0) groups.unshift(...groups.splice(idx, 1))
  }
  return groups
}

// ── 編班表顯示順序、搜尋與篩選 ──

export interface GradeGroup {
  gradeId: number
  gradeName: string
  classes: PlanClass[]
}

/** 依 target_grade_id 首次出現順序分組（容忍後端非嚴格連續排序）；表格欄序以此為準。 */
export function groupClassesByGrade(classes: PlanClass[]): GradeGroup[] {
  const order: number[] = []
  const map = new Map<number, PlanClass[]>()
  for (const c of classes) {
    if (!map.has(c.target_grade_id)) {
      map.set(c.target_grade_id, [])
      order.push(c.target_grade_id)
    }
    map.get(c.target_grade_id)!.push(c)
  }
  return order.map(gid => ({
    gradeId: gid,
    gradeName: map.get(gid)![0].grade_name ?? '未分年級',
    classes: map.get(gid)!,
  }))
}

export interface RosterEntry {
  student: PlanStudent
  cls: PlanClass
}

/** 編班表裡的學生（已分班的升班／留級），依表格欄序、同班依名單順序。搜尋的「下一位」照這個順序走。 */
export function orderedRosterEntries(students: PlanStudent[], classes: PlanClass[]): RosterEntry[] {
  const byClass = new Map<number, PlanStudent[]>()
  for (const s of students) {
    if ((s.disposition !== 'promote' && s.disposition !== 'retain') || s.plan_class_id == null) continue
    if (!byClass.has(s.plan_class_id)) byClass.set(s.plan_class_id, [])
    byClass.get(s.plan_class_id)!.push(s)
  }
  const entries: RosterEntry[] = []
  for (const group of groupClassesByGrade(classes)) {
    for (const cls of group.classes) {
      for (const student of byClass.get(cls.id) ?? []) entries.push({ student, cls })
    }
  }
  return entries
}

/** 編班表篩選 chip：換班（一般升班從別班換來）／留級／手動調整過。 */
export type RosterChip = 'moved' | 'retain' | 'manual'

function matchesChip(entry: RosterEntry, chip: RosterChip): boolean {
  const { student, cls } = entry
  if (chip === 'retain') return student.disposition === 'retain'
  if (chip === 'manual') return student.manually_adjusted
  return student.disposition === 'promote' && isMovedIn(student, cls)
}

/**
 * 搜尋（姓名部分比對、學號不分大小寫）＋篩選 chip（聯集），兩者同時有時都要符合。
 * 回傳符合者的 id（依表格順序）；沒有任何條件時回 null＝不高亮也不淡化。
 */
export function filterRosterMatches(
  entries: RosterEntry[],
  query: string,
  chips: ReadonlySet<RosterChip>,
): number[] | null {
  const q = query.trim().toLowerCase()
  if (!q && chips.size === 0) return null
  return entries
    .filter((entry) => {
      const { student } = entry
      if (q) {
        const hit = student.name.toLowerCase().includes(q)
          || (student.student_id ?? '').toLowerCase().includes(q)
        if (!hit) return false
      }
      if (chips.size > 0 && ![...chips].some(chip => matchesChip(entry, chip))) return false
      return true
    })
    .map(entry => entry.student.id)
}

// ── 搬班復原 ──

export interface UndoGroup {
  op: BulkOp
  planClassId: number | null
  studentIds: number[]
  excludeReason: string | null
}

/**
 * 依搬動前的學生快照，組出把他們放回原處的批次操作：
 * - 原本在某班：依原班＋是否留級分組，送 assign／retain 回原班；
 * - 原本畢業／排除：送 graduate／exclude（排除依原因分組）；
 * - 原本待分班：後端沒有「放回待分班」的操作，不提供復原，只計數讓文案說明。
 * 復原後這些學生會被標為手動調整過（後端行為）。
 */
export function buildUndoGroups(before: PlanStudent[]): {
  groups: UndoGroup[]
  restorableIds: number[]
  unassignedCount: number
} {
  const groups: UndoGroup[] = []
  const byKey = new Map<string, UndoGroup>()
  const restorableIds: number[] = []
  let unassignedCount = 0
  const push = (key: string, make: () => UndoGroup, studentId: number): void => {
    let group = byKey.get(key)
    if (!group) {
      group = make()
      byKey.set(key, group)
      groups.push(group)
    }
    group.studentIds.push(studentId)
    restorableIds.push(studentId)
  }
  for (const s of before) {
    if (s.disposition === 'graduate') {
      push('graduate', () => ({ op: 'graduate', planClassId: null, studentIds: [], excludeReason: null }), s.id)
    } else if (s.disposition === 'exclude') {
      const reason = s.exclude_reason ?? null
      push(`exclude:${reason ?? ''}`, () => ({ op: 'exclude', planClassId: null, studentIds: [], excludeReason: reason }), s.id)
    } else if (s.plan_class_id != null) {
      const op: BulkOp = s.disposition === 'retain' ? 'retain' : 'assign'
      const classId = s.plan_class_id
      push(`${op}:${classId}`, () => ({ op, planClassId: classId, studentIds: [], excludeReason: null }), s.id)
    } else {
      unassignedCount += 1
    }
  }
  return { groups, restorableIds, unassignedCount }
}

/** 編班表檢視：學生名單（班名、人數＋學生列）／老師指派（班名、人數＋三列老師）。 */
export type RosterViewMode = 'students' | 'teachers'
