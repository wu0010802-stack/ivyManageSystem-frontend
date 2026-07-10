import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      { ...dataAttrs, onClick: () => emit('click') },
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
        'el-icon': true,
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

  it('「總表」點擊 push /appraisal-year-end/year-end/cycles/{id}/grid', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    const gridBtn = wrapper.findAll('button').find((b) => b.text() === '總表')
    expect(gridBtn).toBeTruthy()
    await gridBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/appraisal-year-end/year-end/cycles/1/grid')
  })

  it('「設定」點擊 push /appraisal-year-end/year-end/cycles/{id}/config', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    const wrapper = await mountView()

    const configBtn = wrapper.findAll('button').find((b) => b.text() === '設定')
    expect(configBtn).toBeTruthy()
    await configBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/appraisal-year-end/year-end/cycles/1/config')
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
