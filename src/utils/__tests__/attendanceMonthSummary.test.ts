import { describe, it, expect } from 'vitest'
import { buildMonthSummary, currentStep, primaryAction, primaryLabel, type MonthSummary } from '@/utils/attendanceMonthSummary'
import { detectAttendancePatterns, type AttendancePattern } from '@/utils/attendancePatterns'
import { cell, day, employee, grid, WEEK } from '@/components/schedule-attendance/__tests__/gridFixtures'

const TODAY = '2026-09-21'
const SEALED = { locked_reason: 'finalized' as const, plan: false }
const ANOMALY = { status: 'anomaly' as const }

/** 兩位在職員工、週一到週日都已匯入；cells 由各案例自己給。 */
function gridOf(cells: ReturnType<typeof cell>[], days = WEEK.map((d) => day(d))) {
  return grid({ today: TODAY, days, employees: [employee(1, '林班導'), employee(2, '王副導')], cells })
}

/** 手工組一個「整月沒有打卡」的型態：只用來測 buildMonthSummary 怎麼吃 patterns。 */
function noPunch(employeeId: number, dates: string[]): AttendancePattern {
  return {
    kind: 'no_punches',
    employeeId,
    name: `員工${employeeId}`,
    roleLabel: null,
    issueCount: dates.length,
    matchCount: dates.length,
    matchDates: dates,
    expectedDays: 5,
    punchedDays: 0,
    firstDate: dates[0],
    notInImport: true,
  }
}

describe('buildMonthSummary：封存狀態', () => {
  it('沒有任何封存格＝open；employedCount 只算當月至少一天在職的人', () => {
    const g = gridOf([
      cell(1, WEEK[0]),
      cell(2, WEEK[0]),
      cell(3, WEEK[0], { employed: false }), // 整月不在職
    ])
    const s = buildMonthSummary(g, [], TODAY)
    expect(s.sealState).toBe('open')
    expect(s.employedCount).toBe(2)
    expect(s.sealedEmployeeIds.size).toBe(0)
    expect(s.year).toBe(2026)
    expect(s.month).toBe(9)
  })

  it('部分在職者有封存格＝partial，sealedEmployeeIds 記是誰', () => {
    const g = gridOf([
      cell(1, WEEK[0], { edit: SEALED }),
      cell(1, WEEK[1], { edit: SEALED }),
      cell(2, WEEK[0]),
    ])
    const s = buildMonthSummary(g, [], TODAY)
    expect(s.sealState).toBe('partial')
    expect([...s.sealedEmployeeIds]).toEqual([1])
    expect(s.employedCount).toBe(2)
  })

  it('在職者全部有封存格＝sealed；月中離職者離職後的格子是 not_employed，不影響判定', () => {
    const g = gridOf([
      cell(1, WEEK[0], { edit: SEALED }),
      cell(2, WEEK[0], { edit: SEALED }),
      cell(2, WEEK[1], { employed: false, edit: { locked_reason: 'not_employed', plan: false } }),
    ])
    const s = buildMonthSummary(g, [], TODAY)
    expect(s.sealState).toBe('sealed')
    expect(s.sealedEmployeeIds).toEqual(new Set([1, 2]))
  })

  it('整月沒有任何在職者：open（沒有東西可封存）', () => {
    const s = buildMonthSummary(gridOf([cell(1, WEEK[0], { employed: false })]), [], TODAY)
    expect(s.employedCount).toBe(0)
    expect(s.sealState).toBe('open')
  })
})

