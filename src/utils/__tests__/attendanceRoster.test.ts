import { describe, it, expect } from 'vitest'
import { firstRosterEmployeeId, groupRoster, sortRoster } from '../attendanceRoster'
import type { RosterRow } from '@/composables/useAttendanceWorkspace'

const row = (id: number, name: string, extra: Partial<RosterRow> = {}): RosterRow => ({
  employee_id: id,
  employee_name: name,
  employee_number: `E${String(id).padStart(3, '0')}`,
  normal_days: 20,
  late_count: 0,
  early_leave_count: 0,
  missing_punch_in: 0,
  missing_punch_out: 0,
  total_late_minutes: 0,
  ...extra,
} as RosterRow)

describe('出勤明細名冊排序與分組（頁面預設選人用同一份）', () => {
  // 後端原順序：甲（無異常）在最前；畫面上第一位是有待辦且異常最多的丙
  const roster = [row(1, '甲'), row(2, '乙', { late_count: 1 }), row(3, '丙', { late_count: 3 }), row(4, '丁', { has_summary: false } as Partial<RosterRow>)]

  it('依異常數遞減、姓名排序；搜尋姓名或工號', () => {
    expect(sortRoster(roster).map((r) => r.employee_id)).toEqual([3, 2, 4, 1]) // 同為 0 依姓名（丁＜甲）
    expect(sortRoster(roster, 'e002').map((r) => r.employee_id)).toEqual([2])
  })

  it('分組：有待辦 → 無待辦 → 尚無打卡；有 pendingCounts 時以它判斷（處理完的人回到無待辦）', () => {
    const groups = groupRoster(sortRoster(roster), { E002: 1 })
    // 待辦數量一律說「待辦」（不說待處理）
    expect(groups.map((g) => g.label)).toEqual(['有待辦', '無待辦', '尚無打卡'])
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.employee_id)])).toEqual([
      ['pending', [2]],
      ['clean', [3, 1]],
      ['no-summary', [4]],
    ])
  })

  it('預設選人＝畫面上的第一位（不是後端原順序的第一筆）', () => {
    expect(firstRosterEmployeeId(roster)).toBe(3)
    expect(firstRosterEmployeeId(roster, { E002: 1 })).toBe(2)
    expect(firstRosterEmployeeId([])).toBeNull()
  })
})
