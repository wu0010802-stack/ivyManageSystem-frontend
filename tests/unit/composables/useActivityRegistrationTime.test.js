import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── API mocks ──────────────────────────────────────────────────────────────
const getPublicRegistrationTime = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  getPublicRegistrationTime: (...a) => getPublicRegistrationTime(...a),
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityRegistrationTime } from '@/composables/useActivityRegistrationTime'

describe('useActivityRegistrationTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicRegistrationTime.mockResolvedValue({
      data: { is_open: false, open_at: null, close_at: null },
    })
  })

  it('registrationOpen 反映 is_open=true', async () => {
    getPublicRegistrationTime.mockResolvedValue({
      data: { is_open: true, open_at: '2026-04-01T09:00:00', close_at: '2026-04-30T17:00:00' },
    })

    const { registrationOpen, loadTime } = useActivityRegistrationTime()
    await loadTime()

    expect(registrationOpen.value).toBe(true)
  })

  it('registrationOpen 反映 is_open=false', async () => {
    getPublicRegistrationTime.mockResolvedValue({
      data: { is_open: false, open_at: null, close_at: null },
    })

    const { registrationOpen, loadTime } = useActivityRegistrationTime()
    await loadTime()

    expect(registrationOpen.value).toBe(false)
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
