import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  appliedResultLists,
  buildAssignGroups,
  buildTeacherOptionGroups,
  buildTeacherOptions,
  buildUndoGroups,
  countCarryOverSlots,
  countPlanMoves,
  currentTeacherOnlyGroups,
  daysBetweenISO,
  filterRosterMatches,
  formatMonthDay,
  formatPlanDate,
  graduationGradeName,
  groupClassesByGrade,
  isClassTeacherPosition,
  isMovedIn,
  isWithinPrepPeriod,
  orderedRosterEntries,
  retainRiskPhase,
  TEACHER_FIELD_BY_ROLE,
} from '../planHelpers'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>
type PlanStudent = Schema<'PlanStudentOut'>

function stu(overrides: Partial<PlanStudent>): PlanStudent {
  return {
    id: 1, student_id: 'S001', name: '小明', source_classroom_name: '向日葵', plan_class_id: null,
    disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '小班',
    ...overrides,
  }
}

function cls(overrides: Partial<PlanClass>): PlanClass {
  return {
    id: 1, source_name: null, target_name: '玫瑰', target_grade_id: 1, grade_name: '大班',
    capacity: 30, class_code: null, head_teacher_id: null, head_teacher_name: null,
    assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
    source_head_teacher_name: null, source_assistant_teacher_name: null, source_art_teacher_name: null,
    assigned_count: 0,
    ...overrides,
  }
}

const teachers = [
  { id: 100, name: '林佳蓉' },
  { id: 101, name: '陳怡君' },
  { id: 102, name: '黃雅婷', employee_id: 'T9', position: '美語老師' },
]

describe('formatPlanDate', () => {
  it('YYYY-MM-DD → YYYY/MM/DD，空值回空字串', () => {
    expect(formatPlanDate('2027-08-01')).toBe('2027/08/01')
    expect(formatPlanDate(null)).toBe('')
    expect(formatPlanDate('not-a-date')).toBe('not-a-date')
  })
})

describe('TEACHER_FIELD_BY_ROLE', () => {
  it('角色對應後端欄位', () => {
    expect(TEACHER_FIELD_BY_ROLE).toEqual({
      head: 'head_teacher_id', assistant: 'assistant_teacher_id', art: 'art_teacher_id',
    })
  })
})

describe('buildTeacherOptions', () => {
  const classes = [
    cls({ id: 1, target_name: '玫瑰', head_teacher_id: 100, art_teacher_id: 102 }),
    cls({ id: 2, target_name: '百合', assistant_teacher_id: 101 }),
  ]

  it('班導／副班導：已在他班擔任班導或副班導者停用並註明班名', () => {
    const options = buildTeacherOptions(teachers, classes, 2, 'head')
    const byId = Object.fromEntries(options.map(o => [o.id, o]))
    expect(byId[100]).toMatchObject({ disabled: true, note: '玫瑰班導' })
    // 本班自己的副班導不能同時當班導
    expect(byId[101]).toMatchObject({ disabled: true, note: '本班副班導' })
    expect(byId[102]).toMatchObject({ disabled: false })
  })

  it('目前已選的老師即使被別處占用也保持可選（避免顯示成空白）', () => {
    const options = buildTeacherOptions(teachers, classes, 1, 'head')
    expect(options.find(o => o.id === 100)).toMatchObject({ disabled: false })
  })

  it('美語老師可跨班：只註明也帶哪些班、不停用', () => {
    const options = buildTeacherOptions(teachers, classes, 2, 'art')
    expect(options.find(o => o.id === 102)).toMatchObject({ disabled: false, note: '也帶玫瑰' })
  })

  it('label 用 formatTeacherOptionLabel（同名可辨識）', () => {
    const options = buildTeacherOptions(teachers, classes, 2, 'art')
    expect(options.find(o => o.id === 102)!.label).toBe('黃雅婷（T9·美語老師）')
  })
})

