import { describe, expect, it } from 'vitest'
import {
  BACKFILL_NO_SHIFT_HINT,
  NO_SHIFT_HINT,
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
    expect(NO_SHIFT_HINT).toBe('對方當天沒有排定班別，無法換班')
  })

  // 換班接受時會把「對方原本沒有班別」寫成發起人排休；對方其實走個人工時／預設時段在上班，
  // 卻被當成沒班 → 發起人莫名排休。所以沒有排定班別（且不是明確排休）的同事不可選。
  describe('對方當天沒有排定班別 → 不可選', () => {
    const merged = (over: Partial<DayRosterEntry>) =>
      mergeRosterIntoCandidates([cand(1, '甲')], [entry({ employee_id: 1, ...over })])[0]!

    it('個人工時（source=employee、無班別）→ unavailable_reason', () => {
      expect(merged({ shift_name: null, source: 'employee', work_start: '09:00', work_end: '18:00' }).unavailable_reason).toBe(NO_SHIFT_HINT)
    })

    it('預設時段（source=default、無班別）→ unavailable_reason', () => {
      expect(merged({ shift_name: null, source: 'default', work_start: '08:00', work_end: '17:00' }).unavailable_reason).toBe(NO_SHIFT_HINT)
    })

    it('明確排休（source=daily_off）仍可選：換休是合法換班', () => {
      expect(merged({ shift_name: null, source: 'daily_off', work_start: null, work_end: null }).unavailable_reason).toBeUndefined()
    })

    it('有班別名稱 → 可選', () => {
      expect(merged({}).unavailable_reason).toBeUndefined()
    })

    it('roster 沒有該候選 → 不加註也不擋（降級行為）', () => {
      const out = mergeRosterIntoCandidates([cand(9, '外人')], [entry({ employee_id: 1, shift_name: null, source: 'employee' })])
      expect('unavailable_reason' in out[0]!).toBe(false)
    })
  })
})

// 補登（SPEC-026 3-3 P4）：套用時雙方互換各自的原班，任一方沒有排定班別（含排休）就無從互換。
describe('補登模式（backdated: true）：沒有排定班別一律不可選', () => {
  // 用字面值而非常數斷言：常數若漏匯出會是 undefined，與「未標記」的 undefined 無從區分
  const HINT = '補登換班限雙方當天都有排定班別'
  const cand = (id: number) => ({ employee_id: id, name: `T${id}`, shift_name: '未排班', has_pending_swap: false })
  const merged = (over: Partial<DayRosterEntry>, backdated: boolean) =>
    mergeRosterIntoCandidates([cand(1)], [entry({ employee_id: 1, ...over })], { backdated })[0]!

  it('提示文案常數', () => {
    expect(BACKFILL_NO_SHIFT_HINT).toBe('補登換班限雙方當天都有排定班別')
  })

  it('明確排休（daily_off）在補登模式也不可選，原因為補登專用文案', () => {
    expect(merged({ shift_name: null, source: 'daily_off', work_start: null, work_end: null }, true).unavailable_reason).toBe(HINT)
  })

  it('個人工時／預設時段（無班別）→ 補登專用文案（非 3-1 文案）', () => {
    expect(merged({ shift_name: null, source: 'employee', work_start: '09:00', work_end: '18:00' }, true).unavailable_reason).toBe(HINT)
    expect(merged({ shift_name: null, source: 'default', work_start: '08:00', work_end: '17:00' }, true).unavailable_reason).toBe(HINT)
  })

  it('有班別名稱 → 補登模式仍可選', () => {
    expect(merged({}, true).unavailable_reason).toBeUndefined()
  })

  it('backdated 為 false（或不傳）時沿用 3-1：排休仍可選', () => {
    const dayOff = { shift_name: null, source: 'daily_off', work_start: null, work_end: null } as const
    expect(merged(dayOff, false).unavailable_reason).toBeUndefined()
    expect(
      mergeRosterIntoCandidates([cand(1)], [entry({ employee_id: 1, ...dayOff })])[0]!.unavailable_reason,
    ).toBeUndefined()
  })
})
