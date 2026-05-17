import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import CycleDetailView from '@/views/appraisal/CycleDetailView.vue'

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
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' } }),
  useRouter: () => ({ back: vi.fn() }),
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
  ElPageHeader: { template: '<div><slot /></div>' },
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

describe('CycleDetailView', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('defaults to kanban view', async () => {
    const wrapper = mount(CycleDetailView, { global: { stubs } })
    await flush()
    expect(wrapper.find('[data-test="kanban-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="list-view-stub"]').exists()).toBe(false)
  })

  it('switches to list view when view ref is set to list', async () => {
    const wrapper = mount(CycleDetailView, { global: { stubs } })
    await flush()
    wrapper.vm.view = 'list'
    await nextTick()
    expect(wrapper.find('[data-test="list-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kanban-view-stub"]').exists()).toBe(false)
  })

  it('shows batch-zone when selectedIds not empty', async () => {
    const wrapper = mount(CycleDetailView, { global: { stubs } })
    await flush()
    expect(wrapper.find('[data-test="batch-zone"]').exists()).toBe(false)
    wrapper.vm.selectedIds = [1, 2]
    await nextTick()
    expect(wrapper.find('[data-test="batch-zone"]').exists()).toBe(true)
  })

  it('opens reject dialog via openReject', async () => {
    const wrapper = mount(CycleDetailView, { global: { stubs } })
    await flush()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(false)
    wrapper.vm.openReject({ id: 7, status: 'SUPERVISOR_SIGNED' })
    await nextTick()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(true)
  })
})
