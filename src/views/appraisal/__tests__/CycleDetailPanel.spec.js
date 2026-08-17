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
  getSignStatusSummary: vi.fn().mockResolvedValue({
    data: { cycle_id: 5, counts: { DRAFT: 2, SUPERVISOR_SIGNED: 1, ACCOUNTING_SIGNED: 0, FINALIZED: 3 }, buckets: [] },
  }),
  getAppraisalAllEmployeesStatus: vi.fn().mockResolvedValue({
    data: { participants: [{ employee_id: 42, employee_name: '林靜宜', role_group: 'HOMEROOM', attendance: {}, retention: null, activity: null, disciplinary: {} }] },
  }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
}))
import { listAppraisalParticipants, listAppraisalCycles } from '@/api/appraisal'
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

// 內嵌元件仍讀 route.query.view 覆寫預設 view；query 可由測試逐案調整
const routeQuery = { value: {} }
// module-scope 共用物件，讓測試可以斷言 router.replace 被呼叫的參數
// （query 同步邏輯若不驗證呼叫內容，等於只測到「沒噴錯」，測不出寫錯 key）。
const mockRouter = { back: vi.fn(), replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => mockRouter,
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
    emits: ['sign', 'reject', 'comment', 'open-log', 'open-detail', 'update:selected-ids'],
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
    props: ['cycleId', 'stage', 'selectedIds', 'disabled'],
    emits: ['done'],
    setup(props) {
      return () => h('button', { 'data-test': 'batch-btn-stub', disabled: props.disabled }, 'BatchBtn')
    },
  }),
  SignProgressBar: defineComponent({
    name: 'SignProgressBar',
    props: ['counts'],
    setup(props) {
      return () => h('div', { 'data-test': 'sign-progress-bar-stub' }, JSON.stringify(props.counts))
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
  AggregatedStatusDetailDialog: defineComponent({
    name: 'AggregatedStatusDetailDialog',
    props: ['visible', 'participant', 'cycle', 'rules'],
    emits: ['update:visible'],
    setup(props) {
      return () => (props.visible
        ? h('div', { 'data-test': 'detail-dialog-stub' }, props.participant?.employee_name ?? '')
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

  it('batch-zone 常駐顯示；未勾選時 BatchSignButton disabled，勾選後 enabled', async () => {
    const wrapper = mountPanel()
    await flush()
    // 常駐：即使 selectedIds 為空，batch-zone 仍渲染（不再 v-if 隱藏）
    expect(wrapper.find('[data-test="batch-zone"]').exists()).toBe(true)
    const btnsBefore = wrapper.findAll('[data-test="batch-btn-stub"]')
    expect(btnsBefore.length).toBeGreaterThan(0)
    for (const btn of btnsBefore) {
      expect(btn.attributes('disabled')).toBeDefined()
    }

    wrapper.vm.selectedIds = [1, 2]
    await nextTick()
    const btnsAfter = wrapper.findAll('[data-test="batch-btn-stub"]')
    for (const btn of btnsAfter) {
      expect(btn.attributes('disabled')).toBeUndefined()
    }
  })

  it('頂部渲染簽核進度列 SignProgressBar，counts 來自 getSignStatusSummary', async () => {
    const wrapper = mountPanel()
    await flush()
    const bar = wrapper.find('[data-test="sign-progress-bar-stub"]')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('"DRAFT":2')
    expect(bar.text()).toContain('"FINALIZED":3')
  })

  it('opens reject dialog via openReject', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(false)
    wrapper.vm.openReject({ id: 7, status: 'SUPERVISOR_SIGNED' })
    await nextTick()
    expect(wrapper.find('[data-test="reject-dialog-stub"]').exists()).toBe(true)
  })

  it('openDetail(employeeId) 找到對應明細時開啟詳情 dialog', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
    wrapper.vm.openDetail(42)
    await nextTick()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })

  it('openDetail(employeeId) 找不到對應明細時顯示警告、不開啟 dialog', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(9999)
    await nextTick()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('kanban 觸發 action=detail 時開啟對應員工的詳情 dialog', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.view = 'kanban'
    await nextTick()
    await wrapper.findComponent({ name: 'KanbanView' }).vm.$emit('action', { action: 'detail', summary: { id: 1, employee_id: 42, employee_name: '林靜宜' } })
    await nextTick()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })

  it('openDetail(undefined) 為 no-op', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(undefined)
    await nextTick()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
  })

  it('openDetail 成功開啟時同步 employee query', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(42)
    await nextTick()
    const lastCall = mockRouter.replace.mock.calls.at(-1)
    expect(lastCall[0].query.employee).toBe('42')
  })

  it('關閉詳情 dialog 時清除 employee query', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(42)
    await nextTick()
    await wrapper.findComponent({ name: 'AggregatedStatusDetailDialog' }).vm.$emit('update:visible', false)
    await nextTick()
    const lastCall = mockRouter.replace.mock.calls.at(-1)
    expect(lastCall[0].query.employee).toBeUndefined()
  })

  it('URL 帶 employee query 時，載入完成後自動開啟該員工詳情', async () => {
    routeQuery.value = { employee: '42' }
    const wrapper = mountPanel()
    await flush()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })

  it('URL 帶不存在的 employee query 時，不噴錯、不開啟 dialog', async () => {
    routeQuery.value = { employee: '9999' }
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
  })

  it('load() 失敗時顯示錯誤區塊，點重試成功後消失', async () => {
    listAppraisalParticipants.mockRejectedValueOnce(new Error('network error'))
    const wrapper = mountPanel()
    await flush()

    expect(wrapper.find('[data-test="cdp-retry"]').exists()).toBe(true)

    listAppraisalParticipants.mockResolvedValueOnce({ data: [] })
    await wrapper.find('[data-test="cdp-retry"]').trigger('click')
    await flush()

    expect(wrapper.find('[data-test="cdp-retry"]').exists()).toBe(false)
    expect(listAppraisalParticipants).toHaveBeenCalledTimes(2)
  })

  it('cycle 非 OPEN 時隱藏重算按鈕（List 檢視）', async () => {
    listAppraisalCycles.mockResolvedValueOnce({
      data: [{ id: 5, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.6, status: 'LOCKED' }],
    })
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="recompute-btn"]').exists()).toBe(false)
  })

  it('cycle 為 OPEN 時仍依權限顯示重算按鈕（不受本次改動影響的既有行為）', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="recompute-btn"]').exists()).toBe(true)
  })
})
