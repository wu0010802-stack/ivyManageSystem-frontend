import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import YearEndDetailView from '../YearEndDetailView.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    listYearEndCycles: vi.fn(),
    listYearEndSettlements: vi.fn(),
    listSpecialBonuses: vi.fn(),
    listClassEnrollmentTargets: vi.fn(),
    signSupervisorSettlement: vi.fn(),
    signAccountingSettlement: vi.fn(),
    finalizeSettlement: vi.fn(),
    signSupervisorBatch: vi.fn(),
    signAccountingBatch: vi.fn(),
    finalizeBatch: vi.fn(),
    exportYearEndSummaryXlsxUrl: vi.fn().mockReturnValue('/api/year-end/1/summary.xlsx'),
    exportYearEndTransferRosterXlsxUrl: vi.fn().mockReturnValue('/api/year-end/1/roster.xlsx'),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '1' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

// hasPermission returns true by default; individual tests override as needed
const mockHasPermission = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}))

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'

// ---- helpers ----

interface Settlement {
  id: number
  employee_id: number
  status: string
  total_amount: number
  [key: string]: unknown
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 1,
    employee_id: 10,
    status: 'DRAFT',
    total_amount: 50000,
    avg_performance_rate: 90,
    base_salary: 40000,
    festival_total: 5000,
    gross_amount: 45000,
    org_achievement_rate: 85,
    subtotal_amount: 44000,
    deduction_total: 0,
    hire_months: 12,
    payable_amount: 44000,
    special_bonus_total: 6000,
    ...overrides,
  }
}

function setupApiMocks(settlements: Settlement[]) {
  vi.mocked(api.listYearEndCycles).mockResolvedValue({
    data: [{ id: 1, academic_year: 114, bonus_calc_date: '2026-01-31', status: 'DRAFT' }],
  } as never)
  vi.mocked(api.listYearEndSettlements).mockResolvedValue({ data: settlements } as never)
  vi.mocked(api.listSpecialBonuses).mockResolvedValue({ data: [] } as never)
  vi.mocked(api.listClassEnrollmentTargets).mockResolvedValue({ data: [] } as never)
}

