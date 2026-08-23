/**
 * FeeRecordsTab 批次登記繳費 + 匯出 Excel（2026-08-23）。
 *
 * 消除一班 30 人逐筆開 30 次對話框的痛：多選勾選未繳清列 → 批次登記繳費；
 * 匯出帶目前 學期/班級/狀態 篩選值（對映 GET /api/exports/fees query）。
 * 已繳清列不可勾選；批次對話框 paid 後重新載入清單並清空選取。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getFeeRecords = vi.fn()
const getFeeSummary = vi.fn()
const payFeeRecord = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeRecords: (...args: unknown[]) => getFeeRecords(...args),
  getFeeSummary: (...args: unknown[]) => getFeeSummary(...args),
  payFeeRecord: (...args: unknown[]) => payFeeRecord(...args),
}))

const downloadFile = vi.fn()
vi.mock('@/utils/download', () => ({
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

const PAID_ROW = {
  id: 1,
  student_name: '已繳生',
  classroom_name: '向日葵',
  fee_item_name: '學費',
  period: '115-1',
  amount_due: 1000,
  amount_paid: 1000,
  status: 'paid',
}
const UNPAID_ROW = {
  id: 2,
  student_name: '未繳生',
  classroom_name: '向日葵',
  fee_item_name: '學費',
  period: '115-1',
  amount_due: 1000,
  amount_paid: 0,
  status: 'unpaid',
}
const PARTIAL_ROW = { ...UNPAID_ROW, id: 3, student_name: '部分繳生', amount_paid: 400, status: 'partial' }

type Row = typeof PAID_ROW

interface TabVm {
  feeRecords: Row[]
  rowSelectable: (row: Row) => boolean
  selectedRows: Row[]
  onSelectionChange: (rows: Row[]) => void
  fetchRecords: () => Promise<void>
  batchPayDialogVisible: boolean
  openBatchPayDialog: () => void
  onBatchPaid: () => void
  exportRecords: () => Promise<void>
  exporting: boolean
  recordFilter: { period: string; classroom_name: string; status: string; student_name: string }
}

const mountTab = () =>
  shallowMount(FeeRecordsTab, {
    props: { classrooms: [], periodOptions: [] },
    global: {
      stubs: {
        teleport: true,
        'el-table-column': { template: '<span />' },
        // 批次登記繳費／匯出按鈕落在 AdminListToolbar 的 #actions slot；預設 shallow
        // 自動 stub 不轉譯具名 slot，需明確 unstub 才能斷言按鈕存在（比照 uiux.test.ts unstubToolbar）。
        AdminListToolbar: false,
      },
    },
  })

const vmOf = (w: ReturnType<typeof mountTab>) => w.vm as unknown as TabVm

beforeEach(() => {
  vi.clearAllMocks()
  getFeeRecords.mockResolvedValue({ items: [PAID_ROW, UNPAID_ROW, PARTIAL_ROW], total: 3 })
  getFeeSummary.mockResolvedValue({})
  downloadFile.mockResolvedValue(true)
})

describe('批次選取', () => {
  it('已繳清列不可勾選；未繳/部分繳費列可勾選', () => {
    const w = mountTab()
    const vm = vmOf(w)
    expect(vm.rowSelectable(PAID_ROW)).toBe(false)
    expect(vm.rowSelectable(UNPAID_ROW)).toBe(true)
    expect(vm.rowSelectable(PARTIAL_ROW)).toBe(true)
  })

  it('未選取時「批次登記繳費」按鈕顯示 0 且點擊不開啟對話框', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    const btn = w.find('[data-test="fee-batch-pay-open"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('0')

    vm.openBatchPayDialog()
    await nextTick()
    expect(vm.batchPayDialogVisible).toBe(false)
  })

  it('勾選後按鈕顯示選取數，點擊開啟對話框並帶入選取列', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    vm.onSelectionChange([UNPAID_ROW, PARTIAL_ROW])
    await nextTick()

    const btn = w.find('[data-test="fee-batch-pay-open"]')
    expect(btn.text()).toContain('2')

    vm.openBatchPayDialog()
    await nextTick()
    expect(vm.batchPayDialogVisible).toBe(true)

    const dialog = w.findComponent({ name: 'BatchPayDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('records')).toEqual([UNPAID_ROW, PARTIAL_ROW])
  })
})

describe('批次對話框 paid 後', () => {
  it('重新載入清單並清空選取', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    await vm.fetchRecords()
    await flushPromises()

    vm.onSelectionChange([UNPAID_ROW])
    vm.openBatchPayDialog()
    await nextTick()

    getFeeRecords.mockClear()
    getFeeSummary.mockClear()

    vm.onBatchPaid()
    await flushPromises()

    expect(getFeeRecords).toHaveBeenCalledTimes(1)
    expect(getFeeSummary).toHaveBeenCalledTimes(1)
    expect(vm.selectedRows).toEqual([])
  })
})

describe('匯出 Excel', () => {
  it('無篩選時呼叫 downloadFile 不帶 params', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    await vm.exportRecords()
    await flushPromises()

    expect(downloadFile).toHaveBeenCalledTimes(1)
    expect(downloadFile).toHaveBeenCalledWith('/exports/fees', '學費繳費記錄.xlsx', undefined)
  })

  it('依目前 學期/班級/狀態 篩選帶對應 query 參數', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    vm.recordFilter.period = '115-1'
    vm.recordFilter.classroom_name = '向日葵'
    vm.recordFilter.status = 'unpaid'
    await vm.exportRecords()
    await flushPromises()

    expect(downloadFile).toHaveBeenCalledWith('/exports/fees', '學費繳費記錄.xlsx', {
      period: '115-1',
      classroom_name: '向日葵',
      status: 'unpaid',
    })
  })
})
