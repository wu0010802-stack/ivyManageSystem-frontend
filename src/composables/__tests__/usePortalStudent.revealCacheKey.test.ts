import { describe, it, expect, vi, beforeEach } from 'vitest'

// P3（latent PII / 稽核繞過）：揭露電話快取 key 為 `${target}:${guardianId ?? ''}`，
// parent/emergency 的 guardianId 為 null → key 不含 studentId。抽屜若不關閉直接換
// studentId，getRevealedPhone('parent') 會回前一位學生已揭露的電話，且 isRevealed 為
// true 跳過 reveal API（繞過後端 AuditLog）。修正：loadDetail 切換 studentId 時清快取。

const getPortalStudentDetailMock = vi.hoisted(() => vi.fn())
const revealPortalStudentPhoneMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/portal', () => ({
  getPortalStudentDetail: getPortalStudentDetailMock,
  revealPortalStudentPhone: revealPortalStudentPhoneMock,
}))

import { usePortalStudent } from '../usePortalStudent'

describe('usePortalStudent 揭露電話快取隔離（P3）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('切換 studentId 後不得回傳前一位學生已揭露的電話', async () => {
    getPortalStudentDetailMock.mockResolvedValue({ data: {} })
    revealPortalStudentPhoneMock.mockResolvedValue({ data: { phone: '0912-345-678' } })

    const s = usePortalStudent()

    await s.loadDetail(1)
    await s.revealPhone({ studentId: 1, target: 'parent' })
    expect(s.getRevealedPhone('parent')).toBe('0912-345-678') // 學生 1 已揭露

    // 抽屜不關、直接換到學生 2
    await s.loadDetail(2)

    // 不得露出學生 1 的電話（否則 PII 洩漏 + 下次點擊繞過 reveal 稽核）
    expect(s.getRevealedPhone('parent')).toBeNull()
  })

  it('切換 studentId 後再次揭露會重新呼叫 reveal API（不被舊快取節流）', async () => {
    getPortalStudentDetailMock.mockResolvedValue({ data: {} })
    revealPortalStudentPhoneMock.mockResolvedValue({ data: { phone: '0900-000-000' } })

    const s = usePortalStudent()
    await s.loadDetail(1)
    await s.revealPhone({ studentId: 1, target: 'parent' })
    expect(revealPortalStudentPhoneMock).toHaveBeenCalledTimes(1)

    await s.loadDetail(2)
    await s.revealPhone({ studentId: 2, target: 'parent' })
    // 新學生須重新打 reveal（寫 audit），不得因舊 key 快取被節流
    expect(revealPortalStudentPhoneMock).toHaveBeenCalledTimes(2)
  })
})