describe('buildMonthSummary：件數', () => {
  it('dailyIssueCount 排除型態格與封存格；patternPeople／patternIssueCount 只算型態', () => {
    const g = gridOf([
      // 員工 1：3 格是型態（修好設定會一起消失）、1 格是逐日要處理的
      cell(1, WEEK[0], { actual: ANOMALY }),
      cell(1, WEEK[1], { actual: ANOMALY }),
      cell(1, WEEK[2], { actual: ANOMALY }),
      cell(1, WEEK[3], { actual: ANOMALY }),
      // 員工 2：已封存，待辦不算
      cell(2, WEEK[0], { actual: ANOMALY, edit: SEALED }),
    ])
    const patterns = [noPunch(1, [WEEK[0], WEEK[1], WEEK[2]])]
    const s = buildMonthSummary(g, patterns, TODAY)
    expect(s.patternPeople).toBe(1)
    expect(s.patternIssueCount).toBe(3)
    expect(s.dailyIssueCount).toBe(1)
  })

  it('已封存者即使出現在 patterns 裡也不算設定問題（只算未封存者）', () => {
    const g = gridOf([
      cell(1, WEEK[0], { actual: ANOMALY, edit: SEALED }),
      cell(2, WEEK[0], { actual: ANOMALY }),
    ])
    const s = buildMonthSummary(g, [noPunch(1, [WEEK[0]]), noPunch(2, [WEEK[0]])], TODAY)
    expect(s.patternPeople).toBe(1)
    expect(s.patternIssueCount).toBe(1)
  })

  it('leftoverCount 只算封存者封存時沒處理的件；未封存者的待辦不算', () => {
    const g = gridOf([
      cell(1, WEEK[0], { actual: ANOMALY, edit: SEALED }), // 封存遺留
      cell(1, WEEK[1], { actual: { status: 'matched' }, edit: SEALED }), // 封存但本來就沒事
      cell(2, WEEK[0], { actual: ANOMALY }), // 未封存的待辦
    ])
    const s = buildMonthSummary(g, [], TODAY)
    expect(s.leftoverCount).toBe(1)
    expect(s.dailyIssueCount).toBe(1)
  })

  it('整天未匯入的資料待補不算待辦也不算封存遺留', () => {
    const NONE = { status: 'data_incomplete' as const, punch_in: null, punch_out: null }
    const days = WEEK.map((d, i) => day(d, { import_covered: i !== 1 })) // 9/15 整天沒匯入
    const g = gridOf([cell(1, WEEK[1], { actual: NONE }), cell(2, WEEK[1], { actual: NONE, edit: SEALED })], days)
    const s = buildMonthSummary(g, [], TODAY)
    expect(s.dailyIssueCount).toBe(0)
    expect(s.leftoverCount).toBe(0)
  })

  it('importStatus 沿用 importProgress：最後匯入日與缺漏工作日', () => {
    const days = WEEK.map((d, i) => day(d, { import_covered: i < 3 }))
    const s = buildMonthSummary(gridOf([cell(1, WEEK[0])], days), [], TODAY)
    expect(s.importStatus.lastCovered).toBe('2026-09-16')
    expect(s.importStatus.missingWorkdays).toEqual(['2026-09-17', '2026-09-18'])
  })

  it('跟 detectAttendancePatterns 串起來：型態格從逐日待辦扣掉，封存員工整個不進型態', () => {
    // 員工 1、2 在已匯入的 9/14–9/16 都是資料待補＝整月沒有打卡的型態；員工 2 已封存
    const NOT_IN_IMPORT = { status: 'data_incomplete' as const }
    const days = WEEK.map((d, i) => day(d, { import_covered: i < 3 }))
    const g = gridOf(
      [
        ...WEEK.slice(0, 3).map((d) => cell(1, d, { actual: NOT_IN_IMPORT })),
        ...WEEK.slice(0, 3).map((d) => cell(2, d, { actual: NOT_IN_IMPORT, edit: SEALED })),
        cell(1, WEEK[3], { actual: ANOMALY }), // 9/17 整天未匯入但已有異常判定：不是型態格，算逐日待辦
      ],
      days,
    )
    const patterns = detectAttendancePatterns(g)
    expect(patterns.map((p) => p.employeeId)).toEqual([1])
    const s = buildMonthSummary(g, patterns, TODAY)
    expect(s.patternPeople).toBe(1)
    expect(s.patternIssueCount).toBe(3)
    expect(s.dailyIssueCount).toBe(1)
    expect(s.leftoverCount).toBe(3)
  })
})

function summaryOf(overrides: Partial<MonthSummary> = {}): MonthSummary {
  return {
    year: 2026,
    month: 9,
    sealState: 'open',
    sealedEmployeeIds: new Set<number>(),
    employedCount: 2,
    importStatus: { lastCovered: '2026-09-20', gaps: [], missingWorkdays: [] },
    patternPeople: 0,
    patternIssueCount: 0,
    dailyIssueCount: 0,
    leftoverCount: 0,
    ...overrides,
  }
}

