import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SalarySimulatePanel from '../SalarySimulatePanel.vue'

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const simulateSalaryMock = vi.fn()
const getEmployeeSalaryDebugMock = vi.fn()
vi.mock('@/api/salary', () => ({
  simulateSalary: (...args: unknown[]) => simulateSalaryMock(...args),
  getEmployeeSalaryDebug: (...args: unknown[]) => getEmployeeSalaryDebugMock(...args),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))

import { ElMessage } from 'element-plus'

type VmShape = {
  form: { employee_id: number | null; year: number; month: number }
  runSimulate: (opts?: { useCache?: boolean }) => Promise<void>
}

describe('SalarySimulatePanel 請假政策提示', () => {
  it('不再顯示事病假超過 40 小時會讓獎金歸零的舊全勤規則', () => {
    const wrapper = mount(SalarySimulatePanel)

    expect(wrapper.text()).not.toContain('40 小時')
    expect(wrapper.text()).not.toContain('獎金歸零')
  })
})

describe('SalarySimulatePanel 試算失敗訊息', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // F-1：後端 500 envelope 的 detail 是物件（{code,message,request_id}）。
  // axios 攔截器（src/api/index.ts）已把它正規化為 error.displayMessage 字串，
  // 元件不該再自己從 response.data.detail 解析物件（字串串接會變 [object Object]）。
  it('後端 500 envelope（detail 為物件）→ 顯示攔截器正規化後的 displayMessage，不是 [object Object]', async () => {
    getEmployeeSalaryDebugMock.mockResolvedValue({ data: null })
    simulateSalaryMock.mockRejectedValue({
      displayMessage: '找不到 2029 年度的薪資設定，請聯繫系統管理員',
      response: {
        data: {
          detail: {
            code: 'INTERNAL_ERROR',
            message: '找不到 2029 年度的薪資設定，請聯繫系統管理員',
            request_id: 'req-abc123',
          },
        },
      },
      message: 'Request failed with status code 500',
    })

    const wrapper = mount(SalarySimulatePanel)
    const vm = wrapper.vm as unknown as VmShape
    vm.form.employee_id = 1
    vm.form.year = 2029
    await vm.runSimulate()
    await flushPromises()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(ElMessage.error).mock.calls[0]![0] as string
    expect(msg).toContain('找不到 2029 年度的薪資設定，請聯繫系統管理員')
    expect(msg).not.toContain('[object Object]')
  })

  // fallback：無 displayMessage（例如非 axios 錯誤）→ 退回 Error.message，
  // 仍不得把整個物件字串化進訊息。
  it('無 displayMessage 時 fallback 到 Error.message', async () => {
    getEmployeeSalaryDebugMock.mockResolvedValue({ data: null })
    simulateSalaryMock.mockRejectedValue(new Error('network error'))

    const wrapper = mount(SalarySimulatePanel)
    const vm = wrapper.vm as unknown as VmShape
    vm.form.employee_id = 1
    await vm.runSimulate()
    await flushPromises()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(ElMessage.error).mock.calls[0]![0] as string
    expect(msg).toContain('network error')
    expect(msg).not.toContain('[object Object]')
  })
})

// F-2：diffColor 對「差異」上色（diff-pos=綠=有利、diff-neg=紅=不利）。
// 扣款欄位「增加（差異 > 0）」= 扣更多 = 對員工不利 → 應紅（diff-neg）。
// 原本 isDeduction 清單漏了勞健保/勞退/二代健保補充保費/會議缺席扣款，
// 導致這些欄位增加時被誤判為有利（綠），減少反而顯示不利（紅），色碼相反。
describe('SalarySimulatePanel diffColor 扣款色碼', () => {
  type DiffVm = { diffColor: (key: string, val: number) => string }

  const mountVm = () => {
    const wrapper = mount(SalarySimulatePanel)
    return wrapper.vm as unknown as DiffVm
  }

  // 全部扣款欄位（含原本漏掉的 5 欄）：增加 = 不利（紅），減少 = 有利（綠）
  const DEDUCTION_KEYS = [
    'total_deductions',
    'labor_insurance',
    'health_insurance',
    'supplementary_health_employee',
    'pension_self',
    'late_deduction',
    'early_leave_deduction',
    'leave_deduction',
    'absence_deduction',
    'meeting_absence_deduction',
  ]

  it.each(DEDUCTION_KEYS)('扣款欄 %s：增加 → 紅（diff-neg，不利）', (key) => {
    const vm = mountVm()
    expect(vm.diffColor(key, 100)).toBe('diff-neg')
  })

  it.each(DEDUCTION_KEYS)('扣款欄 %s：減少 → 綠（diff-pos，有利）', (key) => {
    const vm = mountVm()
    expect(vm.diffColor(key, -100)).toBe('diff-pos')
  })

  // 收入類欄位：增加 = 有利（綠），維持原行為不回歸
  it.each([
    ['gross_salary'],
    ['net_pay'],
    ['total_with_bonus'],
    ['festival_bonus'],
    ['base_salary'],
  ])('收入欄 %s：增加 → 綠（diff-pos，有利）', (key) => {
    const vm = mountVm()
    expect(vm.diffColor(key, 100)).toBe('diff-pos')
    expect(vm.diffColor(key, -100)).toBe('diff-neg')
  })

  it('差異為 0 → 無色碼', () => {
    const vm = mountVm()
    expect(vm.diffColor('labor_insurance', 0)).toBe('')
  })
})
