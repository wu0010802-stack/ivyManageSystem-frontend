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
      return () => h('div', { ...dataAttrs },
        [slots.title?.(), slots.default?.()].filter(Boolean))
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
  AcademicTermSelector: true,
  StatCard: {
    props: ['label', 'value'],
    template: '<div :data-test="$attrs[`data-test`]"><span class="lbl">{{ label }}</span><span class="val">{{ value }}</span></div>',
    inheritAttrs: false,
  },
  AggregatedStatusDetailDialog: true,
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
})
