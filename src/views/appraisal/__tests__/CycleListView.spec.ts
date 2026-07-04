import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import CycleListView from '@/views/appraisal/CycleListView.vue'
import { getCurrentAcademicTerm } from '@/utils/academic'

const CYCLES = [
  { id: 3, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.0, status: 'CLOSED' },
  { id: 4, academic_year: 114, semester: 'SECOND', base_score_calc_date: '2026-03-15', base_score: 80.0, status: 'OPEN' },
  { id: 1, academic_year: 113, semester: 'FIRST', base_score_calc_date: '2024-09-15', base_score: 70.0, status: 'CLOSED' },
  { id: 2, academic_year: 113, semester: 'SECOND', base_score_calc_date: '2025-03-15', base_score: 72.0, status: 'CLOSED' },
]

const listCyclesMock = vi.fn()
vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: (...args: unknown[]) => listCyclesMock(...args),
  createAppraisalCycle: vi.fn().mockResolvedValue({ data: {} }),
  importAppraisalExcel: vi.fn().mockResolvedValue({ data: {} }),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  exportAppraisalTransferRosterXlsxUrl: vi.fn().mockReturnValue('/y'),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: vi.fn().mockReturnValue({ school_year: 114, semester: 2 }),
}))

const routeQuery: { value: Record<string, unknown> } = { value: {} }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: replaceMock }),
}))

const stubs = {
  CycleDetailPanel: defineComponent({
    name: 'CycleDetailPanel',
    props: ['cycleId'],
    setup(props) {
      return () => h('div', { 'data-test': 'detail-panel-stub' }, String(props.cycleId))
    },
  }),
  ElSelect: defineComponent({
    name: 'ElSelect',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    // data-test 由使用端 attrs fallthrough 帶入（只有 toolbar 的 select 有 data-test="cycle-select"）
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  ElOption: defineComponent({
    name: 'ElOption',
    props: ['value', 'label'],
    setup(props) {
      return () => h('div', { 'data-test': 'cycle-option', 'data-value': String(props.value) }, String(props.label))
    },
  }),
  ElEmpty: defineComponent({
    name: 'ElEmpty',
    props: ['description'],
    setup(props, { slots }) {
      return () => h('div', { 'data-test': 'empty-stub' }, [String(props.description), slots.default?.()])
    },
  }),
  ElButton: {
    props: ['type', 'icon', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElInputNumber: { template: '<input />' },
  ElDatePicker: { template: '<input />' },
  ElUpload: { template: '<div><slot /></div>' },
}

const flush = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
}

const mountView = () => mount(CycleListView, { global: { stubs } })

describe('CycleListView（dropdown + 內嵌明細）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
    listCyclesMock.mockResolvedValue({ data: CYCLES })
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 114, semester: 2 })
  })

  it('dropdown 渲染所有週期選項，新到舊排序', async () => {
    const wrapper = mountView()
    await flush()
    const options = wrapper.find('[data-test="cycle-select"]').findAll('[data-test="cycle-option"]')
    expect(options.map((o) => o.text())).toEqual([
      '114 學年下學期（進行中）',
      '114 學年上學期（已封存）',
      '113 學年下學期（已封存）',
      '113 學年上學期（已封存）',
    ])
  })

  it('預設選中當期學期的週期（非最新一筆也優先當期）', async () => {
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 113, semester: 2 })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('2')
  })

  it('當期無週期時 fallback 最新一筆', async () => {
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 115, semester: 1 })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('4')
  })

  it('URL query cycle 有效時優先於當期', async () => {
    routeQuery.value = { cycle: '1' }
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('1')
  })

  it('URL query cycle 無效（不存在的 id）時退回當期', async () => {
    routeQuery.value = { cycle: '999' }
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('4')
  })

  it('預設選中後同步 cycle 至 URL query', async () => {
    mountView()
    await flush()
    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ cycle: '4' }) })
  })

  it('無任何週期時顯示空狀態、不渲染明細', async () => {
    listCyclesMock.mockResolvedValue({ data: [] })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="empty-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="detail-panel-stub"]').exists()).toBe(false)
  })
})
