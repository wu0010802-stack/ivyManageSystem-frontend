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
