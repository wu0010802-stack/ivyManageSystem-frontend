// 新學年預編班工作台共用的純函式（無狀態、可單元測試）。
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import { formatTeacherOptionLabel, type TeacherOptionLike } from '@/utils/teacherOption'
import { pad2 } from '@/utils/format'

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

// ── 老師下拉分組 ──

/**
 * 判斷「帶班老師」的職稱關鍵字（員工職稱是自由文字，例：班導、副班導、美語教師、
 * 幼兒園教師、教保員、藝術）。其餘（主任、組長、行政、司機、廚房、護理…）歸「其他職務」。
 * 新增帶班職稱時改這裡。
 */
export const CLASS_TEACHER_POSITION_KEYWORDS = ['班導', '導師', '教師', '老師', '教保員', '美語', '藝術'] as const

export function isClassTeacherPosition(position: string | null | undefined): boolean {
  if (!position) return false
  return CLASS_TEACHER_POSITION_KEYWORDS.some(keyword => position.includes(keyword))
}

export interface TeacherOptionGroup {
  label: string
  options: TeacherCellOption[]
}

const CURRENT_NAME_BY_ROLE = {
  head: 'head_teacher_name',
  assistant: 'assistant_teacher_name',
  art: 'art_teacher_name',
} as const

/**
 * 老師格下拉的分組：
 * 1. 「目前指派」：現值老師已停用（不在可選名單）時補一個 disabled「○○（已停用）」，
 *    否則下拉會把現值顯示成原始 id；
 * 2. 「原班老師」：與原班同職務的老師（依姓名比對），標「原班」放最前；
 * 3. 「帶班老師」／「其他職務」：依職稱關鍵字（CLASS_TEACHER_POSITION_KEYWORDS）。
 * 停用與占用註記沿用 buildTeacherOptions；空組不出現。
 */
export function buildTeacherOptionGroups(
  teachers: TeacherOptionLike[],
  classes: PlanClass[],
  classId: number,
  role: TeacherRole,
): TeacherOptionGroup[] {
  const cls = classes.find(c => c.id === classId)
  const options = buildTeacherOptions(teachers, classes, classId, role)
  const sourceName = cls ? sourceTeacherName(cls, role) : null
  const positionById = new Map(teachers.map(t => [t.id, t.position ?? null]))
  const nameById = new Map(teachers.map(t => [t.id, t.name]))

  const groups: TeacherOptionGroup[] = []
  const currentId = cls ? cls[TEACHER_FIELD_BY_ROLE[role]] ?? null : null
  if (currentId != null && !nameById.has(currentId)) {
    const currentName = cls?.[CURRENT_NAME_BY_ROLE[role]] ?? `#${currentId}`
    groups.push({ label: '目前指派', options: [{ id: currentId, label: `${currentName}（已停用）`, disabled: true, note: '' }] })
  }

  const source: TeacherCellOption[] = []
  const teaching: TeacherCellOption[] = []
  const others: TeacherCellOption[] = []
  for (const opt of options) {
    if (sourceName && nameById.get(opt.id) === sourceName) {
      source.push({ ...opt, note: ['原班', opt.note].filter(Boolean).join('・') })
    } else if (isClassTeacherPosition(positionById.get(opt.id))) {
      teaching.push(opt)
    } else {
      others.push(opt)
    }
  }
  if (source.length) groups.push({ label: '原班老師', options: source })
  if (teaching.length) groups.push({ label: '帶班老師', options: teaching })
  if (others.length) groups.push({ label: '其他職務', options: others })
  return groups
}

/**
 * 老師名單載入失敗時的退路：只放目前指派的老師（用班級上的姓名），下拉輸入框才不會把
 * 現值顯示成原始 id。不標「已停用」（名單沒載到，不代表他停用了）。
 */
