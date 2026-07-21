import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import YearEndListView from '../YearEndListView.vue'

// Task 10：列表瘦身——移除週期狀態機操作（鎖定/封存/退回，移至 Task 11 明細頁），
// 動作欄收斂為 明細/總表/設定 + 匯出 dropdown；狀態 tag 文案改吃共用常數。
vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    listYearEndCycles: vi.fn(),
    updateCycleStatus: vi.fn(),
    createYearEndCycle: vi.fn().mockResolvedValue({ data: {} }),
    importYearEndExcel: vi.fn().mockResolvedValue({
      data: {
        settlements_upserted: 0,
        special_bonuses_upserted: 0,
        class_targets_upserted: 0,
        skipped_unresolved_names: [],
      },
    }),
    // Task 9：進度欄——各測試預設回一組安全值，避免既有（不關心進度欄的）測試打到真實 axios。
    getCycleProgress: vi.fn().mockResolvedValue({
      data: {
        cycle_status: 'OPEN',
        exception_count: 0,
        finalized_count: 0,
        pending_sign_count: 0,
        settings_complete: true,
        settings_missing_count: 0,
        settlement_count: 0,
        sign_counts: {},
        total_count: 0,
        unmatched_count: 0,
      },
    }),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}))

// Task 7：建立/匯入表單動態預設改讀 useAcademicTermStore（民國學年 114）
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1, setTerm: vi.fn() }),
}))

// Task 7：權限前置——canCreate/canImport 依 hasPermission 決定；預設兩者皆 true
// 以維持既有測試（更多操作 dropdown 可見、新增按鈕非 disabled）不受影響，
// 專屬的權限關閉行為另有獨立測試切換 permState。
const permState = { canCreate: true, canImport: true }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn((name: string) => {
    if (name === 'YEAR_END_FINALIZE') return permState.canCreate
    if (name === 'YEAR_END_WRITE') return permState.canImport
    return false
  }),
}))

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'

interface CycleRow {
  id: number
  academic_year: number
  bonus_calc_date: string
  status: string
}

function makeCycle(overrides: Partial<CycleRow> = {}): CycleRow {
  return {
    id: 7,
    academic_year: 114,
    bonus_calc_date: '2026-01-31',
    status: 'OPEN',
    ...overrides,
  }
}

// el-table / el-table-column 需要真的執行 scoped #default slot 才能驗證表格內按鈕
// gate（比照 ActivityCourseView.promote.test.js 的 table stub 慣例）；其餘元件用全域
// auto-stub 即可（不需要驗證內部渲染）。
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
    // Task 7：新增保留 disabled 供權限前置斷言（原僅轉發 data-* attrs）。
    const passthroughAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-') || k === 'disabled'),
    )
    return () => h(
      'button',
      { ...passthroughAttrs, onClick: () => emit('click') },
      slots.default?.(),
    )
  },
})

const ElDropdownStub = defineComponent({
  name: 'ElDropdownStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-dropdown-stub' }, [
      slots.default?.(),
      slots.dropdown?.(),
    ])
  },
})

const ElDropdownMenuStub = defineComponent({
  name: 'ElDropdownMenuStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-dropdown-menu-stub' }, slots.default?.())
  },
})

const ElDropdownItemStub = defineComponent({
  name: 'ElDropdownItemStub',
  setup(_, { attrs, slots }) {
    return () => h('div', { ...attrs, class: 'el-dropdown-item-stub' }, slots.default?.())
  },
})

// Task 7：權限前置——保留 content/disabled 供斷言 tooltip 是否處於「需要權限」提示狀態。
const ElTooltipStub = defineComponent({
  name: 'ElTooltipStub',
  props: { content: { type: String, default: '' }, disabled: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-tooltip-stub', 'data-content': props.content, 'data-disabled': String(props.disabled) },
        slots.default?.(),
      )
  },
})

