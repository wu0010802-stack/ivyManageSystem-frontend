// 義華 115.09 對帳 #36／#41：
// - #36 健保本人自付比例（中低收入本人 5 折＝0.5）屬薪資 tab 欄位，dirty 即送出。
// - #41 異動生效日 salary_inputs_effective_from 不列入 dirty（單填日期不算變更），
//   但有薪資輸入異動時一併送出（陳培瑜眷屬 115.07 起：基本資料 tab 改 dependents 也要帶）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'
import { updateEmployeeBasic, updateEmployeeSalary } from '@/api/employees'

vi.mock('@/api/employees', () => ({
  createEmployee: vi.fn(),
  updateEmployeeBasic: vi.fn().mockResolvedValue({ data: {} }),
  updateEmployeeSalary: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/config', () => ({
  getPositionSalary: vi.fn().mockResolvedValue({ data: {} }),
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

type Setup = {
  openEdit: (row: Record<string, unknown>) => Promise<void>
  form: Record<string, unknown>
  submitSalary: (reason?: string | null) => Promise<void>
  saveBasic: () => Promise<void>
  salaryDirty: Record<string, unknown>
}

const ROW = {
  id: 1, employee_id: 'EMP001', name: '吳亞娗', employee_type: 'regular',
  base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
  dependents: 0, health_self_pay_ratio: 1, hire_date: '2026-08-01',
}

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

describe('EmployeeFormDialog 健保本人自付比例與異動生效日', () => {
  beforeEach(() => vi.clearAllMocks())

  it('#36 改本人自付比例 0.5＋生效日 9/1 → 一併送出', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5
    s.form.salary_inputs_effective_from = '2026-09-01'
    await flushPromises()
    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, {
      health_self_pay_ratio: 0.5,
      salary_inputs_effective_from: '2026-09-01',
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('#41 只填生效日不算變更', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.salary_inputs_effective_from = '2026-07-01'
    await flushPromises()
    expect(Object.keys(s.salaryDirty)).toEqual([])
  })

  it('#41 基本資料 tab 改眷屬人數也帶生效日（陳培瑜 115.07 起）', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW, name: '陳培瑜', hire_date: '2026-07-07' })
    await flushPromises()
    s.form.dependents = 1
    s.form.salary_inputs_effective_from = '2026-07-07'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      dependents: 1,
      salary_inputs_effective_from: '2026-07-07',
    })
  })

  it('基本資料只改姓名時不帶生效日', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.name = '吳亞娗２'
    s.form.salary_inputs_effective_from = '2026-07-07'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { name: '吳亞娗２' })
  })
})
