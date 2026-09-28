import { describe, expect, it } from 'vitest'
import {
  addWorkdays,
  amendKindsFor,
  describeSuggestion,
  formatMonthDay,
  itemsByPersonDay,
  partnerChoices,
  yesterdayISO,
  type ConfirmationItem,
  type PortalConfirmationItem,
} from '@/utils/attendanceConfirm'

const BUS = { shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30' }
const LATE = { shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }

function party(id: number, name: string, original: typeof BUS | null, punchIn: string | null, punchOut: string | null) {
  return {
    employee_id: id, employee_name: name, status: 'possible_shift_change',
    punch_in: punchIn, punch_out: punchOut, expected_start: original?.work_start ?? null,
    expected_end: original?.work_end ?? null, original,
  }
}

function makeItem(over: Partial<ConfirmationItem> = {}): ConfirmationItem {
  return {
    id: 1, round_id: 1, employee_id: 10, employee_name: '王副導', partner_employee_id: 20,
    partner_name: '張副導', date: '2026-10-03', kind: 'swap',
    suggestion: {
      confidence: 'high',
      parties: {
        '10': party(10, '王副導', BUS, '2026-10-03T08:31:00', '2026-10-03T18:02:00'),
        '20': party(20, '張副導', LATE, '2026-10-03T07:01:00', '2026-10-03T16:31:00'),
      },
      proposed: [{ employee_id: 10, shift: LATE }, { employee_id: 20, shift: BUS }],
      partner_options: [], shift_candidates: [LATE], leave_missing: false,
    },
    employee_response: 'pending', partner_response: 'pending', resolution: null, status: 'pending',
    escalated: false, linked_leave_id: null, linked_punch_correction_id: null,
    initiated_by: 'system', applied_at: null,
    ...over,
  }
}

function portal(over: Partial<PortalConfirmationItem> = {}): PortalConfirmationItem {
  return { ...makeItem(), my_role: 'employee', needs_my_response: true, can_agree: true, can_repair: true, ...over }
}

describe('attendanceConfirm', () => {
  it('formats month/day and describes a swap from the teacher view', () => {
    expect(formatMonthDay('2026-10-03')).toBe('10/3')
    expect(describeSuggestion(makeItem(), 10)).toBe(
      '10/3 你打卡 08:31–18:02，原班早車 07:00–16:30。推測：與 張副導（晚車）對調',
    )
  })

  it('describes a cover from both sides and flags missing leave', () => {
    const cover = makeItem({
      kind: 'cover', employee_id: 20, partner_employee_id: 10,
      suggestion: { ...makeItem().suggestion, leave_missing: true,
        parties: { '10': party(10, '王副導', BUS, null, null), '20': party(20, '張副導', LATE, '2026-10-03T07:00:00', '2026-10-03T16:30:00') } },
    })
    expect(describeSuggestion(cover, 20)).toContain('推測：代 王副導 上早車')
    expect(describeSuggestion(cover, 10)).toContain('沒有打卡')
    expect(describeSuggestion(cover, 10)).toContain('張副導 代你上早車（你當天沒有請假紀錄')
    expect(describeSuggestion(cover)).toContain('10/3 張副導打卡 07:00–16:30')
  })

  it('lists options for multi-candidate items and explains items without partner', () => {
    const multi = makeItem({
      kind: 'shift_changed', partner_employee_id: null, partner_name: null,
      suggestion: { ...makeItem().suggestion, confidence: 'medium', proposed: [],
        partner_options: [{ kind: 'cover', partner_employee_id: 20, proposed: [{ employee_id: 10, shift: LATE }] }] },
    })
    expect(describeSuggestion(multi, 10)).toContain('可能是：代 張副導 的班')
    const lonely = makeItem({ kind: 'shift_changed', partner_employee_id: null,
      suggestion: { ...makeItem().suggestion, confidence: 'low', proposed: [], partner_options: [] } })
    expect(describeSuggestion(lonely, 10)).toContain('打卡時間接近晚車，但找不到對調或代班的同事')
  })

  it('offers repair only to the item owner and partner choices from options', () => {
    expect(amendKindsFor(portal())).toEqual(['swap_with', 'cover_for', 'leave', 'forgot_punch', 'other'])
    expect(amendKindsFor(portal({ my_role: 'partner', can_repair: false }))).toEqual(['leave', 'forgot_punch', 'other'])
    expect(partnerChoices(makeItem(), 'swap_with')).toEqual([{ id: 20, name: '張副導', kind: 'swap' }])
    expect(partnerChoices(makeItem(), 'cover_for')).toEqual([])
  })

  it('computes default deadline in workdays and yesterday', () => {
    expect(addWorkdays('2026-10-02', 3)).toBe('2026-10-07') // 週五起算跳過週末
    expect(addWorkdays('2026-10-05', 3)).toBe('2026-10-08')
    expect(yesterdayISO('2026-10-01')).toBe('2026-09-30')
  })

  it('maps person-days to items and ignores superseded ones', () => {
    const map = itemsByPersonDay([makeItem(), makeItem({ id: 2, status: 'superseded', employee_id: 30, partner_employee_id: null })])
    expect(map.get('10|2026-10-03')?.id).toBe(1)
    expect(map.get('20|2026-10-03')?.id).toBe(1)
    expect(map.has('30|2026-10-03')).toBe(false)
  })
})
