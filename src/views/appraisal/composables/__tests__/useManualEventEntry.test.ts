// src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

vi.mock('@/api/appraisal', () => ({
  getManualEventCounts: vi.fn(),
  batchUpsertManualEventCounts: vi.fn(),
  listAppraisalCycles: vi.fn(),
  getAppraisalAllEmployeesStatus: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import {
  getManualEventCounts,
  listAppraisalCycles,
  getAppraisalAllEmployeesStatus,
} from '@/api/appraisal'
import { useManualEventEntry } from '@/views/appraisal/composables/useManualEventEntry'

const mockGetCounts = vi.mocked(getManualEventCounts)
const mockListCycles = vi.mocked(listAppraisalCycles)
const mockAllStatus = vi.mocked(getAppraisalAllEmployeesStatus)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useManualEventEntry getOriginal', () => {
  it('載入後 getOriginal 回原值，setCount 不改 original', async () => {
    mockGetCounts.mockResolvedValue({
      data: { entries: [{ participant_id: 10, item_code: 'OTHER', count: 3 }] },
    } as never)
    const { getOriginal, getCount, setCount } = useManualEventEntry(ref(1))
    await nextTick(); await Promise.resolve(); await nextTick()
    expect(getOriginal(10, 'OTHER')).toBe(3)
    setCount(10, 'OTHER', 9)
    expect(getCount(10, 'OTHER')).toBe(9)
    expect(getOriginal(10, 'OTHER')).toBe(3)
  })
})

describe('useManualEventEntry inheritFromPreviousCycle', () => {
  it('以 employee_id 對映上一週期數值帶入當期（標 dirty）', async () => {
    // 當期 cycle=2，空白
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle, getCount, dirtyEntries } = useManualEventEntry(ref(2))
    await nextTick(); await Promise.resolve(); await nextTick()

    // 週期列表：1 早於 2
    mockListCycles.mockResolvedValue({
      data: [
        { id: 1, start_date: '2025-02-01' },
        { id: 2, start_date: '2025-08-01' },
      ],
    } as never)
    // 上一週期(1) participants：prevPid 101 → employee 555
    mockAllStatus.mockResolvedValue({
      data: { participants: [{ participant_id: 101, employee_id: 555 }] },
    } as never)
    // 上一週期手填：prevPid 101 OTHER=7
    mockGetCounts.mockResolvedValueOnce({
      data: { entries: [{ participant_id: 101, item_code: 'OTHER', count: 7 }] },
    } as never)

    // 當期 participants：employee 555 → 當期 participant 202
    const res = await inheritFromPreviousCycle([{ participant_id: 202, employee_id: 555 }])

    expect(res).toEqual({ applied: 1, skipped: 0 })
    expect(getCount(202, 'OTHER')).toBe(7)
    expect(dirtyEntries.value).toContainEqual({ participant_id: 202, item_code: 'OTHER', count: 7 })
  })

  it('無上一週期回 null', async () => {
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle } = useManualEventEntry(ref(1))
    await nextTick(); await Promise.resolve(); await nextTick()
    mockListCycles.mockResolvedValue({ data: [{ id: 1, start_date: '2025-02-01' }] } as never)
    const res = await inheritFromPreviousCycle([{ participant_id: 1, employee_id: 1 }])
    expect(res).toBeNull()
  })

  it('上一週期 employee 在當期不存在 → 略過計入 skipped', async () => {
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle, dirtyEntries } = useManualEventEntry(ref(2))
    await nextTick(); await Promise.resolve(); await nextTick()
    mockListCycles.mockResolvedValue({
      data: [{ id: 1, start_date: '2025-02-01' }, { id: 2, start_date: '2025-08-01' }],
    } as never)
    mockAllStatus.mockResolvedValue({
      data: { participants: [{ participant_id: 101, employee_id: 999 }] },
    } as never)
    mockGetCounts.mockResolvedValueOnce({
      data: { entries: [{ participant_id: 101, item_code: 'OTHER', count: 7 }] },
    } as never)
    const res = await inheritFromPreviousCycle([{ participant_id: 202, employee_id: 555 }])
    expect(res).toEqual({ applied: 0, skipped: 1 })
    expect(dirtyEntries.value).toHaveLength(0)
  })
})
