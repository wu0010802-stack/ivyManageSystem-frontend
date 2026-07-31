/**
 * tests/unit/api/activity.test.js
 *
 * 確認 api wrapper 在 forceRefund / refundReason 參數下正確傳遞 query：
 * 後端要求自動沖帳（force_refund=true）時必填 refund_reason（≥5 字），
 * 這是前後端契約的薄殼測試，避免未來改 wrapper 漏掉 query 導致 409 解不開。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockDelete, mockGet, mockPost } = vi.hoisted(() => ({
  mockDelete: vi.fn(() => Promise.resolve({ data: {} })),
  mockGet: vi.fn(() => Promise.resolve({ data: {} })),
  mockPost: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: vi.fn(),
    delete: mockDelete,
  },
}))

import {
  withdrawCourse,
  rejectRegistration,
  removeRegistrationSupply,
  getActivityStats,
  getActivityStatsSummary,
  getActivityStatsCharts,
} from '@/api/activity'

describe('activity api — forceRefund / refundReason 契約', () => {
  beforeEach(() => {
    mockDelete.mockClear()
    mockPost.mockClear()
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

  // deleteRegistration 已移除（2026-07-31 拒絕擴大涵蓋）：唯一移除入口改為
  // rejectRegistration，force_refund / refund_reason 走 POST body 而非 query。
  it('rejectRegistration 無 opts 時 body 帶 force_refund=false', async () => {
    await rejectRegistration(99, '資料不符')
    expect(mockPost).toHaveBeenCalledWith(
      '/activity/registrations/99/reject',
      { reason: '資料不符', force_refund: false, refund_reason: undefined }
    )
  })

  it('rejectRegistration forceRefund + refundReason 時 body 兩欄都帶上', async () => {
    await rejectRegistration(99, '資料不符', { forceRefund: true, refundReason: '報名整筆作廢沖帳' })
    expect(mockPost).toHaveBeenCalledWith(
      '/activity/registrations/99/reject',
      { reason: '資料不符', force_refund: true, refund_reason: '報名整筆作廢沖帳' }
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

describe('activity api — 統計學期參數契約（同 dashboard-table 帶法）', () => {
  beforeEach(() => {
    mockGet.mockClear()
  })

  it('getActivityStatsSummary 不帶參數時 params 為空物件（後端套當前學期）', async () => {
    await getActivityStatsSummary()
    expect(mockGet).toHaveBeenCalledWith('/activity/stats-summary', { params: {} })
  })

  it('getActivityStatsSummary 帶 school_year/semester query', async () => {
    await getActivityStatsSummary({ school_year: 114, semester: 2 })
    expect(mockGet).toHaveBeenCalledWith(
      '/activity/stats-summary',
      { params: { school_year: 114, semester: 2 } },
    )
  })

  it('getActivityStatsCharts 帶 school_year/semester query', async () => {
    await getActivityStatsCharts({ school_year: 114, semester: 1 })
    expect(mockGet).toHaveBeenCalledWith(
      '/activity/stats-charts',
      { params: { school_year: 114, semester: 1 } },
    )
  })

  it('getActivityStats 不帶參數時 params 為空物件（後端套當前學期）', async () => {
    await getActivityStats()
    expect(mockGet).toHaveBeenCalledWith('/activity/stats', { params: {} })
  })

  it('getActivityStats 帶 school_year/semester query（出席率統計來自此聚合回應）', async () => {
    await getActivityStats({ school_year: 114, semester: 1 })
    expect(mockGet).toHaveBeenCalledWith(
      '/activity/stats',
      { params: { school_year: 114, semester: 1 } },
    )
  })
})
