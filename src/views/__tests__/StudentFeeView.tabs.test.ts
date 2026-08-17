/**
 * StudentFeeView：tab lazy mount 與 ?tab= URL 同步。
 *
 * - 非作用中的 tab（費用總覽/退費管理）不得在進頁時就 mount（三套資料不重複載）。
 * - active tab 同步到 ?tab=records|templates|refunds（allowlist，非法值 fallback records）。
 * - 既有 ?search=<學生姓名> 行為保留，且 tab 同步不得覆寫/移除其他 query。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, defineComponent, h } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/fees', () => ({
  getFeePeriods: vi.fn().mockResolvedValue(['114-1', '114-2']),
}))

vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

// --- Mock vue-router（reactive query 讓 watch(() => route.query.tab) 可被觸發）---
const replace = vi.fn()
let mockQuery: Record<string, unknown> = reactive({})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import StudentFeeView from '../StudentFeeView.vue'

// 子 tab 元件 stub：可觀察是否 mount，並提供 records tab 需要的方法
const applySearch = vi.fn()
const fetchRecords = vi.fn()
const FeeRecordsTabStub = defineComponent({
  name: 'FeeRecordsTab',
  setup(_, { expose }) {
    expose({ applySearch, fetchRecords })
    return () => h('div', { 'data-test': 'records-tab' })
  },
})
const FeeTemplateTabStub = defineComponent({
  name: 'FeeTemplateTab',
  setup: () => () => h('div', { 'data-test': 'templates-tab' }),
})
const FeeRefundsTabStub = defineComponent({
  name: 'FeeRefundsTab',
  setup: () => () => h('div', { 'data-test': 'refunds-tab' }),
})

const globalConfig = {
  stubs: {
    'el-tabs': {
      name: 'ElTabs',
      template: '<div data-test="tabs"><slot /></div>',
      props: ['modelValue', 'type'],
      emits: ['update:modelValue', 'tab-change'],
    },
    'el-tab-pane': {
      template: '<section :data-name="name"><slot /></section>',
      props: ['label', 'name'],
    },
    FeeRecordsTab: FeeRecordsTabStub,
    FeeTemplateTab: FeeTemplateTabStub,
    FeeRefundsTab: FeeRefundsTabStub,
    PageHeader: {
      template: '<header data-test="page-header">{{ title }}|{{ subtitle }}</header>',
      props: ['title', 'subtitle'],
    },
  },
}

const mountView = () => shallowMount(StudentFeeView, { global: globalConfig })

describe('StudentFeeView lazy tabs 與 ?tab= 同步', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = reactive({})
  })

  it('預設 records tab；templates / refunds 不預先 mount', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="records-tab"]').exists()).toBe(true)
    expect(w.find('[data-test="templates-tab"]').exists()).toBe(false)
    expect(w.find('[data-test="refunds-tab"]').exists()).toBe(false)
  })

  it('切到 refunds → refunds mount 並 replace ?tab=refunds（保留其他 query）', async () => {
    mockQuery = reactive({ search: '小明' })
    const w = mountView()
    await flushPromises()
    replace.mockClear()

    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'refunds')
    await flushPromises()

    expect(w.find('[data-test="refunds-tab"]').exists()).toBe(true)
    expect(replace).toHaveBeenCalledWith({ query: { search: '小明', tab: 'refunds' } })
  })

  it('深連結 ?tab=templates → templates 為 active 且已 mount，records 不 mount', async () => {
    mockQuery = reactive({ tab: 'templates' })
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('templates')
    expect(w.find('[data-test="templates-tab"]').exists()).toBe(true)
    expect(w.find('[data-test="records-tab"]').exists()).toBe(false)
  })

  it('非法 ?tab=bogus → fallback records（allowlist）', async () => {
    mockQuery = reactive({ tab: 'bogus' })
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('records')
    expect(w.find('[data-test="records-tab"]').exists()).toBe(true)
  })

  it('外部 query 變動（上一頁）→ activeTab 跟隨且新 tab mount', async () => {
    const w = mountView()
    await flushPromises()
    mockQuery.tab = 'refunds'
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('refunds')
    expect(w.find('[data-test="refunds-tab"]').exists()).toBe(true)
  })

  it('?search= 預填學生姓名（既有行為保留），且不把姓名寫進 replace 的 query 之外新增鍵', async () => {
    mockQuery = reactive({ search: '王小美' })
    mountView()
    await flushPromises()
    expect(applySearch).toHaveBeenCalledWith('王小美')
    // tab 同步只會補 tab 鍵；不得新增任何含姓名的新 query 鍵
    for (const call of replace.mock.calls) {
      const q = (call[0] as { query: Record<string, unknown> }).query
      expect(Object.keys(q).sort()).toEqual(['search', 'tab'])
    }
  })

  it('subtitle 為不誤導文案（不再宣稱「本學期」）', async () => {
    const w = mountView()
    await flushPromises()
    const header = w.find('[data-test="page-header"]').text()
    expect(header).toContain('查看各學期、班級的應收費用與繳費狀態')
    expect(header).not.toContain('本學期')
  })
})
