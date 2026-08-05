// src/components/employee/__tests__/EmployeeFormDialog.insuranceSync.test.ts
// 投保級距不可被開窗強制同步成底薪（2026-07-28）。
// 問題情境：populateForm 原本「投保級距 ≠ 底薪就對齊底薪」，導致 HR 手動修正的
// 合法級距（如底薪 37160 → 官方級距 38200）每次開編輯視窗都被蓋回 37160，
// 儲存後又落庫非法級距，永遠鎖死在底薪。
// 不變量①：已有值（≠0）的投保級距開窗後原值保留，不對齊底薪。
// 不變量②：未設定（0）時仍預設帶入底薪（存檔時後端會向上對齊官方級距）。
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
  // 多租戶 CT-FIX-09：EmployeeFormDialog 經 useTenantDictionaries 讀 per-tenant
  // 職稱對照；回空物件即等同「退 constants/employee.ts 的 fallback」。
  getPositionMapping: vi.fn().mockResolvedValue({ data: { title_to_grade: {}, position_salary_key: {} } }),
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
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ employee_id: 999 })),
}))

type Vm = {
  openEdit: (row: Record<string, unknown>) => void
  form: Record<string, unknown>
}

function mountDialog() {
  return shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
}

const ROW = {
  id: 1, employee_id: 'EMP001', name: '王小明', employee_type: 'regular',
  base_salary: 37160, hourly_rate: 0,
}

describe('EmployeeFormDialog 投保級距開窗同步行為', () => {
  beforeEach(() => vi.clearAllMocks())

  it('已有值（官方級距 38200 ≠ 底薪 37160）→ 開窗後保留 38200，不被蓋回底薪', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...ROW, insurance_salary_level: 38200 })
    await flushPromises()
    expect(vm.form.insurance_salary_level).toBe(38200)
  })

  it('未設定（0）→ 開窗後預設帶入底薪（後端存檔時會向上對齊官方級距）', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ ...ROW, insurance_salary_level: 0 })
    await flushPromises()
    expect(vm.form.insurance_salary_level).toBe(37160)
  })
})
