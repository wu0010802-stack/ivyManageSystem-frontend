import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import YearEndListView from '../YearEndListView.vue'

// G2：年終週期狀態轉換（OPEN→LOCKED→CLOSED，亦允許倒退救援）—— PATCH /year_end/cycles/{cycle_id}
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

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

const mockHasPermission = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}))

import * as api from '@/api/yearEnd'
import { ElMessage, ElMessageBox } from 'element-plus'

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

async function mountView() {
  const wrapper = mount(YearEndListView, {
    global: {
      stubs: {
        'el-page-header': true,
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
      },
      directives: { loading: () => {} },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndListView — G2 週期狀態操作', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
  })

  it.each([
    ['OPEN', 'success', '開放'],
    ['LOCKED', 'warning', '已鎖定'],
    ['CLOSED', 'info', '已封存'],
  ])('狀態 tag 對照：%s → type=%s、標籤=%s', async (status, expectedType, expectedLabel) => {
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

  it('OPEN 狀態：顯示「鎖定」按鈕；點擊確認後呼叫 updateCycleStatus(id, {status: LOCKED})', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'OPEN' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: makeCycle({ status: 'LOCKED' }) } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      lockCycle: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.lockCycle(vm.cycles[0])
    await nextTick()

    expect(api.updateCycleStatus).toHaveBeenCalledWith(7, { status: 'LOCKED' })
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalled()
  })

  it('LOCKED 狀態：封存操作呼叫 updateCycleStatus(id, {status: CLOSED})', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'LOCKED' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: makeCycle({ status: 'CLOSED' }) } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      closeCycle: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.closeCycle(vm.cycles[0])
    await nextTick()

    expect(api.updateCycleStatus).toHaveBeenCalledWith(7, { status: 'CLOSED' })
    // 封存前提示需全數核定
    expect(vi.mocked(ElMessageBox.confirm)).toHaveBeenCalledWith(
      expect.stringContaining('全數核定'),
      expect.anything(),
      expect.anything(),
    )
  })

  it('LOCKED 狀態：退回開放呼叫 updateCycleStatus(id, {status: OPEN})', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'LOCKED' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: makeCycle({ status: 'OPEN' }) } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      reopenToOpen: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.reopenToOpen(vm.cycles[0])
    await nextTick()

    expect(api.updateCycleStatus).toHaveBeenCalledWith(7, { status: 'OPEN' })
  })

  it('CLOSED 狀態：退回鎖定呼叫 updateCycleStatus(id, {status: LOCKED})', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'CLOSED' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: makeCycle({ status: 'LOCKED' }) } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      reopenToLocked: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.reopenToLocked(vm.cycles[0])
    await nextTick()

    expect(api.updateCycleStatus).toHaveBeenCalledWith(7, { status: 'LOCKED' })
  })

  it('使用者取消確認 dialog → 不呼叫 updateCycleStatus', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'OPEN' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      lockCycle: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.lockCycle(vm.cycles[0])
    await nextTick()

    expect(api.updateCycleStatus).not.toHaveBeenCalled()
  })

  it('後端拒絕（如尚有結算未核定）→ 顯示後端 detail 而非通用錯誤', async () => {
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'LOCKED' })] } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.updateCycleStatus).mockRejectedValue({
      response: { data: { detail: '尚有結算單未核定，無法封存' } },
    })

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      closeCycle: (row: CycleRow) => Promise<void>
      cycles: CycleRow[]
    }

    await vm.closeCycle(vm.cycles[0])
    await nextTick()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('尚有結算單未核定，無法封存')
  })

  it('無 YEAR_END_FINALIZE 權限：週期操作按鈕不顯示（canFinalize=false）', async () => {
    mockHasPermission.mockReturnValue(false)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ status: 'OPEN' })] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { canFinalize: boolean }

    expect(vm.canFinalize).toBe(false)
  })
})
