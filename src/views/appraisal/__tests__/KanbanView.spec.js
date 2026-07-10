import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import KanbanView from '@/views/appraisal/components/KanbanView.vue'

vi.mock('@/api/appraisal', () => ({
  getSignStatusSummary: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

// 全鏈測試（真 SummaryCard）需要權限 mock；預設無任何權限，個別測試設定 grants
const permState = { grants: new Set() }
vi.mock('@/utils/auth', () => ({
  hasPermission: (name) => permState.grants.has(name),
}))

import * as api from '@/api/appraisal'

const stubs = {
  // 把 child components 換成簡單 stub 讓我們可以斷言 prop 與 event
  KanbanColumn: defineComponent({
    props: ['status', 'label', 'summaries', 'selectedIds', 'collapsedByDefault'],
    emits: ['toggle-select', 'select-all', 'action'],
    setup(props, { emit, attrs }) {
      return () => h('div', {
        ...attrs,
        'data-test': `col-${props.status}`,
        'data-count': props.summaries.length,
        'data-collapsed-default': String(props.collapsedByDefault),
      }, [
        h('span', { 'data-test': `col-label-${props.status}` }, `${props.label} (${props.summaries.length})`),
      ])
    },
  }),
  ElCheckbox: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        type: 'checkbox',
        checked: props.modelValue,
        onChange: (e) => emit('update:modelValue', e.target.checked),
      })
    },
  }),
}

const mountOpts = (props = {}) => ({
  props: { cycleId: 3, ...props },
  global: { stubs, directives: { loading: () => {} } },
})

// ── 整鏈測試用（真 KanbanColumn + SummaryCard stub）─────────────
// KanbanColumn 被 stub 掉時測不到「KanbanColumn → SummaryCard 的 prop 傳遞」，
// 這組 stubs 保留真 KanbanColumn，只 stub SummaryCard 與 element-plus 元件。
const SummaryCardStub = defineComponent({
  name: 'SummaryCard',
  // showMenu 必須宣告 Boolean 型別，bare `show-menu` attribute 才會如真元件
  // （defineProps<{ showMenu?: boolean }>）一樣被 Vue cast 成 true。
  props: { summary: Object, selected: Boolean, showMenu: Boolean },
  emits: ['update:selected', 'action'],
  setup(props, { emit }) {
    return () => h('div', {
      'data-test': `summary-card-${props.summary.id}`,
      'data-show-menu': String(props.showMenu ?? false),
      onClick: () => emit('action', { action: 'sign', summary: props.summary }),
    })
  },
})
const chainStubs = {
  SummaryCard: SummaryCardStub,
  ElCheckbox: stubs.ElCheckbox,
  ElButton: { template: '<button><slot /></button>' },
}
const mountChainOpts = (props = {}) => ({
  props: { cycleId: 3, ...props },
  global: { stubs: chainStubs, directives: { loading: () => {} } },
})

// ── 全鏈測試用（真 KanbanColumn + 真 SummaryCard）───────────────
// SummaryCard 的 primaryAction / dropdown 簽核依賴 summary.status——後端
// SignStatusSummaryItem 本就無 per-item status，必須由 KanbanView 注入
// bucket.status。stub 掉 SummaryCard 測不到這條注入鏈，故整鏈掛真元件。
const fullChainStubs = {
  ElCheckbox: stubs.ElCheckbox,
  // 帶 $event：SummaryCard 主按鈕用 @click.stop（修飾子要對 event 呼叫 stopPropagation）
  ElButton: { template: '<button @click="$emit(\'click\', $event)"><slot /></button>' },
  ElDropdown: true,
  ElTag: true,
  ElIcon: true,
}
const mountFullChainOpts = (props = {}) => ({
  props: { cycleId: 3, ...props },
  global: { stubs: fullChainStubs, directives: { loading: () => {} } },
})

const sampleData = {
  data: {
    counts: { DRAFT: 2, SUPERVISOR_SIGNED: 1, ACCOUNTING_SIGNED: 0, FINALIZED: 0 },
    buckets: [
      { status: 'DRAFT', count: 2, summaries: [
        { id: 1, employee_name: 'A', total_score: 80, grade: 'GOOD', bonus_amount: 1000 },
        { id: 2, employee_name: 'B', total_score: 70, grade: 'PASS', bonus_amount: 800 },
      ]},
      { status: 'SUPERVISOR_SIGNED', count: 1, summaries: [
        { id: 3, employee_name: 'C', total_score: 90, grade: 'OUTSTANDING', bonus_amount: 1200 },
      ]},
      { status: 'ACCOUNTING_SIGNED', count: 0, summaries: [] },
      { status: 'FINALIZED', count: 0, summaries: [] },
    ],
  }
}

