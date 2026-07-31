import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── API mocks ──────────────────────────────────────────────────────────────
const getPublicRegistrationTime = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  getPublicRegistrationTime: (...a) => getPublicRegistrationTime(...a),
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityRegistrationTime } from '@/composables/useActivityRegistrationTime'

// 2026-07-31 起純時間窗語意：is_open 開關已移除，registrationOpen 匯出也隨之
// 移除；載入狀態改以 timeInfo 本身表達（null＝尚未載入＝fail-open，見
// useRegistrationWindow 對 null 的處理）。
describe('useActivityRegistrationTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicRegistrationTime.mockResolvedValue({
      data: { open_at: null, close_at: null },
    })
  })

  it('timeInfo 初始為 null（尚未載入）', () => {
    const { timeInfo } = useActivityRegistrationTime()
    expect(timeInfo.value).toBeNull()
  })

  it('loadTime 成功後 timeInfo 反映後端回傳的時間窗', async () => {
    getPublicRegistrationTime.mockResolvedValue({
      data: { open_at: '2026-04-01T09:00:00', close_at: '2026-04-30T17:00:00' },
    })

    const { timeInfo, loadTime } = useActivityRegistrationTime()
    await loadTime()

    expect(timeInfo.value).toEqual({
      open_at: '2026-04-01T09:00:00',
      close_at: '2026-04-30T17:00:00',
    })
  })

  it('loadTime 失敗時靜默吞下錯誤，timeInfo 維持 null（fail-open）', async () => {
    getPublicRegistrationTime.mockRejectedValue(new Error('network'))

    const { timeInfo, loadTime } = useActivityRegistrationTime()
    await loadTime()

    expect(timeInfo.value).toBeNull()
  })

  it('applyTime 直接餵資料（供 /public/bootstrap 的 registration_time 區塊使用）', () => {
    const { timeInfo, applyTime } = useActivityRegistrationTime()
    applyTime({ open_at: null, close_at: '2026-12-31T23:59:00' })
    expect(timeInfo.value).toEqual({ open_at: null, close_at: '2026-12-31T23:59:00' })
  })

  it('applyTime 收到空值時不覆寫既有 timeInfo', () => {
    const { timeInfo, applyTime } = useActivityRegistrationTime()
    applyTime({ open_at: null, close_at: '2026-12-31T23:59:00' })
    applyTime(null)
    expect(timeInfo.value).toEqual({ open_at: null, close_at: '2026-12-31T23:59:00' })
  })

  it('formatDate null → "—"', () => {
    const { formatDate } = useActivityRegistrationTime()
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('formatDate 正常日期格式化正確（取前 16 字元）', () => {
    const { formatDate } = useActivityRegistrationTime()
    expect(formatDate('2026-04-01T09:00:00')).toBe('2026-04-01 09:00')
    expect(formatDate('2026-12-31T23:59:59')).toBe('2026-12-31 23:59')
  })
})