async function mountView() {
  const wrapper = mount(YearEndListView, {
    global: {
      stubs: {
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-button': ElButtonStub,
        'el-tag': ElTagStub,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-date-picker': true,
        'el-upload': true,
        'el-radio-group': true,
        'el-radio': true,
        'el-dropdown': ElDropdownStub,
        'el-dropdown-menu': ElDropdownMenuStub,
        'el-dropdown-item': ElDropdownItemStub,
        'el-tooltip': ElTooltipStub,
        'el-icon': true,
        'el-progress': true,
      },
      directives: { loading: () => {} },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndListView — Task 10 列表瘦身', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.canCreate = true
    permState.canImport = true
  })

  it.each([
    ['OPEN', 'success', '開放'],
    ['LOCKED', 'warning', '已鎖定'],
    ['CLOSED', 'info', '已封存'],
  ])('狀態 tag 文案來自 CYCLE_STATUS_LABEL：%s → type=%s、標籤=%s', async (status, expectedType, expectedLabel) => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status })] } as never)
    const wrapper = await mountView()

    const tag = wrapper.find('.el-tag-stub')
    expect(tag.exists()).toBe(true)
    expect(tag.attributes('data-type')).toBe(expectedType)
    expect(tag.text()).toBe(expectedLabel)
  })

  it('P4：Excel 匯入降級為例外 fallback 入口', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle()] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { importFallbackNotice: string }

    expect(wrapper.text()).toContain('更多操作')
    expect(wrapper.text()).not.toContain('上傳 Excel')
    expect(vm.importFallbackNotice).toContain('Excel 匯入僅供例外對稿')
  })

  it('列動作不再包含「鎖定」按鈕（狀態機操作已移出至明細頁，Task 11）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'OPEN' })] } as never)

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('鎖定')
    expect(wrapper.text()).not.toContain('封存')
    expect(wrapper.text()).not.toContain('退回開放')
    expect(wrapper.text()).not.toContain('退回鎖定')
    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(false)
  })

  it('vm 上不再暴露狀態機函式（transitionStatus/lockCycle/closeCycle/reopenToLocked/reopenToOpen/canFinalize）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'OPEN' })] } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Record<string, unknown>

    expect(vm.lockCycle).toBeUndefined()
    expect(vm.closeCycle).toBeUndefined()
    expect(vm.reopenToLocked).toBeUndefined()
    expect(vm.reopenToOpen).toBeUndefined()
    expect(vm.transitionStatus).toBeUndefined()
    expect(vm.canFinalize).toBeUndefined()
    expect(vm.statusBusy).toBeUndefined()
  })

  it('「明細」點擊 push 新巢狀路徑 /appraisal-year-end/year-end/cycles/{id}', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    const detailBtn = wrapper.findAll('button').find((b) => b.text() === '明細')
    expect(detailBtn).toBeTruthy()
    await detailBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/appraisal-year-end/year-end/cycles/1')
  })

  // Task 9：改直連工作區 ?step= query，省去舊 /grid、/config 路徑的 redirect hop。
  it('「總表」點擊直連工作區並帶 step=grid query（不再靠 /grid redirect）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    const gridBtn = wrapper.findAll('button').find((b) => b.text() === '總表')
    expect(gridBtn).toBeTruthy()
    await gridBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({
      path: '/appraisal-year-end/year-end/cycles/1',
      query: { step: 'grid' },
    })
  })

  it('「設定」點擊直連工作區並帶 step=config query（不再靠 /config redirect）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    const configBtn = wrapper.findAll('button').find((b) => b.text() === '設定')
    expect(configBtn).toBeTruthy()
    await configBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({
      path: '/appraisal-year-end/year-end/cycles/1',
      query: { step: 'config' },
    })
  })

  it('匯出 dropdown 內含總表 Excel 與轉帳名冊連結', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('年終獎金總表')
    expect(wrapper.text()).toContain('轉帳名冊')
    const links = wrapper.findAll('a')
    expect(links.some((a) => a.attributes('href') === api.exportYearEndSummaryXlsxUrl(1))).toBe(true)
    expect(links.some((a) => a.attributes('href') === api.exportYearEndTransferRosterXlsxUrl(1))).toBe(true)
  })

  it('頂部改用共用 PageHeader（無返回鍵）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle()] } as never)
    const wrapper = await mountView()

    expect(wrapper.findComponent({ name: 'PageHeader' }).exists()).toBe(true)
  })

  it('新增年度週期按鈕仍可用', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [] } as never)
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('新增年度週期')
  })

  it('提醒後端錯誤訊息（載入失敗時走 apiError）', async () => {
    vi.mocked(api.listYearEndCycles).mockRejectedValue({ response: { data: { detail: '載入異常' } } })

    await mountView()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('載入異常')
  })
})

