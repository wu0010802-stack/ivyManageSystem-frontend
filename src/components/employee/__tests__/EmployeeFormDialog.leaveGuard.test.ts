// src/components/employee/__tests__/EmployeeFormDialog.leaveGuard.test.ts
// 離開編輯保護（finding #1）：dialog 有未儲存變更時，關閉（footer 按鈕 / X / Esc / 遮罩）需先確認，
// 避免草稿刻意排除的敏感欄位（薪資、銀行、身分證）誤關遺失。
// - 編輯模式：basicDirty / salaryDirty 反映變更
// - 新增模式：openCreate 建立空表單快照，填入欄位後同樣視為未儲存
// - 使用者選「繼續編輯」（confirm reject）→ 不關閉；選「捨棄」（resolve）→ 關閉
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'

vi.mock('@/api/employees', () => ({
  createEmployee: vi.fn(),
  updateEmployeeBasic: vi.fn(),
  updateEmployeeSalary: vi.fn(),
}))
vi.mock('@/api/config', () => ({
  getPositionSalary: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ jobTitles: [], fetchJobTitles: vi.fn() }),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))

const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
  }
})

type Vm = {
  openCreate: () => void
  openEdit: (row: Record<string, unknown>) => void
  form: Record<string, unknown>
  attemptClose: () => void
  dialogVisible: boolean
}

function mountDialog() {
  return shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
}

const EDIT_ROW = {
  id: 1, employee_id: 'EMP001', name: '王小明', employee_type: 'regular',
  phone: '0900-000-000', base_salary: 30000, hourly_rate: 0, insurance_salary_level: 30000,
}

describe('EmployeeFormDialog 離開編輯保護', () => {
  beforeEach(() => {
    confirmMock.mockReset()
  })

  // #6：確認框預設焦點須落在安全動作「繼續編輯」（confirm 為 primary＋預設焦點），
  // 破壞性的「捨棄變更並離開」改為 danger 樣式的 cancel、不持預設焦點，Enter 不會誤丟資料。
  // 語意：confirm(resolve)=繼續編輯→不關閉；cancel(reject 'cancel')=捨棄→關閉；
  //       close(reject 'close', Esc/X)=安全預設→不關閉。
  it('選「繼續編輯」（confirm/預設焦點）→ 不關閉、資料保留', async () => {
    confirmMock.mockResolvedValue('confirm')
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...EDIT_ROW })
    await flushPromises()
    vm.form.phone = '0988-123-456'
    await nextTick()
    vm.attemptClose()
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(vm.dialogVisible).toBe(true)
  })

  it('選「捨棄變更並離開」（danger cancel）→ 關閉', async () => {
    confirmMock.mockRejectedValue('cancel')
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...EDIT_ROW })
    await flushPromises()
    vm.form.base_salary = 32000
    await nextTick()
    vm.attemptClose()
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(vm.dialogVisible).toBe(false)
  })

  it('Esc / 關閉鈕（close）→ 不關閉（安全預設，Enter/Esc 皆不丟資料）', async () => {
    confirmMock.mockRejectedValue('close')
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...EDIT_ROW })
    await flushPromises()
    vm.form.base_salary = 32000
    await nextTick()
    vm.attemptClose()
    await flushPromises()
    expect(vm.dialogVisible).toBe(true)
  })

  it('傳給 ElMessageBox 的選項：繼續編輯為 confirm、捨棄為 danger cancel、distinguishCancelAndClose', async () => {
    confirmMock.mockResolvedValue('confirm')
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...EDIT_ROW })
    await flushPromises()
    vm.form.phone = '0988-123-456'
    await nextTick()
    vm.attemptClose()
    await flushPromises()
    const opts = confirmMock.mock.calls[0][2] as Record<string, unknown>
    expect(opts.confirmButtonText).toBe('繼續編輯')
    expect(opts.cancelButtonText).toBe('捨棄變更並離開')
    expect(String(opts.cancelButtonClass)).toContain('danger')
    expect(opts.distinguishCancelAndClose).toBe(true)
  })

  it('編輯模式無變更 → attemptClose 直接關閉、不彈確認', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...EDIT_ROW })
    await flushPromises()
    vm.attemptClose()
    await flushPromises()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(false)
  })

  it('新增模式填入敏感欄位 → attemptClose 彈確認（選繼續編輯不關閉）', async () => {
    confirmMock.mockResolvedValue('confirm')
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openCreate()
    await flushPromises()
    vm.form.name = '新進員工'
    vm.form.bank_account = '1234567890'
    await nextTick()
    vm.attemptClose()
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(vm.dialogVisible).toBe(true)
  })
})
