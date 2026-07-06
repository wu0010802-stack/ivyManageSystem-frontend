import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

// ── API mocks（形狀抄真實契約：createEmployee/updateEmployeeBasic/updateEmployeeSalary 皆回 { data }）──
const mockCreateEmployee = vi.fn(() => Promise.resolve({ data: { id: 99 } }))
const mockUpdateEmployeeBasic = vi.fn(() => Promise.resolve({ data: {} }))
const mockUpdateEmployeeSalary = vi.fn(() => Promise.resolve({ data: {} }))
vi.mock('@/api/employees', () => ({
  createEmployee: (...a: unknown[]) => mockCreateEmployee(...a),
  updateEmployeeBasic: (...a: unknown[]) => mockUpdateEmployeeBasic(...a),
  updateEmployeeSalary: (...a: unknown[]) => mockUpdateEmployeeSalary(...a),
}))

const mockGetPositionSalary = vi.fn(() => Promise.resolve({ data: {} }))
vi.mock('@/api/config', () => ({
  getPositionSalary: (...a: unknown[]) => mockGetPositionSalary(...a),
}))

// ── stores（照抄 EmployeeListView.test.js 開頭的 mock 寫法：整包替換成可控 plain object）──
const configStore = { jobTitles: [] as { id: number; name: string }[], fetchJobTitles: vi.fn(() => Promise.resolve()) }
vi.mock('@/stores/config', () => ({
  useConfigStore: () => configStore,
}))

const classroomStore = { classrooms: [] as { id: number; name: string }[], fetchClassrooms: vi.fn(() => Promise.resolve()) }
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => classroomStore,
}))

// hasPermission mock：預設全有權限；個別 case 覆寫
const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  hasPermission: (...a: [string]) => mockHasPermission(...a),
  getUserInfo: () => ({ employee_id: 1, role: 'admin' }),
}))

import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'

// el-dialog 會 teleport 到 body；stub 成原地渲染方便查詢（比照 StudentEditDialog.test.ts 慣例）
const ElDialogStub = {
  name: 'ElDialog',
  template: '<div class="el-dialog-stub"><slot /><slot name="footer" /></div>',
}
// happy-dom 對這些 EP 元件渲染極慢（見 EmployeeFormBasic.test.ts 註解），且本測試不斷言其細節，全部 stub。
const STUBS = {
  'el-dialog': ElDialogStub,
  'el-date-picker': true,
  'el-time-select': true,
  'el-select': true,
  'el-option': true,
  'el-input-number': true,
  'el-switch': true,
  'el-tooltip': true,
} as const

function mountDialog() {
  return mount(EmployeeFormDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
  })
}

type DialogVm = {
  openCreate: () => Promise<void>
  openEdit: (row: Record<string, unknown>) => Promise<void>
  form: Record<string, unknown>
  saveCreate: () => Promise<void>
  saveBasic: () => Promise<void>
}

describe('EmployeeFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockImplementation(() => true)
    localStorage.clear()
  })

  it('新增模式有兩個 tab（基本資料 + 薪資選填）', async () => {
    const w = mountDialog()
    await (w.vm as unknown as DialogVm).openCreate()
    await nextTick()
    expect(w.text()).toContain('基本資料')
    expect(w.text()).toContain('薪資 / 投保 / 銀行')
  })

  it('新增：具 SALARY_WRITE 者填的薪資欄位隨整包 form 送出（不再是 0）', async () => {
    const w = mountDialog()
    const vm = w.vm as unknown as DialogVm
    await vm.openCreate()
    vm.form.name = '測試員工'
    vm.form.base_salary = 32000
    await vm.saveCreate()
    await vi.waitFor(() => {
      expect(mockCreateEmployee).toHaveBeenCalledWith(expect.objectContaining({ name: '測試員工', base_salary: 32000 }))
    })
  })

  it('新增：無 SALARY_WRITE → 薪資 tab 顯示補登提示、不渲染薪資表單', async () => {
    mockHasPermission.mockImplementation((p: unknown) => p !== 'SALARY_WRITE')
    const w = mountDialog()
    await (w.vm as unknown as DialogVm).openCreate()
    await nextTick()
    expect(w.text()).toContain('由具薪資權限者（HR）事後補登')
  })

  it('儲存成功 emit saved', async () => {
    const w = mountDialog()
    const vm = w.vm as unknown as DialogVm
    await vm.openCreate()
    vm.form.name = '測試員工'
    await vm.saveCreate()
    await vi.waitFor(() => {
      expect(w.emitted('saved')).toBeTruthy()
    })
  })

  // ── 自 EmployeeListView.test.js 遷移（生日欄位）──
  it('新增模式 form.birthday 預設空字串且渲染「生日」欄位', async () => {
    const w = mountDialog()
    await (w.vm as unknown as DialogVm).openCreate()
    await nextTick()
    expect((w.vm as unknown as DialogVm).form.birthday).toBe('')
    expect(w.text()).toContain('生日')
  })

  it('編輯模式 openEdit 帶入 birthday 進 form', async () => {
    const w = mountDialog()
    const vm = w.vm as unknown as DialogVm
    await vm.openEdit({ id: 1, name: '王小明', birthday: '1990-03-15', base_salary: 30000, hourly_rate: 0, insurance_salary_level: 30000 })
    await nextTick()
    expect(vm.form.birthday).toBe('1990-03-15')
  })

  // ── 自 EmployeeListView.test.js 遷移（saveBasic 只送 dirty 欄位）──
  it('saveBasic 只送 dirty 欄位 — 改 phone → { phone } payload', async () => {
    const w = mountDialog()
    const vm = w.vm as unknown as DialogVm
    // openEdit → populateForm 建立 dirty 快照（resetDirty 在 nextTick 完成）
    await vm.openEdit({
      id: 42,
      employee_id: 'EMP001',
      name: '測試員工',
      phone: '0912-000-000',
      base_salary: 30000,
      hourly_rate: 0,
      insurance_salary_level: 30000,
    })
    await nextTick()
    await nextTick()

    // 只修改 phone
    vm.form.phone = '0988-123-456'
    await nextTick()

    await vm.saveBasic()
    await vi.waitFor(() => {
      expect(mockUpdateEmployeeBasic).toHaveBeenCalledTimes(1)
      expect(mockUpdateEmployeeBasic).toHaveBeenCalledWith(42, { phone: '0988-123-456' })
    })
  })
})
