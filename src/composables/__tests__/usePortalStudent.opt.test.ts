import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/portal', () => ({
  getPortalStudentDetail: vi.fn(),
  revealPortalStudentPhone: vi.fn(),
}))

import { getPortalStudentDetail } from '@/api/portal'
import { usePortalStudent } from '@/composables/usePortalStudent'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('usePortalStudent loadDetail 快速切換學生競態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('學生 A(慢) 回應晚於學生 B(快) 時，detail 最終仍為 B，不被過期的 A 覆寫', async () => {
    const slowA = deferred<{ data: { student_id: number; name: string } }>()
    const fastB = deferred<{ data: { student_id: number; name: string } }>()

    const mockDetail = vi.mocked(getPortalStudentDetail)
    mockDetail
      .mockImplementationOnce(() => slowA.promise as never)
      .mockImplementationOnce(() => fastB.promise as never)

    const { detail, loading, loadDetail } = usePortalStudent()

    // 先切到 A（慢），再切到 B（快）
    const pA = loadDetail(1)
    const pB = loadDetail(2)

    // B 先回（使用者最後選的學生）
    fastB.resolve({ data: { student_id: 2, name: '學生B' } })
    await pB

    // A 後回（過期回應，應被 seq guard 丟棄）
    slowA.resolve({ data: { student_id: 1, name: '學生A' } })
    await pA

    expect(detail.value).toEqual({ student_id: 2, name: '學生B' })
    // loading 亦不應被過期的 A 重置流程干擾（B 已將其設回 false）
    expect(loading.value).toBe(false)
  })

  it('無競態時單次 loadDetail 正常寫入 detail', async () => {
    const mockDetail = vi.mocked(getPortalStudentDetail)
    mockDetail.mockResolvedValueOnce({ data: { student_id: 7, name: '單一學生' } } as never)

    const { detail, loading, error, loadDetail } = usePortalStudent()
    await loadDetail(7)

    expect(detail.value).toEqual({ student_id: 7, name: '單一學生' })
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('最新一次載入失敗時，error 寫入且 detail 清空（非過期錯誤才生效）', async () => {
    const mockDetail = vi.mocked(getPortalStudentDetail)
    const boom = new Error('load failed')
    mockDetail.mockRejectedValueOnce(boom as never)

    const { detail, error, loadDetail } = usePortalStudent()
    await expect(loadDetail(9)).rejects.toThrow('load failed')

    expect(error.value).toBe(boom)
    expect(detail.value).toBeNull()
  })
})
