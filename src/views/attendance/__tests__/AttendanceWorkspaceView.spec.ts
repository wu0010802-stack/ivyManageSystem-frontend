import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AttendanceWorkspaceView from '../AttendanceWorkspaceView.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const getSummaryMock = vi.fn()
const getAnomalyListMock = vi.fn()

vi.mock('@/api/attendance', () => ({
  getSummary: (...args: unknown[]) => getSummaryMock(...args),
  getAnomalyList: (...args: unknown[]) => getAnomalyListMock(...args),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}))

const STUBS = {
  'el-select': { template: '<select @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  'el-option': { template: '<option><slot /></option>' },
  'el-statistic': { template: '<div class="el-statistic"><slot /><span class="el-statistic__title">{{ title }}</span><span class="el-statistic__number">{{ value }}</span></div>', props: ['title', 'value'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
  'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>', props: ['label'] },
  'el-card': { template: '<div class="el-card"><slot /><slot name="header" /></div>' },
  'el-icon': true,
}

const mountView = () =>
  mount(AttendanceWorkspaceView, {
    global: { stubs: STUBS },
    attachTo: document.body,
  })

describe('AttendanceWorkspaceView', () => {
  beforeEach(() => {
    getSummaryMock.mockReset()
    getAnomalyListMock.mockReset()

    getSummaryMock.mockResolvedValue({
      data: [
        { employee_id: 1, employee_name: '王小明', normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 10 },
        { employee_id: 2, employee_name: '李小花', normal_days: 22, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 0 },
      ],
    })
    getAnomalyListMock.mockResolvedValue({
      data: { items: [], pending: 3, total: 5, confirmed: 2 },
    })
  })

  it('掛載後觸發 refresh（呼叫 getSummary 和 getAnomalyList）', async () => {
    mountView()
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(1)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(1)
  })

  it('桌機模式：三欄容器 class 存在', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.workspace-cols').exists()).toBe(true)
    expect(wrapper.find('.col-roster').exists()).toBe(true)
    expect(wrapper.find('.col-anomaly').exists()).toBe(true)
    expect(wrapper.find('.col-detail').exists()).toBe(true)
  })

  it('header KPI 標題文字「待處理異常」出現', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('待處理異常')
  })

  it('header KPI 標題文字「全勤人數」出現', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('全勤人數')
  })

  it('header KPI 標題文字「遲到人次」出現', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('遲到人次')
  })

  it('header KPI 標題文字「缺卡人次」出現', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('缺卡人次')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// WorkspaceHeader 單元測試
// ──────────────────────────────────────────────────────────────────────────────
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'

const WH_STUBS = {
  'el-select': {
    template: '<select @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
    props: ['modelValue'],
  },
  'el-option': { template: '<option :value="value"><slot /></option>', props: ['value', 'label'] },
  'el-statistic': {
    template: '<div class="el-statistic"><span class="el-statistic__title">{{ title }}</span><span class="el-statistic__number">{{ value }}</span></div>',
    props: ['title', 'value'],
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

describe('WorkspaceHeader', () => {
  const defaultProps = {
    year: 2026,
    month: 6,
    kpis: { fullAttendance: 5, lateCount: 3, missingCount: 1, pendingAnomalies: 2 },
  }

  it('點「匯入」按鈕 emit import 事件', async () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    const importBtn = wrapper.findAll('button').find(b => b.text().includes('匯入'))
    expect(importBtn).toBeDefined()
    await importBtn!.trigger('click')
    expect(wrapper.emitted('import')).toBeTruthy()
  })

  it('點「匯出月報」按鈕 emit export 事件', async () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    const exportBtn = wrapper.findAll('button').find(b => b.text().includes('匯出'))
    expect(exportBtn).toBeDefined()
    await exportBtn!.trigger('click')
    expect(wrapper.emitted('export')).toBeTruthy()
  })

  it('渲染 pendingAnomalies KPI', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    expect(wrapper.text()).toContain('待處理異常')
  })
})
