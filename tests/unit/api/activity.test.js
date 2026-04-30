/**
 * tests/unit/api/activity.test.js
 *
 * 確認 api wrapper 在 forceRefund / refundReason 參數下正確傳遞 query：
 * 後端要求自動沖帳（force_refund=true）時必填 refund_reason（≥5 字），
 * 這是前後端契約的薄殼測試，避免未來改 wrapper 漏掉 query 導致 409 解不開。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockDelete } = vi.hoisted(() => ({
  mockDelete: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: mockDelete,
  },
}))

import {
  withdrawCourse,
  deleteRegistration,
  removeRegistrationSupply,
} from '@/api/activity'

describe('activity api — forceRefund / refundReason 契約', () => {
  beforeEach(() => {
    mockDelete.mockClear()
  })

  it('withdrawCourse 無 options 時 params 為空物件', async () => {
    await withdrawCourse(1, 2)
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/1/courses/2',
      { params: {} }
    )
  })

  it('withdrawCourse forceRefund=true 但無 refundReason 時只帶 force_refund=true', async () => {
    await withdrawCourse(1, 2, { forceRefund: true })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/1/courses/2',
      { params: { force_refund: true } }
    )
  })

  it('withdrawCourse forceRefund=true + refundReason 時兩個 query 都帶上', async () => {
    await withdrawCourse(1, 2, { forceRefund: true, refundReason: '家長要求退課沖帳' })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/1/courses/2',
      { params: { force_refund: true, refund_reason: '家長要求退課沖帳' } }
    )
  })

  it('withdrawCourse forceRefund=false 即使有 refundReason 也不帶 query', async () => {
    await withdrawCourse(1, 2, { forceRefund: false, refundReason: '不應送出' })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/1/courses/2',
      { params: {} }
    )
  })

  it('deleteRegistration 無 options 時 params 為空物件', async () => {
    await deleteRegistration(99)
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/99',
      { params: {} }
    )
  })

  it('deleteRegistration forceRefund=true 但無 refundReason 時只帶 force_refund=true', async () => {
    await deleteRegistration(99, { forceRefund: true })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/99',
      { params: { force_refund: true } }
    )
  })

  it('deleteRegistration forceRefund=true + refundReason 時兩個 query 都帶上', async () => {
    await deleteRegistration(99, { forceRefund: true, refundReason: '報名整筆作廢沖帳' })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/99',
      { params: { force_refund: true, refund_reason: '報名整筆作廢沖帳' } }
    )
  })

  it('removeRegistrationSupply 無 options 時 params 為空物件', async () => {
    await removeRegistrationSupply(7, 88)
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/7/supplies/88',
      { params: {} }
    )
  })

  it('removeRegistrationSupply forceRefund=true + refundReason 時兩個 query 都帶上', async () => {
    await removeRegistrationSupply(7, 88, {
      forceRefund: true,
      refundReason: '用品移除超繳沖帳',
    })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/7/supplies/88',
      { params: { force_refund: true, refund_reason: '用品移除超繳沖帳' } }
    )
  })
})
