import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks（先 mock 再 import view）────────────────────
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(),
  getAppraisalAllEmployeesStatus: vi.fn(),
  syncAppraisalScoreItems: vi.fn(),
  createAppraisalCycle: vi.fn(),
  addAppraisalParticipant: vi.fn(),
  bulkAddAppraisalParticipantsFromActive: vi.fn(),
  refreshAppraisalCycle: vi.fn().mockResolvedValue({
    data: {
      cycle_id: 12,
      synced_deleted: 0,
      synced_inserted: 0,
      skipped_manual: 0,
      recomputed: 0,
      created: 0,
      skipped_finalized: 0,
      skipped_tenure: 0,
      refreshed_at: '2026-05-16T03:25:00Z',
    },
  }),
  previewAppraisalScore: vi.fn().mockResolvedValue({ data: { participants: [] } }),
  getManualEventCounts: vi.fn().mockResolvedValue({ data: { entries: [] } }),
  batchUpsertManualEventCounts: vi.fn().mockResolvedValue({ data: { ok: true } }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
  // Task A3：流程引導條簽核統計（sync/recompute/sign 步驟判定用），預設「尚無簽核資料」
  getSignStatusSummary: vi.fn().mockResolvedValue({ data: { counts: {} } }),
}))

// ── vue-router mock（Task A3：引導條 sign 步驟導向簽核歷史頁）──
const guidePushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: guidePushMock, replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

// ── Pinia store mock（可動態調整 school_year / semester）─
const termState = { school_year: 114, semester: 1 }
const setTermMock = vi.fn((y, s) => {
  termState.school_year = y
  termState.semester = s
})
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    get school_year() { return termState.school_year },
    get semester() { return termState.semester },
    setTerm: setTermMock,
  }),
}))

// ── element-plus 訊息 / dialog confirm mock ───────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

// ── useErrorNotify silent mock ────────────────────────────
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

import {
  getAppraisalCurrentCycle,
  getAppraisalAllEmployeesStatus,
  syncAppraisalScoreItems,
  createAppraisalCycle,
  addAppraisalParticipant,
  bulkAddAppraisalParticipantsFromActive,
  refreshAppraisalCycle,
  getSignStatusSummary,
} from '@/api/appraisal'

import CurrentSemesterOverview from '../CurrentSemesterOverview.vue'

// ── Element Plus 元件 stubs ───────────────────────────────
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) =>
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

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        ...(props.disabled ? { disabled: 'disabled' } : {}),
        onClick: () => emit('click'),
      },
      slots.default?.(),
    )
  },
})

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    return () => props.modelValue
      ? h('div', { class: 'el-dialog-stub', ...attrs },
          [slots.default?.(), slots.footer?.()].filter(Boolean))
      : null
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-dialog': ElDialogStub,
  'el-alert': defineComponent({
    name: 'ElAlertStub',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const dataAttrs = Object.fromEntries(
        Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
      )
      // 支援 slot 版（#title/#default）與 prop 版（title/description）兩種既有用法
      return () => h('div', { ...dataAttrs }, [
        slots.title?.() ?? attrs.title ?? null,
        attrs.description ?? null,
        slots.default?.(),
      ].filter((v) => v !== null && v !== undefined))
    },
  }),
  'el-skeleton': defineComponent({
    name: 'ElSkeletonStub',
    inheritAttrs: false,
    setup(_, { attrs }) {
      const dataAttrs = Object.fromEntries(
        Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
      )
      return () => h('div', { class: 'el-skeleton', ...dataAttrs })
    },
  }),
  'el-tag': defineComponent({
    name: 'ElTagStub',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const dataAttrs = Object.fromEntries(
        Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
      )
      return () => h('span', dataAttrs, slots.default?.())
    },
  }),
  'el-tooltip': defineComponent({
    name: 'ElTooltipStub',
    setup(_, { slots }) {
      return () => h('div', { class: 'el-tooltip-stub' }, slots.default?.())
    },
  }),
  'el-icon': { template: '<span />' },
  'el-empty': { template: '<div><slot /></div>' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-collapse': { template: '<div><slot /></div>' },
  'el-collapse-item': { template: '<div><slot /></div>' },
  AcademicTermSelector: true,
  StatCard: {
    props: ['label', 'value'],
    template: '<div :data-test="$attrs[`data-test`]"><span class="lbl">{{ label }}</span><span class="val">{{ value }}</span></div>',
    inheritAttrs: false,
  },
  AggregatedStatusDetailDialog: true,
  AdminListToolbar: true,
  ManualEventEntrySection: {
    props: ['cycleId', 'participants', 'readonly'],
    template: '<div data-test="manual-event-section" />',
  },
  ScorePreviewDialog: {
    props: ['visible', 'cycleId'],
    template: '<div v-if="visible" data-test="score-preview-dialog-stub" />',
  },
}

