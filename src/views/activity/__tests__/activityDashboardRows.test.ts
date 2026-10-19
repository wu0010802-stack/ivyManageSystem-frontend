/**
 * 才藝儀表板：人次比率達標、未達標排前、差 N 人次、同比／環比（2026-10-19 業主裁定）。
 * mock 欄位對齊 schema.d.ts 的 ActivityDashboard*Out（必填欄位全帶）。
 */
import { describe, it, expect } from 'vitest'
import {
  buildDashboardRows,
  buildShortfallLabel,
  buildTrendLabel,
  sortClassroomsUnmetFirst,
  type DashboardClassroom,
  type DashboardGrade,
  type DashboardGrandTotal,
  type DashboardSubtotal,
} from '../activityDashboardRows'
import { buildBonusLabel } from '../activityDashboardTable'

function cls(name: string, over: Partial<DashboardClassroom> = {}): DashboardClassroom {
  return {
    classroom_name: name,
    teacher_name: '王老師',
    classroom_id: 1,
    student_count: 20,
    courses: {},
    pending_review_courses: {},
    total_enrollments: 20,
    total_pending_review: 0,
    ratio: 80,
    enrollment_ratio: 100,
    target_percent: 90,
    meets_target: true,
    shortfall_enrollments: 0,
    ...over,
  }
}

function subtotal(over: Partial<DashboardSubtotal> = {}): DashboardSubtotal {
  return {
    student_count: 60,
    courses: {},
    pending_review_courses: {},
    total_enrollments: 50,
    total_pending_review: 0,
    ratio: 70,
    enrollment_ratio: 83,
    meets_target: false,
    shortfall_enrollments: 4,
    bonus: 0,
    points: 0,
    yoy_enrollment_ratio: null,
    qoq_enrollment_ratio: null,
    ...over,
  }
}

const GRAND_TOTAL: DashboardGrandTotal = {
  student_count: 60,
  courses: {},
  pending_review_courses: {},
  total_enrollments: 50,
  total_pending_review: 0,
  ratio: 70,
  enrollment_ratio: 83,
  yoy_enrollment_ratio: 90,
  qoq_enrollment_ratio: null,
}

function grade(classrooms: DashboardClassroom[], sub: Partial<DashboardSubtotal> = {}): DashboardGrade {
  return {
    grade_id: 1,
    grade_name: '中班',
    target_percent: 90,
    classrooms,
    subtotal: subtotal(sub),
  }
}

describe('sortClassroomsUnmetFirst', () => {
  it('未達標班排在達標班前面，差越多越前；達標班維持原順序', () => {
    const rows = [
      cls('甲'),
      cls('乙', { meets_target: false, shortfall_enrollments: 2 }),
      cls('丙'),
      cls('丁', { meets_target: false, shortfall_enrollments: 5 }),
    ]
    expect(sortClassroomsUnmetFirst(rows).map((r) => r.classroom_name)).toEqual(['丁', '乙', '甲', '丙'])
    // 不改原陣列
    expect(rows.map((r) => r.classroom_name)).toEqual(['甲', '乙', '丙', '丁'])
  })

  it('差額相同時維持後端原順序（穩定）', () => {
    const rows = [
      cls('甲', { meets_target: false, shortfall_enrollments: 3 }),
      cls('乙', { meets_target: false, shortfall_enrollments: 3 }),
    ]
    expect(sortClassroomsUnmetFirst(rows).map((r) => r.classroom_name)).toEqual(['甲', '乙'])
  })
})

describe('buildShortfallLabel', () => {
  it('未達標顯示「差 N 人次」', () => {
    expect(buildShortfallLabel({ meets_target: false, shortfall_enrollments: 3 })).toBe('差 3 人次')
  })

  it('達標不顯示', () => {
    expect(buildShortfallLabel({ meets_target: true, shortfall_enrollments: 0 })).toBe('')
  })

  it('在籍 0（shortfall 0）或欄位缺漏不顯示', () => {
    expect(buildShortfallLabel({ meets_target: false, shortfall_enrollments: 0 })).toBe('')
    expect(buildShortfallLabel({})).toBe('')
  })
})

describe('buildTrendLabel（百分點差值）', () => {
  it('上升顯示 ↑ 與差值', () => {
    expect(buildTrendLabel(95, 90)).toEqual({ direction: 'up', text: '↑5' })
  })

  it('下降顯示 ↓ 與絕對差值', () => {
    expect(buildTrendLabel(82, 90)).toEqual({ direction: 'down', text: '↓8' })
  })

  it('相同顯示持平', () => {
    expect(buildTrendLabel(90, 90)).toEqual({ direction: 'flat', text: '持平' })
  })

  it('前期為 null／undefined 顯示「—」', () => {
    expect(buildTrendLabel(90, null)).toEqual({ direction: 'none', text: '—' })
    expect(buildTrendLabel(90, undefined)).toEqual({ direction: 'none', text: '—' })
    expect(buildTrendLabel(undefined, 90)).toEqual({ direction: 'none', text: '—' })
  })

  it('小數差值四捨五入到一位', () => {
    expect(buildTrendLabel(90.26, 90)).toEqual({ direction: 'up', text: '↑0.3' })
  })
})

describe('buildDashboardRows', () => {
  const table = {
    grades: [
      grade([
        cls('甲'),
        cls('乙', { meets_target: false, shortfall_enrollments: 2 }),
      ]),
      { ...grade([cls('丙')], { meets_target: true, shortfall_enrollments: 0, bonus: 1000 }), grade_name: '大班' },
    ],
    grand_total: GRAND_TOTAL,
  }

  it('年級區塊內未達標班排前，接小計，最後全園總計', () => {
    const rows = buildDashboardRows(table, { bonusLabel: buildBonusLabel })
    expect(rows.map((r) => `${r.rowType}:${r.classroom_name}`)).toEqual([
      'class:乙', 'class:甲', 'subtotal:小計', 'class:丙', 'subtotal:小計', 'grand_total:總計',
    ])
    expect(rows[0]).toMatchObject({ isFirstOfGrade: true, rowSpan: 3, shortfall_enrollments: 2 })
    expect(rows[1].isFirstOfGrade).toBe(false)
    expect(rows[3].bonus).toBe('+1,000')
    expect(rows[5].yoy_enrollment_ratio).toBe(90)
  })

  it('只看未達標：只留未達標班＋小計，全部達標的年級整段收起', () => {
    const rows = buildDashboardRows(table, { onlyBelowTarget: true, bonusLabel: buildBonusLabel })
    expect(rows.map((r) => `${r.rowType}:${r.classroom_name}`)).toEqual([
      'class:乙', 'subtotal:小計', 'grand_total:總計',
    ])
    expect(rows[0]).toMatchObject({ isFirstOfGrade: true, rowSpan: 2 })
  })

  it('只看未達標時，班級皆達標但年級小計未達標→仍顯示小計且自成合併起點', () => {
    const rows = buildDashboardRows(
      { grades: [grade([cls('甲')])], grand_total: GRAND_TOTAL },
      { onlyBelowTarget: true, bonusLabel: buildBonusLabel },
    )
    expect(rows.map((r) => r.rowType)).toEqual(['subtotal', 'grand_total'])
    expect(rows[0]).toMatchObject({ isFirstOfGrade: true, rowSpan: 1 })
  })
})
