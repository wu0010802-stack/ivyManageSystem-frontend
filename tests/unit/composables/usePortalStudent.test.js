import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/portal', () => ({
  getPortalStudentDetail: vi.fn(),
  revealPortalStudentPhone: vi.fn(),
}))

import {
  getPortalStudentDetail,
  revealPortalStudentPhone,
} from '@/api/portal'
import { usePortalStudent } from '@/composables/usePortalStudent'

describe('usePortalStudent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getPortalStudentDetail.mockReset()
    revealPortalStudentPhone.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loadDetail 成功時寫入 detail', async () => {
    getPortalStudentDetail.mockResolvedValue({
      data: { student: { id: 1, name: '小明' } },
    })

    const ps = usePortalStudent()
    await ps.loadDetail(1)

    expect(getPortalStudentDetail).toHaveBeenCalledWith(1)
    expect(ps.detail.value.student.name).toBe('小明')
    expect(ps.loading.value).toBe(false)
  })

  it('loadDetail 失敗時 detail = null 且 throw', async () => {
    const err = new Error('boom')
    getPortalStudentDetail.mockRejectedValue(err)

    const ps = usePortalStudent()
    await expect(ps.loadDetail(1)).rejects.toThrow('boom')
    expect(ps.detail.value).toBe(null)
    expect(ps.error.value).toBe(err)
  })

  it('revealPhone 成功時 Map 寫入 phone', async () => {
    revealPortalStudentPhone.mockResolvedValue({
      data: { phone: '0912345678' },
    })

    const ps = usePortalStudent()
    const phone = await ps.revealPhone({
      studentId: 5,
      target: 'parent',
    })

    expect(revealPortalStudentPhone).toHaveBeenCalledWith(5, {
      target: 'parent',
      guardian_id: null,
    })
    expect(phone).toBe('0912345678')
    expect(ps.getRevealedPhone('parent')).toBe('0912345678')
  })

  it('revealPhone 對不同 guardian 各自存', async () => {
    revealPortalStudentPhone
      .mockResolvedValueOnce({ data: { phone: '0911111111' } })
      .mockResolvedValueOnce({ data: { phone: '0922222222' } })

    const ps = usePortalStudent()
    await ps.revealPhone({ studentId: 1, target: 'guardian', guardianId: 10 })
    await ps.revealPhone({ studentId: 1, target: 'guardian', guardianId: 11 })

    expect(ps.getRevealedPhone('guardian', 10)).toBe('0911111111')
    expect(ps.getRevealedPhone('guardian', 11)).toBe('0922222222')
    expect(revealPortalStudentPhone).toHaveBeenCalledTimes(2)
  })

  it('5 分鐘節流：同 key 第二次不打 API', async () => {
    revealPortalStudentPhone.mockResolvedValue({
      data: { phone: '0912345678' },
    })

    const ps = usePortalStudent()
    await ps.revealPhone({ studentId: 1, target: 'parent' })
    expect(revealPortalStudentPhone).toHaveBeenCalledTimes(1)

    // 立即再呼叫 → 沿用快取，不打 API
    await ps.revealPhone({ studentId: 1, target: 'parent' })
    expect(revealPortalStudentPhone).toHaveBeenCalledTimes(1)

    // 4 分鐘後仍不打
    vi.advanceTimersByTime(4 * 60 * 1000)
    await ps.revealPhone({ studentId: 1, target: 'parent' })
    expect(revealPortalStudentPhone).toHaveBeenCalledTimes(1)

    // 6 分鐘後過期 → 再打一次
    vi.advanceTimersByTime(2 * 60 * 1000)
    await ps.revealPhone({ studentId: 1, target: 'parent' })
    expect(revealPortalStudentPhone).toHaveBeenCalledTimes(2)
  })

  it('reset 清空 detail 與 revealedPhones', async () => {
    getPortalStudentDetail.mockResolvedValue({ data: { student: { id: 1 } } })
    revealPortalStudentPhone.mockResolvedValue({ data: { phone: '0912345678' } })

    const ps = usePortalStudent()
    await ps.loadDetail(1)
    await ps.revealPhone({ studentId: 1, target: 'parent' })

    expect(ps.detail.value).not.toBe(null)
    expect(ps.getRevealedPhone('parent')).toBe('0912345678')

    ps.reset()
    expect(ps.detail.value).toBe(null)
    expect(ps.getRevealedPhone('parent')).toBe(null)
  })

  it('isRevealing 在請求進行中為 true', async () => {
    let resolveFn
    revealPortalStudentPhone.mockReturnValue(
      new Promise((r) => {
        resolveFn = r
      }),
    )

    const ps = usePortalStudent()
    const p = ps.revealPhone({ studentId: 1, target: 'parent' })
    expect(ps.isRevealing.value).toBe(true)

    resolveFn({ data: { phone: '0912345678' } })
    await p
    expect(ps.isRevealing.value).toBe(false)
  })
})
