import { describe, it, expect } from 'vitest'
import { proposeReview, reviewReasons, matchesReviewFilter } from '../attendanceBatchReview'
const row = { punches: ['2026-06-01T17:00:00', '2026-06-01T08:00:00', '2026-06-01T08:01:00'] }
const edit = { punch_in: '08:01', punch_out: '17:00', confirmed: false }
describe('批次刷卡核對', () => {
  it('採用目前結果保留手動時間且不修改原物件', () => {
    expect(proposeReview(row, edit, 'current')).toEqual({ edit: { ...edit, confirmed: true }, error: '' })
    expect(edit.confirmed).toBe(false)
  })
  it('單側取原始最早或最晚且保留缺卡', () => {
    expect(proposeReview(row, edit, 'in').edit).toEqual({ punch_in: '08:00', punch_out: '', confirmed: true })
    expect(proposeReview(row, edit, 'out').edit).toEqual({ punch_in: '', punch_out: '17:00', confirmed: true })
  })
  it.each([
    { punch_in: '09:00', punch_out: '17:00', confirmed: false },
    { punch_in: '17:00', punch_out: '08:00', confirmed: false },
    { punch_in: '08:00', punch_out: '08:00', confirmed: false },
    { punch_in: '', punch_out: '', confirmed: false },
  ])('拒絕不存在、倒序、相同及全缺卡結果', invalid => {
    expect(proposeReview(row, invalid, 'current').edit).toBeNull()
    expect(proposeReview(row, invalid, 'current').error).toBeTruthy()
  })
  it('空原始刷卡不產生單側時間', () => { expect(proposeReview({ punches: [] }, edit, 'in').edit).toBeNull() })
  it('同分鐘重複與未核對篩選不猜上下午', () => {
    const duplicate = { punches: ['2026-06-01T08:00:00', '2026-06-01T08:00:20'] }
    expect(reviewReasons(duplicate)).toContain('重複刷卡')
    expect(matchesReviewFilter(duplicate, edit, 'duplicate')).toBe(true)
    expect(matchesReviewFilter(row, edit, 'multi')).toBe(true)
    expect(matchesReviewFilter(row, { ...edit, confirmed: true }, 'unconfirmed')).toBe(false)
  })
})
