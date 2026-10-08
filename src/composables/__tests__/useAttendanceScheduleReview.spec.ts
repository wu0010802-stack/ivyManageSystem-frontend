import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
const { getContext } = vi.hoisted(() => ({ getContext: vi.fn() }))
vi.mock('@/api/attendanceMonthContext', () => ({ getAttendanceMonthContext: getContext }))
import { useAttendanceScheduleReview } from '../useAttendanceScheduleReview'
import { reviewFingerprint, type ScheduleReviewRow } from '@/utils/attendanceScheduleReview'
function row(id: number): ScheduleReviewRow { return { row_num: id, employee_number: `T${id}`, employee_name: '測試', matched_employee_id: id, date: '2026-06-01', punches: ['2026-06-01T08:00:00', '2026-06-01T17:00:00'], check: 'importable' } }
const data = { days: [{ date: '2026-06-01', is_expected_workday: true, schedule_known: true, expected_start_at: '2026-06-01T08:00:00+08:00', expected_end_at: '2026-06-01T17:00:00+08:00', approved_leaves: [], full_day_leave: false }], roster: [{ employee_name: '不應保留' }] }
function deferred() { let resolve!: (value: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
describe('班表建議載入', () => {
  beforeEach(() => vi.resetAllMocks())
  it('按當月已對照員工去重，最多兩個並發且不查跨月與未對照', async () => {
    const requests = [deferred(), deferred(), deferred()]
    requests.forEach(request => getContext.mockReturnValueOnce(request.promise))
    const state = useAttendanceScheduleReview()
    const load = state.load([row(1), { ...row(1), row_num: 9 }, row(2), row(3), { ...row(4), date: '2026-05-31' }, { ...row(5), matched_employee_id: null }], 2026, 6)
    expect(getContext).toHaveBeenCalledTimes(2)
    requests[0]!.resolve({ data }); await flushPromises()
    expect(getContext).toHaveBeenCalledTimes(3)
    expect(getContext.mock.calls.map(args => args[0].employee_id)).toEqual([1, 2, 3])
    requests[1]!.resolve({ data }); requests[2]!.resolve({ data }); await load
    expect(state.completed.value).toBe(3); expect(state.loading.value).toBe(false)
    expect(JSON.stringify(state.hints.value)).not.toContain('不應保留')
  })
  it('跨generation合計並發仍最多2，舊排隊不再送出、舊回應不寫入', async () => {
    const a = deferred(); const b = deferred(); const c = deferred()
    getContext.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise)
    const state = useAttendanceScheduleReview()
    const old = state.load([row(1), row(2), row(3)], 2026, 6)
    state.invalidate()
    const current = state.load([row(4)], 2026, 6)
    expect(getContext).toHaveBeenCalledTimes(2)
    a.resolve({ data }); await flushPromises()
    expect(getContext).toHaveBeenCalledTimes(3)
    expect(getContext.mock.calls[2]![0].employee_id).toBe(4)
    b.reject(new Error('舊失敗')); c.resolve({ data }); await Promise.all([old, current])
    expect(Object.keys(state.hints.value)).toEqual([reviewFingerprint(row(4))]); expect(state.failed.value).toBe(0)
  })
  it('失敗明示人工且可重試；成功不能消除已發現的待人工gate', async () => {
    getContext.mockRejectedValueOnce(new Error('測試失敗')).mockResolvedValueOnce({ data })
    const state = useAttendanceScheduleReview()
    await state.load([row(1)], 2026, 6)
    expect(state.failed.value).toBe(1); expect(state.hints.value[reviewFingerprint(row(1))]?.kind).toBe('manual')
    await state.load([row(1)], 2026, 6)
    expect(state.failed.value).toBe(0); expect(state.hints.value[reviewFingerprint(row(1))]?.kind).toBe('eligible')
    expect(state.requiredKeys.value.has(reviewFingerprint(row(1)))).toBe(true)
    state.invalidate(false)
    expect(state.requiredKeys.value.size).toBe(1); expect(state.blockingKeys.value.size).toBe(1); expect(state.hints.value).toEqual({})
    state.invalidate(); expect(state.requiredKeys.value.size).toBe(0); expect(state.blockingKeys.value.size).toBe(0)
  })
  it.each([true, false])('只將全日或部分請假轉為has_leave，不保留假別細節 %s', async full => {
    getContext.mockResolvedValueOnce({ data: { ...data, days: [{ ...data.days[0], full_day_leave: full, approved_leaves: full ? [] : [{ leave_type: '不應保留的假別' }] }] } })
    const state = useAttendanceScheduleReview(); await state.load([row(1)], 2026, 6)
    expect(state.hints.value[reviewFingerprint(row(1))]?.reason).toContain('核准請假')
    expect(JSON.stringify(state.hints.value)).not.toContain('不應保留的假別')
  })
})