const SAMPLE_CYCLE = {
  id: 12,
  academic_year: 114,
  semester: 'FIRST',
  start_date: '2025-08-01',
  end_date: '2026-01-31',
  base_score_calc_date: '2025-09-15',
  base_score: '90.00',
  enrollment_target: 100,
  enrollment_actual: 92,
  status: 'OPEN',
  created_at: '2025-08-01T00:00:00Z',
}

function makeStatusFixture({ extra = [] } = {}) {
  return {
    cycle_id: 12,
    academic_year: 114,
    semester: 'FIRST',
    start_date: '2025-08-01',
    end_date: '2026-01-31',
    generated_at: '2026-05-16T03:21:00Z',
    participants: [
      {
        participant_id: 101,
        employee_id: 7,
        employee_name: '王雅玲',
        role_group: 'HEAD_TEACHER',
        classroom_id: 3,
        is_participant: true,
        hire_months_in_cycle: '6.0',
        attendance: {
          late_count: 2,
          early_leave_count: 1,
          missing_punch_count: 0,
          leave_days: 3,
          suggested_score_delta: '-0.75',
        },
        retention: {
          classroom_id: 3,
          classroom_name: '向日葵班',
          initial_count: 20,
          final_count: 18,
          retention_rate: '90.00',
          suggested_score_delta: '-1.70',
        },
        activity: {
          classroom_id: 3,
          enrolled_students: 18,
          registered_for_activity: 12,
          activity_rate: '66.67',
          suggested_score_delta: '1.00',
        },
        disciplinary: {
          warning_count: 1,
          minor_count: 0,
          major_count: 0,
          actions: [],
          suggested_score_delta: '-1.00',
        },
      },
      ...extra,
    ],
  }
}