describe('YearEndListView — Task 9 進度欄', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.canCreate = true
    permState.canImport = true
  })

  it('OPEN 週期：載入清單後並發抓 getCycleProgress，顯示「已核定/總數 未核定」文字', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1, status: 'OPEN' })] } as never)
    vi.mocked(api.getCycleProgress).mockResolvedValue({
      data: {
        cycle_status: 'OPEN',
        exception_count: 0,
        finalized_count: 4,
        pending_sign_count: 1,
        settings_complete: true,
        settings_missing_count: 0,
        settlement_count: 5,
        sign_counts: {},
        total_count: 5,
        unmatched_count: 0,
      },
    } as never)
    const wrapper = await mountView()
    await flushPromises()
    await nextTick()

    expect(api.getCycleProgress).toHaveBeenCalledWith(1)
    const cell = wrapper.find('[data-test="progress-cell"]')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toContain('4/5 未核定')
  })

  it('全數核定：顯示「已核定 N/N」', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 2, status: 'LOCKED' })] } as never)
    vi.mocked(api.getCycleProgress).mockResolvedValue({
      data: {
        cycle_status: 'LOCKED',
        exception_count: 0,
        finalized_count: 5,
        pending_sign_count: 0,
        settings_complete: true,
        settings_missing_count: 0,
        settlement_count: 5,
        sign_counts: {},
        total_count: 5,
        unmatched_count: 0,
      },
    } as never)
    const wrapper = await mountView()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test="progress-cell"]').text()).toContain('已核定 5/5')
  })

  it('該列抓取失敗時只顯示「—」，不拋出、不影響其他列渲染', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 3, status: 'OPEN' })] } as never)
    vi.mocked(api.getCycleProgress).mockRejectedValue(new Error('network down'))
    const wrapper = await mountView()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test="progress-cell"]').text()).toContain('—')
  })

  it('CLOSED 週期不再打 getCycleProgress（已封存週期依業務規則必為全數核定，省一支請求）', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 4, status: 'CLOSED' })] } as never)
    const wrapper = await mountView()
    await flushPromises()
    await nextTick()

    expect(api.getCycleProgress).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="progress-cell"]').text()).toContain('已核定')
  })

  it('N 支 progress 請求並發（非序列瀑布）：多列 getCycleProgress 幾乎同時觸發', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [makeCycle({ id: 10, status: 'OPEN' }), makeCycle({ id: 11, status: 'LOCKED' })],
    } as never)
    const callOrder: number[] = []
    vi.mocked(api.getCycleProgress).mockImplementation(async (cycleId: number) => {
      callOrder.push(cycleId)
      return {
        data: {
          cycle_status: 'OPEN', exception_count: 0, finalized_count: 0, pending_sign_count: 0,
          settings_complete: true, settings_missing_count: 0, settlement_count: 0,
          sign_counts: {}, total_count: 0, unmatched_count: 0,
        },
      } as never
    })
    await mountView()
    await flushPromises()

    // 兩支呼叫都在同一輪微任務內派出（Promise.allSettled 並發），而非等前一筆 resolve 才發下一筆。
    expect(callOrder).toEqual([10, 11])
  })

  it('進度請求不阻塞整表載入：cycles 到位即渲染列，不等 progress resolve', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 5, status: 'OPEN' })] } as never)
    let resolveProgress: (v: unknown) => void = () => {}
    vi.mocked(api.getCycleProgress).mockReturnValue(
      new Promise((resolve) => { resolveProgress = resolve }) as never,
    )
    const wrapper = await mountView()

    // progress 尚未 resolve，但列本身（含操作欄按鈕）已渲染。
    expect(wrapper.findAll('button').some((b) => b.text() === '明細')).toBe(true)
    expect(wrapper.find('[data-test="progress-cell"]').text()).toContain('載入中')

    resolveProgress({
      data: {
        cycle_status: 'OPEN', exception_count: 0, finalized_count: 1, pending_sign_count: 0,
        settings_complete: true, settings_missing_count: 0, settlement_count: 1,
        sign_counts: {}, total_count: 1, unmatched_count: 0,
      },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-test="progress-cell"]').text()).toContain('已核定 1/1')
  })
})