describe('countCarryOverSlots', () => {
  it('只算「目前空著且原班有老師」的格子', () => {
    const classes = [
      cls({ id: 1, head_teacher_id: 100, source_head_teacher_name: '林佳蓉', source_assistant_teacher_name: '陳怡君' }),
      cls({ id: 2, source_art_teacher_name: '黃雅婷' }),
    ]
    expect(countCarryOverSlots(classes)).toBe(2)
  })
})

describe('isMovedIn', () => {
  it('來源班與草稿班的原班不同才算換班；手動新增的班（無原班）一律算', () => {
    const rose = cls({ id: 1, source_name: '向日葵' })
    expect(isMovedIn(stu({ source_classroom_name: '向日葵' }), rose)).toBe(false)
    expect(isMovedIn(stu({ source_classroom_name: '牡丹' }), rose)).toBe(true)
    expect(isMovedIn(stu({ source_classroom_name: null }), rose)).toBe(false)
    expect(isMovedIn(stu({ source_classroom_name: '向日葵' }), cls({ id: 2, source_name: null }))).toBe(true)
  })
})

describe('countPlanMoves', () => {
  it('換班只算一般升班；留級另計；未分班、畢業、排除都不算', () => {
    const classes = [cls({ id: 1, source_name: '向日葵', grade_name: '中班' }), cls({ id: 2, source_name: '牡丹', grade_name: '中班' })]
    const students = [
      stu({ id: 1, source_classroom_name: '向日葵', plan_class_id: 1 }),
      stu({ id: 2, source_classroom_name: '向日葵', plan_class_id: 2 }),
      stu({ id: 3, source_classroom_name: '牡丹', plan_class_id: 1, disposition: 'retain', current_grade_name: '中班' }),
      stu({ id: 4, source_classroom_name: '牡丹', plan_class_id: null }),
      stu({ id: 5, source_classroom_name: '天堂鳥', disposition: 'graduate' }),
      stu({ id: 6, source_classroom_name: '天堂鳥', disposition: 'exclude' }),
    ]
    expect(countPlanMoves(students, classes)).toEqual({ moved: 1, retained: 1 })
  })
})

describe('buildAssignGroups', () => {
  const classes = [
    cls({ id: 1, target_name: '玫瑰', grade_name: '大班', source_name: '向日葵' }),
    cls({ id: 2, target_name: '百合', grade_name: '中班', source_name: '牡丹' }),
    cls({ id: 3, target_name: '櫻花', grade_name: '中班', source_name: '滿天星' }),
  ]

  it('一般升班：依年級分組，原班升上去的年級排第一', () => {
    const groups = buildAssignGroups(stu({ source_classroom_name: '牡丹' }), classes)
    expect(groups.map(g => g.gradeName)).toEqual(['中班', '大班'])
    expect(groups[0].options.map(o => o.id)).toEqual([2, 3])
  })

  it('原班找不到對應草稿班時照草稿班順序', () => {
    const groups = buildAssignGroups(stu({ source_classroom_name: '不存在' }), classes)
    expect(groups.map(g => g.gradeName)).toEqual(['大班', '中班'])
  })

  it('留級生只能分到現在年級的班', () => {
    const groups = buildAssignGroups(stu({ disposition: 'retain', current_grade_name: '中班' }), classes)
    expect(groups).toEqual([{ gradeName: '中班', options: [{ id: 2, label: '百合' }, { id: 3, label: '櫻花' }] }])
  })
})

describe('groupClassesByGrade', () => {
  it('依年級首次出現順序分組（容忍後端非連續排序）', () => {
    const groups = groupClassesByGrade([
      cls({ id: 1, target_grade_id: 3, grade_name: '大班' }),
      cls({ id: 2, target_grade_id: 2, grade_name: '中班' }),
      cls({ id: 3, target_grade_id: 3, grade_name: '大班' }),
      cls({ id: 4, target_grade_id: 9, grade_name: null }),
    ])
    expect(groups.map(g => [g.gradeName, g.classes.map(c => c.id)])).toEqual([
      ['大班', [1, 3]], ['中班', [2]], ['未分年級', [4]],
    ])
  })
})