export function currentTeacherOnlyGroups(
  classes: PlanClass[],
  classId: number,
  role: TeacherRole,
): TeacherOptionGroup[] {
  const cls = classes.find(c => c.id === classId)
  const currentId = cls ? cls[TEACHER_FIELD_BY_ROLE[role]] ?? null : null
  if (cls == null || currentId == null) return []
  const name = cls[CURRENT_NAME_BY_ROLE[role]] ?? '目前指派的老師'
  return [{ label: '目前指派', options: [{ id: currentId, label: name, disabled: false, note: '' }] }]
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
    // 已離園：後端 assigned_count 不算、套用時也會略過，拆分數字要跟總數同口徑
    if (s.plan_class_id == null || s.is_active_now === false) continue
    const cls = classById.get(s.plan_class_id)
    if (!cls) continue
    if (s.disposition === 'retain') retained += 1
    else if (s.disposition === 'promote' && isMovedIn(s, cls)) moved += 1
  }
  return { moved, retained }
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

// ── 狀態感知（FE-C）：日期、畢業日風險、準備期、套用結果 ──

function isoToUtc(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' 加減天數（純日曆日運算：以 UTC 午夜為錨，不受瀏覽器時區影響）。 */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(isoToUtc(date) + days * DAY_MS)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** to − from 的天數（'YYYY-MM-DD'）；to 在 from 之前為負數。 */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS)
}

/** 日期時間字串 → 'MM/DD'（「已於 06/20 發布」用）；空值回空字串。 */
export function formatMonthDay(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}` : value
}

/**
 * 自動畢業從畢業日當天起、往後補跑幾天（對齊後端
 * `services/graduation_scheduler.CATCHUP_GRACE_DAYS`）：這段期間排程每一輪都可能
 * 把「沒有被已發布計畫豁免」的畢業年級在籍生畢業。
 */
export const GRADUATION_CATCHUP_DAYS = 7

export type RetainRiskPhase = 'before' | 'catchup' | 'after'

/**
 * 畢業年級留級生的風險階段：before＝畢業日前（撤回／沒發布，畢業日一到就會被畢業）；
 * catchup＝畢業日到補跑最後一天（隨時可能被畢業）；after＝補跑期已過（不會再自動畢業）。
 * 沒有畢業日回 null。
 */
export function retainRiskPhase(today: string, graduationDate: string | null | undefined): RetainRiskPhase | null {
  if (!graduationDate) return null
  if (today < graduationDate) return 'before'
  if (today <= addDaysISO(graduationDate, GRADUATION_CATCHUP_DAYS)) return 'catchup'
  return 'after'
}

/** 準備期＝準備起始日（含）到套用日（不含）；排程只在這段期間自動產生草稿。 */
export function isWithinPrepPeriod(today: string, prepStartDate: string, applyDate: string): boolean {
  return prepStartDate <= today && today < applyDate
}

/** 畢業年級名稱：取標為畢業的學生現況年級（最多人的那個）；判斷不出來回 null。 */
export function graduationGradeName(students: PlanStudent[]): string | null {
  const counts = new Map<string, number>()
  for (const s of students) {
    if (s.disposition !== 'graduate' || !s.current_grade_name) continue
    counts.set(s.current_grade_name, (counts.get(s.current_grade_name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

type AppliedSummary = Schema<'PlanAppliedSummaryOut'>
type AppliedStudent = Schema<'PlanAppliedStudentOut'>

/**
 * 套用結果的名單：「仍在去年班」扣掉「排除」的人（排除的學生本來就會留在原班，
 * 後端兩份名單會重疊）。兩份分開列、不可相加。
 */
export function appliedResultLists(summary: AppliedSummary): {
  leftBehind: AppliedStudent[]
  excluded: AppliedStudent[]
  skippedInactive: AppliedStudent[]
  capacityOverflow: Schema<'PlanAppliedOverflowClassOut'>[]
} {
  const excluded = summary.excluded_still_active_students ?? []
  const excludedIds = new Set(excluded.map(s => s.id))
  return {
    leftBehind: (summary.left_behind ?? []).filter(s => !excludedIds.has(s.id)),
    excluded,
    skippedInactive: summary.skipped_inactive ?? [],
    capacityOverflow: summary.capacity_overflow ?? [],
  }
}
