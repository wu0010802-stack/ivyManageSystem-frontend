import { describe, it, expect } from 'vitest'
import { detectAttendancePatterns, patternIssueTotal } from '../attendancePatterns'
import { cell, day, employee, grid } from '@/components/schedule-attendance/__tests__/gridFixtures'
import type { GridCell, GridDay } from '@/utils/scheduleAttendanceGrid'

// 9/14（一）～9/25（五）共 10 個工作日＋中間週末；今天 9/28
const TODAY = '2026-09-28'
const DATES = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
const DAYS: GridDay[] = DATES.map((date) => day(date))
const WORKDAYS = DAYS.filter((d) => d.is_workday).map((d) => d.date)

type CellOpts = Parameters<typeof cell>[2]
const PLAN = { name: null, shift_type_id: null, source: 'employee' as const, work_start: '08:00', work_end: '17:00' }

/** 一個人整段期間的格子：工作日套 perDay(date, index)，週末是非應出勤日 */
function rowOf(id: number, perDay: (date: string, i: number) => CellOpts): GridCell[] {
  return DAYS.map((d) => {
    if (!d.is_workday) return cell(id, d.date, { plan: { ...PLAN, expected: false }, actual: { status: 'off_day' } })
    const opts = perDay(d.date, WORKDAYS.indexOf(d.date))
    return cell(id, d.date, { ...opts, plan: { ...PLAN, ...opts?.plan } })
  })
}

const punched = (date: string, inAt: string, outAt: string, late: number, early: number, extra: Record<string, unknown> = {}): CellOpts => ({
  actual: { status: late || early ? 'anomaly' : 'matched', punch_in: `${date}T${inAt}:00`, punch_out: `${date}T${outAt}:00`, late_minutes: late, early_leave_minutes: early, ...extra },
})

function detect(cells: GridCell[], days: GridDay[] = DAYS, names: Record<number, string> = {}) {
  const ids = [...new Set(cells.map((c) => c.employee_id))]
  const g = grid({ days, employees: ids.map((id) => employee(id, names[id] ?? `員工${id}`)), cells, today: TODAY })
  return detectAttendancePatterns(g)
}

describe('detectAttendancePatterns：本月幾乎沒有打卡', () => {
  it('整段都是資料待補（匯入檔裡沒有這個人）：標出來並註明不在匯入檔', () => {
    const [p] = detect(rowOf(1, () => ({ actual: { status: 'data_incomplete' } })))
    expect(p).toMatchObject({ kind: 'no_punches', employeeId: 1, expectedDays: 10, punchedDays: 0, notInImport: true, issueCount: 10, firstDate: '2026-09-14' })
  })

  it('匯入有涵蓋但幾乎沒打卡（10 天只有 1 天）：也標出來，不是「不在匯入檔」', () => {
    const [p] = detect(rowOf(1, (date, i) => (i === 3 ? punched(date, '07:55', '17:02', 0, 0) : { actual: { status: 'suspected_absence' } })))
    expect(p).toMatchObject({ kind: 'no_punches', punchedDays: 1, notInImport: false, issueCount: 9 })
  })

  it('有些天是資料待補、有些天是疑似缺勤：匯入有涵蓋到這個人，不能說成「不在匯入檔」', () => {
    const [p] = detect(rowOf(1, (_date, i) => ({ actual: { status: i < 5 ? 'data_incomplete' : 'suspected_absence' } })))
    expect(p).toMatchObject({ kind: 'no_punches', notInImport: false })
  })

  it('整天未匯入的日子不算應上班日（只算有匯入的那幾天）', () => {
    const days = DAYS.map((d) => ({ ...d, import_covered: WORKDAYS.indexOf(d.date) >= 7 }))
    const [p] = detect(rowOf(1, () => ({ actual: { status: 'suspected_absence' } })), days)
    expect(p).toMatchObject({ kind: 'no_punches', expectedDays: 3, firstDate: '2026-09-23' })
  })

  it('有 2 天以上打卡（超過一成）就不算這種型態', () => {
    expect(detect(rowOf(1, (date, i) => (i < 2 ? punched(date, '07:55', '17:02', 0, 0) : { actual: { status: 'suspected_absence' } })))).toEqual([])
  })

  it('整天未匯入的日子、全天已核准假、不在職的日子都不算進應上班日', () => {
    const uncovered = DAYS.map((d) => ({ ...d, import_covered: false }))
    expect(detect(rowOf(1, () => ({ actual: { status: 'data_incomplete' } })), uncovered)).toEqual([])
    const leave = { leave_id: 1, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }
    // 只剩 2 天要上班（不足 3 天）就不下判斷
    const mostlyLeave = rowOf(1, (_date, i) => (i < 8 ? { actual: { status: 'leave' }, leaves: [leave] } : { actual: { status: 'suspected_absence' } }))
    expect(detect(mostlyLeave)).toEqual([])
    // 兩張半天假合起來蓋滿班別：後端判定「已核准請假」，沒有全天假也不算應上班
    const halfDay = { ...leave, is_full_day: false, start_time: '08:00', end_time: '12:00' }
    const coveredByParts = rowOf(1, (_date, i) => (i < 8 ? { actual: { status: 'leave' }, leaves: [halfDay] } : { actual: { status: 'suspected_absence' } }))
    expect(detect(coveredByParts)).toEqual([])
    const notEmployed = rowOf(1, (_date, i) => (i < 8 ? { employed: false } : { actual: { status: 'suspected_absence' } }))
    expect(detect(notEmployed)).toEqual([])
  })

  it('今天與未來日不算（當天還沒結束）', () => {
    const g = grid({
      days: DAYS,
      employees: [employee(1, '甲')],
      cells: rowOf(1, () => ({ actual: { status: 'data_incomplete' } })),
      today: '2026-09-16',
    })
    // 只剩 9/14、9/15 兩天（不足 3 天）
    expect(detectAttendancePatterns(g)).toEqual([])
  })
})

