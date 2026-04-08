import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── API mocks ──────────────────────────────────────────────────────────────
const getPublicCourses = vi.fn()
const getPublicSupplies = vi.fn()
const getPublicClasses = vi.fn()
const getPublicCourseVideos = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  getPublicCourses: (...a) => getPublicCourses(...a),
  getPublicSupplies: (...a) => getPublicSupplies(...a),
  getPublicClasses: (...a) => getPublicClasses(...a),
  getPublicCourseVideos: (...a) => getPublicCourseVideos(...a),
}))

// ────────────────────────────────────────────────────────────────── //

import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'

describe('usePublicActivityOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicCourses.mockResolvedValue({ data: [] })
    getPublicSupplies.mockResolvedValue({ data: [] })
    getPublicClasses.mockResolvedValue({ data: [] })
    getPublicCourseVideos.mockResolvedValue({ data: {} })
  })

  it('loadOptions 並行呼叫 4 個 API', async () => {
    const { loadOptions } = usePublicActivityOptions()
    await loadOptions()

    expect(getPublicCourses).toHaveBeenCalledOnce()
    expect(getPublicSupplies).toHaveBeenCalledOnce()
    expect(getPublicClasses).toHaveBeenCalledOnce()
    expect(getPublicCourseVideos).toHaveBeenCalledOnce()
  })

  it('loadOptions 成功後更新各 ref', async () => {
    const mockCourses = [{ id: 1, name: '美術' }]
    const mockSupplies = [{ id: 1, name: '畫筆' }]
    const mockClasses = ['大班', '中班']
    const mockVideos = { 美術: 'https://example.com/art.mp4' }

    getPublicCourses.mockResolvedValue({ data: mockCourses })
    getPublicSupplies.mockResolvedValue({ data: mockSupplies })
    getPublicClasses.mockResolvedValue({ data: mockClasses })
    getPublicCourseVideos.mockResolvedValue({ data: mockVideos })

    const { courses, supplies, classes, videos, loadOptions } = usePublicActivityOptions()
    await loadOptions()

    expect(courses.value).toEqual(mockCourses)
    expect(supplies.value).toEqual(mockSupplies)
    expect(classes.value).toEqual(mockClasses)
    expect(videos.value).toEqual(mockVideos)
  })

  it('loadOptions 失敗時設定 error', async () => {
    const apiError = new Error('網路錯誤')
    getPublicCourses.mockRejectedValue(apiError)

    const { error, loadOptions } = usePublicActivityOptions()

    await expect(loadOptions()).rejects.toThrow('網路錯誤')
    expect(error.value).toBe(apiError)
  })

  it('loadOptions 期間 loading 為 true，完成後為 false', async () => {
    let capturedLoading = null
    getPublicCourses.mockImplementation(() => {
      capturedLoading = true
      return Promise.resolve({ data: [] })
    })

    const { loading, loadOptions } = usePublicActivityOptions()
    const promise = loadOptions()
    await promise

    expect(capturedLoading).toBe(true)
    expect(loading.value).toBe(false)
  })

  it('loadOptions 失敗後 loading 恢復為 false', async () => {
    getPublicCourses.mockRejectedValue(new Error('API 失敗'))

    const { loading, loadOptions } = usePublicActivityOptions()

    await expect(loadOptions()).rejects.toThrow()
    expect(loading.value).toBe(false)
  })
})
