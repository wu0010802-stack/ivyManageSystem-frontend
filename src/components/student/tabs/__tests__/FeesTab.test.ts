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

  // 學生檔案「費用」分頁自 2026-08-28 起為唯讀：繳費／退費一律回學費管理操作，
  // 避免此處寫入的現金繞過每日交接與月結（見 workspace CLAUDE.md 收款雙路徑）。
  it('即使有 FEES_WRITE，應收項目也不得出現繳費／退費按鈕', async () => {
    asMock(getFeeRecords).mockResolvedValue({
      items: [
        {
          id: 1,
          fee_type: 'registration',
          fee_item_name: '註冊費',
          period: '115-1',
          amount_due: 17000,
          amount_paid: 17000,
          status: 'paid',
        },
        {
          id: 2,
          fee_type: 'monthly',
          fee_item_name: '月費',
          period: '115-1',
          amount_due: 11000,
          amount_paid: 0,
          status: 'unpaid',
        },
      ],
      total: 2,
    })
    const wrapper = mountTab()
    await flushPromises()

    const buttonTexts = wrapper.findAll('button').map((b) => b.text())
    expect(buttonTexts.some((t) => t.includes('繳費'))).toBe(false)
    expect(buttonTexts.some((t) => t.includes('退費'))).toBe(false)
    wrapper.unmount()
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