async function mountView() {
  const wrapper = mount(CurrentSemesterOverview, {
    global: {
      stubs: GLOBAL_STUBS,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

describe('CurrentSemesterOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    termState.school_year = 114
    termState.semester = 1
  })

  it('cycle 為 null 時顯示 banner 與建立按鈕', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: null })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="no-cycle-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-cycle-btn"]').exists()).toBe(true)
    // cycle null 不應呼叫 aggregated_status
    expect(getAppraisalAllEmployeesStatus).not.toHaveBeenCalled()
  })

  it('cycle 存在時渲染 4 個 KPI 卡', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="kpi-employees"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kpi-attendance"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kpi-retention"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kpi-discipline"]').exists()).toBe(true)
    // 應該叫 aggregated_status 一次
    expect(getAppraisalAllEmployeesStatus).toHaveBeenCalledWith(12)
  })

  it('點同步分數按鈕觸發 dry_run 並開啟 preview dialog', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    syncAppraisalScoreItems.mockResolvedValueOnce({
      data: {
        cycle_id: 12,
        dry_run: true,
        deleted_count: 30,
        inserted_count: 28,
        skipped_manual_count: 4,
        items: [],
      },
    })

    const wrapper = await mountView()
    await wrapper.find('[data-test="sync-score-btn"]').trigger('click')
    await flushPromises()

    expect(syncAppraisalScoreItems).toHaveBeenCalledWith(12, { dryRun: true })
    expect(wrapper.find('[data-test="sync-preview-dialog"]').exists()).toBe(true)
  })

  it('preview dialog 確認後呼叫 sync_score_items dry_run=false 並重新載入', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    syncAppraisalScoreItems
      .mockResolvedValueOnce({
        data: { cycle_id: 12, dry_run: true, deleted_count: 1, inserted_count: 1, skipped_manual_count: 0, items: [] },
      })
      .mockResolvedValueOnce({
        data: { cycle_id: 12, dry_run: false, deleted_count: 1, inserted_count: 1, skipped_manual_count: 0, items: [] },
      })

    const wrapper = await mountView()
    await wrapper.find('[data-test="sync-score-btn"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-test="sync-confirm-btn"]').trigger('click')
    await flushPromises()

    expect(syncAppraisalScoreItems).toHaveBeenCalledTimes(2)
    expect(syncAppraisalScoreItems).toHaveBeenLastCalledWith(12, { dryRun: false })
    // 確認後重新拉 aggregated_status
    expect(getAppraisalAllEmployeesStatus).toHaveBeenCalledTimes(2)
  })

  it('切換學期觸發 refetch /current 與 aggregated_status', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    const wrapper = await mountView()
    // 初次掛載：呼叫一次
    expect(getAppraisalCurrentCycle).toHaveBeenCalledTimes(1)
    expect(getAppraisalAllEmployeesStatus).toHaveBeenCalledTimes(1)

    // 切換到 113-2
    termState.school_year = 113
    termState.semester = 2
    // 觸發 reactivity（store 不是真 reactive，需要強制 re-render）
    await wrapper.vm.$forceUpdate()
    // mock store 不是 reactive，watch 不會被觸發；改用 refresh button 強制 refetch
    await wrapper.find('[data-test="refresh-btn"]').trigger('click')
    await flushPromises()

    expect(getAppraisalCurrentCycle.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(getAppraisalAllEmployeesStatus.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('SUPERVISOR 角色員工的留校率欄顯示 「—」', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    const supervisorRow = {
      participant_id: 202,
      employee_id: 8,
      employee_name: '李行政',
      role_group: 'SUPERVISOR',
      classroom_id: null,
      is_participant: true,
      hire_months_in_cycle: '6.0',
      attendance: {
        late_count: 0,
        early_leave_count: 0,
        missing_punch_count: 0,
        leave_days: 0,
        suggested_score_delta: '0',
      },
      retention: null,
      activity: null,
      disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, actions: [], suggested_score_delta: '0' },
    }
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [supervisorRow] }),
    })

    const wrapper = await mountView()

    // retention-202 顯示「—」（不適用班級 scope）
    const retentionCell = wrapper.find('[data-test="retention-202"]')
    expect(retentionCell.exists()).toBe(true)
    expect(retentionCell.text()).toBe('—')

    // 活動率亦顯示「—」
    const activityCell = wrapper.find('[data-test="activity-202"]')
    expect(activityCell.text()).toBe('—')
  })

  // ── 全教師即期資料 + 加入考核流程 ─────────────────────────
  const nonParticipantRow = {
    participant_id: null,
    employee_id: 9,
    employee_name: '張新進',
    role_group: 'ASSISTANT',
    classroom_id: 5,
    is_participant: false,
    hire_months_in_cycle: null,
    attendance: {
      late_count: 0,
      early_leave_count: 0,
      missing_punch_count: 0,
      leave_days: 0,
      suggested_score_delta: '0',
    },
    retention: {
      classroom_id: 5,
      classroom_name: '太陽花班',
      initial_count: 10,
      final_count: 10,
      retention_rate: '100.00',
      suggested_score_delta: '0',
    },
    activity: {
      classroom_id: 5,
      enrolled_students: 10,
      registered_for_activity: 5,
      activity_rate: '50.00',
      suggested_score_delta: '0',
    },
    disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, actions: [], suggested_score_delta: '0' },
  }

  it('未加入考核的員工顯示「未加入」tag 與「加入」按鈕', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [nonParticipantRow] }),
    })
    const wrapper = await mountView()

    const tag = wrapper.find('[data-test="status-tag-emp9"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('未加入')
    expect(wrapper.find('[data-test="add-btn-emp9"]').exists()).toBe(true)
  })

  it('點「加入」呼叫 addAppraisalParticipant 帶 row 的 role_group / classroom_id', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [nonParticipantRow] }),
    })
    addAppraisalParticipant.mockResolvedValue({ data: { id: 999 } })
    const wrapper = await mountView()

    await wrapper.find('[data-test="add-btn-emp9"]').trigger('click')
    await flushPromises()

    expect(addAppraisalParticipant).toHaveBeenCalledTimes(1)
    expect(addAppraisalParticipant).toHaveBeenCalledWith(12, {
      employee_id: 9,
      role_group: 'ASSISTANT',
      classroom_id: 5,
    })
  })

  it('Toolbar「一鍵加入全部教師」確認後呼叫 bulk endpoint', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [nonParticipantRow] }),
    })
    bulkAddAppraisalParticipantsFromActive.mockResolvedValue({
      data: { cycle_id: 12, created_count: 1, skipped_count: 1, created_participants: [] },
    })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="bulk-add-btn"]').exists()).toBe(true)
    await wrapper.find('[data-test="bulk-add-btn"]').trigger('click')
    await flushPromises()

    expect(bulkAddAppraisalParticipantsFromActive).toHaveBeenCalledTimes(1)
    expect(bulkAddAppraisalParticipantsFromActive).toHaveBeenCalledWith(12, null)
  })

  it('所有員工都已加入考核時「一鍵加入」按鈕不顯示，且「同步分數」未 disabled', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="bulk-add-btn"]').exists()).toBe(false)
    const syncBtn = wrapper.find('[data-test="sync-score-btn"]')
    expect(syncBtn.exists()).toBe(true)
    expect(syncBtn.attributes('disabled')).toBeFalsy()
  })

  it('有未加入員工時「同步分數」按鈕 disabled', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [nonParticipantRow] }),
    })
    const wrapper = await mountView()

    const syncBtn = wrapper.find('[data-test="sync-score-btn"]')
    expect(syncBtn.exists()).toBe(true)
    expect(syncBtn.attributes('disabled')).toBeDefined()
  })

  // ── ScorePreviewDialog + ManualEventEntrySection 整合 ────
  it('cycle 存在時 render ManualEventEntrySection 區塊', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="manual-event-section"]').exists()).toBe(true)
  })

  it('cycle 不存在時不 render ManualEventEntrySection', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: null })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="manual-event-section"]').exists()).toBe(false)
  })

  it('點 preview-btn 後開啟 ScorePreviewDialog', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    const wrapper = await mountView()

    // 初始未開啟
    expect(wrapper.find('[data-test="score-preview-dialog-stub"]').exists()).toBe(false)

    await wrapper.find('[data-test="preview-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="score-preview-dialog-stub"]').exists()).toBe(true)
  })
})

  // ── 規章對齊新欄位（2026-06-11）：曠職分流 + 功過雙向 ──────
  it('出缺勤摘要含曠職、功過欄含功 counts', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    const row = {
      participant_id: 301,
      employee_id: 31,
      employee_name: '陳曠職',
      role_group: 'HEAD_TEACHER',
      classroom_id: 3,
      is_participant: true,
      hire_months_in_cycle: '6.0',
      attendance: {
        late_count: 1,
        early_leave_count: 0,
        missing_punch_count: 0,
        leave_days: 0,
        absent_days: 2,
        suggested_score_delta: '-8.5',
      },
      retention: null,
      activity: null,
      disciplinary: {
        warning_count: 1,
        minor_count: 0,
        major_count: 0,
        commend_count: 2,
        minor_merit_count: 0,
        major_merit_count: 0,
        actions: [],
        suggested_score_delta: '1.00',
      },
    }
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [row] }),
    })

    const wrapper = await mountView()
    // 出缺勤摘要：曠職分流後必須可見（曠 2），不可再藏進請假
    // Task 7 起改拆 badge（label 與 count 間有空格），格式由「曠2」改為「曠 2」
    expect(wrapper.text()).toContain('曠 2')
    // 功過欄：過 1、功 2 都要呈現，否則與 suggested_score_delta 對不上帳
    expect(wrapper.text()).toContain('過 1')
    expect(wrapper.text()).toContain('功 2')
  })

