import { describe, it, expect } from 'vitest'
import {
  buildTeacherOptions,
  countCarryOverSlots,
  formatPlanDate,
  TEACHER_FIELD_BY_ROLE,
} from '../planHelpers'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>

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
