import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

/**
 * BONUS-F7：才藝老師批次匯入該月已有明細時，後端回 409
 * （detail.code=ART_IMPORT_MONTH_HAS_ENTRIES），對話框須讓使用者選
 * 「覆寫整月」（confirm）或「追加」（cancel），Esc/X（close）視為放棄。
 */

const { mockBatchImport, mockList, mockConfirm, mockMsg } = vi.hoisted(() => ({
  mockBatchImport: vi.fn(),
  mockList: vi.fn(),
  mockConfirm: vi.fn(),
  mockMsg: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/artTeacherPayroll', async (importActual) => {
  const actual = await importActual<typeof import('@/api/artTeacherPayroll')>()
  return {
    ...actual,
    listArtPayroll: mockList,
    createArtPayroll: vi.fn(),
    updateArtPayroll: vi.fn(),
    deleteArtPayroll: vi.fn(),
    batchImportArtPayroll: mockBatchImport,
  }
})

vi.mock('element-plus', () => ({
  ElMessage: mockMsg,
  ElMessageBox: { confirm: mockConfirm },
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))

import ArtTeacherPayrollPanel from '@/views/salary/ArtTeacherPayrollPanel.vue'

const OK = { data: { total: 1, imported: 1, skipped: 0, errors: [] } }
const conflict = (count: number) =>
  Object.assign(new Error('conflict'), {
    response: {
      status: 409,
      data: { detail: { code: 'ART_IMPORT_MONTH_HAS_ENTRIES', existing_count: count, message: '已有明細' } },
    },
  })

type PanelVm = { importFile: File | null; handleImport: () => Promise<void> }

const mountAndImport = async () => {
  const wrapper = shallowMount(ArtTeacherPayrollPanel, {
    global: {
      // 表格欄位 #default="{ row }" 沒有 el-table 提供 row，與本檔要驗的匯入流程無關
      stubs: { 'el-table-column': { template: '<td />' } },
      directives: { loading: {} },
    },
  })
  await flushPromises()
  const vm = wrapper.vm as unknown as PanelVm
  vm.importFile = new File(['x'], 'in.xlsx')
  await vm.handleImport()
  await flushPromises()
  return wrapper
}

describe('ArtTeacherPayrollPanel 批次匯入重複確認', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ data: { items: [] } })
  })

  it('空月份直接匯入，不跳確認', async () => {
    mockBatchImport.mockResolvedValueOnce(OK)
    await mountAndImport()
    expect(mockBatchImport).toHaveBeenCalledTimes(1)
    expect(mockBatchImport.mock.calls[0].slice(3)).toEqual([false, false])
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('409 後選「覆寫整月」→ 以 replace_existing 重送', async () => {
    mockBatchImport.mockRejectedValueOnce(conflict(5)).mockResolvedValueOnce(OK)
    mockConfirm.mockResolvedValueOnce('confirm')
    await mountAndImport()
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(String(mockConfirm.mock.calls[0][0])).toContain('5 筆')
    expect(mockConfirm.mock.calls[0][2]).toMatchObject({ distinguishCancelAndClose: true })
    expect(mockBatchImport).toHaveBeenCalledTimes(2)
    expect(mockBatchImport.mock.calls[1].slice(3)).toEqual([true, false])
    expect(mockMsg.success).toHaveBeenCalled()
  })

  it('409 後選「追加」→ 以 append 重送', async () => {
    mockBatchImport.mockRejectedValueOnce(conflict(2)).mockResolvedValueOnce(OK)
    mockConfirm.mockRejectedValueOnce('cancel')
    await mountAndImport()
    expect(mockBatchImport).toHaveBeenCalledTimes(2)
    expect(mockBatchImport.mock.calls[1].slice(3)).toEqual([false, true])
  })

  it('409 後按 Esc/X（close）→ 放棄，不重送也不報錯', async () => {
    mockBatchImport.mockRejectedValueOnce(conflict(2))
    mockConfirm.mockRejectedValueOnce('close')
    await mountAndImport()
    expect(mockBatchImport).toHaveBeenCalledTimes(1)
    expect(mockMsg.error).not.toHaveBeenCalled()
    expect(mockMsg.info).toHaveBeenCalledWith('已取消匯入')
  })

  it('其他錯誤（非該 code 的 409）照常報錯，不跳確認', async () => {
    mockBatchImport.mockRejectedValueOnce(
      Object.assign(new Error('x'), { response: { status: 409, data: { detail: '已封存' } } }),
    )
    await mountAndImport()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockMsg.error).toHaveBeenCalled()
  })
})
