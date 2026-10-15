import { describe, expect, it } from 'vitest'
import {
  addWorkdays,
  absenceDayText,
  AMEND_LABELS,
  amendButtonLabel,
  backdatedPendingCount,
  amendKindsFor,
  amendLabel,
  describeResolution,
  describeSuggestion,
  BACKDATED_TAG,
  formatMonthDay,
  isBackdated,
  itemsByPersonDay,
  partnerChoices,
  pickDisplayRound,
  resolutionTooltip,
  roundStatusText,
  STATUS_LABELS,
  withBackdatedPending,
  yesterdayISO,
  type ConfirmationAbsenceDay,
  type ConfirmationItem,
  type ConfirmationRoundSummary,
  type PortalConfirmationItem,
  type RoundEmployeeProgress,
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

  it('still names the partner for swap/cover even when parties is missing their entry', () => {
    const missingPartner = makeItem({
      suggestion: {
        ...makeItem().suggestion,
        parties: { '10': party(10, '王副導', BUS, '2026-10-03T08:31:00', '2026-10-03T18:02:00') },
      },
    })
    const text = describeSuggestion(missingPartner, 10)
    expect(text).toContain('推測：與 張副導')
    expect(text).not.toContain('找不到')
  })

  it('shows a placeholder when the original shift is missing', () => {
    const noOriginal = makeItem({
      suggestion: {
        ...makeItem().suggestion,
        parties: {
          '10': party(10, '王副導', null, '2026-10-03T08:31:00', '2026-10-03T18:02:00'),
          '20': party(20, '張副導', LATE, '2026-10-03T07:01:00', '2026-10-03T16:31:00'),
        },
      },
    })
    expect(describeSuggestion(noOriginal, 10)).toContain('（無原班）')
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

  it('describes the teacher amendment for admins: who, kind, leave type, note and linked requests', () => {
    const leave = makeItem({
      status: 'disputed', partner_response: 'amend', linked_leave_id: 31,
      resolution: { kind: 'leave', leave_type: 'personal', note: '家裡有事', by_role: 'partner' },
    })
    expect(describeResolution(leave)).toBe('張副導的修正：補請假（事假）；說明：家裡有事；已建立請假申請 #31')
    const punch = makeItem({
      status: 'disputed', employee_response: 'amend', linked_punch_correction_id: 42,
      resolution: { kind: 'forgot_punch', note: null, by_role: 'employee' },
    })
    expect(describeResolution(punch)).toBe('王副導的修正：忘了打卡（補卡）；已建立補卡申請 #42')
    expect(describeResolution(makeItem())).toBe('')
  })

  it('shows the tag tooltip only for items handed to admins with a note', () => {
    const disputed = makeItem({
      status: 'disputed', resolution: { kind: 'other', note: '那天是園務會議', by_role: 'employee' },
    })
    expect(resolutionTooltip(disputed)).toBe('王副導的修正：其他；說明：那天是園務會議')
    expect(resolutionTooltip({ ...disputed, status: 'pending' })).toBe('')
    expect(resolutionTooltip({ ...disputed, resolution: { kind: 'leave', leave_type: 'sick', by_role: 'employee' } })).toBe('')
    expect(resolutionTooltip(undefined)).toBe('')
  })

  it('labels the dismissed status and appends the admin dismissal note to describeResolution', () => {
    expect(STATUS_LABELS.dismissed).toBe('行政已結案')
    const dismissedWithNote = makeItem({
      status: 'dismissed',
      resolution: {
        kind: 'leave', leave_type: 'personal', by_role: 'partner',
        admin_note: '已人工處理', admin_by: 'admin1',
      },
    })
    const text = describeResolution(dismissedWithNote)
    expect(text).toContain('補請假')
    expect(text).toContain('行政結案：已人工處理')

    const dismissedWithoutNote = makeItem({
      status: 'dismissed',
      resolution: { admin_by: 'admin1' },
    })
    expect(describeResolution(dismissedWithoutNote)).toContain('行政已結案')
  })

  it('labels the amend button per role and kind (Task 8 #1)', () => {
    expect(amendButtonLabel(portal({ kind: 'cover', my_role: 'partner' }))).toBe('補請假或其他…')
    expect(amendButtonLabel(portal({ kind: 'cover', my_role: 'employee' }))).toBe('不對，改成…')
    expect(amendButtonLabel(portal({ kind: 'swap' }))).toBe('不對，改成…')
  })

  it('phrases the leave amend option for the covered-for teacher (Task 8 #1)', () => {
    expect(amendLabel(portal({ kind: 'cover', my_role: 'partner' }), 'leave')).toBe(
      '對，我那天請假（一併送出假單）',
    )
    expect(amendLabel(portal({ kind: 'cover', my_role: 'employee' }), 'leave')).toBe(AMEND_LABELS.leave)
    expect(amendLabel(portal(), 'other')).toBe(AMEND_LABELS.other)
  })

  it('formats an absence day with and without a known shift (Task 8 #1)', () => {
    const withShift: ConfirmationAbsenceDay = {
      date: '2026-09-03', shift_name: '早車', expected_start: '07:00', expected_end: '16:30',
      pending_leave_id: null, pending_punch_correction_id: null,
    }
    expect(absenceDayText(withShift)).toBe('9/3（原班早車 07:00–16:30）')
    const noShift: ConfirmationAbsenceDay = {
      date: '2026-09-03', shift_name: null, expected_start: null, expected_end: null,
      pending_leave_id: null, pending_punch_correction_id: null,
    }
    expect(absenceDayText(noShift)).toBe('9/3')
  })
})

const round = (id: number, status: 'open' | 'closed'): ConfirmationRoundSummary => ({
  id, status, period_start: '2026-09-01', period_end: '2026-09-30', deadline_date: '2026-10-05',
  eligible_count: 3, released_by: 'admin', released_at: '2026-10-01T09:00:00',
})
const emp = (id: number, awaiting: number): RoundEmployeeProgress => ({
  employee_id: id, employee_name: `員工${id}`, item_count: 2, awaiting_response: awaiting,
  agreed: 0, disputed: 0, applied: 0, escalated: false, signed: awaiting === 0,
})

describe('進度條④輪次狀態（D-07）', () => {
  it('進行中優先，否則取第一筆（後端已依期間起日、id 遞減排序）', () => {
    expect(pickDisplayRound([round(5, 'closed'), round(4, 'open')])?.id).toBe(4)
    expect(pickDisplayRound([round(5, 'closed'), round(3, 'closed')])?.id).toBe(5)
    expect(pickDisplayRound([])).toBeNull()
  })

  it('沒有輪次＝尚未發送；已關閉＝已結束；進行中＝已回覆人數／應確認人數', () => {
    expect(roundStatusText(null, null)).toBe('尚未發送')
    expect(roundStatusText(round(1, 'closed'), null)).toBe('已結束')
    expect(roundStatusText(round(1, 'open'), [emp(1, 0), emp(2, 2), emp(3, 0)])).toBe('確認中・已回覆 2/3')
    expect(roundStatusText(round(1, 'open'), [])).toBe('確認中')
  })
})

// 老師自行補登（SPEC-026 3-3）：雙方打卡皆為 null（BE 審查 F1：不存對方打卡）、party.status 固定 "reported"，
// 文案不得出現「打卡」「推測」，教師端（viewerId）與行政端（null）都要正確。
describe('attendanceConfirm 補登項目', () => {
  const reported = (id: number, name: string, original: typeof BUS) => ({
    ...party(id, name, original, null, null),
    status: 'reported',
  })
  function backdated(over: Partial<ConfirmationItem> = {}, sug: Record<string, unknown> = {}): ConfirmationItem {
    return makeItem({
      round_id: null,
      initiated_by: 'employee',
      suggestion: {
        confidence: 'teacher',
        parties: { '10': reported(10, '王副導', BUS), '20': reported(20, '張副導', LATE) },
        proposed: [{ employee_id: 10, shift: LATE }, { employee_id: 20, shift: BUS }],
        partner_options: [], shift_candidates: [], leave_missing: false,
        initiator_employee_id: 10, note: '臨時對調',
        ...sug,
      },
      ...over,
    })
  }

  it('isBackdated 只認 initiated_by=employee；標籤文字固定', () => {
    expect(isBackdated(backdated())).toBe(true)
    expect(isBackdated(makeItem())).toBe(false)
    expect(BACKDATED_TAG).toBe('老師補登')
  })

  it('對方（被邀請者）視角：雙方各自改上對方原班，註明發起人與原因', () => {
    expect(describeSuggestion(backdated(), 20)).toBe(
      '10/3 補登換班：王副導改上晚車 08:30–18:00、你改上早車 07:00–16:30（王副導提出，原因：臨時對調）',
    )
  })

  it('發起人視角：自己是「你」，提出者也是「你」', () => {
    expect(describeSuggestion(backdated(), 10)).toBe(
      '10/3 補登換班：你改上晚車 08:30–18:00、張副導改上早車 07:00–16:30（你提出，原因：臨時對調）',
    )
  })

  it('行政視角（viewerId=null）：全部用姓名', () => {
    expect(describeSuggestion(backdated())).toBe(
      '10/3 補登換班：王副導改上晚車 08:30–18:00、張副導改上早車 07:00–16:30（王副導提出，原因：臨時對調）',
    )
  })

  it('沒有原因只寫提出者；既沒有原因也不知道發起人就不加括號', () => {
    expect(describeSuggestion(backdated({}, { note: null }))).toMatch(/（王副導提出）$/)
    expect(describeSuggestion(backdated({}, { note: '  ' }))).toMatch(/（王副導提出）$/)
    const bare = describeSuggestion(backdated({}, { note: null, initiator_employee_id: null }))
    expect(bare).toBe('10/3 補登換班：王副導改上晚車 08:30–18:00、張副導改上早車 07:00–16:30')
  })

  it('不得出現打卡或推測字樣（雙方打卡皆為 null，也不寫「沒有打卡」）', () => {
    for (const viewer of [null, 10, 20]) {
      const text = describeSuggestion(backdated(), viewer)
      expect(text).not.toMatch(/打卡|推測|可能是/)
    }
  })

  it('suggestion.proposed 為空：退回以雙方原班互換推算', () => {
    expect(describeSuggestion(backdated({}, { proposed: [] }), null)).toContain(
      '王副導改上晚車 08:30–18:00、張副導改上早車 07:00–16:30',
    )
  })

  it('parties 缺姓名時退回 item 上的姓名', () => {
    const item = backdated({}, { parties: {}, proposed: [{ employee_id: 10, shift: LATE }, { employee_id: 20, shift: BUS }] })
    expect(describeSuggestion(item)).toContain('王副導改上晚車')
    expect(describeSuggestion(item)).toContain('張副導改上早車')
  })

  it('系統推測的項目文案不受影響', () => {
    expect(describeSuggestion(makeItem(), 10)).toContain('你打卡 08:31–18:02')
  })

  it('補登項目只開放「其他（說明）」；按鈕文字不再叫「改成…」', () => {
    expect(amendKindsFor(portal({ initiated_by: 'employee', can_repair: false }))).toEqual(['other'])
    expect(amendKindsFor(portal({ initiated_by: 'employee', can_repair: false, my_role: 'partner' }))).toEqual(['other'])
    expect(amendButtonLabel(portal({ initiated_by: 'employee', can_repair: false }))).toBe('不對，說明原因…')
    // 非補登維持原樣
    expect(amendKindsFor(portal({ initiated_by: 'system' }))).toEqual(['swap_with', 'cover_for', 'leave', 'forgot_punch', 'other'])
  })
})

describe('補登待處理數（④老師確認狀態文字）', () => {
  const st = (status: ConfirmationItem['status']) => ({ status })

  it('只算雙方已確認（待套用）與轉行政（待處理）；等對方回覆的、已結案的不算', () => {
    expect(backdatedPendingCount([st('agreed'), st('disputed'), st('pending'), st('applied'), st('dismissed'), st('superseded')])).toBe(2)
    expect(backdatedPendingCount([])).toBe(0)
  })

  it('N>0 才附加「・補登待處理 N」', () => {
    expect(withBackdatedPending('確認中・已回覆 2/3', 2)).toBe('確認中・已回覆 2/3・補登待處理 2')
    expect(withBackdatedPending('尚未發送', 1)).toBe('尚未發送・補登待處理 1')
    expect(withBackdatedPending('已結束', 0)).toBe('已結束')
  })
})