describe('detectAttendancePatterns：每天固定遲到或早退', () => {
  it('幾乎每天都遲到又早退：寫出常見打卡時段與應上班時段', () => {
    const [p] = detect(rowOf(2, (date, i) => punched(date, i === 9 ? '09:35' : '08:55', i === 9 ? '11:40' : '11:45', i === 9 ? 95 : 55, i === 9 ? 320 : 315)))
    expect(p).toMatchObject({
      kind: 'fixed_offset',
      employeeId: 2,
      bothDays: 10,
      lateDays: 10,
      earlyDays: 10,
      typicalLate: 55,
      typicalEarly: 315,
      typicalIn: '08:55',
      typicalOut: '11:45',
      planWindow: '08:00–17:00',
      issueCount: 10,
    })
  })

  it('只有遲到（每天約 26 分）也算；早退那邊不成型就是 0 天', () => {
    const [p] = detect(rowOf(3, (date, i) => (i < 8 ? punched(date, '08:26', '17:05', 26, 0) : punched(date, '07:58', '17:01', 0, 0))))
    expect(p).toMatchObject({ kind: 'fixed_offset', lateDays: 8, earlyDays: 0, typicalLate: 26, typicalEarly: null })
  })

  it('偶爾遲到（10 天 5 天）、或遲到不到 10 分，不算設定問題', () => {
    expect(detect(rowOf(3, (date, i) => (i < 5 ? punched(date, '08:30', '17:05', 30, 0) : punched(date, '07:58', '17:01', 0, 0))))).toEqual([])
    expect(detect(rowOf(3, (date) => punched(date, '08:05', '17:05', 5, 0)))).toEqual([])
  })

  it('兩邊都有打卡的日子少於 5 天不下判斷', () => {
    expect(detect(rowOf(3, (date, i) => (i < 4 ? punched(date, '08:55', '11:45', 55, 315) : { actual: { status: 'missing_punch', punch_in: `${date}T08:55:00` } })))).toEqual([])
  })

  it('全部已豁免（沒有待處理）就不再提醒', () => {
    expect(detect(rowOf(2, (date) => punched(date, '08:55', '11:45', 55, 315, { confirmed_action: 'admin_waive' })))).toEqual([])
  })
})

describe('排序與合計', () => {
  it('沒打卡的排前面（算薪會扣曠職），同型態依待處理格數多到少；合計是各人待處理格數相加', () => {
    const cells = [
      ...rowOf(1, (date, i) => (i < 6 ? punched(date, '08:26', '17:05', 26, 0) : punched(date, '07:58', '17:01', 0, 0))),
      ...rowOf(2, (date) => punched(date, '08:55', '11:45', 55, 315)),
      ...rowOf(3, () => ({ actual: { status: 'data_incomplete' } })),
    ]
    const patterns = detect(cells)
    expect(patterns.map((p) => [p.kind, p.employeeId])).toEqual([['no_punches', 3], ['fixed_offset', 2], ['fixed_offset', 1]])
    expect(patternIssueTotal(patterns)).toBe(10 + 10 + 6)
  })

  it('沒有打卡權限（actual 全是 null）時不判斷', () => {
    const cells = DAYS.map((d) => cell(1, d.date, { plan: { ...PLAN, expected: d.is_workday } }))
    expect(detect(cells)).toEqual([])
  })
})
