import { describe, expect, it } from 'vitest'
import {
  SAME_TIME_HINT,
  formatRosterDuty,
  mergeRosterIntoCandidates,
  type DayRosterEntry,
} from '../swapRoster'

function entry(over: Partial<DayRosterEntry> = {}): DayRosterEntry {
  return {
    employee_id: 1,
    name: '王老師',
    shift_name: '早車',
    work_start: '07:00',
    work_end: '16:30',
    same_time_as_me: false,
    source: 'weekly',
    ...over,
  }
}

describe('formatRosterDuty', () => {
  it('有班別：班別名稱＋時段', () => {
    expect(formatRosterDuty(entry())).toBe('早車 07:00~16:30')
  })

  it('排休', () => {
    expect(formatRosterDuty(entry({ shift_name: null, work_start: null, work_end: null, source: 'daily_off' }))).toBe('排休')
  })

  it('沒有班別但有個人工時：顯示個人工時與時段，不是「未排班」', () => {
    expect(formatRosterDuty(entry({ shift_name: null, work_start: '09:00', work_end: '18:00', source: 'employee' }))).toBe('個人工時 09:00~18:00')
  })

  it('完全沒有排班（預設時段）', () => {
    expect(formatRosterDuty(entry({ shift_name: null, work_start: '08:00', work_end: '17:00', source: 'default' }))).toBe('未排班（預設） 08:00~17:00')
  })

  it('有班別名稱但缺時段：只回名稱', () => {
    expect(formatRosterDuty(entry({ work_start: null, work_end: null }))).toBe('早車')
  })
})

describe('mergeRosterIntoCandidates', () => {
  const cand = (id: number, name: string) => ({ employee_id: id, name, shift_name: '未排班', has_pending_swap: false })

  it('以 employee_id 對應，加上 duty_label 與 same_time', () => {
    const merged = mergeRosterIntoCandidates([cand(1, '甲')], [entry({ employee_id: 1, same_time_as_me: true })])
    expect(merged[0]).toMatchObject({ employee_id: 1, name: '甲', duty_label: '早車 07:00~16:30', same_time: true })
  })

  it('roster 沒有的候選原樣保留（不加註）', () => {
    const merged = mergeRosterIntoCandidates([cand(9, '外人')], [entry({ employee_id: 1 })])
    expect(merged).toEqual([cand(9, '外人')])
    expect('duty_label' in merged[0]!).toBe(false)
  })

  it('時段相同者排最後，其餘維持原順序（穩定排序）', () => {
    const merged = mergeRosterIntoCandidates(
      [cand(1, '甲'), cand(2, '乙'), cand(3, '丙'), cand(4, '丁')],
      [
        entry({ employee_id: 1, same_time_as_me: true }),
        entry({ employee_id: 2, same_time_as_me: false }),
        entry({ employee_id: 3, same_time_as_me: true }),
        entry({ employee_id: 4, same_time_as_me: false }),
      ],
    )
    expect(merged.map((c) => c.employee_id)).toEqual([2, 4, 1, 3])
  })

  it('roster 為空：回傳順序與內容不變', () => {
    const input = [cand(1, '甲'), cand(2, '乙')]
    expect(mergeRosterIntoCandidates(input, [])).toEqual(input)
  })

  it('不修改輸入陣列與物件', () => {
    const input = [cand(1, '甲')]
    const snapshot = JSON.stringify(input)
    mergeRosterIntoCandidates(input, [entry({ employee_id: 1, same_time_as_me: true })])
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('提示文案常數', () => {
    expect(SAME_TIME_HINT).toBe('時段相同，不用登記')
  })
})
