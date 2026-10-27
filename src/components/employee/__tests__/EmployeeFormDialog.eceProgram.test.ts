// 義華 2026-10-27：員工「目前就讀幼保相關科系」旗標（ece_program_enrolled）。
// 只在獎金設定開啟「C 級滿二年且就讀幼保比照 B 級」時影響節慶基數；後端把它列為薪資輸入欄
// 與自改金流敏感欄位，所以放在薪資 tab：dirty 即送出、薪資變更要經預覽確認、本人唯讀。
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
  openCreate: () => void
  form: Record<string, unknown>
  submitSalary: (reason?: string | null) => Promise<void>
  saveBasic: () => Promise<void>
  saveSalary: () => void
  salaryDirty: Record<string, unknown>
  basicDirty: Record<string, unknown>
  previewDialog: { visible: boolean; changes: Record<string, unknown> }
  isSalaryReadonly: boolean
}

const ROW = {
  id: 1, employee_id: 'EMP001', name: '吳亞娗', employee_type: 'regular',
  base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
  dependents: 0, health_self_pay_ratio: 1, hire_date: '2024-08-01',
  ece_program_enrolled: false,
}

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

describe('EmployeeFormDialog 目前就讀幼保相關科系', () => {
  beforeEach(() => vi.clearAllMocks())

  it('編輯：帶入後端的旗標值', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW, ece_program_enrolled: true })
    await flushPromises()

    expect(s.form.ece_program_enrolled).toBe(true)
    expect(Object.keys(s.salaryDirty)).toEqual([])
  })

  it('編輯：舊後端沒回這個欄位（undefined／null）視為未就讀，且不算異動', async () => {
    const { s } = mountDialog()
    const legacy: Record<string, unknown> = { ...ROW }
    delete legacy.ece_program_enrolled
    await s.openEdit(legacy)
    await flushPromises()

    expect(s.form.ece_program_enrolled).toBe(false)
    expect(Object.keys(s.salaryDirty)).toEqual([])
  })

  it('勾選屬於薪資 tab：salaryDirty 有、basicDirty 沒有', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.ece_program_enrolled = true
    await flushPromises()

    expect(Object.keys(s.salaryDirty)).toEqual(['ece_program_enrolled'])
    expect(Object.keys(s.basicDirty)).not.toContain('ece_program_enrolled')
  })

  it('儲存薪資：只送這一個欄位，不夾帶其他薪資欄位', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.ece_program_enrolled = true
    await flushPromises()

    await s.submitSalary(null)

    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, { ece_program_enrolled: true })
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
  })

  it('取消勾選也要送出 false（才能真的取消）', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW, ece_program_enrolled: true })
    await flushPromises()
    s.form.ece_program_enrolled = false
    await flushPromises()

    await s.submitSalary(null)

    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, { ece_program_enrolled: false })
  })

  it('薪資變更預覽用中文欄位名稱，不露出欄位代碼', async () => {
    const { w, s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.ece_program_enrolled = true
    await flushPromises()

    s.saveSalary()
    await flushPromises()

    expect(s.previewDialog.visible).toBe(true)
    expect(Object.keys(s.previewDialog.changes)).toEqual(['ece_program_enrolled'])
    const labels = (w.vm.$.setupState as unknown as { FIELD_LABELS: Record<string, string> }).FIELD_LABELS
    expect(labels.ece_program_enrolled).toBe('目前就讀幼保相關科系')
  })

  it('新增員工：預設未就讀', async () => {
    const { s } = mountDialog()
    s.openCreate()
    await flushPromises()

    expect(s.form.ece_program_enrolled).toBe(false)
  })
})
