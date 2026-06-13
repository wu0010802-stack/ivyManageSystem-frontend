import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/fees', () => ({
  getFeeRecords: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getFeeAdjustments: vi.fn().mockResolvedValue({ items: [] }),
  getFeePeriods: vi.fn().mockResolvedValue(['114-2', '114-1']),
  payFeeRecord: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import { getFeeRecords } from '@/api/fees'
import FeesTab from '../FeesTab.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

// 後端 api/fees/records.py 的 page_size 上限為 Query(50, ge=1, le=200)；
// 超過會直接 422，整個學費 tab 失效（2026-06-13 用戶回報，曾送 500）。
const BACKEND_PAGE_SIZE_CAP = 200

function mountTab() {
  return mount(FeesTab, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        RefundSuggestModal: true,
        AdjustmentEditDialog: true,
      },
    },
    props: { studentId: 5, studentName: '小明', active: true },
  })
}

describe('FeesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asMock(getFeeRecords).mockResolvedValue({ items: [], total: 0 })
  })

  it('查詢學費紀錄的 page_size 不得超過後端上限（le=200，超過即 422）', async () => {
    mountTab()
    await flushPromises()

    expect(getFeeRecords).toHaveBeenCalled()
    const params = asMock(getFeeRecords).mock.calls[0][0] as Record<string, unknown>
    expect(params.student_id).toBe(5)
    expect(params.page_size).toBeLessThanOrEqual(BACKEND_PAGE_SIZE_CAP)
  })
})