async function mountView() {
  const wrapper = mount(YearEndDetailView, {
    global: {
      stubs: {
        'el-page-header': true,
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-tag': true,
        'el-tabs': true,
        'el-tab-pane': true,
        'el-icon': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndDetailView — 兩關簽核流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
  })

  // Case 1: DRAFT → 顯示「會計簽核」不顯示「主管簽」
  it('DRAFT 狀態：vm sign() 以 accounting stage 呼叫 signAccountingSettlement', async () => {
    const settlement = makeSettlement({ status: 'DRAFT' })
    setupApiMocks([settlement])

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      settlements: Settlement[]
      sign: (s: Settlement, stage: string) => Promise<void>
    }

    expect(vm.settlements).toHaveLength(1)
    expect(vm.settlements[0].status).toBe('DRAFT')

    vi.mocked(api.signAccountingSettlement).mockResolvedValue({ data: {} } as never)
    // reload after sign
    vi.mocked(api.listYearEndSettlements).mockResolvedValue({
      data: [makeSettlement({ status: 'ACCOUNTING_SIGNED' })],
    } as never)

    await vm.sign(settlement, 'accounting')
    await nextTick()

    expect(api.signAccountingSettlement).toHaveBeenCalledWith(1)
    expect(api.signSupervisorSettlement).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('簽核完成')
  })

  // Case 2: ACCOUNTING_SIGNED → 顯示「老闆核定」
  it('ACCOUNTING_SIGNED 狀態：vm sign() 以 finalize stage 呼叫 finalizeSettlement', async () => {
    const settlement = makeSettlement({ id: 2, status: 'ACCOUNTING_SIGNED' })
    setupApiMocks([settlement])

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      settlements: Settlement[]
      sign: (s: Settlement, stage: string) => Promise<void>
    }

    expect(vm.settlements[0].status).toBe('ACCOUNTING_SIGNED')

    vi.mocked(api.finalizeSettlement).mockResolvedValue({ data: {} } as never)
    vi.mocked(api.listYearEndSettlements).mockResolvedValue({
      data: [makeSettlement({ id: 2, status: 'FINALIZED' })],
    } as never)

    await vm.sign(settlement, 'finalize')
    await nextTick()

    expect(api.finalizeSettlement).toHaveBeenCalledWith(2)
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('簽核完成')
  })

  // Case 3: DRAFT 有 YEAR_END_ACCOUNTING 權限 → 按鈕應可操作 (vm-layer permission check)
  it('DRAFT + hasPermission(YEAR_END_ACCOUNTING)=true → 允許會計簽核操作', async () => {
    setupApiMocks([makeSettlement({ status: 'DRAFT' })])
    mockHasPermission.mockImplementation((p: string) => p === 'YEAR_END_ACCOUNTING')

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { settlements: Settlement[] }

    // Permission gate: DRAFT + YEAR_END_ACCOUNTING true → show button condition
    expect(vm.settlements[0].status === 'DRAFT' && mockHasPermission('YEAR_END_ACCOUNTING')).toBe(true)
    // 主管簽 should not be shown: no supervisor stage in two-gate flow
    expect(vm.settlements[0].status === 'SUPERVISOR_SIGNED').toBe(false)
  })

  // Case 4: ACCOUNTING_SIGNED + YEAR_END_FINALIZE permission → 老闆核定可操作
  it('ACCOUNTING_SIGNED + hasPermission(YEAR_END_FINALIZE)=true → 允許老闆核定', async () => {
    setupApiMocks([makeSettlement({ status: 'ACCOUNTING_SIGNED' })])
    mockHasPermission.mockImplementation((p: string) => p === 'YEAR_END_FINALIZE')

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { settlements: Settlement[] }

    expect(vm.settlements[0].status === 'ACCOUNTING_SIGNED' && mockHasPermission('YEAR_END_FINALIZE')).toBe(true)
  })

  // Case 5: FINALIZED → 顯示已核定，不提供任何按鈕
  it('FINALIZED 狀態：status 正確，不呼叫任何 sign API', async () => {
    setupApiMocks([makeSettlement({ status: 'FINALIZED' })])

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { settlements: Settlement[] }

    expect(vm.settlements[0].status).toBe('FINALIZED')
    // Neither DRAFT nor ACCOUNTING_SIGNED buttons should fire
    expect(api.signAccountingSettlement).not.toHaveBeenCalled()
    expect(api.finalizeSettlement).not.toHaveBeenCalled()
    // Unused: signSupervisorSettlement never triggered in 2-gate flow
    expect(api.signSupervisorSettlement).not.toHaveBeenCalled()
  })

  // Case 6: statusLabel maps correctly for new two-gate labels
  it('statusLabel 回傳正確中文標籤', async () => {
    setupApiMocks([makeSettlement()])

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      statusLabel: (s: string) => string
    }

    expect(vm.statusLabel('DRAFT')).toBe('草稿')
    expect(vm.statusLabel('ACCOUNTING_SIGNED')).toBe('會計已簽')
    expect(vm.statusLabel('FINALIZED')).toBe('已核定')
    // SUPERVISOR_SIGNED still mapped for backwards compat display
    expect(vm.statusLabel('SUPERVISOR_SIGNED')).toBe('主管已簽')
  })

  // Case 7: 批次會計簽核 — 帶選取 ids 呼叫 batch wrapper + 成功訊息
  it('signBatch(accounting) 帶選取 ids 呼叫 signAccountingBatch + 重載', async () => {
    setupApiMocks([makeSettlement({ id: 1, status: 'DRAFT' }), makeSettlement({ id: 2, status: 'DRAFT' })])
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      selectedSettlements: Settlement[]
      signBatch: (stage: string) => Promise<void>
    }
    vm.selectedSettlements = [makeSettlement({ id: 1 }), makeSettlement({ id: 2 })]
    vi.mocked(api.signAccountingBatch).mockResolvedValue({
      data: { succeeded_count: 2, succeeded_ids: [1, 2], failed: [] },
    } as never)

    await vm.signBatch('accounting')
    await nextTick()

    expect(api.signAccountingBatch).toHaveBeenCalledWith([1, 2])
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalled()
  })

  // Case 8: 批次有 failed → 顯示 warning（不誤報成功）
  it('signBatch 有 failed 時以 warning 回報部分失敗', async () => {
    setupApiMocks([makeSettlement({ status: 'DRAFT' })])
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      selectedSettlements: Settlement[]
      signBatch: (stage: string) => Promise<void>
    }
    vm.selectedSettlements = [makeSettlement({ id: 1 })]
    vi.mocked(api.finalizeBatch).mockResolvedValue({
      data: { succeeded_count: 0, succeeded_ids: [], failed: [{ settlement_id: 1, reason: '非會計已簽' }] },
    } as never)

    await vm.signBatch('finalize')
    await nextTick()

    expect(api.finalizeBatch).toHaveBeenCalledWith([1])
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    expect(vi.mocked(ElMessage.success)).not.toHaveBeenCalled()
  })
})

/**
 * Finding [4]（P3 perf）：load() 內四支彼此無依賴、皆只吃 cycleId 的 API 原為逐一 await，
 * 首載等待 ≈ 四次 round-trip 相加。改用 Promise.all 併發後應同時發出四支請求。
 * 以「四支皆回 pending 時仍全部被呼叫」作為併發的 characterization。
 */
describe('YearEndDetailView.load — 併發載入（Promise.all）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
  })

  it('load 併發呼叫四支彼此無依賴的 API（非序列 await）', async () => {
    // 四支都回 pending（永不 resolve）：若為序列 await，第一支未完成時後三支不會被呼叫
    vi.mocked(api.listYearEndCycles).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(api.listYearEndSettlements).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(api.listSpecialBonuses).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(api.listClassEnrollmentTargets).mockReturnValue(new Promise(() => {}) as never)

    await mountView()

    expect(api.listYearEndCycles).toHaveBeenCalledTimes(1)
    expect(api.listYearEndSettlements).toHaveBeenCalledTimes(1)
    expect(api.listSpecialBonuses).toHaveBeenCalledTimes(1)
    expect(api.listClassEnrollmentTargets).toHaveBeenCalledTimes(1)
    // 三支吃 cycleId = 1（route.params.id）
    expect(api.listYearEndSettlements).toHaveBeenCalledWith(1)
    expect(api.listSpecialBonuses).toHaveBeenCalledWith(1)
    expect(api.listClassEnrollmentTargets).toHaveBeenCalledWith(1)
  })

  it('併發回應後正確賦值（cycle/settlements 行為不變）', async () => {
    setupApiMocks([makeSettlement({ id: 9, status: 'DRAFT' })])
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      cycle: { id: number } | null
      settlements: Settlement[]
    }
    expect(vm.cycle?.id).toBe(1)
    expect(vm.settlements).toHaveLength(1)
    expect(vm.settlements[0].id).toBe(9)
  })
})