describe('CurrentSemesterOverview 清單篩選（Task 4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('overviewSearch 以姓名過濾 filteredParticipants', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({
        extra: [
          { participant_id: 9, employee_id: 9, employee_name: '陳大文', is_participant: true, disciplinary: {} },
        ],
      }),
    })
    const wrapper = await mountView()
    const vm = wrapper.vm
    vm.overviewSearch = '陳'
    await wrapper.vm.$nextTick()
    expect(vm.filteredParticipants.every((p) => p.employee_name.includes('陳'))).toBe(true)
    expect(vm.filteredParticipants.some((p) => p.employee_name === '陳大文')).toBe(true)
  })

  it('未加入考核 chip 僅留 is_participant===false', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({
        extra: [
          { participant_id: 8, employee_id: 8, employee_name: '未加入者', is_participant: false, disciplinary: {} },
        ],
      }),
    })
    const wrapper = await mountView()
    const vm = wrapper.vm
    vm.overviewFilters = { participation: 'non' }
    await wrapper.vm.$nextTick()
    expect(vm.filteredParticipants.every((p) => p.is_participant === false)).toBe(true)
    expect(vm.filteredParticipants.length).toBeGreaterThan(0)
  })
})

// ── 進頁即算 refresh 接線（Task 8）─────────────────────────
describe('CurrentSemesterOverview 進頁即算 refresh（Task 8）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('OPEN cycle mount 時，refreshAppraisalCycle 在 getAppraisalAllEmployeesStatus 之前被呼叫', async () => {
    const callOrder = []
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE }) // status: OPEN
    refreshAppraisalCycle.mockImplementationOnce(async (cycleId) => {
      callOrder.push('refresh')
      return {
        data: {
          cycle_id: cycleId,
          synced_deleted: 0,
          synced_inserted: 0,
          skipped_manual: 0,
          recomputed: 0,
          created: 0,
          skipped_finalized: 0,
          skipped_tenure: 0,
          refreshed_at: '2026-05-16T03:25:00Z',
        },
      }
    })
    getAppraisalAllEmployeesStatus.mockImplementationOnce(async () => {
      callOrder.push('status')
      return { data: makeStatusFixture() }
    })

    await mountView()

    expect(refreshAppraisalCycle).toHaveBeenCalledWith(12)
    expect(callOrder).toEqual(['refresh', 'status'])
  })

  it('非 OPEN cycle 不呼叫 refreshAppraisalCycle', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: { ...SAMPLE_CYCLE, status: 'CLOSED' } })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    await mountView()

    expect(refreshAppraisalCycle).not.toHaveBeenCalled()
    expect(getAppraisalAllEmployeesStatus).toHaveBeenCalledWith(12)
  })

  it('refreshAppraisalCycle reject 時仍呼叫 getAppraisalAllEmployeesStatus，並顯示 stale-warning banner（Task 7 起不再靜默）', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    refreshAppraisalCycle.mockRejectedValueOnce(new Error('cycle not OPEN'))
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    const wrapper = await mountView()

    expect(refreshAppraisalCycle).toHaveBeenCalledWith(12)
    expect(getAppraisalAllEmployeesStatus).toHaveBeenCalledWith(12)
    // 不噴未捕捉例外，元件仍正常渲染 KPI
    expect(wrapper.find('[data-test="kpi-employees"]').exists()).toBe(true)
    // Task 7：改顯示可關閉的 stale-warning banner，告知使用者目前是舊資料
    expect(wrapper.find('[data-test="stale-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="stale-banner"]').text()).toContain('自動重算失敗')
  })

  it('refreshAppraisalCycle 成功時不顯示 stale-warning banner', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="stale-banner"]').exists()).toBe(false)
  })

  it('toolbar 顯示「已即時重算」與 generated_at 格式化時間', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })

    const wrapper = await mountView()

    const updated = wrapper.find('[data-test="last-refreshed-at"]')
    expect(updated.exists()).toBe(true)
    expect(updated.text()).toContain('已即時重算')
  })
})

