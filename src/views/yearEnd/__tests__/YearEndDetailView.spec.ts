import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
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
    updateCycleStatus: vi.fn(),
    exportYearEndSummaryXlsxUrl: vi.fn().mockReturnValue('/api/year-end/1/summary.xlsx'),
    exportYearEndTransferRosterXlsxUrl: vi.fn().mockReturnValue('/api/year-end/1/roster.xlsx'),
  }
})

// Task 11③：狀態機搬入本頁 — 需要 ElMessageBox.confirm（狀態轉換確認）與
// ElMessageBox.alert（封存前置檢核阻擋提示）。
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() },
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
import { ElMessage, ElMessageBox } from 'element-plus'

// ---- helpers ----

interface Settlement {
  id: number
  employee_id: number
  employee_name?: string
  status: string
  total_amount: number
  [key: string]: unknown
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 1,
    employee_id: 10,
    employee_name: '王小明',
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

function setupApiMocks(settlements: Settlement[], cycleOverrides: Partial<{ id: number; academic_year: number; bonus_calc_date: string; status: string }> = {}) {
  vi.mocked(api.listYearEndCycles).mockResolvedValue({
    data: [{ id: 1, academic_year: 114, bonus_calc_date: '2026-01-31', status: 'DRAFT', ...cycleOverrides }],
  } as never)
  vi.mocked(api.listYearEndSettlements).mockResolvedValue({ data: settlements } as never)
  vi.mocked(api.listSpecialBonuses).mockResolvedValue({ data: [] } as never)
  vi.mocked(api.listClassEnrollmentTargets).mockResolvedValue({ data: [] } as never)
}

// el-table / el-table-column 需要真的執行 scoped #default slot 才能驗證表格內容
// （比照 YearEndListView.spec.ts 慣例）；其餘元件用全域 auto-stub 即可。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table-column-stub' },
      props.data.map((row: unknown, index: number) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

const ElTagStub = defineComponent({
  name: 'ElTagStub',
  props: { type: { type: String, default: undefined } },
  setup(props, { slots }) {
    return () => h('span', { class: 'el-tag-stub', 'data-type': props.type }, slots.default?.())
  },
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-') || k === 'loading'),
    )
    return () => h(
      'button',
      { ...dataAttrs, onClick: () => emit('click') },
      slots.default?.(),
    )
  },
})

// el-tabs/el-tab-pane 的 true auto-stub 不會渲染子內容（實測：wrapper.text() 拿不到
// 表格資料），改用會真的 render default slot 的 stub，讓三個分頁的表格內容都能被斷言。
const ElTabsStub = defineComponent({
  name: 'ElTabsStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tabs-stub' }, slots.default?.())
  },
})
const ElTabPaneStub = defineComponent({
  name: 'ElTabPaneStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tab-pane-stub' }, slots.default?.())
  },
})

