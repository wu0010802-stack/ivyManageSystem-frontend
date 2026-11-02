import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { MeetingBatchAttendance } from '@/utils/meetingBatch'

const getMeetingShiftHours = vi.fn()
vi.mock('@/api/meetings', () => ({
  getMeetingShiftHours: (...a: unknown[]) => getMeetingShiftHours(...a),
}))

import { useMeetingShiftPreview } from '../useMeetingShiftPreview'

const WINDOW_RESP = {
  data: {
    meeting_start_time: '17:30',
    meeting_end_time: '18:30',
    items: [
      { employee_id: 1, hours: 1, shift_end: '17:30', source: 'weekly' },
      { employee_id: 2, hours: 0.5, shift_end: '18:00', source: 'weekly' },
    ],
  },
}

const makeRows = () =>
  ref<MeetingBatchAttendance[]>([
    { id: 1, attended: true, hours: null },
    { id: 2, attended: true, hours: null },
    { id: 3, attended: true, hours: null },
  ])

describe('useMeetingShiftPreview（mtgshift01：批次登錄依排班預填時數）', () => {
  beforeEach(() => {
    getMeetingShiftHours.mockReset()
  })

  it('租戶設了會議時段 → 時段模式，帶出時段並把排班時數填到名單', async () => {
    getMeetingShiftHours.mockResolvedValue(WINDOW_RESP)
    const rows = makeRows()
    const preview = useMeetingShiftPreview(rows)

    await preview.init('2026-11-04')

    expect(getMeetingShiftHours).toHaveBeenCalledWith({ meeting_date: '2026-11-04' })
    expect(preview.windowMode.value).toBe(true)
    expect(preview.start.value).toBe('17:30')
    expect(preview.end.value).toBe('18:30')
    expect(rows.value.map((r) => r.suggested)).toEqual([1, 0.5, undefined])
    expect(preview.itemFor(2)?.shift_end).toBe('18:00')
  })

  it('租戶沒設時段 → 維持整場時數模式', async () => {
    getMeetingShiftHours.mockResolvedValue({
      data: { meeting_start_time: null, meeting_end_time: null, items: [] },
    })
    const rows = makeRows()
    const preview = useMeetingShiftPreview(rows)

    await preview.init('2026-11-04')

    expect(preview.windowMode.value).toBe(false)
    expect(rows.value.every((r) => r.suggested === undefined)).toBe(true)
  })

  it('預覽失敗 → 退回整場時數模式（後端仍會依租戶時段計算，不會算錯）', async () => {
    getMeetingShiftHours.mockRejectedValue(new Error('boom'))
    const preview = useMeetingShiftPreview(makeRows())

    await preview.init('2026-11-04')

    expect(preview.windowMode.value).toBe(false)
  })

  it('改日期或時段後重抓，明確帶目前時段', async () => {
    getMeetingShiftHours.mockResolvedValue(WINDOW_RESP)
    const rows = makeRows()
    const preview = useMeetingShiftPreview(rows)
    await preview.init('2026-11-04')

    preview.end.value = '19:00'
    getMeetingShiftHours.mockResolvedValue({
      data: {
        meeting_start_time: '17:30',
        meeting_end_time: '19:00',
        items: [{ employee_id: 2, hours: 1, shift_end: '18:00', source: 'weekly' }],
      },
    })
    await preview.refresh('2026-11-05')

    expect(getMeetingShiftHours).toHaveBeenLastCalledWith({
      meeting_date: '2026-11-05',
      meeting_start_time: '17:30',
      meeting_end_time: '19:00',
    })
    expect(rows.value[1].suggested).toBe(1)
    expect(rows.value[0].suggested).toBeUndefined()
  })

  it('時段不完整時不重抓', async () => {
    getMeetingShiftHours.mockResolvedValue(WINDOW_RESP)
    const preview = useMeetingShiftPreview(makeRows())
    await preview.init('2026-11-04')
    getMeetingShiftHours.mockClear()

    preview.end.value = null
    await preview.refresh('2026-11-04')

    expect(getMeetingShiftHours).not.toHaveBeenCalled()
  })

  it('較慢回來的舊請求不覆蓋新結果', async () => {
    getMeetingShiftHours.mockResolvedValue(WINDOW_RESP)
    const rows = makeRows()
    const preview = useMeetingShiftPreview(rows)
    await preview.init('2026-11-04')

    let resolveSlow: (v: unknown) => void = () => {}
    getMeetingShiftHours.mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
    const slow = preview.refresh('2026-11-05')
    getMeetingShiftHours.mockResolvedValueOnce({
      data: {
        meeting_start_time: '17:30',
        meeting_end_time: '18:30',
        items: [{ employee_id: 1, hours: 0, shift_end: '18:30', source: 'daily' }],
      },
    })
    await preview.refresh('2026-11-06')
    resolveSlow(WINDOW_RESP)
    await slow

    expect(rows.value[0].suggested).toBe(0)
  })
})
