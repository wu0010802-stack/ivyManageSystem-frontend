import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const getSummaryMock = vi.fn()
const getAnomalyListMock = vi.fn()
const getRecordsMock = vi.fn()

vi.mock('@/api/attendance', () => ({
  getSummary: (...args: unknown[]) => getSummaryMock(...args),
  getAnomalyList: (...args: unknown[]) => getAnomalyListMock(...args),
  getRecords: (...args: unknown[]) => getRecordsMock(...args),
  batchConfirmAnomalies: vi.fn().mockResolvedValue({ data: {} }),
  upsertRecord: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import AttendanceWorkspaceView from '../AttendanceWorkspaceView.vue'

// el-tabs stub：保留 v-model 契約（modelValue + update:modelValue），
// 這正是本次要驗的東西——原本的 el-tabs 沒有接 v-model，選取後不會換頁。
const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="el-tabs" :data-active="modelValue"><slot /></div>',
}
const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  template: '<div class="el-tab-pane" :data-name="name" :data-label="label"><slot /></div>',
}

const RosterColumnStub = {
  name: 'RosterColumn',
  props: ['roster', 'selectedEmployeeId', 'loading'],
  emits: ['select'],
  template: '<div class="roster-column-stub" />',
}
const AnomalyQueueColumnStub = {
  name: 'AnomalyQueueColumn',
  props: ['items', 'selectedIndex', 'loading'],
  emits: ['select', 'filterChange'],
  template: '<div class="anomaly-queue-column-stub" />',
}
const DetailColumnStub = {
  name: 'DetailColumn',
  props: ['mode', 'anomaly', 'anomalyIndex', 'anomalyTotal', 'context', 'employeeId', 'year', 'month'],
  emits: ['resolved', 'navigate', 'switchMode'],
  template: '<div class="detail-column-stub" />',
}

const STUBS = {
  RosterColumn: RosterColumnStub,
  AnomalyQueueColumn: AnomalyQueueColumnStub,
  DetailColumn: DetailColumnStub,
  ImportPreviewDialog: { name: 'ImportPreviewDialog', props: ['modelValue', 'year', 'month'], template: '<div />' },
  WorkspaceHeader: { name: 'WorkspaceHeader', props: ['year', 'month', 'kpis'], template: '<div />' },
  ElTabs: ElTabsStub,
  ElTabPane: ElTabPaneStub,
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElIcon: true,
}

const sampleRoster = [
  { employee_id: 1, employee_name: '王小明', employee_number: 'E001', normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 10 },
]
const sampleAnomalies = [
  { id: 10, employee_name: '王小明', employee_number: 'E001', date: '2026-06-05', weekday: '五', type: 'late', type_label: '遲到', detail: '遲到 10 分', estimated_deduction: 200, confirmed_action: null },
  { id: 11, employee_name: '李小花', employee_number: 'E002', date: '2026-06-10', weekday: '三', type: 'missing_punch', type_label: '未打卡', detail: '缺出勤打卡', estimated_deduction: 0, confirmed_action: null },
]

const mountView = () => mount(AttendanceWorkspaceView, { global: { stubs: STUBS } })

describe('AttendanceWorkspaceView 手機三段流程', () => {
  beforeEach(() => {
    mockIsMobile.value = true
    getSummaryMock.mockReset().mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock
      .mockReset()
      .mockResolvedValue({ data: { items: sampleAnomalies, pending: 2, total: 2, confirmed: 0 } })
    getRecordsMock.mockReset().mockResolvedValue({ data: [] })
  })

  it('手機預設停在名冊分頁', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('roster')
  })

  it('名冊選取員工後自動推進到明細分頁', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(RosterColumnStub).vm.$emit('select', 1)
    await flushPromises()

    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('detail')
    expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('month')
  })

  it('異常佇列選取後自動推進到明細分頁並帶 resolve 模式', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 1)
    await flushPromises()

    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('detail')
    expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('resolve')
  })

  it('明細分頁提供返回鍵，從異常進來就回異常、從名冊進來就回名冊', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 0)
    await flushPromises()
    await wrapper.get('[data-test="mobile-detail-back"]').trigger('click')
    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('anomaly')

    await wrapper.findComponent(RosterColumnStub).vm.$emit('select', 1)
    await flushPromises()
    await wrapper.get('[data-test="mobile-detail-back"]').trigger('click')
    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('roster')
  })

  it('異常分頁標籤顯示待處理筆數', async () => {
    const wrapper = mountView()
    await flushPromises()
    const pane = wrapper.findAll('.el-tab-pane').find((p) => p.attributes('data-name') === 'anomaly')
    expect(pane!.attributes('data-label')).toContain('2')
  })

  it('桌機：仍走三欄，不渲染分頁殼', async () => {
    mockIsMobile.value = false
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.workspace-cols').exists()).toBe(true)
    expect(wrapper.find('.el-tabs').exists()).toBe(false)
    expect(wrapper.find('[data-test="mobile-detail-back"]').exists()).toBe(false)
  })
})
