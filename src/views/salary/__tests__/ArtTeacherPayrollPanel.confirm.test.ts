import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: confirmMock },
}))
const api = vi.hoisted(() => ({
  listArtPayroll: vi.fn(),
  createArtPayroll: vi.fn(),
  updateArtPayroll: vi.fn(),
  deleteArtPayroll: vi.fn(),
  batchImportArtPayroll: vi.fn(),
}))
vi.mock('@/api/artTeacherPayroll', () => api)
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))

import ArtTeacherPayrollPanel from '../ArtTeacherPayrollPanel.vue'

const ROWS = [
  { id: 1, employee_id: 7, employee_name: '林老師', subject: '美術', hours: 4, hourly_rate: 500, base_amount: 2000, excess_amount: 0, activity_bonus: 0, total_amount: 2000 },
  { id: 2, employee_id: 8, employee_name: '陳老師', subject: '舞蹈', hours: 2, hourly_rate: 600, base_amount: 1200, excess_amount: 0, activity_bonus: 0, total_amount: 1200 },
]

interface VM {
  importFile: File | null
  importReplaceExisting: boolean
  handleImport: () => Promise<void>
  form: { employee_id: number | null; subject: string }
  handleSave: () => Promise<void>
}

const mountPanel = () =>
  mount(ArtTeacherPayrollPanel, {
    shallow: true,
    global: { directives: { loading: () => {} }, stubs: { 'el-table-column': { template: '<div />' } } },
  })

describe('ArtTeacherPayrollPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listArtPayroll.mockResolvedValue({ data: { items: ROWS } })
    api.batchImportArtPayroll.mockResolvedValue({ data: { total: 1, imported: 1, skipped: 0, errors: [] } })
  })

  it('整月覆寫：先確認並寫出會刪除的筆數、老師數與金額；取消不匯入', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.importFile = new File(['x'], 'a.xlsx')
    vm.importReplaceExisting = true
    confirmMock.mockRejectedValueOnce('cancel')
    await vm.handleImport()
    const msg = confirmMock.mock.calls[0][0] as string
    expect(msg).toContain('2 筆')
    expect(msg).toContain('2 位老師')
    expect(msg).toContain('3,200')
    expect(api.batchImportArtPayroll).not.toHaveBeenCalled()
  })

  it('非覆寫模式不跳確認、直接匯入', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.importFile = new File(['x'], 'a.xlsx')
    await vm.handleImport()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(api.batchImportArtPayroll).toHaveBeenCalled()
  })

  it('儲存中再按不會重複新增', async () => {
    let resolve!: () => void
    api.createArtPayroll.mockReturnValue(new Promise<void>((r) => { resolve = r }))
    const w = mountPanel()
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.form.employee_id = 7
    vm.form.subject = '美術'
    const first = vm.handleSave()
    await vm.handleSave()
    resolve()
    await first
    expect(api.createArtPayroll).toHaveBeenCalledTimes(1)
  })
})
