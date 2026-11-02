import { describe, it, expect } from 'vitest'
import {
  buildAssignGroups,
  buildTeacherOptions,
  countCarryOverSlots,
  countPlanMoves,
  countRetainAtGraduationRisk,
  formatPlanDate,
  isMovedIn,
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

describe('countRetainAtGraduationRisk', () => {
  it('只算留在畢業年級（有學生要畢業的年級）的留級生', () => {
    const students = [
      stu({ id: 1, disposition: 'graduate', current_grade_name: '大班' }),
      stu({ id: 2, disposition: 'retain', current_grade_name: '大班' }),
      stu({ id: 3, disposition: 'retain', current_grade_name: '中班' }),
      stu({ id: 4, disposition: 'promote', current_grade_name: '大班' }),
    ]
    expect(countRetainAtGraduationRisk(students)).toBe(1)
  })

  it('沒有任何畢業生可判斷畢業年級時回 0', () => {
    expect(countRetainAtGraduationRisk([stu({ disposition: 'retain', current_grade_name: '大班' })])).toBe(0)
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