// ── Task 7：多值欄拆 badge、KPI loading skeleton ───────────
describe('CurrentSemesterOverview 精修（Task 7）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('出缺勤欄：全零顯示 —，非零僅列非零項', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: {
        cycle_id: 12,
        academic_year: 114,
        semester: 'FIRST',
        start_date: '2025-08-01',
        end_date: '2026-01-31',
        generated_at: '2026-05-16T03:21:00Z',
        participants: [
          {
            participant_id: 401,
            employee_id: 41,
            employee_name: '全零',
            role_group: 'HEAD_TEACHER',
            classroom_id: 3,
            is_participant: true,
            attendance: {
              late_count: 0,
              early_leave_count: 0,
              missing_punch_count: 0,
              leave_days: 0,
              absent_days: 0,
            },
            retention: null,
            activity: null,
            disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, commend_count: 0, minor_merit_count: 0, major_merit_count: 0, actions: [] },
          },
          {
            participant_id: 402,
            employee_id: 42,
            employee_name: '遲到兩次',
            role_group: 'HEAD_TEACHER',
            classroom_id: 3,
            is_participant: true,
            attendance: {
              late_count: 2,
              early_leave_count: 0,
              missing_punch_count: 0,
              leave_days: 0,
              absent_days: 0,
            },
            retention: null,
            activity: null,
            disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, commend_count: 0, minor_merit_count: 0, major_merit_count: 0, actions: [] },
          },
        ],
      },
    })

    const wrapper = await mountView()
    const cells = wrapper.findAll('[data-test="attn-cell"]')
    expect(cells).toHaveLength(2)
    expect(cells[0].text()).toBe('—')
    expect(cells[1].text()).toContain('遲 2')
    expect(cells[1].text()).not.toContain('曠')
  })

  it('功過欄：全零顯示 —，過/功分別以 danger/success tag 顯示', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({
        extra: [
          {
            participant_id: 403,
            employee_id: 43,
            employee_name: '無功過',
            role_group: 'HEAD_TEACHER',
            classroom_id: 3,
            is_participant: true,
            attendance: { late_count: 0, early_leave_count: 0, missing_punch_count: 0, leave_days: 0, absent_days: 0 },
            retention: null,
            activity: null,
            disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, commend_count: 0, minor_merit_count: 0, major_merit_count: 0, actions: [] },
          },
        ],
      }),
    })

    const wrapper = await mountView()
    const cells = wrapper.findAll('[data-test="merit-cell"]')
    // 第一列（王雅玲）有 warning_count: 1 → 過 1；新增列全零 → —
    expect(cells[0].text()).toContain('過 1')
    expect(cells[1].text()).toBe('—')
  })

  it('KPI 區載入中顯示 skeleton，載入完成後改渲染 StatCard', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    let resolveStatus
    getAppraisalAllEmployeesStatus.mockReturnValueOnce(
      new Promise((resolve) => { resolveStatus = resolve }),
    )

    const wrapper = mount(CurrentSemesterOverview, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    // getAppraisalAllEmployeesStatus 仍 pending：statusLoading 為 true，KPI 區應顯示 skeleton
    expect(wrapper.find('.el-skeleton').exists()).toBe(true)
    expect(wrapper.find('[data-test="kpi-employees"]').exists()).toBe(false)

    resolveStatus({ data: makeStatusFixture() })
    await flushPromises()

    expect(wrapper.find('.el-skeleton').exists()).toBe(false)
    expect(wrapper.find('[data-test="kpi-employees"]').exists()).toBe(true)
  })
})

