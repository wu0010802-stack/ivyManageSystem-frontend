// src/components/employee/__tests__/EmployeeFormDialog.maskedSalary.test.ts
// #9 遮罩薪資不變量（backlog 固化）：無薪資權限開啟編輯時，後端把薪資欄位遮罩為 null。
// populateForm 若以 Number(null)=0 轉型，會讓唯讀顯示「NT$0」（把「看不到」誤呈現成「0 元」），
// 且把 0 帶進 dirty 快照後有以 0 覆寫真實薪資的風險。
// 不變量①：openEdit 遮罩（null）薪資列 → form 欄位保留 null（唯讀端 fmtRO 才會顯示「—」）。
// 不變量②：遮罩列 openEdit 後薪資欄不因轉型變 0（不會以 0 送出）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
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
// 無薪資權限：canWriteSalary=false → isSalaryReadonly=true（薪資欄被遮罩為 null）
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => false),
  getUserInfo: vi.fn(() => ({ employee_id: 999 })),
}))

type Vm = {
  openEdit: (row: Record<string, unknown>) => void
  form: Record<string, unknown>
}

function mountDialog() {
  return shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
}

// 後端遮罩：無薪資權限時 base_salary / hourly_rate / insurance_salary_level 皆為 null
const MASKED_ROW = {
  id: 1, employee_id: 'EMP001', name: '王小明', employee_type: 'regular',
  base_salary: null, hourly_rate: null, insurance_salary_level: null,
}

describe('EmployeeFormDialog 遮罩薪資（null）處理', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openEdit 遮罩列 → base_salary/hourly_rate 保留 null，不被 Number() 轉成 0', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...MASKED_ROW })
    await flushPromises()
    expect(vm.form.base_salary).toBeNull()
    expect(vm.form.hourly_rate).toBeNull()
  })

  it('openEdit 遮罩列 → insurance_salary_level 不因對齊 base 被塞成 0', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...MASKED_ROW })
    await flushPromises()
    // 遮罩下 base 為 null，投保級距對齊後仍應為 null（非 0），才不會以 0 送出/顯示
    expect(vm.form.insurance_salary_level).not.toBe(0)
  })
})