describe('orderedRosterEntries', () => {
  it('只取表格裡的學生（已分班的升班／留級），依表格欄序再依名單順序', () => {
    const classes = [
      cls({ id: 1, target_grade_id: 3, grade_name: '大班' }),
      cls({ id: 2, target_grade_id: 2, grade_name: '中班' }),
      cls({ id: 3, target_grade_id: 3, grade_name: '大班' }),
    ]
    const students = [
      stu({ id: 10, plan_class_id: 2 }),
      stu({ id: 11, plan_class_id: 3 }),
      stu({ id: 12, plan_class_id: 1, disposition: 'retain' }),
      stu({ id: 13, plan_class_id: null }),
      stu({ id: 14, disposition: 'graduate' }),
      stu({ id: 15, plan_class_id: 1 }),
    ]
    expect(orderedRosterEntries(students, classes).map(e => e.student.id)).toEqual([12, 15, 11, 10])
    expect(orderedRosterEntries(students, classes)[0].cls.id).toBe(1)
  })
})

describe('filterRosterMatches', () => {
  const rose = cls({ id: 1, source_name: '向日葵' })
  const entries = [
    { student: stu({ id: 1, name: '張宸瑋', student_id: 'S101', source_classroom_name: '向日葵' }), cls: rose },
    { student: stu({ id: 2, name: '張宸瑋', student_id: 'S102', source_classroom_name: '牡丹', manually_adjusted: true }), cls: rose },
    { student: stu({ id: 3, name: '李子晴', student_id: 'S103', source_classroom_name: '向日葵', disposition: 'retain' }), cls: rose },
    { student: stu({ id: 4, name: '王可昕', student_id: null, source_classroom_name: '向日葵' }), cls: rose },
  ]

  it('沒有搜尋也沒有篩選時回 null（不高亮、不淡化）', () => {
    expect(filterRosterMatches(entries, '  ', new Set())).toBeNull()
  })

  it('姓名部分比對：同名學生都算', () => {
    expect(filterRosterMatches(entries, '宸瑋', new Set())).toEqual([1, 2])
  })

  it('學號比對不分大小寫', () => {
    expect(filterRosterMatches(entries, 's103', new Set())).toEqual([3])
  })

  it('篩選 chip：換班只算一般升班從別班換來的；多個 chip 取聯集', () => {
    expect(filterRosterMatches(entries, '', new Set(['moved']))).toEqual([2])
    expect(filterRosterMatches(entries, '', new Set(['retain']))).toEqual([3])
    expect(filterRosterMatches(entries, '', new Set(['manual']))).toEqual([2])
    expect(filterRosterMatches(entries, '', new Set(['retain', 'manual']))).toEqual([2, 3])
  })

  it('搜尋與篩選同時有：兩者都要符合', () => {
    expect(filterRosterMatches(entries, '張', new Set(['manual']))).toEqual([2])
  })
})

describe('buildUndoGroups', () => {
  it('原本有班的依原班與留級與否分組；畢業、排除還原原處置；原本待分班不提供復原', () => {
    const result = buildUndoGroups([
      stu({ id: 1, plan_class_id: 10 }),
      stu({ id: 2, plan_class_id: 10 }),
      stu({ id: 3, plan_class_id: 10, disposition: 'retain' }),
      stu({ id: 4, plan_class_id: 11 }),
      stu({ id: 5, disposition: 'graduate' }),
      stu({ id: 6, disposition: 'exclude', exclude_reason: '轉學' }),
      stu({ id: 7, plan_class_id: null }),
    ])
    expect(result.groups).toEqual([
      { op: 'assign', planClassId: 10, studentIds: [1, 2], excludeReason: null },
      { op: 'retain', planClassId: 10, studentIds: [3], excludeReason: null },
      { op: 'assign', planClassId: 11, studentIds: [4], excludeReason: null },
      { op: 'graduate', planClassId: null, studentIds: [5], excludeReason: null },
      { op: 'exclude', planClassId: null, studentIds: [6], excludeReason: '轉學' },
    ])
    expect(result.restorableIds).toEqual([1, 2, 3, 4, 5, 6])
    expect(result.unassignedCount).toBe(1)
  })
})