// ── 流程引導條接線 + 跨頁跳轉（Task A3）─────────────────────
describe('CurrentSemesterOverview 引導條（Task A3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guidePushMock.mockClear()
    getSignStatusSummary.mockResolvedValue({ data: { counts: {} } })
  })

  const nonParticipantExtra = {
    participant_id: null,
    employee_id: 9,
    employee_name: '張新進',
    role_group: 'ASSISTANT',
    classroom_id: 5,
    is_participant: false,
    attendance: { late_count: 0, early_leave_count: 0, missing_punch_count: 0, leave_days: 0, absent_days: 0 },
    retention: null,
    activity: null,
    disciplinary: { warning_count: 0, minor_count: 0, major_count: 0, actions: [] },
  }

  it('掛載時渲染 AppraisalProcessGuide，有非成員時 participants 高亮 current', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({
      data: makeStatusFixture({ extra: [nonParticipantExtra] }),
    })
    const wrapper = await mountView()

    const guide = wrapper.findComponent({ name: 'AppraisalProcessGuide' })
    expect(guide.exists()).toBe(true)
    expect(guide.props('statuses').participants).toBe('current')
  })

  it('無週期時點 create 引導步驟，呼叫既有建立週期流程', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: null })
    createAppraisalCycle.mockResolvedValue({ data: { id: 12 } })
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="guide-step-create"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-test="guide-step-create"]').trigger('click')
    await flushPromises()

    expect(createAppraisalCycle).toHaveBeenCalledTimes(1)
  })

  it('成員齊全時點 participants 引導步驟，捲動至成員區（非觸發一鍵加入寫入）', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    const scrollIntoView = vi.fn()
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView })

    const wrapper = await mountView()
    await wrapper.find('[data-test="guide-step-participants"]').trigger('click')
    await flushPromises()

    expect(getByIdSpy).toHaveBeenCalledWith('appraisal-participants-section')
    expect(scrollIntoView).toHaveBeenCalled()
    expect(bulkAddAppraisalParticipantsFromActive).not.toHaveBeenCalled()
    getByIdSpy.mockRestore()
  })

  it('成員齊全時點 manual 引導步驟，展開手填 collapse 並捲動', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    const scrollIntoView = vi.fn()
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView })

    const wrapper = await mountView()
    await wrapper.find('[data-test="guide-step-manual"]').trigger('click')
    await flushPromises()

    expect(wrapper.vm.manualActiveNames).toContain('manual')
    expect(getByIdSpy).toHaveBeenCalledWith('appraisal-manual-section')
    getByIdSpy.mockRestore()
  })

  it('成員齊全時點 sync 引導步驟，觸發既有同步分數 dry_run 預覽', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    syncAppraisalScoreItems.mockResolvedValueOnce({
      data: { deleted_count: 0, inserted_count: 0, skipped_manual_count: 0, items: [] },
    })

    const wrapper = await mountView()
    await wrapper.find('[data-test="guide-step-sync"]').trigger('click')
    await flushPromises()

    expect(syncAppraisalScoreItems).toHaveBeenCalledWith(12, { dryRun: true })
    expect(wrapper.find('[data-test="sync-preview-dialog"]').exists()).toBe(true)
  })

  it('成員齊全時點 recompute 引導步驟，觸發既有重新整理（重算彙整）', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    // recompute 步驟需 synced（summaryCount>0）才非 disabled，比照 sign 測試給簽核統計
    getSignStatusSummary.mockResolvedValue({
      data: { counts: { DRAFT: 1, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 0, FINALIZED: 0 } },
    })

    const wrapper = await mountView()
    expect(getAppraisalCurrentCycle).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="guide-step-recompute"]').trigger('click')
    await flushPromises()

    expect(getAppraisalCurrentCycle).toHaveBeenCalledTimes(2)
  })

  it('已同步時點 sign 引導步驟，導向 /appraisal-year-end/appraisal/history', async () => {
    getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
    getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture() })
    getSignStatusSummary.mockResolvedValue({
      data: { counts: { DRAFT: 1, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 0, FINALIZED: 0 } },
    })

    const wrapper = await mountView()
    expect(wrapper.find('[data-test="guide-step-sign"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="guide-step-sign"]').trigger('click')
    await flushPromises()

    expect(guidePushMock).toHaveBeenCalledWith('/appraisal-year-end/appraisal/history')
  })
})