describe('KanbanView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.grants = new Set()
  })

  it('loads on mount with cycleId and renders 4 columns', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountOpts())
    await nextTick(); await nextTick()
    expect(api.getSignStatusSummary).toHaveBeenCalledWith(3)
    expect(wrapper.find('[data-test="col-DRAFT"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="col-SUPERVISOR_SIGNED"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="col-ACCOUNTING_SIGNED"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="col-FINALIZED"]').exists()).toBe(true)
  })

  it('passes summary count to each column', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountOpts())
    await nextTick(); await nextTick()
    expect(wrapper.find('[data-test="col-DRAFT"]').attributes('data-count')).toBe('2')
    expect(wrapper.find('[data-test="col-SUPERVISOR_SIGNED"]').attributes('data-count')).toBe('1')
    expect(wrapper.find('[data-test="col-ACCOUNTING_SIGNED"]').attributes('data-count')).toBe('0')
  })

  it('FINALIZED column marked collapsedByDefault=true', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountOpts())
    await nextTick(); await nextTick()
    expect(wrapper.find('[data-test="col-FINALIZED"]').attributes('data-collapsed-default')).toBe('true')
    expect(wrapper.find('[data-test="col-DRAFT"]').attributes('data-collapsed-default')).toBe('false')
  })

  it('toggleSelect adds/removes ids and emits selected-changed', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountOpts())
    await nextTick(); await nextTick()
    // simulate column emit
    const draftCol = wrapper.findComponent({ name: 'KanbanColumn' })
    // 找有 status='DRAFT' 的
    const draftStubComp = wrapper.findAllComponents(stubs.KanbanColumn).find(c => c.props('status') === 'DRAFT')
    draftStubComp.vm.$emit('toggle-select', { summaryId: 1, selected: true })
    await nextTick()
    expect(wrapper.emitted('selected-changed')[0][0]).toEqual([1])
    draftStubComp.vm.$emit('toggle-select', { summaryId: 1, selected: false })
    await nextTick()
    expect(wrapper.emitted('selected-changed').at(-1)[0]).toEqual([])
  })

  // Task 8 修繕：KanbanColumn 未傳 show-menu → SummaryCard dropdown（退簽/留言/
  // 看 log）在唯一生產呼叫點恆隱藏（死碼）。整鏈掛真 KanbanColumn 驗證。
  it('看板卡片啟用動作選單：KanbanColumn 對 SummaryCard 傳 show-menu', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountChainOpts())
    await nextTick(); await nextTick()
    const card = wrapper.find('[data-test="summary-card-1"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('data-show-menu')).toBe('true')
  })

  it('action 事件透傳鏈：SummaryCard → KanbanColumn → KanbanView emit action', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountChainOpts())
    await nextTick(); await nextTick()
    await wrapper.find('[data-test="summary-card-1"]').trigger('click')
    const emitted = wrapper.emitted('action')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toMatchObject({ action: 'sign', summary: { id: 1 } })
  })

  // Task 16 fix#3：後端 SignStatusSummaryItem 無 per-item status（sampleData 逐欄抄
  // 契約、items 皆不帶 status）。KanbanView 必須把 bucket.status 注入每筆 item，否則
  // SummaryCard.primaryAction 恆 null（主按鈕永不顯示）、dropdown「簽核」在
  // CycleDetailPanel.onKanbanAction 的 stage map 查無 status → 靜默 no-op。
  it('注入 bucket status：DRAFT 桶卡片渲染「主管簽」主按鈕（守住注入鏈）', async () => {
    permState.grants = new Set(['APPRAISAL_REVIEW'])
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountFullChainOpts())
    await nextTick(); await nextTick()

    const btns = wrapper.findAll('[data-test="summary-primary-action"]')
    // DRAFT 桶 2 筆 → 2 顆主管簽主按鈕；SUPERVISOR_SIGNED 桶 1 筆需 ACCOUNTING 權限 → 不顯示
    expect(btns.length).toBe(2)
    expect(btns[0].text()).toBe('主管簽')
  })

  it('注入 bucket status：卡片 action 事件的 summary 帶正確 status（簽核 stage 推導依據）', async () => {
    permState.grants = new Set(['APPRAISAL_REVIEW'])
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountFullChainOpts())
    await nextTick(); await nextTick()

    await wrapper.find('[data-test="summary-primary-action"]').trigger('click')
    const emitted = wrapper.emitted('action')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toMatchObject({ action: 'sign', summary: { id: 1, status: 'DRAFT' } })
  })

  it('reloads when cycleId changes', async () => {
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    const wrapper = mount(KanbanView, mountOpts({ cycleId: 3 }))
    await nextTick()
    expect(api.getSignStatusSummary).toHaveBeenCalledTimes(1)
    api.getSignStatusSummary.mockResolvedValueOnce(sampleData)
    await wrapper.setProps({ cycleId: 99 })
    await nextTick(); await nextTick()
    expect(api.getSignStatusSummary).toHaveBeenCalledTimes(2)
    expect(api.getSignStatusSummary).toHaveBeenLastCalledWith(99)
  })
})