describe('currentStep：依序判定', () => {
  it('sealed 一律 done，不管還有什麼沒處理', () => {
    expect(currentStep(summaryOf({ sealState: 'sealed', patternPeople: 3, dailyIssueCount: 9 }), 5)).toBe('done')
  })

  it('一天都沒匯入、或有缺漏工作日 → import（優先於其他）', () => {
    const none = summaryOf({ importStatus: { lastCovered: null, gaps: [], missingWorkdays: [] }, patternPeople: 1 })
    expect(currentStep(none, 0)).toBe('import')
    const gap = summaryOf({ importStatus: { lastCovered: '2026-09-16', gaps: [], missingWorkdays: ['2026-09-17'] }, patternPeople: 1 })
    expect(currentStep(gap, 0)).toBe('import')
  })

  it('匯入齊了：設定問題 → 逐日待辦 → 老師確認 → 交薪資', () => {
    expect(currentStep(summaryOf({ patternPeople: 2, dailyIssueCount: 5 }), 3)).toBe('patterns')
    expect(currentStep(summaryOf({ dailyIssueCount: 5 }), 3)).toBe('daily')
    expect(currentStep(summaryOf(), 3)).toBe('confirm')
    expect(currentStep(summaryOf(), 0)).toBe('payroll')
  })

  it('partial 跟 open 一樣照順序走', () => {
    expect(currentStep(summaryOf({ sealState: 'partial', dailyIssueCount: 1 }), 0)).toBe('daily')
  })
})

describe('primaryLabel：目前步驟的主要動作文字', () => {
  it('各步驟逐字', () => {
    const s = summaryOf({ patternPeople: 15, patternIssueCount: 266, dailyIssueCount: 169 })
    expect(primaryLabel(s, 'import')).toBe('匯入打卡')
    expect(primaryLabel(s, 'patterns')).toBe('先修設定問題・15 人')
    expect(primaryLabel(s, 'daily')).toBe('處理待辦・剩 169 件')
    expect(primaryLabel(s, 'payroll')).toBe('交薪資')
  })

  it('confirm（等老師）與 done 沒有主要動作', () => {
    expect(primaryLabel(summaryOf(), 'confirm')).toBeNull()
    expect(primaryLabel(summaryOf(), 'done')).toBeNull()
  })
})

describe('primaryAction：頁首主要按鈕與手機膠囊共用的動作（含權限）', () => {
  const ALL = { writeAttendance: true, viewSalary: true }
  const s = summaryOf({ patternPeople: 15, patternIssueCount: 266, dailyIssueCount: 169 })

  it('各步驟：文字照 primaryLabel、動作對應步驟', () => {
    expect(primaryAction(s, 'import', ALL)).toEqual({ label: '匯入打卡', action: 'import' })
    expect(primaryAction(s, 'patterns', ALL)).toEqual({ label: '先修設定問題・15 人', action: 'patterns' })
    expect(primaryAction(s, 'daily', ALL)).toEqual({ label: '處理待辦・剩 169 件', action: 'daily' })
    expect(primaryAction(s, 'payroll', ALL)).toEqual({ label: '交薪資', action: 'payroll' })
  })

  it('confirm（等老師）、done（已封存）、還在載入（step 為 null）沒有主要動作', () => {
    expect(primaryAction(s, 'confirm', ALL)).toBeNull()
    expect(primaryAction(s, 'done', ALL)).toBeNull()
    expect(primaryAction(s, null, ALL)).toBeNull()
  })

  it('匯入要 ATTENDANCE_WRITE、交薪資要 SALARY_READ；沒有權限就沒有按鈕（其餘步驟不受影響）', () => {
    expect(primaryAction(s, 'import', { writeAttendance: false, viewSalary: true })).toBeNull()
    expect(primaryAction(s, 'payroll', { writeAttendance: true, viewSalary: false })).toBeNull()
    expect(primaryAction(s, 'patterns', { writeAttendance: false, viewSalary: false })?.action).toBe('patterns')
    expect(primaryAction(s, 'daily', { writeAttendance: false, viewSalary: false })?.action).toBe('daily')
  })
})