describe('YearEndListView — Task 7 動態預設 + 權限前置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.canCreate = true
    permState.canImport = true
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [] } as never)
  })

  it('openCreate() 依當前學年（useAcademicTermStore school_year=114）動態推算表單預設，非寫死 114', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      form: { academic_year: number; start_date: string; end_date: string; bonus_calc_date: string }
    }

    vm.openCreate()

    // school_year 114 → 西元 2025 起算
    expect(vm.form.academic_year).toBe(114)
    expect(vm.form.start_date).toBe('2025-08-01')
    expect(vm.form.end_date).toBe('2026-07-31')
    expect(vm.form.bonus_calc_date).toBe('2026-01-15')
  })

  it('匯入表單日期預設同公式推算（非空字串），三個歷史魔數改 null', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      importForm: {
        start_date: string
        end_date: string
        bonus_calc_date: string
        org_rate_first: number | null
        org_rate_second: number | null
        enrollment_target: number | null
      }
    }

    expect(vm.importForm.start_date).toBe('2025-08-01')
    expect(vm.importForm.end_date).toBe('2026-07-31')
    expect(vm.importForm.bonus_calc_date).toBe('2026-01-15')
    expect(vm.importForm.org_rate_first).toBeNull()
    expect(vm.importForm.org_rate_second).toBeNull()
    expect(vm.importForm.enrollment_target).toBeNull()
  })

  it('doImport()：三個歷史魔數欄位留空（null）時不帶入 payload，讓後端沿用系統預設', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      importForm: { file: File | null }
      doImport: () => Promise<void>
    }
    vm.importForm.file = new File(['x'], 'test.xls')

    await vm.doImport()

    expect(vi.mocked(api.importYearEndExcel)).toHaveBeenCalledTimes(1)
    const [, params] = vi.mocked(api.importYearEndExcel).mock.calls[0]
    expect(params).not.toHaveProperty('orgRateFirst')
    expect(params).not.toHaveProperty('orgRateSecond')
    expect(params).not.toHaveProperty('enrollmentTarget')
    expect(params).toMatchObject({
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      bonusCalcDate: '2026-01-15',
    })
  })

  it('doImport()：使用者填寫魔數值時正常帶入 payload', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      importForm: {
        file: File | null
        org_rate_first: number | null
        org_rate_second: number | null
        enrollment_target: number | null
      }
      doImport: () => Promise<void>
    }
    vm.importForm.file = new File(['x'], 'test.xls')
    vm.importForm.org_rate_first = 85
    vm.importForm.org_rate_second = 90
    vm.importForm.enrollment_target = 150

    await vm.doImport()

    const [, params] = vi.mocked(api.importYearEndExcel).mock.calls[0]
    expect(params).toMatchObject({ orgRateFirst: 85, orgRateSecond: 90, enrollmentTarget: 150 })
  })

  it('無 YEAR_END_FINALIZE 權限時「新增年度週期」按鈕 disabled，tooltip 顯示提示文案', async () => {
    permState.canCreate = false
    const wrapper = await mountView()

    const addBtn = wrapper.findAll('button').find((b) => b.text() === '新增年度週期')
    expect(addBtn).toBeTruthy()
    expect(addBtn!.attributes('disabled')).not.toBeUndefined()

    const tooltip = wrapper.find('.el-tooltip-stub')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-content')).toBe('需要年終核定權限')
    expect(tooltip.attributes('data-disabled')).toBe('false')
  })

  it('有 YEAR_END_FINALIZE 權限時「新增年度週期」按鈕非 disabled', async () => {
    const wrapper = await mountView()

    const addBtn = wrapper.findAll('button').find((b) => b.text() === '新增年度週期')
    expect(addBtn!.attributes('disabled')).toBeUndefined()

    const tooltip = wrapper.find('.el-tooltip-stub')
    expect(tooltip.attributes('data-disabled')).toBe('true')
  })

  it('無 YEAR_END_WRITE 權限時「更多操作」dropdown 整組隱藏（含例外匯入 Excel）', async () => {
    permState.canImport = false
    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('更多操作')
    expect(wrapper.text()).not.toContain('例外匯入 Excel')
  })

  it('有 YEAR_END_WRITE 權限時「更多操作」dropdown 正常顯示', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('更多操作')
    expect(wrapper.text()).toContain('例外匯入 Excel')
  })
})
