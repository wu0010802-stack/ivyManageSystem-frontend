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
