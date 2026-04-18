/**
 * tests/unit/api/activity.test.js
 *
 * 確認 api wrapper 在 forceRefund 參數下正確傳遞 query：
 * 這是前後端契約的薄殼，測試核心是「有 forceRefund 才帶 ?force_refund=true」，
 * 避免未來有人改 wrapper 時漏掉 query 導致退課/刪報名 409 無法被解除。
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

import { withdrawCourse, deleteRegistration } from '@/api/activity'

describe('activity api — forceRefund 契約', () => {
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

  it('withdrawCourse forceRefund=true 時帶 force_refund=true', async () => {
    await withdrawCourse(1, 2, { forceRefund: true })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/1/courses/2',
      { params: { force_refund: true } }
    )
  })

  it('withdrawCourse forceRefund=false 時不帶 force_refund', async () => {
    await withdrawCourse(1, 2, { forceRefund: false })
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

  it('deleteRegistration forceRefund=true 時帶 force_refund=true', async () => {
    await deleteRegistration(99, { forceRefund: true })
    expect(mockDelete).toHaveBeenCalledWith(
      '/activity/registrations/99',
      { params: { force_refund: true } }
    )
  })
})
