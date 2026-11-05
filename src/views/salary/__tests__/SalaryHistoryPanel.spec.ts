import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
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
  // 以 data-rows 暴露實際渲染的列數，供斷言「表格是否還在畫某位員工的資料」
  'el-table': { props: ['data'], template: '<div class="table-stub" :data-rows="data.length" />' },
  'el-table-column': true,
  'el-alert': { props: ['title', 'type'], template: '<div class="alert-stub" :data-type="type">{{ title }}<slot /></div>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' },
  // 宣告 emits，避免 onClick 同時以原生 listener fallthrough 與 $emit 各觸發一次（重試被打兩次）
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

type HistoryRow = {
  year: number
  month: number
  net_salary: number
  unused_leave_payout: number
  base_transfer_amount: number
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

const row = (netSalary: number, unusedLeavePayout = 0): HistoryRow => ({
  year: 2026,
  month: 1,
  net_salary: netSalary,
  unused_leave_payout: unusedLeavePayout,
  base_transfer_amount: netSalary + unusedLeavePayout,
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
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type VmShape = {
  selectedEmployeeId: number | null
  historyMonths: number
  historyData: HistoryRow[]
  historyLoading: boolean
  loadError: string | null
  chartData: { datasets: Array<{ data: number[] }> } | null
}

const mountPanel = () => mount(SalaryHistoryPanel, { global: { stubs: STUBS } })

describe('SalaryHistoryPanel fetchHistory race guard', () => {
  beforeEach(() => {
    getHistoryMock.mockReset()
  })

  it('歷史圖表實發使用主薪轉金額（淨薪 + 未休折現）', async () => {
    getHistoryMock.mockResolvedValue({ data: [row(30000, 5000)] })
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape
    vm.selectedEmployeeId = 1
    await flushPromises()
    expect(vm.chartData?.datasets[0].data).toEqual([35000])
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

// P2 #70：載入失敗時不得殘留上一位員工的薪資表（HR 會把 A 的薪資誤讀成 B），
// 首次載入就失敗也不得偽裝成「無歷史薪資記錄」。比照 SalaryMonthlyOverviewPanel：
// 失敗 → 清空資料＋可重試 alert。
describe('SalaryHistoryPanel 載入失敗狀態（不殘留前一位員工資料）', () => {
  beforeEach(() => {
    getHistoryMock.mockReset()
    vi.mocked(ElMessage.error).mockClear()
  })

  const tableRows = (wrapper: ReturnType<typeof mountPanel>) =>
    wrapper.find('.table-stub').exists() ? Number(wrapper.find('.table-stub').attributes('data-rows')) : 0

  it('員工 A 載入成功後切到 B 且 B 失敗：清空表格、不再渲染 A 的資料，顯示可重試錯誤', async () => {
    getHistoryMock
      .mockResolvedValueOnce({ data: [row(1111)] }) // 員工 A 成功
      .mockRejectedValueOnce(new Error('boom')) // 員工 B 失敗
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1
    await flushPromises()
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([1111])
    expect(tableRows(wrapper)).toBe(1)

    vm.selectedEmployeeId = 2
    await flushPromises()

    expect(vm.historyData).toEqual([])
    expect(vm.chartData).toBeNull()
    expect(wrapper.find('.table-stub').exists()).toBe(false)
    const alert = wrapper.find('[data-testid="history-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('載入薪資歷史失敗')
    expect(wrapper.find('[data-testid="history-retry"]').exists()).toBe(true)
    // 失敗不是「沒有資料」
    expect(wrapper.find('.empty-stub').exists()).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
  })

  it('首次載入就失敗：顯示錯誤而不是「無歷史薪資記錄」', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1
    await flushPromises()

    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="history-retry"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('無歷史薪資記錄')
    expect(wrapper.find('.empty-stub').exists()).toBe(false)
  })

  it('重試成功後錯誤區消失並顯示資料（以同一員工、同一區間重打）', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape
    vm.selectedEmployeeId = 2
    await flushPromises()
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(true)

    getHistoryMock.mockResolvedValueOnce({ data: [row(2222)] })
    await wrapper.find('[data-testid="history-retry"]').trigger('click')
    await flushPromises()

    expect(getHistoryMock).toHaveBeenCalledTimes(2)
    expect(getHistoryMock).toHaveBeenLastCalledWith({ employee_id: 2, months: 12 })
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(vm.loadError).toBeNull()
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])
    expect(tableRows(wrapper)).toBe(1)
  })

  it('失敗後重試成功但該員工確實無資料：顯示「無歷史薪資記錄」，不殘留舊錯誤', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape
    vm.selectedEmployeeId = 1
    await flushPromises()
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(true)

    getHistoryMock.mockResolvedValueOnce({ data: [] })
    await wrapper.find('[data-testid="history-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(wrapper.find('.empty-stub').text()).toContain('無歷史薪資記錄')
  })

  it('切到另一位員工並成功：先前員工的失敗訊息被清掉', async () => {
    getHistoryMock
      .mockRejectedValueOnce(new Error('boom')) // 員工 A 失敗
      .mockResolvedValueOnce({ data: [row(2222)] }) // 員工 B 成功
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape
    vm.selectedEmployeeId = 1
    await flushPromises()
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(true)

    vm.selectedEmployeeId = 2
    await flushPromises()

    expect(vm.loadError).toBeNull()
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])
  })

  it('成功但該員工無資料：維持「無歷史薪資記錄」空狀態（不是錯誤）', async () => {
    getHistoryMock.mockResolvedValueOnce({ data: [] })
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape
    vm.selectedEmployeeId = 1
    await flushPromises()

    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(wrapper.find('.empty-stub').text()).toContain('無歷史薪資記錄')
  })

  // epoch 守衛：舊請求（A）晚到的失敗，不得清掉已成功的 B，也不得蓋上錯誤。
  it('舊請求 A 晚到的失敗不影響已成功的 B（資料保留、無錯誤、無 toast）', async () => {
    const deferredA = createDeferred<{ data: HistoryRow[] }>()
    const deferredB = createDeferred<{ data: HistoryRow[] }>()
    getHistoryMock
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise)
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1 // A 發出（慢）
    await flushPromises()
    vm.selectedEmployeeId = 2 // B 發出（快）
    await flushPromises()

    deferredB.resolve({ data: [row(2222)] })
    await flushPromises()
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])

    deferredA.reject(new Error('boom')) // A 晚到失敗
    await flushPromises()

    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])
    expect(vm.loadError).toBeNull()
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(tableRows(wrapper)).toBe(1)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('舊請求 A 的失敗先到、B 仍在進行：不顯示 A 的錯誤；B 成功後正常顯示 B', async () => {
    const deferredA = createDeferred<{ data: HistoryRow[] }>()
    const deferredB = createDeferred<{ data: HistoryRow[] }>()
    getHistoryMock
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise)
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as VmShape

    vm.selectedEmployeeId = 1
    await flushPromises()
    vm.selectedEmployeeId = 2
    await flushPromises()

    deferredA.reject(new Error('boom')) // A 在 B 完成前失敗
    await flushPromises()
    expect(vm.loadError).toBeNull()
    expect(vm.historyLoading).toBe(true) // B 仍在進行
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()

    deferredB.resolve({ data: [row(2222)] })
    await flushPromises()
    expect(vm.historyData.map((r) => r.net_salary)).toEqual([2222])
    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(false)
  })
})
