/**
 * tests/unit/api/activityPublic.test.js
 *
 * 驗證 src/api/activityPublic.ts wrapper。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    patch: mockPatch,
  },
}))

import * as mod from '@/api/activityPublic'

describe('activityPublic api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
  })

  it('getPublicRegistrationTime GET /activity/public/registration-time', async () => {
    await mod.getPublicRegistrationTime()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/registration-time')
  })

  it('getPublicCourses GET /activity/public/courses', async () => {
    await mod.getPublicCourses()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/courses')
  })

  it('getPublicSupplies GET /activity/public/supplies', async () => {
    await mod.getPublicSupplies()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/supplies')
  })

  it('getPublicClasses GET /activity/public/classes', async () => {
    await mod.getPublicClasses()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/classes')
  })

  it('getPublicCoursesAvailability GET /activity/public/courses/availability', async () => {
    await mod.getPublicCoursesAvailability()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/courses/availability')
  })

  it('公開 bootstrap / availability 可指定歷史學期', async () => {
    const term = { school_year: 113, semester: 2 }
    await mod.getPublicBootstrap(term)
    await mod.getPublicCoursesAvailability(term)

    expect(mockGet).toHaveBeenCalledWith('/activity/public/bootstrap', { params: term })
    expect(mockGet).toHaveBeenCalledWith('/activity/public/courses/availability', { params: term })
  })

  it('publicRegister POST /activity/public/register', async () => {
    const payload = { name: '小明', courses: [1] }
    await mod.publicRegister(payload)
    expect(mockPost).toHaveBeenCalledWith('/activity/public/register', payload)
  })

  it('publicCreateInquiry POST /activity/public/inquiries', async () => {
    const payload = { question: '請問課程資訊' }
    await mod.publicCreateInquiry(payload)
    expect(mockPost).toHaveBeenCalledWith('/activity/public/inquiries', payload)
  })

  it('publicQueryRegistration POST /activity/public/query with name/birthday/parent_phone body', async () => {
    await mod.publicQueryRegistration('小明', '2018-01-01', '0912000000')
    // 隱私設計：查詢用 POST body 帶 PII，不放 query string
    expect(mockPost).toHaveBeenCalledWith('/activity/public/query', {
      name: '小明',
      birthday: '2018-01-01',
      parent_phone: '0912000000',
    })
  })

  it('publicQueryByToken POST /activity/public/query-by-token with token + parent_phone body', async () => {
    await mod.publicQueryByToken('abcd1234', '0912000000')
    expect(mockPost).toHaveBeenCalledWith('/activity/public/query-by-token', {
      token: 'abcd1234',
      parent_phone: '0912000000',
    })
  })

  it('publicUpdateRegistration POST /activity/public/update', async () => {
    const payload = { token: 'x', changes: { phone: '0912' } }
    await mod.publicUpdateRegistration(payload)
    expect(mockPost).toHaveBeenCalledWith('/activity/public/update', payload)
  })

  it('getPublicCourseVideos GET /activity/public/course-videos', async () => {
    await mod.getPublicCourseVideos()
    expect(mockGet).toHaveBeenCalledWith('/activity/public/course-videos')
  })

  it('publicConfirmPromotion POST 巢狀 registrations/:rid/courses/:cid/confirm-promotion', async () => {
    const payload = { note: 'ok' }
    await mod.publicConfirmPromotion(42, 99, payload)
    expect(mockPost).toHaveBeenCalledWith(
      '/activity/public/registrations/42/courses/99/confirm-promotion',
      payload,
    )
  })

  it('publicDeclinePromotion POST 巢狀 registrations/:rid/courses/:cid/decline-promotion', async () => {
    const payload = { reason: 'busy' }
    await mod.publicDeclinePromotion(42, 99, payload)
    expect(mockPost).toHaveBeenCalledWith(
      '/activity/public/registrations/42/courses/99/decline-promotion',
      payload,
    )
  })
})