describe('日期工具', () => {
  it('addDaysISO／daysBetweenISO 以日曆日計算（跨月、不受時區影響）', () => {
    expect(addDaysISO('2027-07-31', 7)).toBe('2027-08-07')
    expect(addDaysISO('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetweenISO('2027-07-17', '2027-07-31')).toBe(14)
    expect(daysBetweenISO('2027-08-02', '2027-07-31')).toBe(-2)
  })

  it('formatMonthDay：日期時間取 MM/DD；空值回空字串', () => {
    expect(formatMonthDay('2027-06-20T09:30:00')).toBe('06/20')
    expect(formatMonthDay(null)).toBe('')
  })
})

describe('retainRiskPhase（對齊後端自動畢業：畢業日起補跑 7 天）', () => {
  it('畢業日前 before；畢業日到第 7 天 catchup；之後 after；沒有畢業日回 null', () => {
    expect(retainRiskPhase('2027-07-30', '2027-07-31')).toBe('before')
    expect(retainRiskPhase('2027-07-31', '2027-07-31')).toBe('catchup')
    expect(retainRiskPhase('2027-08-07', '2027-07-31')).toBe('catchup')
    expect(retainRiskPhase('2027-08-08', '2027-07-31')).toBe('after')
    expect(retainRiskPhase('2027-07-30', null)).toBeNull()
  })
})

describe('isWithinPrepPeriod', () => {
  it('準備期＝準備起始日（含）到套用日（不含）', () => {
    expect(isWithinPrepPeriod('2027-05-31', '2027-06-01', '2027-08-01')).toBe(false)
    expect(isWithinPrepPeriod('2027-06-01', '2027-06-01', '2027-08-01')).toBe(true)
    expect(isWithinPrepPeriod('2027-07-31', '2027-06-01', '2027-08-01')).toBe(true)
    expect(isWithinPrepPeriod('2027-08-01', '2027-06-01', '2027-08-01')).toBe(false)
  })
})

describe('graduationGradeName', () => {
  it('取標為畢業學生的現況年級（最多人那個）；判斷不出來回 null', () => {
    expect(graduationGradeName([
      stu({ id: 1, disposition: 'graduate', current_grade_name: '大班' }),
      stu({ id: 2, disposition: 'graduate', current_grade_name: '大班' }),
      stu({ id: 3, disposition: 'graduate', current_grade_name: '中班' }),
      stu({ id: 4, disposition: 'promote', current_grade_name: '小班' }),
    ])).toBe('大班')
    expect(graduationGradeName([stu({ disposition: 'promote' })])).toBeNull()
  })
})

describe('appliedResultLists', () => {
  it('仍在去年班的名單扣掉「排除」的人（同一人只出現一次、兩份名單不相加）', () => {
    const result = appliedResultLists({
      created_classrooms: 2, reused_classrooms: 6, moved_students: 120, graduated: 36, excluded_still_active: 1,
      left_behind: [
        { id: 1, name: '甲', classroom_name: '向日葵' },
        { id: 2, name: '乙', classroom_name: '牡丹' },
      ],
      excluded_still_active_students: [{ id: 2, name: '乙', classroom_name: '牡丹' }],
      skipped_inactive: [{ id: 3, name: '丙', classroom_name: null }],
      capacity_overflow: [],
    })
    expect(result.leftBehind.map(s => s.id)).toEqual([1])
    expect(result.excluded.map(s => s.id)).toEqual([2])
    expect(result.skippedInactive.map(s => s.id)).toEqual([3])
  })

  it('名單欄位缺省時回空陣列', () => {
    const result = appliedResultLists({
      created_classrooms: 0, reused_classrooms: 0, moved_students: 0, graduated: 0, excluded_still_active: 0,
    })
    expect(result).toEqual({ leftBehind: [], excluded: [], skippedInactive: [], capacityOverflow: [] })
  })
})

describe('isClassTeacherPosition（老師下拉分組用）', () => {
  it('班導、副班導、教師、教保員、美語、藝術類職稱算帶班老師；其他職務與空值不算', () => {
    for (const p of ['班導', '副班導', '美語教師', '幼兒園教師', '教保員', '助理教保員', '藝術', '美語老師']) {
      expect(isClassTeacherPosition(p)).toBe(true)
    }
    for (const p of ['主任', '組長', '司機', '行政', '廚房', '護理人員', '美編', '', null, undefined]) {
      expect(isClassTeacherPosition(p)).toBe(false)
    }
  })
})

describe('buildTeacherOptionGroups', () => {
  const people = [
    { id: 100, name: '林佳蓉', position: '班導' },
    { id: 101, name: '陳怡君', position: '副班導' },
    { id: 102, name: '黃雅婷', position: '美語教師' },
    { id: 103, name: '王主任', position: '主任' },
    { id: 104, name: '張司機', position: null },
  ]

  it('原班老師獨立一組放最前並標「原班」；其餘分帶班老師／其他職務', () => {
    const classes = [cls({ id: 1, target_name: '玫瑰', source_head_teacher_name: '陳怡君' })]
    const groups = buildTeacherOptionGroups(people, classes, 1, 'head')
    expect(groups.map(g => g.label)).toEqual(['原班老師', '帶班老師', '其他職務'])
    expect(groups[0].options.map(o => [o.id, o.note])).toEqual([[101, '原班']])
    expect(groups[1].options.map(o => o.id)).toEqual([100, 102])
    expect(groups[2].options.map(o => o.id)).toEqual([103, 104])
  })

  it('原班老師同時在他班帶班：仍標原班，並保留占用註記與停用狀態', () => {
    const classes = [
      cls({ id: 1, target_name: '玫瑰', source_head_teacher_name: '林佳蓉' }),
      cls({ id: 2, target_name: '百合', head_teacher_id: 100 }),
    ]
    const groups = buildTeacherOptionGroups(people, classes, 1, 'head')
    expect(groups[0].options[0]).toMatchObject({ id: 100, note: '原班・百合班導', disabled: true })
  })

  it('沒有原班老師（手動新增的班）就沒有原班組；空組不出現', () => {
    const groups = buildTeacherOptionGroups(people.slice(0, 2), [cls({ id: 1 })], 1, 'head')
    expect(groups.map(g => g.label)).toEqual(['帶班老師'])
  })

  it('目前指派的老師已停用（不在可選名單）：補一個 disabled「○○（已停用）」放最前，下拉不會顯示原始 id', () => {
    const classes = [cls({ id: 1, head_teacher_id: 57, head_teacher_name: '吳老師' })]
    const groups = buildTeacherOptionGroups(people, classes, 1, 'head')
    expect(groups[0]).toEqual({ label: '目前指派', options: [{ id: 57, label: '吳老師（已停用）', disabled: true, note: '' }] })
  })
})

describe('countPlanMoves 不算已離園學生（後端 assigned_count 只算在籍）', () => {
  it('已離園的換班生與留級生都不算', () => {
    const rose = cls({ id: 1, source_name: '向日葵' })
    const students = [
      stu({ id: 9, plan_class_id: 1, source_classroom_name: '玫瑰', is_active_now: false }),
      stu({ id: 10, plan_class_id: 1, disposition: 'retain', is_active_now: false }),
      stu({ id: 11, plan_class_id: 1, source_classroom_name: '玫瑰' }),
    ]
    expect(countPlanMoves(students, [rose])).toEqual({ moved: 1, retained: 0 })
  })
})

describe('currentTeacherOnlyGroups（老師名單載入失敗時）', () => {
  it('只放目前指派的老師（用姓名，不顯示原始 id、不標已停用）；沒指派回空陣列', () => {
    const classes = [cls({ id: 1, head_teacher_id: 57, head_teacher_name: '吳老師' })]
    expect(currentTeacherOnlyGroups(classes, 1, 'head')).toEqual([
      { label: '目前指派', options: [{ id: 57, label: '吳老師', disabled: false, note: '' }] },
    ])
    expect(currentTeacherOnlyGroups(classes, 1, 'assistant')).toEqual([])
  })
})
