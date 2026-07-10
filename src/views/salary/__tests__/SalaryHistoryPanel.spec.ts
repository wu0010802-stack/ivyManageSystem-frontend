import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SalaryHistoryPanel from '../SalaryHistoryPanel.vue'

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const getHistoryMock = vi.fn()
vi.mock('@/api/salary', () => ({
  getHistory: (...args: unknown[]) => getHistoryMock(...args),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    employees: [
      { id: 1, name: '員工 A' },
      { id: 2, name: '員工 B' },
      { id: 3, name: '員工 C' },
    ],
    fetchEmployees: vi.fn(),
  }),
}))

vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChartStub', template: '<div></div>' },
}))

const STUBS = {
  'el-select': true,
  'el-option': true,
  'el-card': { template: '<div><slot /></div>' },
  'el-table': true,
  'el-table-column': true,
  'el-empty': true,
}

type HistoryRow = {
  year: number
  month: number
  net_salary: number
  gross_salary: number
  base_salary: number
  total_bonus: number
  in_gross_bonus: number
  payslip_detail: unknown
  labor_insurance: number
  health_insurance: number
  attendance_deduction: number
  leave_deduction: number
  total_deduction: number
}

const row = (netSalary: number): HistoryRow => ({
  year: 2026,
  month: 1,
  net_salary: netSalary,
  gross_salary: netSalary,
  base_salary: netSalary,
  total_bonus: 0,
  in_gross_bonus: 0,
  payslip_detail: {},
  labor_insurance: 0,
  health_insurance: 0,
  attendance_deduction: 0,
  leave_deduction: 0,
  total_deduction: 0,
})

// 手動可控 resolve 時機的 deferred promise，用來模擬「先發後至」的 race。
function createDeferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

type VmShape = {
  selectedEmployeeId: number | null
  historyMonths: number
  historyData: HistoryRow[]
  historyLoading: boolean
}

const mountPanel = () => mount(SalaryHistoryPanel, { global: { stubs: STUBS } })

describe('SalaryHistoryPanel fetchHistory race guard', () => {
  beforeEach(() => {
    getHistoryMock.mockReset()
  })

  // P1 #5：切換員工時若先選的員工（慢請求）晚於後選的員工（快請求）resolve，
  // 沒有 epoch guard 會讓慢請求覆蓋掉快請求的結果，畫面顯示錯人的薪資歷史。
  it('先選員工 A（慢）→ 再選員工 B（快，先 resolve）：最終資料須是 B 的，不被 A 的晚到回應覆蓋', async () => {
    const deferredA = createDeferred<{ data: HistoryRow[] }>()
    const deferredB = createDeferred<{ data: HistoryRow[] }>()
    getHistoryMock
      .mockImplementationOnce(() => deferredA.promise) // 員工 A 的請求（慢）
      .mockImplementationOnce(() => deferredB.promise) // 員工 B 的請求（快）

    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1
    await flushPromises()
    vm.selectedEmployeeId = 2
    await flushPromises()

    expect(getHistoryMock).toHaveBeenCalledTimes(2)

    // B（後選、快）先 resolve
    deferredB.resolve({ data: [row(2222)] })
    await flushPromises()
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])

    // A（先選、慢）晚到才 resolve —— 不應覆蓋 B 的資料
    deferredA.resolve({ data: [row(1111)] })
    await flushPromises()

    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])
    expect(vm.selectedEmployeeId).toBe(2)
  })

  // loading 狀態機正確性：過期請求的 finally 不應誤關「目前仍在進行中」的 loading。
  it('舊請求晚到 resolve 時不誤動目前請求的 loading 狀態', async () => {
    const deferredA = createDeferred<{ data: HistoryRow[] }>() // 員工 A：慢，最後才 resolve
    const deferredB = createDeferred<{ data: HistoryRow[] }>() // 員工 B：快，中途 resolve
    const deferredC = createDeferred<{ data: HistoryRow[] }>() // 員工 C：目前選取，仍在進行中
    getHistoryMock
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise)
      .mockImplementationOnce(() => deferredC.promise)

    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1 // A 發出
    await flushPromises()
    vm.selectedEmployeeId = 2 // B 發出
    await flushPromises()

    deferredB.resolve({ data: [row(2222)] }) // B 先完成
    await flushPromises()
    expect(vm.historyLoading).toBe(false)

    vm.selectedEmployeeId = 3 // C 發出，重新進入 loading
    await flushPromises()
    expect(vm.historyLoading).toBe(true)

    // A（最舊、過期）此時才 resolve —— 不應把仍在進行中的 loading 誤關掉
    deferredA.resolve({ data: [row(1111)] })
    await flushPromises()

    expect(vm.historyLoading).toBe(true)
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222]) // 仍是 B 的舊資料，還沒被 C 蓋過

    // C 完成後才真正關閉 loading，並套用 C 的資料
    deferredC.resolve({ data: [row(3333)] })
    await flushPromises()
    expect(vm.historyLoading).toBe(false)
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([3333])
  })
})
