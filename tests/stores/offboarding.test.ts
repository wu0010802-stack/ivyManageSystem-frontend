/**
 * tests/stores/offboarding.test.ts
 *
 * 驗證 useOffboardingStore 的核心行為：
 *   - fetchDetail cache-aware（同 id 不重打 API）
 *   - refreshDetail bypass cache（強制重打 API）
 *   - process 成功後清 cache → 再 fetchDetail 重新 call api
 *   - preview 不寫 cache
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/offboarding', () => ({
  getOffboardingDetail: vi.fn(),
  previewOffboarding: vi.fn(),
  processOffboarding: vi.fn(),
}))

import * as offboardingApi from '@/api/offboarding'
import { useOffboardingStore } from '@/stores/offboarding'

const mockDetail = { employee_id: 1, status: 'pending', last_working_date: '2026-06-30' }
const mockPreviewResult = { preview: { final_salary: 50000 } }
const mockProcessResult = { success: true, employee_id: 1 }

describe('useOffboardingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchDetail cache-aware：同 id 第二次不重打 API', async () => {
    ;(offboardingApi.getOffboardingDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockDetail,
    })

    const store = useOffboardingStore()

    // 第一次打 API
    const result1 = await store.fetchDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(1)
    expect(result1).toEqual(mockDetail)

    // 第二次從 cache 回傳，不重打
    const result2 = await store.fetchDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(1)
    expect(result2).toEqual(mockDetail)

    // getDetail getter 也應該回傳快取值
    expect(store.getDetail(1)).toEqual(mockDetail)
  })

  it('refreshDetail bypass cache：每次都重打 API', async () => {
    const detailV1 = { ...mockDetail, status: 'pending' }
    const detailV2 = { ...mockDetail, status: 'completed' }

    ;(offboardingApi.getOffboardingDetail as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: detailV1 })
      .mockResolvedValueOnce({ data: detailV2 })

    const store = useOffboardingStore()

    // 先建立快取
    await store.fetchDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(1)

    // refreshDetail 強制繞過快取
    const result = await store.refreshDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(2)
    expect(result).toEqual(detailV2)
    expect(store.getDetail(1)).toEqual(detailV2)
  })

  it('process 成功後清 cache → 再 fetchDetail 重新 call api', async () => {
    ;(offboardingApi.getOffboardingDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockDetail,
    })
    ;(offboardingApi.processOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProcessResult,
    })

    const store = useOffboardingStore()
    const payload = { last_working_date: '2026-06-30', reason: '個人因素' }

    // 先建立快取
    await store.fetchDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(1)
    expect(store.getDetail(1)).toEqual(mockDetail)

    // 執行 process
    const processResult = await store.process(1, payload)
    expect(offboardingApi.processOffboarding).toHaveBeenCalledWith(1, payload)
    expect(processResult).toEqual(mockProcessResult)

    // cache 應已清除
    expect(store.getDetail(1)).toBeUndefined()

    // 再次 fetchDetail 應重打 API
    await store.fetchDetail(1)
    expect(offboardingApi.getOffboardingDetail).toHaveBeenCalledTimes(2)
  })

  it('preview 不寫 cache', async () => {
    ;(offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockPreviewResult,
    })

    const store = useOffboardingStore()
    const payload = { last_working_date: '2026-06-30', reason: '個人因素' }

    const result = await store.preview(1, payload)

    expect(offboardingApi.previewOffboarding).toHaveBeenCalledWith(1, payload)
    expect(result).toEqual(mockPreviewResult)

    // cache 不應被寫入
    expect(store.getDetail(1)).toBeUndefined()
  })
})
