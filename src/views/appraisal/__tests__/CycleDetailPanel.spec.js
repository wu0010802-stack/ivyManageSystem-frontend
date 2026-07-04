import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import CycleDetailPanel from '@/views/appraisal/CycleDetailPanel.vue'

vi.mock('@/api/appraisal', () => ({
  listAppraisalParticipants: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalSummaries: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalCatalog: vi.fn().mockResolvedValue({ data: [] }),
  recomputeAppraisalSummaries: vi.fn().mockResolvedValue({ data: {} }),
  signSupervisorAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  signAccountingAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  finalizeAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  listAppraisalCycles: vi.fn().mockResolvedValue({
    data: [
      { id: 5, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.6, status: 'OPEN' },
    ],
  }),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  exportAppraisalTransferRosterXlsxUrl: vi.fn().mockReturnValue('/y'),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

// 內嵌元件仍讀 route.query.view 覆寫預設 view；query 可由測試逐案調整
const routeQuery = { value: {} }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

const stubs = {
  KanbanView: defineComponent({
    name: 'KanbanView',
    props: ['cycleId'],
    emits: ['action', 'selected-changed'],
    setup() {
      return () => h('div', { 'data-test': 'kanban-view-stub' }, 'kanban')
    },
  }),
  ListView: defineComponent({
    name: 'ListView',
    props: ['cycleId', 'participants', 'summaryByParticipant', 'catalog', 'selectedIds', 'busy'],
    emits: ['sign', 'reject', 'comment', 'open-log', 'update:selected-ids'],
    setup() {
      return () => h('div', { 'data-test': 'list-view-stub' }, 'list')
    },
  }),
  RejectDialog: defineComponent({
    name: 'RejectDialog',
    props: ['visible', 'summary'],
    emits: ['update:visible', 'rejected'],
    setup(props) {
      return () => (props.visible
        ? h('div', { 'data-test': 'reject-dialog-stub' }, 'reject')
        : null)
    },
  }),
  CommentDialog: defineComponent({
    name: 'CommentDialog',
    props: ['visible', 'summary'],
    emits: ['update:visible', 'commented'],
    setup(props) {
      return () => (props.visible
        ? h('div', { 'data-test': 'comment-dialog-stub' }, 'comment')
        : null)
    },
  }),
  BatchSignButton: defineComponent({
    name: 'BatchSignButton',
    props: ['cycleId', 'stage', 'selectedIds'],
    emits: ['done'],
    setup() {
      return () => h('button', { 'data-test': 'batch-btn-stub' }, 'BatchBtn')
    },
  }),
  SummaryLogDrawer: defineComponent({
    name: 'SummaryLogDrawer',
    props: ['visible', 'summaryId'],
    emits: ['update:visible'],
    setup(props) {
      return () => (props.visible
        ? h('div', { 'data-test': 'log-drawer-stub' }, 'log')
        : null)
    },
  }),
  ElButton: {
    props: ['type', 'icon', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')" :disabled="loading || disabled"><slot /></button>',
  },
  ElRadioGroup: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div><slot /></div>',
  },
  ElRadioButton: {
    props: ['value'],
    template: '<button @click="$parent.$emit(\'update:modelValue\', value)"><slot /></button>',
  },
}

const flush = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
  await nextTick()
}

const mountPanel = () => mount(CycleDetailPanel, { props: { cycleId: 5 }, global: { stubs } })

describe('CycleDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
  })

  it('defaults to list view（內嵌需求：進頁即列表模式）', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="list-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kanban-view-stub"]').exists()).toBe(false)
  })

  it('query view=kanban 覆寫預設', async () => {
    routeQuery.value = { view: 'kanban' }
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="kanban-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="list-view-stub"]').exists()).toBe(false)
  })

  it('switches to kanban view when view ref is set', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.view = 'kanban'
    await nextTick()
    expect(wrapper.find('[data-test="kanban-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="list-view-stub"]').exists()).toBe(false)
  })

  it('shows cycle meta from listAppraisalCycles by cycleId prop', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.text()).toContain('114 學年')
  })

  it('shows batch-zone when selectedIds not empty', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="batch-zone"]').exists()).toBe(false)
    wrapper.vm.selectedIds = [1, 2]
    await nextTick()
    expect(wrapper.find('[data-test="batch-zone"]').exists()).toBe(true)
  })

  it('opens reject dialog via openReject', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(false)
    wrapper.vm.openReject({ id: 7, status: 'SUPERVISOR_SIGNED' })
    await nextTick()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(true)
  })
})
