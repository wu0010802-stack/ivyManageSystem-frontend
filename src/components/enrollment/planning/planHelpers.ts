// 新學年預編班工作台共用的純函式（無狀態、可單元測試）。
import type { Schema } from '@/api/_generated/typed'
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