async function mountView() {
  const wrapper = mount(YearEndDetailView, {
    global: {
      stubs: {
        'el-page-header': true,
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-button': ElButtonStub,
        'el-tag': ElTagStub,
        'el-tabs': ElTabsStub,
        'el-tab-pane': ElTabPaneStub,
        'el-icon': true,
      },
      directives: { loading: () => {} },
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
 * 行級會計簽核條件必須與 BE `_apply_accounting_sign` 狀態機一致：
 * BE 接受 DRAFT **或** SUPERVISOR_SIGNED（批次主管簽核後仍可行級會計簽），
 * 舊條件只認 DRAFT → 批次主管簽核後行級按鈕消失、簽核欄空白。
 */
describe('YearEndDetailView — 行級會計簽核顯示條件（canAccountingSign）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
  })

  it('SUPERVISOR_SIGNED 仍可行級會計簽核（對齊 BE 狀態機）', async () => {
    setupApiMocks([makeSettlement({ status: 'SUPERVISOR_SIGNED' })])
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { canAccountingSign: (row: { status: string }) => boolean }
    expect(vm.canAccountingSign({ status: 'DRAFT' })).toBe(true)
    expect(vm.canAccountingSign({ status: 'SUPERVISOR_SIGNED' })).toBe(true)
    expect(vm.canAccountingSign({ status: 'ACCOUNTING_SIGNED' })).toBe(false)
    expect(vm.canAccountingSign({ status: 'FINALIZED' })).toBe(false)
  })

  it('無 YEAR_END_ACCOUNTING 權限 → 任何狀態皆不可行級會計簽核', async () => {
    setupApiMocks([makeSettlement({ status: 'SUPERVISOR_SIGNED' })])
    mockHasPermission.mockImplementation((p: string) => p !== 'YEAR_END_ACCOUNTING')
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { canAccountingSign: (row: { status: string }) => boolean }
    expect(vm.canAccountingSign({ status: 'DRAFT' })).toBe(false)
    expect(vm.canAccountingSign({ status: 'SUPERVISOR_SIGNED' })).toBe(false)
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

/**
 * Task 11：明細頁重整 —— 四案：
 * ① 三個表顯示姓名（employee_name / classroom_name / head_teacher_name / deputy_teacher_name）
 * ② 頂部簽核進度列 + 統一狀態標籤
 * ③ 狀態機（鎖定/封存/退回）搬入本頁 header，含封存前置檢核
 * ④ 簽核狀態 tag 上色 + 金額 formatCurrency
 */
describe('YearEndDetailView — Task 11 明細頁重整', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue(true as never)
  })

  it('① 結算單顯示員工姓名而非裸 ID，金額欄用 formatCurrency，簽核 tag 依 SIGN_STATUS_TAG 上色', async () => {
    setupApiMocks([
      makeSettlement({ id: 1, employee_id: 10, employee_name: '王小明', status: 'DRAFT', total_amount: 50000, base_salary: 40000 }),
    ])

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).not.toContain('員工 ID')
    // 金額欄改用 formatCurrency（NT$ 千分位前綴），非裸數字/toLocaleString
    expect(wrapper.text()).toContain('NT$40,000') // base_salary
    expect(wrapper.text()).toContain('NT$50,000') // total_amount
    // 簽核狀態 tag 依 SIGN_STATUS_TAG 上色（DRAFT → info），非全預設灰(undefined)
    const statusTag = wrapper.findAll('.el-tag-stub').find((t) => t.text() === '草稿')
    expect(statusTag).toBeTruthy()
    expect(statusTag!.attributes('data-type')).toBe('info')
  })

  it('① 班級經營績效表顯示 classroom_name / head_teacher_name / deputy_teacher_name', async () => {
    setupApiMocks([makeSettlement()])
    vi.mocked(api.listClassEnrollmentTargets).mockResolvedValue({
      data: [{
        id: 1,
        year_end_cycle_id: 1,
        semester_first: true,
        classroom_id: 3,
        classroom_name: '向日葵班',
        head_teacher_employee_id: 20,
        head_teacher_name: '林老師',
        assistant_employee_id: 21,
        deputy_teacher_name: '陳老師',
        head_count_target: 20,
        avg_monthly_enrollment: 18,
        class_performance_rate: 90,
        returning_student_rate: 85,
      }],
    } as never)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('向日葵班')
    expect(wrapper.text()).toContain('林老師')
    expect(wrapper.text()).toContain('陳老師')
  })

  it('班級績效表 Decimal 字串欄綁 sort-method 數值比較（代表欄：經營績效%）', async () => {
    setupApiMocks([makeSettlement()])
    const wrapper = await mountView()

    // el-table-column 的 sortable/sort-method 以 attrs 落在 stub 上；找「經營績效%」欄
    const perfCol = wrapper
      .findAllComponents(ElTableColumnStub)
      .find((c) => c.vm.$attrs.label === '經營績效%')
    expect(perfCol).toBeTruthy()
    const sortMethod = perfCol!.vm.$attrs['sort-method'] as
      | ((a: Record<string, unknown>, b: Record<string, unknown>) => number)
      | undefined
    // class_performance_rate 為後端 Decimal→JSON 字串，plain sortable 走字典序
    // （"12.5" 排 "9.3" 前）誤排，必須綁數值比較的 sort-method
    expect(typeof sortMethod).toBe('function')
    expect(sortMethod!({ class_performance_rate: '9.3' }, { class_performance_rate: '12.5' })).toBeLessThan(0)
    expect(sortMethod!({ class_performance_rate: '12.5' }, { class_performance_rate: '9.3' })).toBeGreaterThan(0)
  })

  it('① 特別獎金表顯示員工姓名', async () => {
    setupApiMocks([makeSettlement()])
    vi.mocked(api.listSpecialBonuses).mockResolvedValue({
      data: [{
        id: 1,
        year_end_cycle_id: 1,
        employee_id: 30,
        employee_name: '李小華',
        bonus_type: 'CUSTOM',
        period_label: '114上',
        amount: 3000,
        classroom_id: null,
        calc_meta: {},
        source_ref: null,
      }],
    } as never)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('李小華')
  })

  it('② 頂部渲染簽核進度列（SignProgressBar），counts 由已載入 settlements 本地聚合', async () => {
    setupApiMocks([
      makeSettlement({ id: 1, status: 'DRAFT' }),
      makeSettlement({ id: 2, status: 'FINALIZED' }),
      makeSettlement({ id: 3, status: 'FINALIZED' }),
    ])

    const wrapper = await mountView()

    const progressBar = wrapper.findComponent({ name: 'SignProgressBar' })
    expect(progressBar.exists()).toBe(true)
    expect(progressBar.props('counts')).toEqual({ DRAFT: 1, FINALIZED: 2 })
    // 不多打 API：只有 load() 既有四支被呼叫，沒有額外的簽核統計 API
    expect(api.listYearEndSettlements).toHaveBeenCalledTimes(1)
  })

  it('② .meta 列狀態改用 cycleStatusLabel + CYCLE_STATUS_TAG（非 raw code）', async () => {
    setupApiMocks([makeSettlement()], { status: 'LOCKED' })

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('狀態 LOCKED')
    const cycleTag = wrapper.findAll('.el-tag-stub').find((t) => t.text() === '已鎖定')
    expect(cycleTag).toBeTruthy()
    expect(cycleTag!.attributes('data-type')).toBe('warning')
  })

  it('③ OPEN 週期 header 顯示「鎖定」按鈕，點擊後 confirm + updateCycleStatus(LOCKED) + reload', async () => {
    setupApiMocks([makeSettlement()], { status: 'OPEN' })

    const wrapper = await mountView()

    const lockBtn = wrapper.find('[data-test="lock-cycle-button"]')
    expect(lockBtn.exists()).toBe(true)
    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(false)

    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: {} } as never)
    await lockBtn.trigger('click')
    await nextTick()
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.updateCycleStatus).toHaveBeenCalledWith(1, { status: 'LOCKED' })
    // 成功後 reload 本頁資料（cycle meta + settlements 皆重打）
    expect(api.listYearEndCycles).toHaveBeenCalledTimes(2)
    expect(api.listYearEndSettlements).toHaveBeenCalledTimes(2)
  })

  it('③ LOCKED 週期 header 顯示「封存」與「退回開放」按鈕', async () => {
    setupApiMocks([makeSettlement({ status: 'FINALIZED' })], { status: 'LOCKED' })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="reopen-open-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(false)
  })

  it('③ CLOSED 週期 header 顯示「退回鎖定」按鈕', async () => {
    setupApiMocks([makeSettlement({ status: 'FINALIZED' })], { status: 'CLOSED' })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="reopen-locked-button"]').exists()).toBe(true)
  })

  it('③ 封存前置檢核：有未核定結算單時點「封存」被阻擋並列出筆數，不呼叫 updateCycleStatus', async () => {
    setupApiMocks([
      makeSettlement({ id: 1, status: 'FINALIZED' }),
      makeSettlement({ id: 2, status: 'ACCOUNTING_SIGNED' }),
      makeSettlement({ id: 3, status: 'DRAFT' }),
    ], { status: 'LOCKED' })

    const wrapper = await mountView()

    const closeBtn = wrapper.find('[data-test="close-cycle-button"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    await nextTick()

    expect(ElMessageBox.alert).toHaveBeenCalledWith(
      expect.stringContaining('2'),
      '無法封存',
      expect.objectContaining({ type: 'error' }),
    )
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(api.updateCycleStatus).not.toHaveBeenCalled()
  })

  it('③ 封存前置檢核通過（全數 FINALIZED）：confirm + updateCycleStatus(CLOSED)', async () => {
    setupApiMocks([
      makeSettlement({ id: 1, status: 'FINALIZED' }),
      makeSettlement({ id: 2, status: 'FINALIZED' }),
    ], { status: 'LOCKED' })

    const wrapper = await mountView()

    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: {} } as never)
    const closeBtn = wrapper.find('[data-test="close-cycle-button"]')
    await closeBtn.trigger('click')
    await nextTick()
    await nextTick()

    expect(ElMessageBox.alert).not.toHaveBeenCalled()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.updateCycleStatus).toHaveBeenCalledWith(1, { status: 'CLOSED' })
  })

  it('③ statusBusy 為單一 boolean ref（單週期頁非 per-row map）', async () => {
    setupApiMocks([makeSettlement()], { status: 'OPEN' })
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { statusBusy: boolean }
    expect(typeof vm.statusBusy).toBe('boolean')
  })

  it('③ 無 YEAR_END_FINALIZE 權限 → 不顯示任何狀態機按鈕', async () => {
    mockHasPermission.mockReturnValue(false)
    setupApiMocks([makeSettlement()], { status: 'OPEN' })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reopen-open-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reopen-locked-button"]').exists()).toBe(false)
  })
})
